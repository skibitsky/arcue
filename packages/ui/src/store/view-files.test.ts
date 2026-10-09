import type { AssetInspection } from "@arcue/protocol";
import { ArcueError } from "@arcue/protocol";
import type { Clip, Material, SceneDescription } from "@arcue/scene";
import { describe, expect, it, vi } from "vitest";
import { STONE_RESONATOR_PATH } from "../../dev/sample-data";
import { flush, openStone } from "../test-helpers";
import type { FileHost, FileKind } from "./view-files";
import { besideModel, clipGroups, sortDropped } from "./view-files";

const FOLDER = STONE_RESONATOR_PATH.slice(0, STONE_RESONATOR_PATH.lastIndexOf("/"));

function clip(name: string, file?: string): Clip {
  return {
    name,
    displayName: name,
    fps: 30,
    duration: 1,
    frameCount: 31,
    tracks: [],
    keyTimes: new Float32Array(),
    keyedEveryFrame: false,
    ...(file ? { file } : {}),
  };
}

function material(name: string, fields: Partial<Material> = {}): Material {
  return {
    name,
    baseColor: [1, 1, 1, 1],
    baseColorTexture: null,
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
    ...fields,
  };
}

function inspection(meshes: number, clips: number): AssetInspection {
  return {
    file: { path: "/x.fbx", name: "x.fbx", bytes: 1 },
    format: "fbx",
    exporter: null,
    fps: 30,
    upAxis: "+Y",
    unitMeters: 1,
    height: 0,
    meshes: Array.from({ length: meshes }, (_, index) => ({
      name: `M${index}`,
      path: `M${index}`,
      triangles: 1,
      vertices: 3,
      skinned: false,
    })),
    parts: [],
    triangles: meshes,
    bones: 0,
    materials: [],
    textures: [],
    clips: Array.from({ length: clips }, (_, index) => ({
      name: `C${index}`,
      displayName: `C${index}`,
      frames: 2,
      fps: 30,
      duration: 1 / 30,
    })),
    composition: null,
    members: [],
    warnings: [],
  };
}

/** A host whose dialog answers with `picked` and that places dropped files beside the model by name. */
function fakeHost(picked: Partial<Record<FileKind, string[]>> = {}) {
  const opened: string[][] = [];
  const discarded: string[][] = [];
  const host: FileHost = {
    pick: async (kind) => picked[kind] ?? [],
    place: async (files, assetPath) => files.map((file) => besideModel(assetPath, file.name)),
    open: (files) => opened.push(files.map((file) => file.name)),
    discard: (files) => {
      discarded.push(files.map((file) => file.name));
    },
  };
  return { host, opened, discarded };
}

const file = (name: string) => new File(["x"], name);

function callsOf(client: { calls: readonly { name: string; input: unknown }[] }, name: string): unknown[] {
  return client.calls.filter((call) => call.name === name).map((call) => call.input);
}

describe("clipGroups", () => {
  it("lists the model's clips first, then each file's, and lets only composition files leave the view", () => {
    const groups = clipGroups(
      [
        clip("Turn", "Anim/Turns.fbx"),
        clip("Walk"),
        clip("Idle", "Hero@Idle.fbx"),
        clip("Run"),
        clip("Wave", "Hero@Wave.fbx/../Wave.fbx"),
      ],
      "Hero.fbx",
    );
    expect(groups.map((group) => [group.file, group.clips.map((entry) => entry.name), group.removable])).toEqual([
      [null, ["Walk", "Run"], false],
      ["Anim/Turns.fbx", ["Turn"], true],
      ["Hero@Idle.fbx", ["Idle"], false],
      ["Hero@Wave.fbx/../Wave.fbx", ["Wave"], true],
    ]);
    expect(clipGroups([clip("Turn", "Turns.fbx")], "Hero.fbx").map((group) => group.file)).toEqual(["Turns.fbx"]);
  });
});

describe("file helpers", () => {
  it("resolves a path relative to the model's folder", () => {
    expect(besideModel("/work/Assets/Bug/Bug.fbx", "Shells.fbx")).toBe("/work/Assets/Bug/Shells.fbx");
    expect(besideModel("/work/Assets/Bug/Bug.fbx", "../Anim/./Turn.fbx")).toBe("/work/Assets/Anim/Turn.fbx");
    expect(besideModel("C:/art/Bug.fbx", "Turn.fbx")).toBe("C:/art/Turn.fbx");
  });

  it("sorts dropped files into models and images", () => {
    const sorted = sortDropped([file("Hero.FBX"), file("notes.txt"), file("Rock.TGA"), file("Hero.arcue")]);
    expect(sorted.models.map((entry) => entry.name)).toEqual(["Hero.FBX"]);
    expect(sorted.images.map((entry) => entry.name)).toEqual(["Rock.TGA"]);
  });
});

describe("adding files to a view", () => {
  it("adds each picked model and lets the core choose its role", async () => {
    const { host } = fakeHost({ model: [`${FOLDER}/Shells.fbx`, `${FOLDER}/Shell.png`, `${FOLDER}/Turn.fbx`] });
    const { client, store, session } = await openStone({ files: host });
    await store.addFileToView(session.assetId);
    expect(callsOf(client, "composition.addFile")).toEqual([
      { assetId: session.assetId, file: `${FOLDER}/Shells.fbx` },
      { assetId: session.assetId, file: `${FOLDER}/Turn.fbx` },
    ]);
    expect(store.state.get().toast).toMatchObject({ message: "Added Turn.fbx", kind: "info" });
  });

  it("does nothing when the dialog is cancelled, and says so when no model was picked", async () => {
    const { client, store, session } = await openStone({ files: fakeHost().host });
    await store.addFileToView(session.assetId);
    expect(callsOf(client, "composition.addFile")).toEqual([]);
    expect(store.state.get().toast).toBeNull();

    const images = await openStone({ files: fakeHost({ model: [`${FOLDER}/Shell.png`] }).host });
    await images.store.addFileToView(images.session.assetId);
    expect(images.store.state.get().toast).toMatchObject({ message: "Choose an FBX file.", kind: "alert" });
  });

  it("shows why the core refused a file", async () => {
    const { host } = fakeHost({ model: ["/elsewhere/Shells.fbx"] });
    const { client, store, session } = await openStone({ files: host });
    vi.spyOn(client, "execute").mockRejectedValueOnce(
      new ArcueError("invalid-input", "Shells.fbx is outside the asset's workspace."),
    );
    await store.addFileToView(session.assetId);
    expect(store.state.get().toast).toMatchObject({
      message: "Shells.fbx is outside the asset's workspace.",
      kind: "alert",
    });
  });

  it("does not offer files without a host", async () => {
    const { client, store, session } = await openStone();
    expect(store.canAddFiles).toBe(false);
    await store.addFileToView(session.assetId);
    await store.dropOnView(session.assetId, [file("Turn.fbx")], { x: 1, y: 2 });
    expect(client.calls.some((call) => call.name === "composition.addFile")).toBe(false);
  });

  it("removes an added file by its path beside the model", async () => {
    const { client, store, session } = await openStone();
    await store.removeFileFromView(session.assetId, "Anim/Turns.fbx");
    expect(callsOf(client, "composition.removeFile")).toEqual([
      { assetId: session.assetId, file: `${FOLDER}/Anim/Turns.fbx` },
    ]);
  });
});

describe("dropping files on a model's view", () => {
  it("adds animation-only files at once, as animation files", async () => {
    const { host } = fakeHost();
    const { client, store, session } = await openStone({ files: host, inspect: () => inspection(0, 2) });
    await store.dropOnView(session.assetId, [file("Turn.fbx"), file("Wave.fbx")], { x: 10, y: 20 });
    expect(store.state.get().dropPrompt).toBeNull();
    expect(callsOf(client, "composition.addFile")).toEqual([
      { assetId: session.assetId, file: `${FOLDER}/Turn.fbx`, role: "animation" },
      { assetId: session.assetId, file: `${FOLDER}/Wave.fbx`, role: "animation" },
    ]);
  });

  it("asks at the drop point for a file with meshes, then adds it with its role or opens it in a new tab", async () => {
    const { host, opened, discarded } = fakeHost();
    const { client, store, session } = await openStone({
      files: host,
      inspect: (path) => (path.endsWith("Turn.fbx") ? inspection(0, 1) : inspection(1, 0)),
    });
    const dropped = [file("Shells.fbx"), file("Turn.fbx"), file("Shell.png")];
    await store.dropOnView(session.assetId, dropped, { x: 10, y: 20 });
    expect(store.state.get().dropPrompt).toMatchObject({
      assetId: session.assetId,
      x: 10,
      y: 20,
      models: [
        { path: `${FOLDER}/Shells.fbx`, role: "set" },
        { path: `${FOLDER}/Turn.fbx`, role: "animation" },
      ],
    });
    expect(callsOf(client, "composition.addFile")).toEqual([]);

    await store.answerDrop("view");
    expect(store.state.get().dropPrompt).toBeNull();
    expect(callsOf(client, "composition.addFile")).toEqual([
      { assetId: session.assetId, file: `${FOLDER}/Shells.fbx`, role: "set" },
      { assetId: session.assetId, file: `${FOLDER}/Turn.fbx`, role: "animation" },
    ]);

    await store.dropOnView(session.assetId, dropped, { x: 30, y: 40 });
    await store.answerDrop("tab");
    expect(opened).toEqual([["Shells.fbx", "Turn.fbx", "Shell.png"]]);
    expect(callsOf(client, "composition.addFile")).toHaveLength(2);

    expect(discarded).toEqual([]);

    await store.dropOnView(session.assetId, dropped, { x: 30, y: 40 });
    store.dismissDrop();
    expect(store.state.get().dropPrompt).toBeNull();
    expect(discarded).toEqual([["Shells.fbx", "Turn.fbx", "Shell.png"]]);
    store.dismissDrop();
    expect(discarded).toHaveLength(1);
  });

  it("discards an unanswered drop's files when another drop replaces its prompt", async () => {
    const { host, discarded } = fakeHost();
    const { store, session } = await openStone({ files: host, inspect: () => inspection(1, 0) });
    await store.dropOnView(session.assetId, [file("Shells.fbx")], { x: 0, y: 0 });
    await store.dropOnView(session.assetId, [file("Crate.fbx")], { x: 0, y: 0 });
    expect(discarded).toEqual([["Shells.fbx"]]);
    expect(store.state.get().dropPrompt?.models.map((model) => model.path)).toEqual([`${FOLDER}/Crate.fbx`]);
  });

  it("discards the dropped files when their tab closes while the prompt is open", async () => {
    const { host, discarded } = fakeHost();
    const { store, session } = await openStone({ files: host, inspect: () => inspection(1, 0) });
    await store.dropOnView(session.assetId, [file("Shells.fbx")], { x: 0, y: 0 });
    await store.closeTab(session.assetId);
    expect(store.state.get().dropPrompt).toBeNull();
    expect(discarded).toEqual([["Shells.fbx"]]);
  });

  it("discards a drop whose tab closes while its files are being placed", async () => {
    const { host, discarded } = fakeHost();
    const placement = Promise.withResolvers<void>();
    const place = host.place;
    host.place = async (...args) => {
      await placement.promise;
      return place(...args);
    };
    const { store, session } = await openStone({ files: host, inspect: () => inspection(1, 0) });
    const dropped = store.dropOnView(session.assetId, [file("Shells.fbx")], { x: 0, y: 0 });
    await flush();
    await store.closeTab(session.assetId);
    placement.resolve();
    await dropped;
    expect(store.state.get().dropPrompt).toBeNull();
    expect(discarded).toEqual([["Shells.fbx"]]);
  });

  it("keeps the newest drop when an earlier placement finishes later", async () => {
    const { host, discarded } = fakeHost();
    const placement = Promise.withResolvers<void>();
    const place = host.place;
    host.place = async (files, path) => {
      if (files[0]?.name === "Shells.fbx") await placement.promise;
      return place(files, path);
    };
    const { store, session } = await openStone({ files: host, inspect: () => inspection(1, 0) });
    const earlier = store.dropOnView(session.assetId, [file("Shells.fbx")], { x: 0, y: 0 });
    await flush();
    const latest = store.dropOnView(session.assetId, [file("Crate.fbx")], { x: 1, y: 1 });
    await flush();
    placement.resolve();
    await Promise.all([earlier, latest]);
    expect(store.state.get().dropPrompt?.models.map((model) => model.path)).toEqual([`${FOLDER}/Crate.fbx`]);
    expect(discarded).toEqual([["Shells.fbx"]]);
  });

  it("asks when a dropped model cannot be inspected, and then lets the core pick its role", async () => {
    const { client, store, session } = await openStone({ files: fakeHost().host });
    await store.dropOnView(session.assetId, [file("Odd.fbx")], { x: 0, y: 0 });
    expect(store.state.get().dropPrompt?.models).toEqual([{ path: `${FOLDER}/Odd.fbx`, role: null }]);
    await store.answerDrop("view");
    expect(callsOf(client, "composition.addFile")).toEqual([{ assetId: session.assetId, file: `${FOLDER}/Odd.fbx` }]);
  });

  const withMissing = (missing: Material["missingTextures"][]) => (scene: SceneDescription) => ({
    ...scene,
    materials: missing.map((entry, index) => material(`M${index}`, entry ? { missingTextures: entry } : {})),
  });

  it("replaces a pending model drop when an image is dropped next", async () => {
    const { host, discarded } = fakeHost();
    const { store, session } = await openStone({
      files: host,
      inspect: () => inspection(1, 0),
      scene: withMissing([{ normal: "Stone_N.png" }]),
    });
    await store.dropOnView(session.assetId, [file("Shells.fbx")], { x: 0, y: 0 });
    await store.dropOnView(session.assetId, [file("Stone_N.png")], { x: 0, y: 0 });
    expect(store.state.get().dropPrompt).toBeNull();
    expect(discarded).toEqual([["Shells.fbx"]]);
  });

  it("puts a dropped image in the only missing slot", async () => {
    const { client, store, session } = await openStone({
      files: fakeHost().host,
      scene: withMissing([undefined, { normal: "textures/Stone_N.png" }]),
    });
    await store.dropOnView(session.assetId, [file("notes.txt"), file("Stone_N.png")], { x: 0, y: 0 });
    expect(callsOf(client, "material.setTexture")).toEqual([
      { assetId: session.assetId, material: "M1", slot: "normal", file: `${FOLDER}/Stone_N.png` },
    ]);
    expect(store.state.get().toast).toMatchObject({ message: "Stone_N.png on normal" });
  });

  it("says why a dropped image went nowhere when not exactly one slot misses its texture", async () => {
    const none = await openStone({ files: fakeHost().host, scene: withMissing([undefined]) });
    await none.store.dropOnView(none.session.assetId, [file("Stone.png")], { x: 0, y: 0 });
    expect(none.store.state.get().toast).toMatchObject({ message: "No texture is missing." });

    const two = await openStone({
      files: fakeHost().host,
      scene: withMissing([{ baseColor: "a.png" }, { baseColor: "b.png" }]),
    });
    await two.store.dropOnView(two.session.assetId, [file("Stone.png")], { x: 0, y: 0 });
    expect(two.store.state.get().toast).toMatchObject({
      message: "2 textures are missing. Drop on one in asset info.",
    });
    expect(two.client.calls.some((call) => call.name === "material.setTexture")).toBe(false);
  });

  it("refuses files that are neither models nor images", async () => {
    const { store, session } = await openStone({ files: fakeHost().host });
    await store.dropOnView(session.assetId, [file("notes.txt")], { x: 0, y: 0 });
    expect(store.state.get().toast).toMatchObject({ message: "Drop an FBX file or an image.", kind: "alert" });
  });
});

describe("textures", () => {
  it("chooses an image for a slot, takes a dropped one, and restores the file's own", async () => {
    const { host } = fakeHost({ image: [`${FOLDER}/Wood.png`] });
    const { client, store, session } = await openStone({ files: host });
    await store.chooseTexture(session.assetId, "Wood", "baseColor");
    await store.dropTexture(session.assetId, "Wood", "normal", [file("Wood.fbx"), file("Wood_N.png")]);
    await store.restoreTexture(session.assetId, "Wood", "baseColor");
    await flush();
    expect(callsOf(client, "material.setTexture")).toEqual([
      { assetId: session.assetId, material: "Wood", slot: "baseColor", file: `${FOLDER}/Wood.png` },
      { assetId: session.assetId, material: "Wood", slot: "normal", file: `${FOLDER}/Wood_N.png` },
      { assetId: session.assetId, material: "Wood", slot: "baseColor", file: null },
    ]);
  });

  it("ignores a cancelled dialog and refuses a drop without an image", async () => {
    const { client, store, session } = await openStone({ files: fakeHost().host });
    await store.chooseTexture(session.assetId, "Wood", "baseColor");
    await store.dropTexture(session.assetId, "Wood", "baseColor", [file("Wood.fbx")]);
    expect(client.calls.some((call) => call.name === "material.setTexture")).toBe(false);
    expect(store.state.get().toast).toMatchObject({ message: "Drop an image.", kind: "alert" });
  });
});
