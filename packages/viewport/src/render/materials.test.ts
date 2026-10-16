import type { Material, TextureRef } from "@arcue/scene";
import type { MeshBasicMaterial, MeshStandardMaterial, WebGLProgramParametersWithUniforms, WebGLRenderer } from "three";
import { DataTexture, FrontSide, NoColorSpace, ShaderChunk, ShaderLib, SRGBColorSpace, Texture } from "three";
import { describe, expect, it } from "vitest";
import { idMaterial, litMaterial, SEE_THROUGH_CUTOFF, withRegionTint } from "./materials";
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
      "#include <common>\n#include <map_fragment>\n#include <color_fragment>\n#include <alphatest_fragment>\n" +
      "#include <alphahash_fragment>\n#include <emissivemap_fragment>\n#include <colorspace_fragment>",
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

describe("litMaterial alpha modes", () => {
  it("hashes without sorting and with depth where the map gives the opacity, and cuts out only the shadow and ID passes", () => {
    const hashed = lit(material({ baseColorTexture: ref(0), baseColor: [1, 1, 1, 0.8], alphaMode: "hash" }));
    expect([hashed.alphaHash, hashed.transparent, hashed.depthWrite, hashed.opacity]).toEqual([true, false, true, 0.8]);
    expect(hashed.alphaTest).toBeCloseTo(SEE_THROUGH_CUTOFF / 0.8);
    const { fragment, key } = compiled(hashed);
    expect(fragment).not.toContain("#include <alphatest_fragment>");
    expect(fragment).toContain("#include <alphahash_fragment>");
    expect(key).not.toBe(compiled(lit(material({ baseColorTexture: ref(0), alphaMode: "mask" }))).key);
    expect(ShaderLib.standard.fragmentShader).toContain("#include <alphatest_fragment>");
    const pick = idMaterial(0, FrontSide, hashed);
    expect([pick.alphaTest, pick.opacity, pick.map]).toEqual([SEE_THROUGH_CUTOFF, 1, hashed.map]);
  });

  it("blends a hashed material whose opacity is uniform, as one frame of hashing would show it grainy, and draws it opaque at full opacity", () => {
    const uniform: Partial<Material>[] = [
      {},
      { baseColorTexture: { ...ref(0), alpha: "none" } },
      { baseColorTexture: { ...ref(0), alpha: "premultiply" } },
      { baseColorTexture: ref(2) },
    ];
    for (const input of uniform) {
      const glass = lit(material({ ...input, baseColor: [1, 1, 1, 0.3], alphaMode: "hash" }));
      const blended = lit(material({ ...input, baseColor: [1, 1, 1, 0.3], alphaMode: "blend" }));
      const drawn = (result: MeshStandardMaterial) => [
        result.alphaHash,
        result.transparent,
        result.depthWrite,
        result.opacity,
        result.alphaTest,
        compiled(result).key,
      ];
      const hashedAs = drawn(glass);
      expect(hashedAs).toEqual(drawn(blended));
      expect(hashedAs.slice(0, 4)).toEqual([false, true, false, 0.3]);
    }
    for (const input of [{}, { baseColorTexture: ref(2) }]) {
      const full = lit(material({ ...input, baseColor: [1, 1, 1, 1], alphaMode: "hash" }));
      expect([full.alphaHash, full.transparent, full.depthWrite, full.alphaTest]).toEqual([false, false, true, 0]);
    }
  });

  it("blends sorted without writing depth and without cutting out the display, while masked and opaque materials write depth", () => {
    const blended = lit(material({ baseColorTexture: ref(0), baseColor: [1, 1, 1, 0.9], alphaMode: "blend" }));
    expect([blended.transparent, blended.depthWrite, blended.opacity, blended.alphaHash]).toEqual([
      true,
      false,
      0.9,
      false,
    ]);
    expect(blended.alphaTest).toBeCloseTo(SEE_THROUGH_CUTOFF / 0.9);
    expect(compiled(blended).fragment).not.toContain("#include <alphatest_fragment>");
    const masked = lit(material({ alphaMode: "mask", alphaCutoff: 0.3 }));
    expect([masked.transparent, masked.depthWrite, masked.alphaTest, masked.alphaHash]).toEqual([
      false,
      true,
      0,
      false,
    ]);
    const opaque = lit(material({ baseColor: [1, 1, 1, 0.4] }));
    expect([opaque.transparent, opaque.depthWrite, opaque.alphaTest, opaque.opacity]).toEqual([false, true, 0, 1]);
    expect(compiled(opaque).fragment).toContain("#include <alphatest_fragment>");
  });
});

/**
 * Whether three.js's shadow pass draws a texel whose base color map alpha is `texel`: its depth material copies the
 * lit material's map and alpha test, not its opacity.
 */
function shadowKeeps(result: MeshStandardMaterial, texel: number): boolean {
  const alpha = result.map ? texel : 1;
  return result.visible && !(result.alphaTest > 0 && alpha < result.alphaTest);
}

/** Whether the ID pass draws that texel: its basic material multiplies its own opacity by the map's alpha. */
function pickKeeps(pick: MeshBasicMaterial, texel: number): boolean {
  const alpha = pick.opacity * (pick.map ? texel : 1);
  return pick.visible && !(pick.alphaTest > 0 && alpha < pick.alphaTest);
}

describe("litMaterial cutouts", () => {
  const cases: { name: string; input: Partial<Material>; cutoff: number; mapIsOpacity: boolean }[] = [
    {
      name: "masked by its map",
      input: { alphaMode: "mask", alphaCutoff: 0.5, baseColorTexture: ref(0) },
      cutoff: 0.5,
      mapIsOpacity: true,
    },
    {
      name: "masked with a map whose alpha is premultiplied",
      input: { alphaMode: "mask", alphaCutoff: 0.5, baseColorTexture: { ...ref(0), alpha: "premultiply" } },
      cutoff: 0.5,
      mapIsOpacity: false,
    },
    { name: "masked without a map", input: { alphaMode: "mask", alphaCutoff: 0.5 }, cutoff: 0.5, mapIsOpacity: false },
    {
      name: "hashed by its map",
      input: { alphaMode: "hash", baseColorTexture: ref(0) },
      cutoff: SEE_THROUGH_CUTOFF,
      mapIsOpacity: true,
    },
    {
      name: "hashed with a map whose alpha is left out",
      input: { alphaMode: "hash", baseColorTexture: { ...ref(0), alpha: "none" } },
      cutoff: SEE_THROUGH_CUTOFF,
      mapIsOpacity: false,
    },
    { name: "hashed without a map", input: { alphaMode: "hash" }, cutoff: SEE_THROUGH_CUTOFF, mapIsOpacity: false },
    {
      name: "blended by its map",
      input: { alphaMode: "blend", baseColorTexture: ref(0) },
      cutoff: SEE_THROUGH_CUTOFF,
      mapIsOpacity: true,
    },
    { name: "blended without a map", input: { alphaMode: "blend" }, cutoff: SEE_THROUGH_CUTOFF, mapIsOpacity: false },
  ];

  for (const { name, input, cutoff, mapIsOpacity } of cases) {
    const seeThrough = input.alphaMode !== "mask";
    it(`keeps the shadow pass's texels by their opacity, and the ID pass's by the display or the map, when ${name}`, () => {
      for (const opacity of [1, 0.8, 0.5, 0.3, 0]) {
        const result = lit(material({ ...input, baseColor: [1, 1, 1, opacity] }));
        const pick = idMaterial(0, FrontSide, result);
        for (const texel of [0, 0.3, 0.6, 0.7, 1]) {
          const shadowed = opacity * (mapIsOpacity ? texel : 1) >= cutoff;
          const picked = seeThrough ? opacity > 0 && (!mapIsOpacity || texel >= SEE_THROUGH_CUTOFF) : shadowed;
          expect([shadowKeeps(result, texel), pickKeeps(pick, texel)], `opacity ${opacity}, texel ${texel}`).toEqual([
            shadowed,
            picked,
          ]);
        }
      }
    });
  }

  it("draws nothing where a masked material's alpha is one constant below its cutoff, and solid where above it", () => {
    const premultiplied = { ...ref(0), alpha: "premultiply" as const };
    const hidden = lit(material({ alphaMode: "mask", baseColor: [1, 1, 1, 0.3], baseColorTexture: premultiplied }));
    expect([hidden.visible, idMaterial(0, FrontSide, hidden).visible]).toEqual([false, false]);
    const solid = lit(material({ alphaMode: "mask", baseColor: [1, 1, 1, 0.8], baseColorTexture: premultiplied }));
    expect([solid.visible, solid.alphaTest, solid.map !== null]).toEqual([true, 0, true]);
    expect(lit(material({ alphaMode: "mask", baseColor: [1, 1, 1, 0.3] })).visible).toBe(false);
  });

  it("draws and picks a see-through material of uniform opacity below the cutoff, which casts no shadow", () => {
    for (const alphaMode of ["hash", "blend"] as const) {
      const glass = lit(material({ alphaMode, baseColor: [1, 1, 1, 0.3] }));
      const pick = idMaterial(0, FrontSide, glass);
      expect([glass.visible, shadowKeeps(glass, 1)]).toEqual([true, false]);
      expect([pick.visible, pick.alphaTest, pick.map]).toEqual([true, 0, null]);
    }
  });
});

describe("litMaterial color spaces", () => {
  it("decodes each texture in its ref's color space, else its slot's, also where two uses share one image", () => {
    const result = lit(
      material({
        baseColorTexture: { ...ref(0), colorSpace: "linear" },
        roughnessTexture: { ...ref(0), colorSpace: "srgb" },
        metalnessTexture: ref(0),
        emissiveTexture: ref(1),
        normalTexture: { ...ref(1), colorSpace: "linear" },
      }),
    );
    expect(
      [result.map, result.roughnessMap, result.metalnessMap, result.emissiveMap, result.normalMap].map(
        (texture) => texture?.colorSpace,
      ),
    ).toEqual([NoColorSpace, SRGBColorSpace, NoColorSpace, SRGBColorSpace, NoColorSpace]);
    expect(result.map?.source).toBe(image.base.source);
    expect(result.roughnessMap?.source).toBe(image.base.source);
    expect(result.map).not.toBe(result.roughnessMap);
  });
});

describe("idMaterial", () => {
  it("cuts out by a cutout's base color map only where the map's alpha is the opacity", () => {
    const cutout = lit(material({ baseColorTexture: ref(0), alphaMode: "mask" }));
    expect([idMaterial(0, FrontSide, cutout).map, idMaterial(0, FrontSide, cutout).alphaTest]).toEqual([
      cutout.map,
      0.5,
    ]);
    const unrelated = idMaterial(
      0,
      FrontSide,
      lit(material({ baseColorTexture: { ...ref(0), alpha: "premultiply" }, alphaMode: "mask" })),
    );
    expect([unrelated.map, unrelated.alphaTest, unrelated.visible]).toEqual([null, 0, true]);
    expect([idMaterial(0, FrontSide).map, idMaterial(0, FrontSide).alphaTest]).toEqual([null, 0]);
  });
});
