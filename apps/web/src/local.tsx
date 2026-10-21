import "@arcue/ui/fonts.css";
import "@arcue/ui/tokens.css";
import "@arcue/ui/base.css";
import "@arcue/ui/workspace.css";
import "./main.css";
import type { CoreClient } from "@arcue/protocol";
import { LOCAL_PAGE_MARKER, VIEW_PARAMETER } from "@arcue/protocol";
import type { WorkspaceStore } from "@arcue/ui";
import { Workspace } from "@arcue/ui";
import { createViewport } from "@arcue/viewport";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { coreSocketUrl } from "./core-socket";
import type { ServedPage } from "./local-host";
import { followPage, LocalHost } from "./local-host";

declare global {
  interface Window {
    /** For tests and agents: this window's core client and workspace store. */
    arcueWindow: { client: CoreClient; store: WorkspaceStore };
  }
}

const MODULE_SCRIPT = 'script[type="module"][src]';
const pageScript = document.querySelector(MODULE_SCRIPT)?.getAttribute("src") ?? null;

async function probe(): Promise<ServedPage> {
  let html: string;
  try {
    const response = await fetch("/", { cache: "no-store" });
    if (!response.ok) return "down";
    html = await response.text();
  } catch {
    return "down";
  }
  const served = new DOMParser().parseFromString(html, "text/html");
  const marker = served.querySelector(`meta[name="${LOCAL_PAGE_MARKER.name}"]`)?.getAttribute("content");
  if (marker !== LOCAL_PAGE_MARKER.content) return "down";
  const script = served.querySelector(MODULE_SCRIPT)?.getAttribute("src") ?? null;
  return script === null || script === pageScript ? "same" : { changed: script };
}

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
  hasFocus: () => document.hasFocus(),
  probe,
  reload: () => location.reload(),
});
window.arcueWindow = { client: host.client, store: host.store };
host.start();
followPage(host, { window, document });

const root = document.getElementById("app");
if (!root) throw new Error("index.html has no #app element.");
createRoot(root).render(
  <StrictMode>
    <Workspace
      store={host.store}
      createViewport={createViewport}
      emptyTitle="Ask your agent to show you a model"
      dropHint="Dropping files doesn't work here."
      dropRefusal="The browser doesn't tell Arcue where a dropped file is. Ask your agent to open it."
      reconnectingTip="Arcue in the browser isn't answering. This page reconnects by itself; your comments are saved."
    />
  </StrictMode>,
);
