import type { AssetSummary, EventName, ReviewFile } from "@arcue/protocol";
import { createMemoryChannel, createPeer, createRemoteClient } from "@arcue/protocol";
import { describe, expect, it } from "vitest";
import { versionIdOf } from "./hash";
import type { TestCore } from "./test-support";
import {
  FakeWindow,
  fakeAsset,
  flush,
  HERO,
  HERO_REVIEW,
  heroFiles,
  heroSpec,
  openAsset,
  pinComment,
  readJson,
  startTestCore,
} from "./test-support";

function record(test: TestCore, ...names: EventName[]): { name: EventName; payload: unknown }[] {
  const events: { name: EventName; payload: unknown }[] = [];
  for (const name of names) test.core.client.subscribe(name, (payload) => events.push({ name, payload }));
  return events;
}

function statuses(events: { name: EventName; payload: unknown }[]): string[] {
  return events
    .filter((event) => event.name === "asset.updated")
    .map((event) => (event.payload as { asset: AssetSummary }).asset.status);
}

function bridge(test: TestCore) {
  const [coreSide, bridgeSide] = createMemoryChannel();
  test.core.connect(coreSide, { connection: "cli-1", caller: "bridge" });
  return createRemoteClient(createPeer(bridgeSide));
}

describe("asset.open", () => {
  it("shows the asset in the caller's window, announces it, then loads it in the background", async () => {
    const test = await startTestCore(heroFiles());
    const events = record(test, "asset.opened", "asset.updated", "review.changed");
    const { assetId } = await test.window.client.execute("asset.open", {
      path: HERO,
      clip: "Armature|Charge",
      frame: 34,
    });
    expect(test.window.requests).toEqual([
      { kind: "command", name: "view.showAsset", input: { assetId, clip: "Armature|Charge", frame: 34 } },
    ]);
    expect(events[0]).toMatchObject({ name: "asset.opened", payload: { asset: { assetId, status: "loading" } } });
    await test.core.idle();

    const version = versionIdOf(new TextEncoder().encode(fakeAsset(heroSpec)));
    expect(version).toMatch(/^[0-9a-f]{7}$/);
    expect(statuses(events)).toEqual(["loading", "ready"]);
    await expect(test.core.client.query("asset.list", {})).resolves.toEqual({
      assets: [{ assetId, path: HERO, name: "Hero.fbx", status: "ready", version, error: null }],
    });
    const scene = await test.core.client.query("scene.get", { assetId });
    expect(scene.version).toBe(version);
    expect(scene.scene.meshes).toHaveLength(1);

    const review = (await readJson(test.platform, `${HERO_REVIEW}/review.json`)) as ReviewFile;
    expect(review).toMatchObject({
      schemaVersion: 1,
      asset: { path: "Assets/Art/Hero.fbx" },
      versions: [
        {
          id: version,
          fileModifiedAt: "2026-10-08T14:02:00.000Z",
          loadedAt: "2026-10-08T14:02:00.000Z",
          exporter: "Blender 5.2",
          meshes: [{ mesh: "Hero/Body", topology: scene.scene.meshes[0]?.topology }],
        },
      ],
    });
    await expect(test.core.client.query("review.get", { assetId })).resolves.toEqual(review);
  });

  it("returns the open asset's id and focuses its tab in the window that shows it", async () => {
    const test = await startTestCore(heroFiles());
    const second = new FakeWindow(test.core, "window-2");
    const assetId = await openAsset(test);
    await expect(
      second.client.execute("asset.open", { path: "/work/game/Assets/Art/../Art/Hero.fbx" }),
    ).resolves.toEqual({ assetId });
    expect(test.window.requestNames).toEqual(["view.showAsset", "view.showAsset"]);
    expect(second.requests).toEqual([]);
  });

  it("opens assets from the command line in the window focused last", async () => {
    const test = await startTestCore(heroFiles());
    const second = new FakeWindow(test.core, "window-2");
    const cli = bridge(test);
    await second.client.execute("view.reportFocus", {});
    await cli.execute("asset.open", { path: HERO });
    expect(second.requestNames).toEqual(["view.showAsset"]);
    expect(test.window.requests).toEqual([]);
  });

  it("rejects when no window is open, the file is missing, or the path is not absolute", async () => {
    const test = await startTestCore(heroFiles());
    await expect(test.core.client.execute("asset.open", { path: "/work/game/Missing.fbx" })).rejects.toMatchObject({
      code: "not-found",
    });
    await expect(test.core.client.execute("asset.open", { path: "Assets/Art/Hero.fbx" })).rejects.toMatchObject({
      code: "invalid-input",
    });
    await expect(test.core.client.execute("asset.open", { path: "/work/game/Assets" })).rejects.toMatchObject({
      code: "invalid-input",
    });
    test.window.close();
    await flush();
    await expect(test.core.client.execute("asset.open", { path: HERO })).rejects.toMatchObject({
      code: "unavailable",
    });
    await expect(test.core.client.query("asset.list", {})).resolves.toEqual({ assets: [] });
  });

  it("refuses a review.json that does not match the schema instead of overwriting it", async () => {
    const files = { ...heroFiles(), [`${HERO_REVIEW}/review.json`]: JSON.stringify({ schemaVersion: 1 }) };
    const test = await startTestCore(files);
    await expect(test.window.client.execute("asset.open", { path: HERO })).rejects.toMatchObject({ code: "conflict" });
    await expect(test.platform.readText(`${HERO_REVIEW}/review.json`)).resolves.toBe('{"schemaVersion":1}');
  });

  it("keeps reviews of assets outside a repository in the app data folder", async () => {
    const test = await startTestCore({ "/loose/Rock.fbx": fakeAsset(heroSpec) });
    const assetId = await openAsset(test, "/loose/Rock.fbx");
    await test.core.client.execute("comment.create", pinComment(assetId));
    await expect(readJson(test.platform, "/app-data/reviews/loose/Rock.fbx/review.json")).resolves.toMatchObject({
      asset: { path: "/loose/Rock.fbx" },
      queue: ["c1"],
    });
  });

  it("lets the importer read images anywhere in the repository and nothing else", async () => {
    const spec = {
      ...heroSpec,
      textures: ["../Textures/Hero.png", "../Textures/Hero.mat", "../../../../../etc/x.png"],
    };
    const test = await startTestCore({
      ...heroFiles(spec),
      "/work/game/Assets/Textures/Hero.png": "albedo",
      "/work/game/Assets/Textures/Hero.mat": "material",
      "/etc/x.png": "outside",
    });
    const assetId = await openAsset(test);
    const { scene } = await test.core.client.query("scene.get", { assetId });
    expect(scene.textures.map((texture) => texture.name)).toEqual(["../Textures/Hero.png"]);
  });
});

describe("loading versions", () => {
  it("reports a failed first parse and has no scene", async () => {
    const test = await startTestCore(heroFiles({ ...heroSpec, fail: "Not an FBX file." }));
    const assetId = await openAsset(test);
    await expect(test.core.client.query("asset.list", {})).resolves.toMatchObject({
      assets: [{ status: "failed", version: null, error: "Not an FBX file." }],
    });
    await expect(test.core.client.query("scene.get", { assetId })).rejects.toMatchObject({ code: "unavailable" });
    await expect(test.platform.exists(`${HERO_REVIEW}/review.json`)).resolves.toBe(false);
  });

  it("keeps the previous version when a reload fails to parse, and recovers on the next good file", async () => {
    const test = await startTestCore(heroFiles());
    const assetId = await openAsset(test);
    const { version } = await test.core.client.query("scene.get", { assetId });
    await test.platform.writeFile(HERO, fakeAsset({ ...heroSpec, fail: "Unexpected end of file." }));
    await expect(test.core.client.execute("asset.reload", { assetId })).rejects.toMatchObject({
      message: "Unexpected end of file.",
    });
    await expect(test.core.client.query("asset.list", {})).resolves.toMatchObject({
      assets: [{ status: "failed", version, error: "Unexpected end of file." }],
    });
    await expect(test.core.client.query("scene.get", { assetId })).resolves.toMatchObject({ version });

    const fixed = { ...heroSpec, meshes: [{ name: "Body", grid: 4 }] };
    await test.platform.writeFile(HERO, fakeAsset(fixed));
    const reloaded = await test.core.client.execute("asset.reload", { assetId });
    expect(reloaded.version).not.toBe(version);
    await expect(test.core.client.query("asset.list", {})).resolves.toMatchObject({
      assets: [{ status: "ready", version: reloaded.version, error: null }],
    });
    const review = await test.core.client.query("review.get", { assetId });
    expect(review.versions.map((entry) => entry.id)).toEqual([version, reloaded.version]);
  });

  it("does not parse the file again when its bytes have not changed", async () => {
    const test = await startTestCore(heroFiles());
    const assetId = await openAsset(test);
    const events = record(test, "asset.updated");
    const { version } = await test.core.client.query("scene.get", { assetId });
    await expect(test.core.client.execute("asset.reload", { assetId })).resolves.toEqual({ version });
    expect(events).toEqual([]);
  });

  it("reloads a watched file once its size and modification time hold across two checks", async () => {
    const test = await startTestCore(heroFiles());
    const assetId = await openAsset(test);
    const events = record(test, "asset.updated");
    const { version } = await test.core.client.query("scene.get", { assetId });

    await test.platform.writeFile(HERO, fakeAsset({ ...heroSpec, meshes: [{ name: "Body", grid: 5 }] }).slice(0, 20));
    await flush();
    await test.core.idle();
    test.clock.advance(200);
    await test.platform.writeFile(HERO, fakeAsset({ ...heroSpec, meshes: [{ name: "Body", grid: 5 }] }));
    await flush();
    await test.core.idle();
    test.clock.advance(299);
    await test.core.idle();
    expect(events).toEqual([]);

    test.clock.advance(1);
    await flush();
    await test.core.idle();
    expect(statuses(events)).toEqual(["loading", "ready"]);
    const reloaded = await test.core.client.query("scene.get", { assetId });
    expect(reloaded.version).not.toBe(version);
    expect(reloaded.scene.meshes[0]?.sourceVertexCount).toBe(25);
  });

  it("waits for a removed file to come back, as an atomic replace does", async () => {
    const test = await startTestCore(heroFiles());
    const assetId = await openAsset(test);
    const events = record(test, "asset.updated");
    await test.platform.remove(HERO);
    await flush();
    await test.core.idle();
    test.clock.advance(300);
    await flush();
    await test.core.idle();
    test.clock.advance(300);
    await flush();
    await test.core.idle();
    expect(events).toEqual([]);
    expect(test.clock.pendingTimers).toBe(0);

    test.clock.advance(1000);
    await test.platform.writeFile(HERO, fakeAsset({ ...heroSpec, meshes: [{ name: "Body", grid: 4 }] }));
    await flush();
    await test.core.idle();
    test.clock.advance(300);
    await flush();
    await test.core.idle();
    expect(statuses(events)).toEqual(["loading", "ready"]);
    await expect(test.core.client.query("scene.get", { assetId })).resolves.toMatchObject({
      scene: { meshes: [{ sourceVertexCount: 16 }] },
    });
  });
});

describe("asset.close", () => {
  it("forgets the asset, stops watching it and keeps its review on disk", async () => {
    const test = await startTestCore(heroFiles());
    const assetId = await openAsset(test);
    await test.core.client.execute("comment.create", pinComment(assetId));
    const events = record(test, "asset.closed", "asset.updated");
    await test.core.client.execute("asset.close", { assetId });
    expect(events).toEqual([{ name: "asset.closed", payload: { assetId } }]);
    await expect(test.core.client.query("asset.list", {})).resolves.toEqual({ assets: [] });
    await expect(test.core.client.query("review.get", { assetId })).rejects.toMatchObject({ code: "not-found" });

    await test.platform.writeFile(HERO, fakeAsset({ ...heroSpec, meshes: [{ name: "Body", grid: 4 }] }));
    await flush();
    test.clock.advance(1000);
    await test.core.idle();
    expect(events).toHaveLength(1);
    expect(test.clock.pendingTimers).toBe(0);

    const reopened = await openAsset(test);
    expect(reopened).not.toBe(assetId);
    await expect(test.core.client.query("review.get", { assetId: reopened })).resolves.toMatchObject({ queue: ["c1"] });
  });
});
