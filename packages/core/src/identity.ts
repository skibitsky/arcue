import type { RelinkMatch } from "@arcue/protocol";
import { contentHash } from "./hash";
import type { Platform } from "./platform";

/** The largest `.meta` file the core reads a GUID from. Unity writes a few kilobytes even for models with many clips. */
const MAX_META_BYTES = 1 << 20;

const GUID_LINE = /^guid:[ \t]*([0-9a-fA-F]{32})[ \t]*\r?$/m;

/** The GUID on the "guid:" line of a Unity `.meta` file, in lowercase, or null when it has none. */
export function parseUnityGuid(text: string): string | null {
  return GUID_LINE.exec(text)?.[1]?.toLowerCase() ?? null;
}

/**
 * The GUID in the Unity `.meta` file beside a file, or null when there is none. A link, a folder or an oversized file
 * at that path counts as none.
 */
export async function readUnityGuid(platform: Platform, path: string): Promise<string | null> {
  const meta = `${path}.meta`;
  try {
    const stat = await platform.stat(meta);
    if (stat?.kind !== "file" || stat.size > MAX_META_BYTES) return null;
    return parseUnityGuid(await platform.readText(meta));
  } catch {
    return null;
  }
}

/** What identifies a file: its size, and its full hash and Unity GUID, each read once and only when asked for. */
export interface FileIdentity {
  size: number;
  hash: () => Promise<string>;
  guid: () => Promise<string | null>;
}

export function fileIdentity(platform: Platform, path: string, size: number): FileIdentity {
  let hash: Promise<string> | null = null;
  let guid: Promise<string | null> | null = null;
  return {
    size,
    hash: () => {
      hash ??= platform.readFile(path).then(contentHash);
      return hash;
    },
    guid: () => {
      guid ??= readUnityGuid(platform, path);
      return guid;
    },
  };
}

/** The size and full hash a version recorded of a file; either may be missing in versions older builds recorded. */
export interface RecordedBytes {
  size?: number | undefined;
  hash?: string | undefined;
}

/**
 * Whether a file is one that was recorded before: "content" when it has the size and full hash of one of `recorded`,
 * otherwise "guid" when it has the recorded Unity GUID, otherwise null. The file is hashed only when a size matches.
 */
export async function matchIdentity(
  file: FileIdentity,
  recorded: readonly RecordedBytes[],
  guid: string | null | undefined,
): Promise<Exclude<RelinkMatch, "structure"> | null> {
  const sized = recorded.filter((entry) => entry.size === file.size && entry.hash !== undefined);
  if (sized.length > 0) {
    const hash = await file.hash();
    if (sized.some((entry) => entry.hash === hash)) return "content";
  }
  return guid !== null && guid !== undefined && (await file.guid()) === guid ? "guid" : null;
}

/**
 * The files among `paths` that `matchIdentity` matches with what was recorded. It reads the size of every file before
 * it hashes any or reads any `.meta` file, and skips paths that are not plain files.
 */
export async function filesMatching(
  platform: Platform,
  paths: readonly string[],
  recorded: readonly RecordedBytes[],
  guid: string | null | undefined,
): Promise<string[]> {
  const sized: { path: string; size: number }[] = [];
  for (const path of paths) {
    const stat = await platform.stat(path);
    if (stat?.kind === "file") sized.push({ path, size: stat.size });
  }
  const found: string[] = [];
  for (const { path, size } of sized) {
    if ((await matchIdentity(fileIdentity(platform, path, size), recorded, guid)) !== null) found.push(path);
  }
  return found;
}
