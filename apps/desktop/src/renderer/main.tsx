import "@arcue/ui/fonts.css";
import "@arcue/ui/tokens.css";
import "@arcue/ui/base.css";
import "@arcue/ui/workspace.css";
import "./desktop.css";
import type { CoreChannel, CoreClient } from "@arcue/protocol";
import { portEndpoint } from "@arcue/protocol";
import type { WorkspaceStore } from "@arcue/ui";
import { inTextField, Workspace } from "@arcue/ui";
import { createViewport } from "@arcue/viewport";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import type { DesktopBridge } from "../shared/ipc";
import { CORE_PORT_MESSAGE } from "../shared/ipc";
import { WindowHost } from "./window-host";

declare global {
  interface Window {
    arcueDesktop: DesktopBridge;
    /** For tests and agents: this window's core client and workspace store. */
    arcueWindow: { client: CoreClient; store: WorkspaceStore };
  }
}

function onPort(listener: (channel: CoreChannel) => void): () => void {
  const onMessage = (event: MessageEvent) => {
    const [port] = event.ports;
    if (event.source !== window || event.data !== CORE_PORT_MESSAGE || !port) return;
    listener({ ...portEndpoint(port), close: () => port.close() });
  };
  window.addEventListener("message", onMessage);
  return () => window.removeEventListener("message", onMessage);
}

const bridge = window.arcueDesktop;
const host = new WindowHost({
  bridge,
  onPort,
  closeWindow: () => window.close(),
  hasFocus: () => document.hasFocus(),
  inTextField: () => inTextField(document.activeElement),
});
window.arcueWindow = { client: host.client, store: host.store };

const root = document.getElementById("app");
if (!root) throw new Error("index.html has no #app element.");
createRoot(root).render(
  <StrictMode>
    <Workspace
      store={host.store}
      createViewport={createViewport}
      windowControls={navigator.userAgent.includes("Macintosh") ? <div className="mac-lights" /> : undefined}
      onOpenFile={() => void host.openDialog()}
      onDropFiles={(files) => host.openFiles(files)}
      onTabDragEnd={(assetId, event) => bridge.tabDragEnd(assetId, event.dataTransfer.dropEffect !== "none")}
      onTabDrop={(assetId, index) => void host.moveHere(assetId, index)}
      historyKeys={false}
    />
  </StrictMode>,
);

void host.start();
