import type { Material } from "@arcue/scene";
import { Texture, Vector2 } from "three";
import { describe, expect, it } from "vitest";
import { litMaterial } from "./materials";

/**
 * Where Blender's Point Mapping node with location (0.25, 0.1), Z rotation 0.3 and scale (2, 3) sends UVs, as Cycles
 * bakes them for the MappingPoint material of the Blender reader's shading fixture: [u, v, x, y].
 */
const BLENDER_POINT_MAPPING: readonly [number, number, number, number][] = [
  [0.12525, 0.1255, 0.378048, 0.533712],
  [0.37525, 0.1255, 0.855717, 0.681473],
  [0.87525, 0.1255, 1.811052, 0.976992],
  [0.12525, 0.3755, 0.156408, 1.250214],
  [0.37525, 0.3755, 0.634077, 1.397974],
];

const material: Material = {
  name: "Mapped",
  baseColor: [1, 1, 1, 1],
  baseColorTexture: {
    texture: 0,
    uvSet: 0,
    wrapU: "repeat",
    wrapV: "repeat",
    transform: { offset: [0.25, 0.1], scale: [2, 3], rotation: 0.3 },
  },
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
};

describe("a texture's UV transform", () => {
  it("samples where Blender's Mapping node of the same location, rotation and scale sends the UVs", () => {
    const lit = litMaterial({
      material,
      images: [{ base: new Texture(), close: () => {} }],
      uvSetCount: 1,
      vertexColors: false,
      anisotropy: 1,
      fallbackColor: "#888",
    });
    const map = lit.map;
    if (!map) throw new Error("No base color map.");
    expect(map.matrixAutoUpdate).toBe(false);
    for (const [u, v, x, y] of BLENDER_POINT_MAPPING) {
      const mapped = new Vector2(u, v).applyMatrix3(map.matrix);
      expect(mapped.x, `${u}, ${v}`).toBeCloseTo(x, 5);
      expect(mapped.y, `${u}, ${v}`).toBeCloseTo(y, 5);
    }
  });
});
