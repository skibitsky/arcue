import type { MorphTarget } from "@arcue/scene";
import type { Material, WebGLProgramParametersWithUniforms, WebGLRenderer } from "three";
import { MeshBasicMaterial, MeshDepthMaterial, MeshStandardMaterial, ShaderLib } from "three";
import { describe, expect, it } from "vitest";
import { MorphTargets, morphVertexAttribute, packOffsets } from "./morph-targets";

function target(positions: number[], normals: number[] | null): MorphTarget {
  return {
    name: "Key",
    defaultWeight: 0,
    positions: Float32Array.from(positions),
    normals: normals ? Float32Array.from(normals) : null,
  };
}

/** The vertex shader three.js would compile for the material, after the material's own changes. */
function vertexShader(material: Material, source: string): string {
  const shader = {
    uniforms: {},
    vertexShader: source,
    fragmentShader: "",
  } as unknown as WebGLProgramParametersWithUniforms;
  material.onBeforeCompile(shader, {} as WebGLRenderer);
  return shader.vertexShader;
}

describe("packOffsets", () => {
  it("lays out one layer per target with each vertex's position offset, then its normal offset", () => {
    const targets = [
      target([1, 2, 3, 4, 5, 6], [7, 8, 9, 10, 11, 12]),
      target([-1, -2, -3, -4, -5, -6], [0, 0, 1, 0, 0, 1]),
    ];
    const data = packOffsets(targets, 2, true, 5);
    expect(data.length).toBe(5 * 4 * 2);
    expect([...data.subarray(0, 16)]).toEqual([1, 2, 3, 0, 7, 8, 9, 0, 4, 5, 6, 0, 10, 11, 12, 0]);
    expect([...data.subarray(20, 28)]).toEqual([-1, -2, -3, 0, 0, 0, 1, 0]);
    expect([...packOffsets(targets, 2, false, 2)]).toEqual([1, 2, 3, 0, 4, 5, 6, 0, -1, -2, -3, 0, -4, -5, -6, 0]);
  });
});

describe("MorphTargets", () => {
  it("sizes the texture by rendered vertex, wrapping rows at 2048 texels", () => {
    const small = new MorphTargets([target([0, 0, 0, 0, 0, 0, 0, 0, 0], null)], 3);
    expect([small.texture.image.width, small.texture.image.height, small.texture.image.depth]).toEqual([3, 1, 1]);
    const vertexCount = 5000;
    const offsets = new Array<number>(vertexCount * 3).fill(0);
    const large = new MorphTargets([target(offsets, offsets), target(offsets, offsets)], vertexCount);
    expect(large.normals).toBe(true);
    expect([large.texture.image.width, large.texture.image.height, large.texture.image.depth]).toEqual([2048, 5, 2]);
  });

  it("packs the offsets when three.js reads them and drops them once uploaded", () => {
    const morphs = new MorphTargets([target([1, 2, 3], null)], 1);
    const first = morphs.texture.image.data;
    expect(morphs.texture.image.data).toBe(first);
    expect([...(first ?? [])]).toEqual([1, 2, 3, 0]);
    morphs.texture.onUpdate?.(morphs.texture);
    const again = morphs.texture.image.data;
    expect(again).not.toBe(first);
    expect(again).toEqual(first);
    expect(morphs.texture.version).toBeGreaterThan(0);
  });

  it("keeps the weights in whole vectors of four, zero past the last target", () => {
    const morphs = new MorphTargets(
      Array.from({ length: 5 }, () => target([0, 0, 0], null)),
      1,
    );
    morphs.setWeights(Float32Array.of(0.5, 0, 1, 0, 0.25));
    expect([...morphs.weights]).toEqual([0.5, 0, 1, 0, 0.25, 0, 0, 0]);
  });

  it("counts a weight that is not finite as 0, since three.js cannot upload a uniform that starts with NaN", () => {
    const morphs = new MorphTargets(
      Array.from({ length: 3 }, () => target([0, 0, 0], null)),
      1,
    );
    morphs.setWeights([Number.NaN, Number.NEGATIVE_INFINITY, 0.5]);
    expect([...morphs.weights]).toEqual([0, 0, 0.5, 0]);
  });

  it("adds the offsets in place of three.js's own morph chunks in every material the model draws with", () => {
    const withNormals = new MorphTargets([target([0, 0, 0], [0, 0, 0])], 1);
    const withoutNormals = new MorphTargets([target([0, 0, 0], null)], 1);
    const sources: [Material, string][] = [
      [new MeshStandardMaterial(), ShaderLib.standard.vertexShader],
      [new MeshBasicMaterial(), ShaderLib.basic.vertexShader],
      [new MeshDepthMaterial(), ShaderLib.depth.vertexShader],
    ];
    for (const [material, source] of sources) {
      const keyBefore = material.customProgramCacheKey();
      withNormals.patch(material);
      const shader = vertexShader(material, source);
      expect(shader).toContain("attribute float morphVertex;");
      expect(shader).toContain("#define MORPH_WEIGHT_VECTORS 1");
      expect(shader).toContain("#define MORPH_TEXELS_PER_VERTEX 2");
      expect(shader).toContain("transformed += morphSum( 0 );");
      expect(shader).toContain("objectNormal += morphSum( 1 );");
      expect(shader).not.toMatch(/#include <morph(target|normal|target_pars)_vertex>/);
      expect(material.customProgramCacheKey()).not.toBe(keyBefore);
    }
    const plain = new MeshStandardMaterial();
    withoutNormals.patch(plain);
    const shader = vertexShader(plain, ShaderLib.standard.vertexShader);
    expect(shader).toContain("#define MORPH_TEXELS_PER_VERTEX 1");
    expect(shader).not.toContain("objectNormal += morphSum");
  });

  it("gives every material of a mesh the same texture and weights", () => {
    const morphs = new MorphTargets([target([0, 0, 0], null)], 1);
    const uniforms = (material: Material) => {
      const shader = {
        uniforms: {},
        vertexShader: ShaderLib.basic.vertexShader,
        fragmentShader: "",
      } as unknown as WebGLProgramParametersWithUniforms;
      morphs.patch(material);
      material.onBeforeCompile(shader, {} as WebGLRenderer);
      return shader.uniforms;
    };
    const [a, b] = [uniforms(new MeshBasicMaterial()), uniforms(new MeshBasicMaterial())];
    expect(a.morphOffsets?.value).toBe(morphs.texture);
    expect(a.morphWeights?.value).toBe(morphs.weights);
    expect(b.morphOffsets).toBe(a.morphOffsets);
  });
});

describe("morphVertexAttribute", () => {
  it("gives each corner its rendered vertex", () => {
    expect([...morphVertexAttribute(Uint32Array.of(0, 1, 3, 3, 2, 0, 9), 6)]).toEqual([0, 1, 3, 3, 2, 0]);
  });
});
