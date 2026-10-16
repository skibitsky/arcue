import { describe, expect, it } from "vitest";
import type { Material, TextureRef } from "./material";
import { unshownUvSetWarnings, VIEWPORT_UV_SETS } from "./uv-sets";

function ref(uvSet: number): TextureRef {
  return { texture: 0, uvSet, wrapU: "repeat", wrapV: "repeat", transform: null };
}

function material(name: string, refs: Partial<Material> = {}): Material {
  return {
    name,
    baseColor: [1, 1, 1, 1],
    baseColorTexture: null,
    metallic: 0,
    roughness: 1,
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
    ...refs,
  };
}

describe("unshownUvSetWarnings", () => {
  it("warns about each material whose textures sample a UV set the viewport does not draw", () => {
    const warnings = unshownUvSetWarnings([
      material("Shown", { baseColorTexture: ref(VIEWPORT_UV_SETS - 1) }),
      material("Detail", { baseColorTexture: ref(4), normalTexture: ref(6), roughnessTexture: ref(4) }),
      material("Detail", { emissiveTexture: ref(5) }),
      material("Last", { occlusionTexture: ref(7) }),
    ]);
    expect(warnings).toEqual([
      {
        code: "material-approximated",
        severity: "warning",
        subject: { kind: "material", name: "Detail" },
        message: "Material approximated: Detail",
        detail: "Textures on UV maps 5, 6 and 7 show with the first UV map, since the preview draws only the first 4",
      },
      {
        code: "material-approximated",
        severity: "warning",
        subject: { kind: "material", name: "Last" },
        message: "Material approximated: Last",
        detail: "Textures on UV map 8 show with the first UV map, since the preview draws only the first 4",
      },
    ]);
  });

  it("warns about nothing when every texture samples a drawn UV set", () => {
    expect(unshownUvSetWarnings([material("Plain"), material("Mapped", { normalTexture: ref(3) })])).toEqual([]);
  });
});
