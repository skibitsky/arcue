import { describe, expect, it } from "vitest";
import type { Material, Texture } from "./material";
import { materialSlots, missingSlots } from "./material-slots";

function material(name: string, fields: Partial<Material> = {}): Material {
  return {
    name,
    baseColor: [0.5, 0.5, 0.5, 1],
    baseColorTexture: null,
    metallic: 0,
    roughness: 0.5,
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
    ...fields,
  };
}

const ref = (texture: number) => ({ texture, uvSet: 0, wrapU: "repeat", wrapV: "repeat", transform: null }) as const;

const image = (storedPath: string): Texture => ({
  name: storedPath,
  mimeType: "image/png",
  bytes: Uint8Array.of(1),
  storedPath,
  foundPath: storedPath,
});

describe("materialSlots", () => {
  it("lists set and missing slots, and always the base color slot", () => {
    const textures = [image("Textures/Stone.png"), image("Paint.png")];
    const slots = materialSlots({
      textures,
      materials: [
        material("Stone", {
          baseColorTexture: ref(0),
          missingTextures: { normal: "C:/art/Stone_N.png", emissive: "Glow.png" },
        }),
        material("Glass"),
        material("Shell", {
          baseColorTexture: ref(1),
          textureOverrides: {
            baseColor: { path: "Paint.png", found: true },
            roughness: { path: "Rough.png", found: false },
          },
        }),
        material(""),
      ],
    });
    expect(slots).toEqual([
      {
        material: "Stone",
        slots: [
          { slot: "baseColor", state: "set", path: "Textures/Stone.png", overridden: false, texture: 0 },
          { slot: "normal", state: "missing", path: "C:/art/Stone_N.png", overridden: false, texture: null },
          { slot: "emissive", state: "missing", path: "Glow.png", overridden: false, texture: null },
        ],
      },
      {
        material: "Glass",
        slots: [{ slot: "baseColor", state: "empty", path: null, overridden: false, texture: null }],
      },
      {
        material: "Shell",
        slots: [
          { slot: "baseColor", state: "set", path: "Paint.png", overridden: true, texture: 1 },
          { slot: "roughness", state: "missing", path: "Rough.png", overridden: true, texture: null },
        ],
      },
    ]);
    expect(missingSlots(slots).map(({ material, slot }) => [material, slot.slot])).toEqual([
      ["Stone", "normal"],
      ["Stone", "emissive"],
      ["Shell", "roughness"],
    ]);
  });

  it("lists a name once, with the most telling state of the materials that share it", () => {
    const slots = materialSlots({
      textures: [image("Stone.png")],
      materials: [
        material("Stone", { missingTextures: { baseColor: "Lost.png" } }),
        material("Stone", { baseColorTexture: ref(0) }),
        material("Stone"),
      ],
    });
    expect(slots).toEqual([
      {
        material: "Stone",
        slots: [{ slot: "baseColor", state: "set", path: "Stone.png", overridden: false, texture: 0 }],
      },
    ]);
  });
});
