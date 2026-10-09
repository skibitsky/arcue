import { insideWithoutLinks } from "./links";
import { joinPath, pathInside } from "./paths";
import type { Platform } from "./platform";

/** Names of unsent screenshots in the review folder's `screenshots/` folder. Cleanup removes nothing else. */
export const UNSENT_SCREENSHOT_NAME = /^c\d+(?:-[1-9]\d*)?\.png$/;

/**
 * The absolute path of a comment's stored screenshot, or null when the stored value is not one of the layouts the
 * core writes for that comment: `screenshots/<id>.png`, `screenshots/<id>-<n>.png` or `rounds/round-<n>/<id>.png`.
 * `review.json` can be edited by hand or come from an untrusted repository, so nothing else is ever read.
 */
export function screenshotFile(reviewFolder: string, commentId: string, stored: string | null): string | null {
  if (stored === null || !/^c\d+$/.test(commentId)) return null;
  const allowed = new RegExp(`^(?:screenshots/${commentId}(?:-[1-9]\\d*)?|rounds/round-[1-9]\\d*/${commentId})\\.png$`);
  if (!allowed.test(stored)) return null;
  const resolved = joinPath(reviewFolder, stored);
  return pathInside(reviewFolder, resolved) === stored ? resolved : null;
}

/** A comment's screenshot bytes, or null when it has none, its path is not allowed, or a link is in the way. */
export async function readScreenshot(
  platform: Platform,
  reviewFolder: string,
  commentId: string,
  stored: string | null,
): Promise<Uint8Array | null> {
  const path = screenshotFile(reviewFolder, commentId, stored);
  if (path === null || !(await insideWithoutLinks(platform, reviewFolder, path))) return null;
  return (await platform.stat(path))?.kind === "file" ? platform.readFile(path) : null;
}
