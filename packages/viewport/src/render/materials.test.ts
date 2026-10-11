import type { Material, TextureRef } from "@arcue/scene";
import type { WebGLProgramParametersWithUniforms, WebGLRenderer } from "three";
import { DataTexture, ShaderChunk, Texture } from "three";
import { describe, expect, it } from "vitest";
import { litMaterial, withRegionTint } from "./materials";
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

  it("premultiplies or leaves out the alpha of maps as the texture says, keeping a cutout's alpha", () => {
    const compiled = (overrides: Partial<Material>) => {
      const tint = { regionTint: { value: new DataTexture() }, regionTintWidth: { value: 1 } };
      const result = withRegionTint(lit(material(overrides)), tint);
      const shader = {
        uniforms: {},
        vertexShader: "#include <common>\n#include <begin_vertex>",
        fragmentShader:
          "#include <common>\n#include <map_fragment>\n#include <emissivemap_fragment>\n#include <colorspace_fragment>",
      } as unknown as WebGLProgramParametersWithUniforms;
      result.onBeforeCompile(shader, {} as WebGLRenderer);
      return { fragment: shader.fragmentShader, key: result.customProgramCacheKey() };
    };
    const premultiplied = compiled({ baseColorTexture: { ...ref(0), alpha: "premultiply" } });
    const ignored = compiled({ baseColorTexture: { ...ref(0), alpha: "none" }, alphaMode: "blend" });
    const cutout = compiled({ baseColorTexture: { ...ref(0), alpha: "premultiply" }, alphaMode: "mask" });
    const glowing = compiled({ emissiveTexture: { ...ref(1), alpha: "premultiply" } });
    const plain = compiled({ baseColorTexture: ref(0), emissiveTexture: ref(1), alphaMode: "blend" });
    const lines = (fragment: string) => fragment.split("\n").map((line) => line.trim());
    expect(lines(premultiplied.fragment)).toContain(
      "diffuseColor.rgb *= sampledDiffuseColor.rgb * sampledDiffuseColor.a;",
    );
    expect(lines(ignored.fragment)).toContain("diffuseColor.rgb *= sampledDiffuseColor.rgb;");
    expect(lines(cutout.fragment)).toContain(
      "diffuseColor.rgb *= sampledDiffuseColor.rgb * sampledDiffuseColor.a; diffuseColor.a *= sampledDiffuseColor.a;",
    );
    expect(lines(glowing.fragment)).toContain("totalEmissiveRadiance *= emissiveColor.rgb * emissiveColor.a;");
    for (const patched of [premultiplied, ignored, cutout, glowing]) {
      expect(patched.fragment).toContain("regionTintWidth");
      expect(patched.key).not.toBe(plain.key);
    }
    expect(new Set([premultiplied.key, ignored.key, cutout.key, glowing.key]).size).toBe(4);
    expect(plain.fragment).toContain("#include <map_fragment>");
    expect(plain.fragment).toContain("#include <emissivemap_fragment>");
    expect(ShaderChunk.map_fragment).toContain("diffuseColor *= sampledDiffuseColor;");
    expect(ShaderChunk.emissivemap_fragment).toContain("totalEmissiveRadiance *= emissiveColor.rgb;");
  });
});
