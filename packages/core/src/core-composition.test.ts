import type { CommandInput, CompositionFile } from "@arcue/protocol";
import type { SceneDescription } from "@arcue/scene";
import { describe, expect, it } from "vitest";
import type { FakeAssetSpec, TestCore } from "./test-support";
import { camera, fakeAsset, flush, openAsset, pinContext, png, readJson, startTestCore } from "./test-support";

const FOLDER = "/work/game/Assets/Bug";
const MODEL = `${FOLDER}/Bug.fbx`;
const SIDECAR = `${FOLDER}/Bug.arcue`;
const SHELLS = `${FOLDER}/BugShells.fbx`;
const TURN = `${FOLDER}/Anim/BugTurn.fbx`;
const TEXTURE = "/work/game/Assets/Textures/Shell.png";
const REVIEW = "/work/game/.arcue/reviews/Assets/Bug/Bug.fbx/review.json";

const bug: FakeAssetSpec = {
  bones: [
    { name: "Body", at: [0, 1, 0] },
    { name: "Leg", parent: "Body" },
  ],
  meshes: [{ name: "Legs", grid: 3, skin: ["Body", "Leg"] }],
  clips: [{ name: "Armature|Walk", frames: 31, bones: ["Body", "Leg"] }],
};

const shells: FakeAssetSpec = {
  meshes: [
    { name: "ShellA", grid: 2, offset: [0, 1, 0], material: 0 },
    { name: "ShellB", grid: 2, offset: [0, 1.2, 0], material: 0 },
  ],
  materials: ["Shell"],
};

const turn: FakeAssetSpec = {
  bones: [{ name: "Body" }, { name: "Tail", parent: "Body" }],
  meshes: [],
  clips: [{ name: "Armature|Turn", frames: 21, bones: ["Body", "Tail"] }],
};

const composition: CompositionFile = {
  version: 1,
  model: "Bug.fbx",
  animations: ["Anim/BugTurn.fbx"],
  attach: [
    { file: "BugShells.fbx", node: "ShellA", bone: "Body" },
    { file: "BugShells.fbx", node: "ShellB", bone: "Body" },
  ],
  materials: { Shell: { baseColor: "../Textures/Shell.png" } },
  hidden: ["BugShells.fbx//Hero/ShellB"],
};

const pngBytes = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 7);

function bugFiles(overrides: Record<string, string | Uint8Array | null> = {}): Record<string, string | Uint8Array> {
  const files: Record<string, string | Uint8Array | null> = {
    "/work/game/.git/HEAD": "ref: refs/heads/main",
    [MODEL]: fakeAsset(bug),
    [SIDECAR]: JSON.stringify(composition),
    [SHELLS]: fakeAsset(shells),
    [TURN]: fakeAsset(turn),
    [TEXTURE]: pngBytes,
    ...overrides,
  };
  return Object.fromEntries(
    Object.entries(files).flatMap(([path, data]) => (data === null ? [] : [[path, data] as const])),
  );
}

async function setup(overrides: Record<string, string | Uint8Array | null> = {}, path = MODEL) {
  const test = await startTestCore(bugFiles(overrides));
  return { ...test, assetId: await openAsset(test, path) };
}

async function sceneOf(test: TestCore, assetId: string): Promise<{ version: string; scene: SceneDescription }> {
  return test.core.client.query("scene.get", { assetId });
}

function nodePath(scene: SceneDescription, index: number): string | undefined {
  return scene.nodes[index]?.path;
}

/** Lets a watched change settle and reload, as the core's stability check needs two quiet checks. */
async function settle(test: TestCore): Promise<void> {
  for (let check = 0; check < 3; check++) {
    await flush();
    await test.core.idle();
    test.clock.advance(300);
  }
  await flush();
  await test.core.idle();
}

describe("opening a composition", () => {
  it("applies the composition file beside the model and loads the files it names", async () => {
    const test = await setup();
    const { assetId } = test;
    const { assets } = await test.core.client.query("asset.list", {});
    expect(assets).toMatchObject([{ path: MODEL, status: "ready", composition: SIDECAR, error: null }]);
    const { scene } = await sceneOf(test, assetId);

    expect(scene.parts.map((part) => [part.id, part.hiddenByDefault ?? false])).toEqual([
      ["Hero/Legs", false],
      ["BugShells.fbx//Hero/ShellA", false],
      ["BugShells.fbx//Hero/ShellB", true],
    ]);
    const shell = scene.nodes.find((node) => node.path === "BugShells.fbx//Hero/ShellA");
    expect(shell && nodePath(scene, shell.parent)).toBe("Hero/Body");

    expect(scene.clips.map((clip) => [clip.name, clip.file])).toEqual([
      ["Armature|Walk", undefined],
      ["Armature|Turn", "Anim/BugTurn.fbx"],
    ]);
    expect(scene.clips[1]?.tracks.map((track) => nodePath(scene, track.node))).toEqual(["Hero/Body"]);
    expect(scene.source.warnings).toEqual([
      {
        code: "animation-bones-missing",
        message: "Turn animates bones the model does not have: Tail.",
        subject: "Armature|Turn",
        file: "Anim/BugTurn.fbx",
      },
    ]);

    const material = scene.materials.find((entry) => entry.name === "Shell");
    const texture = scene.textures[material?.baseColorTexture?.texture ?? -1];
    expect(texture).toMatchObject({ name: "Shell", mimeType: "image/png" });

    const review = await test.core.client.query("review.get", { assetId });
    expect(review.asset.path).toBe("Assets/Bug/Bug.fbx");
    expect(review.versions[0]?.files?.map((file) => file.file)).toEqual([
      "Bug.fbx",
      "Bug.arcue",
      "Anim/BugTurn.fbx",
      "BugShells.fbx",
      "../Textures/Shell.png",
    ]);
    const { parts } = await test.core.client.query("scene.parts", { assetId });
    expect(parts.map((part) => part.levels[0]?.meshes)).toEqual([
      ["Hero/Legs"],
      ["BugShells.fbx//Hero/ShellA"],
      ["BugShells.fbx//Hero/ShellB"],
    ]);
  });

  it("opens the model when the composition file is opened, as the same asset with the same review", async () => {
    const test = await setup({}, SIDECAR);
    const again = await openAsset(test, MODEL);
    expect(again).toBe(test.assetId);
    const { assets } = await test.core.client.query("asset.list", {});
    expect(assets).toMatchObject([{ path: MODEL, name: "Bug.fbx", composition: SIDECAR }]);
  });

  it("refuses a composition file that is broken or names a model outside its workspace", async () => {
    const test = await startTestCore(
      bugFiles({
        [`${FOLDER}/Broken.arcue`]: "{ not json",
        [`${FOLDER}/Away.arcue`]: JSON.stringify({ version: 1, model: "../../../../elsewhere/Bug.fbx" }),
      }),
    );
    await expect(test.window.client.execute("asset.open", { path: `${FOLDER}/Broken.arcue` })).rejects.toMatchObject({
      code: "invalid-input",
    });
    await expect(test.window.client.execute("asset.open", { path: `${FOLDER}/Away.arcue` })).rejects.toMatchObject({
      code: "invalid-input",
    });
  });

  it("adds animation files named after the model with an @ and leaves other files alone", async () => {
    const test = await setup({
      [SIDECAR]: null,
      [`${FOLDER}/Bug@Idle.fbx`]: fakeAsset({
        ...turn,
        clips: [{ name: "Armature|Idle", frames: 11, bones: ["Body"] }],
      }),
      [`${FOLDER}/Bug@Notes.txt`]: "notes",
      [`${FOLDER}/Other@Run.fbx`]: fakeAsset(turn),
    });
    const { scene } = await sceneOf(test, test.assetId);
    expect(scene.clips.map((clip) => [clip.name, clip.file])).toEqual([
      ["Armature|Walk", undefined],
      ["Armature|Idle", "Bug@Idle.fbx"],
    ]);
    expect(scene.source.warnings).toEqual([]);
    const { assets } = await test.core.client.query("asset.list", {});
    expect(assets[0]?.composition).toBeUndefined();
  });

  it("loads what it can when a member or a texture is missing, and says what is missing", async () => {
    const test = await setup({ [SHELLS]: null, [TEXTURE]: null });
    const { scene } = await sceneOf(test, test.assetId);
    expect(scene.parts.map((part) => part.id)).toEqual(["Hero/Legs"]);
    expect(scene.source.warnings.map((warning) => [warning.code, warning.subject, warning.file])).toEqual([
      ["file-not-found", "BugShells.fbx", "BugShells.fbx"],
      ["missing-texture", "../Textures/Shell.png", "Bug.arcue"],
      ["animation-bones-missing", "Armature|Turn", "Anim/BugTurn.fbx"],
      ["material-not-found", "Shell", undefined],
    ]);
  });

  it("ignores a composition file that names another model", async () => {
    const test = await setup({ [SIDECAR]: JSON.stringify({ ...composition, model: "Other.fbx" }) });
    const { scene } = await sceneOf(test, test.assetId);
    expect(scene.parts.map((part) => part.id)).toEqual(["Hero/Legs"]);
    const { assets } = await test.core.client.query("asset.list", {});
    expect(assets[0]?.composition).toBeUndefined();
  });
});

describe("reloading a composition", () => {
  it("reloads when a member changes, parsing only that file and keeping the view state", async () => {
    const test = await setup();
    const { assetId } = test;
    const before = await sceneOf(test, assetId);
    const state = {
      camera,
      clip: "Armature|Turn",
      frame: 7,
      range: null,
      display: { mode: "clay" as const, skeleton: false },
      parts: { hidden: [], shown: ["BugShells.fbx//Hero/ShellB"], isolated: null, lod: 0 },
    };
    await test.window.client.execute("view.reportState", { assetId, state });
    const parsedBefore = test.platform.parsed.length;

    await test.platform.writeFile(
      SHELLS,
      fakeAsset({ ...shells, meshes: [{ ...shells.meshes[0], name: "ShellA", grid: 3 }] }),
    );
    await settle(test);

    const after = await sceneOf(test, assetId);
    expect(after.version).not.toBe(before.version);
    expect(after.scene.parts.map((part) => part.id)).toEqual(["Hero/Legs", "BugShells.fbx//Hero/ShellA"]);
    expect(test.platform.parsed.slice(parsedBefore)).toEqual(["BugShells.fbx"]);
    await expect(test.core.client.query("viewState.get", { assetId })).resolves.toEqual(state);
    const review = await test.core.client.query("review.get", { assetId });
    const [first, second] = review.versions.map(
      (version) => new Map(version.files?.map((file) => [file.file, file.id])),
    );
    expect(second?.get("Bug.fbx")).toBe(first?.get("Bug.fbx"));
    expect(second?.get("BugShells.fbx")).not.toBe(first?.get("BugShells.fbx"));
  });

  it("reloads when the composition file changes or goes away", async () => {
    const test = await setup();
    const { assetId } = test;
    await test.platform.writeFile(SIDECAR, JSON.stringify({ ...composition, hidden: [] }));
    await settle(test);
    let { scene } = await sceneOf(test, assetId);
    expect(scene.parts.some((part) => part.hiddenByDefault)).toBe(false);

    await test.platform.remove(SIDECAR);
    await settle(test);
    ({ scene } = await sceneOf(test, assetId));
    expect(scene.parts.map((part) => part.id)).toEqual(["Hero/Legs"]);
    const { assets } = await test.core.client.query("asset.list", {});
    expect(assets[0]).toMatchObject({ status: "ready" });
    expect(assets[0]?.composition).toBeUndefined();
  });

  it("keeps the previous version while the composition file is broken", async () => {
    const test = await setup();
    const { version } = await sceneOf(test, test.assetId);
    await test.platform.writeFile(SIDECAR, "{ half written");
    await settle(test);
    const { assets } = await test.core.client.query("asset.list", {});
    expect(assets[0]).toMatchObject({ status: "failed", version });
    expect(assets[0]?.error).toMatch(/Bug\.arcue is not valid JSON/);
    await expect(sceneOf(test, test.assetId)).resolves.toMatchObject({ version });

    await test.platform.writeFile(SIDECAR, JSON.stringify(composition));
    await settle(test);
    await expect(test.core.client.query("asset.list", {})).resolves.toMatchObject({
      assets: [{ status: "ready", version, error: null }],
    });
  });

  it("re-anchors a comment within its own file, never onto another file's mesh", async () => {
    const test = await setup({
      [MODEL]: fakeAsset({ ...bug, meshes: [{ name: "Legs", grid: 2, offset: [0, 1, 0], skin: ["Body"] }] }),
    });
    const { assetId } = test;
    const { version } = await sceneOf(test, assetId);
    const comment = (mesh: string): CommandInput<"comment.create"> => ({
      assetId,
      text: `On ${mesh}.`,
      version,
      time: { kind: "none" },
      target: { kind: "surface", mesh, vertices: [0, 1, 2], weights: [0.4, 0.3, 0.3] },
      camera,
      context: pinContext,
      screenshot: png,
    });
    await test.window.client.execute("comment.create", comment("BugShells.fbx//Hero/ShellA"));
    await test.window.client.execute("comment.create", comment("Hero/Legs"));

    const moved = {
      ...shells,
      meshes: [{ name: "ShellC", grid: 2, offset: [0, 1, 0.01] as [number, number, number] }],
    };
    await test.platform.writeFile(SHELLS, fakeAsset(moved));
    await test.platform.writeFile(
      SIDECAR,
      JSON.stringify({ version: 1, model: "Bug.fbx", attach: [{ file: "BugShells.fbx" }] }),
    );
    await settle(test);

    const review = await test.core.client.query("review.get", { assetId });
    const latest = review.versions.at(-1)?.id;
    expect(review.comments.map((entry) => [entry.target?.mesh, entry.anchorState, entry.anchorVersion])).toEqual([
      ["BugShells.fbx//Hero/ShellC", "moved", latest],
      ["Hero/Legs", "exact", latest],
    ]);
  });
});

describe("composition commands", () => {
  async function plain(): Promise<TestCore & { assetId: string }> {
    return setup({ [SIDECAR]: null });
  }

  async function sidecar(test: TestCore): Promise<unknown> {
    return readJson(test.platform, SIDECAR);
  }

  it("creates the composition file on the first edit, writes it atomically and reloads", async () => {
    const test = await plain();
    const { assetId } = test;
    await expect(
      test.window.client.execute("composition.addFile", {
        assetId,
        file: "BugShells.fbx",
        role: "attach",
        node: "ShellA",
        bone: "Body",
      }),
    ).resolves.toEqual({ path: SIDECAR });
    expect(await sidecar(test)).toEqual({
      version: 1,
      model: "Bug.fbx",
      attach: [{ file: "BugShells.fbx", node: "ShellA", bone: "Body" }],
    });
    expect(test.platform.writes.filter((write) => write.path === SIDECAR)).toEqual([{ path: SIDECAR, atomic: true }]);
    const { scene } = await sceneOf(test, assetId);
    expect(scene.parts.map((part) => part.id)).toEqual(["Hero/Legs", "BugShells.fbx//Hero/ShellA"]);
    const { assets } = await test.core.client.query("asset.list", {});
    expect(assets[0]?.composition).toBe(SIDECAR);
  });

  it("adds animation and set files, and replaces an attached node's entry when it is added again", async () => {
    const test = await plain();
    const { assetId } = test;
    const add = (input: Omit<CommandInput<"composition.addFile">, "assetId">) =>
      test.window.client.execute("composition.addFile", { assetId, ...input });
    await add({ file: TURN, role: "animation" });
    await add({ file: "Anim/BugTurn.fbx", role: "animation" });
    await add({ file: "BugShells.fbx", role: "attach", node: "ShellA", bone: "Body" });
    await add({ file: "./BugShells.fbx", role: "attach", node: "ShellA", bone: "Leg" });
    await add({ file: "BugShells.fbx", role: "set", node: "ShellB" });
    expect(await sidecar(test)).toEqual({
      version: 1,
      model: "Bug.fbx",
      animations: ["Anim/BugTurn.fbx"],
      attach: [
        { file: "BugShells.fbx", node: "ShellA", bone: "Leg" },
        { file: "BugShells.fbx", node: "ShellB" },
      ],
    });
    const { scene } = await sceneOf(test, assetId);
    expect(scene.clips.map((clip) => clip.name)).toEqual(["Armature|Walk", "Armature|Turn"]);
  });

  it("refuses files it cannot load and bones the model lacks, without creating a composition file", async () => {
    const test = await plain();
    const add = (input: Omit<CommandInput<"composition.addFile">, "assetId">) =>
      test.window.client.execute("composition.addFile", { assetId: test.assetId, ...input });
    await expect(add({ file: "BugShells.fbx", role: "attach", bone: "Wing" })).rejects.toMatchObject({
      code: "invalid-input",
    });
    await expect(add({ file: "/elsewhere/Shells.fbx", role: "set" })).rejects.toMatchObject({ code: "invalid-input" });
    await expect(add({ file: "../Textures/Shell.png", role: "set" })).rejects.toMatchObject({ code: "invalid-input" });
    await expect(add({ file: "Missing.fbx", role: "set" })).rejects.toMatchObject({ code: "not-found" });
    await expect(add({ file: "Bug.fbx", role: "set" })).rejects.toMatchObject({ code: "invalid-input" });
    await expect(test.platform.exists(SIDECAR)).resolves.toBe(false);
  });

  it("removes a file with its entries and hidden parts, but not a file that joins by its name", async () => {
    const test = await setup({ [`${FOLDER}/Bug@Idle.fbx`]: fakeAsset(turn) });
    const remove = (file: string) =>
      test.window.client.execute("composition.removeFile", { assetId: test.assetId, file });
    await remove("BugShells.fbx");
    expect(await sidecar(test)).toEqual({
      version: 1,
      model: "Bug.fbx",
      animations: ["Anim/BugTurn.fbx"],
      materials: { Shell: { baseColor: "../Textures/Shell.png" } },
    });
    await expect(remove("Bug@Idle.fbx")).rejects.toMatchObject({ code: "invalid-input" });
    await expect(remove("BugShells.fbx")).rejects.toMatchObject({ code: "not-found" });
    const { scene } = await sceneOf(test, test.assetId);
    expect(scene.parts.map((part) => part.id)).toEqual(["Hero/Legs"]);
  });

  it("sets and clears a material's texture", async () => {
    const test = await setup();
    const set = (input: Omit<CommandInput<"material.setTexture">, "assetId">) =>
      test.window.client.execute("material.setTexture", { assetId: test.assetId, ...input });
    await set({ material: "Shell", slot: "normal", file: "/work/game/Assets/Textures/Shell.png" });
    expect(await sidecar(test)).toMatchObject({
      materials: { Shell: { baseColor: "../Textures/Shell.png", normal: "../Textures/Shell.png" } },
    });
    const { scene } = await sceneOf(test, test.assetId);
    expect(scene.materials.find((material) => material.name === "Shell")?.normalTexture).not.toBeNull();

    await set({ material: "Shell", slot: "normal", file: null });
    await set({ material: "Shell", slot: "baseColor", file: null });
    expect(await sidecar(test)).not.toHaveProperty("materials");
    await expect(set({ material: "Glass", slot: "baseColor", file: "../Textures/Shell.png" })).rejects.toMatchObject({
      code: "not-found",
    });
    await expect(set({ material: "Shell", slot: "baseColor", file: "BugShells.fbx" })).rejects.toMatchObject({
      code: "invalid-input",
    });
  });

  it("never overwrites a composition file it cannot read", async () => {
    const test = await setup();
    await test.platform.writeFile(SIDECAR, "{ broken");
    await expect(
      test.window.client.execute("composition.addFile", { assetId: test.assetId, file: TURN, role: "animation" }),
    ).rejects.toMatchObject({ code: "conflict" });
    await expect(test.platform.readText(SIDECAR)).resolves.toBe("{ broken");
    expect(await readJson(test.platform, REVIEW)).toMatchObject({ asset: { path: "Assets/Bug/Bug.fbx" } });
  });
});
