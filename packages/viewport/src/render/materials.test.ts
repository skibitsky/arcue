import type { Material, TextureRef } from "@arcue/scene";
import { Texture } from "three";
import { describe, expect, it } from "vitest";
import { litMaterial } from "./materials";
import type { DecodedImage } from "./textures";

const image: DecodedImage = { base: new Texture(), close: () => {} };

function ref(texture: number): TextureRef {
  return { texture, uvSet: 0, wrapU: "repeat", wrapV: "repeat", transform: null };
}

function material(overrides: Partial<Material>): Material {
  return {
    name: "Stone",
    baseColor: [1, 1, 1, 1],
    baseColorTexture: null,
    metallic: 0.2,
    roughness: 0.6,
    metallicRoughnessTexture: null,
    roughnessTexture: null,
    metalnessTexture: null,
    normalTexture: null,
    normalScale: 1,
    occlusionTexture: null,
    emissive: [0, 0, 0],
    emissiveTexture: null,
    alphaMode: "opaque",
    alphaCutoff: 0.5,
    doubleSided: false,
    ...overrides,
  };
}

function lit(input: Material) {
  return litMaterial({ material: input, images: [image, image], uvSetCount: 1, anisotropy: 1, fallbackColor: "#888" });
}

describe("litMaterial", () => {
  it("lets FBX's grayscale roughness and metalness maps replace their scalars", () => {
    const result = lit(material({ roughnessTexture: ref(0), metalnessTexture: ref(1) }));
    expect(result.roughnessMap).not.toBeNull();
    expect(result.metalnessMap).not.toBeNull();
    expect(result.roughnessMap).not.toBe(result.metalnessMap);
    expect([result.roughness, result.metalness]).toEqual([1, 1]);
  });

  it("keeps the scalar where a map is missing", () => {
    const result = lit(material({ roughnessTexture: ref(0) }));
    expect(result.metalnessMap).toBeNull();
    expect([result.roughness, result.metalness]).toEqual([1, 0.2]);
  });

  it("reads glTF's packed map for both and keeps the scalars as factors", () => {
    const result = lit(material({ metallicRoughnessTexture: ref(0) }));
    expect(result.roughnessMap).toBe(result.metalnessMap);
    expect(result.roughnessMap).not.toBeNull();
    expect([result.roughness, result.metalness]).toEqual([0.6, 0.2]);
  });
});
