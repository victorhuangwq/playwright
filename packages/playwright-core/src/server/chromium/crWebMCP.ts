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

import { eventsHelper } from '@utils/eventsHelper';

import type { CRSession } from './crConnection';
import type { Protocol } from './protocol';
import type { RegisteredListener } from '@utils/eventsHelper';
import type * as channels from '@protocol/channels';
import type { Progress } from '@protocol/progress';
import type { Frame } from '../frames';
import type * as dom from '../dom';

export type WebMCPToolLocation = {
  url: string;
  lineNumber: number;
  columnNumber: number;
};

export type WebMCPToolInfo = {
  name: string;
  description: string;
  inputSchema?: any;
  annotations?: {
    readOnly?: boolean;
    autosubmit?: boolean;
  };
  frameId: string;
  backendNodeId?: number;
  location?: WebMCPToolLocation;
};

export type WebMCPEventListener = {
  onToolsAdded: (tools: WebMCPToolInfo[]) => void;
  onToolsRemoved: (tools: WebMCPToolInfo[]) => void;
};

export class CRWebMCP {
  private _client: CRSession;
  private _pageGetter: () => { frameManager: { frame(frameId: string): Frame | null } };
  private _adoptBackendNodeId: ((backendNodeId: number, to: dom.FrameExecutionContext) => Promise<dom.ElementHandle>) | undefined;
  // Frame-scoped tool storage: frameId -> (toolName -> toolInfo)
  private _tools: Map<string, Map<string, WebMCPToolInfo>> = new Map();
  private _enabled = false;
  private _listeners: RegisteredListener[] = [];
  private _eventListener: WebMCPEventListener | undefined;

  constructor(
    client: CRSession,
    pageGetter: () => { frameManager: { frame(frameId: string): Frame | null } },
    adoptBackendNodeId?: (backendNodeId: number, to: dom.FrameExecutionContext) => Promise<dom.ElementHandle>,
  ) {
    this._client = client;
    this._pageGetter = pageGetter;
    this._adoptBackendNodeId = adoptBackendNodeId;
  }

  setEventListener(listener: WebMCPEventListener | undefined) {
    this._eventListener = listener;
  }

  async enable(progress: Progress): Promise<void> {
    if (this._enabled)
      return;
    this._listeners = [
      eventsHelper.addEventListener(this._client, 'WebMCP.toolsAdded', (event: Protocol.WebMCP.toolsAddedPayload) => {
        this._onToolsAdded(event);
      }),
      eventsHelper.addEventListener(this._client, 'WebMCP.toolsRemoved', (event: Protocol.WebMCP.toolsRemovedPayload) => {
        this._onToolsRemoved(event);
      }),
    ];
    await progress.race(this._client.send('WebMCP.enable'));
    this._enabled = true;
  }

  async disable(): Promise<void> {
    if (!this._enabled)
      return;
    eventsHelper.removeEventListeners(this._listeners);
    this._tools.clear();
    this._enabled = false;
  }

  toolInfos(): WebMCPToolInfo[] {
    return Array.from(this._tools.values()).flatMap(frameTools => Array.from(frameTools.values()));
  }

  toolInfo(name: string): WebMCPToolInfo | undefined {
    for (const frameTools of this._tools.values()) {
      const tool = frameTools.get(name);
      if (tool)
        return tool;
    }
    return undefined;
  }

  frameForTool(name: string): Frame | null {
    const tool = this.toolInfo(name);
    if (!tool)
      return null;
    return this._pageGetter().frameManager.frame(tool.frameId);
  }

  onFrameNavigated(frameId: string) {
    const frameTools = this._tools.get(frameId);
    if (!frameTools)
      return;
    const removedTools = Array.from(frameTools.values());
    this._tools.delete(frameId);
    if (removedTools.length)
      this._eventListener?.onToolsRemoved(removedTools);
  }

  async executeTool(progress: Progress, name: string, input?: any): Promise<channels.PageWebMCPExecuteToolResult> {
    const tool = this.toolInfo(name);
    if (!tool)
      throw new Error(`WebMCP tool "${name}" not found`);
    const { invocationId } = await progress.race(this._client.send('WebMCP.invokeTool' as any, {
      frameId: tool.frameId,
      toolName: name,
      input: input ?? {},
    }));
    return await new Promise<channels.PageWebMCPExecuteToolResult>(resolve => {
      const listener = eventsHelper.addEventListener(this._client as any, 'WebMCP.toolResponded', (event: any) => {
        if (event.invocationId === invocationId) {
          eventsHelper.removeEventListeners([listener]);
          resolve({
            status: event.status ?? 'Completed',
            output: event.output,
            errorText: event.errorText,
          });
        }
      });
    });
  }

  async resolveFormElement(name: string): Promise<dom.ElementHandle | null> {
    const tool = this.toolInfo(name);
    if (!tool?.backendNodeId || !this._adoptBackendNodeId)
      return null;
    const frame = this._pageGetter().frameManager.frame(tool.frameId);
    if (!frame)
      return null;
    try {
      const utilityContext = await frame.utilityContext();
      return await this._adoptBackendNodeId(tool.backendNodeId, utilityContext);
    } catch {
      return null;
    }
  }

  private _onToolsAdded(event: Protocol.WebMCP.toolsAddedPayload) {
    const toolInfos: WebMCPToolInfo[] = [];
    for (const tool of event.tools) {
      const location = tool.stackTrace?.callFrames.length ? {
        url: tool.stackTrace.callFrames[0].url,
        lineNumber: tool.stackTrace.callFrames[0].lineNumber,
        columnNumber: tool.stackTrace.callFrames[0].columnNumber,
      } : undefined;
      const info: WebMCPToolInfo = {
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: tool.annotations ? {
          readOnly: tool.annotations.readOnly,
          autosubmit: tool.annotations.autosubmit,
        } : undefined,
        frameId: tool.frameId,
        backendNodeId: tool.backendNodeId,
        location,
      };
      let frameTools = this._tools.get(tool.frameId);
      if (!frameTools) {
        frameTools = new Map();
        this._tools.set(tool.frameId, frameTools);
      }
      frameTools.set(tool.name, info);
      toolInfos.push(info);
    }
    this._eventListener?.onToolsAdded(toolInfos);
  }

  private _onToolsRemoved(event: Protocol.WebMCP.toolsRemovedPayload) {
    const toolInfos: WebMCPToolInfo[] = [];
    for (const tool of event.tools) {
      const frameTools = this._tools.get(tool.frameId);
      const existing = frameTools?.get(tool.name);
      if (existing) {
        toolInfos.push(existing);
        frameTools!.delete(tool.name);
        if (frameTools!.size === 0)
          this._tools.delete(tool.frameId);
      }
    }
    this._eventListener?.onToolsRemoved(toolInfos);
  }
}
