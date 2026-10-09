import type { EventName, PartSummary } from "@arcue/protocol";
import { createMemoryChannel, createPeer, createRemoteClient } from "@arcue/protocol";
import type { Material, SceneDescription, SceneNode } from "@arcue/scene";
import { importWarning } from "@arcue/scene";
import { describe, expect, it } from "vitest";
import { inspectScene } from "./inspect";
import type { TestCore } from "./test-support";
import { fakeAsset, fakeScene, HERO, heroFiles, heroSpec, startTestCore } from "./test-support";

const material = (name: string, overrides: Partial<Material> = {}): Material => ({
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
  ...overrides,
});

const ref = (texture: number) => ({ texture, uvSet: 0, wrapU: "repeat", wrapV: "repeat", transform: null }) as const;

function texturedScene(): SceneDescription {
  const scene = fakeScene({
    meshes: [
      { name: "Body", grid: 3 },
      { name: "Head", grid: 2, size: 0.5, offset: [0, 2, 0] },
    ],
    clips: [{ name: "Armature|Walk", frames: 25, fps: 24 }],
    fps: 24,
  });
  scene.textures.push({
    name: "Stone_BaseColor",
    mimeType: "image/png",
    bytes: new Uint8Array(4),
    storedPath: "Textures/Stone_BaseColor.png",
    foundPath: "Textures/Stone_BaseColor.png",
  });
  scene.materials.push(
    material("Stone", { baseColorTexture: ref(0), normalTexture: ref(7) }),
    material("Moss", { emissiveTexture: ref(0) }),
  );
  scene.source.warnings.push(
    importWarning(
      "texture-not-found",
      { kind: "texture", name: "Stone_Normal.png" },
      "Texture not found: Stone_Normal.png",
    ),
    importWarning(
      "texture-not-found",
      { kind: "texture", name: "Stone_Normal.png" },
      "Texture not found: Stone_Normal.png",
    ),
    importWarning("extra-skins", { kind: "node", name: "Curve" }, "Extra skins on Curve"),
  );
  scene.source.originalSpace = { axes: { right: "+X", up: "+Z", front: "-Y" }, unitMeters: 0.01 };
  return scene;
}

const plain = { composition: null, members: [] };

function part(id: string, name: string, levels: PartSummary["levels"]): PartSummary {
  return { id, name, role: "model", shownByDefault: true, levels };
}

describe("inspectScene", () => {
  it("summarizes the file, meshes, materials, textures, clips and warnings as plain data", () => {
    const inspection = inspectScene(texturedScene(), { ...plain, path: "/work/Assets/Golem.fbx", bytes: 1234 });
    expect(inspection).toEqual({
      file: { path: "/work/Assets/Golem.fbx", name: "Golem.fbx", bytes: 1234 },
      format: "fbx",
      exporter: "Blender 5.2",
      fps: 24,
      upAxis: "+Z",
      unitMeters: 0.01,
      height: 2.5,
      meshes: [
        { name: "Body", path: "Hero/Body", triangles: 8, vertices: 9, skinned: false },
        { name: "Head", path: "Hero/Head", triangles: 2, vertices: 4, skinned: false },
      ],
      parts: [
        part("Hero/Body", "Body", [{ level: 0, meshes: ["Hero/Body"], triangles: 8 }]),
        part("Hero/Head", "Head", [{ level: 0, meshes: ["Hero/Head"], triangles: 2 }]),
      ],
      triangles: 10,
      bones: 0,
      materials: [
        { name: "Stone", textures: [{ slot: "baseColor", texture: "Stone_BaseColor" }] },
        { name: "Moss", textures: [{ slot: "emissive", texture: "Stone_BaseColor" }] },
      ],
      textures: [
        { name: "Stone_BaseColor", found: true, mimeType: "image/png" },
        { name: "Stone_Normal.png", found: false, mimeType: null },
      ],
      clips: [{ name: "Armature|Walk", displayName: "Walk", frames: 25, fps: 24, duration: 1 }],
      composition: null,
      members: [],
      warnings: texturedScene().source.warnings,
    });
    expect(JSON.parse(JSON.stringify(inspection))).toEqual(inspection);
  });

  it("counts bone nodes and reports skinned meshes", () => {
    const scene = fakeScene({ meshes: [{ name: "Body", grid: 2 }] });
    const body = scene.meshes[0];
    if (body) body.skeleton = 0;
    const bone = (name: string, path: string, parent: number): SceneNode => ({
      name,
      path,
      parent,
      kind: "bone",
      translation: [0, 0, 0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
      mesh: null,
    });
    scene.nodes.push(bone("Root", "Hero/Root", 0), bone("Spine", "Hero/Root/Spine", 2));
    const inspection = inspectScene(scene, { ...plain, path: "/work/Rig.fbx", bytes: 1 });
    expect(inspection.bones).toBe(2);
    expect(inspection.meshes[0]?.skinned).toBe(true);
  });

  it("reports a file without meshes or an exporter", () => {
    const scene = fakeScene({ meshes: [], exporter: null });
    expect(inspectScene(scene, { ...plain, path: "/work/Empty.fbx", bytes: 0 })).toMatchObject({
      exporter: null,
      height: 0,
      meshes: [],
      triangles: 0,
      clips: [],
    });
  });
});

function bridge(test: TestCore) {
  const [coreSide, bridgeSide] = createMemoryChannel();
  test.core.connect(coreSide, { connection: "cli-1", caller: "bridge" });
  return createRemoteClient(createPeer(bridgeSide));
}

function record(test: TestCore): EventName[] {
  const names: EventName[] = [];
  test.core.registry.subscribeAll((name) => names.push(name));
  return names;
}

describe("asset.inspect", () => {
  it("imports the file for a bridge without opening a tab, emitting events or writing review data", async () => {
    const test = await startTestCore(heroFiles());
    const events = record(test);
    const inspection = await bridge(test).query("asset.inspect", { path: HERO });
    expect(inspection).toMatchObject({
      file: { path: HERO, name: "Hero.fbx", bytes: fakeAsset(heroSpec).length },
      exporter: "Blender 5.2",
      fps: 60,
      upAxis: "+Y",
      meshes: [{ name: "Body", triangles: 8, vertices: 9 }],
      clips: [
        { name: "Armature|Charge", frames: 61, fps: 60 },
        { name: "Armature|Run", frames: 31, fps: 60 },
      ],
    });
    expect(events).toEqual([]);
    expect(test.window.requests).toEqual([]);
    expect(test.platform.writes).toEqual([]);
    await expect(test.core.client.query("asset.list", {})).resolves.toEqual({ assets: [] });
  });

  it("answers a window and accepts an unnormalized path", async () => {
    const test = await startTestCore(heroFiles());
    const inspection = await test.window.client.query("asset.inspect", {
      path: "/work/game/Assets/./Art/../Art/Hero.fbx",
    });
    expect(inspection.file.path).toBe(HERO);
  });

  it("reads textures inside the workspace and reports the ones it cannot read", async () => {
    const spec = { ...heroSpec, textures: ["../Textures/Body.png", "../../../outside.png", "../Textures/notes.txt"] };
    const test = await startTestCore({
      ...heroFiles(spec),
      "/work/game/Assets/Textures/Body.png": Uint8Array.of(1),
      "/work/outside.png": Uint8Array.of(2),
      "/work/game/Assets/Textures/notes.txt": "text",
    });
    const inspection = await test.core.client.query("asset.inspect", { path: HERO });
    expect(inspection.textures).toEqual([{ name: "../Textures/Body.png", found: true, mimeType: "image/png" }]);
  });

  it("composes a model with its composition, as opening it would, from the model or the composition file", async () => {
    const art = "/work/game/Assets/Art";
    const test = await startTestCore({
      ...heroFiles({
        ...heroSpec,
        meshes: [...heroSpec.meshes, { name: "UCX_Body", grid: 2 }],
        bones: [{ name: "Spine" }],
        materials: ["Skin"],
      }),
      [`${art}/Hero.arcue`]: JSON.stringify({
        version: 1,
        model: "Hero.fbx",
        attach: [{ file: "Shield.fbx", bone: "Spine" }, { file: "Gone.fbx" }],
        materials: { Skin: { baseColor: "Skin.png" } },
      }),
      [`${art}/Shield.fbx`]: fakeAsset({ meshes: [{ name: "Shield", grid: 2 }] }),
      [`${art}/Hero@Idle.fbx`]: fakeAsset({ meshes: [], clips: [{ name: "Armature|Idle", frames: 11 }] }),
    });
    const fromModel = await test.core.client.query("asset.inspect", { path: HERO });
    const fromComposition = await test.core.client.query("asset.inspect", { path: `${art}/Hero.arcue` });
    expect(fromComposition).toEqual(fromModel);
    expect(fromModel.file.path).toBe(HERO);
    expect(fromModel.composition).toBe(`${art}/Hero.arcue`);
    expect(fromModel.members).toEqual([
      { file: "Hero@Idle.fbx", role: "animation", found: true },
      { file: "Shield.fbx", role: "attach", found: true },
      { file: "Gone.fbx", role: "set", found: false },
      { file: "Skin.png", role: "texture", found: false },
    ]);
    expect(fromModel.parts.map((part) => [part.id, part.role, part.shownByDefault])).toEqual([
      ["Hero/Body", "model", true],
      ["Hero/UCX_Body", "collision", false],
      ["Shield.fbx//Hero/Shield", "model", true],
    ]);
    expect(fromModel.clips.map((clip) => clip.name)).toContain("Hero@Idle.fbx//Armature|Idle");
    expect(
      fromModel.warnings.map((warning) => [warning.code, warning.severity, warning.subject, warning.file]),
    ).toEqual([
      ["file-not-found", "error", { kind: "file", name: "Gone.fbx" }, "Gone.fbx"],
      ["texture-not-found", "error", { kind: "texture", name: "Skin.png" }, "Hero.arcue"],
    ]);
    expect(test.platform.writes).toEqual([]);
  });

  it("rejects a missing file, a folder and a file the importer cannot parse", async () => {
    const test = await startTestCore({
      ...heroFiles(),
      "/work/game/Broken.fbx": fakeAsset({ meshes: [], fail: "Not an FBX file." }),
      "/work/game/Notes.txt": "notes",
    });
    const client = test.core.client;
    await expect(client.query("asset.inspect", { path: "/work/game/Missing.fbx" })).rejects.toMatchObject({
      code: "not-found",
    });
    await expect(client.query("asset.inspect", { path: "/work/game/Assets" })).rejects.toMatchObject({
      code: "invalid-input",
    });
    await expect(client.query("asset.inspect", { path: "/work/game/Broken.fbx" })).rejects.toThrow("Not an FBX file.");
    await expect(client.query("asset.inspect", { path: "/work/game/Notes.txt" })).rejects.toMatchObject({
      code: "invalid-input",
    });
    await expect(client.query("asset.inspect", { path: "Hero.fbx" })).rejects.toMatchObject({ code: "invalid-input" });
  });
});
