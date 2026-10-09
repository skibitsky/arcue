import type { Texture as SceneTexture } from "@arcue/scene";
import { DataTexture, LinearMipmapLinearFilter, RGBAFormat, Texture, UnsignedByteType } from "three";
import { TGALoader } from "three/addons/loaders/TGALoader.js";

/**
 * A decoded image whose clones share one upload. UVs follow the file's bottom-left origin, as FBX stores them, so the
 * image is flipped once while decoding.
 */
export interface DecodedImage {
  base: Texture;
  close(): void;
}

export async function decodeTexture(texture: SceneTexture): Promise<DecodedImage | null> {
  try {
    if (isTga(texture)) {
      const base = decodeTga(texture.bytes);
      return { base, close: () => base.dispose() };
    }
    const blob = new Blob([copyBytes(texture.bytes)], { type: texture.mimeType || "application/octet-stream" });
    const bitmap = await createImageBitmap(blob, {
      imageOrientation: "flipY",
      premultiplyAlpha: "none",
      colorSpaceConversion: "none",
    });
    const base = new Texture(bitmap);
    base.flipY = false;
    base.needsUpdate = true;
    return {
      base,
      close: () => {
        base.dispose();
        bitmap.close();
      },
    };
  } catch {
    return null;
  }
}

/** A texture over the decoded image, so each use can set its own wrapping, UV transform and color space. */
export function textureFrom(image: DecodedImage): Texture {
  return image.base.clone();
}

function isTga(texture: SceneTexture): boolean {
  const mime = texture.mimeType.toLowerCase();
  return mime.includes("tga") || mime.includes("targa") || texture.name.toLowerCase().endsWith(".tga");
}

function decodeTga(bytes: Uint8Array): DataTexture {
  const parsed = new TGALoader().parse(copyBytes(bytes).buffer);
  const texture = new DataTexture(
    parsed.data ?? null,
    parsed.width ?? 1,
    parsed.height ?? 1,
    RGBAFormat,
    UnsignedByteType,
  );
  texture.flipY = parsed.flipY ?? true;
  texture.generateMipmaps = true;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function copyBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}
