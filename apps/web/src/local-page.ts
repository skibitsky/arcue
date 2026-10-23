import { VIEW_PARAMETER } from "@arcue/protocol";
import { coreSocketUrl } from "./core-socket";
import type { LocalHostOptions } from "./local-host";
import { MODULE_SCRIPT, PAGE_OWNER, probePage } from "./served-page";

/** What the page of Arcue in the browser runs in: its document and address as the server served them. */
export interface LocalPage {
  document: Pick<Document, "querySelector" | "hasFocus">;
  location: Pick<Location, "protocol" | "host" | "search" | "reload">;
  /** Where the page keeps its tabs across a reload; null where the browser refuses storage. */
  storage: Storage | null;
  fetch: (url: string, init: RequestInit) => Promise<Pick<Response, "ok" | "text">>;
}

/**
 * The options of the page's LocalHost. The view comes from the page's address, and the owner and build from the page
 * the server served, so the page tells another Arcue in the browser at its address from its own.
 */
export function localHostOptions({ document, location, storage, fetch }: LocalPage): LocalHostOptions {
  const pageScript = document.querySelector(MODULE_SCRIPT)?.getAttribute("src") ?? null;
  const pageOwner = document.querySelector(PAGE_OWNER)?.getAttribute("content") ?? null;
  return {
    openSocket: () => new WebSocket(coreSocketUrl(location)),
    view: new URLSearchParams(location.search).get(VIEW_PARAMETER),
    storage,
    owner: pageOwner,
    hasFocus: () => document.hasFocus(),
    probe: () => probePage(pageScript, fetch, pageOwner),
    reload: () => location.reload(),
  };
}
