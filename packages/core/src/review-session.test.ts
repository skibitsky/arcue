import { describe, expect, it } from "vitest";
import { MemoryPlatform } from "./memory-platform";
import { ReviewSession } from "./review-session";
import { emptyReview, reviewFilePath, serializeReview } from "./review-store";

const location = {
  workspaceRoot: null,
  root: "/app-data/reviews",
  folder: "/app-data/reviews/work/Hero.fbx",
  assetPath: "/work/Hero.fbx",
};

async function savedSession(): Promise<{ platform: MemoryPlatform; session: ReviewSession }> {
  const platform = new MemoryPlatform();
  const review = { ...emptyReview(location.assetPath), revision: 3 };
  const text = serializeReview(review);
  await platform.writeFile(reviewFilePath(location), text);
  return { platform, session: new ReviewSession(platform, location, { review, text }, () => undefined) };
}

describe("ReviewSession", () => {
  it("does not run file rollback through an ancestor replaced while preparing a save", async () => {
    const { platform, session } = await savedSession();
    await platform.writeFile("/outside/work/Hero.fbx/keep.txt", "untouched");
    await expect(
      session.run((review) => ({
        next: { ...review, dismissedWarnings: ["a:b:c"] },
        result: undefined,
        prepare: async () => {
          await platform.rename("/app-data/reviews", "/original-reviews");
          await platform.symlink("/app-data/reviews", "/outside");
        },
        rollback: () => platform.remove(location.folder),
      })),
    ).rejects.toMatchObject({ code: "conflict" });
    await expect(platform.readText("/outside/work/Hero.fbx/keep.txt")).resolves.toBe("untouched");
  });

  it("skips a save that would write the same text, keeping the revision", async () => {
    const { platform, session } = await savedSession();
    const before = await platform.readText(reviewFilePath(location));
    await session.run((review) => ({ next: { ...review }, result: undefined }));
    await expect(platform.readText(reviewFilePath(location))).resolves.toBe(before);
    expect(session.review.revision).toBe(3);
  });

  it("still saves the same text when the change writes other files or ends the history", async () => {
    const { platform, session } = await savedSession();
    const written: string[] = [];
    await session.run((review) => ({
      next: { ...review },
      result: undefined,
      prepare: async () => {
        written.push("screenshot");
      },
    }));
    expect(written).toEqual(["screenshot"]);
    expect(session.review.revision).toBe(4);

    session.history.record({ kind: "composition", path: "/x", before: null, after: "{}" });
    await session.run((review) => ({ next: { ...review }, result: undefined, clearHistory: true }));
    expect(session.history.peekUndo()).toBeNull();
    expect(session.review.revision).toBe(5);
    await expect(platform.readText(reviewFilePath(location))).resolves.toContain('"revision": 5');
  });

  it("stops saving when a failed move leaves the review in its new place, so the old folder never gets a copy", async () => {
    const elsewhere = { ...location, folder: "/app-data/reviews/work/Striker.fbx", assetPath: "/work/Striker.fbx" };
    const { platform, session } = await savedSession();
    const failing = (rename: boolean) => async () => {
      if (rename) await platform.rename(location.folder, elsewhere.folder);
      throw new Error("The disk is full.");
    };
    await expect(session.moveTo(elsewhere, failing(false))).rejects.toThrow("The disk is full.");
    await session.run((review) => ({ next: { ...review, dismissedWarnings: ["a:b:c"] }, result: undefined }));
    expect(session.review.revision).toBe(4);

    await expect(session.moveTo(elsewhere, failing(true))).rejects.toThrow("The disk is full.");
    await expect(session.run((review) => ({ next: { ...review }, result: undefined }))).rejects.toMatchObject({
      code: "conflict",
    });
    await expect(platform.exists(location.folder)).resolves.toBe(false);
  });
});
