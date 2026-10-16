import type { SceneDescription, Material as SceneMaterial } from "@arcue/scene";
import { describeParts, visibleMeshes } from "@arcue/scene";
import type { Camera, Group, Material, Scene, WebGLRenderer } from "three";
import {
  MeshBasicMaterial,
  MeshDepthMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  Raycaster,
  Vector3,
} from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { stripScene } from "../math/test-fixture";
import { facesCamera, resolveAnchor } from "./anchor-points";
import { SEE_THROUGH_CUTOFF } from "./materials";
import type { MeshRuntime } from "./model";
import { Model, PICK_LAYER } from "./model";
import { DEFAULT_PALETTE } from "./palette";

function texture(index: number) {
  return { texture: index, uvSet: 0, wrapU: "repeat" as const, wrapV: "repeat" as const, transform: null };
}

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

function materials(material: Material | Material[]): Material[] {
  return Array.isArray(material) ? material : [material];
}

function alphaTests(material: Material | Material[]): number[] {
  return materials(material).map((entry) => entry.alphaTest);
}

/** The strip with one texture that decodes, as the browser's image decoder would give it. */
function texturedStrip(material: SceneMaterial): SceneDescription {
  vi.stubGlobal("createImageBitmap", async () => ({ width: 1, height: 1, close: () => {} }));
  return {
    ...stripScene(),
    materials: [material],
    textures: [
      { name: "card.png", mimeType: "image/png", bytes: new Uint8Array(4), storedPath: "card.png", foundPath: null },
    ],
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Model pick materials", () => {
  it("hides a pin on a single-sided back face and restores it in clay mode", async () => {
    const scene = stripScene();
    const mesh = scene.meshes[0];
    if (!mesh) throw new Error("the strip has a mesh");
    mesh.groups = [
      { start: 0, triangleCount: 2, material: 0 },
      { start: 2, triangleCount: 2, material: 1 },
    ];
    scene.materials = [
      { ...cutout, alphaMode: "opaque", doubleSided: false },
      { ...cutout, alphaMode: "opaque", doubleSided: true },
    ];
    const model = await Model.build(scene, DEFAULT_PALETTE, 1);
    const anchor = resolveAnchor(model, {
      kind: "surface",
      mesh: "Strip",
      vertices: [0, 1, 3],
      weights: [0.3, 0.3, 0.4],
    });
    if (!anchor) throw new Error("the pin resolves");
    const camera = new PerspectiveCamera();
    camera.position.set(0, 0.5, -1);
    camera.updateMatrixWorld();
    expect(facesCamera(anchor, camera)).toBe(false);
    model.setDisplayMode("clay");
    expect(facesCamera(anchor, camera)).toBe(true);
    model.dispose();
  });

  it("passes through a single-sided group's back face while retaining double-sided groups", async () => {
    const scene = stripScene();
    const mesh = scene.meshes[0];
    if (!mesh) throw new Error("the strip has a mesh");
    mesh.groups = [
      { start: 0, triangleCount: 2, material: 0 },
      { start: 2, triangleCount: 2, material: 1 },
    ];
    scene.materials = [
      { ...cutout, alphaMode: "opaque", doubleSided: false },
      { ...cutout, alphaMode: "opaque", doubleSided: true },
    ];
    const model = await Model.build(scene, DEFAULT_PALETTE, 1);
    const ray = new Raycaster(new Vector3(0, 0.4, -1), new Vector3(0, 0, 1));
    ray.layers.set(PICK_LAYER);
    expect(ray.intersectObject(model.root)).toHaveLength(0);
    ray.ray.origin.y = 1.4;
    expect(ray.intersectObject(model.root).length).toBeGreaterThan(0);
    model.setDisplayMode("clay");
    ray.ray.origin.y = 0.4;
    expect(ray.intersectObject(model.root).length).toBeGreaterThan(0);
    model.dispose();
  });

  it("builds a mesh whose groups use more materials than one call takes as arguments", async () => {
    const count = 64_000;
    const scene = stripScene();
    const mesh = scene.meshes[0];
    if (!mesh) throw new Error("the strip has a mesh");
    const strip = mesh.indices;
    mesh.indices = Uint32Array.from({ length: count * 3 }, (_, corner) => strip[corner % strip.length] ?? 0);
    mesh.groups = Array.from({ length: count }, (_, material) => ({ start: material, triangleCount: 1, material }));
    scene.materials = Array.from(
      { length: count },
      (_, material): SceneMaterial => ({ ...cutout, alphaMode: "opaque", doubleSided: material === 0 }),
    );
    const model = await Model.build(scene, DEFAULT_PALETTE, 1);
    const runtime = model.meshes[0];
    if (!runtime) throw new Error("the strip has a mesh");
    expect([runtime.lit.length, materials(runtime.pickLit).length]).toEqual([count, count]);
    model.dispose();
  });

  it("cuts out alpha-mask texels in the ID pass only while the display cuts them out", async () => {
    const model = await Model.build(texturedStrip({ ...cutout, baseColorTexture: texture(0) }), DEFAULT_PALETTE, 1);
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

describe("Model see-through materials", () => {
  it("lets clicks through the clear texels of a blended material whose map gives its alpha, while lit", async () => {
    const blended: SceneMaterial = { ...cutout, alphaMode: "blend", baseColorTexture: texture(0) };
    const model = await Model.build(texturedStrip(blended), DEFAULT_PALETTE, 1);
    const runtime = model.meshes[0];
    if (!runtime) throw new Error("the strip has a mesh");
    const lit = runtime.lit[0] as MeshStandardMaterial | undefined;
    const pick = materials(runtime.pick.material)[0] as MeshBasicMaterial | undefined;
    expect(lit?.map).not.toBeNull();
    expect([lit?.transparent, lit?.depthWrite]).toEqual([true, false]);
    expect([pick?.map, pick?.alphaTest, pick?.visible]).toEqual([lit?.map, SEE_THROUGH_CUTOFF, true]);
    model.setDisplayMode("clay");
    expect(alphaTests(runtime.pick.material)).toEqual([0]);
    model.dispose();
  });

  it("draws a hashed material of uniform opacity blended, and picks it solid however faint it is", async () => {
    const hashed = (alpha: number): SceneMaterial => ({ ...cutout, alphaMode: "hash", baseColor: [1, 1, 1, alpha] });
    const dense = await Model.build({ ...stripScene(), materials: [hashed(0.75)] }, DEFAULT_PALETTE, 1);
    const faint = await Model.build({ ...stripScene(), materials: [hashed(0.25)] }, DEFAULT_PALETTE, 1);
    const [denseRuntime] = dense.meshes;
    const [faintRuntime] = faint.meshes;
    if (!denseRuntime || !faintRuntime) throw new Error("the strip has a mesh");
    expect(denseRuntime.pick.material).toBe(denseRuntime.pickSolid);
    expect(faintRuntime.pick.material).toBe(faintRuntime.pickSolid);
    const lit = faintRuntime.lit[0];
    expect([lit?.visible, lit?.alphaHash, lit?.transparent, lit?.depthWrite]).toEqual([true, false, true, false]);
    expect([faintRuntime.pickSolid.visible, faintRuntime.pickSolid.alphaTest]).toEqual([true, 0]);
    dense.dispose();
    faint.dispose();
  });

  it("casts a hashed material's shadow by its map's alpha only where that alpha is the opacity", async () => {
    const hashed = (alpha: number, mapAlpha: "opacity" | "none"): SceneMaterial => ({
      ...cutout,
      alphaMode: "hash",
      baseColor: [1, 1, 1, alpha],
      baseColorTexture: { ...texture(0), alpha: mapAlpha },
    });
    const shadowOf = async (material: SceneMaterial) => {
      const model = await Model.build(texturedStrip(material), DEFAULT_PALETTE, 1);
      const runtime = model.meshes[0];
      const lit = runtime?.lit[0];
      const depth = runtime?.display.customDepthMaterial;
      if (!runtime || !lit || !(depth instanceof MeshDepthMaterial)) throw new Error("the strip casts a posed shadow");
      shadowDrawer(runtime)(lit);
      const picked = materials(runtime.pick.material).map((pick) => pick.visible);
      const pick = materials(runtime.pick.material)[0];
      const pickCut = pick instanceof MeshBasicMaterial && {
        alphaTest: pick.alphaTest,
        map: lit instanceof MeshStandardMaterial && pick.map === lit.map,
      };
      model.dispose();
      return { map: depth.map !== null, alphaTest: depth.alphaTest, picked, pickCut };
    };
    const cutByMap = { alphaTest: SEE_THROUGH_CUTOFF, map: true };
    expect(await shadowOf(hashed(0.8, "opacity"))).toEqual({
      map: true,
      alphaTest: SEE_THROUGH_CUTOFF / 0.8,
      picked: [true],
      pickCut: cutByMap,
    });
    expect(await shadowOf(hashed(0.8, "none"))).toMatchObject({ map: true, alphaTest: 0, picked: [true] });
    const faint = await shadowOf(hashed(0.25, "none"));
    expect([faint.alphaTest > 1, faint.picked]).toEqual([true, [true]]);
    const faintCard = await shadowOf(hashed(0.25, "opacity"));
    expect([faintCard.alphaTest > 1, faintCard.picked, faintCard.pickCut]).toEqual([true, [true], cutByMap]);
  });

  it("neither draws nor picks a masked material whose constant alpha is below its cutoff", async () => {
    const hidden: SceneMaterial = { ...cutout, alphaCutoff: 0.5, baseColor: [1, 1, 1, 0.3] };
    const model = await Model.build({ ...stripScene(), materials: [hidden] }, DEFAULT_PALETTE, 1);
    const runtime = model.meshes[0];
    if (!runtime) throw new Error("the strip has a mesh");
    expect(runtime.lit.map((material) => material.visible)).toEqual([false]);
    expect(materials(runtime.pick.material).map((material) => material.visible)).toEqual([false]);
    const ray = new Raycaster(new Vector3(0, 1, -1), new Vector3(0, 0, 1));
    ray.layers.set(PICK_LAYER);
    model.setDisplayMode("clay");
    expect(ray.intersectObject(model.root).length).toBeGreaterThan(0);
    model.dispose();
  });
});

describe("Model morph targets", () => {
  it("keeps one set of offsets per rendered vertex, fetched by each corner's rendered vertex", async () => {
    const scene = stripScene();
    const model = await Model.build(scene, DEFAULT_PALETTE, 1);
    const runtime = model.meshes[0];
    const morphs = runtime?.morphs;
    if (!runtime || !morphs) throw new Error("the strip has a morph target");
    const geometry = runtime.display.geometry;
    expect(geometry.morphAttributes).toEqual({});
    expect([...(geometry.getAttribute("morphVertex")?.array ?? [])]).toEqual([...runtime.data.indices]);
    expect(runtime.data.indices.length).toBe(12);
    expect([morphs.texture.image.width, morphs.texture.image.height, morphs.texture.image.depth]).toEqual([7, 1, 1]);
    model.applyPose(scene.clips[0] ?? null, 1);
    expect(morphs.weights[0]).toBe(1);
    model.applyPose(null, 0);
    expect(morphs.weights[0]).toBe(0);
    const drawing = [
      ...runtime.lit,
      runtime.clay,
      runtime.wireFill,
      runtime.wireLines,
      runtime.pickSolid,
      ...materials(runtime.pickLit),
      runtime.display.customDepthMaterial,
    ];
    for (const material of drawing) expect(material?.customProgramCacheKey()).toContain("arcue-morphs");
    model.dispose();
  });

  it("counts a shape key weight that is not finite as 0", async () => {
    const scene = stripScene();
    const target = scene.meshes[0]?.morphTargets[0];
    if (target) target.defaultWeight = Number.NaN;
    const model = await Model.build(scene, DEFAULT_PALETTE, 1);
    expect(model.meshes[0]?.morphs?.weights[0]).toBe(0);
    model.dispose();
  });

  it("never culls a mesh whose shape keys can move it past its rest bounds", async () => {
    const rigid = (keys: boolean): SceneDescription => {
      const scene = stripScene();
      scene.meshes = scene.meshes.map((mesh) => ({
        ...mesh,
        skeleton: null,
        bindMatrix: null,
        joints: null,
        weights: null,
        morphTargets: keys ? mesh.morphTargets : [],
      }));
      return scene;
    };
    const culled = (model: Model) =>
      model.meshes.flatMap((runtime) => [runtime.display, runtime.pick, runtime.wire].map((o) => o.frustumCulled));
    const keyed = await Model.build(rigid(true), DEFAULT_PALETTE, 1);
    const plain = await Model.build(rigid(false), DEFAULT_PALETTE, 1);
    expect(culled(keyed)).toEqual([false, false, false]);
    expect(culled(plain)).toEqual([true, true, true]);
    keyed.dispose();
    plain.dispose();
  });

  it("gives each cutout's shadow a program of its own, so three.js uploads that cutout's map and alpha test", async () => {
    const scene = texturedStrip(cutout);
    const mesh = scene.meshes[0];
    const card = scene.textures[0];
    if (!mesh || !card) throw new Error("the strip has a mesh and a texture");
    mesh.groups = [0, 1, 2, 3].map((material) => ({ start: material, triangleCount: 1, material }));
    scene.textures = [card, { ...card, name: "other.png" }];
    scene.materials = [
      { ...cutout, baseColorTexture: texture(0) },
      { ...cutout, baseColorTexture: texture(1) },
      { ...cutout, alphaMode: "opaque", baseColorTexture: texture(0) },
      { ...cutout, alphaMode: "opaque" },
    ];
    const model = await Model.build(scene, DEFAULT_PALETTE, 1);
    const runtime = model.meshes[0];
    if (!runtime) throw new Error("the strip has a mesh");
    const [hair, other, textured, plain] = runtime.lit;
    if (!hair || !other || !textured || !plain) throw new Error("the strip has four materials");
    expect([hair.alphaTest, other.alphaTest, textured.alphaTest, plain.alphaTest]).toEqual([0.4, 0.4, 0, 0]);
    const draw = shadowDrawer(runtime);
    const first = draw(hair);
    expect(draw(hair)).toEqual(first);
    const second = draw(other);
    expect(second.key).not.toBe(first.key);
    expect(second.version).toBeGreaterThan(first.version);
    const solid = draw(textured);
    expect([first.key, second.key]).not.toContain(solid.key);
    expect(draw(plain)).toEqual(solid);
    const again = draw(hair);
    expect(again.key).toBe(first.key);
    expect(again.version).toBeGreaterThan(solid.version);
    model.dispose();
  });
});

/**
 * Draws the mesh's shadow with a material as three.js does: it copies the material's map and alpha test onto the depth
 * material, then calls `onBeforeShadow`. Returns the depth material's program key and version after the call.
 */
function shadowDrawer(runtime: MeshRuntime) {
  const display = runtime.display;
  const depth = display.customDepthMaterial;
  if (!(depth instanceof MeshDepthMaterial)) throw new Error("the mesh casts a posed shadow");
  return (material: Material) => {
    depth.map = material instanceof MeshStandardMaterial ? material.map : null;
    depth.alphaTest = material.alphaTest;
    display.onBeforeShadow(
      {} as WebGLRenderer,
      {} as Scene,
      {} as Camera,
      {} as Camera,
      display.geometry,
      depth,
      {} as Group,
    );
    return { key: depth.customProgramCacheKey(), version: depth.version };
  };
}

describe("Model vertex colors", () => {
  const colored = (vertexColors: SceneMaterial["vertexColors"]) => {
    const scene = stripScene();
    const mesh = scene.meshes[0];
    if (!mesh) throw new Error("the strip has a mesh");
    mesh.colors = Float32Array.from([...mesh.sourceVertex].flatMap((source) => [source / 10, 0.5, 1, 0.25]));
    scene.materials = vertexColors ? [{ ...cutout, alphaMode: "opaque", vertexColors }] : [cutout];
    return scene;
  };

  it("gives the geometry the mesh's colors where a material multiplies by them", async () => {
    const model = await Model.build(colored({ baseColor: true, emissive: false }), DEFAULT_PALETTE, 1);
    const runtime = model.meshes[0];
    if (!runtime) throw new Error("the strip has a mesh");
    const color = runtime.display.geometry.getAttribute("color");
    expect(color?.itemSize).toBe(3);
    const indices = runtime.data.indices;
    const corner = 3;
    const vertex = indices[corner] ?? -1;
    const source = runtime.data.sourceVertex[vertex] ?? -1;
    expect([color?.getX(corner), color?.getY(corner), color?.getZ(corner)]).toEqual([Math.fround(source / 10), 0.5, 1]);
    expect(runtime.lit.map((material) => (material as MeshStandardMaterial).vertexColors)).toEqual([true]);
    model.dispose();
  });

  it("leaves the mesh's colors out where no material multiplies by them, as for FBX files", async () => {
    const model = await Model.build(colored(undefined), DEFAULT_PALETTE, 1);
    const runtime = model.meshes[0];
    if (!runtime) throw new Error("the strip has a mesh");
    expect(runtime.display.geometry.hasAttribute("color")).toBe(false);
    expect(runtime.lit.map((material) => (material as MeshStandardMaterial).vertexColors)).toEqual([false]);
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

describe("Model draw groups", () => {
  it("joins runs of one material only where they follow each other, shares the material between runs apart, and draws one material's runs together", async () => {
    const scene = stripScene();
    const mesh = scene.meshes[0];
    if (!mesh) throw new Error("the strip has a mesh");
    mesh.groups = [
      { start: 0, triangleCount: 1, material: 1 },
      { start: 1, triangleCount: 1, material: 0 },
      { start: 2, triangleCount: 1, material: 1 },
      { start: 3, triangleCount: 1, material: 1 },
    ];
    scene.materials = [
      { ...cutout, name: "Red", alphaMode: "opaque", doubleSided: false },
      { ...cutout, name: "Blue", alphaMode: "opaque", doubleSided: true },
    ];
    const model = await Model.build(scene, DEFAULT_PALETTE, 1);
    const runtime = model.meshes[0];
    if (!runtime) throw new Error("the strip has a mesh");
    expect(runtime.display.geometry.groups).toEqual([
      { start: 0, count: 3, materialIndex: 0 },
      { start: 6, count: 6, materialIndex: 0 },
      { start: 3, count: 3, materialIndex: 1 },
    ]);
    expect(runtime.lit.map((material) => material.name)).toEqual(["Blue", "Red"]);
    expect(materials(runtime.pickLit).map((material) => material.side)).toEqual(
      runtime.lit.map((material) => material.side),
    );
    model.dispose();
  });
});
