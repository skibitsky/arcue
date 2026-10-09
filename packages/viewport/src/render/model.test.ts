import type { Material as SceneMaterial } from "@arcue/scene";
import type { Material } from "three";
import { describe, expect, it } from "vitest";
import { stripScene } from "../math/test-fixture";
import { Model } from "./model";
import { DEFAULT_PALETTE } from "./palette";

const cutout: SceneMaterial = {
  name: "HairCards",
  baseColor: [1, 1, 1, 1],
  baseColorTexture: null,
  metallic: 0,
  roughness: 0.6,
  metallicRoughnessTexture: null,
  roughnessTexture: null,
  metalnessTexture: null,
  normalTexture: null,
  normalScale: 1,
  occlusionTexture: null,
  emissive: [0, 0, 0],
  emissiveTexture: null,
  alphaMode: "mask",
  alphaCutoff: 0.4,
  doubleSided: true,
};

function alphaTests(material: Material | Material[]): number[] {
  return (Array.isArray(material) ? material : [material]).map((entry) => entry.alphaTest);
}

describe("Model pick materials", () => {
  it("cuts out alpha-mask texels in the ID pass only while the display cuts them out", async () => {
    const model = await Model.build({ ...stripScene(), materials: [cutout] }, DEFAULT_PALETTE, 1);
    const runtime = model.meshes[0];
    if (!runtime) throw new Error("the strip has a mesh");
    expect(alphaTests(runtime.pick.material)).toEqual([0.4]);
    model.setDisplayMode("clay");
    expect(alphaTests(runtime.pick.material)).toEqual([0]);
    model.setDisplayMode("wireframe");
    expect(alphaTests(runtime.pick.material)).toEqual([0]);
    model.setDisplayMode("lit");
    expect(alphaTests(runtime.pick.material)).toEqual([0.4]);
    model.dispose();
  });
});
