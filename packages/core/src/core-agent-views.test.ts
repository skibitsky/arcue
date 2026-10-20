import type { ViewState } from "@arcue/protocol";
import { ArcueError, createMemoryChannel, createPeer, createRemoteClient } from "@arcue/protocol";
import { describe, expect, it } from "vitest";
import type { TestCore } from "./test-support";
import { camera, FakeWindow, fakeAsset, flush, HERO, heroFiles, heroSpec, startTestCore } from "./test-support";

const VILLAIN = "/work/game/Assets/Art/Villain.fbx";

async function setup(): Promise<TestCore> {
  return startTestCore({ ...heroFiles(), [VILLAIN]: fakeAsset(heroSpec) });
}

/** A core as `arcue serve` runs it, before any browser page connects. */
async function setupServe(): Promise<TestCore> {
  const test = await setup();
  test.window.close();
  await flush();
  return test;
}

/** A page `arcue serve` serves: at the plain address without a view, or at a view's address. */
function browserPage(test: TestCore, connection: string, view?: string): FakeWindow {
  return new FakeWindow(test.core, connection, view, { browser: true });
}

function bridge(test: TestCore) {
  const [coreSide, bridgeSide] = createMemoryChannel();
  test.core.connect(coreSide, { connection: "cli-1", caller: "bridge" });
  return createRemoteClient(createPeer(bridgeSide));
}

const state: ViewState = {
  camera,
  clip: "Armature|Charge",
  frame: 34,
  range: null,
  display: { mode: "clay", skeleton: true },
  parts: { hidden: [], shown: [], isolated: null, lod: 0 },
  outlineOpen: false,
};

describe("opening in an agent session's view", () => {
  it("shows each model only in the page of the view that asked for it", async () => {
    const test = await setup();
    const pageA = new FakeWindow(test.core, "page-a", "a");
    const pageB = new FakeWindow(test.core, "page-b", "b");
    const cli = bridge(test);
    await test.window.client.execute("view.reportFocus", {});

    const hero = await cli.execute("asset.openInView", { path: HERO, view: "a", frame: 12 });
    const villain = await cli.execute("asset.openInView", { path: VILLAIN, view: "b" });

    expect([hero.shown, villain.shown]).toEqual(["view", "view"]);
    expect(pageA.requests).toEqual([
      { kind: "command", name: "view.showAsset", input: { assetId: hero.assetId, frame: 12 } },
    ]);
    expect(pageB.requests).toEqual([{ kind: "command", name: "view.showAsset", input: { assetId: villain.assetId } }]);
    expect(test.window.requests).toEqual([]);
    await cli.execute("view.setFrame", { assetId: hero.assetId, frame: 3 });
    expect(pageA.requestNames).toEqual(["view.showAsset", "view.setFrame"]);
  });

  it("picks the view's page focused last when the view has two", async () => {
    const test = await setup();
    const first = new FakeWindow(test.core, "page-a1", "a");
    const second = new FakeWindow(test.core, "page-a2", "a");
    await first.client.execute("view.reportFocus", {});

    await bridge(test).execute("asset.openInView", { path: HERO, view: "a" });

    expect(first.requestNames).toEqual(["view.showAsset"]);
    expect(second.requests).toEqual([]);
  });

  it("falls back to a desktop window while the view's page is not connected", async () => {
    const test = await setup();
    const pageB = new FakeWindow(test.core, "page-b", "b");
    await pageB.client.execute("view.reportFocus", {});

    const opened = await bridge(test).execute("asset.openInView", { path: HERO, view: "a" });

    expect(opened.shown).toBe("window");
    expect(test.window.requestNames).toEqual(["view.showAsset"]);
    expect(pageB.requests).toEqual([]);
  });

  it("focuses the tab of a model it already shows, and keeps it in the window outside views it fell back to", async () => {
    const test = await setup();
    const cli = bridge(test);
    const { assetId } = await cli.execute("asset.openInView", { path: HERO, view: "a" });

    await expect(cli.execute("asset.openInView", { path: HERO, view: "a", frame: 5 })).resolves.toEqual({
      assetId,
      shown: "window",
    });

    expect(test.window.requests.at(-1)).toEqual({
      kind: "command",
      name: "view.showAsset",
      input: { assetId, frame: 5 },
    });
  });
});

describe("opening in an agent session's view in arcue serve", () => {
  it("holds the model for the view's page rather than show it in a page outside views", async () => {
    const test = await setupServe();
    const plain = browserPage(test, "browser-1");
    await plain.client.execute("view.reportFocus", {});

    const { assetId, shown } = await bridge(test).execute("asset.openInView", { path: HERO, view: "a" });

    expect(shown).toBe("held");
    await plain.client.execute("view.moveAsset", { assetId, unlessShown: true });
    expect(plain.requests).toEqual([]);
  });

  it("shows the model in the view's page once the page outside views closes and the view's page connects", async () => {
    const test = await setupServe();
    const plain = browserPage(test, "browser-1");
    const cli = bridge(test);
    const { assetId } = await cli.execute("asset.openInView", { path: HERO, view: "a", frame: 12 });
    plain.close();
    await flush();

    const page = browserPage(test, "browser-2", "a");
    await page.client.execute("view.moveAsset", { assetId, unlessShown: true });

    expect(page.requests).toEqual([{ kind: "command", name: "view.showAsset", input: { assetId, frame: 12 } }]);
    await cli.execute("view.setFrame", { assetId, frame: 3 });
    expect(page.requestNames).toEqual(["view.showAsset", "view.setFrame"]);
    expect(plain.requests).toEqual([]);
  });

  it("still shows a model opened without a view in a page outside views", async () => {
    const test = await setupServe();
    const plain = browserPage(test, "browser-1");
    const page = browserPage(test, "browser-2", "a");
    await page.client.execute("view.reportFocus", {});

    const { assetId } = await bridge(test).execute("asset.open", { path: HERO });

    expect(plain.requests).toEqual([{ kind: "command", name: "view.showAsset", input: { assetId } }]);
    expect(page.requests).toEqual([]);
  });

  it("refuses a model a page outside views shows, and holds it for the view's page with move", async () => {
    const test = await setupServe();
    const plain = browserPage(test, "browser-1");
    const cli = bridge(test);
    const { assetId } = await cli.execute("asset.open", { path: HERO });

    await expect(cli.execute("asset.openInView", { path: HERO, view: "a" })).rejects.toMatchObject({
      code: "conflict",
      message: "Hero.fbx is open in a window outside agent sessions' views.",
    });
    await expect(cli.execute("asset.openInView", { path: HERO, view: "a", move: true })).resolves.toEqual({
      assetId,
      shown: "held",
    });

    expect(plain.requestNames).toEqual(["view.showAsset", "view.releaseAsset"]);
    const page = browserPage(test, "browser-2", "a");
    await page.client.execute("view.moveAsset", { assetId, unlessShown: true });
    expect(page.requestNames).toEqual(["view.showAsset"]);
  });
});

describe("holding a model for its view's page", () => {
  it("holds the model while no window can show it, and shows it at its clip and frame when the page connects", async () => {
    const test = await setup();
    test.window.close();
    await flush();
    const cli = bridge(test);

    const { assetId, shown } = await cli.execute("asset.openInView", {
      path: HERO,
      view: "a",
      clip: "Armature|Run",
      frame: 7,
    });
    await test.core.idle();

    expect(shown).toBe("held");
    await expect(test.core.client.query("asset.list", {})).resolves.toMatchObject({
      assets: [{ assetId, status: "ready" }],
    });
    await expect(cli.execute("view.setFrame", { assetId, frame: 3 })).rejects.toMatchObject({ code: "unavailable" });

    const other = new FakeWindow(test.core, "page-b", "b");
    const outside = new FakeWindow(test.core, "window-2");
    await other.client.execute("view.moveAsset", { assetId, unlessShown: true });
    await outside.client.execute("view.moveAsset", { assetId, unlessShown: true });
    expect([other.requests, outside.requests]).toEqual([[], []]);

    const page = new FakeWindow(test.core, "page-a", "a");
    await page.client.execute("view.moveAsset", { assetId, unlessShown: true });
    expect(page.requests).toEqual([
      { kind: "command", name: "view.showAsset", input: { assetId, clip: "Armature|Run", frame: 7 } },
    ]);
    await cli.execute("view.setFrame", { assetId, frame: 3 });
    expect(page.requestNames).toEqual(["view.showAsset", "view.setFrame"]);
  });

  it("takes the latest clip and frame for a model it already holds", async () => {
    const test = await setup();
    test.window.close();
    await flush();
    const cli = bridge(test);
    const { assetId } = await cli.execute("asset.openInView", { path: HERO, view: "a", frame: 7 });

    await expect(cli.execute("asset.openInView", { path: HERO, view: "a", frame: 9 })).resolves.toEqual({
      assetId,
      shown: "held",
    });

    const page = new FakeWindow(test.core, "page-a", "a");
    await page.client.execute("view.moveAsset", { assetId, unlessShown: true });
    expect(page.requests[0]?.input).toEqual({ assetId, frame: 9 });
  });

  it("keeps the model in its view when its page reloads", async () => {
    const test = await setup();
    const page = new FakeWindow(test.core, "page-a", "a");
    const cli = bridge(test);
    const { assetId } = await cli.execute("asset.openInView", { path: HERO, view: "a" });
    page.close();
    await flush();

    const outside = new FakeWindow(test.core, "window-2");
    await outside.client.execute("view.moveAsset", { assetId, unlessShown: true });
    await test.window.client.execute("view.moveAsset", { assetId, unlessShown: true });
    expect([test.window.requests, outside.requests]).toEqual([[], []]);

    const reloaded = new FakeWindow(test.core, "page-a-2", "a");
    await reloaded.client.execute("view.moveAsset", { assetId, unlessShown: true });
    expect(reloaded.requestNames).toEqual(["view.showAsset"]);
  });
});

describe("keeping a model inside its view", () => {
  it("ignores state reports from a window of another view", async () => {
    const test = await setup();
    const pageA = new FakeWindow(test.core, "page-a", "a");
    const pageB = new FakeWindow(test.core, "page-b", "b");
    const cli = bridge(test);
    const { assetId } = await cli.execute("asset.openInView", { path: HERO, view: "a" });

    await expect(pageB.client.execute("view.reportState", { assetId, state })).rejects.toMatchObject({
      code: "conflict",
    });
    await expect(test.window.client.execute("view.reportState", { assetId, state })).rejects.toMatchObject({
      code: "conflict",
    });

    await expect(test.core.client.query("viewState.get", { assetId })).resolves.toBeNull();
    await cli.execute("view.setLoop", { assetId, loop: true });
    expect(pageA.requestNames).toEqual(["view.showAsset", "view.setLoop"]);
    expect([pageB.requests, test.window.requests]).toEqual([[], []]);
  });

  it("refuses to show a model of another view in the window that asks", async () => {
    const test = await setup();
    new FakeWindow(test.core, "page-a", "a");
    const pageB = new FakeWindow(test.core, "page-b", "b");
    const { assetId } = await bridge(test).execute("asset.openInView", { path: HERO, view: "a" });

    await expect(pageB.client.execute("view.showAsset", { assetId })).rejects.toMatchObject({ code: "conflict" });
    await expect(pageB.client.execute("view.moveAsset", { assetId })).rejects.toMatchObject({ code: "conflict" });
    expect(pageB.requests).toEqual([]);
  });

  it("does not let a view's page adopt a model opened outside views", async () => {
    const test = await setup();
    const { assetId } = await bridge(test).execute("asset.open", { path: HERO });
    test.window.close();
    await flush();

    const page = new FakeWindow(test.core, "page-a", "a");
    await page.client.execute("view.moveAsset", { assetId, unlessShown: true });
    expect(page.requests).toEqual([]);

    const outside = new FakeWindow(test.core, "window-2");
    await outside.client.execute("view.moveAsset", { assetId, unlessShown: true });
    expect(outside.requestNames).toEqual(["view.showAsset"]);
  });

  it("reopens a model whose page closed in that view only", async () => {
    const test = await setup();
    const page = new FakeWindow(test.core, "page-a", "a");
    const cli = bridge(test);
    const { assetId } = await cli.execute("asset.openInView", { path: HERO, view: "a" });
    page.close();
    await flush();
    const pageB = new FakeWindow(test.core, "page-b", "b");

    await expect(cli.execute("asset.openInView", { path: HERO, view: "b" })).rejects.toMatchObject({
      code: "conflict",
    });
    await expect(cli.execute("asset.open", { path: HERO })).rejects.toMatchObject({ code: "conflict" });
    expect([test.window.requests, pageB.requests]).toEqual([[], []]);

    const reloaded = new FakeWindow(test.core, "page-a-2", "a");
    await expect(cli.execute("asset.openInView", { path: HERO, view: "a" })).resolves.toEqual({
      assetId,
      shown: "view",
    });
    expect(reloaded.requestNames).toEqual(["view.showAsset"]);
  });
});

describe("a model that is open in another view", () => {
  it("is refused with where it is open", async () => {
    const test = await setup();
    const pageA = new FakeWindow(test.core, "page-a", "a");
    const pageB = new FakeWindow(test.core, "page-b", "b");
    const cli = bridge(test);
    await cli.execute("asset.openInView", { path: HERO, view: "a" });

    const refusal = await cli.execute("asset.openInView", { path: HERO, view: "b" }).catch((error: unknown) => error);

    expect(refusal).toBeInstanceOf(ArcueError);
    expect(refusal).toMatchObject({
      code: "conflict",
      message: `Hero.fbx is open in another agent session's view, "a".`,
    });
    expect(pageA.requestNames).toEqual(["view.showAsset"]);
    expect(pageB.requests).toEqual([]);
  });

  it("moves to the asking view with move, keeping the view the other page returns", async () => {
    const test = await setup();
    const pageA = new FakeWindow(test.core, "page-a", "a");
    const pageB = new FakeWindow(test.core, "page-b", "b");
    pageA.respond = ({ name }) => (name === "view.releaseAsset" ? state : undefined);
    const cli = bridge(test);
    const { assetId } = await cli.execute("asset.openInView", { path: HERO, view: "a" });

    await expect(cli.execute("asset.openInView", { path: HERO, view: "b", move: true })).resolves.toEqual({
      assetId,
      shown: "view",
    });

    expect(pageA.requestNames).toEqual(["view.showAsset", "view.releaseAsset"]);
    expect(pageB.requestNames).toEqual(["view.showAsset"]);
    await expect(test.core.client.query("viewState.get", { assetId })).resolves.toEqual(state);
    await cli.execute("view.setLoop", { assetId, loop: true });
    expect(pageB.requestNames).toEqual(["view.showAsset", "view.setLoop"]);
    await expect(pageA.client.execute("view.reportState", { assetId, state })).rejects.toMatchObject({
      code: "conflict",
    });
  });

  it("stays when its page refuses to release a comment box with unsaved text", async () => {
    const test = await setup();
    const pageA = new FakeWindow(test.core, "page-a", "a");
    const pageB = new FakeWindow(test.core, "page-b", "b");
    const cli = bridge(test);
    const { assetId } = await cli.execute("asset.openInView", { path: HERO, view: "a" });
    pageA.respond = ({ name }) => {
      if (name === "view.releaseAsset") throw new ArcueError("conflict", "Hero.fbx has a comment with unsaved text.");
    };

    await expect(cli.execute("asset.openInView", { path: HERO, view: "b", move: true })).rejects.toMatchObject({
      code: "conflict",
      message: "Hero.fbx has a comment with unsaved text.",
    });

    expect(pageB.requests).toEqual([]);
    await cli.execute("view.setLoop", { assetId, loop: true });
    expect(pageA.requestNames).toEqual(["view.showAsset", "view.releaseAsset", "view.setLoop"]);
  });

  it("is refused from a window outside views while the view's page is connected, and moves with move", async () => {
    const test = await setup();
    const cli = bridge(test);
    await cli.execute("asset.open", { path: HERO });
    const page = new FakeWindow(test.core, "page-a", "a");

    await expect(cli.execute("asset.openInView", { path: HERO, view: "a" })).rejects.toMatchObject({
      code: "conflict",
      message: "Hero.fbx is open in a window outside agent sessions' views.",
    });
    expect(page.requests).toEqual([]);

    await cli.execute("asset.openInView", { path: HERO, view: "a", move: true });
    expect(test.window.requestNames).toEqual(["view.showAsset", "view.releaseAsset"]);
    expect(page.requestNames).toEqual(["view.showAsset"]);
  });
});

describe("opening without a view", () => {
  it("shows the model only in a window outside views, even when a view's page was focused last", async () => {
    const test = await setup();
    const page = new FakeWindow(test.core, "page-a", "a");
    await page.client.execute("view.reportFocus", {});

    await bridge(test).execute("asset.open", { path: HERO });

    expect(test.window.requestNames).toEqual(["view.showAsset"]);
    expect(page.requests).toEqual([]);
  });

  it("fails as unavailable when only views' pages are open", async () => {
    const test = await setup();
    const page = new FakeWindow(test.core, "page-a", "a");
    test.window.close();
    await flush();

    await expect(bridge(test).execute("asset.open", { path: HERO })).rejects.toMatchObject({ code: "unavailable" });

    expect(page.requests).toEqual([]);
    await expect(test.core.client.query("asset.list", {})).resolves.toEqual({ assets: [] });
  });

  it("refuses a model that is open in a view", async () => {
    const test = await setup();
    const page = new FakeWindow(test.core, "page-a", "a");
    const cli = bridge(test);
    await cli.execute("asset.openInView", { path: HERO, view: "a" });

    await expect(cli.execute("asset.open", { path: HERO })).rejects.toMatchObject({
      code: "conflict",
      message: `Hero.fbx is open in another agent session's view, "a".`,
    });
    expect(test.window.requests).toEqual([]);
    expect(page.requestNames).toEqual(["view.showAsset"]);
  });

  it("opens in the calling window, in that window's view", async () => {
    const test = await setup();
    const page = new FakeWindow(test.core, "page-a", "a");

    const { assetId } = await page.client.execute("asset.open", { path: HERO });
    page.close();
    await flush();

    await expect(bridge(test).execute("asset.openInView", { path: HERO, view: "b" })).rejects.toMatchObject({
      code: "conflict",
    });
    const reloaded = new FakeWindow(test.core, "page-a-2", "a");
    await reloaded.client.execute("view.moveAsset", { assetId, unlessShown: true });
    expect(reloaded.requestNames).toEqual(["view.showAsset"]);
  });

  it("refuses a view name the protocol does not accept", async () => {
    const test = await setup();

    await expect(bridge(test).execute("asset.openInView", { path: HERO, view: "../a" })).rejects.toMatchObject({
      code: "invalid-input",
    });
  });
});
