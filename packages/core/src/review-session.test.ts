import type { ReviewFile } from "@arcue/protocol";
import { REVIEW_FORMAT } from "@arcue/protocol";
import { describe, expect, it } from "vitest";
import { ManualClock } from "./manual-clock";
import { MemoryPlatform } from "./memory-platform";
import type { ComputeChange } from "./review-session";
import { ReviewSession } from "./review-session";
import type { ReviewLocation } from "./review-store";
import { emptyReview, loadReview, reviewFilePath, serializeReview } from "./review-store";
import { RecordingPlatform } from "./test-support";

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
    await platform.writeFile(location.assetPath, "model");
    await expect(session.run((review) => ({ next: { ...review }, result: undefined }))).rejects.toMatchObject({
      code: "conflict",
      message: expect.stringContaining("could not be finished"),
    });
    await expect(platform.exists(location.folder)).resolves.toBe(false);
  });
});

describe("ReviewSession and the review format", () => {
  const path = reviewFilePath(location);
  const newer = `${JSON.stringify(
    { ...emptyReview(location.assetPath), revision: 3, format: REVIEW_FORMAT + 1, notes: "Kept by a newer Arcue." },
    null,
    2,
  )}\n`;
  const refusal = {
    code: "forbidden",
    message: "The review of Hero.fbx was saved by a newer version of Arcue. Update Arcue to change it.",
  };

  async function sessionOn(text: string): Promise<{ platform: MemoryPlatform; session: ReviewSession }> {
    const platform = new MemoryPlatform();
    await platform.writeFile(path, text);
    const loaded = await loadReview(platform, location);
    return { platform, session: new ReviewSession(platform, location, loaded, () => undefined) };
  }

  it("shows a review a newer Arcue saved and refuses every change that would save it", async () => {
    const { platform, session } = await sessionOn(newer);
    expect(session.review).toMatchObject({ format: REVIEW_FORMAT + 1, revision: 3 });
    await expect(session.run((review) => ({ next: { ...review }, result: "unchanged" }))).resolves.toBe("unchanged");

    const written: string[] = [];
    const changes: ComputeChange<undefined>[] = [
      (review) => ({ next: { ...review, dismissedWarnings: ["a:b:c"] }, result: undefined }),
      (review) => ({
        next: { ...review },
        result: undefined,
        prepare: async () => {
          written.push("screenshot");
        },
      }),
      (review) => ({ next: { ...review }, result: undefined, clearHistory: true }),
    ];
    for (const change of changes) await expect(session.run(change)).rejects.toMatchObject(refusal);
    expect(written).toEqual([]);
    await expect(platform.readText(path)).resolves.toBe(newer);
  });

  it("stops saving once a newer Arcue saves the review on disk", async () => {
    const { platform, session } = await sessionOn(serializeReview({ ...emptyReview(location.assetPath), revision: 2 }));
    await platform.writeFile(path, newer);
    await expect(
      session.run((review) => ({ next: { ...review, dismissedWarnings: ["a:b:c"] }, result: undefined })),
    ).rejects.toMatchObject(refusal);
    await expect(platform.readText(path)).resolves.toBe(newer);
  });

  it("loads and saves a review older builds saved without a format, recording this build's format", async () => {
    const older = serializeReview({ ...emptyReview(location.assetPath), revision: 3 });
    expect(older).not.toContain('"format"');
    const { platform, session } = await sessionOn(older);
    await session.run((review) => ({ next: { ...review }, result: undefined }));
    await expect(platform.readText(path)).resolves.toBe(older);

    await session.run((review) => ({ next: { ...review, dismissedWarnings: ["a:b:c"] }, result: undefined }));
    const saved = JSON.parse(await platform.readText(path)) as Record<string, unknown>;
    expect(saved).toMatchObject({ schemaVersion: 1, format: REVIEW_FORMAT, revision: 4, dismissedWarnings: ["a:b:c"] });
    expect(Object.keys(saved).slice(0, 2)).toEqual(["schemaVersion", "format"]);
    expect(session.review.format).toBe(REVIEW_FORMAT);
  });
});

describe("ReviewSession and the reviews lock", () => {
  const repository: ReviewLocation = {
    workspaceRoot: "/work/game",
    root: "/work/game/.arcue/reviews",
    folder: "/work/game/.arcue/reviews/Hero.fbx",
    assetPath: "Hero.fbx",
  };
  const MODEL = "/work/game/Hero.fbx";
  const REVIEW = reviewFilePath(repository);
  const dismiss = (review: ReviewFile) => ({ next: { ...review, dismissedWarnings: ["a:b:c"] }, result: "saved" });

  async function lockedSession(
    options: {
      lockTimeoutMs?: number;
      saved?: boolean;
      adopted?: (review: ReviewFile, before: ReviewFile) => void;
    } = {},
  ) {
    const clock = new ManualClock();
    const platform = new RecordingPlatform({
      files: { "/work/game/.git/HEAD": "ref", [MODEL]: "model" },
      clock,
      ...(options.lockTimeoutMs === undefined ? {} : { lockTimeoutMs: options.lockTimeoutMs }),
    });
    const review = { ...emptyReview(repository.assetPath), revision: 3 };
    const text = serializeReview(review);
    if (options.saved !== false) await platform.writeFile(REVIEW, text);
    const core = platform.forCore("core-1");
    const loaded = { review, text: options.saved === false ? null : text };
    const adopted = options.adopted ? { adopted: options.adopted } : {};
    const session = new ReviewSession(core, repository, loaded, () => undefined, adopted);
    const key = platform.lockKey("/work/game", "reviews");
    const holds = () => platform.heldLocks().includes(key);
    return { platform, clock, session, key, holds };
  }

  const ops = (platform: RecordingPlatform) =>
    platform.log.filter((entry) => entry.actor === "core-1").map((entry) => entry.op);

  it("takes the lock before the first read and lets go after the last write", async () => {
    const { platform, session, key, holds } = await lockedSession();
    const events: string[] = [];
    platform.beforeRead = (path) => {
      events.push(`read ${path === REVIEW ? "review" : path} ${holds()}`);
    };
    await session.run((review) => {
      events.push(`compute ${holds()}`);
      return dismiss(review);
    });
    expect(events).toEqual(["read review true", "compute true", "read review true"]);
    expect(ops(platform)).toEqual(["lock", "writeAtomic", "unlock"]);
    expect(platform.log.find((entry) => entry.op === "writeAtomic")).toMatchObject({ path: REVIEW, held: [key] });
    expect(holds()).toBe(false);
  });

  it("lets go after a compute that throws, a failed save, a change that saves nothing and afterSave", async () => {
    const { platform, session, holds } = await lockedSession();
    await expect(
      session.run(() => {
        throw new Error("The compute failed.");
      }),
    ).rejects.toThrow("The compute failed.");
    expect(holds()).toBe(false);

    const rolledBack: string[] = [];
    platform.fail = (operation, path) => operation === "write" && path === REVIEW;
    await expect(
      session.run((review) => ({
        ...dismiss(review),
        prepare: async () => undefined,
        rollback: async () => {
          rolledBack.push(`rollback ${holds()}`);
        },
      })),
    ).rejects.toThrow(/refused/);
    expect(rolledBack).toEqual(["rollback true"]);
    expect(holds()).toBe(false);
    platform.fail = null;

    await expect(session.run(() => ({ next: null, result: "nothing" }))).resolves.toBe("nothing");
    expect(holds()).toBe(false);

    await expect(session.run((review) => ({ ...dismiss(review), afterSave: async () => undefined }))).resolves.toBe(
      "saved",
    );
    expect(holds()).toBe(false);
    expect(ops(platform).filter((op) => op === "lock")).toHaveLength(4);
    expect(ops(platform).filter((op) => op === "unlock")).toHaveLength(4);
  });

  it("runs afterSave once the review is saved and before it lets go, and only when it saves", async () => {
    const { platform, session, holds } = await lockedSession();
    const events: string[] = [];
    platform.beforeWrite = (path) => {
      events.push(`write ${path === REVIEW ? "review" : path}`);
    };
    const afterSave = async () => {
      events.push(`afterSave ${holds()}`);
    };
    await session.run((review) => ({ ...dismiss(review), afterSave }));
    expect(events).toEqual(["write review", "afterSave true"]);

    events.length = 0;
    await session.run((review) => ({ next: { ...review }, result: undefined, afterSave }));
    await session.run(() => ({ next: null, result: undefined, afterSave }));
    expect(events).toEqual([]);
  });

  it("still saves and lets go when afterSave throws", async () => {
    const { session, holds } = await lockedSession();
    await expect(
      session.run((review) => ({
        ...dismiss(review),
        afterSave: () => Promise.reject(new Error("The cleanup failed.")),
      })),
    ).resolves.toBe("saved");
    expect(session.review.revision).toBe(4);
    expect(holds()).toBe(false);
  });

  const movedAway = {
    code: "conflict",
    message:
      "Hero.fbx and its review are gone from disk, so the change was not saved. If the model was renamed, Arcue follows it in a moment; otherwise open the model at its new path.",
  };

  it("refuses to recreate review.json while the model is gone, and recreates it while the model is there", async () => {
    const { platform, session, holds } = await lockedSession();
    await platform.rename(MODEL, "/work/game/Striker.fbx");
    await platform.remove("/work/game/.arcue");
    await session.refresh();
    await expect(session.run(dismiss)).rejects.toMatchObject(movedAway);
    await expect(platform.exists("/work/game/.arcue")).resolves.toBe(false);
    expect(holds()).toBe(false);

    await platform.rename("/work/game/Striker.fbx", MODEL);
    const writes = platform.writes.length;
    await expect(session.run(dismiss)).resolves.toBe("saved");
    expect(platform.writes.slice(writes).map((write) => write.path)).toEqual(["/work/game/.arcue/.gitignore", REVIEW]);
  });

  it("refuses while an exporter has removed the model and the review is gone, and saves once the model is back", async () => {
    const { platform, session } = await lockedSession();
    await platform.remove(MODEL);
    await platform.remove(REVIEW);
    await expect(session.run(dismiss)).rejects.toMatchObject(movedAway);
    await platform.writeFile(MODEL, "model again");
    await expect(session.run(dismiss)).resolves.toBe("saved");
    await expect(platform.exists(REVIEW)).resolves.toBe(true);
  });

  it("refuses for a session that never saw review.json once the model is gone", async () => {
    const { platform, session } = await lockedSession({ saved: false });
    await platform.remove(MODEL);
    await expect(session.run(dismiss)).rejects.toMatchObject(movedAway);
    await expect(platform.exists(REVIEW)).resolves.toBe(false);
  });

  it("fails only the change whose lock another holder keeps too long", async () => {
    const { platform, clock, session, key, holds } = await lockedSession({ lockTimeoutMs: 15_000 });
    const unlock = await platform.lock("/work/game", "reviews");
    const waiting = session.run(dismiss).catch((error: unknown) => error);
    const queued = session.run(dismiss);
    while (platform.lockWaiters(key) === 0) await Promise.resolve();
    clock.advance(15_000);
    await expect(waiting).resolves.toMatchObject({ code: "timeout" });
    await unlock();
    await expect(queued).resolves.toBe("saved");
    expect(session.review.revision).toBe(4);
    expect(holds()).toBe(false);
  });

  it("refuses a change whose lock the host cannot create, and writes nothing", async () => {
    const { platform, session } = await lockedSession();
    const before = await platform.readText(REVIEW);
    platform.fail = (operation) => operation === "lock";
    await expect(session.run(dismiss)).rejects.toMatchObject({ code: "forbidden" });
    platform.fail = null;
    await expect(platform.readText(REVIEW)).resolves.toBe(before);
    await expect(session.run(dismiss)).resolves.toBe("saved");
  });

  it("holds the lock around a move, and refuses a move to another reviews root without taking it", async () => {
    const { platform, session, holds } = await lockedSession();
    const striker = { ...repository, folder: "/work/game/.arcue/reviews/Striker.fbx", assetPath: "Striker.fbx" };
    const during: boolean[] = [];
    await session.moveTo(striker, async () => {
      during.push(holds());
      await platform.rename(repository.folder, striker.folder);
    });
    expect(during).toEqual([true]);
    expect(holds()).toBe(false);

    const locks = platform.log.filter((entry) => entry.op === "lock").length;
    const elsewhere = {
      workspaceRoot: "/work/other",
      root: "/work/other/.arcue/reviews",
      folder: "/work/other/.arcue/reviews/Hero.fbx",
      assetPath: "Hero.fbx",
    };
    await expect(session.moveTo(elsewhere, async () => undefined)).rejects.toMatchObject({ code: "internal" });
    expect(platform.log.filter((entry) => entry.op === "lock")).toHaveLength(locks);
  });

  it("holds the lock around a composition write in a compute that saves no review", async () => {
    const { platform, session } = await lockedSession();
    const composition = `${repository.folder}/composition.json`;
    await session.run(async () => {
      await platform.forCore("core-1").writeFileAtomic(composition, "{}");
      return { next: null, result: undefined };
    });
    expect(platform.log.filter((entry) => entry.actor === "core-1").map(({ op, path }) => `${op} ${path}`)).toEqual([
      "lock /work/game\nreviews",
      `writeAtomic ${composition}`,
      "unlock /work/game\nreviews",
    ]);
  });

  it("keeps the lock while it starts over after outside writes, and lets go when it gives up", async () => {
    const { platform, session, holds } = await lockedSession();
    let writes = 0;
    const computes: boolean[] = [];
    await expect(
      session.run(async (review) => {
        computes.push(holds());
        writes++;
        await platform.writeFile(REVIEW, serializeReview({ ...review, revision: 10 + writes }));
        return dismiss(review);
      }),
    ).rejects.toMatchObject({ code: "conflict", message: "review.json keeps changing on disk; try again." });
    expect(computes).toEqual([true, true, true]);
    expect(holds()).toBe(false);
  });

  it("tells about reviews another program saved, never about its own saves", async () => {
    const adopted: [number, number][] = [];
    const { platform, session } = await lockedSession({
      adopted: (review, before) => adopted.push([review.revision, before.revision]),
    });
    await session.run(dismiss);
    expect(adopted).toEqual([]);
    await platform.writeFile(REVIEW, serializeReview({ ...emptyReview(repository.assetPath), revision: 9 }));
    await session.refresh();
    expect(adopted).toEqual([[9, 4]]);
    await session.run(dismiss);
    expect(adopted).toEqual([[9, 4]]);

    const striker = { ...repository, folder: "/work/game/.arcue/reviews/Striker.fbx", assetPath: "Striker.fbx" };
    await session.moveTo(striker, async () => {
      const moved = { ...emptyReview(striker.assetPath), revision: 11 };
      await platform.forCore("core-1").writeFileAtomic(reviewFilePath(striker), serializeReview(moved));
      await platform.forCore("core-1").remove(REVIEW);
    });
    expect(session.review.revision).toBe(11);
    expect(adopted).toEqual([[9, 4]]);
  });
});
