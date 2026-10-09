import type { ReviewFile } from "@arcue/protocol";
import { describe, expect, it } from "vitest";
import { contentHash } from "./hash";
import {
  fakeAsset,
  HERO,
  HERO_REVIEW,
  HERO_VERSION,
  heroFiles,
  heroSpec,
  openAsset,
  pinComment,
  readJson,
  startTestCore,
} from "./test-support";

const GUID = "4f2a9c1e8b7d4e3f9a0b1c2d3e4f5a6b";
const MEMBER_GUID = "0123456789abcdef0123456789abcdef";
const heroBytes = new TextEncoder().encode(fakeAsset(heroSpec));
const run = fakeAsset({ meshes: [], clips: [{ name: "Run", frames: 11 }] });

describe("file identity", () => {
  it("keeps legacy short version references and immutable rounds when recording full identities", async () => {
    const test = await startTestCore(heroFiles());
    const first = await openAsset(test);
    await test.core.client.execute("comment.create", pinComment(first));
    await test.core.client.execute("round.copy", { assetId: first });
    const saved = await test.core.client.query("review.get", { assetId: first });
    await test.core.client.execute("asset.close", { assetId: first });
    const short = HERO_VERSION.slice(0, 7);
    const reviewPath = `${HERO_REVIEW}/review.json`;
    const roundPath = `${HERO_REVIEW}/rounds/round-1/round.json`;
    await test.platform.writeFile(
      reviewPath,
      JSON.stringify({
        ...saved,
        versions: saved.versions.map((version) => ({ ...version, id: short })),
        comments: saved.comments.map((comment) => ({ ...comment, madeOnVersion: short, anchorVersion: short })),
        rounds: saved.rounds.map((round) => ({ ...round, version: short })),
      }),
    );
    const oldRound = (await test.platform.readText(roundPath)).replaceAll(HERO_VERSION, short);
    await test.platform.writeFile(roundPath, oldRound);
    const assetId = await openAsset(test);
    const review = await test.core.client.query("review.get", { assetId });
    expect(review.versions.map((version) => version.id)).toEqual([short, HERO_VERSION]);
    expect(review.rounds[0]?.version).toBe(short);
    expect(review.comments[0]).toMatchObject({
      madeOnVersion: short,
      anchorVersion: HERO_VERSION,
      anchorState: "exact",
      target: { vertices: [4, 5, 7] },
    });
    await expect(test.platform.readText(roundPath)).resolves.toBe(oldRound);
  });

  it("records the model's full hash and size with each version, and its Unity GUID on the asset", async () => {
    const test = await startTestCore({ ...heroFiles(), [`${HERO}.meta`]: `fileFormatVersion: 2\nguid: ${GUID}\n` });
    await openAsset(test);
    const review = (await readJson(test.platform, `${HERO_REVIEW}/review.json`)) as ReviewFile;
    expect(review.asset).toEqual({ path: "Assets/Art/Hero.fbx", guid: GUID });
    expect(review.versions[0]).toMatchObject({
      id: HERO_VERSION,
      hash: contentHash(heroBytes),
      size: heroBytes.byteLength,
    });
    expect(review.versions[0]?.hash).toBe(HERO_VERSION);
  });

  it("records each file of a composition with its hash, size and GUID", async () => {
    const test = await startTestCore({
      ...heroFiles(),
      "/work/game/Assets/Art/Hero@Run.fbx": run,
      "/work/game/Assets/Art/Hero@Run.fbx.meta": `guid: ${MEMBER_GUID}\n`,
    });
    await openAsset(test);
    const review = (await readJson(test.platform, `${HERO_REVIEW}/review.json`)) as ReviewFile;
    expect(review.versions[0]?.files).toEqual([
      { file: "Hero.fbx", id: HERO_VERSION, hash: contentHash(heroBytes), size: heroBytes.byteLength },
      {
        file: "Hero@Run.fbx",
        id: contentHash(new TextEncoder().encode(run)),
        hash: contentHash(new TextEncoder().encode(run)),
        size: run.length,
        guid: MEMBER_GUID,
      },
    ]);
  });

  it("loads a review an older build wrote, and fills in the identity of a version it recorded without one", async () => {
    const older = {
      schemaVersion: 1,
      asset: { path: "Assets/Art/Hero.fbx" },
      versions: [
        {
          id: HERO_VERSION,
          fileModifiedAt: "2026-10-01T09:00:00.000Z",
          loadedAt: "2026-10-01T09:00:00.000Z",
          exporter: "Blender 5.2",
          meshes: [],
        },
      ],
      comments: [],
      queue: [],
      rounds: [],
      revision: 3,
    };
    const test = await startTestCore({ ...heroFiles(), [`${HERO_REVIEW}/review.json`]: JSON.stringify(older) });
    const assetId = await openAsset(test);
    const review = await test.core.client.query("review.get", { assetId });
    expect(review.versions).toEqual([
      { ...older.versions[0], hash: contentHash(heroBytes), size: heroBytes.byteLength },
    ]);
    expect(review.revision).toBe(4);
  });

  it("keeps the GUID it knew when the .meta file goes away", async () => {
    const test = await startTestCore({ ...heroFiles(), [`${HERO}.meta`]: `guid: ${GUID}\n` });
    const assetId = await openAsset(test);
    await test.platform.remove(`${HERO}.meta`);
    await test.platform.writeFile(HERO, fakeAsset({ ...heroSpec, meshes: [{ name: "Body", grid: 4 }] }));
    await test.core.client.execute("asset.reload", { assetId });
    const review = await test.core.client.query("review.get", { assetId });
    expect(review.versions).toHaveLength(2);
    expect(review.asset.guid).toBe(GUID);
  });
});
