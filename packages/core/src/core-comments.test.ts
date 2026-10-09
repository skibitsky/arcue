import type { ReviewFile } from "@arcue/protocol";
import { describe, expect, it } from "vitest";
import { ArcueCore } from "./core";
import type { TestCore } from "./test-support";
import {
  camera,
  FakeWindow,
  fakeAsset,
  HERO,
  HERO_REVIEW,
  heroFiles,
  heroSpec,
  looseComment,
  openAsset,
  pinComment,
  pinContext,
  png,
  readJson,
  startTestCore,
} from "./test-support";

async function setup(): Promise<TestCore & { assetId: string; version: string }> {
  const test = await startTestCore(heroFiles());
  const assetId = await openAsset(test);
  const { version } = await test.core.client.query("scene.get", { assetId });
  return { ...test, assetId, version };
}

async function savedReview(test: TestCore): Promise<ReviewFile> {
  return (await readJson(test.platform, `${HERO_REVIEW}/review.json`)) as ReviewFile;
}

async function sendQueue(test: TestCore & { assetId: string }): Promise<void> {
  await test.core.client.execute("round.copy", { assetId: test.assetId });
}

describe("comment.create", () => {
  it("saves a draft with the clip's display name, the anchor's version and rest positions, and its screenshot", async () => {
    const test = await setup();
    const changes: ReviewFile[] = [];
    test.core.client.subscribe("review.changed", ({ review }) => changes.push(review));
    test.clock.advance(60_000);
    const { commentId } = await test.window.client.execute("comment.create", pinComment(test.assetId));
    expect(commentId).toBe("c1");

    const review = await savedReview(test);
    expect(changes).toEqual([review]);
    expect(review.queue).toEqual(["c1"]);
    expect(review.nextCommentNumber).toBe(2);
    expect(review.comments).toEqual([
      {
        id: "c1",
        text: "The thumb bends outward.",
        status: "draft",
        createdAt: "2026-10-08T14:03:00.000Z",
        updatedAt: "2026-10-08T14:03:00.000Z",
        madeOnVersion: test.version,
        time: { kind: "frame", clip: "Armature|Charge", clipDisplayName: "Charge", frame: 34 },
        target: { kind: "surface", mesh: "Hero/Body", vertices: [4, 5, 7], weights: [0.5, 0.25, 0.25] },
        anchorVersion: test.version,
        anchorRestPositions: [
          [1, 1, 0],
          [2, 1, 0],
          [1, 2, 0],
        ],
        camera,
        context: { ...pinContext, screenshot: "screenshots/c1.png" },
        anchorState: "exact",
        followUps: [],
        rounds: [],
        reopenedFrom: null,
      },
    ]);
    await expect(test.platform.readFile(`${HERO_REVIEW}/screenshots/c1.png`)).resolves.toEqual(png);
    await expect(test.core.client.query("comment.screenshot", { assetId: test.assetId, commentId })).resolves.toEqual(
      png,
    );
  });

  it("writes review data only atomically", async () => {
    const test = await setup();
    await test.core.client.execute("comment.create", pinComment(test.assetId));
    await test.core.client.execute("comment.update", { assetId: test.assetId, commentId: "c1", text: "Changed." });
    await sendQueue(test);
    const reviewWrites = test.platform.writes.filter((write) => write.path.startsWith("/work/game/.arcue/"));
    expect(reviewWrites.length).toBeGreaterThan(5);
    expect(reviewWrites.every((write) => write.atomic)).toBe(true);
  });

  it("stores a comment on a region by its decoded vertices", async () => {
    const test = await setup();
    await test.core.client.execute("comment.create", {
      ...pinComment(test.assetId),
      time: { kind: "range", clip: "Armature|Run", start: 12, end: 24 },
      target: {
        kind: "region",
        mesh: "Hero/Body",
        triangles: [[0, 1]],
        vertices: [
          [0, 1],
          [3, 4],
        ],
      },
    });
    const [comment] = (await savedReview(test)).comments;
    expect(comment?.time).toEqual({ kind: "range", clip: "Armature|Run", clipDisplayName: "Run", start: 12, end: 24 });
    expect(comment?.anchorRestPositions).toEqual([
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 0],
      [1, 1, 0],
    ]);
  });

  it("numbers comments without reusing ids, and saves a comment without target or screenshot", async () => {
    const test = await setup();
    await test.core.client.execute("comment.create", pinComment(test.assetId));
    await test.core.client.execute("comment.delete", { assetId: test.assetId, commentId: "c1" });
    const { commentId } = await test.core.client.execute("comment.create", looseComment(test.assetId));
    expect(commentId).toBe("c2");
    const review = await savedReview(test);
    expect(review.comments[0]).toMatchObject({ id: "c2", target: null, anchorRestPositions: [] });
    expect(review.comments[0]?.context.screenshot).toBeNull();
  });

  it("rejects clips, frames, meshes and vertices the asset does not have", async () => {
    const test = await setup();
    const input = pinComment(test.assetId);
    const rejected = [
      { ...input, time: { kind: "frame" as const, clip: "Charge", frame: 0 } },
      { ...input, time: { kind: "frame" as const, clip: "Armature|Charge", frame: 61 } },
      { ...input, time: { kind: "range" as const, clip: "Armature|Run", start: 0, end: 31 } },
      {
        ...input,
        target: {
          ...input.target,
          kind: "surface" as const,
          mesh: "Hero/Head",
          vertices: [0, 1, 2] as [number, number, number],
          weights: [1, 0, 0] as [number, number, number],
        },
      },
      {
        ...input,
        target: {
          kind: "surface" as const,
          mesh: "Hero/Body",
          vertices: [0, 1, 9] as [number, number, number],
          weights: [1, 0, 0] as [number, number, number],
        },
      },
      {
        ...input,
        target: {
          kind: "region" as const,
          mesh: "Hero/Body",
          triangles: [[8, 8]] as [number, number][],
          vertices: [[0, 1]] as [number, number][],
        },
      },
    ];
    for (const candidate of rejected) {
      await expect(test.core.client.execute("comment.create", candidate)).rejects.toMatchObject({
        code: "invalid-input",
      });
    }
    await expect(test.core.client.query("review.get", { assetId: test.assetId })).resolves.toMatchObject({
      comments: [],
      nextCommentNumber: 1,
    });
  });

  it("refuses a target picked on a version that is no longer on screen", async () => {
    const test = await setup();
    await test.platform.writeFile(HERO, fakeAsset({ ...heroSpec, meshes: [{ name: "Body", grid: 4 }] }));
    await test.core.client.execute("asset.reload", { assetId: test.assetId });
    await expect(test.core.client.execute("comment.create", pinComment(test.assetId))).rejects.toMatchObject({
      code: "conflict",
    });
    await expect(test.platform.exists(`${HERO_REVIEW}/screenshots/c1.png`)).resolves.toBe(false);
    await expect(test.core.client.query("review.get", { assetId: test.assetId })).resolves.toMatchObject({
      comments: [],
    });
  });

  it("waits for the asset to load", async () => {
    const test = await startTestCore(heroFiles({ ...heroSpec, fail: "Broken." }));
    const assetId = await openAsset(test);
    await expect(test.core.client.execute("comment.create", pinComment(assetId))).rejects.toMatchObject({
      code: "unavailable",
    });
  });
});

describe("comment.update", () => {
  it("changes the given fields and keeps the rest", async () => {
    const test = await setup();
    await test.core.client.execute("comment.create", pinComment(test.assetId));
    test.clock.advance(1000);
    await test.core.client.execute("comment.update", {
      assetId: test.assetId,
      commentId: "c1",
      text: "  The thumb bends inward.  ",
      camera: { ...camera, fov: 45 },
    });
    const [comment] = (await savedReview(test)).comments;
    expect(comment).toMatchObject({
      text: "The thumb bends inward.",
      camera: { fov: 45 },
      updatedAt: "2026-10-08T14:02:01.000Z",
      context: { screenshot: "screenshots/c1.png" },
    });
  });

  it("re-anchors a new target on the version on screen and saves the new screenshot beside the old one", async () => {
    const test = await setup();
    await test.core.client.execute("comment.create", pinComment(test.assetId));
    const newPng = Uint8Array.of(9, 9);
    await test.core.client.execute("comment.update", {
      assetId: test.assetId,
      commentId: "c1",
      version: test.version,
      time: { kind: "none" },
      target: { kind: "surface", mesh: "Hero/Body", vertices: [0, 1, 3], weights: [1, 0, 0] },
      context: { ...pinContext, viewLabel: "left" },
      screenshot: newPng,
    });
    const [comment] = (await savedReview(test)).comments;
    expect(comment).toMatchObject({
      time: { kind: "none" },
      anchorRestPositions: [
        [0, 0, 0],
        [1, 0, 0],
        [0, 1, 0],
      ],
      context: { viewLabel: "left", screenshot: "screenshots/c1-2.png" },
    });
    await expect(test.platform.readFile(`${HERO_REVIEW}/screenshots/c1-2.png`)).resolves.toEqual(newPng);
    await expect(test.platform.readFile(`${HERO_REVIEW}/screenshots/c1.png`)).resolves.toEqual(png);
  });

  it("refuses a new time or target picked on a version that is no longer on screen", async () => {
    const test = await setup();
    await test.core.client.execute("comment.create", pinComment(test.assetId));
    await test.platform.writeFile(HERO, fakeAsset({ ...heroSpec, meshes: [{ name: "Body", grid: 4 }] }));
    await test.core.client.execute("asset.reload", { assetId: test.assetId });
    await expect(
      test.core.client.execute("comment.update", {
        assetId: test.assetId,
        commentId: "c1",
        version: test.version,
        time: { kind: "none" },
        context: pinContext,
        screenshot: null,
      }),
    ).rejects.toMatchObject({ code: "conflict" });
    await test.core.client.execute("comment.update", { assetId: test.assetId, commentId: "c1", text: "Text only." });
    await expect(test.core.client.query("review.get", { assetId: test.assetId })).resolves.toMatchObject({
      comments: [{ text: "Text only.", time: { kind: "frame" } }],
    });
  });

  it("requires a new context and screenshot with a new time or target", async () => {
    const test = await setup();
    await test.core.client.execute("comment.create", pinComment(test.assetId));
    await expect(
      test.core.client.execute("comment.update", { assetId: test.assetId, commentId: "c1", time: { kind: "none" } }),
    ).rejects.toMatchObject({ code: "invalid-input" });
  });

  it("refuses sent comments and unknown ids", async () => {
    const test = await setup();
    await test.core.client.execute("comment.create", pinComment(test.assetId));
    await sendQueue(test);
    await expect(
      test.core.client.execute("comment.update", { assetId: test.assetId, commentId: "c1", text: "Again." }),
    ).rejects.toMatchObject({ code: "conflict" });
    await expect(
      test.core.client.execute("comment.update", { assetId: test.assetId, commentId: "c9", text: "Again." }),
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("edits the pending follow-up of a reopened comment, not the message that was sent", async () => {
    const test = await setup();
    await test.core.client.execute("comment.create", pinComment(test.assetId));
    await sendQueue(test);
    await test.core.client.execute("comment.reopen", { assetId: test.assetId, commentId: "c1", text: "Still bent." });
    await test.core.client.execute("comment.update", {
      assetId: test.assetId,
      commentId: "c1",
      text: "Still bent out.",
    });
    const [comment] = (await savedReview(test)).comments;
    expect(comment?.text).toBe("The thumb bends outward.");
    expect(comment?.followUps.map((followUp) => followUp.text)).toEqual(["Still bent out."]);
  });
});

describe("comment lifecycle", () => {
  it("deletes drafts only", async () => {
    const test = await setup();
    await test.core.client.execute("comment.create", pinComment(test.assetId));
    await test.core.client.execute("comment.create", looseComment(test.assetId));
    await test.core.client.execute("comment.delete", { assetId: test.assetId, commentId: "c1" });
    expect(await savedReview(test)).toMatchObject({ queue: ["c2"], comments: [{ id: "c2" }] });
    await sendQueue(test);
    await expect(
      test.core.client.execute("comment.delete", { assetId: test.assetId, commentId: "c2" }),
    ).rejects.toMatchObject({ code: "conflict" });
  });

  it("resolves sent comments, and reopens sent or resolved ones at the end of the queue with a follow-up", async () => {
    const test = await setup();
    await test.core.client.execute("comment.create", pinComment(test.assetId));
    await test.core.client.execute("comment.create", looseComment(test.assetId));
    await expect(
      test.core.client.execute("comment.resolve", { assetId: test.assetId, commentId: "c1" }),
    ).rejects.toMatchObject({ code: "conflict" });
    await expect(
      test.core.client.execute("comment.reopen", { assetId: test.assetId, commentId: "c1", text: "Again." }),
    ).rejects.toMatchObject({ code: "conflict" });
    await sendQueue(test);

    await test.core.client.execute("comment.resolve", { assetId: test.assetId, commentId: "c1" });
    await test.core.client.execute("comment.create", looseComment(test.assetId, "The run is too fast."));
    test.clock.advance(5000);
    await test.core.client.execute("comment.reopen", {
      assetId: test.assetId,
      commentId: "c1",
      text: "It broke again.",
    });
    await test.core.client.execute("comment.reopen", {
      assetId: test.assetId,
      commentId: "c2",
      text: "Still washed out.",
    });
    const review = await savedReview(test);
    expect(review.queue).toEqual(["c3", "c1", "c2"]);
    expect(review.comments.find((comment) => comment.id === "c1")).toMatchObject({
      status: "draft",
      rounds: [1],
      followUps: [{ text: "It broke again.", createdAt: "2026-10-08T14:02:05.000Z", afterRound: 1 }],
    });
  });
});

describe("review.undo and review.redo", () => {
  it("step through creating, editing, resolving, reopening and deleting", async () => {
    const test = await setup();
    const { assetId } = test;
    const snapshot = async () => {
      const review = await test.core.client.query("review.get", { assetId });
      return { queue: review.queue, comments: review.comments.map(({ id, text, status }) => ({ id, text, status })) };
    };
    await expect(test.core.client.execute("review.undo", { assetId })).resolves.toEqual({ changed: false });
    await test.core.client.execute("comment.create", pinComment(assetId));
    await sendQueue(test);
    await expect(test.core.client.execute("review.undo", { assetId })).resolves.toEqual({ changed: false });

    const states = [await snapshot()];
    await test.core.client.execute("comment.resolve", { assetId, commentId: "c1" });
    states.push(await snapshot());
    await test.core.client.execute("comment.reopen", { assetId, commentId: "c1", text: "Again." });
    states.push(await snapshot());
    await test.core.client.execute("comment.create", looseComment(assetId));
    states.push(await snapshot());
    await test.core.client.execute("comment.update", { assetId, commentId: "c2", text: "Edited." });
    states.push(await snapshot());
    await test.core.client.execute("comment.delete", { assetId, commentId: "c2" });
    states.push(await snapshot());

    for (let index = states.length - 2; index >= 0; index--) {
      await expect(test.core.client.execute("review.undo", { assetId })).resolves.toEqual({ changed: true });
      expect(await snapshot()).toEqual(states[index]);
    }
    await expect(test.core.client.execute("review.undo", { assetId })).resolves.toEqual({ changed: false });
    for (let index = 1; index < states.length; index++) {
      await expect(test.core.client.execute("review.redo", { assetId })).resolves.toEqual({ changed: true });
      expect(await snapshot()).toEqual(states[index]);
    }
    await expect(test.core.client.execute("review.redo", { assetId })).resolves.toEqual({ changed: false });
    expect(await savedReview(test)).toMatchObject({ queue: ["c1"] });
  });

  it("drops the redo history after a new edit and keeps histories per asset", async () => {
    const test = await setup();
    const { assetId } = test;
    await test.platform.writeFile("/work/game/Assets/Art/Rock.fbx", fakeAsset(heroSpec));
    const rockId = await openAsset(test, "/work/game/Assets/Art/Rock.fbx");
    await test.core.client.execute("comment.create", pinComment(assetId));
    await test.core.client.execute("comment.create", pinComment(rockId));
    await test.core.client.execute("review.undo", { assetId });
    await test.core.client.execute("comment.create", looseComment(assetId));
    await expect(test.core.client.execute("review.redo", { assetId })).resolves.toEqual({ changed: false });
    await expect(test.core.client.query("review.get", { assetId })).resolves.toMatchObject({ queue: ["c2"] });
    await expect(test.core.client.execute("review.undo", { assetId: rockId })).resolves.toEqual({ changed: true });
    await expect(test.core.client.query("review.get", { assetId: rockId })).resolves.toMatchObject({ comments: [] });
  });

  it("restores a deleted comment's screenshot", async () => {
    const test = await setup();
    const { assetId } = test;
    await test.core.client.execute("comment.create", pinComment(assetId));
    await test.core.client.execute("comment.delete", { assetId, commentId: "c1" });
    await test.core.client.execute("review.undo", { assetId });
    await expect(test.core.client.query("comment.screenshot", { assetId, commentId: "c1" })).resolves.toEqual(png);
  });
});

describe("re-anchoring on a new version", () => {
  it("keeps anchors exactly on the same topology and moves them when the mesh changed, undo included", async () => {
    const test = await setup();
    const { assetId } = test;
    await test.core.client.execute("comment.create", pinComment(assetId));
    await test.core.client.execute("comment.update", { assetId, commentId: "c1", text: "Edited." });

    await test.platform.writeFile(
      HERO,
      fakeAsset({ ...heroSpec, meshes: [{ name: "Body", grid: 3, offset: [0, 0, 0.01] }] }),
    );
    const same = await test.core.client.execute("asset.reload", { assetId });
    let [comment] = (await savedReview(test)).comments;
    expect(comment).toMatchObject({
      anchorState: "exact",
      anchorVersion: same.version,
      target: { vertices: [4, 5, 7] },
    });
    expect(comment?.anchorRestPositions[0]).toEqual([1, 1, 0.01]);

    await test.platform.writeFile(HERO, fakeAsset({ ...heroSpec, meshes: [{ name: "Body", grid: 5 }] }));
    const changed = await test.core.client.execute("asset.reload", { assetId });
    [comment] = (await savedReview(test)).comments;
    expect(comment).toMatchObject({
      anchorState: "moved",
      anchorVersion: changed.version,
      madeOnVersion: test.version,
    });

    await test.core.client.execute("review.undo", { assetId });
    [comment] = (await savedReview(test)).comments;
    expect(comment).toMatchObject({
      text: "The thumb bends outward.",
      anchorState: "moved",
      anchorVersion: changed.version,
    });

    await test.platform.writeFile(
      HERO,
      fakeAsset({ ...heroSpec, meshes: [{ name: "Body", grid: 4, offset: [0, 0, 1] }] }),
    );
    const far = await test.core.client.execute("asset.reload", { assetId });
    [comment] = (await savedReview(test)).comments;
    expect(comment).toMatchObject({ anchorState: "detached", anchorVersion: changed.version });
    expect((await savedReview(test)).versions.map((version) => version.id)).toEqual([
      test.version,
      same.version,
      changed.version,
      far.version,
    ]);
  });

  it("re-anchors from the stored rest positions after a restart, when the old file is gone", async () => {
    const test = await setup();
    await test.core.client.execute("comment.create", pinComment(test.assetId));
    test.core.dispose();
    await test.platform.writeFile(HERO, fakeAsset({ ...heroSpec, meshes: [{ name: "Body", grid: 5 }] }));

    const restarted = await ArcueCore.start({ platform: test.platform });
    const window = new FakeWindow(restarted, "window-1");
    const { assetId } = await window.client.execute("asset.open", { path: HERO });
    await restarted.idle();
    const { version } = await restarted.client.query("scene.get", { assetId });
    const review = await restarted.client.query("review.get", { assetId });
    expect(review.comments[0]).toMatchObject({
      anchorState: "moved",
      anchorVersion: version,
      madeOnVersion: test.version,
      target: { kind: "surface", mesh: "Hero/Body" },
    });
    expect(review.versions).toHaveLength(2);
  });
});
