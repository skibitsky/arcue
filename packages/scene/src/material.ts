import type { Vec3, Vec4 } from "./math";

/**
 * How a material's alpha shows: not at all, cut out at `alphaCutoff`, as stochastic transparency that needs no sorting
 * (Blender's Dithered or Hashed render method), or blended over what is behind in sorted order.
 */
export type AlphaMode = "opaque" | "mask" | "hash" | "blend";

export type WrapMode = "repeat" | "clamp" | "mirror";

/** Applied to UVs before sampling: scale, then rotate counterclockwise around the origin, then offset. */
export interface UvTransform {
  offset: [u: number, v: number];
  scale: [u: number, v: number];
  /** Radians. */
  rotation: number;
}

/**
 * What a material does with a texture's alpha: multiply its opacity, multiply the texture's color as Blender does
 * where nothing reads an image's alpha, or nothing.
 */
export type TextureAlpha = "opacity" | "premultiply" | "none";

/** How a texture's values decode: from sRGB, or as they are stored. */
export type TextureColorSpace = "srgb" | "linear";

export interface TextureRef {
  /** Index into `SceneDescription.textures`. */
  texture: number;
  /** Index into the mesh's `uvs`. */
  uvSet: number;
  wrapU: WrapMode;
  wrapV: WrapMode;
  /** Null when the UVs are used as they are. */
  transform: UvTransform | null;
  /** Unset is "opacity" for a base color texture and "none" for the others. */
  alpha?: TextureAlpha;
  /** Unset is "srgb" for base color and emissive textures and "linear" for the others. */
  colorSpace?: TextureColorSpace;
}

/** How a material samples a texture: everything a TextureRef says but which image. */
export type TextureSampling = Omit<TextureRef, "texture">;

/** The material slots a composition file can give a texture. */
export type TextureSlot = "baseColor" | "normal" | "roughness" | "metalness" | "emissive";

export const TEXTURE_SLOTS: readonly TextureSlot[] = ["baseColor", "normal", "roughness", "metalness", "emissive"];

/** A texture a composition file sets for a slot: the path it writes, and whether an image was found there. */
export interface TextureOverride {
  path: string;
  found: boolean;
}

/** Which of a material's colors the mesh's vertex colors multiply. */
export interface VertexColorUse {
  baseColor: boolean;
  emissive: boolean;
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
  /**
   * The colors the mesh's `colors` multiply, as a Color Attribute node feeding them does in Blender. Unset, the
   * mesh's colors are left out, as most engines' default shaders do.
   */
  vertexColors?: VertexColorUse;
  /** Images the file names for a slot that were not found, by the path the file stores. Their slots are empty. */
  missingTextures?: Partial<Record<TextureSlot, string>>;
  /**
   * How the material would have sampled each of `missingTextures`, where the importer knows it. A composition file's
   * texture for such a slot samples the same way.
   */
  missingTextureSampling?: Partial<Record<TextureSlot, TextureSampling>>;
  /** Slots whose texture a composition file sets in place of the file's own. */
  textureOverrides?: Partial<Record<TextureSlot, TextureOverride>>;
}

/** The keys of Material that hold a TextureRef. */
export type TextureRefKey = {
  [Key in keyof Material]-?: NonNullable<Material[Key]> extends TextureRef ? Key : never;
}[keyof Material];

/**
 * Each of Material's texture references with the name of the property it feeds, as `asset.inspect` reports it. Its
 * type requires every key, so a texture reference added to Material without an entry here does not compile.
 */
export const TEXTURE_REF_NAMES: Readonly<Record<TextureRefKey, string>> = {
  baseColorTexture: "baseColor",
  metallicRoughnessTexture: "metallicRoughness",
  roughnessTexture: "roughness",
  metalnessTexture: "metalness",
  normalTexture: "normal",
  occlusionTexture: "occlusion",
  emissiveTexture: "emissive",
};

/** Every key of Material that holds a TextureRef. */
export const TEXTURE_REF_KEYS = Object.keys(TEXTURE_REF_NAMES) as readonly TextureRefKey[];

/** The key of Material that holds each slot's texture. */
export const TEXTURE_SLOT_KEYS: Readonly<Record<TextureSlot, TextureRefKey>> = {
  baseColor: "baseColorTexture",
  normal: "normalTexture",
  roughness: "roughnessTexture",
  metalness: "metalnessTexture",
  emissive: "emissiveTexture",
};

export interface Texture {
  name: string;
  mimeType: string;
  bytes: Uint8Array;
  /** The path the asset stores for the image, as written there. */
  storedPath: string;
  /** Where the image was read, relative to the asset's folder with "/" separators; null when the asset embeds it. */
  foundPath: string | null;
}
