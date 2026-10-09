import type { AssetVersion, MeshTopology, ReviewFile } from "@arcue/protocol";
import { ArcueError } from "@arcue/protocol";
import { describe, expect, it } from "vitest";
import { fileIdentity } from "./identity";
import { MemoryPlatform } from "./memory-platform";
import type { FileStat } from "./platform";
import type { EarlierReview } from "./relink";
import {
  findEarlierReviews,
  MAX_EARLIER_REVIEWS,
  matchByIdentity,
  rankCandidates,
  reviewedModelGone,
  STRUCTURE_MATCH_SHARE,
  sameStructure,
} from "./relink";
import { emptyReview, reviewLocationIn, serializeReview } from "./review-store";

const fingerprint = (vertices: number, hash = "0123456789abcdef") => ({
  sourceVertexCount: vertices,
  triangleCount: vertices,
  hash,
});

function version(meshes: MeshTopology[], fields: Partial<AssetVersion> = {}): AssetVersion {
  return {
    id: "1234567",
    fileModifiedAt: "2026-10-08T14:02:00.000Z",
    loadedAt: "2026-10-08T14:02:00.000Z",
    exporter: null,
    meshes,
    ...fields,
  };
}

const body = { mesh: "Hero/Body", topology: fingerprint(100, "aaaaaaaaaaaaaaaa") };
const head = { mesh: "Hero/Head", topology: fingerprint(50, "bbbbbbbbbbbbbbbb") };
const hands = { mesh: "Hero/Hands", topology: fingerprint(30, "cccccccccccccccc") };

describe("sameStructure", () => {
  it("matches when every mesh path matches and more than half keep their hash or vertex count", () => {
    expect(STRUCTURE_MATCH_SHARE).toBe(0.5);
    const edited = { ...head, topology: fingerprint(60, "dddddddddddddddd") };
    expect(sameStructure(version([body, head, hands]), [body, edited, hands])).toBe(true);
    const sameCount = { ...body, topology: fingerprint(100, "eeeeeeeeeeeeeeee") };
    expect(sameStructure(version([body, head]), [sameCount, head])).toBe(true);
  });

  it("refuses half or fewer kept, a mesh added, removed or renamed, and a version without meshes", () => {
    const edited = (entry: MeshTopology) => ({ ...entry, topology: fingerprint(1, "ffffffffffffffff") });
    expect(sameStructure(version([body, head]), [body, edited(head)])).toBe(false);
    expect(sameStructure(version([body]), [edited(body)])).toBe(false);
    expect(sameStructure(version([body, head]), [body, head, hands])).toBe(false);
    expect(sameStructure(version([body, head, hands]), [body, head])).toBe(false);
    expect(sameStructure(version([body, head]), [body, { ...head, mesh: "Hero/Face" }])).toBe(false);
    expect(sameStructure(version([]), [])).toBe(false);
    expect(sameStructure(undefined, [body])).toBe(false);
  });

  it("compares only the model's own meshes, not those of composition files", () => {
    const shell = { mesh: "Shells.fbx//Hero/Shell", topology: fingerprint(8) };
    expect(sameStructure(version([body, shell]), [body])).toBe(true);
  });
});

function earlier(model: string, review: Partial<ReviewFile>): EarlierReview {
  const location = reviewLocationIn("/app-data", null, model);
  return { model, location, review: { ...emptyReview(model), ...review } };
}

describe("matchByIdentity", () => {
  it("matches the same size and hash, or the same GUID, and hashes the file only when a size matches", async () => {
    let hashed = 0;
    const file = {
      size: 10,
      guid: async () => "4f2a9c1e8b7d4e3f9a0b1c2d3e4f5a6b",
      hash: async () => {
        hashed++;
        return "0123456789abcdef";
      },
    };
    const reviews = [
      earlier("/a.fbx", { versions: [version([], { size: 9, hash: "0123456789abcdef" })] }),
      earlier("/b.fbx", { asset: { path: "/b.fbx", guid: "4f2a9c1e8b7d4e3f9a0b1c2d3e4f5a6b" } }),
    ];
    const guidOnly = await matchByIdentity(reviews, file);
    expect(guidOnly.map((entry) => [entry.earlier.model, entry.match])).toEqual([["/b.fbx", "guid"]]);
    expect(hashed).toBe(0);
    const sized = [earlier("/c.fbx", { versions: [version([], { size: 10, hash: "0123456789abcdef" })] })];
    expect((await matchByIdentity(sized, file)).map((entry) => entry.match)).toEqual(["content"]);
  });

  it("reads and hashes a file at most once", async () => {
    const platform = new MemoryPlatform({ files: { "/Striker.fbx": "0123456789" } });
    const identity = fileIdentity(platform, "/Striker.fbx", 10);
    expect(await identity.hash()).toBe(await identity.hash());
    expect(await identity.hash()).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe("rankCandidates", () => {
  it("puts content before GUID before structure, then the review used last, then the most comments", () => {
    const at = (time: string) => [version([], { loadedAt: time })];
    const ranked = rankCandidates([
      { earlier: earlier("/structure.fbx", { versions: at("2026-10-09T00:00:00.000Z") }), match: "structure" },
      { earlier: earlier("/guid.fbx", { versions: at("2026-10-01T00:00:00.000Z") }), match: "guid" },
      { earlier: earlier("/old.fbx", { versions: at("2026-10-01T00:00:00.000Z") }), match: "content" },
      { earlier: earlier("/new.fbx", { versions: at("2026-10-02T00:00:00.000Z") }), match: "content" },
      { earlier: earlier("/never.fbx", {}), match: "content" },
    ]);
    expect(ranked.map((candidate) => candidate.path)).toEqual([
      "/new.fbx",
      "/old.fbx",
      "/never.fbx",
      "/guid.fbx",
      "/structure.fbx",
    ]);
    expect(ranked[2]).toEqual({ path: "/never.fbx", comments: 0, lastLoadedAt: null, match: "content" });
  });
});

describe("findEarlierReviews", () => {
  const review = (path: string) => serializeReview(emptyReview(path));

  it("lists reviews whose model is gone, never those of models that exist or folders it is told to skip", async () => {
    const platform = new MemoryPlatform({
      files: {
        "/art/Kept.fbx": "x",
        "/app-data/reviews/art/Kept.fbx/review.json": review("/art/Kept.fbx"),
        "/app-data/reviews/art/Gone.fbx/review.json": review("/art/Gone.fbx"),
        "/app-data/reviews/art/Open.fbx/review.json": review("/art/Open.fbx"),
        "/app-data/reviews/art/Broken.fbx/review.json": "{",
        "/app-data/reviews/art/Lying.fbx/review.json": review("/elsewhere/Lying.fbx"),
      },
    });
    const location = reviewLocationIn("/app-data", null, "/art/New.fbx");
    const found = await findEarlierReviews(platform, location, new Set(["/app-data/reviews/art/Open.fbx"]));
    expect(found).toMatchObject({ complete: true });
    expect(found.reviews.map((entry) => entry.model)).toEqual(["/art/Gone.fbx"]);
  });

  it("finds the review of a model on a drive or a network share in the app data folder", async () => {
    const platform = new MemoryPlatform({
      files: {
        "C:/Art/New.fbx": "x",
        "//server/share/New.fbx": "x",
        "/app-data/reviews/C/Art/Hero.fbx/review.json": review("C:/Art/Hero.fbx"),
        "/app-data/reviews/server/share/Hero.fbx/review.json": review("//server/share/Hero.fbx"),
      },
    });
    const found = await findEarlierReviews(platform, reviewLocationIn("/app-data", null, "C:/Art/New.fbx"), new Set());
    expect(found.reviews.map((entry) => entry.model)).toEqual(["C:/Art/Hero.fbx", "//server/share/Hero.fbx"]);
  });

  it("never takes the review of a model on a drive, share or volume that is not there", async () => {
    const platform = new MemoryPlatform({
      files: {
        "/app-data/reviews/D/Art/Hero.fbx/review.json": review("D:/Art/Hero.fbx"),
        "/app-data/reviews/server/share/Hero.fbx/review.json": review("//server/share/Hero.fbx"),
        "/app-data/reviews/Volumes/Ejected/Hero.fbx/review.json": review("/Volumes/Ejected/Hero.fbx"),
        "/Volumes/Mounted/New.fbx": "x",
        "/app-data/reviews/Volumes/Mounted/Hero.fbx/review.json": review("/Volumes/Mounted/Hero.fbx"),
      },
    });
    const location = reviewLocationIn("/app-data", null, "/Volumes/Mounted/New.fbx");
    const found = await findEarlierReviews(platform, location, new Set());
    expect(found.reviews.map((entry) => entry.model)).toEqual(["/Volumes/Mounted/Hero.fbx"]);
  });

  it("takes only a definite not-found for a model that is gone", async () => {
    class Unreadable extends MemoryPlatform {
      override async stat(path: string): Promise<FileStat | null> {
        if (path.endsWith("Locked.fbx")) throw new ArcueError("forbidden", `${path}: permission denied`);
        return super.stat(path);
      }
    }
    const platform = new Unreadable({
      files: {
        "/app-data/reviews/art/Locked.fbx/review.json": review("/art/Locked.fbx"),
        "/app-data/reviews/art/Gone.fbx/review.json": review("/art/Gone.fbx"),
      },
    });
    const found = await findEarlierReviews(platform, reviewLocationIn("/app-data", null, "/art/New.fbx"), new Set());
    expect(found.reviews.map((entry) => entry.model)).toEqual(["/art/Gone.fbx"]);
  });

  it("says when it stopped at a bound before it saw every folder", async () => {
    const files = Object.fromEntries(
      Array.from({ length: MAX_EARLIER_REVIEWS + 1 }, (_, index) => [
        `/app-data/reviews/art/Gone${index}.fbx/review.json`,
        review(`/art/Gone${index}.fbx`),
      ]),
    );
    const platform = new MemoryPlatform({ files });
    const found = await findEarlierReviews(platform, reviewLocationIn("/app-data", null, "/art/New.fbx"), new Set());
    expect(found).toMatchObject({ complete: false, reviews: { length: MAX_EARLIER_REVIEWS } });
  });

  it("does not look through a reviews folder that is a symbolic link", async () => {
    const platform = new MemoryPlatform({
      files: {
        "/work/game/.git/HEAD": "ref",
        "/elsewhere/Assets/Gone.fbx/review.json": review("Assets/Gone.fbx"),
      },
      symlinks: { "/work/game/.arcue/reviews": "/elsewhere" },
    });
    const location = reviewLocationIn("/app-data", "/work/game", "/work/game/Assets/New.fbx");
    expect(location).not.toBeNull();
    if (location) {
      await expect(findEarlierReviews(platform, location, new Set())).resolves.toEqual({ reviews: [], complete: true });
    }
  });
});

describe("reviewedModelGone", () => {
  class Watched extends MemoryPlatform {
    readonly statted: string[] = [];

    override async stat(path: string): Promise<FileStat | null> {
      this.statted.push(path);
      return super.stat(path);
    }
  }

  it("checks every path an app data review folder stands for, and never a server named like a drive", async () => {
    const platform = new Watched({ files: { "C:/Art/Hero.fbx": "x" } });
    const location = reviewLocationIn("/app-data", null, "/C/Art/Hero.fbx");
    await expect(reviewedModelGone(platform, location, "/C/Art/Hero.fbx")).resolves.toBe(false);
    await platform.remove("C:/Art/Hero.fbx");
    platform.statted.length = 0;
    await expect(reviewedModelGone(platform, location, "/C/Art/Hero.fbx")).resolves.toBe(true);
    expect(platform.statted).toEqual(["/C/Art/Hero.fbx", "C:/Art/Hero.fbx"]);
  });
});
