# class: WebMCPTool
* since: v1.60
* langs: js

Represents a registered WebMCP tool available on the page. WebMCP tools can be registered by web pages
either imperatively via JavaScript (`navigator.modelContext.registerTool()`) or declaratively via HTML forms
with `toolname` and `tooldescription` attributes.

## property: WebMCPTool.name
* since: v1.60
- type: <[string]>

Tool name.

## property: WebMCPTool.description
* since: v1.60
- type: <[string]>

Tool description.

## property: WebMCPTool.inputSchema
* since: v1.60
- type: ?<[Object]>

JSON Schema for the tool's input parameters.

## property: WebMCPTool.annotations
* since: v1.60
- type: ?<[Object]>
  - `readOnly` ?<[boolean]> Whether the tool only reads state without modifications.
  - `autosubmit` ?<[boolean]> Whether the declarative tool was declared with the autosubmit attribute.

## property: WebMCPTool.frame
* since: v1.60
- type: <[Frame]>

The frame that registered this tool.

## property: WebMCPTool.location
* since: v1.60
- type: ?<[Object]>
  - `url` <[string]> URL of the script that registered the tool.
  - `lineNumber` <[int]> Line number in the script.
  - `columnNumber` <[int]> Column number in the script.

Source location where the tool was registered, if available.

## property: WebMCPTool.formElement
* since: v1.60
- type: <[Promise]<[null]|[ElementHandle]>>

Returns the corresponding form element when the tool was registered via a declarative HTML form.
Returns `null` for imperatively registered tools.

## async method: WebMCPTool.execute
* since: v1.60
- returns: <[Object]>
  - `status` <[string]> Status of the invocation: `"Completed"`, `"Canceled"`, or `"Error"`.
  - `output` ?<[Serializable]> Output of the tool execution.
  - `errorText` ?<[string]> Error description.

Executes this tool with the given input parameters.

### param: WebMCPTool.execute.input
* since: v1.60
- `input` ?<[Serializable]>

Input parameters matching the tool's `inputSchema`.
