import type { SceneDescription, Material as SceneMaterial } from "@arcue/scene";
import { describeParts, visibleMeshes } from "@arcue/scene";
import type { Material } from "three";
import { describe, expect, it } from "vitest";
import { stripScene } from "../math/test-fixture";
import { resolveAnchor } from "./anchor-points";
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

/** The strip twice: as "Strip_LOD0" and as "Strip_LOD1". */
function lodScene(): SceneDescription {
  const scene = stripScene();
  const strip = scene.nodes[4];
  const mesh = scene.meshes[0];
  if (!strip || !mesh) throw new Error("the strip has a mesh node");
  scene.nodes = [
    ...scene.nodes.slice(0, 4),
    { ...strip, name: "Strip_LOD0", path: "Strip_LOD0" },
    { ...strip, name: "Strip_LOD1", path: "Strip_LOD1", mesh: 1 },
  ];
  scene.meshes = [mesh, { ...mesh, name: "Strip_LOD1" }];
  scene.parts = describeParts(scene.nodes);
  return scene;
}

describe("Model visibility", () => {
  it("draws and resolves anchors on the visible meshes only, in both passes and the wireframe", async () => {
    const scene = lodScene();
    const model = await Model.build(scene, DEFAULT_PALETTE, 1);
    const [lod0, lod1] = model.meshes;
    if (!lod0 || !lod1) throw new Error("two meshes");
    model.setDisplayMode("wireframe");
    model.setVisibleMeshes(visibleMeshes(scene.parts));
    expect([lod0.display.visible, lod0.pick.visible, lod0.wire.visible]).toEqual([true, true, true]);
    expect([lod1.display.visible, lod1.pick.visible, lod1.wire.visible]).toEqual([false, false, false]);
    const anchor = (mesh: string) => ({
      kind: "surface" as const,
      mesh,
      vertices: [0, 1, 2] as [number, number, number],
      weights: [0.4, 0.3, 0.3] as [number, number, number],
    });
    expect(resolveAnchor(model, anchor("Strip_LOD0"))).not.toBeNull();
    expect(resolveAnchor(model, anchor("Strip_LOD1"))).toBeNull();
    model.setVisibleMeshes(visibleMeshes(scene.parts, { hidden: [], shown: [], isolated: null, lod: 1 }));
    model.setDisplayMode("lit");
    expect([lod0.display.visible, lod1.display.visible, lod1.wire.visible]).toEqual([false, true, false]);
    expect(resolveAnchor(model, anchor("Strip_LOD1"))).not.toBeNull();
    model.dispose();
  });
});
