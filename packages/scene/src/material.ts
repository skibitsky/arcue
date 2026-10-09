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
