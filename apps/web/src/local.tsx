import "@arcue/ui/fonts.css";
import "@arcue/ui/tokens.css";
import "@arcue/ui/base.css";
import "@arcue/ui/workspace.css";
import "./main.css";
import type { CoreClient } from "@arcue/protocol";
import type { WorkspaceStore } from "@arcue/ui";
import { Workspace } from "@arcue/ui";
import { createViewport } from "@arcue/viewport";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { coreSocketUrl } from "./core-socket";
import { LocalHost } from "./local-host";

declare global {
  interface Window {
    /** For tests and agents: this window's core client and workspace store. */
    arcueWindow: { client: CoreClient; store: WorkspaceStore };
  }
}

const host = new LocalHost(new WebSocket(coreSocketUrl(location)));
const { store } = host;
window.arcueWindow = { client: host.client, store };

const root = document.getElementById("app");
if (!root) throw new Error("index.html has no #app element.");
createRoot(root).render(
  <StrictMode>
    <Workspace
      store={store}
      createViewport={createViewport}
      emptyTitle="Ask your agent to show you a model"
      dropHint="Or run arcue open <file> in a terminal. Dropping files doesn't work here."
      dropRefusal="The browser doesn't tell Arcue where a dropped file is. Run arcue open <file>."
    />
  </StrictMode>,
);

host.adoptOpenAssets().catch((error: unknown) => {
  store.notify({ message: error instanceof Error ? error.message : String(error), kind: "alert" });
});
