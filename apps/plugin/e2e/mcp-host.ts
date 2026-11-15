import type { McpUiHostCapabilities, McpUiHostContext } from "@modelcontextprotocol/ext-apps";
import { AppBridge, PostMessageTransport } from "@modelcontextprotocol/ext-apps/app-bridge";

/** What the test reads of the calls and messages a view sends its host. */
export interface HostEvent {
  view: string;
  kind: "message" | "context";
  params: unknown;
}

type DisplayMode = "inline" | "fullscreen";

declare global {
  interface Window {
    /** Calls the MCP server's tool, which the test page exposes from Node. */
    hostCallTool(name: string, args: Record<string, unknown>): Promise<unknown>;
    hostEvent(event: HostEvent): Promise<void>;
    startView(options: {
      id: string;
      html: string;
      capabilities: McpUiHostCapabilities;
      context: McpUiHostContext;
      input: Record<string, unknown>;
      result: unknown;
    }): Promise<void>;
  }
}

/**
 * A host of MCP Apps for the tests: it renders a view in a frame, answers its calls through the MCP server, and keeps
 * its frame at the height the view asks for, or over the page in fullscreen.
 */
window.startView = async ({ id, html, capabilities, context, input, result }) => {
  const frame = document.createElement("iframe");
  frame.id = id;
  frame.title = id;
  frame.style.height = "80px";
  frame.dataset.mode = context.displayMode ?? "inline";
  frame.sandbox.add("allow-scripts");
  document.body.append(frame);
  const target = frame.contentWindow;
  if (!target) throw new Error("The frame has no window.");
  const bridge = new AppBridge(null, { name: "Test host", version: "1.0.0" }, capabilities, { hostContext: context });
  let current = context;
  const setMode = (mode: DisplayMode) => {
    current = { ...current, displayMode: mode };
    frame.dataset.mode = mode;
    bridge.setHostContext(current);
  };
  bridge.oncalltool = async (params) =>
    (await window.hostCallTool(params.name, params.arguments ?? {})) as Awaited<
      ReturnType<NonNullable<AppBridge["oncalltool"]>>
    >;
  bridge.onmessage = async (params) => {
    await window.hostEvent({ view: id, kind: "message", params });
    return {};
  };
  bridge.onupdatemodelcontext = async (params) => {
    await window.hostEvent({ view: id, kind: "context", params });
    return {};
  };
  bridge.onrequestdisplaymode = async ({ mode }) => {
    setMode(mode === "fullscreen" ? "fullscreen" : "inline");
    return { mode: current.displayMode ?? "inline" };
  };
  bridge.onsizechange = ({ height }) => {
    if (height !== undefined && frame.dataset.mode !== "fullscreen") frame.style.height = `${height}px`;
  };
  const initialized = new Promise<void>((resolve) => {
    bridge.oninitialized = () => resolve();
  });
  await bridge.connect(new PostMessageTransport(target, target));
  frame.srcdoc = html;
  await initialized;
  await bridge.sendToolInput({ arguments: input });
  await bridge.sendToolResult(result as Parameters<AppBridge["sendToolResult"]>[0]);
};
