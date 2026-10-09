import type { PartView, ReviewFile } from "@arcue/protocol";
import { roundDataSchema } from "@arcue/protocol";
import { describe, expect, it } from "vitest";
import { versionIdOf } from "./hash";
import type { FakeAssetSpec, TestCore } from "./test-support";
import { fakeAsset, HERO_REVIEW, heroFiles, looseComment, openAsset, readJson, startTestCore } from "./test-support";

const spec: FakeAssetSpec = {
  meshes: [
    { name: "Body_LOD0", grid: 3 },
    { name: "Body_LOD1", grid: 2, offset: [3, 0, 0] },
    { name: "UCX_Body", grid: 2, offset: [-3, 0, 0] },
    { name: "Boulder2", grid: 2, offset: [0, 3, 0] },
  ],
  fps: 30,
};
const version = versionIdOf(new TextEncoder().encode(fakeAsset(spec)));
const defaultView: PartView = { hidden: [], shown: [], isolated: null, lod: 0 };

async function setup(): Promise<TestCore & { assetId: string }> {
  const test = await startTestCore(heroFiles(spec));
  return { ...test, assetId: await openAsset(test) };
}

async function storedParts(test: TestCore): Promise<(PartView | undefined)[]> {
  const review = (await readJson(test.platform, `${HERO_REVIEW}/review.json`)) as ReviewFile;
  return review.comments.map((comment) => comment.parts);
}

describe("parts", () => {
  it("lists the scene's parts with the meshes and triangles of each level", async () => {
    const test = await setup();
    const { parts } = await test.core.client.query("scene.parts", { assetId: test.assetId });
    expect(parts).toEqual([
      {
        id: "Hero/Body_LOD0",
        name: "Body",
        role: "model",
        shownByDefault: true,
        levels: [
          { level: 0, meshes: ["Hero/Body_LOD0"], triangles: 8 },
          { level: 1, meshes: ["Hero/Body_LOD1"], triangles: 2 },
        ],
      },
      {
        id: "Hero/UCX_Body",
        name: "UCX_Body",
        role: "collision",
        shownByDefault: false,
        levels: [{ level: 0, meshes: ["Hero/UCX_Body"], triangles: 2 }],
      },
      {
        id: "Hero/Boulder2",
        name: "Boulder2",
        role: "model",
        shownByDefault: true,
        levels: [{ level: 0, meshes: ["Hero/Boulder2"], triangles: 2 }],
      },
    ]);
  });

  it("stores a comment's parts view only when it differs from the default, without parts the scene lacks", async () => {
    const test = await setup();
    const create = (parts: PartView) =>
      test.window.client.execute("comment.create", { ...looseComment(test.assetId, "Check.", version), parts });
    await create(defaultView);
    await create({ hidden: ["Hero/Boulder2", "Gone", "Hero/Boulder2"], shown: [], isolated: "Gone", lod: 7 });
    await create({ ...defaultView, hidden: ["Gone"] });
    expect(await storedParts(test)).toEqual([
      undefined,
      { hidden: ["Hero/Boulder2"], shown: [], isolated: null, lod: 1 },
      undefined,
    ]);
  });

  it("replaces or clears a draft's parts view on update", async () => {
    const test = await setup();
    const { assetId } = test;
    await test.window.client.execute("comment.create", { ...looseComment(assetId, "Check.", version) });
    await test.window.client.execute("comment.update", {
      assetId,
      commentId: "c1",
      parts: { ...defaultView, shown: ["Hero/UCX_Body"] },
    });
    expect(await storedParts(test)).toEqual([{ ...defaultView, shown: ["Hero/UCX_Body"] }]);
    await test.window.client.execute("comment.update", { assetId, commentId: "c1", text: "Still." });
    expect(await storedParts(test)).toEqual([{ ...defaultView, shown: ["Hero/UCX_Body"] }]);
    await test.window.client.execute("comment.update", { assetId, commentId: "c1", parts: defaultView });
    expect(await storedParts(test)).toEqual([undefined]);
  });

  it("names a view that differs from the default in one clause of the prompt, and in round.json", async () => {
    const test = await setup();
    const { assetId } = test;
    const create = (text: string, parts: PartView) =>
      test.window.client.execute("comment.create", { ...looseComment(assetId, text, version), parts });
    await create("Plain.", defaultView);
    await create("Lower.", { ...defaultView, hidden: ["Hero/Boulder2"], lod: 1 });
    await create("Alone.", { ...defaultView, isolated: "Hero/Body_LOD0", shown: ["Hero/UCX_Body"] });
    const { prompt } = await test.window.client.execute("round.copy", { assetId });
    const headlines = prompt.split("\n").filter((line) => /^\d+\. /.test(line));
    expect(headlines).toEqual([
      "1. Rest pose · no surface target",
      "2. Rest pose · no surface target · LOD1, Boulder2 hidden",
      "3. Rest pose · no surface target · Body isolated",
    ]);
    const data = roundDataSchema.parse(await readJson(test.platform, `${HERO_REVIEW}/rounds/round-1/round.json`));
    expect(data.comments.map((comment) => comment.parts)).toEqual([
      undefined,
      { hidden: ["Hero/Boulder2"], shown: [], isolated: null, lod: 1 },
      { hidden: [], shown: ["Hero/UCX_Body"], isolated: "Hero/Body_LOD0", lod: 0 },
    ]);
  });
});
