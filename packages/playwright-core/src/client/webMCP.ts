/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { ElementHandle } from './elementHandle';
import { EventEmitter } from './eventEmitter';
import { Frame } from './frame';

import type * as api from '../../types/types';
import type * as channels from '@protocol/channels';
import type { Page } from './page';

export type WebMCPToolInfo = channels.PageWebMCPToolsAddedEvent['tools'][0];

export type WebMCPToolResult = {
  status: string;
  output?: any;
  errorText?: string;
};

export type WebMCPToolLocation = {
  url: string;
  lineNumber: number;
  columnNumber: number;
};

export class WebMCPTool implements api.WebMCPTool {
  private _webMCP: WebMCP;
  readonly name: string;
  readonly description: string;
  readonly inputSchema?: object;
  readonly annotations?: { readOnly?: boolean; autosubmit?: boolean };
  readonly frame: api.Frame;
  readonly location?: WebMCPToolLocation;

  constructor(webMCP: WebMCP, info: WebMCPToolInfo) {
    this._webMCP = webMCP;
    this.name = info.name;
    this.description = info.description;
    this.inputSchema = info.inputSchema;
    this.annotations = info.annotations;
    this.frame = Frame.from(info.frame!);
    this.location = info.location;
  }

  async execute(input?: any): Promise<WebMCPToolResult> {
    return await this._webMCP.executeTool(this.name, input);
  }

  get formElement(): Promise<api.ElementHandle | null> {
    return this._webMCP.toolFormElement(this.name);
  }
}

export class WebMCP extends EventEmitter implements api.WebMCP {
  private _channel: channels.PageChannel;
  private _tools: Map<string, WebMCPTool> = new Map();

  constructor(page: Page) {
    super(page._platform);
    this._channel = page._channel;
    this._channel.on('webMCPToolsAdded', ({ tools }) => {
      const webMCPTools: WebMCPTool[] = [];
      for (const info of tools) {
        const tool = new WebMCPTool(this, info);
        this._tools.set(tool.name, tool);
        webMCPTools.push(tool);
      }
      this.emit('toolsadded', { tools: webMCPTools });
    });
    this._channel.on('webMCPToolsRemoved', ({ tools }) => {
      const webMCPTools: WebMCPTool[] = [];
      for (const info of tools) {
        const existing = this._tools.get(info.name);
        if (existing) {
          webMCPTools.push(existing);
          this._tools.delete(info.name);
        }
      }
      this.emit('toolsremoved', { tools: webMCPTools });
    });
  }

  async enable(): Promise<void> {
    await this._channel.webMCPEnable();
  }

  tools(): api.WebMCPTool[] {
    return [...this._tools.values()];
  }

  async executeTool(name: string, input?: any): Promise<WebMCPToolResult> {
    return await this._channel.webMCPExecuteTool({ name, input });
  }

  async toolFormElement(name: string): Promise<api.ElementHandle | null> {
    const result = await this._channel.webMCPToolFormElement({ name });
    return result.element ? ElementHandle.from(result.element) as ElementHandle : null;
  }
}
