import { LOCAL_PAGE_MARKER } from "@arcue/protocol";

/**
 * What the server serves at "/" now: this page, another build of it with the module script it names, or nothing this
 * page can reload into, such as no answer or a page without the arcue-page marker.
 */
export type ServedPage = "same" | "down" | { changed: string };

/** Selects the module script a build of the page loads, such as "/assets/index-a1b2c3.js". */
export const MODULE_SCRIPT = 'script[type="module"][src]';

/** How long a probe waits for "/" before it counts the server as down. */
export const PROBE_TIMEOUT_MS = 5000;

/** Reads "/" again and tells what it serves to a page that loaded `pageScript`, giving up after `PROBE_TIMEOUT_MS`. */
export async function probePage(
  pageScript: string | null,
  fetchPage: (url: string, init: RequestInit) => Promise<Pick<Response, "ok" | "text">>,
): Promise<ServedPage> {
  let html: string;
  try {
    const response = await fetchPage("/", { cache: "no-store", signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
    if (!response.ok) return "down";
    html = await response.text();
  } catch {
    return "down";
  }
  return servedPage(html, pageScript);
}

/** What the HTML served at "/" is to a page that loaded `pageScript`. */
export function servedPage(html: string, pageScript: string | null): ServedPage {
  const served = new DOMParser().parseFromString(html, "text/html");
  const marker = served.querySelector(`meta[name="${LOCAL_PAGE_MARKER.name}"]`)?.getAttribute("content");
  if (marker !== LOCAL_PAGE_MARKER.content) return "down";
  const script = served.querySelector(MODULE_SCRIPT)?.getAttribute("src") ?? null;
  return script === null || script === pageScript ? "same" : { changed: script };
}
