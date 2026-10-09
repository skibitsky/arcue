import type { Comment, CompositionFile, ReviewFile } from "@arcue/protocol";
import { describe, expect, it } from "vitest";
import { MemoryPlatform } from "./memory-platform";
import { moveReview, relabelMembers } from "./review-move";
import { emptyReview, reviewLocationIn, serializeReview } from "./review-store";
import { camera } from "./test-support";

const REPO = "/work/game";
const OLD_MODEL = `${REPO}/Assets/Old/Hero.fbx`;
const NEW_MODEL = `${REPO}/Assets/New/Striker.fbx`;
const OLD = `${REPO}/.arcue/reviews/Assets/Old/Hero.fbx`;
const NEW = `${REPO}/.arcue/reviews/Assets/New/Striker.fbx`;
const at = (model: string) => reviewLocationIn("/app-data", REPO, model) ?? fail();

function fail(): never {
  throw new Error("The model is outside the repository.");
}

function comment(fields: Partial<Comment>): Comment {
  return {
    id: "c1",
    text: "Round the shell's rim.",
    status: "draft",
    createdAt: "2026-10-08T14:02:00.000Z",
    updatedAt: "2026-10-08T14:02:00.000Z",
    madeOnVersion: "1234567",
    time: { kind: "frame", clip: "Hero@Run.fbx//Run", clipDisplayName: "Run", frame: 4 },
    target: { kind: "surface", mesh: "Shells.fbx//Hero/ShellA", vertices: [0, 1, 2], weights: [0.4, 0.3, 0.3] },
    anchorVersion: "1234567",
    anchorRestPositions: [
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 0],
    ],
    camera,
    context: {
      vertexCount: 3,
      bones: [],
      centroid: null,
      joints: [{ name: "Tip", path: "Shells.fbx//Hero/Tip", position: [0, 1, 0] }],
      viewLabel: "front",
      screenshot: "screenshots/c1.png",
    },
    anchorState: "exact",
    followUps: [],
    rounds: [],
    reopenedFrom: null,
    parts: { hidden: ["Shells.fbx//Hero/ShellB"], shown: [], isolated: "Shells.fbx//Hero/ShellA", lod: 0 },
    warning: {
      id: "file-not-found:file:Shells.fbx//Shells.fbx",
      code: "file-not-found",
      subject: { kind: "file", name: "Shells.fbx" },
      file: "Shells.fbx",
    },
    ...fields,
  };
}

function reviewWith(comments: Comment[]): ReviewFile {
  return {
    ...emptyReview("Assets/Old/Hero.fbx"),
    comments,
    queue: comments.filter((entry) => entry.status === "draft").map((entry) => entry.id),
    revision: 7,
  };
}

const composition: CompositionFile = {
  version: 1,
  animations: ["Anim/Walk.fbx"],
  attach: [{ file: "Shells.fbx", node: "ShellA", bone: "Body" }],
  materials: { Shell: { baseColor: "../Textures/Shell.png" } },
  hidden: ["Shells.fbx//Hero/ShellB"],
};

function files(review: ReviewFile = reviewWith([comment({})])): Record<string, string> {
  return {
    [`${REPO}/.git/HEAD`]: "ref",
    [`${REPO}/Assets/New/Striker.fbx`]: "model",
    [`${REPO}/Assets/Old/Shells.fbx`]: "shells",
    [`${REPO}/Assets/New/Anim/Walk.fbx`]: "walk",
    [`${REPO}/Assets/Textures/Shell.png`]: "png",
    [`${OLD}/review.json`]: serializeReview(review),
    [`${OLD}/composition.json`]: JSON.stringify(composition),
    [`${OLD}/screenshots/c1.png`]: "png",
    [`${OLD}/rounds/round-1/prompt.md`]: "prompt",
  };
}

const move = { from: at(OLD_MODEL), fromModel: OLD_MODEL, to: at(NEW_MODEL), toModel: NEW_MODEL };

describe("moveReview", () => {
  it("moves the whole folder, writes the new asset path and removes the folders it left empty", async () => {
    const platform = new MemoryPlatform({ files: files() });
    await moveReview(platform, move);
    await expect(platform.exists(`${REPO}/.arcue/reviews/Assets/Old`)).resolves.toBe(false);
    await expect(platform.readText(`${NEW}/screenshots/c1.png`)).resolves.toBe("png");
    await expect(platform.readText(`${NEW}/rounds/round-1/prompt.md`)).resolves.toBe("prompt");
    const review = JSON.parse(await platform.readText(`${NEW}/review.json`)) as ReviewFile;
    expect(review.asset.path).toBe("Assets/New/Striker.fbx");
    expect(review.revision).toBe(8);
  });

  it("points the composition at the same files from the new folder, and renames the ids of moved paths", async () => {
    const platform = new MemoryPlatform({ files: files() });
    await moveReview(platform, move);
    const rebased = JSON.parse(await platform.readText(`${NEW}/composition.json`)) as CompositionFile;
    expect(rebased).toEqual({
      version: 1,
      animations: ["Anim/Walk.fbx"],
      attach: [{ file: "../Old/Shells.fbx", node: "ShellA", bone: "Body" }],
      materials: { Shell: { baseColor: "../Textures/Shell.png" } },
      hidden: ["../Old/Shells.fbx//Hero/ShellB"],
    });
    const review = JSON.parse(await platform.readText(`${NEW}/review.json`)) as ReviewFile;
    expect(review.comments[0]).toMatchObject({
      time: { clip: "Hero@Run.fbx//Run" },
      target: { mesh: "../Old/Shells.fbx//Hero/ShellA" },
      context: { joints: [{ path: "../Old/Shells.fbx//Hero/Tip" }], screenshot: "screenshots/c1.png" },
      parts: { hidden: ["../Old/Shells.fbx//Hero/ShellB"], isolated: "../Old/Shells.fbx//Hero/ShellA" },
      warning: { id: "file-not-found:file:../Old/Shells.fbx//Shells.fbx", file: "../Old/Shells.fbx" },
    });
  });

  it("refuses a model that already has a review, and leaves both where they are", async () => {
    const platform = new MemoryPlatform({ files: { ...files(), [`${NEW}/review.json`]: "{}" } });
    await expect(moveReview(platform, move)).rejects.toMatchObject({
      code: "conflict",
      message: "Striker.fbx already has a review, so the review of Hero.fbx stays where it is.",
    });
    await expect(platform.exists(`${OLD}/review.json`)).resolves.toBe(true);
    await expect(platform.readText(`${NEW}/review.json`)).resolves.toBe("{}");
  });

  it("refuses a folder with other files in it, and takes the place of an empty one", async () => {
    const crowded = new MemoryPlatform({ files: { ...files(), [`${NEW}/composition.json`]: "{}" } });
    await expect(moveReview(crowded, move)).rejects.toMatchObject({ code: "conflict" });
    const empty = new MemoryPlatform({ files: files() });
    await empty.mkdir(NEW);
    await moveReview(empty, move);
    await expect(empty.exists(`${NEW}/review.json`)).resolves.toBe(true);
  });

  it("replaces only an untouched review when asked to", async () => {
    const untouched = serializeReview(emptyReview("Assets/New/Striker.fbx"));
    const platform = new MemoryPlatform({ files: { ...files(), [`${NEW}/review.json`]: untouched } });
    await expect(moveReview(platform, move)).rejects.toMatchObject({ code: "conflict" });
    await moveReview(platform, { ...move, replaceUntouched: true });
    await expect(platform.readText(`${NEW}/review.json`)).resolves.toContain("Round the shell's rim.");

    const loose = comment({ id: "c9", context: { ...comment({}).context, screenshot: null } });
    const touched = serializeReview({ ...reviewWith([loose]), asset: { path: "Assets/New/Striker.fbx" } });
    const busy = new MemoryPlatform({ files: { ...files(), [`${NEW}/review.json`]: touched } });
    await expect(moveReview(busy, { ...move, replaceUntouched: true })).rejects.toMatchObject({ code: "conflict" });
  });

  it("moves a review in the app data folder, for models outside a repository", async () => {
    const from = reviewLocationIn("/app-data", null, "/art/Hero.fbx");
    const to = reviewLocationIn("/app-data", null, "/art/Striker.fbx");
    const review = serializeReview(emptyReview("/art/Hero.fbx"));
    const platform = new MemoryPlatform({
      files: { "/art/Striker.fbx": "model", [`${from.folder}/review.json`]: review },
    });
    await moveReview(platform, { from, fromModel: "/art/Hero.fbx", to, toModel: "/art/Striker.fbx" });
    expect(to.folder).toBe("/app-data/reviews/art/Striker.fbx");
    const moved = JSON.parse(await platform.readText(`${to.folder}/review.json`)) as ReviewFile;
    expect(moved.asset.path).toBe("/art/Striker.fbx");
    await expect(platform.exists(from.folder)).resolves.toBe(false);
  });

  it("refuses a review reached through a symbolic link, and a missing one", async () => {
    const linked = new MemoryPlatform({
      files: { ...files(), "/elsewhere/review.json": serializeReview(emptyReview("x")) },
    });
    await linked.remove(OLD);
    await linked.symlink(OLD, "/elsewhere");
    await expect(moveReview(linked, move)).rejects.toMatchObject({ code: "conflict" });
    await expect(linked.exists("/elsewhere/review.json")).resolves.toBe(true);

    const missing = new MemoryPlatform({ files: { [`${REPO}/.git/HEAD`]: "ref" } });
    await expect(moveReview(missing, move)).rejects.toMatchObject({ code: "not-found" });
  });
});

describe("relabelMembers", () => {
  it("renames dismissed warnings and each version's files and meshes, and leaves the model's own ids alone", () => {
    const review: ReviewFile = {
      ...reviewWith([]),
      dismissedWarnings: ["invalid-data:file:Shells.fbx//Shells.fbx", "root-scale:node:Hero"],
      versions: [
        {
          id: "1234567",
          fileModifiedAt: "2026-10-08T14:02:00.000Z",
          loadedAt: "2026-10-08T14:02:00.000Z",
          exporter: null,
          meshes: [
            { mesh: "Hero/Body", topology: { sourceVertexCount: 3, triangleCount: 1, hash: "0123456789abcdef" } },
            {
              mesh: "Shells.fbx//Hero/ShellA",
              topology: { sourceVertexCount: 4, triangleCount: 2, hash: "0123456789abcdef" },
            },
          ],
          files: [
            { file: "Hero.fbx", id: "1234567" },
            { file: "Shells.fbx", id: "7654321" },
          ],
        },
      ],
    };
    const relabeled = relabelMembers(review, new Map([["Shells.fbx", "Parts/Shells.fbx"]]));
    expect(relabeled.dismissedWarnings).toEqual([
      "invalid-data:file:Parts/Shells.fbx//Shells.fbx",
      "root-scale:node:Hero",
    ]);
    expect(relabeled.versions[0]?.meshes.map((entry) => entry.mesh)).toEqual([
      "Hero/Body",
      "Parts/Shells.fbx//Hero/ShellA",
    ]);
    expect(relabeled.versions[0]?.files?.map((entry) => entry.file)).toEqual(["Hero.fbx", "Parts/Shells.fbx"]);
  });
});
