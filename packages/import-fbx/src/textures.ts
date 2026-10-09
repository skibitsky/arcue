import type { FoundFile, ImportWarning, Texture } from "@arcue/scene";
import { fileNameOf, imageMimeType, importWarning, parseStoredPath } from "@arcue/scene";
import type { TextureFile } from "./decode";

function textureName(path: string): string {
  const name = fileNameOf(path);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

export interface TextureResolver {
  /** Index into `textures` for the texture file, or null when its image could not be found. */
  resolve(file: number): Promise<number | null>;
  /** The path the file stores for the texture file, relative when it has one. */
  storedPath(file: number): string;
  readonly textures: Texture[];
  readonly warnings: ImportWarning[];
}

/**
 * Turns the file's texture paths into scene textures on first use. Embedded images are used as they are; the core
 * finds the others through `findFile`. A missing image adds "texture-not-found", and a file that stores only an
 * absolute path from the exporting machine adds "texture-path-absolute" even when the image is found by name.
 */
export function createTextureResolver(
  files: readonly TextureFile[],
  findFile: (storedPath: string) => Promise<FoundFile | null>,
): TextureResolver {
  const textures: Texture[] = [];
  const warnings: ImportWarning[] = [];
  const resolved = new Map<number, Promise<number | null>>();

  const storedPathOf = (file: TextureFile) => parseStoredPath(file.relative).relative ?? file.absolute;

  const load = async (file: TextureFile): Promise<number | null> => {
    const relative = parseStoredPath(file.relative);
    const storedPath = storedPathOf(file);
    const subject = { kind: "texture", name: fileNameOf(storedPath) || fileNameOf(file.relative) } as const;
    let bytes = file.content;
    let foundPath: string | null = null;
    if (!bytes) {
      if (relative.relative === null && parseStoredPath(file.absolute).absolute) {
        warnings.push(importWarning("texture-path-absolute", subject, `Texture path is absolute: ${file.absolute}`));
      }
      for (const candidate of new Set([file.relative, file.absolute])) {
        if (candidate === "") continue;
        const found = await findFile(candidate);
        if (found) {
          bytes = found.bytes;
          foundPath = found.path;
          break;
        }
      }
    }
    if (!bytes) {
      warnings.push(importWarning("texture-not-found", subject, `Texture not found: ${subject.name}`));
      return null;
    }
    textures.push({
      name: textureName(storedPath),
      mimeType: imageMimeType(bytes, foundPath ?? storedPath),
      bytes,
      storedPath,
      foundPath,
    });
    return textures.length - 1;
  };

  return {
    textures,
    warnings,
    storedPath(index) {
      const file = files[index];
      return file ? storedPathOf(file) : "";
    },
    resolve(index) {
      const file = files[index];
      if (!file) return Promise.resolve(null);
      let texture = resolved.get(index);
      if (!texture) {
        texture = load(file);
        resolved.set(index, texture);
      }
      return texture;
    },
  };
}
