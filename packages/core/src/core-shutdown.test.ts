import type { Importer } from "@arcue/scene";
import { describe, expect, it, vi } from "vitest";
import type { RecordingPlatform, TestCore } from "./test-support";
import {
  fakeImporter,
  flush,
  HERO,
  HERO_REVIEW,
  heroFiles,
  looseComment,
  openAsset,
  readJson,
  startSecondCore,
  startTestCore,
} from "./test-support";

const REVIEW_JSON = `${HERO_REVIEW}/review.json`;

/** Holds back every write of review.json by a core until `release`; `writing` resolves once one waits. */
function holdReviewWrites(platform: RecordingPlatform): { writing: Promise<void>; release(): void } {
  const writing = Promise.withResolvers<void>();
  const released = Promise.withResolvers<void>();
  platform.beforeWrite = async (path, _op, actor) => {
    if (path !== REVIEW_JSON || actor === null) return;
    writing.resolve();
    await released.promise;
  };
  return { writing: writing.promise, release: () => released.resolve() };
}

async function opened(): Promise<TestCore & { assetId: string }> {
  const test = await startTestCore(heroFiles());
  return { ...test, assetId: await openAsset(test) };
}

describe("ArcueCore.shutdown", () => {
  it("closes an asset only once the save in flight is on disk, then removes the handlers", async () => {
    const test = await opened();
    const held = holdReviewWrites(test.platform);
    const created = test.window.client.execute("comment.create", looseComment(test.assetId));
    await held.writing;
    let stopped = false;
    const shutdown = test.core.shutdown().then(() => {
      stopped = true;
    });
    await flush();
    expect(stopped).toBe(false);

    expect(test.platform.heldLocks()).toEqual([test.platform.lockKey("/work/game", "reviews")]);

    held.release();
    await shutdown;
    const { commentId } = await created;
    expect(await readJson(test.platform, REVIEW_JSON)).toMatchObject({ comments: [{ id: commentId }] });
    expect(test.platform.heldLocks()).toEqual([]);
    await expect(test.core.client.query("asset.list", {})).rejects.toMatchObject({ code: "unavailable" });
  });

  it("does not wait for a parse in flight, and saves nothing once it ends", async () => {
    const parse = Promise.withResolvers<void>();
    const gated: Importer = {
      ...fakeImporter,
      import: async (request) => {
        await parse.promise;
        return fakeImporter.import(request);
      },
    };
    const test = await startTestCore(heroFiles());
    const { core, window } = await startSecondCore(test, { importers: [gated] });
    const { platform } = test;
    await window.client.execute("asset.open", { path: HERO });
    await vi.waitFor(() => expect(platform.parsed).toEqual(["Hero.fbx"]));

    await core.shutdown();
    const writes = platform.writes.length;
    parse.resolve();
    await flush();
    await core.idle();
    expect(platform.writes).toHaveLength(writes);
    await expect(platform.exists(REVIEW_JSON)).resolves.toBe(false);
  });

  it("waits for an open in flight, then closes the asset it opened", async () => {
    const test = await startTestCore(heroFiles());
    const statting = Promise.withResolvers<void>();
    const released = Promise.withResolvers<void>();
    const stat = test.platform.stat.bind(test.platform);
    let held = false;
    vi.spyOn(test.platform, "stat").mockImplementation(async (path) => {
      if (path === HERO && !held) {
        held = true;
        statting.resolve();
        await released.promise;
      }
      return stat(path);
    });
    const closed: string[] = [];
    test.core.client.subscribe("asset.closed", ({ assetId }) => closed.push(assetId));
    const opening = test.window.client.execute("asset.open", { path: HERO });
    await statting.promise;
    let stopped = false;
    const shutdown = test.core.shutdown().then(() => {
      stopped = true;
    });
    await flush();
    expect(stopped).toBe(false);

    released.resolve();
    await shutdown;
    const { assetId } = await opening;
    expect(closed).toEqual([assetId]);
    const writes = test.platform.writes.length;
    await flush();
    await test.core.idle();
    expect(test.platform.writes).toHaveLength(writes);
  });

  it("lets a save that waits for a held reviews lock time out, then finishes", async () => {
    const test = await startTestCore(heroFiles(), { lockTimeoutMs: 15_000 });
    const assetId = await openAsset(test);
    const key = test.platform.lockKey("/work/game", "reviews");
    const unlock = await test.platform.lock("/work/game", "reviews");
    const created = test.window.client
      .execute("comment.create", looseComment(assetId))
      .catch((error: unknown) => error);
    await vi.waitFor(() => expect(test.platform.lockWaiters(key)).toBe(1));
    let stopped = false;
    const shutdown = test.core.shutdown().then(() => {
      stopped = true;
    });
    await flush();
    expect(stopped).toBe(false);

    test.clock.advance(15_000);
    await expect(created).resolves.toMatchObject({ code: "timeout" });
    await shutdown;
    expect(test.platform.heldLocks()).toEqual([key]);
    await unlock();
    expect(test.platform.heldLocks()).toEqual([]);
    await expect(readJson(test.platform, REVIEW_JSON)).resolves.toMatchObject({ comments: [] });
  });

  it("does not wait for a window that closed while an open waited for it", async () => {
    const test = await startTestCore(heroFiles());
    test.window.respond = (request) => (request.name === "view.showAsset" ? new Promise(() => undefined) : undefined);
    const opening = test.window.client.execute("asset.open", { path: HERO }).catch((error: unknown) => error);
    await vi.waitFor(() => expect(test.window.requestNames).toContain("view.showAsset"));

    test.window.close();
    await test.core.shutdown();
    await expect(opening).resolves.toMatchObject({ code: "disconnected" });
    expect(test.clock.pendingTimers).toBe(0);
  });

  it("joins a close already in flight", async () => {
    const test = await opened();
    const closed: string[] = [];
    test.core.client.subscribe("asset.closed", ({ assetId }) => closed.push(assetId));
    const closing = test.core.client.execute("asset.close", { assetId: test.assetId });
    await test.core.shutdown();
    await closing;
    expect(closed).toEqual([test.assetId]);
  });

  it("refuses opens once it has started", async () => {
    const test = await opened();
    const held = holdReviewWrites(test.platform);
    const created = test.window.client.execute("comment.create", looseComment(test.assetId));
    await held.writing;
    const shutdown = test.core.shutdown();

    const stopping = { code: "unavailable", message: "Arcue is stopping." };
    await expect(test.core.client.execute("asset.open", { path: HERO })).rejects.toMatchObject(stopping);
    await expect(test.window.client.execute("asset.open", { path: HERO })).rejects.toMatchObject(stopping);
    await expect(test.core.client.execute("asset.openInView", { path: HERO, view: "agent" })).rejects.toMatchObject(
      stopping,
    );
    held.release();
    await shutdown;
    await created;
  });
});
