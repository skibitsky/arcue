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
