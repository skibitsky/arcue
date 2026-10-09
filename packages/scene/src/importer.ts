import type { SceneDescription } from "./scene";
import type { SourceFormat } from "./source";

/** An image found for a path stored in an asset. */
export interface FoundFile {
  /** Where it was found, relative to the asset's folder with "/" separators, such as "../Textures/Rock.png". */
  path: string;
  bytes: Uint8Array;
}

export interface ImportRequest {
  fileName: string;
  bytes: Uint8Array;
  /**
   * Reads an image the asset references, such as an external texture, by a path relative to the asset's folder.
   * The path may leave the folder but not the workspace root: the git repository, or the asset's folder outside one.
   * Resolves to null when the file is missing, is not an image, or may not be read. `referencedFileCandidates` lists
   * the paths to try for a path stored in the file.
   */
  readFile(relativePath: string): Promise<Uint8Array | null>;
}

/** Turns one file format into a scene description. Importers run in an import worker without file access. */
export interface Importer {
  format: SourceFormat;
  /** Lowercase extensions with the dot, such as ".fbx". */
  extensions: readonly string[];
  import(request: ImportRequest): Promise<SceneDescription>;
}

export function findImporter(importers: readonly Importer[], fileName: string): Importer | null {
  const lower = fileName.toLowerCase();
  return importers.find((importer) => importer.extensions.some((extension) => lower.endsWith(extension))) ?? null;
}

/**
 * Relative paths to try, in order, for a file path stored in an asset. A relative stored path comes first.
 * An absolute path from the exporting machine cannot be read, so the file's name is looked up in the asset's folder
 * and in the "<asset name>.fbm" folder beside it, where FBX tools extract embedded media.
 */
export function referencedFileCandidates(storedPath: string, assetFileName: string): string[] {
  const slashed = storedPath.replaceAll("\\", "/");
  const name = slashed.slice(slashed.lastIndexOf("/") + 1);
  const absolute = slashed.startsWith("/") || /^[A-Za-z]:/.test(slashed);
  const stem = assetFileName.replace(/\.[^./]*$/, "");
  const candidates = absolute || slashed === "" ? [] : [slashed];
  if (name !== "") candidates.push(name, `${stem}.fbm/${name}`);
  return [...new Set(candidates)];
}

export interface StoredPath {
  /** The file name, such as "Rock_BaseColor.png"; empty when the path ends in a separator or is empty. */
  name: string;
  /** The path with "/" separators when it is relative, or null when it is absolute or empty. */
  relative: string | null;
  /** True for a path from the exporting machine, such as "C:/Users/artist/rock.png" or "/home/artist/rock.png". */
  absolute: boolean;
}

/** Splits a file path stored in an asset, written with either separator. */
export function parseStoredPath(storedPath: string): StoredPath {
  const slashed = storedPath.replaceAll("\\", "/");
  const name = slashed.slice(slashed.lastIndexOf("/") + 1);
  const absolute = slashed.startsWith("/") || /^[A-Za-z]:/.test(slashed);
  return { name, relative: absolute || slashed === "" ? null : slashed, absolute };
}
