import { describe, expect, expectTypeOf, it } from "vitest";
import type { TextureRefKey } from "./material";
import { TEXTURE_REF_KEYS, TEXTURE_REF_NAMES, TEXTURE_SLOT_KEYS, TEXTURE_SLOTS } from "./material";

describe("texture reference keys", () => {
  it("list every key of Material that holds a texture reference, once", () => {
    expectTypeOf<TextureRefKey>().toEqualTypeOf<
      | "baseColorTexture"
      | "metallicRoughnessTexture"
      | "roughnessTexture"
      | "metalnessTexture"
      | "normalTexture"
      | "occlusionTexture"
      | "emissiveTexture"
    >();
    expect(TEXTURE_REF_KEYS).toEqual([
      "baseColorTexture",
      "metallicRoughnessTexture",
      "roughnessTexture",
      "metalnessTexture",
      "normalTexture",
      "occlusionTexture",
      "emissiveTexture",
    ]);
    expect(TEXTURE_REF_KEYS.map((key) => TEXTURE_REF_NAMES[key])).toEqual([
      "baseColor",
      "metallicRoughness",
      "roughness",
      "metalness",
      "normal",
      "occlusion",
      "emissive",
    ]);
  });

  it("name each slot's key, which the property name of that key gives back", () => {
    for (const slot of TEXTURE_SLOTS) expect(TEXTURE_REF_NAMES[TEXTURE_SLOT_KEYS[slot]]).toBe(slot);
  });
});
