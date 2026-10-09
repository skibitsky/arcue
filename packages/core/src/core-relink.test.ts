import type { CompositionFile, EventName, ReviewFile } from "@arcue/protocol";
import { describe, expect, it } from "vitest";
import type { FakeAssetSpec, TestCore } from "./test-support";
import {
  fakeAsset,
  flush,
  HERO,
  HERO_REVIEW,
  HERO_VERSION,
  heroFiles,
  heroSpec,
  looseComment,
  openAsset,
  pinComment,
  readJson,
  startTestCore,
} from "./test-support";

const ART = "/work/game/Assets/Art";
const STRIKER = `${ART}/Striker.fbx`;
const STRIKER_REVIEW = "/work/game/.arcue/reviews/Assets/Art/Striker.fbx";
const GUID = "4f2a9c1e8b7d4e3f9a0b1c2d3e4f5a6b";

function record(test: TestCore, ...names: EventName[]): { name: EventName; payload: unknown }[] {
  const events: { name: EventName; payload: unknown }[] = [];
  for (const name of names) test.core.client.subscribe(name, (payload) => events.push({ name, payload }));
  return events;
}

/** Lets file changes settle through the core's stability checks. */
async function settle(test: TestCore): Promise<void> {
  for (let check = 0; check < 3; check++) {
    await flush();
    await test.core.idle();
    test.clock.advance(300);
  }
  await flush();
  await test.core.idle();
}

/** Opens a model, comments on it and closes it, as a review left behind before its file was renamed. */
async function review(test: TestCore, path = HERO, version = HERO_VERSION): Promise<void> {
  const assetId = await openAsset(test, path);
  await test.core.client.execute("comment.create", pinComment(assetId, "The thumb bends outward.", version));
  await test.core.client.execute("asset.close", { assetId });
}

describe("opening a renamed model", () => {
  it("moves the review of a file with the same bytes, keeping its comments on their clip, frame and mesh", async () => {
    const test = await startTestCore(heroFiles());
    await review(test);
    await test.platform.rename(HERO, STRIKER);
    const events = record(test, "asset.opened", "review.relinked", "review.offered");

    const assetId = await openAsset(test, STRIKER);
    expect(events.map((event) => event.name)).toEqual(["asset.opened", "review.relinked"]);
    expect(events[1]?.payload).toEqual({ assetId, from: HERO, automatic: true });
    await expect(test.platform.exists(HERO_REVIEW)).resolves.toBe(false);
    const moved = (await readJson(test.platform, `${STRIKER_REVIEW}/review.json`)) as ReviewFile;
    expect(moved.asset.path).toBe("Assets/Art/Striker.fbx");
    await expect(test.platform.exists(`${STRIKER_REVIEW}/screenshots/${moved.comments[0]?.id}.png`)).resolves.toBe(
      true,
    );
    const [comment] = (await test.core.client.query("review.get", { assetId })).comments;
    expect(comment).toMatchObject({
      text: "The thumb bends outward.",
      time: { kind: "frame", clip: "Armature|Charge", frame: 34 },
      target: { mesh: "Hero/Body" },
      anchorState: "exact",
      anchorVersion: HERO_VERSION,
    });
    await expect(test.core.client.query("review.candidates", { assetId })).resolves.toEqual({ candidates: [] });
  });

  it("leaves a copy's review alone while the original file is still there", async () => {
    const test = await startTestCore(heroFiles());
    await review(test);
    await test.platform.writeFile(STRIKER, fakeAsset(heroSpec));
    const events = record(test, "review.relinked", "review.offered");
    const assetId = await openAsset(test, STRIKER);
    expect(events).toEqual([]);
    expect((await test.core.client.query("review.get", { assetId })).comments).toEqual([]);
    expect(((await readJson(test.platform, `${HERO_REVIEW}/review.json`)) as ReviewFile).comments).toHaveLength(1);
  });

  it("moves the review of a file with the same Unity GUID after Unity renamed it and it was exported again", async () => {
    const test = await startTestCore({ ...heroFiles(), [`${HERO}.meta`]: `guid: ${GUID}\n` });
    await review(test);
    await test.platform.rename(HERO, STRIKER);
    await test.platform.rename(`${HERO}.meta`, `${STRIKER}.meta`);
    await test.platform.writeFile(STRIKER, fakeAsset({ ...heroSpec, meshes: [{ name: "Body", grid: 4 }] }));
    const events = record(test, "review.relinked");

    const assetId = await openAsset(test, STRIKER);
    expect(events).toEqual([{ name: "review.relinked", payload: { assetId, from: HERO, automatic: true } }]);
    const moved = await test.core.client.query("review.get", { assetId });
    expect(moved.asset.guid).toBe(GUID);
    expect(moved.versions).toHaveLength(2);
    expect(moved.comments[0]).toMatchObject({ anchorState: "moved" });
  });

  it("offers the best of several reviews with the same bytes instead of moving any", async () => {
    const copy = `${ART}/HeroCopy.fbx`;
    const test = await startTestCore({ ...heroFiles(), [copy]: fakeAsset(heroSpec) });
    await review(test);
    test.clock.advance(60_000);
    await review(test, copy);
    await test.platform.rename(HERO, STRIKER);
    await test.platform.remove(copy);
    const events = record(test, "review.relinked", "review.offered");

    const assetId = await openAsset(test, STRIKER);
    const candidates = [
      { path: copy, comments: 1, lastLoadedAt: "2026-10-08T14:03:00.000Z", match: "content" },
      { path: HERO, comments: 1, lastLoadedAt: "2026-10-08T14:02:00.000Z", match: "content" },
    ];
    expect(events).toEqual([{ name: "review.offered", payload: { assetId, candidate: candidates[0] } }]);
    await expect(test.core.client.query("review.candidates", { assetId })).resolves.toEqual({ candidates });
    await expect(test.platform.exists(`${HERO_REVIEW}/review.json`)).resolves.toBe(true);
  });

  it("offers a review whose meshes match once the file loads, and moves it only through review.relink", async () => {
    const test = await startTestCore(heroFiles());
    await review(test);
    await test.platform.remove(HERO);
    const edited: FakeAssetSpec = { ...heroSpec, clips: [{ name: "Armature|Charge", frames: 61 }] };
    await test.platform.writeFile(STRIKER, fakeAsset(edited));
    const events = record(test, "review.relinked", "review.offered", "review.changed");

    const assetId = await openAsset(test, STRIKER);
    const candidate = { path: HERO, comments: 1, lastLoadedAt: "2026-10-08T14:02:00.000Z", match: "structure" };
    expect(events.filter((event) => event.name !== "review.changed")).toEqual([
      { name: "review.offered", payload: { assetId, candidate } },
    ]);
    await expect(test.platform.exists(`${HERO_REVIEW}/review.json`)).resolves.toBe(true);

    events.length = 0;
    await test.window.client.execute("review.relink", { assetId, from: HERO });
    await test.core.idle();
    expect(events.map((event) => event.name)).toContain("review.relinked");
    expect(events.find((event) => event.name === "review.relinked")?.payload).toEqual({
      assetId,
      from: HERO,
      automatic: false,
    });
    const moved = await test.core.client.query("review.get", { assetId });
    expect(moved.comments).toHaveLength(1);
    expect(moved.versions.map((version) => version.id)).toEqual([HERO_VERSION, await sceneVersion(test, assetId)]);
    expect(moved.comments[0]).toMatchObject({ anchorState: "exact", anchorVersion: await sceneVersion(test, assetId) });
    await expect(test.core.client.query("review.candidates", { assetId })).resolves.toEqual({ candidates: [] });
    await expect(test.platform.exists(HERO_REVIEW)).resolves.toBe(false);
  });

  it("offers nothing for a different model with the same mesh names, or for a review without comments", async () => {
    const test = await startTestCore(heroFiles());
    await review(test);
    await test.platform.remove(HERO);
    await test.platform.writeFile(STRIKER, fakeAsset({ ...heroSpec, meshes: [{ name: "Body", grid: 5, flip: true }] }));
    const events = record(test, "review.offered");
    await openAsset(test, STRIKER);
    expect(events).toEqual([]);

    const empty = await startTestCore(heroFiles());
    const assetId = await openAsset(empty);
    await empty.core.client.execute("asset.close", { assetId });
    await empty.platform.remove(HERO);
    await empty.platform.writeFile(STRIKER, fakeAsset({ ...heroSpec, fps: 30 }));
    const none = record(empty, "review.offered", "review.relinked");
    await openAsset(empty, STRIKER);
    expect(none).toEqual([]);
  });

  it("never takes the review of a model open in another tab, even when its file is gone", async () => {
    const test = await startTestCore(heroFiles());
    const assetId = await openAsset(test);
    await test.core.client.execute("comment.create", pinComment(assetId));
    await test.platform.writeFile(STRIKER, fakeAsset(heroSpec));
    await test.platform.remove(HERO);
    const events = record(test, "review.relinked", "review.offered");
    await openAsset(test, STRIKER);
    expect(events).toEqual([]);
    await expect(test.platform.exists(`${HERO_REVIEW}/review.json`)).resolves.toBe(true);
  });
});

describe("review.relink", () => {
  async function offered() {
    const test = await startTestCore(heroFiles());
    await review(test);
    await test.platform.remove(HERO);
    await test.platform.writeFile(STRIKER, fakeAsset({ ...heroSpec, fps: 30 }));
    return { test, assetId: await openAsset(test, STRIKER) };
  }

  it("refuses an earlier file that still exists, a path outside the asset's reviews, and a relative path", async () => {
    const { test, assetId } = await offered();
    await test.platform.writeFile(HERO, fakeAsset(heroSpec));
    await expect(test.window.client.execute("review.relink", { assetId, from: HERO })).rejects.toMatchObject({
      code: "conflict",
      message: "Hero.fbx still exists, so its review stays with it.",
    });
    await test.platform.remove(HERO);
    for (const from of ["/elsewhere/Hero.fbx", "/work/game/../../etc/passwd", STRIKER]) {
      await expect(test.window.client.execute("review.relink", { assetId, from })).rejects.toMatchObject({
        code: "invalid-input",
      });
    }
    await expect(
      test.window.client.execute("review.relink", { assetId, from: "../../.arcue/reviews/Assets/Art/Hero.fbx" }),
    ).rejects.toMatchObject({ code: "invalid-input" });
    await expect(
      test.window.client.execute("review.relink", { assetId, from: `${ART}/Missing.fbx` }),
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("refuses to replace a review that has comments of its own, and changes nothing", async () => {
    const { test, assetId } = await offered();
    const version = await sceneVersion(test, assetId);
    await test.window.client.execute("comment.create", looseComment(assetId, "Mine.", version));
    await expect(test.window.client.execute("review.relink", { assetId, from: HERO })).rejects.toMatchObject({
      code: "conflict",
      message: "Striker.fbx already has a review, so the review of Hero.fbx stays where it is.",
    });
    expect((await test.core.client.query("review.get", { assetId })).comments.map((entry) => entry.text)).toEqual([
      "Mine.",
    ]);
    await expect(test.platform.exists(`${HERO_REVIEW}/review.json`)).resolves.toBe(true);
  });
});

describe("a renamed model in another folder", () => {
  const model = `${ART}/Bug.fbx`;
  const moved = "/work/game/Assets/Characters/Bug.fbx";
  const run = `${ART}/Anim/Run.fbx`;
  const bug: FakeAssetSpec = { bones: [{ name: "Body" }], meshes: [{ name: "Legs", grid: 3 }] };
  const runSpec: FakeAssetSpec = { bones: [{ name: "Body" }], meshes: [], clips: [{ name: "Run", frames: 11 }] };
  const composition: CompositionFile = { version: 1, animations: ["Anim/Run.fbx"] };

  it("points the composition at the files that stayed and keeps comments on their clips", async () => {
    const test = await startTestCore({
      "/work/game/.git/HEAD": "ref",
      [model]: fakeAsset(bug),
      [run]: fakeAsset(runSpec),
      "/work/game/.arcue/reviews/Assets/Art/Bug.fbx/composition.json": JSON.stringify(composition),
    });
    const before = await openAsset(test, model);
    const { version } = await test.core.client.query("scene.get", { assetId: before });
    await test.core.client.execute("comment.create", {
      ...looseComment(before, "Lift the knees.", version),
      time: { kind: "frame", clip: "Anim/Run.fbx//Run", frame: 5 },
    });
    await test.core.client.execute("asset.close", { assetId: before });
    await test.platform.rename(model, moved);

    const assetId = await openAsset(test, moved);
    const review = "/work/game/.arcue/reviews/Assets/Characters/Bug.fbx";
    await expect(readJson(test.platform, `${review}/composition.json`)).resolves.toEqual({
      version: 1,
      animations: ["../Art/Anim/Run.fbx"],
    });
    const { scene } = await test.core.client.query("scene.get", { assetId });
    expect(scene.clips.map((clip) => clip.name)).toEqual(["../Art/Anim/Run.fbx//Run"]);
    const [comment] = (await test.core.client.query("review.get", { assetId })).comments;
    expect(comment?.time).toEqual({
      kind: "frame",
      clip: "../Art/Anim/Run.fbx//Run",
      clipDisplayName: "Run",
      frame: 5,
    });
  });
});

describe("a renamed model outside a repository", () => {
  it("moves its review in the app data folder", async () => {
    const test = await startTestCore({ "/art/Hero.fbx": fakeAsset(heroSpec) });
    await review(test, "/art/Hero.fbx");
    await test.platform.rename("/art/Hero.fbx", "/art/Striker.fbx");
    const assetId = await openAsset(test, "/art/Striker.fbx");
    const moved = await test.core.client.query("review.get", { assetId });
    expect(moved.asset.path).toBe("/art/Striker.fbx");
    expect(moved.comments).toHaveLength(1);
    await expect(test.platform.exists("/app-data/reviews/art/Hero.fbx")).resolves.toBe(false);
    await expect(test.platform.exists("/app-data/reviews/art/Striker.fbx/review.json")).resolves.toBe(true);
  });
});

async function sceneVersion(test: TestCore, assetId: string): Promise<string> {
  return (await test.core.client.query("scene.get", { assetId })).version;
}

describe("an open model whose file is renamed", () => {
  async function commented(files: Record<string, string> = heroFiles()) {
    const test = await startTestCore(files);
    const assetId = await openAsset(test);
    const { commentId } = await test.core.client.execute("comment.create", pinComment(assetId));
    return { test, assetId, commentId };
  }

  it("follows its file to the new name, keeping its id, comments and screenshots, and watches the new file", async () => {
    const { test, assetId, commentId } = await commented();
    const events = record(test, "asset.updated", "review.relinked", "review.changed");
    await test.platform.rename(HERO, STRIKER);
    await settle(test);

    expect(events.find((event) => event.name === "review.relinked")?.payload).toEqual({
      assetId,
      from: HERO,
      automatic: true,
    });
    const renamed = events.find((event) => event.name === "asset.updated")?.payload;
    expect(renamed).toMatchObject({ asset: { assetId, path: STRIKER, name: "Striker.fbx" } });
    await expect(test.core.client.query("asset.list", {})).resolves.toMatchObject({
      assets: [{ assetId, path: STRIKER, name: "Striker.fbx", status: "ready", error: null }],
    });
    await expect(test.platform.exists(HERO_REVIEW)).resolves.toBe(false);
    await expect(test.platform.exists(`${STRIKER_REVIEW}/screenshots/${commentId}.png`)).resolves.toBe(true);
    const review = await test.core.client.query("review.get", { assetId });
    expect(review.asset.path).toBe("Assets/Art/Striker.fbx");
    expect(review.comments.map((comment) => comment.id)).toEqual([commentId]);
    await expect(test.core.client.query("warning.list", { assetId })).resolves.toEqual({ warnings: [] });

    await test.platform.writeFile(STRIKER, fakeAsset({ ...heroSpec, meshes: [{ name: "Body", grid: 4 }] }));
    await settle(test);
    expect(await sceneVersion(test, assetId)).not.toBe(HERO_VERSION);
    await test.core.client.execute(
      "comment.create",
      looseComment(assetId, "Later.", await sceneVersion(test, assetId)),
    );
    await expect(test.platform.readText(`${STRIKER_REVIEW}/review.json`)).resolves.toContain("Later.");
  });

  it("follows the file with its Unity GUID when Unity renamed it and it was exported again", async () => {
    const { test, assetId } = await commented({ ...heroFiles(), [`${HERO}.meta`]: `guid: ${GUID}\n` });
    await test.platform.rename(HERO, STRIKER);
    await test.platform.rename(`${HERO}.meta`, `${STRIKER}.meta`);
    await test.platform.writeFile(STRIKER, fakeAsset({ ...heroSpec, meshes: [{ name: "Body", grid: 4 }] }));
    await settle(test);
    await expect(test.core.client.query("asset.list", {})).resolves.toMatchObject({
      assets: [{ assetId, path: STRIKER, status: "ready" }],
    });
    expect((await test.core.client.query("review.get", { assetId })).comments[0]).toMatchObject({
      anchorState: "moved",
    });
  });

  it("says the model is not found when no single file matches, and loads it again once it is back", async () => {
    const { test, assetId } = await commented({ ...heroFiles(), [`${ART}/A.fbx`]: fakeAsset(heroSpec) });
    await test.platform.writeFile(`${ART}/B.fbx`, fakeAsset(heroSpec));
    await test.platform.remove(HERO);
    await settle(test);
    await expect(test.core.client.query("asset.list", {})).resolves.toMatchObject({
      assets: [{ assetId, path: HERO, status: "failed", version: HERO_VERSION, error: "Model not found: Hero.fbx" }],
    });
    const { warnings } = await test.core.client.query("warning.list", { assetId });
    expect(warnings).toEqual([
      {
        id: "model-not-found:file:Hero.fbx",
        code: "model-not-found",
        severity: "error",
        subject: { kind: "file", name: "Hero.fbx" },
        message: "Model not found: Hero.fbx",
        detail: `${HERO} was removed or renamed.`,
        dismissed: false,
        commentId: null,
        fix: { kind: "choose-model" },
      },
    ]);
    await expect(test.core.client.query("warning.prompt", { assetId })).resolves.toMatchObject({
      prompt: expect.stringContaining("1. Model not found: Hero.fbx"),
    });
    await expect(
      test.core.client.execute("comment.createFromWarning", { assetId, warningId: "model-not-found:file:Hero.fbx" }),
    ).resolves.toMatchObject({ commentId: expect.any(String) });

    await test.platform.writeFile(HERO, fakeAsset(heroSpec));
    await settle(test);
    await expect(test.core.client.query("asset.list", {})).resolves.toMatchObject({
      assets: [{ assetId, path: HERO, status: "ready", error: null }],
    });
    await expect(test.core.client.query("warning.list", { assetId })).resolves.toEqual({ warnings: [] });
  });

  it("does not follow a file that has a review of its own", async () => {
    const test = await startTestCore({ ...heroFiles(), [STRIKER]: fakeAsset({ ...heroSpec, fps: 30 }) });
    await review(test, STRIKER, (await openVersion(test, STRIKER)) ?? "");
    const assetId = await openAsset(test);
    await test.platform.remove(STRIKER);
    await test.platform.rename(HERO, STRIKER);
    await settle(test);
    await expect(test.core.client.query("asset.list", {})).resolves.toMatchObject({
      assets: [{ assetId, path: HERO, status: "failed", error: "Model not found: Hero.fbx" }],
    });
    await expect(test.platform.exists(`${HERO_REVIEW}/review.json`)).resolves.toBe(true);
  });
});

describe("asset.relink", () => {
  it("points an asset whose model is gone at the file the person chose, and moves its review", async () => {
    const test = await startTestCore(heroFiles());
    const assetId = await openAsset(test);
    await test.core.client.execute("comment.create", pinComment(assetId));
    await test.platform.remove(HERO);
    await test.platform.writeFile(STRIKER, fakeAsset({ ...heroSpec, fps: 30 }));
    await settle(test);
    expect((await test.core.client.query("warning.list", { assetId })).warnings[0]?.code).toBe("model-not-found");
    const events = record(test, "review.relinked");

    await test.window.client.execute("asset.relink", { assetId, path: STRIKER });
    await test.core.idle();
    expect(events).toEqual([{ name: "review.relinked", payload: { assetId, from: HERO, automatic: false } }]);
    await expect(test.core.client.query("asset.list", {})).resolves.toMatchObject({
      assets: [{ assetId, path: STRIKER, status: "ready", error: null }],
    });
    await expect(test.core.client.query("warning.list", { assetId })).resolves.toEqual({ warnings: [] });
    const review = await test.core.client.query("review.get", { assetId });
    expect(review.comments).toHaveLength(1);
    expect(review.versions).toHaveLength(2);
    await expect(test.platform.exists(HERO_REVIEW)).resolves.toBe(false);
  });

  it("refuses while the model is still there, a missing file, and a file with a review of its own", async () => {
    const test = await startTestCore({ ...heroFiles(), [STRIKER]: fakeAsset({ ...heroSpec, fps: 30 }) });
    await review(test, STRIKER, (await openVersion(test, STRIKER)) ?? "");
    const assetId = await openAsset(test);
    await expect(test.window.client.execute("asset.relink", { assetId, path: STRIKER })).rejects.toMatchObject({
      code: "conflict",
      message: "Hero.fbx still exists, so its review stays with it.",
    });
    await test.platform.remove(HERO);
    await expect(
      test.window.client.execute("asset.relink", { assetId, path: `${ART}/Missing.fbx` }),
    ).rejects.toMatchObject({ code: "not-found" });
    await expect(test.window.client.execute("asset.relink", { assetId, path: STRIKER })).rejects.toMatchObject({
      code: "conflict",
      message: "Striker.fbx already has a review, so the review of Hero.fbx stays where it is.",
    });
    await expect(test.core.client.query("asset.list", {})).resolves.toMatchObject({ assets: [{ path: HERO }] });
  });
});

/** The version a file loads as, read by opening and closing it. */
async function openVersion(test: TestCore, path: string): Promise<string | null> {
  const assetId = await openAsset(test, path);
  const version = await sceneVersion(test, assetId);
  await test.core.client.execute("asset.close", { assetId });
  return version;
}
