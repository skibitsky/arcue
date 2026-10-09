import { joinPath, pathInside } from "./paths";
import type { Platform } from "./platform";

/**
 * True when `path` is inside `root` and no folder or file between them is a symbolic link. The root itself may be a
 * link, such as a repository checked out through one; everything the core reads below it may not.
 */
export async function insideWithoutLinks(platform: Platform, root: string, path: string): Promise<boolean> {
  const relative = pathInside(root, path);
  if (relative === null) return false;
  let current = root;
  for (const part of relative.split("/").filter(Boolean)) {
    current = joinPath(current, part);
    if ((await platform.stat(current))?.kind === "symlink") return false;
  }
  return true;
}
