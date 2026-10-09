import "@arcue/ui/fonts.css";
import "@arcue/ui/tokens.css";
import "@arcue/ui/base.css";
import "@arcue/ui/workspace.css";
import "./main.css";
import samples from "virtual:arcue-samples";
import type { CoreClient } from "@arcue/protocol";
import type { WorkspaceStore } from "@arcue/ui";
import { Workspace } from "@arcue/ui";
import { createViewport } from "@arcue/viewport";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { chooseFiles } from "./choose-files";
import { parseDeepLink } from "./deep-link";
import type { OpenAt } from "./web-host";
import { WebHost } from "./web-host";

declare global {
  interface Window {
    /** For tests and agents: the window's core client and workspace store, and a way to open a sample by id. */
    arcue: {
      client: CoreClient;
      store: WorkspaceStore;
      openSample(id: string, at?: OpenAt): Promise<string>;
    };
  }
}

const host = new WebHost(samples, import.meta.env.BASE_URL);
const { store } = host;
window.arcue = { client: host.client, store, openSample: (id, at) => host.openSample(id, at) };

function alert(error: unknown): void {
  store.notify({ message: error instanceof Error ? error.message : String(error), kind: "alert" });
}

function openFiles(files: readonly File[]): void {
  host.openFiles(files).catch(alert);
}

function pickFiles(): void {
  void chooseFiles({ accept: ".fbx,.arcue,image/*", multiple: true }).then((files) => {
    if (files.length > 0) openFiles(files);
  });
}

const root = document.getElementById("app");
if (!root) throw new Error("index.html has no #app element.");
createRoot(root).render(
  <StrictMode>
    <Workspace
      store={store}
      createViewport={createViewport}
      samples={host.samples}
      onOpenSample={(sample) => host.openSample(sample).catch(alert)}
      onOpenFile={pickFiles}
      onDropFiles={openFiles}
      dropHint="Comments stay in this tab until you reload the page."
    />
  </StrictMode>,
);

const link = parseDeepLink(location.search);
if (link) {
  const { sample, ...at } = link;
  host.openSample(sample, at).catch(alert);
}
