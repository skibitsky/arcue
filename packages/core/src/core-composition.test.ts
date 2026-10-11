import type { CommandInput, CompositionFile } from "@arcue/protocol";
import type { SceneDescription } from "@arcue/scene";
import { importWarning } from "@arcue/scene";
import { describe, expect, it } from "vitest";
import type { FakeAssetSpec, TestCore } from "./test-support";
import {
  camera,
  fakeAsset,
  flush,
  looseComment,
  openAsset,
  pinContext,
  png,
  readJson,
  startTestCore,
} from "./test-support";

const FOLDER = "/work/game/Assets/Bug";
const MODEL = `${FOLDER}/Bug.fbx`;
const SHELLS = `${FOLDER}/BugShells.fbx`;
const TURN = `${FOLDER}/Anim/BugTurn.fbx`;
const TEXTURE = "/work/game/Assets/Textures/Shell.png";
const REVIEW_FOLDER = "/work/game/.arcue/reviews/Assets/Bug/Bug.fbx";
const COMPOSITION = `${REVIEW_FOLDER}/composition.json`;
const REVIEW = `${REVIEW_FOLDER}/review.json`;

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
    [COMPOSITION]: JSON.stringify(composition),
    [SHELLS]: fakeAsset(shells),
    [TURN]: fakeAsset(turn),
    [TEXTURE]: pngBytes,
    ...overrides,
  };
  return Object.fromEntries(
    Object.entries(files).flatMap(([path, data]) => (data === null ? [] : [[path, data] as const])),
  );
}

async function setup(overrides: Record<string, string | Uint8Array | null> = {}) {
  const test = await startTestCore(bugFiles(overrides));
  return { ...test, assetId: await openAsset(test, MODEL) };
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
  it("applies the composition file in the model's review folder and loads the files it names", async () => {
    const test = await setup();
    const { assetId } = test;
    const { assets } = await test.core.client.query("asset.list", {});
    expect(assets).toMatchObject([{ path: MODEL, status: "ready", composition: COMPOSITION, error: null }]);
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
      ["Anim/BugTurn.fbx//Armature|Turn", "Anim/BugTurn.fbx"],
    ]);
    expect(scene.clips[1]?.tracks.map((track) => nodePath(scene, track.node))).toEqual(["Hero/Body"]);
    expect(scene.source.warnings).toEqual([
      {
        code: "animation-bones-missing",
        severity: "warning",
        subject: { kind: "clip", name: "Armature|Turn" },
        message: "Missing bones: Turn",
        file: "Anim/BugTurn.fbx",
        detail: "Bones the model lacks: Tail",
      },
    ]);

    const material = scene.materials.find((entry) => entry.name === "Shell");
    const texture = scene.textures[material?.baseColorTexture?.texture ?? -1];
    expect(texture).toMatchObject({ name: "Shell", mimeType: "image/png" });

    const review = await test.core.client.query("review.get", { assetId });
    expect(review.asset.path).toBe("Assets/Bug/Bug.fbx");
    expect(review.versions[0]?.files?.map((file) => file.file)).toEqual([
      "Bug.fbx",
      "composition.json",
      "Anim/BugTurn.fbx",
      "BugShells.fbx",
      "../Textures/Shell.png",
    ]);
    const { parts } = await test.core.client.query("scene.parts", { assetId });
    expect(parts.map((part) => [part.levels[0]?.meshes, part.shownByDefault])).toEqual([
      [["Hero/Legs"], true],
      [["BugShells.fbx//Hero/ShellA"], true],
      [["BugShells.fbx//Hero/ShellB"], false],
    ]);
  });

  it("ignores a composition file beside the model", async () => {
    const test = await setup({
      [COMPOSITION]: null,
      [`${FOLDER}/Bug.arcue`]: JSON.stringify({ version: 1, attach: [{ file: "BugShells.fbx" }] }),
    });
    const { scene } = await sceneOf(test, test.assetId);
    expect(scene.parts.map((part) => part.id)).toEqual(["Hero/Legs"]);
    const { assets } = await test.core.client.query("asset.list", {});
    expect(assets[0]?.composition).toBeUndefined();
  });

  it("names the other files in a copied prompt relative to the model's folder, without the composition file", async () => {
    const test = await setup();
    const { version } = await sceneOf(test, test.assetId);
    await test.window.client.execute("comment.create", looseComment(test.assetId, "The legs are too thin.", version));
    const { prompt } = await test.window.client.execute("round.copy", { assetId: test.assetId });
    expect(prompt).toContain(
      "Also loaded, relative to the model's folder: Anim/BugTurn.fbx, BugShells.fbx, ../Textures/Shell.png.",
    );
    expect(prompt).not.toContain("composition.json");
  });

  it("adds animation files named after the model with an @ and leaves other files alone", async () => {
    const test = await setup({
      [COMPOSITION]: null,
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
      ["Bug@Idle.fbx//Armature|Idle", "Bug@Idle.fbx"],
    ]);
    expect(scene.source.warnings).toEqual([]);
    const { assets } = await test.core.client.query("asset.list", {});
    expect(assets[0]?.composition).toBeUndefined();
  });

  it("loads what it can when a member or a texture is missing, and says what is missing", async () => {
    const test = await setup({ [SHELLS]: null, [TEXTURE]: null });
    const { scene } = await sceneOf(test, test.assetId);
    expect(scene.parts.map((part) => part.id)).toEqual(["Hero/Legs"]);
    expect(scene.source.warnings.map((warning) => [warning.code, warning.subject.name, warning.file])).toEqual([
      ["file-not-found", "BugShells.fbx", "BugShells.fbx"],
      ["texture-not-found", "Shell.png", "composition.json"],
      ["animation-bones-missing", "Armature|Turn", "Anim/BugTurn.fbx"],
      ["material-not-found", "Shell", undefined],
    ]);
  });

  it("finds an override texture that moved, as an importer finds a stale texture path", async () => {
    const moved = `${FOLDER}/Textures/shell.PNG`;
    const test = await setup({ [TEXTURE]: null, [moved]: pngBytes });
    const { scene } = await sceneOf(test, test.assetId);
    const material = scene.materials.find((entry) => entry.name === "Shell");
    expect(scene.textures[material?.baseColorTexture?.texture ?? -1]).toMatchObject({
      name: "shell",
      storedPath: "../Textures/Shell.png",
      foundPath: "Textures/shell.PNG",
    });
    expect(scene.source.warnings.map((warning) => warning.code)).toEqual(["animation-bones-missing"]);
    const review = await test.core.client.query("review.get", { assetId: test.assetId });
    expect(review.versions[0]?.files?.map((file) => file.file)).toContain("Textures/shell.PNG");
  });
});

describe("comments on the files of a composition", () => {
  it("keeps a comment on a file the version does not load as it was, until the file loads again", async () => {
    const test = await setup();
    const { assetId } = test;
    const { version } = await sceneOf(test, assetId);
    await test.window.client.execute("comment.create", {
      assetId,
      text: "Round the shell's rim.",
      version,
      time: { kind: "none" },
      target: { kind: "surface", mesh: "BugShells.fbx//Hero/ShellA", vertices: [0, 1, 2], weights: [0.4, 0.3, 0.3] },
      camera,
      context: pinContext,
      screenshot: png,
    });
    await test.platform.writeFile(COMPOSITION, JSON.stringify({ ...composition, attach: [], hidden: [] }));
    await settle(test);
    let review = await test.core.client.query("review.get", { assetId });
    expect(review.versions).toHaveLength(2);
    expect(review.comments[0]).toMatchObject({ anchorState: "exact", anchorVersion: version });

    await test.platform.writeFile(COMPOSITION, JSON.stringify({ ...composition, hidden: [] }));
    await settle(test);
    review = await test.core.client.query("review.get", { assetId });
    const latest = review.versions.at(-1)?.id;
    expect(latest).not.toBe(version);
    expect(review.comments[0]).toMatchObject({ anchorState: "exact", anchorVersion: latest });
  });
});

describe("a composition outside a git repository", () => {
  const models = "/art/Models";
  const outside = `/app-data/reviews/art/Models/Bug.fbx/composition.json`;
  const files = {
    [`${models}/Bug.fbx`]: fakeAsset(bug),
    [`${models}/BugShells.fbx`]: fakeAsset(shells),
    [`${models}/Spare.fbx`]: fakeAsset(shells),
    [`${models}/Textures/Shell.png`]: pngBytes,
    "/art/Props/Rock.fbx": fakeAsset(shells),
    [outside]: JSON.stringify({
      version: 1,
      attach: [{ file: "BugShells.fbx", node: "ShellA", bone: "Body" }, { file: "../Props/Rock.fbx" }],
      materials: { Shell: { baseColor: "Textures/Shell.png" } },
    }),
  };

  it("keeps the file in the app data folder, and loads, edits and inspects files of the model's folder only", async () => {
    const test = await startTestCore(files);
    const assetId = await openAsset(test, `${models}/Bug.fbx`);
    const { scene } = await sceneOf(test, assetId);
    expect(scene.parts.map((part) => part.id)).toEqual(["Hero/Legs", "BugShells.fbx//Hero/ShellA"]);
    expect(scene.source.warnings.map((warning) => warning.message)).toEqual([
      "File outside the workspace: ../Props/Rock.fbx",
    ]);
    const material = scene.materials.find((entry) => entry.name === "Shell");
    expect(material?.textureOverrides?.baseColor?.found).toBe(true);

    const add = (file: string) => test.window.client.execute("composition.addFile", { assetId, file, role: "set" });
    await expect(add("Spare.fbx")).resolves.toEqual({ path: outside, role: "set" });
    await expect(add("../Props/Rock.fbx")).rejects.toMatchObject({ code: "invalid-input" });
    expect(await readJson(test.platform, outside)).toMatchObject({
      attach: [
        { file: "BugShells.fbx", node: "ShellA", bone: "Body" },
        { file: "../Props/Rock.fbx" },
        { file: "Spare.fbx" },
      ],
    });
    expect(test.platform.writes.filter((write) => write.path.startsWith("/art/"))).toEqual([]);

    const inspection = await test.core.client.query("asset.inspect", { path: `${models}/Bug.fbx` });
    expect(inspection.composition).toBe(outside);
    expect(inspection.members.map((member) => [member.file, member.found])).toEqual([
      ["BugShells.fbx", true],
      ["../Props/Rock.fbx", false],
      ["Spare.fbx", true],
      ["Textures/Shell.png", true],
    ]);
  });
});

describe("a composition file that cannot be read", () => {
  it("opens the model alone with a warning that names the file, and applies the file once it is fixed", async () => {
    for (const broken of ["", "{ not json"]) {
      const test = await setup({ [COMPOSITION]: broken });
      const { assets } = await test.core.client.query("asset.list", {});
      expect(assets).toMatchObject([{ status: "ready", error: null }]);
      expect(assets[0]?.composition).toBeUndefined();
      const { scene } = await sceneOf(test, test.assetId);
      expect(scene.parts.map((part) => part.id)).toEqual(["Hero/Legs"]);
      const { warnings } = await test.core.client.query("warning.list", { assetId: test.assetId });
      expect(warnings).toEqual([
        expect.objectContaining({
          code: "composition-not-loaded",
          severity: "error",
          subject: { kind: "file", name: "composition.json" },
          message: "Could not load: composition.json",
          file: "composition.json",
          detail: `${COMPOSITION} is not valid JSON.`,
          fix: { kind: "retry" },
        }),
      ]);

      await test.platform.writeFile(COMPOSITION, JSON.stringify(composition));
      await settle(test);
      const fixed = await sceneOf(test, test.assetId);
      expect(fixed.scene.parts).toHaveLength(3);
      expect(fixed.scene.source.warnings.map((warning) => warning.code)).toEqual(["animation-bones-missing"]);
    }
  });

  it("opens the model alone when a folder sits where its composition file goes, and inspects it the same way", async () => {
    const test = await setup({ [COMPOSITION]: null, [`${COMPOSITION}/notes.txt`]: "notes" });
    const { scene } = await sceneOf(test, test.assetId);
    expect(scene.source.warnings.map((warning) => [warning.code, warning.detail])).toEqual([
      ["composition-not-loaded", `${COMPOSITION} is not a plain file.`],
    ]);
    const inspection = await test.core.client.query("asset.inspect", { path: MODEL });
    expect(inspection.warnings.map((warning) => warning.message)).toEqual(["Could not load: composition.json"]);
  });
});

describe("warnings from the files of a composition", () => {
  it("lists each file's own warnings with its file, and only the warnings about clips from an animation file", async () => {
    const shellWarning = importWarning(
      "unweighted-vertices",
      { kind: "node", name: "ShellA" },
      "Unweighted vertices: ShellA",
    );
    const turnWarnings = [
      importWarning("root-scale", { kind: "node", name: "Body" }, "Root scale x100: Body"),
      importWarning("clip-not-sampled", { kind: "clip", name: "Armature|Turn" }, "Clip not sampled: Armature|Turn"),
      importWarning(
        "curve-modifier-not-applied",
        { kind: "clip", name: "Armature|Turn" },
        "Curve modifiers not applied: Armature|Turn",
      ),
    ];
    const test = await setup({
      [SHELLS]: fakeAsset({ ...shells, warnings: [shellWarning] }),
      [TURN]: fakeAsset({ ...turn, warnings: turnWarnings }),
    });
    const { warnings } = await test.core.client.query("warning.list", { assetId: test.assetId });
    expect(warnings.map((warning) => [warning.id, warning.fix])).toEqual([
      [
        "clip-not-sampled:clip:Anim/BugTurn.fbx//Armature|Turn",
        { kind: "show-clip", clip: "Anim/BugTurn.fbx//Armature|Turn" },
      ],
      [
        "curve-modifier-not-applied:clip:Anim/BugTurn.fbx//Armature|Turn",
        { kind: "show-clip", clip: "Anim/BugTurn.fbx//Armature|Turn" },
      ],
      ["unweighted-vertices:node:BugShells.fbx//ShellA", null],
      [
        "animation-bones-missing:clip:Anim/BugTurn.fbx//Armature|Turn",
        { kind: "show-clip", clip: "Anim/BugTurn.fbx//Armature|Turn" },
      ],
    ]);
    const { commentId } = await test.window.client.execute("comment.createFromWarning", {
      assetId: test.assetId,
      warningId: "clip-not-sampled:clip:Anim/BugTurn.fbx//Armature|Turn",
    });
    const review = await test.core.client.query("review.get", { assetId: test.assetId });
    expect(review.comments.find((comment) => comment.id === commentId)?.time).toMatchObject({
      kind: "frame",
      clip: "Anim/BugTurn.fbx//Armature|Turn",
      frame: 0,
    });
  });
});

describe("reloading a composition", () => {
  it("reloads when a member changes, parsing only that file and keeping the view state", async () => {
    const test = await setup();
    const { assetId } = test;
    const before = await sceneOf(test, assetId);
    const state = {
      camera,
      clip: "Anim/BugTurn.fbx//Armature|Turn",
      frame: 7,
      range: null,
      display: { mode: "clay" as const, skeleton: false },
      parts: { hidden: [], shown: ["BugShells.fbx//Hero/ShellB"], isolated: null, lod: 0 },
      outlineOpen: true,
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
    await test.platform.writeFile(COMPOSITION, JSON.stringify({ ...composition, hidden: [] }));
    await settle(test);
    let { scene } = await sceneOf(test, assetId);
    expect(scene.parts.some((part) => part.hiddenByDefault)).toBe(false);

    await test.platform.remove(COMPOSITION);
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
    await test.platform.writeFile(COMPOSITION, "{ half written");
    await settle(test);
    const { assets } = await test.core.client.query("asset.list", {});
    expect(assets[0]).toMatchObject({ status: "failed", version });
    expect(assets[0]?.error).toBe(`${COMPOSITION} is not valid JSON.`);
    await expect(sceneOf(test, test.assetId)).resolves.toMatchObject({ version });

    await test.platform.writeFile(COMPOSITION, JSON.stringify(composition));
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
    await test.platform.writeFile(COMPOSITION, JSON.stringify({ version: 1, attach: [{ file: "BugShells.fbx" }] }));
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
    return setup({ [COMPOSITION]: null });
  }

  async function written(test: TestCore): Promise<unknown> {
    return readJson(test.platform, COMPOSITION);
  }

  it("creates the composition file in the review folder on the first edit, writes it atomically and reloads", async () => {
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
    ).resolves.toEqual({ path: COMPOSITION, role: "attach" });
    expect(await written(test)).toEqual({
      version: 1,
      attach: [{ file: "BugShells.fbx", node: "ShellA", bone: "Body" }],
    });
    expect(test.platform.writes.filter((write) => write.path === COMPOSITION)).toEqual([
      { path: COMPOSITION, atomic: true },
    ]);
    expect(test.platform.writes.filter((write) => write.path.startsWith("/work/game/Assets/"))).toEqual([]);
    const { scene } = await sceneOf(test, assetId);
    expect(scene.parts.map((part) => part.id)).toEqual(["Hero/Legs", "BugShells.fbx//Hero/ShellA"]);
    const { assets } = await test.core.client.query("asset.list", {});
    expect(assets[0]?.composition).toBe(COMPOSITION);
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
    expect(await written(test)).toEqual({
      version: 1,
      animations: ["Anim/BugTurn.fbx"],
      attach: [
        { file: "BugShells.fbx", node: "ShellA", bone: "Leg" },
        { file: "BugShells.fbx", node: "ShellB" },
      ],
    });
    const { scene } = await sceneOf(test, assetId);
    expect(scene.clips.map((clip) => clip.name)).toEqual(["Armature|Walk", "Anim/BugTurn.fbx//Armature|Turn"]);
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
    await expect(test.platform.exists(COMPOSITION)).resolves.toBe(false);
  });

  it("removes a file with its entries and hidden parts, but not a file that joins by its name", async () => {
    const test = await setup({ [`${FOLDER}/Bug@Idle.fbx`]: fakeAsset(turn) });
    const remove = (file: string) =>
      test.window.client.execute("composition.removeFile", { assetId: test.assetId, file });
    await remove("BugShells.fbx");
    expect(await written(test)).toEqual({
      version: 1,
      animations: ["Anim/BugTurn.fbx"],
      materials: { Shell: { baseColor: "../Textures/Shell.png" } },
    });
    await expect(remove("Bug@Idle.fbx")).rejects.toMatchObject({ code: "invalid-input" });
    await expect(remove("BugShells.fbx")).rejects.toMatchObject({ code: "not-found" });
    const { scene } = await sceneOf(test, test.assetId);
    expect(scene.parts.map((part) => part.id)).toEqual(["Hero/Legs"]);
  });

  it("moves a file's entries onto another bone and off it, keeping them in place, through registry.execute", async () => {
    const test = await setup();
    const attach = (input: Omit<CommandInput<"composition.attachFile">, "assetId">) =>
      test.core.registry.execute("composition.attachFile", { assetId: test.assetId, ...input });
    await expect(attach({ file: "BugShells.fbx", bone: "Hero/Body/Leg" })).resolves.toEqual({ path: COMPOSITION });
    expect(await written(test)).toMatchObject({
      attach: [
        { file: "BugShells.fbx", node: "ShellA", bone: "Leg" },
        { file: "BugShells.fbx", node: "ShellB", bone: "Leg" },
      ],
    });
    let { scene } = await sceneOf(test, test.assetId);
    const parentOf = (path: string) => nodePath(scene, scene.nodes.find((node) => node.path === path)?.parent ?? -1);
    expect(parentOf("BugShells.fbx//Hero/ShellA")).toBe("Hero/Body/Leg");

    await attach({ file: "BugShells.fbx", nodes: ["Hero/ShellB"], bone: null });
    expect(await written(test)).toMatchObject({
      attach: [
        { file: "BugShells.fbx", node: "ShellA", bone: "Leg" },
        { file: "BugShells.fbx", node: "ShellB" },
      ],
    });
    ({ scene } = await sceneOf(test, test.assetId));
    expect(parentOf("BugShells.fbx//Hero/ShellB")).toBeUndefined();
    expect(parentOf("BugShells.fbx//Hero/ShellA")).toBe("Hero/Body/Leg");
    expect(await written(test)).toMatchObject({ hidden: ["BugShells.fbx//Hero/ShellB"] });
  });

  it("moves several nodes of a file in one edit, with one write, one reload and one undo step", async () => {
    const test = await setup();
    const writes = test.platform.writes.length;
    const versions = (await test.core.client.query("review.get", { assetId: test.assetId })).versions.length;
    await test.window.client.execute("composition.attachFile", {
      assetId: test.assetId,
      file: "BugShells.fbx",
      nodes: ["ShellA", "Hero/ShellB"],
      bone: "Leg",
    });
    expect(test.platform.writes.slice(writes).filter((write) => write.path === COMPOSITION)).toHaveLength(1);
    const review = await test.core.client.query("review.get", { assetId: test.assetId });
    expect(review.versions).toHaveLength(versions + 1);
    expect(await written(test)).toMatchObject({
      attach: [
        { file: "BugShells.fbx", node: "ShellA", bone: "Leg" },
        { file: "BugShells.fbx", node: "ShellB", bone: "Leg" },
      ],
    });
    await test.window.client.execute("review.undo", { assetId: test.assetId });
    expect(await written(test)).toMatchObject({ attach: composition.attach });
  });

  it("refuses bones the model lacks, files it does not attach and animation files, without writing", async () => {
    const test = await setup();
    const before = await test.platform.readText(COMPOSITION);
    const attach = (input: Omit<CommandInput<"composition.attachFile">, "assetId">) =>
      test.core.registry.execute("composition.attachFile", { assetId: test.assetId, ...input });
    await expect(attach({ file: "BugShells.fbx", bone: "Wing" })).rejects.toMatchObject({ code: "invalid-input" });
    await expect(attach({ file: "Anim/BugTurn.fbx", bone: "Body" })).rejects.toMatchObject({ code: "invalid-input" });
    await expect(attach({ file: "Other.fbx", bone: "Body" })).rejects.toMatchObject({ code: "not-found" });
    await expect(attach({ file: "BugShells.fbx", nodes: ["ShellC"], bone: null })).rejects.toMatchObject({
      code: "not-found",
    });
    await expect(attach({ file: "BugShells.fbx", bone: "" })).rejects.toMatchObject({ code: "invalid-input" });
    await expect(test.platform.readText(COMPOSITION)).resolves.toBe(before);
  });

  it("sets and clears a material's texture", async () => {
    const test = await setup();
    const set = (input: Omit<CommandInput<"material.setTexture">, "assetId">) =>
      test.window.client.execute("material.setTexture", { assetId: test.assetId, ...input });
    await set({ material: "Shell", slot: "normal", file: "/work/game/Assets/Textures/Shell.png" });
    expect(await written(test)).toMatchObject({
      materials: { Shell: { baseColor: "../Textures/Shell.png", normal: "../Textures/Shell.png" } },
    });
    const { scene } = await sceneOf(test, test.assetId);
    expect(scene.materials.find((material) => material.name === "Shell")?.normalTexture).not.toBeNull();

    await set({ material: "Shell", slot: "normal", file: null });
    await set({ material: "Shell", slot: "baseColor", file: null });
    expect(await written(test)).not.toHaveProperty("materials");
    await expect(set({ material: "Glass", slot: "baseColor", file: "../Textures/Shell.png" })).rejects.toMatchObject({
      code: "not-found",
    });
    await expect(set({ material: "Shell", slot: "baseColor", file: "BugShells.fbx" })).rejects.toMatchObject({
      code: "invalid-input",
    });
  });

  it("keeps texture overrides of materials named like built-in object members to those materials", async () => {
    const model = fakeAsset({ ...bug, meshes: [{ name: "Legs", grid: 3, material: 0 }], materials: ["constructor"] });
    const test = await setup({
      [MODEL]: model,
      [COMPOSITION]: JSON.stringify({
        version: 1,
        materials: {
          constructor: { baseColor: "../Textures/Shell.png" },
          toString: { normal: "../Textures/Shell.png" },
        },
      }),
    });
    expect(Object.hasOwn(Object, "baseColor")).toBe(false);
    expect(Object.hasOwn(Object.prototype.toString, "normal")).toBe(false);
    await test.window.client.execute("material.setTexture", {
      assetId: test.assetId,
      material: "constructor",
      slot: "baseColor",
      file: null,
    });
    await test.window.client.execute("material.setTexture", {
      assetId: test.assetId,
      material: "constructor",
      slot: "normal",
      file: TEXTURE,
    });
    expect(await written(test)).toMatchObject({
      materials: { constructor: { normal: "../Textures/Shell.png" }, toString: { normal: "../Textures/Shell.png" } },
    });
    const { scene } = await sceneOf(test, test.assetId);
    const material = scene.materials.find((entry) => entry.name === "constructor");
    expect(material?.baseColorTexture).toBeNull();
    expect(material?.normalTexture).not.toBeNull();
  });

  it("never overwrites a composition file it cannot read", async () => {
    const test = await setup();
    await test.platform.writeFile(COMPOSITION, "{ broken");
    await expect(
      test.window.client.execute("composition.addFile", { assetId: test.assetId, file: TURN, role: "animation" }),
    ).rejects.toMatchObject({ code: "conflict" });
    await expect(test.platform.readText(COMPOSITION)).resolves.toBe("{ broken");
    expect(await readJson(test.platform, REVIEW)).toMatchObject({ asset: { path: "Assets/Bug/Bug.fbx" } });
  });

  it("writes .arcue/.gitignore when the first edit recreates a deleted .arcue folder", async () => {
    const test = await setup({ [COMPOSITION]: null });
    await test.platform.remove("/work/game/.arcue");
    await test.core.idle();
    await test.window.client.execute("composition.addFile", { assetId: test.assetId, file: TURN, role: "animation" });
    await expect(test.platform.readText("/work/game/.arcue/.gitignore")).resolves.toBe("*\n");
    expect(await written(test)).toEqual({ version: 1, animations: ["Anim/BugTurn.fbx"] });
  });

  it("never writes a composition file through a review folder that became a symbolic link", async () => {
    const test = await setup({ [COMPOSITION]: null, "/elsewhere/Bug/Bug.fbx/keep.txt": "" });
    await test.platform.remove("/work/game/.arcue/reviews/Assets/Bug");
    await test.platform.symlink("/work/game/.arcue/reviews/Assets/Bug", "/elsewhere/Bug");
    await expect(
      test.window.client.execute("composition.addFile", { assetId: test.assetId, file: TURN, role: "animation" }),
    ).rejects.toMatchObject({ code: "conflict" });
    await expect(test.platform.exists("/elsewhere/Bug/Bug.fbx/composition.json")).resolves.toBe(false);
  });
});

describe("adding a file without naming its role", () => {
  async function plain(): Promise<TestCore & { assetId: string }> {
    return setup({
      [COMPOSITION]: null,
      [`${FOLDER}/Empty.fbx`]: fakeAsset({ meshes: [] }),
      [`${FOLDER}/Broken.fbx`]: fakeAsset({ meshes: [], fail: "Not an FBX file." }),
    });
  }

  it("adds a file with clips and no meshes as an animation file, and anything with meshes in place", async () => {
    const test = await plain();
    const add = (file: string) => test.window.client.execute("composition.addFile", { assetId: test.assetId, file });
    const parsed = test.platform.parsed.length;
    await expect(add(TURN)).resolves.toEqual({ path: COMPOSITION, role: "animation" });
    await expect(add("BugShells.fbx")).resolves.toEqual({ path: COMPOSITION, role: "set" });
    expect(test.platform.parsed.slice(parsed)).toEqual(["BugTurn.fbx", "BugShells.fbx"]);
    expect(await readJson(test.platform, COMPOSITION)).toEqual({
      version: 1,
      animations: ["Anim/BugTurn.fbx"],
      attach: [{ file: "BugShells.fbx" }],
    });
    const { scene } = await sceneOf(test, test.assetId);
    expect(scene.clips.map((clip) => clip.name)).toEqual(["Armature|Walk", "Anim/BugTurn.fbx//Armature|Turn"]);
    expect(scene.parts.map((part) => part.id)).toEqual([
      "Hero/Legs",
      "BugShells.fbx//Hero/ShellA",
      "BugShells.fbx//Hero/ShellB",
    ]);
  });

  it("refuses a file with neither meshes nor clips, and one that does not parse, without writing", async () => {
    const test = await plain();
    const add = (file: string) => test.window.client.execute("composition.addFile", { assetId: test.assetId, file });
    await expect(add("Empty.fbx")).rejects.toMatchObject({
      code: "invalid-input",
      message: "Empty.fbx has no meshes or clips.",
    });
    await expect(add("Broken.fbx")).rejects.toThrow("Not an FBX file.");
    await expect(add("/elsewhere/Shells.fbx")).rejects.toMatchObject({
      code: "invalid-input",
      message: "Shells.fbx is outside the asset's workspace.",
    });
    await expect(test.platform.exists(COMPOSITION)).resolves.toBe(false);
  });
});

describe("listing materials", () => {
  it("lists each material's slots with the composition's textures, found or missing, and always base color", async () => {
    const test = await setup({
      [COMPOSITION]: JSON.stringify({
        ...composition,
        materials: { Shell: { baseColor: "../Textures/Shell.png", normal: "Lost.png" } },
      }),
    });
    const { materials } = await test.core.client.query("scene.materials", { assetId: test.assetId });
    expect(materials).toEqual([
      {
        material: "Shell",
        slots: [
          { slot: "baseColor", state: "set", path: "../Textures/Shell.png", overridden: true },
          { slot: "normal", state: "missing", path: "Lost.png", overridden: true },
        ],
      },
    ]);
  });
});

describe("undoing composition edits", () => {
  async function plain(): Promise<TestCore & { assetId: string }> {
    return setup({ [COMPOSITION]: null });
  }

  function history(test: TestCore & { assetId: string }) {
    return {
      undo: () => test.window.client.execute("review.undo", { assetId: test.assetId }),
      redo: () => test.window.client.execute("review.redo", { assetId: test.assetId }),
      add: (file: string) => test.window.client.execute("composition.addFile", { assetId: test.assetId, file }),
      parts: async () => (await sceneOf(test, test.assetId)).scene.parts.map((part) => part.id),
      text: async () => ((await test.platform.exists(COMPOSITION)) ? test.platform.readText(COMPOSITION) : null),
    };
  }

  it("removes a composition file the edit created, brings it back on redo, and reloads each time", async () => {
    const test = await plain();
    const steps = history(test);
    await steps.add("BugShells.fbx");
    const written = await steps.text();
    await expect(steps.undo()).resolves.toEqual({ changed: true });
    await expect(steps.text()).resolves.toBeNull();
    await expect(steps.parts()).resolves.toEqual(["Hero/Legs"]);
    await expect(steps.redo()).resolves.toEqual({ changed: true });
    await expect(steps.text()).resolves.toBe(written);
    await expect(steps.parts()).resolves.toHaveLength(3);
    await expect(steps.redo()).resolves.toEqual({ changed: false });
  });

  it("writes back the file's earlier text as it was, and undoes texture and remove edits too", async () => {
    const original = `${JSON.stringify(composition)}\n`;
    const test = await setup({ [COMPOSITION]: original });
    const steps = history(test);
    await test.window.client.execute("material.setTexture", {
      assetId: test.assetId,
      material: "Shell",
      slot: "baseColor",
      file: null,
    });
    await test.window.client.execute("composition.removeFile", { assetId: test.assetId, file: "BugShells.fbx" });
    await expect(steps.parts()).resolves.toEqual(["Hero/Legs"]);
    await steps.undo();
    await expect(steps.parts()).resolves.toHaveLength(3);
    await steps.undo();
    await expect(steps.text()).resolves.toBe(original);
  });

  it("undoes and redoes attaching a file to a bone, moving its nodes back each time", async () => {
    const original = `${JSON.stringify(composition)}\n`;
    const test = await setup({ [COMPOSITION]: original });
    const steps = history(test);
    const parentOf = async (path: string) => {
      const { scene } = await sceneOf(test, test.assetId);
      return nodePath(scene, scene.nodes.find((node) => node.path === path)?.parent ?? -1);
    };
    const before = await parentOf("BugShells.fbx//Hero/ShellA");
    await test.window.client.execute("composition.attachFile", {
      assetId: test.assetId,
      file: "BugShells.fbx",
      bone: "Hero/Body/Leg",
    });
    const attached = await steps.text();
    await expect(parentOf("BugShells.fbx//Hero/ShellA")).resolves.toBe("Hero/Body/Leg");
    await expect(steps.undo()).resolves.toEqual({ changed: true });
    await expect(steps.text()).resolves.toBe(original);
    await expect(parentOf("BugShells.fbx//Hero/ShellA")).resolves.toBe(before);
    await expect(steps.redo()).resolves.toEqual({ changed: true });
    await expect(steps.text()).resolves.toBe(attached);
    await expect(parentOf("BugShells.fbx//Hero/ShellA")).resolves.toBe("Hero/Body/Leg");
  });

  it("moves several nodes of a file in one edit, which one undo takes back", async () => {
    const original = `${JSON.stringify(composition)}\n`;
    const test = await setup({ [COMPOSITION]: original });
    const steps = history(test);
    const attach = (nodes: string[]) =>
      test.window.client.execute("composition.attachFile", {
        assetId: test.assetId,
        file: "BugShells.fbx",
        nodes,
        bone: "Hero/Body/Leg",
      });
    await expect(attach(["Hero/ShellA", "ShellC"])).rejects.toMatchObject({
      code: "not-found",
      message: "Node ShellC of BugShells.fbx is not attached or set in the composition.",
    });
    await expect(steps.text()).resolves.toBe(original);
    const writes = test.platform.writes.length;
    await attach(["Hero/ShellA", "ShellB"]);
    expect(test.platform.writes.slice(writes).filter((write) => write.path === COMPOSITION)).toHaveLength(1);
    expect(await readJson(test.platform, COMPOSITION)).toMatchObject({
      attach: [
        { file: "BugShells.fbx", node: "ShellA", bone: "Leg" },
        { file: "BugShells.fbx", node: "ShellB", bone: "Leg" },
      ],
    });
    await expect(steps.undo()).resolves.toEqual({ changed: true });
    await expect(steps.text()).resolves.toBe(original);
  });

  it("refuses with conflict and writes nothing when the file changed since the edit", async () => {
    const test = await plain();
    const steps = history(test);
    await steps.add("BugShells.fbx");
    const changed = JSON.stringify({ version: 1, animations: ["Anim/BugTurn.fbx"] });
    await test.platform.writeFile(COMPOSITION, changed);
    const writes = test.platform.writes.length;
    await expect(steps.undo()).rejects.toMatchObject({ code: "conflict" });
    await expect(steps.text()).resolves.toBe(changed);
    expect(test.platform.writes.slice(writes)).toEqual([]);
  });

  it("drops a composition step that conflicts, so the next undo reaches the edits before it", async () => {
    const test = await plain();
    const steps = history(test);
    const { version } = await sceneOf(test, test.assetId);
    await test.window.client.execute("comment.create", looseComment(test.assetId, "The legs are too thin.", version));
    await steps.add("BugShells.fbx");
    const changed = JSON.stringify({ version: 1, animations: ["Anim/BugTurn.fbx"] });
    await test.platform.writeFile(COMPOSITION, changed);
    await expect(steps.undo()).rejects.toMatchObject({ code: "conflict" });
    await expect(steps.undo()).resolves.toEqual({ changed: true });
    const review = await test.core.client.query("review.get", { assetId: test.assetId });
    expect(review.queue).toEqual([]);
    await expect(steps.text()).resolves.toBe(changed);
    await expect(steps.redo()).resolves.toEqual({ changed: true });
    await expect(steps.redo()).resolves.toEqual({ changed: false });
  });

  it("writes .arcue/.gitignore when a redo recreates a deleted .arcue folder", async () => {
    const test = await plain();
    const steps = history(test);
    await steps.add("BugShells.fbx");
    await steps.undo();
    await test.platform.remove("/work/game/.arcue");
    await test.core.idle();
    await expect(steps.redo()).resolves.toEqual({ changed: true });
    await expect(test.platform.readText("/work/game/.arcue/.gitignore")).resolves.toBe("*\n");
    await expect(steps.parts()).resolves.toHaveLength(3);
  });

  it("refuses a redo when the file changed since the undo", async () => {
    const test = await plain();
    const steps = history(test);
    await steps.add("BugShells.fbx");
    await steps.undo();
    await test.platform.writeFile(COMPOSITION, JSON.stringify({ version: 1 }));
    await expect(steps.redo()).rejects.toMatchObject({ code: "conflict" });
  });

  it("shares one history with comment edits, in the order they were made", async () => {
    const test = await plain();
    const steps = history(test);
    const { version } = await sceneOf(test, test.assetId);
    const { commentId } = await test.window.client.execute(
      "comment.create",
      looseComment(test.assetId, "The legs are too thin.", version),
    );
    await steps.add("BugShells.fbx");
    await steps.undo();
    let review = await test.core.client.query("review.get", { assetId: test.assetId });
    expect(review.queue).toEqual([commentId]);
    await expect(steps.text()).resolves.toBeNull();
    await steps.undo();
    review = await test.core.client.query("review.get", { assetId: test.assetId });
    expect(review.queue).toEqual([]);
    await steps.redo();
    await steps.redo();
    await expect(steps.parts()).resolves.toHaveLength(3);
  });

  it("keeps composition edits and their undo one at a time, in the order they were asked for", async () => {
    const test = await plain();
    const steps = history(test);
    await Promise.all([steps.add("BugShells.fbx"), steps.add(TURN), steps.undo(), steps.undo(), steps.redo()]);
    expect(await readJson(test.platform, COMPOSITION)).toEqual({
      version: 1,
      attach: [{ file: "BugShells.fbx" }],
    });
  });
});
