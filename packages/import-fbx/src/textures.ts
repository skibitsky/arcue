import type { ImportWarning, Texture } from "@arcue/scene";
import { referencedFileCandidates } from "@arcue/scene";
import type { TextureFile } from "./decode";

const SIGNATURES: readonly { mimeType: string; offset: number; bytes: readonly number[] }[] = [
  { mimeType: "image/png", offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mimeType: "image/jpeg", offset: 0, bytes: [0xff, 0xd8, 0xff] },
  { mimeType: "image/gif", offset: 0, bytes: [0x47, 0x49, 0x46, 0x38] },
  { mimeType: "image/webp", offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] },
  { mimeType: "image/ktx2", offset: 0, bytes: [0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb] },
  { mimeType: "image/vnd-ms.dds", offset: 0, bytes: [0x44, 0x44, 0x53, 0x20] },
  { mimeType: "image/vnd.adobe.photoshop", offset: 0, bytes: [0x38, 0x42, 0x50, 0x53] },
  { mimeType: "image/x-exr", offset: 0, bytes: [0x76, 0x2f, 0x31, 0x01] },
  { mimeType: "image/tiff", offset: 0, bytes: [0x49, 0x49, 0x2a, 0x00] },
  { mimeType: "image/tiff", offset: 0, bytes: [0x4d, 0x4d, 0x00, 0x2a] },
  { mimeType: "image/vnd.radiance", offset: 0, bytes: [0x23, 0x3f, 0x52] },
  { mimeType: "image/bmp", offset: 0, bytes: [0x42, 0x4d] },
];

const EXTENSIONS: Readonly<Record<string, string>> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  tga: "image/x-tga",
  tif: "image/tiff",
  tiff: "image/tiff",
  dds: "image/vnd-ms.dds",
  ktx2: "image/ktx2",
  exr: "image/x-exr",
  hdr: "image/vnd.radiance",
  psd: "image/vnd.adobe.photoshop",
};

function fileName(path: string): string {
  const slashed = path.replaceAll("\\", "/");
  return slashed.slice(slashed.lastIndexOf("/") + 1);
}

/** The image type from the bytes' signature, falling back to the path's extension. */
export function imageMimeType(bytes: Uint8Array, path: string): string {
  const signature = SIGNATURES.find(({ offset, bytes: expected }) =>
    expected.every((byte, index) => bytes[offset + index] === byte),
  );
  if (signature) return signature.mimeType;
  const name = fileName(path);
  const dot = name.lastIndexOf(".");
  return (dot === -1 ? undefined : EXTENSIONS[name.slice(dot + 1).toLowerCase()]) ?? "application/octet-stream";
}

function textureName(path: string): string {
  const name = fileName(path);
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
