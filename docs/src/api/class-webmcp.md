# class: WebMCP
* since: v1.60
* langs: js

:::note
WebMCP is an experimental API and is subject to change. It is currently only supported in Chromium 149+ and requires
the `--enable-features=WebMCPTesting,DevToolsWebMCPSupport` browser launch flags to be enabled.
:::

The WebMCP class provides access to the [WebMCP](https://webmachinelearning.github.io/webmcp/) API, allowing interaction
with tools registered by web pages through the Model Context Protocol.

An example of discovering and executing WebMCP tools:

```js
const browser = await chromium.launch({
  args: ['--enable-features=WebMCPTesting,DevToolsWebMCPSupport'],
});
const page = await browser.newPage();
await page.goto('https://example.com');

const webMCP = page.webMCP;
await webMCP.enable();

const tools = webMCP.tools();
for (const tool of tools)
  console.log(`Tool: ${tool.name} - ${tool.description}`);
```

## async method: WebMCP.enable
* since: v1.60

Enables the WebMCP domain for this page. This must be called before tools can be discovered.
Enabling the domain will trigger a [`event: WebMCP.toolsAdded`] event for all currently registered tools.

## method: WebMCP.tools
* since: v1.60
- returns: <[Array]<[WebMCPTool]>>

Returns all currently registered WebMCP tools on the page.

## async method: WebMCP.executeTool
* since: v1.60
- returns: <[Object]>
  - `status` <[string]> Status of the invocation: `"Completed"`, `"Canceled"`, or `"Error"`.
  - `output` ?<[Serializable]> Output of the tool execution. Only present when status is `"Completed"`.
  - `errorText` ?<[string]> Error description. Only present when status is `"Error"`.

Executes a registered WebMCP tool by name with the given input parameters.

### param: WebMCP.executeTool.name
* since: v1.60
- `name` <[string]>

Name of the tool to execute.

### param: WebMCP.executeTool.input
* since: v1.60
- `input` ?<[Serializable]>

Input parameters matching the tool's `inputSchema`.

## event: WebMCP.toolsAdded
* since: v1.60
- argument: <[Object]>
  - `tools` <[Array]<[WebMCPTool]>>

Emitted when new WebMCP tools are registered on the page.

## event: WebMCP.toolsRemoved
* since: v1.60
- argument: <[Object]>
  - `tools` <[Array]<[WebMCPTool]>>

Emitted when WebMCP tools are removed from the page. This is also fired when a frame navigates,
removing all tools that were registered by that frame.
