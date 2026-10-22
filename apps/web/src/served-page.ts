import { LOCAL_PAGE_MARKER, LOCAL_PAGE_OWNER } from "@arcue/protocol";

/**
 * What the server serves at "/" now: this page, another build of it with the module script it names, the page of
 * another Arcue in the browser that took the address ("elsewhere"), or nothing this page can reload into, such as no
 * answer or a page without the arcue-page marker.
 */
export type ServedPage = "same" | "down" | "elsewhere" | { changed: string };

/** Selects the meta tag that names the data folder and user of the Arcue in the browser that served a page. */
export const PAGE_OWNER = `meta[name="${LOCAL_PAGE_OWNER}"]`;

/** Selects the module script a build of the page loads, such as "/assets/index-a1b2c3.js". */
export const MODULE_SCRIPT = 'script[type="module"][src]';

/** How long a probe waits for "/" before it counts the server as down. */
export const PROBE_TIMEOUT_MS = 5000;

/**
 * Reads "/" again and tells what it serves to a page that loaded `pageScript` from the Arcue in the browser that
 * `pageOwner` names, giving up after `PROBE_TIMEOUT_MS`.
 */
export async function probePage(
  pageScript: string | null,
  fetchPage: (url: string, init: RequestInit) => Promise<Pick<Response, "ok" | "text">>,
  pageOwner: string | null = null,
): Promise<ServedPage> {
  let html: string;
  try {
    const response = await fetchPage("/", { cache: "no-store", signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
    if (!response.ok) return "down";
    html = await response.text();
  } catch {
    return "down";
  }
  return servedPage(html, pageScript, pageOwner);
}

/**
 * What the HTML served at "/" is to a page that loaded `pageScript` from the Arcue in the browser that `pageOwner`
 * names. Only a page that names another owner is "elsewhere": one that names none, as from a server that adds no
 * owner, is not.
 */
export function servedPage(html: string, pageScript: string | null, pageOwner: string | null = null): ServedPage {
  const served = new DOMParser().parseFromString(html, "text/html");
  const marker = served.querySelector(`meta[name="${LOCAL_PAGE_MARKER.name}"]`)?.getAttribute("content");
  if (marker !== LOCAL_PAGE_MARKER.content) return "down";
  const owner = served.querySelector(PAGE_OWNER)?.getAttribute("content") ?? null;
  if (owner !== null && pageOwner !== null && owner !== pageOwner) return "elsewhere";
  const script = served.querySelector(MODULE_SCRIPT)?.getAttribute("src") ?? null;
  return script === null || script === pageScript ? "same" : { changed: script };
}
