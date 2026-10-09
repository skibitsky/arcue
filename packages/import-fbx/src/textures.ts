import type { ImportWarning, Texture } from "@arcue/scene";
import { fileNameOf, imageMimeType, referencedFileCandidates } from "@arcue/scene";
import type { TextureFile } from "./decode";

function textureName(path: string): string {
  const name = fileNameOf(path);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

export interface TextureResolver {
  /** Index into `textures` for the texture file, or null when its image could not be found. */
  resolve(file: number): Promise<number | null>;
  readonly textures: Texture[];
  readonly warnings: ImportWarning[];
}

/**
 * Turns the file's texture paths into scene textures on first use. Embedded images are used as they are; other
 * images are read through `readFile` from the paths `referencedFileCandidates` gives, and a missing one adds a
 * "missing-texture" warning.
 */
export function createTextureResolver(
  files: readonly TextureFile[],
  assetFileName: string,
  readFile: (relativePath: string) => Promise<Uint8Array | null>,
): TextureResolver {
  const textures: Texture[] = [];
  const warnings: ImportWarning[] = [];
  const resolved = new Map<number, Promise<number | null>>();

  const load = async (file: TextureFile): Promise<number | null> => {
    const storedPath = file.relative !== "" ? file.relative : file.absolute;
    let bytes = file.content;
    if (!bytes) {
      const candidates = new Set([
        ...referencedFileCandidates(file.relative, assetFileName),
        ...referencedFileCandidates(file.absolute, assetFileName),
      ]);
      for (const candidate of candidates) {
        bytes = await readFile(candidate);
        if (bytes) break;
      }
    }
    if (!bytes) {
      warnings.push({
        code: "missing-texture",
        message: `The texture "${storedPath}" was not found beside the asset or in its .fbm folder.`,
        subject: storedPath,
      });
      return null;
    }
    textures.push({ name: textureName(storedPath), mimeType: imageMimeType(bytes, storedPath), bytes });
    return textures.length - 1;
  };

  return {
    textures,
    warnings,
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
