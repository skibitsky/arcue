import type { ReviewFile, RoundData } from "@arcue/protocol";
import type { ImportWarning } from "@arcue/scene";
import { importWarning } from "@arcue/scene";
import { describe, expect, it } from "vitest";
import type { FakeAssetSpec, TestCore } from "./test-support";
import {
  camera,
  fakeAsset,
  HERO,
  HERO_REVIEW,
  heroFiles,
  heroSpec,
  openAsset,
  readJson,
  startTestCore,
} from "./test-support";

const TEXTURE = "/work/game/Assets/Art/Textures/Body_BaseColor.png";

const warnings: ImportWarning[] = [
  importWarning("root-scale", { kind: "node", name: "Hero" }, "Root scale x100: Hero"),
  importWarning(
    "texture-not-used",
    { kind: "texture", name: "Body_BaseColor.png" },
    "Texture not used: Body_BaseColor.png",
    undefined,
    {
      detail: "Stored path: Textures/Body_BaseColor.png, found at Textures/Body_BaseColor.png",
      foundPath: "Textures/Body_BaseColor.png",
    },
  ),
  importWarning("texture-not-found", { kind: "texture", name: "Eyes.png" }, "Texture not found: Eyes.png", undefined, {
    detail: "Stored path: C:/art/Eyes.png",
    materials: ["Body"],
    uses: [{ material: "Body", slot: "baseColor" }],
  }),
  importWarning("clip-not-sampled", { kind: "clip", name: "Armature|Run" }, "Clip not sampled: Armature|Run"),
];

const spec: FakeAssetSpec = {
  ...heroSpec,
  meshes: [{ name: "Body", grid: 3, material: 0 }],
  materials: ["Body"],
  warnings,
};

const ROOT_SCALE = "root-scale:node:Hero";
const UNUSED = "texture-not-used:texture:Body_BaseColor.png";
const MISSING = "texture-not-found:texture:Eyes.png";
const CLIP = "clip-not-sampled:clip:Armature|Run";

async function setup(files: Record<string, string> = {}): Promise<TestCore & { assetId: string }> {
  const test = await startTestCore({ ...heroFiles(spec), [TEXTURE]: "png", ...files });
  const assetId = await openAsset(test);
  return { ...test, assetId };
}

async function listed(test: TestCore & { assetId: string }) {
  return (await test.core.client.query("warning.list", { assetId: test.assetId })).warnings;
}

async function savedReview(test: TestCore): Promise<ReviewFile> {
  return (await readJson(test.platform, `${HERO_REVIEW}/review.json`)) as ReviewFile;
}

describe("warning.list", () => {
  it("lists the version's warnings with stable ids, errors first, and the command that fixes each", async () => {
    const test = await setup();
    expect(await listed(test)).toEqual([
      {
        id: MISSING,
        code: "texture-not-found",
        severity: "error",
        subject: { kind: "texture", name: "Eyes.png" },
        message: "Texture not found: Eyes.png",
        detail: "Stored path: C:/art/Eyes.png",
        materials: ["Body"],
        uses: [{ material: "Body", slot: "baseColor" }],
        dismissed: false,
        commentId: null,
        fix: { kind: "choose-texture", material: "Body", slot: "baseColor" },
      },
      expect.objectContaining({
        id: CLIP,
        severity: "error",
        fix: { kind: "show-clip", clip: "Armature|Run" },
      }),
      expect.objectContaining({ id: ROOT_SCALE, severity: "warning", fix: null }),
      expect.objectContaining({
        id: UNUSED,
        fix: { kind: "use-as-base-color", material: "Body", file: TEXTURE },
      }),
    ]);
  });

  it("offers retry for a composition file that failed and names the file in the id", async () => {
    const failed = importWarning(
      "file-not-found",
      { kind: "file", name: "Shells.fbx" },
      "File not found: Shells.fbx",
      "Shells.fbx",
    );
    const test = await setup({ [HERO]: fakeAsset({ ...spec, warnings: [failed] }) });
    expect(await listed(test)).toEqual([
      expect.objectContaining({ id: "file-not-found:file:Shells.fbx//Shells.fbx", fix: { kind: "retry" } }),
    ]);
  });

  it("offers no base color when more than one material lacks one", async () => {
    const test = await setup({ [HERO]: fakeAsset({ ...spec, materials: ["Body", "Eyes"] }) });
    expect((await listed(test)).find((warning) => warning.id === UNUSED)?.fix).toBeNull();
  });

  it("is empty for a clean import", async () => {
    const test = await startTestCore(heroFiles());
    const assetId = await openAsset(test);
    expect(await test.core.client.query("warning.list", { assetId })).toEqual({ warnings: [] });
  });
});

describe("warning.dismiss", () => {
  it("saves the dismissal in review.json, keeps it across reloads, and undoes it with review.undo", async () => {
    const test = await setup();
    await test.window.client.execute("warning.dismiss", { assetId: test.assetId, warningId: ROOT_SCALE });
    expect((await savedReview(test)).dismissedWarnings).toEqual([ROOT_SCALE]);
    expect((await listed(test)).find((warning) => warning.id === ROOT_SCALE)?.dismissed).toBe(true);

    await test.platform.writeFileAtomic(HERO, fakeAsset({ ...spec, fps: 30 }));
    test.clock.advance(1000);
    await test.core.idle();
    test.clock.advance(1000);
    await test.core.idle();
    expect((await listed(test)).find((warning) => warning.id === ROOT_SCALE)?.dismissed).toBe(true);

    await test.window.client.execute("review.undo", { assetId: test.assetId });
    expect(await savedReview(test)).not.toHaveProperty("dismissedWarnings");
    expect((await listed(test)).every((warning) => !warning.dismissed)).toBe(true);
    await test.window.client.execute("review.redo", { assetId: test.assetId });
    expect((await savedReview(test)).dismissedWarnings).toEqual([ROOT_SCALE]);
  });

  it("refuses an id the version does not have", async () => {
    const test = await setup();
    await expect(
      test.window.client.execute("warning.dismiss", { assetId: test.assetId, warningId: "root-scale:node:Nope" }),
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("dismisses every listed warning as one undoable edit", async () => {
    const test = await setup();
    await test.window.client.execute("warning.dismiss", { assetId: test.assetId, warningId: CLIP });
    await test.window.client.execute("warning.dismissAll", { assetId: test.assetId });
    expect((await savedReview(test)).dismissedWarnings).toEqual([CLIP, MISSING, ROOT_SCALE, UNUSED]);
    await test.window.client.execute("review.undo", { assetId: test.assetId });
    expect((await savedReview(test)).dismissedWarnings).toEqual([CLIP]);
  });
});

describe("comment.createFromWarning", () => {
  it("adds a draft whose text is the message and which keeps the warning, once while it is queued", async () => {
    const test = await setup();
    await test.window.client.execute("view.reportState", {
      assetId: test.assetId,
      state: {
        camera,
        clip: null,
        frame: 0,
        range: null,
        display: { mode: "lit", skeleton: false },
        parts: { hidden: [], shown: [], isolated: null, lod: 0 },
      },
    });
    const { commentId } = await test.window.client.execute("comment.createFromWarning", {
      assetId: test.assetId,
      warningId: MISSING,
    });
    expect(commentId).toBe("c1");
    const review = await savedReview(test);
    expect(review.queue).toEqual(["c1"]);
    expect(review.comments[0]).toMatchObject({
      id: "c1",
      text: "Texture not found: Eyes.png",
      status: "draft",
      time: { kind: "none" },
      target: null,
      camera,
      warning: {
        id: MISSING,
        code: "texture-not-found",
        subject: { kind: "texture", name: "Eyes.png" },
        detail: "Stored path: C:/art/Eyes.png",
      },
    });
    expect((await listed(test)).find((warning) => warning.id === MISSING)?.commentId).toBe("c1");
    await expect(
      test.window.client.execute("comment.createFromWarning", { assetId: test.assetId, warningId: MISSING }),
    ).resolves.toEqual({ commentId: "c1" });
    expect((await savedReview(test)).comments).toHaveLength(1);

    await test.window.client.execute("review.undo", { assetId: test.assetId });
    expect((await savedReview(test)).comments).toEqual([]);
  });

  it("makes a clip's comment at the clip's first frame", async () => {
    const test = await setup();
    await test.window.client.execute("comment.createFromWarning", { assetId: test.assetId, warningId: CLIP });
    expect((await savedReview(test)).comments[0]?.time).toEqual({
      kind: "frame",
      clip: "Armature|Run",
      clipDisplayName: "Run",
      frame: 0,
    });
  });

  it("names the warning and its subject in the prompt and keeps it in round.json", async () => {
    const test = await setup();
    await test.window.client.execute("comment.createFromWarning", { assetId: test.assetId, warningId: MISSING });
    const { round, prompt } = await test.window.client.execute("round.copy", { assetId: test.assetId });
    expect(prompt).toContain(
      [
        '1. Import warning "texture-not-found" · texture "Eyes.png"',
        "   Stored path: C:/art/Eyes.png",
        '   "Texture not found: Eyes.png"',
      ].join("\n"),
    );
    const data = (await readJson(test.platform, `${HERO_REVIEW}/rounds/round-${round}/round.json`)) as RoundData;
    expect(data.comments[0]?.warning).toEqual({
      id: MISSING,
      code: "texture-not-found",
      subject: { kind: "texture", name: "Eyes.png" },
      detail: "Stored path: C:/art/Eyes.png",
    });
    expect((await listed(test)).find((warning) => warning.id === MISSING)?.commentId).toBe("c1");
    await expect(
      test.window.client.execute("comment.createFromWarning", { assetId: test.assetId, warningId: MISSING }),
    ).resolves.toEqual({ commentId: "c2" });
  });
});

describe("warning.prompt", () => {
  it("asks an agent to fix the warnings that are not dismissed, naming the asset's path", async () => {
    const test = await setup();
    await test.window.client.execute("warning.dismiss", { assetId: test.assetId, warningId: CLIP });
    const { prompt } = await test.core.client.query("warning.prompt", { assetId: test.assetId });
    expect(prompt).toBe(
      [
        `Fix these import warnings in ${HERO}, then export it again.`,
        '1. Texture not found: Eyes.png · texture "Eyes.png" · Stored path: C:/art/Eyes.png',
        '2. Root scale x100: Hero · node "Hero"',
        '3. Texture not used: Body_BaseColor.png · texture "Body_BaseColor.png" · Stored path: Textures/Body_BaseColor.png, found at Textures/Body_BaseColor.png',
      ].join("\n"),
    );
  });
});

describe("use as base color", () => {
  it("runs material.setTexture with the found image, after which the texture is no longer reported", async () => {
    const test = await setup();
    const fix = (await listed(test)).find((warning) => warning.id === UNUSED)?.fix;
    if (fix?.kind !== "use-as-base-color") throw new Error("Expected the base color fix.");
    await test.window.client.execute("material.setTexture", {
      assetId: test.assetId,
      material: fix.material,
      slot: "baseColor",
      file: fix.file,
    });
    await test.core.idle();
    expect((await listed(test)).map((warning) => warning.id)).not.toContain(UNUSED);
  });
});

describe("choose texture", () => {
  it("names the slot of a missing texture, and an image chosen for that slot clears the warning", async () => {
    const test = await setup({ "/work/game/Assets/Art/Eyes.png": "png" });
    const fix = (await listed(test)).find((warning) => warning.id === MISSING)?.fix;
    if (fix?.kind !== "choose-texture") throw new Error("Expected the choose texture fix.");
    await test.window.client.execute("material.setTexture", {
      assetId: test.assetId,
      material: fix.material,
      slot: fix.slot,
      file: "/work/game/Assets/Art/Eyes.png",
    });
    await test.core.idle();
    expect((await listed(test)).map((warning) => warning.id)).not.toContain(MISSING);
    await test.window.client.execute("review.undo", { assetId: test.assetId });
    await test.core.idle();
    expect((await listed(test)).map((warning) => warning.id)).toContain(MISSING);
  });

  it("offers no fix when the slot belongs to a material no mesh uses", async () => {
    const orphan = importWarning(
      "texture-not-found",
      { kind: "texture", name: "moss.png" },
      "Texture not found: moss.png",
      undefined,
      { uses: [{ material: "Moss", slot: "normal" }] },
    );
    const test = await setup({ [HERO]: fakeAsset({ ...spec, warnings: [orphan] }) });
    expect((await listed(test)).find((warning) => warning.subject.name === "moss.png")?.fix).toBeNull();
  });
});
