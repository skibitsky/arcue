import type { CommandInput, CoreClient, ReviewFile } from "@arcue/protocol";
import { createMemoryChannel, createPeer, createRemoteClient, roundDataSchema } from "@arcue/protocol";
import { describe, expect, it } from "vitest";
import { ArcueCore } from "./core";
import type { TestCore } from "./test-support";
import {
  camera,
  FakeWindow,
  fakeAsset,
  HERO,
  HERO_REVIEW,
  HERO_VERSION,
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

async function create(
  test: TestCore & { assetId: string },
  input: CommandInput<"comment.create"> = pinComment(test.assetId),
): Promise<string> {
  return (await test.core.client.execute("comment.create", input)).commentId;
}

describe("comment.create", () => {
  it("saves a draft with the clip's display name, the anchor's version and rest positions, and its screenshot", async () => {
    const test = await setup();
    const changes: ReviewFile[] = [];
    test.core.client.subscribe("review.changed", ({ review }) => changes.push(review));
    test.clock.advance(60_000);
    const { commentId } = await test.window.client.execute("comment.create", pinComment(test.assetId));
    expect(commentId).toMatch(/^c[0-9a-hjkmnp-tv-z]{26}$/);

    const review = await savedReview(test);
    expect(changes).toEqual([review]);
    expect(review.queue).toEqual([commentId]);
    expect(review.comments).toEqual([
      {
        id: commentId,
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
        context: { ...pinContext, screenshot: `screenshots/${commentId}.png` },
        anchorState: "exact",
        followUps: [],
        rounds: [],
        reopenedFrom: null,
      },
    ]);
    await expect(test.platform.readFile(`${HERO_REVIEW}/screenshots/${commentId}.png`)).resolves.toEqual(png);
    await expect(test.core.client.query("comment.screenshot", { assetId: test.assetId, commentId })).resolves.toEqual(
      png,
    );
  });

  it("writes review data only atomically", async () => {
    const test = await setup();
    const commentId = await create(test);
    await test.core.client.execute("comment.update", { assetId: test.assetId, commentId, text: "Changed." });
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

  it("never reuses an id, and saves a comment without target or screenshot", async () => {
    const test = await setup();
    const deleted = await create(test);
    await test.core.client.execute("comment.delete", { assetId: test.assetId, commentId: deleted });
    const commentId = await create(test, looseComment(test.assetId));
    expect(commentId).not.toBe(deleted);
    const review = await savedReview(test);
    expect(review.comments[0]).toMatchObject({ id: commentId, target: null, anchorRestPositions: [] });
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
    });
  });

  it("refuses a target picked on a version that is no longer on screen", async () => {
    const test = await setup();
    await test.platform.writeFile(HERO, fakeAsset({ ...heroSpec, meshes: [{ name: "Body", grid: 4 }] }));
    await test.core.client.execute("asset.reload", { assetId: test.assetId });
    await expect(test.core.client.execute("comment.create", pinComment(test.assetId))).rejects.toMatchObject({
      code: "conflict",
    });
    await expect(test.platform.exists(`${HERO_REVIEW}/screenshots`)).resolves.toBe(false);
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
    const commentId = await create(test);
    test.clock.advance(1000);
    await test.core.client.execute("comment.update", {
      assetId: test.assetId,
      commentId,
      text: "  The thumb bends inward.  ",
      camera: { ...camera, fov: 45 },
    });
    const [comment] = (await savedReview(test)).comments;
    expect(comment).toMatchObject({
      text: "The thumb bends inward.",
      camera: { fov: 45 },
      updatedAt: "2026-10-08T14:02:01.000Z",
      context: { screenshot: `screenshots/${commentId}.png` },
    });
  });

  it("re-anchors a new target on the version on screen and saves the new screenshot beside the old one", async () => {
    const test = await setup();
    const commentId = await create(test);
    const newPng = Uint8Array.of(9, 9);
    await test.core.client.execute("comment.update", {
      assetId: test.assetId,
      commentId,
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
      context: { viewLabel: "left", screenshot: `screenshots/${commentId}-2.png` },
    });
    await expect(test.platform.readFile(`${HERO_REVIEW}/screenshots/${commentId}-2.png`)).resolves.toEqual(newPng);
    await expect(test.platform.readFile(`${HERO_REVIEW}/screenshots/${commentId}.png`)).resolves.toEqual(png);
  });

  it("refuses a new time or target picked on a version that is no longer on screen", async () => {
    const test = await setup();
    const commentId = await create(test);
    await test.platform.writeFile(HERO, fakeAsset({ ...heroSpec, meshes: [{ name: "Body", grid: 4 }] }));
    await test.core.client.execute("asset.reload", { assetId: test.assetId });
    await expect(
      test.core.client.execute("comment.update", {
        assetId: test.assetId,
        commentId,
        version: test.version,
        time: { kind: "none" },
        context: pinContext,
        screenshot: null,
      }),
    ).rejects.toMatchObject({ code: "conflict" });
    await test.core.client.execute("comment.update", { assetId: test.assetId, commentId, text: "Text only." });
    await expect(test.core.client.query("review.get", { assetId: test.assetId })).resolves.toMatchObject({
      comments: [{ text: "Text only.", time: { kind: "frame" } }],
    });
  });

  it("requires a new context and screenshot with a new time or target", async () => {
    const test = await setup();
    const commentId = await create(test);
    await expect(
      test.core.client.execute("comment.update", { assetId: test.assetId, commentId, time: { kind: "none" } }),
    ).rejects.toMatchObject({ code: "invalid-input" });
  });

  it("refuses sent comments and unknown ids", async () => {
    const test = await setup();
    const commentId = await create(test);
    await sendQueue(test);
    await expect(
      test.core.client.execute("comment.update", { assetId: test.assetId, commentId, text: "Again." }),
    ).rejects.toMatchObject({ code: "conflict" });
    await expect(
      test.core.client.execute("comment.update", { assetId: test.assetId, commentId: "c9", text: "Again." }),
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("edits the pending follow-up of a reopened comment, not the message that was sent", async () => {
    const test = await setup();
    const commentId = await create(test);
    await sendQueue(test);
    await test.core.client.execute("comment.reopen", { assetId: test.assetId, commentId, text: "Still bent." });
    await test.core.client.execute("comment.update", {
      assetId: test.assetId,
      commentId,
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
    const first = await create(test);
    const second = await create(test, looseComment(test.assetId));
    await test.core.client.execute("comment.delete", { assetId: test.assetId, commentId: first });
    expect(await savedReview(test)).toMatchObject({ queue: [second], comments: [{ id: second }] });
    await sendQueue(test);
    await expect(
      test.core.client.execute("comment.delete", { assetId: test.assetId, commentId: second }),
    ).rejects.toMatchObject({ code: "conflict" });
  });

  it("resolves sent comments, and reopens sent or resolved ones at the end of the queue with a follow-up", async () => {
    const test = await setup();
    const first = await create(test);
    const second = await create(test, looseComment(test.assetId));
    await expect(
      test.core.client.execute("comment.resolve", { assetId: test.assetId, commentId: first }),
    ).rejects.toMatchObject({ code: "conflict" });
    await expect(
      test.core.client.execute("comment.reopen", { assetId: test.assetId, commentId: first, text: "Again." }),
    ).rejects.toMatchObject({ code: "conflict" });
    await sendQueue(test);

    await test.core.client.execute("comment.resolve", { assetId: test.assetId, commentId: first });
    const third = await create(test, looseComment(test.assetId, "The run is too fast."));
    test.clock.advance(5000);
    await test.core.client.execute("comment.reopen", {
      assetId: test.assetId,
      commentId: first,
      text: "It broke again.",
    });
    await test.core.client.execute("comment.reopen", {
      assetId: test.assetId,
      commentId: second,
      text: "Still washed out.",
    });
    const review = await savedReview(test);
    expect(review.queue).toEqual([third, first, second]);
    expect(review.comments.find((comment) => comment.id === first)).toMatchObject({
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
    const first = await create(test);
    await sendQueue(test);
    await expect(test.core.client.execute("review.undo", { assetId })).resolves.toEqual({ changed: false });

    const states = [await snapshot()];
    await test.core.client.execute("comment.resolve", { assetId, commentId: first });
    states.push(await snapshot());
    await test.core.client.execute("comment.reopen", { assetId, commentId: first, text: "Again." });
    states.push(await snapshot());
    const second = await create(test, looseComment(assetId));
    states.push(await snapshot());
    await test.core.client.execute("comment.update", { assetId, commentId: second, text: "Edited." });
    states.push(await snapshot());
    await test.core.client.execute("comment.delete", { assetId, commentId: second });
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
    expect(await savedReview(test)).toMatchObject({ queue: [first] });
  });

  it("drops the redo history after a new edit and keeps histories per asset", async () => {
    const test = await setup();
    const { assetId } = test;
    await test.platform.writeFile("/work/game/Assets/Art/Rock.fbx", fakeAsset(heroSpec));
    const rockId = await openAsset(test, "/work/game/Assets/Art/Rock.fbx");
    await test.core.client.execute("comment.create", pinComment(assetId));
    await test.core.client.execute("comment.create", pinComment(rockId));
    await test.core.client.execute("review.undo", { assetId });
    const kept = await create(test, looseComment(assetId));
    await expect(test.core.client.execute("review.redo", { assetId })).resolves.toEqual({ changed: false });
    await expect(test.core.client.query("review.get", { assetId })).resolves.toMatchObject({ queue: [kept] });
    await expect(test.core.client.execute("review.undo", { assetId: rockId })).resolves.toEqual({ changed: true });
    await expect(test.core.client.query("review.get", { assetId: rockId })).resolves.toMatchObject({ comments: [] });
  });

  it("restores a deleted comment's screenshot", async () => {
    const test = await setup();
    const { assetId } = test;
    const commentId = await create(test);
    await test.core.client.execute("comment.delete", { assetId, commentId });
    await test.core.client.execute("review.undo", { assetId });
    await expect(test.core.client.query("comment.screenshot", { assetId, commentId })).resolves.toEqual(png);
  });
});

describe("re-anchoring on a new version", () => {
  it("keeps anchors exactly on the same topology and moves them when the mesh changed, undo included", async () => {
    const test = await setup();
    const { assetId } = test;
    const commentId = await create(test);
    await test.core.client.execute("comment.update", { assetId, commentId, text: "Edited." });

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

/** A review.json as Arcue wrote it while comment ids were numbered: a sent comment and a draft. */
function numberedReview(): unknown {
  const comment = (id: string, status: "draft" | "sent", screenshot: string) => ({
    id,
    text: `Comment ${id}.`,
    status,
    createdAt: "2026-10-01T09:00:00.000Z",
    updatedAt: "2026-10-01T09:00:00.000Z",
    madeOnVersion: HERO_VERSION,
    time: { kind: "none" },
    target: null,
    anchorVersion: HERO_VERSION,
    anchorRestPositions: [],
    camera,
    context: { vertexCount: 0, bones: [], centroid: null, joints: [], viewLabel: "front", screenshot },
    anchorState: "exact",
    followUps: [],
    rounds: status === "sent" ? [1] : [],
    reopenedFrom: null,
  });
  return {
    schemaVersion: 1,
    asset: { path: "Assets/Art/Hero.fbx" },
    versions: [],
    comments: [comment("c1", "sent", "rounds/round-1/c1.png"), comment("c2", "draft", "screenshots/c2.png")],
    queue: ["c2"],
    rounds: [{ number: 1, createdAt: "2026-10-01T09:05:00.000Z", version: HERO_VERSION, comments: ["c1"] }],
    nextCommentNumber: 3,
  };
}

describe("a review written while ids were numbered", () => {
  it("loads, takes new comments with random ids, numbers the prompt by queue position and saves without the counter", async () => {
    const test = await startTestCore({
      ...heroFiles(),
      [`${HERO_REVIEW}/review.json`]: JSON.stringify(numberedReview()),
      [`${HERO_REVIEW}/screenshots/c2.png`]: png,
      [`${HERO_REVIEW}/rounds/round-1/c1.png`]: png,
    });
    const assetId = await openAsset(test);
    const added = await create({ ...test, assetId });
    expect(added).toMatch(/^c[0-9a-hjkmnp-tv-z]{26}$/);

    const saved = await savedReview(test);
    expect(saved).not.toHaveProperty("nextCommentNumber");
    expect(saved.queue).toEqual(["c2", added]);
    expect(saved.comments.map((comment) => comment.id)).toEqual(["c1", "c2", added]);
    await expect(test.core.client.query("comment.screenshot", { assetId, commentId: "c1" })).resolves.toEqual(png);

    await test.core.client.execute("comment.delete", { assetId, commentId: "c2" });
    await test.core.client.execute("review.undo", { assetId });
    expect((await savedReview(test)).queue).toEqual(["c2", added]);

    const { prompt } = await test.core.client.execute("round.copy", { assetId });
    const round = roundDataSchema.parse(await readJson(test.platform, `${HERO_REVIEW}/rounds/round-2/round.json`));
    expect(round.comments.map(({ id, number, screenshot }) => ({ id, number, screenshot }))).toEqual([
      { id: "c2", number: 1, screenshot: "c2.png" },
      { id: added, number: 2, screenshot: `${added}.png` },
    ]);
    expect(prompt).toContain(`screenshot: ${added}.png`);
    await expect(test.platform.readFile(`${HERO_REVIEW}/rounds/round-2/${added}.png`)).resolves.toEqual(png);
  });
});

describe("the review's revision", () => {
  it("goes up by one with each save, counting from the file on disk", async () => {
    const test = await setup();
    const { assetId } = test;
    const loaded = (await savedReview(test)).revision;
    const commentId = await create(test);
    expect((await savedReview(test)).revision).toBe(loaded + 1);
    await test.core.client.execute("comment.update", { assetId, commentId, text: "Edited." });
    expect((await savedReview(test)).revision).toBe(loaded + 2);
    await test.core.client.execute("warning.dismissAll", { assetId });
    expect((await savedReview(test)).revision).toBe(loaded + 2);

    const onDisk = await savedReview(test);
    await test.platform.writeFile(`${HERO_REVIEW}/review.json`, JSON.stringify({ ...onDisk, revision: 40 }));
    await test.core.client.execute("comment.delete", { assetId, commentId });
    expect((await savedReview(test)).revision).toBe(41);
    await expect(test.core.client.query("review.get", { assetId })).resolves.toMatchObject({ revision: 41 });
  });

  it("leaves review.json as it is when a change would write the same text, as reopening an asset does", async () => {
    const test = await setup();
    await create(test);
    const text = await test.platform.readText(`${HERO_REVIEW}/review.json`);
    await test.core.client.execute("asset.close", { assetId: test.assetId });
    await openAsset(test);
    await expect(test.platform.readText(`${HERO_REVIEW}/review.json`)).resolves.toBe(text);
  });
});

/** A bridge connected to the test's core, acting for `user` when given. */
function bridge(test: TestCore, user?: { name: string }): CoreClient {
  const [coreSide, bridgeSide] = createMemoryChannel();
  test.core.connect(coreSide, { connection: "bridge-1", caller: "bridge", ...(user ? { user: () => user } : {}) });
  return createRemoteClient(createPeer(bridgeSide));
}

describe("authors", () => {
  it("records who made comments, follow-ups and rounds, as the caller names them", async () => {
    const test = await setup();
    const { assetId } = test;
    const agent = bridge(test, { name: "Agent" });
    const { commentId } = await agent.execute("comment.create", pinComment(assetId));
    await agent.execute("round.copy", { assetId });
    await agent.execute("comment.reopen", { assetId, commentId, text: "Still bent." });

    const review = await savedReview(test);
    expect(review.comments[0]?.author).toEqual({ name: "Agent" });
    expect(review.comments[0]?.followUps[0]?.author).toEqual({ name: "Agent" });
    expect(review.rounds[0]?.author).toEqual({ name: "Agent" });
  });

  it("names the authorName setting as the author of what windows do, and nobody without it", async () => {
    const test = await setup();
    const { assetId } = test;
    const before = (await test.window.client.execute("comment.create", pinComment(assetId))).commentId;
    await test.core.client.execute("settings.set", { authorName: "Ana" });
    const after = (await test.window.client.execute("comment.create", pinComment(assetId))).commentId;
    const fromBridge = (await bridge(test).execute("comment.create", looseComment(assetId))).commentId;
    const fromCore = await create(test);

    const authors = new Map((await savedReview(test)).comments.map((comment) => [comment.id, comment.author]));
    expect(authors.get(before)).toBeUndefined();
    expect(authors.get(after)).toEqual({ name: "Ana" });
    expect(authors.get(fromBridge)).toBeUndefined();
    expect(authors.get(fromCore)).toBeUndefined();
  });

  it("ignores a blank authorName in settings.json and keeps the other settings", async () => {
    const test = await startTestCore({
      ...heroFiles(),
      "/app-data/settings.json": JSON.stringify({ coordinates: "z-up-blender", authorName: " " }),
    });
    await expect(test.core.client.query("settings.get", {})).resolves.toEqual({ coordinates: "z-up-blender" });
  });
});
