import "@arcue/ui/fonts.css";
import "@arcue/ui/tokens.css";
import "@arcue/ui/base.css";
import "@arcue/ui/workspace.css";
import "./main.css";
import type { CoreClient } from "@arcue/protocol";
import { VIEW_PARAMETER } from "@arcue/protocol";
import type { WorkspaceStore } from "@arcue/ui";
import { useSelect, Workspace } from "@arcue/ui";
import { createViewport } from "@arcue/viewport";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { coreSocketUrl } from "./core-socket";
import { followPage, LocalHost } from "./local-host";
import { MODULE_SCRIPT, PAGE_OWNER, probePage } from "./served-page";

declare global {
  interface Window {
    /** For tests and agents: this window's core client and workspace store. */
    arcueWindow: { client: CoreClient; store: WorkspaceStore };
  }
}

const pageScript = document.querySelector(MODULE_SCRIPT)?.getAttribute("src") ?? null;
const pageOwner = document.querySelector(PAGE_OWNER)?.getAttribute("content") ?? null;

function safeSessionStorage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

const host = new LocalHost({
  openSocket: () => new WebSocket(coreSocketUrl(location)),
  view: new URLSearchParams(location.search).get(VIEW_PARAMETER),
  storage: safeSessionStorage(),
  owner: pageOwner,
  hasFocus: () => document.hasFocus(),
  probe: () => probePage(pageScript, (url, init) => fetch(url, init), pageOwner),
  reload: () => location.reload(),
});
window.arcueWindow = { client: host.client, store: host.store };
host.start();
followPage(host, { window, document });

const RECONNECTING_TIP =
  "Arcue in the browser isn't answering. This page reconnects by itself; your comments are saved.";
const ELSEWHERE_TIP = "Another Arcue in the browser has this address now.";

function LocalPage() {
  const elsewhere = useSelect(host.status, (status) => status.elsewhere);
  return (
    <Workspace
      store={host.store}
      createViewport={createViewport}
      emptyTitle="Ask your agent to show you a model"
      dropHint="Dropping files doesn't work here."
      dropRefusal="The browser doesn't tell Arcue where a dropped file is. Ask your agent to open it."
      reconnectingTip={elsewhere ? ELSEWHERE_TIP : RECONNECTING_TIP}
    />
  );
}

const root = document.getElementById("app");
if (!root) throw new Error("index.html has no #app element.");
createRoot(root).render(
  <StrictMode>
    <LocalPage />
  </StrictMode>,
);
