import type { Vec3, Vec4 } from "./math";

export type AlphaMode = "opaque" | "mask" | "blend";

export type WrapMode = "repeat" | "clamp" | "mirror";

/** Applied to UVs before sampling: scale, then rotate counterclockwise around the origin, then offset. */
export interface UvTransform {
  offset: [u: number, v: number];
  scale: [u: number, v: number];
  /** Radians. */
  rotation: number;
}

export interface TextureRef {
  /** Index into `SceneDescription.textures`. */
  texture: number;
  /** Index into the mesh's `uvs`. */
  uvSet: number;
  wrapU: WrapMode;
  wrapV: WrapMode;
  /** Null when the UVs are used as they are. */
  transform: UvTransform | null;
}

/** The material slots a composition file can give a texture. */
export type TextureSlot = "baseColor" | "normal" | "roughness" | "metalness" | "emissive";

export const TEXTURE_SLOTS: readonly TextureSlot[] = ["baseColor", "normal", "roughness", "metalness", "emissive"];

/** A texture a composition file sets for a slot: the path it writes, and whether an image was found there. */
export interface TextureOverride {
  path: string;
  found: boolean;
}

/** A metallic-roughness approximation of the file's material, for a neutral preview. */
export interface Material {
  name: string;
  /** Linear RGBA. */
  baseColor: Vec4;
  baseColorTexture: TextureRef | null;
  metallic: number;
  roughness: number;
  /** Roughness in the green channel, metalness in the blue channel, as glTF packs them. */
  metallicRoughnessTexture: TextureRef | null;
  /** A grayscale roughness map, as FBX stores it. Where present it replaces `roughness`. */
  roughnessTexture: TextureRef | null;
  /** A grayscale metalness map, as FBX stores it. Where present it replaces `metallic`. */
  metalnessTexture: TextureRef | null;
  normalTexture: TextureRef | null;
  normalScale: number;
  occlusionTexture: TextureRef | null;
  /** Linear RGB. */
  emissive: Vec3;
  emissiveTexture: TextureRef | null;
  alphaMode: AlphaMode;
  alphaCutoff: number;
  doubleSided: boolean;
  /** Images the file names for a slot that were not found, by the path the file stores. Their slots are empty. */
  missingTextures?: Partial<Record<TextureSlot, string>>;
  /** Slots whose texture a composition file sets in place of the file's own. */
  textureOverrides?: Partial<Record<TextureSlot, TextureOverride>>;
}

export interface Texture {
  name: string;
  mimeType: string;
  bytes: Uint8Array;
  /** The path the asset stores for the image, as written there. */
  storedPath: string;
  /** Where the image was read, relative to the asset's folder with "/" separators; null when the asset embeds it. */
  foundPath: string | null;
}
