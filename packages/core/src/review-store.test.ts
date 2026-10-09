import { describe, expect, it } from "vitest";
import { MemoryPlatform } from "./memory-platform";
import {
  emptyReview,
  loadReview,
  locateReview,
  parseReview,
  prepareArcueFolder,
  serializeReview,
} from "./review-store";

describe("locateReview", () => {
  const platform = new MemoryPlatform({
    files: { "/work/game/.git/HEAD": "ref", "/work/game/Assets/Hero.fbx": "", "/loose/Hero.fbx": "" },
    appDataDir: "/app-data",
  });

  it("puts reviews in .arcue/reviews at the repository root", async () => {
    await expect(locateReview(platform, "/work/game/Assets/Hero.fbx")).resolves.toEqual({
      workspaceRoot: "/work/game",
      folder: "/work/game/.arcue/reviews/Assets/Hero.fbx",
      assetPath: "Assets/Hero.fbx",
    });
  });

  it("puts reviews of assets outside a repository in the app data folder, keyed by the absolute path", async () => {
    await expect(locateReview(platform, "/loose/Hero.fbx")).resolves.toEqual({
      workspaceRoot: null,
      folder: "/app-data/reviews/loose/Hero.fbx",
      assetPath: "/loose/Hero.fbx",
    });
    await expect(locateReview(platform, "c:\\Art\\Hero.fbx")).resolves.toMatchObject({
      folder: "/app-data/reviews/C/Art/Hero.fbx",
      assetPath: "C:/Art/Hero.fbx",
    });
    await expect(locateReview(platform, "//server/share/Hero.fbx")).resolves.toMatchObject({
      folder: "/app-data/reviews/server/share/Hero.fbx",
    });
  });
});

describe("parseReview", () => {
  it("accepts a valid review", () => {
    const review = emptyReview("Assets/Hero.fbx");
    expect(parseReview(JSON.stringify(review), "review.json")).toEqual(review);
  });

  it("rejects files from a newer Arcue", () => {
    const newer = { ...emptyReview("Assets/Hero.fbx"), schemaVersion: 2 };
    expect(() => parseReview(JSON.stringify(newer), "review.json")).toThrow(
      expect.objectContaining({ code: "conflict", message: expect.stringContaining("newer Arcue") }),
    );
  });

  it("rejects broken JSON and files that break the schema as conflicts", () => {
    expect(() => parseReview("{", "review.json")).toThrow(expect.objectContaining({ code: "conflict" }));
    const broken = { ...emptyReview("Hero.fbx"), queue: ["c1"] };
    expect(() => parseReview(JSON.stringify(broken), "review.json")).toThrow(
      expect.objectContaining({ code: "conflict", message: expect.stringContaining("queue.0") }),
    );
  });
});

describe("loadReview and serializeReview", () => {
  const location = { workspaceRoot: null, folder: "/app-data/reviews/work/Hero.fbx", assetPath: "/work/Hero.fbx" };

  it("reads a saved review back with its text, taking the asset path from the location", async () => {
    const platform = new MemoryPlatform();
    await expect(loadReview(platform, location)).resolves.toEqual({
      review: emptyReview("/work/Hero.fbx"),
      text: null,
    });
    const text = serializeReview({ ...emptyReview("/old/Hero.fbx"), revision: 4 });
    await platform.writeFile(`${location.folder}/review.json`, text);
    await expect(loadReview(platform, location)).resolves.toMatchObject({
      review: { asset: { path: "/work/Hero.fbx" }, revision: 4 },
      text,
    });
  });

  it("refuses a review.json that is a symbolic link", async () => {
    const platform = new MemoryPlatform({
      files: { "/home/me/.ssh/id_rsa": "key" },
      symlinks: { [`${location.folder}/review.json`]: "/home/me/.ssh/id_rsa" },
    });
    await expect(loadReview(platform, location)).rejects.toMatchObject({ code: "conflict" });
  });

  it("refuses to serialize a review that breaks the schema", () => {
    expect(() => serializeReview({ ...emptyReview("Hero.fbx"), queue: ["c1"] })).toThrow(
      expect.objectContaining({ code: "internal" }),
    );
  });
});

describe("prepareArcueFolder", () => {
  it("writes nothing through an .arcue link, even to an empty folder", async () => {
    const platform = new MemoryPlatform({
      files: { "/work/game/.git/HEAD": "ref" },
      symlinks: { "/work/game/.arcue": "/elsewhere" },
    });
    await platform.mkdir("/elsewhere");
    const location = await locateReview(platform, "/work/game/Assets/Hero.fbx");
    await prepareArcueFolder(platform, location);
    await expect(platform.list("/elsewhere")).resolves.toEqual([]);
  });
});
