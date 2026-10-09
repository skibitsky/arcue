import type { FoundFile } from "@arcue/scene";
import { parseStoredPath } from "@arcue/scene";
import { insideWithoutLinks } from "./links";
import { basename, dirname, joinPath, normalizePath, pathInside, relativePath } from "./paths";
import type { DirectoryEntry, EntryKind, Platform } from "./platform";

/** Extensions of the files an import worker may read, such as external textures. */
export const readableImageExtensions: readonly string[] = [
  ".png",
  ".jpg",
  ".jpeg",
  ".tga",
  ".tif",
  ".tiff",
  ".bmp",
  ".dds",
  ".exr",
  ".hdr",
  ".webp",
];

/** The most folders one import may list while it searches for referenced files. */
export const MAX_SEARCHED_FOLDERS = 256;

export function isReadableImage(name: string): boolean {
  const lower = name.toLowerCase();
  return readableImageExtensions.some((extension) => lower.endsWith(extension));
}

export interface FileSearch {
  find(storedPath: string): Promise<FoundFile | null>;
}

/**
 * Finds the images an asset references for one import, answering "import.findFile". Folders are listed at most once
 * and at most `MAX_SEARCHED_FOLDERS` of them; names match regardless of case, an exact match first. The search stays
 * inside `readRoot`, skips folders reached through a symbolic link and files that are links, and reads only images.
 */
export function createFileSearch(platform: Platform, assetPath: string, readRoot: string): FileSearch {
  const root = normalizePath(readRoot);
  const assetFolder = dirname(assetPath);
  const stem = basename(assetPath).replace(/\.[^.]*$/, "");
  const listings = new Map<string, Promise<DirectoryEntry[]>>();
  const found = new Map<string, Promise<string | null>>();

  const list = (folder: string): Promise<DirectoryEntry[]> => {
    let listing = listings.get(folder);
    if (!listing) {
      listing = listings.size >= MAX_SEARCHED_FOLDERS ? Promise.resolve([]) : listFolder(platform, root, folder);
      listings.set(folder, listing);
    }
    return listing;
  };

  const entry = async (folder: string, name: string, kind: EntryKind): Promise<string | null> => {
    const lower = name.toLowerCase();
    const matches = (await list(folder)).filter(
      (candidate) => candidate.kind === kind && candidate.name.toLowerCase() === lower,
    );
    const match = matches.find((candidate) => candidate.name === name) ?? matches[0];
    return match ? joinPath(folder, match.name) : null;
  };

  function* folders(relative: string | null): Generator<Promise<string | null>> {
    if (relative !== null) {
      const target = joinPath(assetFolder, relative);
      if (pathInside(root, target) !== null) yield Promise.resolve(dirname(target));
    }
    yield Promise.resolve(assetFolder);
    yield entry(assetFolder, `${stem}.fbm`, "directory");
    yield entry(assetFolder, "Textures", "directory");
    for (let folder = assetFolder; folder !== root && pathInside(root, folder) !== null; ) {
      folder = dirname(folder);
      yield Promise.resolve(folder);
      yield entry(folder, "Textures", "directory");
    }
  }

  const search = async (storedPath: string): Promise<string | null> => {
    const stored = parseStoredPath(storedPath);
    if (!isReadableImage(stored.name)) return null;
    const tried = new Set<string>();
    for (const next of folders(stored.relative)) {
      const folder = await next;
      if (folder === null || tried.has(folder)) continue;
      tried.add(folder);
      const file = await entry(folder, stored.name, "file");
      if (file) return file;
    }
    return null;
  };

  return {
    async find(storedPath) {
      let path = found.get(storedPath);
      if (!path) {
        path = search(storedPath);
        found.set(storedPath, path);
      }
      const file = await path;
      if (file === null) return null;
      const relative = relativePath(assetFolder, file);
      const bytes = relative === null ? null : await platform.readFile(file).catch(() => null);
      return relative !== null && bytes ? { path: relative, bytes } : null;
    },
  };
}

async function listFolder(platform: Platform, root: string, folder: string): Promise<DirectoryEntry[]> {
  try {
    if (!(await insideWithoutLinks(platform, root, folder))) return [];
    if ((await platform.stat(folder))?.kind !== "directory") return [];
    const entries = await platform.list(folder);
    return entries.filter((entry) => entry.kind === "directory" || isReadableImage(entry.name));
  } catch {
    return [];
  }
}
