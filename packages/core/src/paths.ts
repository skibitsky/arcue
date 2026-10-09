import { ArcueError } from "@arcue/protocol";

const DRIVE = /^([A-Za-z]):\//;
const UNC = /^\/\/([^/]+)\/([^/]+)/;

interface SplitPath {
  /** "/", "C:/" or "//server/share/". */
  root: string;
  parts: string[];
}

function split(path: string): SplitPath {
  const slashed = path.replaceAll("\\", "/");
  let root: string;
  let rest: string;
  const unc = UNC.exec(slashed);
  const drive = DRIVE.exec(slashed);
  if (unc) {
    root = `//${unc[1]}/${unc[2]}/`;
    rest = slashed.slice(unc[0].length);
  } else if (slashed.startsWith("//")) {
    throw new ArcueError("invalid-input", `A network path needs a server and a share, got "${path}".`);
  } else if (drive) {
    root = `${drive[1]?.toUpperCase()}:/`;
    rest = slashed.slice(drive[0].length);
  } else if (slashed.startsWith("/")) {
    root = "/";
    rest = slashed;
  } else {
    throw new ArcueError("invalid-input", `Expected an absolute path, got "${path}".`);
  }
  const parts: string[] = [];
  for (const part of rest.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return { root, parts };
}

/**
 * Converts "\" to "/", resolves "." and "..", and removes repeated and trailing slashes. Paths must be absolute:
 * "/work", a drive such as "C:/work" (the letter becomes uppercase), or a network share such as "//server/share/work".
 */
export function normalizePath(path: string): string {
  const { root, parts } = split(path);
  return root + parts.join("/");
}

export function joinPath(base: string, ...segments: string[]): string {
  const { root, parts } = split(base);
  return normalizePath(root + [...parts, ...segments].join("/").replace(/^\/+/, ""));
}

/** The parent folder; a root is its own parent. */
export function dirname(path: string): string {
  const { root, parts } = split(path);
  return root + parts.slice(0, -1).join("/");
}

export function basename(path: string): string {
  return split(path).parts.at(-1) ?? "";
}

/** The path relative to `root`, "" for the root itself, or null when the path is outside it. */
export function pathInside(root: string, path: string): string | null {
  const base = normalizePath(root);
  const target = normalizePath(path);
  if (target === base) return "";
  const prefix = base.endsWith("/") ? base : `${base}/`;
  return target.startsWith(prefix) ? target.slice(prefix.length) : null;
}

/** The path from folder `from` to `to` with "/" separators, such as "../Textures/Rock.png". Both share a root. */
export function relativePath(from: string, to: string): string {
  const base = split(from);
  const target = split(to);
  if (base.root !== target.root) throw new ArcueError("invalid-input", `"${to}" is on another drive than "${from}".`);
  let common = 0;
  while (common < base.parts.length && base.parts[common] === target.parts[common]) common++;
  return [...base.parts.slice(common).map(() => ".."), ...target.parts.slice(common)].join("/");
}

/** Walks up from `path` to the nearest folder that contains ".git", a folder or a worktree's file. */
export async function findGitRoot(path: string, exists: (path: string) => Promise<boolean>): Promise<string | null> {
  let current = normalizePath(path);
  for (;;) {
    if (await exists(joinPath(current, ".git"))) return current;
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}
