import { dirname, normalizePath, pathInside } from "./paths";
import type { Platform } from "./platform";

/**
 * True when `path` is inside `root` and no folder or file between them is a symbolic link. The root itself may be a
 * link, such as a repository checked out through one; everything the core reads below it may not.
 */
export async function insideWithoutLinks(platform: Platform, root: string, path: string): Promise<boolean> {
  return createLinkCheck(platform, root)(path);
}

/**
 * `insideWithoutLinks` for many paths below one root, such as one search for files, checking each folder and file at
 * most once. It keeps what it found, so a link created after a check goes unnoticed; make a new one for each search.
 */
export function createLinkCheck(platform: Platform, root: string): (path: string) => Promise<boolean> {
  const base = normalizePath(root);
  const checked = new Map<string, Promise<boolean>>([[base, Promise.resolve(true)]]);
  const check = (path: string): Promise<boolean> => {
    let result = checked.get(path);
    if (!result) {
      result = check(dirname(path)).then(
        async (parentInside) => parentInside && (await platform.stat(path))?.kind !== "symlink",
      );
      checked.set(path, result);
    }
    return result;
  };
  return async (path) => {
    const target = normalizePath(path);
    return pathInside(base, target) !== null && check(target);
  };
}
