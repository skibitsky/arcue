import type { FileRole, QueryOutput } from "@arcue/protocol";
import { ArcueError } from "@arcue/protocol";
import type { Clip, Material, SceneDescription } from "@arcue/scene";
import { fileNameOf } from "@arcue/scene";
import { describe, expect, it, vi } from "vitest";
import { STONE_RESONATOR_PATH } from "../../dev/sample-data";
import { flush, openStone } from "../test-helpers";
import type { FileHost, FileKind } from "./view-files";
import { besideModel, clipGroups, offersAnimation, sortDropped } from "./view-files";

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

const withMissing = (missing: Material["missingTextures"][]) => (scene: SceneDescription) => ({
  ...scene,
  materials: missing.map((entry, index) => material(`M${index}`, entry ? { missingTextures: entry } : {})),
});

/** What the core tells about a file: the role it takes without one, then the others it can take. */
function answer(role: FileRole, ...others: FileRole[]): QueryOutput<"composition.fileRoles"> {
  return { role, roles: [role, ...others] };
}

const file = (name: string) => new File(["x"], name);

/**
 * A host that copies files for the core, as the web host does: its dialog answers with `picked` and the files chosen
 * there, and it places dropped files beside the model by name.
 */
function fakeHost(picked: Partial<Record<FileKind, string[]>> = {}) {
  const opened: string[][] = [];
  const discarded: string[][] = [];
  const host: FileHost = {
    pick: async (kind) => {
      const paths = picked[kind] ?? [];
      return { paths, files: paths.map((path) => file(fileNameOf(path))) };
    },
    place: async (files, assetPath) => files.map((file) => besideModel(assetPath, file.name)),
    open: (files) => opened.push(files.map((file) => file.name)),
    discard: (files) => {
      discarded.push(files.map((file) => file.name));
    },
  };
  return { host, opened, discarded };
}

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
    const { host, discarded } = fakeHost({
      model: [`${FOLDER}/Shells.fbx`, `${FOLDER}/Shell.png`, `${FOLDER}/Turn.fbx`],
    });
    const { client, store, session } = await openStone({ files: host });
    await store.addFileToView(session.assetId);
    expect(callsOf(client, "composition.addFile")).toEqual([
      { assetId: session.assetId, file: `${FOLDER}/Shells.fbx` },
      { assetId: session.assetId, file: `${FOLDER}/Turn.fbx` },
    ]);
    expect(store.state.get().toast).toMatchObject({ message: "Added Turn.fbx", kind: "info" });
    expect(discarded).toEqual([]);
  });

  it("asks before adding a picked file that can also join as an animation file, and adds it as the answer says", async () => {
    const { host, discarded } = fakeHost({ model: [`${FOLDER}/Jacket.blend`, `${FOLDER}/Shells.fbx`] });
    const { client, store, session } = await openStone({
      files: host,
      roles: (path) => (path.endsWith("Jacket.blend") ? answer("set", "animation") : answer("set")),
    });
    await store.addFileToView(session.assetId);
    expect(store.state.get().dropPrompt).toMatchObject({ assetId: session.assetId, at: null });
    expect(callsOf(client, "composition.addFile")).toEqual([]);
    await store.answerDrop("animation");
    expect(callsOf(client, "composition.addFile")).toEqual([
      { assetId: session.assetId, file: `${FOLDER}/Jacket.blend`, role: "animation" },
      { assetId: session.assetId, file: `${FOLDER}/Shells.fbx`, role: "set" },
    ]);
    expect(discarded).toEqual([]);
  });

  it("discards the picked files when their question is dismissed, replaced or its tab closes", async () => {
    const { host, discarded } = fakeHost({ model: [`${FOLDER}/Jacket.blend`, `${FOLDER}/Shell.png`] });
    const { client, store, session } = await openStone({ files: host, roles: () => answer("set", "animation") });
    await store.addFileToView(session.assetId);
    store.dismissDrop();
    expect(store.state.get().dropPrompt).toBeNull();
    expect(discarded).toEqual([["Jacket.blend", "Shell.png"]]);

    await store.addFileToView(session.assetId);
    await store.dropOnView(session.assetId, [file("Crate.fbx")], { x: 0, y: 0 });
    expect(discarded).toEqual([
      ["Jacket.blend", "Shell.png"],
      ["Jacket.blend", "Shell.png"],
    ]);
    expect(store.state.get().dropPrompt?.models.map((model) => model.path)).toEqual([`${FOLDER}/Crate.fbx`]);

    await store.addFileToView(session.assetId);
    expect(discarded.at(-1)).toEqual(["Crate.fbx"]);
    await store.closeTab(session.assetId);
    expect(store.state.get().dropPrompt).toBeNull();
    expect(discarded).toHaveLength(4);
    expect(discarded.at(-1)).toEqual(["Jacket.blend", "Shell.png"]);
    expect(callsOf(client, "composition.addFile")).toEqual([]);
  });

  it("asks no host to discard picked files it reads where they are", async () => {
    const { host, discarded } = fakeHost();
    host.pick = async () => ({ paths: [`${FOLDER}/Jacket.blend`], files: [] });
    const { store, session } = await openStone({ files: host, roles: () => answer("set", "animation") });
    await store.addFileToView(session.assetId);
    expect(store.state.get().dropPrompt?.models.map((model) => model.path)).toEqual([`${FOLDER}/Jacket.blend`]);
    store.dismissDrop();
    expect(store.state.get().dropPrompt).toBeNull();
    expect(discarded).toEqual([]);
  });

  it("closes an open question before the dialog, and places picked files once its files are gone", async () => {
    const { host, discarded } = fakeHost({ model: [`${FOLDER}/Crate.fbx`] });
    const removal = Promise.withResolvers<void>();
    const discard = host.discard;
    host.discard = async (files) => {
      await discard?.(files);
      await removal.promise;
    };
    const pick = vi.spyOn(host, "pick");
    const { client, store, session } = await openStone({ files: host, roles: () => answer("set") });
    await store.dropOnView(session.assetId, [file("Crate.fbx")], { x: 0, y: 0 });
    const adding = store.addFileToView(session.assetId);
    await flush();
    expect(store.state.get().dropPrompt).toBeNull();
    expect(discarded).toEqual([["Crate.fbx"]]);
    expect(pick).not.toHaveBeenCalled();
    removal.resolve();
    await adding;
    expect(pick).toHaveBeenCalledOnce();
    expect(callsOf(client, "composition.addFile")).toEqual([{ assetId: session.assetId, file: `${FOLDER}/Crate.fbx` }]);
  });

  it("neither asks nor adds when the tab closes while the core reads a picked file", async () => {
    const { host, discarded } = fakeHost({ model: [`${FOLDER}/Jacket.blend`] });
    const reading = Promise.withResolvers<void>();
    const { client, store, session } = await openStone({ files: host, roles: () => answer("set", "animation") });
    const query = client.query.bind(client);
    vi.spyOn(client, "query").mockImplementation(async (name, input) => {
      if (name === "composition.fileRoles") await reading.promise;
      return query(name, input);
    });
    const adding = store.addFileToView(session.assetId);
    await flush();
    await store.closeTab(session.assetId);
    reading.resolve();
    await adding;
    expect(store.state.get().dropPrompt).toBeNull();
    expect(callsOf(client, "composition.addFile")).toEqual([]);
    expect(discarded).toEqual([["Jacket.blend"]]);
  });

  it("discards the picked files when a drop that was still being read asks next", async () => {
    const { host, discarded } = fakeHost({ model: [`${FOLDER}/Jacket.blend`] });
    const reading = Promise.withResolvers<void>();
    const { client, store, session } = await openStone({ files: host, roles: () => answer("set", "animation") });
    const query = client.query.bind(client);
    vi.spyOn(client, "query").mockImplementation(async (name, input) => {
      if (name === "composition.fileRoles" && JSON.stringify(input).includes("Crate.fbx")) await reading.promise;
      return query(name, input);
    });
    const dropping = store.dropOnView(session.assetId, [file("Crate.fbx")], { x: 0, y: 0 });
    await flush();
    await store.addFileToView(session.assetId);
    expect(store.state.get().dropPrompt?.models.map((model) => model.path)).toEqual([`${FOLDER}/Jacket.blend`]);
    reading.resolve();
    await dropping;
    expect(store.state.get().dropPrompt?.models.map((model) => model.path)).toEqual([`${FOLDER}/Crate.fbx`]);
    expect(discarded).toEqual([["Jacket.blend"]]);
    store.dismissDrop();
    expect(discarded).toEqual([["Jacket.blend"], ["Crate.fbx"]]);
  });

  it("discards the picked files when the core takes none of them, and keeps them when it takes one", async () => {
    const { host, discarded } = fakeHost({ model: [`${FOLDER}/Broken.blend`, `${FOLDER}/Shell.png`] });
    const { client, store, session } = await openStone({ files: host, roles: () => answer("set") });
    const execute = vi.spyOn(client, "execute");
    execute.mockRejectedValueOnce(new ArcueError("invalid-input", "Broken.blend has no meshes or clips."));
    await store.addFileToView(session.assetId);
    expect(store.state.get().toast).toMatchObject({ message: "Broken.blend has no meshes or clips.", kind: "alert" });
    expect(discarded).toEqual([["Broken.blend", "Shell.png"]]);

    await store.addFileToView(session.assetId);
    expect(callsOf(client, "composition.addFile")).toEqual([
      { assetId: session.assetId, file: `${FOLDER}/Broken.blend` },
    ]);
    expect(discarded).toHaveLength(1);
  });

  it("does nothing when the dialog is cancelled, and says so when no model was picked", async () => {
    const { client, store, session } = await openStone({ files: fakeHost().host });
    await store.addFileToView(session.assetId);
    expect(callsOf(client, "composition.addFile")).toEqual([]);
    expect(store.state.get().toast).toBeNull();

    const imageHost = fakeHost({ model: [`${FOLDER}/Shell.png`] });
    const images = await openStone({ files: imageHost.host });
    await images.store.addFileToView(images.session.assetId);
    expect(images.store.state.get().toast).toMatchObject({ message: "Choose an FBX or Blender file.", kind: "alert" });
    expect(imageHost.discarded).toEqual([["Shell.png"]]);
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
    const { client, store, session } = await openStone({ files: host, roles: () => answer("animation") });
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
      roles: (file) => (file.endsWith("Turn.fbx") ? answer("animation") : answer("set")),
    });
    const dropped = [file("Shells.fbx"), file("Turn.fbx"), file("Shell.png")];
    await store.dropOnView(session.assetId, dropped, { x: 10, y: 20 });
    expect(store.state.get().dropPrompt).toMatchObject({
      assetId: session.assetId,
      at: { x: 10, y: 20 },
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

  it("discards the dropped files when the core takes none of their models", async () => {
    const { host, discarded } = fakeHost();
    const animations = await openStone({ files: host, roles: () => answer("animation") });
    vi.spyOn(animations.client, "execute").mockRejectedValueOnce(
      new ArcueError("invalid-input", "Turn.fbx has no meshes or clips."),
    );
    await animations.store.dropOnView(animations.session.assetId, [file("Turn.fbx"), file("Turn.png")], {
      x: 0,
      y: 0,
    });
    expect(animations.store.state.get().toast).toMatchObject({ message: "Turn.fbx has no meshes or clips." });
    expect(discarded).toEqual([["Turn.fbx", "Turn.png"]]);

    const { client, store, session } = await openStone({ files: host, roles: () => answer("set") });
    const refuse = () => Promise.reject(new ArcueError("invalid-input", "Refused."));
    const execute = vi.spyOn(client, "execute").mockImplementationOnce(refuse).mockImplementationOnce(refuse);
    await store.dropOnView(session.assetId, [file("Shells.fbx"), file("Crate.fbx")], { x: 0, y: 0 });
    await store.answerDrop("view");
    expect(execute).toHaveBeenCalledTimes(2);
    expect(discarded).toEqual([
      ["Turn.fbx", "Turn.png"],
      ["Shells.fbx", "Crate.fbx"],
    ]);

    execute.mockImplementationOnce(refuse);
    await store.dropOnView(session.assetId, [file("Shells.fbx"), file("Crate.fbx")], { x: 0, y: 0 });
    await store.answerDrop("view");
    expect(callsOf(client, "composition.addFile")).toEqual([
      { assetId: session.assetId, file: `${FOLDER}/Crate.fbx`, role: "set" },
    ]);
    expect(discarded).toHaveLength(2);
  });

  it("discards an unanswered drop's files when another drop replaces its prompt", async () => {
    const { host, discarded } = fakeHost();
    const { store, session } = await openStone({ files: host, roles: () => answer("set") });
    await store.dropOnView(session.assetId, [file("Shells.fbx")], { x: 0, y: 0 });
    await store.dropOnView(session.assetId, [file("Crate.fbx")], { x: 0, y: 0 });
    expect(discarded).toEqual([["Shells.fbx"]]);
    expect(store.state.get().dropPrompt?.models.map((model) => model.path)).toEqual([`${FOLDER}/Crate.fbx`]);
  });

  it("discards the dropped files when their tab closes while the prompt is open", async () => {
    const { host, discarded } = fakeHost();
    const { store, session } = await openStone({ files: host, roles: () => answer("set") });
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
    const { store, session } = await openStone({ files: host, roles: () => answer("set") });
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
    const { store, session } = await openStone({ files: host, roles: () => answer("set") });
    const earlier = store.dropOnView(session.assetId, [file("Shells.fbx")], { x: 0, y: 0 });
    await flush();
    const latest = store.dropOnView(session.assetId, [file("Crate.fbx")], { x: 1, y: 1 });
    await flush();
    placement.resolve();
    await Promise.all([earlier, latest]);
    expect(store.state.get().dropPrompt?.models.map((model) => model.path)).toEqual([`${FOLDER}/Crate.fbx`]);
    expect(discarded).toEqual([["Shells.fbx"]]);
  });

  it("asks about a dropped animation file that keeps a copy of the model, and adds it in the role the core gives", async () => {
    const { client, store, session } = await openStone({
      files: fakeHost().host,
      roles: () => answer("animation", "set"),
    });
    await store.dropOnView(session.assetId, [file("StoneAnims.blend")], { x: 0, y: 0 });
    expect(store.state.get().dropPrompt?.models).toEqual([
      { path: `${FOLDER}/StoneAnims.blend`, role: "animation", roles: ["animation", "set"] },
    ]);
    expect(offersAnimation(store.state.get().dropPrompt?.models ?? [])).toBe(false);
    await store.answerDrop("view");
    expect(callsOf(client, "composition.addFile")).toEqual([
      { assetId: session.assetId, file: `${FOLDER}/StoneAnims.blend`, role: "animation" },
    ]);
  });

  it("offers to add a dropped file whose clips key the model's bones as an animation file", async () => {
    const { client, store, session } = await openStone({
      files: fakeHost().host,
      roles: (path) => (path.endsWith("Jacket.blend") ? answer("set", "animation") : answer("set")),
    });
    const dropped = [file("Jacket.blend"), file("Crate.fbx")];
    await store.dropOnView(session.assetId, dropped, { x: 0, y: 0 });
    expect(offersAnimation(store.state.get().dropPrompt?.models ?? [])).toBe(true);
    await store.answerDrop("animation");
    await store.dropOnView(session.assetId, dropped, { x: 0, y: 0 });
    await store.answerDrop("view");
    expect(callsOf(client, "composition.addFile")).toEqual([
      { assetId: session.assetId, file: `${FOLDER}/Jacket.blend`, role: "animation" },
      { assetId: session.assetId, file: `${FOLDER}/Crate.fbx`, role: "set" },
      { assetId: session.assetId, file: `${FOLDER}/Jacket.blend`, role: "set" },
      { assetId: session.assetId, file: `${FOLDER}/Crate.fbx`, role: "set" },
    ]);
  });

  it("asks when the core cannot tell how a dropped model joins, and then lets it pick the role", async () => {
    const { client, store, session } = await openStone({ files: fakeHost().host });
    await store.dropOnView(session.assetId, [file("Odd.fbx")], { x: 0, y: 0 });
    expect(store.state.get().dropPrompt?.models).toEqual([{ path: `${FOLDER}/Odd.fbx`, role: null, roles: [] }]);
    await store.answerDrop("view");
    expect(callsOf(client, "composition.addFile")).toEqual([{ assetId: session.assetId, file: `${FOLDER}/Odd.fbx` }]);
  });

  it("replaces a pending model drop when an image is dropped next", async () => {
    const { host, discarded } = fakeHost();
    const { store, session } = await openStone({
      files: host,
      roles: () => answer("set"),
      scene: withMissing([{ normal: "Stone_N.png" }]),
    });
    await store.dropOnView(session.assetId, [file("Shells.fbx")], { x: 0, y: 0 });
    await store.dropOnView(session.assetId, [file("Stone_N.png")], { x: 0, y: 0 });
    expect(store.state.get().dropPrompt).toBeNull();
    expect(discarded).toEqual([["Shells.fbx"]]);
  });

  it("puts a dropped image in the only missing slot", async () => {
    const { host, discarded } = fakeHost();
    const { client, store, session } = await openStone({
      files: host,
      scene: withMissing([undefined, { normal: "textures/Stone_N.png" }]),
    });
    await store.dropOnView(session.assetId, [file("notes.txt"), file("Stone_N.png")], { x: 0, y: 0 });
    expect(callsOf(client, "material.setTexture")).toEqual([
      { assetId: session.assetId, material: "M1", slot: "normal", file: `${FOLDER}/Stone_N.png` },
    ]);
    expect(store.state.get().toast).toMatchObject({ message: "Stone_N.png on normal" });
    expect(discarded).toEqual([]);
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
    expect(store.state.get().toast).toMatchObject({
      message: "Drop an FBX or Blender file, or an image.",
      kind: "alert",
    });
  });
});

describe("textures", () => {
  it("chooses an image for a slot, takes a dropped one, and restores the file's own", async () => {
    const { host, discarded } = fakeHost({ image: [`${FOLDER}/Wood.png`] });
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
    expect(discarded).toEqual([]);
  });

  it("discards a picked or dropped image the core refuses for a slot", async () => {
    const { host, discarded } = fakeHost({ image: [`${FOLDER}/Wood.png`] });
    const { client, store, session } = await openStone({
      files: host,
      scene: withMissing([{ normal: "Stone_N.png" }]),
    });
    const execute = client.execute.bind(client);
    const refused: unknown[] = [];
    vi.spyOn(client, "execute").mockImplementation(async (name, input) => {
      if (name === "material.setTexture") {
        refused.push(input);
        throw new ArcueError("invalid-input", "Refused.");
      }
      return execute(name, input);
    });
    const refusal = { message: "Refused.", kind: "alert" };
    await store.chooseTexture(session.assetId, "Wood", "baseColor");
    expect(store.state.get().toast).toMatchObject(refusal);
    expect(discarded).toEqual([["Wood.png"]]);

    store.state.patch({ toast: null });
    await store.dropTexture(session.assetId, "Wood", "normal", [file("Wood.fbx"), file("Wood_N.png")]);
    expect(store.state.get().toast).toMatchObject(refusal);
    expect(discarded).toEqual([["Wood.png"], ["Wood_N.png"]]);

    store.state.patch({ toast: null });
    await store.dropOnView(session.assetId, [file("Stone_N.png")], { x: 0, y: 0 });
    expect(store.state.get().toast).toMatchObject(refusal);
    expect(discarded).toEqual([["Wood.png"], ["Wood_N.png"], ["Stone_N.png"]]);
    expect(refused).toEqual([
      { assetId: session.assetId, material: "Wood", slot: "baseColor", file: `${FOLDER}/Wood.png` },
      { assetId: session.assetId, material: "Wood", slot: "normal", file: `${FOLDER}/Wood_N.png` },
      { assetId: session.assetId, material: "M0", slot: "normal", file: `${FOLDER}/Stone_N.png` },
    ]);
  });

  it("discards a picked file that is not an image", async () => {
    const { host, discarded } = fakeHost({ image: [`${FOLDER}/Wood.fbx`] });
    const { client, store, session } = await openStone({ files: host });
    await store.chooseTexture(session.assetId, "Wood", "baseColor");
    expect(callsOf(client, "material.setTexture")).toEqual([]);
    expect(discarded).toEqual([["Wood.fbx"]]);
  });

  it("ignores a cancelled dialog and refuses a drop without an image", async () => {
    const { client, store, session } = await openStone({ files: fakeHost().host });
    await store.chooseTexture(session.assetId, "Wood", "baseColor");
    await store.dropTexture(session.assetId, "Wood", "baseColor", [file("Wood.fbx")]);
    expect(client.calls.some((call) => call.name === "material.setTexture")).toBe(false);
    expect(store.state.get().toast).toMatchObject({ message: "Drop an image.", kind: "alert" });
  });
});

describe("relinking a model that is gone", () => {
  const STRIKER = `${FOLDER}/StoneStriker.fbx`;

  it("points the asset at the picked model and keeps the picked files", async () => {
    const { host, discarded } = fakeHost({ model: [STRIKER, `${FOLDER}/Striker.png`] });
    const { client, store, session } = await openStone({ files: host });
    client.simulateMissing(session.assetId);
    await store.chooseModel(session.assetId);
    expect(callsOf(client, "asset.relink")).toEqual([{ assetId: session.assetId, path: STRIKER }]);
    expect(discarded).toEqual([]);
  });

  it("discards the picked files when the core refuses the model", async () => {
    const { host, discarded } = fakeHost({ model: [STRIKER, `${FOLDER}/Striker.png`] });
    const { store, session } = await openStone({ files: host });
    await store.chooseModel(session.assetId);
    expect(store.state.get().toast).toMatchObject({ message: "StoneResonator.fbx still exists.", kind: "alert" });
    expect(discarded).toEqual([["StoneStriker.fbx", "Striker.png"]]);
  });

  it("discards the picked files when none is a model", async () => {
    const { host, discarded } = fakeHost({ model: [`${FOLDER}/Striker.png`] });
    const { client, store, session } = await openStone({ files: host });
    client.simulateMissing(session.assetId);
    await store.chooseModel(session.assetId);
    expect(callsOf(client, "asset.relink")).toEqual([]);
    expect(discarded).toEqual([["Striker.png"]]);
  });
});
