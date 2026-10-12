import type { Material, TextureRef } from "@arcue/scene";
import type { WebGLProgramParametersWithUniforms, WebGLRenderer } from "three";
import { DataTexture, FrontSide, ShaderChunk, Texture } from "three";
import { describe, expect, it } from "vitest";
import { idMaterial, litMaterial, mapGivesOpacity, withRegionTint } from "./materials";
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

function lit(input: Material, vertexColors = false) {
  return litMaterial({
    material: input,
    images: [image, image],
    uvSetCount: 1,
    vertexColors,
    anisotropy: 1,
    fallbackColor: "#888",
  });
}

/** The material's fragment shader and program key, compiled from the chunks it patches. */
function compiled(result: ReturnType<typeof lit>) {
  const tint = { regionTint: { value: new DataTexture() }, regionTintWidth: { value: 1 } };
  const tinted = withRegionTint(result, tint);
  const shader = {
    uniforms: {},
    vertexShader: "#include <common>\n#include <begin_vertex>",
    fragmentShader:
      "#include <common>\n#include <map_fragment>\n#include <color_fragment>\n#include <emissivemap_fragment>\n" +
      "#include <colorspace_fragment>",
  } as unknown as WebGLProgramParametersWithUniforms;
  tinted.onBeforeCompile(shader, {} as WebGLRenderer);
  return { fragment: shader.fragmentShader, key: tinted.customProgramCacheKey() };
}

function lines(fragment: string): string[] {
  return fragment.split("\n").map((line) => line.trim());
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

  it("premultiplies or leaves out the alpha of maps as the texture says, and does not cut out by such an alpha", () => {
    const premultiplied = compiled(lit(material({ baseColorTexture: { ...ref(0), alpha: "premultiply" } })));
    const ignored = compiled(lit(material({ baseColorTexture: { ...ref(0), alpha: "none" }, alphaMode: "blend" })));
    const cutout = compiled(
      lit(material({ baseColorTexture: { ...ref(0), alpha: "premultiply" }, alphaMode: "mask" })),
    );
    const glowing = compiled(lit(material({ emissiveTexture: { ...ref(1), alpha: "premultiply" } })));
    const plain = compiled(lit(material({ baseColorTexture: ref(0), emissiveTexture: ref(1), alphaMode: "blend" })));
    expect(lines(premultiplied.fragment)).toContain(
      "diffuseColor.rgb *= sampledDiffuseColor.rgb * sampledDiffuseColor.a;",
    );
    expect(lines(ignored.fragment)).toContain("diffuseColor.rgb *= sampledDiffuseColor.rgb;");
    expect(lines(cutout.fragment)).toContain("diffuseColor.rgb *= sampledDiffuseColor.rgb * sampledDiffuseColor.a;");
    expect(cutout.fragment).not.toContain("diffuseColor.a *= sampledDiffuseColor.a");
    expect(lines(glowing.fragment)).toContain("totalEmissiveRadiance *= emissiveColor.rgb * emissiveColor.a;");
    for (const patched of [premultiplied, ignored, cutout, glowing]) {
      expect(patched.fragment).toContain("regionTintWidth");
      expect(patched.key).not.toBe(plain.key);
    }
    expect(new Set([premultiplied.key, ignored.key, glowing.key]).size).toBe(3);
    expect(plain.fragment).toContain("#include <map_fragment>");
    expect(plain.fragment).toContain("#include <emissivemap_fragment>");
    expect(ShaderChunk.map_fragment).toContain("diffuseColor *= sampledDiffuseColor;");
    expect(ShaderChunk.emissivemap_fragment).toContain("totalEmissiveRadiance *= emissiveColor.rgb;");
  });

  it("multiplies only the colors the material names by the vertex colors, where the geometry has them", () => {
    const base = lit(material({ vertexColors: { baseColor: true, emissive: false } }), true);
    const glow = lit(material({ vertexColors: { baseColor: false, emissive: true } }), true);
    const both = lit(material({ vertexColors: { baseColor: true, emissive: true } }), true);
    expect([base, glow, both].map((result) => result.vertexColors)).toEqual([true, true, true]);
    const shaders = [base, glow, both].map((result) => lines(compiled(result).fragment).join("\n"));
    const [baseShader = "", glowShader = "", bothShader = ""] = shaders;
    expect(baseShader).toContain("#include <color_fragment>");
    expect(glowShader).toContain("totalEmissiveRadiance *= vColor.rgb;");
    expect(glowShader).not.toContain("diffuseColor *= vColor;");
    expect(bothShader).toContain("diffuseColor *= vColor; totalEmissiveRadiance *= vColor.rgb;");
    expect(new Set([base, glow, both].map((result) => compiled(result).key)).size).toBe(3);
    expect(ShaderChunk.color_fragment).toContain("diffuseColor *= vColor;");

    expect(lit(material({ vertexColors: { baseColor: true, emissive: true } }), false).vertexColors).toBe(false);
    expect(lit(material({}), true).vertexColors).toBe(false);
  });
});

describe("idMaterial", () => {
  it("cuts out by a cutout's base color map only where the map's alpha is the opacity", () => {
    const cutout = lit(material({ baseColorTexture: ref(0), alphaMode: "mask" }));
    expect(idMaterial(0, FrontSide, cutout).map).toBe(cutout.map);
    const unrelated = idMaterial(0, FrontSide, cutout, false);
    expect(unrelated.map).toBeNull();
    expect(unrelated.alphaTest).toBe(cutout.alphaTest);
    expect(mapGivesOpacity(material({ baseColorTexture: ref(0) }))).toBe(true);
    expect(mapGivesOpacity(material({ baseColorTexture: { ...ref(0), alpha: "premultiply" } }))).toBe(false);
    expect(mapGivesOpacity(undefined)).toBe(true);
  });
});
