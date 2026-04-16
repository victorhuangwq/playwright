/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { contextTest as it, expect } from '../../config/browserTest';

it.use({
  launchOptions: async ({ launchOptions }, use) => {
    await use({ ...launchOptions, args: ['--enable-features=WebMCPTesting,DevToolsWebMCPSupport'] });
  }
});

it('should expose webMCP on page', async ({ page }) => {
  expect(page.webMCP).toBeTruthy();
});

it('should enable webMCP domain', async ({ page }) => {
  await page.webMCP.enable();
});

it('should return empty tools initially', async ({ page }) => {
  await page.webMCP.enable();
  const tools = page.webMCP.tools();
  expect(tools).toEqual([]);
});

it('should discover imperatively registered tools', async ({ page, server }) => {
  await page.webMCP.enable();
  await page.goto(server.EMPTY_PAGE);

  const toolsAddedPromise = new Promise<any>(resolve => {
    page.webMCP.on('toolsadded', resolve);
  });

  await page.evaluate(() => {
    (navigator as any).modelContext.registerTool({
      name: 'calculate_sum',
      description: 'Calculates the sum of two numbers',
      inputSchema: {
        type: 'object',
        properties: {
          a: { type: 'number' },
          b: { type: 'number' },
        },
        required: ['a', 'b'],
      },
      execute: ({ a, b }: { a: number; b: number }) => a + b,
    });
  });

  const event = await toolsAddedPromise;
  expect(event.tools.length).toBe(1);
  expect(event.tools[0].name).toBe('calculate_sum');
  expect(event.tools[0].description).toBe('Calculates the sum of two numbers');

  const tools = page.webMCP.tools();
  expect(tools.length).toBe(1);
  expect(tools[0].name).toBe('calculate_sum');
});

it('should include frame reference on tools', async ({ page, server }) => {
  await page.webMCP.enable();
  await page.goto(server.EMPTY_PAGE);

  const toolsAddedPromise = new Promise<any>(resolve => {
    page.webMCP.on('toolsadded', resolve);
  });

  await page.evaluate(() => {
    (navigator as any).modelContext.registerTool({
      name: 'framed_tool',
      description: 'A tool with a frame',
      execute: () => 'ok',
    });
  });

  const event = await toolsAddedPromise;
  expect(event.tools[0].frame).toBeTruthy();
  expect(event.tools[0].frame).toBe(page.mainFrame());
});

it('should discover declarative tools from forms', async ({ page }) => {
  await page.webMCP.enable();
  const toolsAddedPromise = new Promise<any>(resolve => {
    page.webMCP.on('toolsadded', resolve);
  });

  await page.setContent(`
    <form toolname="search" tooldescription="Search for items">
      <input name="query" type="text" />
      <button type="submit">Search</button>
    </form>
  `);

  const event = await toolsAddedPromise;
  expect(event.tools.length).toBe(1);
  expect(event.tools[0].name).toBe('search');
  expect(event.tools[0].description).toBe('Search for items');
});

it('should resolve formElement for declarative tools', async ({ page }) => {
  await page.webMCP.enable();
  const toolsAddedPromise = new Promise<any>(resolve => {
    page.webMCP.on('toolsadded', resolve);
  });

  await page.setContent(`
    <form toolname="search_form" tooldescription="Search form tool">
      <input name="q" type="text" />
      <button type="submit">Go</button>
    </form>
  `);

  await toolsAddedPromise;
  const tools = page.webMCP.tools();
  const searchTool = tools.find(t => t.name === 'search_form');
  expect(searchTool).toBeTruthy();
  const formHandle = await searchTool!.formElement;
  expect(formHandle).toBeTruthy();
  const tagName = await formHandle!.evaluate((el: HTMLFormElement) => el.tagName.toLowerCase());
  expect(tagName).toBe('form');
});

it('should return null formElement for imperative tools', async ({ page, server }) => {
  await page.webMCP.enable();
  await page.goto(server.EMPTY_PAGE);

  const toolsAddedPromise = new Promise<any>(resolve => {
    page.webMCP.on('toolsadded', resolve);
  });

  await page.evaluate(() => {
    (navigator as any).modelContext.registerTool({
      name: 'imperative_tool',
      description: 'An imperative tool',
      execute: () => 'result',
    });
  });

  await toolsAddedPromise;
  const tool = page.webMCP.tools()[0];
  const formHandle = await tool.formElement;
  expect(formHandle).toBeNull();
});

it('should fire toolsremoved event when AbortSignal is aborted', async ({ page, server }) => {
  await page.webMCP.enable();
  await page.goto(server.EMPTY_PAGE);

  const toolsAddedPromise = new Promise<any>(resolve => {
    page.webMCP.on('toolsadded', resolve);
  });

  await page.evaluate(() => {
    const controller = new AbortController();
    (window as any).__toolController = controller;
    (navigator as any).modelContext.registerTool({
      name: 'temp_tool',
      description: 'A temporary tool',
      execute: () => 'result',
    }, { signal: controller.signal });
  });
  await toolsAddedPromise;
  expect(page.webMCP.tools().length).toBe(1);

  const toolsRemovedPromise = new Promise<any>(resolve => {
    page.webMCP.on('toolsremoved', resolve);
  });

  await page.evaluate(() => {
    (window as any).__toolController.abort();
  });

  const removedEvent = await toolsRemovedPromise;
  expect(removedEvent.tools.length).toBe(1);
  expect(removedEvent.tools[0].name).toBe('temp_tool');
  expect(page.webMCP.tools().length).toBe(0);
});

it('should fire toolsremoved when declarative form is removed from DOM', async ({ page }) => {
  await page.webMCP.enable();
  const toolsAddedPromise = new Promise<any>(resolve => {
    page.webMCP.on('toolsadded', resolve);
  });

  await page.setContent(`
    <form toolname="dom_tool" tooldescription="A declarative tool">
      <input name="q" type="text" />
    </form>
  `);

  await toolsAddedPromise;
  expect(page.webMCP.tools().length).toBe(1);

  const toolsRemovedPromise = new Promise<any>(resolve => {
    page.webMCP.on('toolsremoved', resolve);
  });

  await page.evaluate(() => {
    document.querySelector('form')!.remove();
  });

  const removedEvent = await toolsRemovedPromise;
  expect(removedEvent.tools.length).toBe(1);
  expect(removedEvent.tools[0].name).toBe('dom_tool');
  expect(page.webMCP.tools().length).toBe(0);
});

it('should remove tools on frame navigation', async ({ page, server }) => {
  await page.webMCP.enable();
  await page.goto(server.EMPTY_PAGE);

  const toolsAddedPromise = new Promise<any>(resolve => {
    page.webMCP.on('toolsadded', resolve);
  });

  await page.evaluate(() => {
    (navigator as any).modelContext.registerTool({
      name: 'nav_tool',
      description: 'Tool cleared on navigation',
      execute: () => 'result',
    });
  });

  await toolsAddedPromise;
  expect(page.webMCP.tools().length).toBe(1);

  const toolsRemovedPromise = new Promise<any>(resolve => {
    page.webMCP.on('toolsremoved', resolve);
  });

  await page.goto(server.EMPTY_PAGE);

  const removedEvent = await toolsRemovedPromise;
  expect(removedEvent.tools.length).toBe(1);
  expect(removedEvent.tools[0].name).toBe('nav_tool');
  expect(page.webMCP.tools().length).toBe(0);
});

it('should execute imperatively registered tool', async ({ page, server }) => {
  await page.webMCP.enable();
  await page.goto(server.EMPTY_PAGE);

  const toolsAddedPromise = new Promise<any>(resolve => {
    page.webMCP.on('toolsadded', resolve);
  });

  await page.evaluate(() => {
    (navigator as any).modelContext.registerTool({
      name: 'add',
      description: 'Adds two numbers',
      inputSchema: {
        type: 'object',
        properties: {
          a: { type: 'number' },
          b: { type: 'number' },
        },
      },
      execute: ({ a, b }: { a: number; b: number }) => a + b,
    });
  });

  await toolsAddedPromise;
  const result = await page.webMCP.executeTool('add', { a: 5, b: 3 });
  expect(result.status).toBe('Completed');
  expect(result.output).toBe(8);
});

it('should execute tool via WebMCPTool.execute()', async ({ page, server }) => {
  await page.webMCP.enable();
  await page.goto(server.EMPTY_PAGE);

  const toolsAddedPromise = new Promise<any>(resolve => {
    page.webMCP.on('toolsadded', resolve);
  });

  await page.evaluate(() => {
    (navigator as any).modelContext.registerTool({
      name: 'multiply',
      description: 'Multiplies two numbers',
      inputSchema: {
        type: 'object',
        properties: {
          a: { type: 'number' },
          b: { type: 'number' },
        },
      },
      execute: ({ a, b }: { a: number; b: number }) => a * b,
    });
  });

  await toolsAddedPromise;
  const tool = page.webMCP.tools().find(t => t.name === 'multiply')!;
  const result = await tool.execute({ a: 4, b: 7 });
  expect(result.status).toBe('Completed');
  expect(result.output).toBe(28);
});

it('should throw for non-existent tool', async ({ page, server }) => {
  await page.webMCP.enable();
  await page.goto(server.EMPTY_PAGE);
  await expect(page.webMCP.executeTool('nonexistent')).rejects.toThrow(/not found/);
});
