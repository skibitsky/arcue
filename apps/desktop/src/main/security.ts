import { join, normalize, sep } from "node:path";

/** The built renderer is served from `arcue://app/`, a secure standard scheme, so it has a real origin. */
export const RENDERER_SCHEME = "arcue";
export const RENDERER_ORIGIN = `${RENDERER_SCHEME}://app`;

/**
 * The page may load only its own scripts, styles, fonts and images. Inline styles are allowed for React's style
 * attributes; blob images are comment thumbnails. A Vite dev server also needs inline scripts for its preamble and a
 * WebSocket for hot reload.
 */
export function contentSecurityPolicy(devServer: string | null): string {
  const self = devServer ? `'self' ${devServer}` : "'self'";
  const socket = devServer ? ` ${devServer.replace(/^http/, "ws")}` : "";
  return [
    "default-src 'none'",
    `script-src ${self}${devServer ? " 'unsafe-inline'" : ""}`,
    `style-src ${self} 'unsafe-inline'`,
    `font-src ${self}`,
    `img-src ${self} blob: data:`,
    `connect-src ${self}${socket}`,
    `worker-src ${self} blob:`,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
}

/** True for the app's own pages: the built renderer, or the dev server while unpackaged. */
export function isAppUrl(url: string, devServer: string | null): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol === `${RENDERER_SCHEME}:` && parsed.host === "app") return true;
  if (devServer === null) return false;
  return parsed.origin === new URL(devServer).origin;
}

/** Requests a window may make: the app's own pages, and blob and data URLs the page created. */
export function isAllowedRequest(url: string, devServer: string | null): boolean {
  if (url.startsWith("blob:") || url.startsWith("data:") || url.startsWith("devtools:")) return true;
  if (devServer !== null && url.startsWith(devServer.replace(/^http/, "ws"))) return true;
  return isAppUrl(url, devServer);
}

/** The file under `root` that an `arcue://app/` URL names, or null when it has a ".." segment or would leave `root`. */
export function rendererFile(root: string, url: string): string | null {
  if (/(^|[/\\])(\.|%2e){2}([/\\?#]|%2f|%5c|$)/i.test(url)) return null;
  let pathname: string;
  try {
    pathname = decodeURIComponent(new URL(url).pathname);
  } catch {
    return null;
  }
  const relative = pathname === "/" || pathname === "" ? "index.html" : pathname.replace(/^\/+/, "");
  const file = normalize(join(root, relative));
  const base = normalize(root).endsWith(sep) ? normalize(root) : `${normalize(root)}${sep}`;
  return file.startsWith(base) ? file : null;
}
