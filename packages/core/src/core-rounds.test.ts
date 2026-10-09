import type { ReviewFile, RoundData } from "@arcue/protocol";
import { roundDataSchema } from "@arcue/protocol";
import { describe, expect, it } from "vitest";
import { ArcueCore } from "./core";
import type { TestCore } from "./test-support";
import {
  HERO_REVIEW,
  heroFiles,
  looseComment,
  openAsset,
  pinComment,
  png,
  readJson,
  startTestCore,
} from "./test-support";

async function setup(clipboard = false): Promise<TestCore & { assetId: string; version: string }> {
  const test = await startTestCore(heroFiles(), { clipboard });
  const assetId = await openAsset(test);
  const { version } = await test.core.client.query("scene.get", { assetId });
  return { ...test, assetId, version };
}

const regionComment = (assetId: string) => ({
  ...pinComment(assetId, "Soften this whole rim."),
  time: { kind: "range" as const, clip: "Armature|Run", start: 12, end: 24 },
  target: {
    kind: "region" as const,
    mesh: "Hero/Body",
    triangles: [[0, 1]] as [number, number][],
    vertices: [
      [0, 1],
      [3, 4],
    ] as [number, number][],
  },
  context: {
    vertexCount: 4,
    bones: [
      { name: "Spine", share: 0.7 },
      { name: "Hips", share: 0.27 },
      { name: "Chest", share: 0.03 },
    ],
    centroid: { rest: [0.5, 0.5, 0] as [number, number, number], posed: [0.5, 0.75, 0.25] as [number, number, number] },
    joints: [],
    viewLabel: "back, slightly above",
  },
});

describe("round.copy", () => {
  it("saves the round, marks its comments sent and returns the prompt", async () => {
    const test = await setup();
    const { assetId } = test;
    const copied: number[] = [];
    test.core.client.subscribe("round.copied", ({ round }) => copied.push(round));
    const { commentId: first } = await test.core.client.execute("comment.create", pinComment(assetId));
    await test.core.client.execute("comment.update", { assetId, commentId: first, screenshot: Uint8Array.of(7) });
    const { commentId: second } = await test.core.client.execute("comment.create", looseComment(assetId));
    const { commentId: third } = await test.core.client.execute("comment.create", regionComment(assetId));
    test.clock.advance(90_000);

    const result = await test.window.client.execute("round.copy", { assetId });
    expect(result).toMatchObject({ round: 1, copiedToClipboard: false });
    expect(copied).toEqual([1]);
    const folder = `${HERO_REVIEW}/rounds/round-1`;
    await expect(test.platform.readText(`${folder}/prompt.md`)).resolves.toBe(result.prompt);
    await expect(test.platform.readFile(`${folder}/${first}.png`)).resolves.toEqual(Uint8Array.of(7));
    await expect(test.platform.readFile(`${folder}/${third}.png`)).resolves.toEqual(png);
    await expect(test.platform.exists(`${folder}/${second}.png`)).resolves.toBe(false);
    await expect(test.platform.exists(`${HERO_REVIEW}/screenshots/${first}.png`)).resolves.toBe(false);
    await expect(test.platform.list(`${HERO_REVIEW}/screenshots`)).resolves.toEqual([]);

    const data = roundDataSchema.parse(await readJson(test.platform, `${folder}/round.json`));
    expect(data.asset).toEqual({
      path: "Assets/Art/Hero.fbx",
      version: test.version,
      exporter: "Blender 5.2",
      fps: 60,
      space: { units: "m", up: "+Y", handedness: "right" },
    });
    expect(data.comments[0]).toEqual({
      id: first,
      number: 1,
      text: "The thumb bends outward.",
      time: { clip: "Armature|Charge", clipDisplayName: "Charge", frame: 34, seconds: 0.567 },
      target: {
        kind: "point",
        mesh: "Body",
        meshPath: "Hero/Body",
        vertices: [4, 5, 7],
        weights: [0.5, 0.25, 0.25],
        position: { rest: [1.25, 1.25, 0], posed: [1.25, 1.5, 0.25] },
        bones: [
          { name: "Head", share: 0.9 },
          { name: "Neck", share: 0.1 },
        ],
      },
      pose: { joints: [{ name: "Head", path: "Armature/Head", position: [1, 1.75, 0] }] },
      camera: { position: [0, 1, 3], target: [0, 1, 0], up: [0, 1, 0], fov: 30, label: "front" },
      screenshot: `${first}.png`,
      madeOnVersion: test.version,
      anchorState: "exact",
      anchorVersion: test.version,
      earlierMessages: [],
    });
    expect(data.comments[1]).toMatchObject({
      id: second,
      number: 2,
      time: null,
      target: null,
      pose: null,
      screenshot: null,
    });
    expect(data.comments[2]).toMatchObject({
      id: third,
      number: 3,
      time: { frames: [12, 24], seconds: [0.2, 0.4] },
      target: { kind: "region", vertexCount: 4, centroid: { rest: [0.5, 0.5, 0] } },
    });

    const review = (await readJson(test.platform, `${HERO_REVIEW}/review.json`)) as ReviewFile;
    expect(review.queue).toEqual([]);
    expect(review.rounds).toEqual([
      { number: 1, createdAt: "2026-10-08T14:03:30.000Z", version: test.version, comments: [first, second, third] },
    ]);
    expect(review.comments.map((comment) => [comment.status, comment.rounds, comment.context.screenshot])).toEqual([
      ["sent", [1], `rounds/round-1/${first}.png`],
      ["sent", [1], null],
      ["sent", [1], `rounds/round-1/${third}.png`],
    ]);
    await expect(test.core.client.query("comment.screenshot", { assetId, commentId: first })).resolves.toEqual(
      Uint8Array.of(7),
    );

    expect(result.prompt.replaceAll(first, "<first>").replaceAll(third, "<third>")).toMatchInlineSnapshot(`
      "3D review · round 1 · 3 comments
      Asset: /work/game/Assets/Art/Hero.fbx
      Version 737efd4, exported 14:02
      Data and screenshots: /work/game/.arcue/reviews/Assets/Art/Hero.fbx/rounds/round-1/
      Meters, right-handed, Y up. Frames count from each clip's first frame (0) at 60 fps.
      Vertex numbers follow the file's vertex order, which is Blender's order for Blender exports.

      1. Clip "Charge", frame 34 · point on "Body", near bone "Head"
         View: front · screenshot: <first>.png
         "The thumb bends outward."

      2. Rest pose · no surface target
         "Textures look washed out."

      3. Clip "Run", frames 12–24 · region on "Body", 4 vertices
         Bones: Spine 70%, Hips 27%
         View: back, slightly above · screenshot: <third>.png
         "Soften this whole rim.""
    `);
  });

  it("copies to the platform clipboard when there is one", async () => {
    const test = await setup(true);
    await test.core.client.execute("comment.create", looseComment(test.assetId));
    const result = await test.core.client.execute("round.copy", { assetId: test.assetId });
    expect(result.copiedToClipboard).toBe(true);
    expect(test.platform.clipboardText).toBe(result.prompt);
  });

  it("marks a reopened comment as a follow-up and lists its earlier messages", async () => {
    const test = await setup();
    const { assetId } = test;
    const { commentId } = await test.core.client.execute("comment.create", pinComment(assetId));
    await test.core.client.execute("round.copy", { assetId });
    await test.core.client.execute("comment.reopen", { assetId, commentId, text: "It still bends outward." });
    await test.core.client.execute("round.copy", { assetId });
    await test.core.client.execute("comment.resolve", { assetId, commentId });
    await test.core.client.execute("comment.reopen", { assetId, commentId, text: "Now it bends too far in." });
    const third = await test.core.client.execute("round.copy", { assetId });

    expect(third.round).toBe(3);
    const data = (await readJson(test.platform, `${HERO_REVIEW}/rounds/round-3/round.json`)) as RoundData;
    expect(data.comments[0]).toMatchObject({
      text: "Now it bends too far in.",
      screenshot: `${commentId}.png`,
      earlierMessages: [
        { round: 1, text: "The thumb bends outward." },
        { round: 2, text: "It still bends outward." },
      ],
    });
    await expect(test.platform.readFile(`${HERO_REVIEW}/rounds/round-3/${commentId}.png`)).resolves.toEqual(png);
    await expect(test.platform.exists(`${HERO_REVIEW}/rounds/round-1/${commentId}.png`)).resolves.toBe(true);
    expect(third.prompt.split("\n\n")[1]?.replaceAll(commentId, "<id>")).toMatchInlineSnapshot(`
      "1. Clip "Charge", frame 34 · point on "Body", near bone "Head" · follow-up, first sent in round 1
         View: front · screenshot: <id>.png
         Round 1: "The thumb bends outward."
         Round 2: "It still bends outward."
         "Now it bends too far in.""
    `);
  });

  it("states positions in Blender's Z-up convention once the setting says so, and keeps the setting", async () => {
    const test = await setup();
    await expect(test.core.client.execute("settings.set", { coordinates: "z-up-blender" })).resolves.toEqual({
      coordinates: "z-up-blender",
    });
    await test.core.client.execute("comment.create", pinComment(test.assetId));
    const { prompt } = await test.core.client.execute("round.copy", { assetId: test.assetId });
    expect(prompt).toContain("Meters, right-handed, Z up as in Blender.");
    const data = (await readJson(test.platform, `${HERO_REVIEW}/rounds/round-1/round.json`)) as RoundData;
    expect(data.asset.space).toEqual({ units: "m", up: "+Z", handedness: "right" });
    expect(data.comments[0]).toMatchObject({
      target: { position: { rest: [1.25, 0, 1.25], posed: [1.25, -0.25, 1.5] } },
      pose: { joints: [{ position: [1, 0, 1.75] }] },
      camera: { position: [0, -3, 1], target: [0, 0, 1], up: [0, 0, 1] },
    });
    const review = await test.core.client.query("review.get", { assetId: test.assetId });
    expect(review.comments[0]?.camera.position).toEqual([0, 1, 3]);

    const restarted = await ArcueCore.start({ platform: test.platform });
    await expect(restarted.client.query("settings.get", {})).resolves.toEqual({ coordinates: "z-up-blender" });
    await expect(restarted.client.execute("settings.set", { coordinates: "x-up" as "y-up" })).rejects.toMatchObject({
      code: "invalid-input",
    });
    await expect(restarted.client.execute("settings.set", {})).resolves.toEqual({ coordinates: "z-up-blender" });
  });

  it("refuses an empty queue", async () => {
    const test = await setup();
    await expect(test.core.client.execute("round.copy", { assetId: test.assetId })).rejects.toMatchObject({
      code: "conflict",
    });
  });

  it("never overwrites a round folder that is already on disk", async () => {
    const test = await startTestCore({ ...heroFiles(), [`${HERO_REVIEW}/rounds/round-1/prompt.md`]: "earlier" });
    const assetId = await openAsset(test);
    await test.core.client.execute("comment.create", looseComment(assetId));
    await expect(test.core.client.execute("round.copy", { assetId })).resolves.toMatchObject({ round: 2 });
    await expect(test.platform.readText(`${HERO_REVIEW}/rounds/round-1/prompt.md`)).resolves.toBe("earlier");
  });
});
