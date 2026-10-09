import type { ViewState } from "@arcue/protocol";
import { createMemoryChannel, createPeer, createRemoteClient } from "@arcue/protocol";
import { describe, expect, it } from "vitest";
import type { TestCore } from "./test-support";
import { camera, FakeWindow, flush, HERO, heroFiles, openAsset, pinComment, startTestCore } from "./test-support";

async function setup(): Promise<TestCore & { assetId: string }> {
  const test = await startTestCore(heroFiles());
  const assetId = await openAsset(test);
  test.window.requests.length = 0;
  return { ...test, assetId };
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
  parts: { hidden: ["Hero/Body"], shown: [], isolated: null, lod: 0 },
};

describe("view commands", () => {
  it("forwards view commands from the command line to the window that shows the asset", async () => {
    const test = await setup();
    const cli = bridge(test);
    await cli.execute("view.setFrame", { assetId: test.assetId, frame: 34 });
    await cli.execute("view.frame", { assetId: test.assetId });
    expect(test.window.requests).toEqual([
      { kind: "command", name: "view.setFrame", input: { assetId: test.assetId, frame: 34 } },
      { kind: "command", name: "view.frame", input: { assetId: test.assetId, commentId: null } },
    ]);
  });

  it("returns the window's screenshot and checks its answer", async () => {
    const test = await setup();
    const cli = bridge(test);
    test.window.respond = ({ name }) => (name === "view.screenshot" ? { png: Uint8Array.of(1, 2, 3) } : undefined);
    await expect(cli.execute("view.screenshot", { assetId: test.assetId })).resolves.toEqual({
      png: Uint8Array.of(1, 2, 3),
    });
    expect(test.window.requests[0]?.input).toEqual({
      assetId: test.assetId,
      width: 1280,
      height: 720,
      drawComments: false,
    });
    test.window.respond = () => ({ png: "not bytes" });
    await expect(cli.execute("view.screenshot", { assetId: test.assetId })).rejects.toMatchObject({ code: "internal" });
  });

  it("passes the window's errors back to the caller", async () => {
    const test = await setup();
    test.window.respond = () => {
      throw new Error("The clip is not loaded.");
    };
    await expect(
      test.core.client.execute("view.setClip", { assetId: test.assetId, clip: "Armature|Run" }),
    ).rejects.toMatchObject({ message: "The clip is not loaded." });
  });

  it("rejects view commands for unknown assets and assets whose window closed", async () => {
    const test = await setup();
    await expect(test.core.client.execute("view.setPlaying", { assetId: "a9", playing: true })).rejects.toMatchObject({
      code: "not-found",
    });
    test.window.close();
    await flush();
    await expect(
      test.core.client.execute("view.setPlaying", { assetId: test.assetId, playing: true }),
    ).rejects.toMatchObject({ code: "unavailable" });
  });

  it("keeps internal view commands away from the command line", async () => {
    const test = await setup();
    const cli = bridge(test);
    await expect(cli.execute("view.showAsset", { assetId: test.assetId })).rejects.toMatchObject({ code: "forbidden" });
    await expect(cli.execute("view.reportState", { assetId: test.assetId, state })).rejects.toMatchObject({
      code: "forbidden",
    });
  });
});

describe("view state", () => {
  it("keeps the latest state a window reported, for restoring after a crash", async () => {
    const test = await setup();
    await expect(test.core.client.query("viewState.get", { assetId: test.assetId })).resolves.toBeNull();
    await test.window.client.execute("view.reportState", { assetId: test.assetId, state });
    await test.window.client.execute("view.reportState", { assetId: test.assetId, state: { ...state, frame: 40 } });
    await expect(test.core.client.query("viewState.get", { assetId: test.assetId })).resolves.toEqual({
      ...state,
      frame: 40,
    });
    await expect(test.window.client.execute("view.reportState", { assetId: "a9", state })).rejects.toMatchObject({
      code: "not-found",
    });
  });

  it("follows a tab to the window that asks to show it", async () => {
    const test = await setup();
    const second = new FakeWindow(test.core, "window-2");
    await second.client.execute("view.showAsset", { assetId: test.assetId, frame: 12 });
    expect(second.requests).toEqual([
      { kind: "command", name: "view.showAsset", input: { assetId: test.assetId, frame: 12 } },
    ]);
    await test.core.client.execute("view.setLoop", { assetId: test.assetId, loop: true });
    expect(second.requestNames).toEqual(["view.showAsset", "view.setLoop"]);
    expect(test.window.requests).toEqual([]);
  });

  it("follows a tab to the window that reports its state", async () => {
    const test = await setup();
    const second = new FakeWindow(test.core, "window-2");
    await second.client.execute("view.reportState", { assetId: test.assetId, state });
    await test.core.client.execute("view.setSkeleton", { assetId: test.assetId, visible: false });
    expect(second.requestNames).toEqual(["view.setSkeleton"]);
  });

  it("shows an asset whose window closed in another window when it is opened again", async () => {
    const test = await setup();
    const second = new FakeWindow(test.core, "window-2");
    test.window.close();
    await flush();
    await expect(test.core.client.execute("asset.open", { path: "/work/game/Assets/Art/Hero.fbx" })).resolves.toEqual({
      assetId: test.assetId,
    });
    expect(second.requestNames).toEqual(["view.showAsset"]);
  });

  it("refuses a second connection with the same name", async () => {
    const test = await setup();
    expect(() => new FakeWindow(test.core, "window-1")).toThrow(expect.objectContaining({ code: "conflict" }));
    const [coreSide] = createMemoryChannel();
    expect(() => test.core.connect(coreSide, { connection: "window-1", caller: "bridge" })).toThrow(
      expect.objectContaining({ code: "conflict" }),
    );
  });
});

describe("moving a tab between windows", () => {
  it("releases the tab in its window, keeps the released view and shows it in the caller's window", async () => {
    const test = await setup();
    test.window.respond = ({ name }) => (name === "view.releaseAsset" ? state : undefined);
    const second = new FakeWindow(test.core, "window-2");
    await second.client.execute("view.moveAsset", { assetId: test.assetId });
    expect(test.window.requests).toEqual([
      { kind: "command", name: "view.releaseAsset", input: { assetId: test.assetId } },
    ]);
    expect(second.requests).toEqual([{ kind: "command", name: "view.showAsset", input: { assetId: test.assetId } }]);
    await expect(test.core.client.query("viewState.get", { assetId: test.assetId })).resolves.toEqual(state);
    await test.core.client.execute("view.setFrame", { assetId: test.assetId, frame: 3 });
    expect(second.requestNames).toEqual(["view.showAsset", "view.setFrame"]);
  });

  it("keeps the last reported view when the releasing window has none", async () => {
    const test = await setup();
    await test.window.client.execute("view.reportState", { assetId: test.assetId, state });
    test.window.respond = () => null;
    const second = new FakeWindow(test.core, "window-2");
    await second.client.execute("view.moveAsset", { assetId: test.assetId });
    await expect(test.core.client.query("viewState.get", { assetId: test.assetId })).resolves.toEqual(state);
  });

  it("only focuses the tab when it is already in the caller's window", async () => {
    const test = await setup();
    await test.window.client.execute("view.moveAsset", { assetId: test.assetId });
    expect(test.window.requestNames).toEqual(["view.showAsset"]);
  });

  it("gives the tab back when the receiving window fails to show it", async () => {
    const test = await setup();
    const second = new FakeWindow(test.core, "window-2");
    second.respond = () => {
      throw new Error("The window is closing.");
    };
    await expect(second.client.execute("view.moveAsset", { assetId: test.assetId })).rejects.toMatchObject({
      message: "The window is closing.",
    });
    expect(test.window.requestNames).toEqual(["view.releaseAsset", "view.showAsset"]);
  });

  it("refuses to move the tab of an asset that is closing", async () => {
    const test = await setup();
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const write = test.platform.writeFileAtomic.bind(test.platform);
    test.platform.writeFileAtomic = async (path, data) => {
      await held;
      await write(path, data);
    };
    const creating = test.core.client.execute("comment.create", pinComment(test.assetId));
    const closing = test.core.client.execute("asset.close", { assetId: test.assetId });
    const second = new FakeWindow(test.core, "window-2");
    await expect(second.client.execute("view.moveAsset", { assetId: test.assetId })).rejects.toMatchObject({
      code: "conflict",
    });
    expect(second.requests).toEqual([]);
    release();
    await creating;
    await closing;
  });

  it("refuses moves from the command line", async () => {
    const test = await setup();
    await expect(bridge(test).execute("view.moveAsset", { assetId: test.assetId })).rejects.toMatchObject({
      code: "forbidden",
    });
    await expect(test.core.client.execute("view.moveAsset", { assetId: test.assetId })).rejects.toMatchObject({
      code: "forbidden",
    });
  });
});

describe("opening with a view state", () => {
  it("starts a newly opened asset from the given view, and ignores it for an open asset", async () => {
    const test = await startTestCore(heroFiles());
    const { assetId } = await test.window.client.execute("asset.open", { path: HERO, viewState: state });
    await expect(test.core.client.query("viewState.get", { assetId })).resolves.toEqual(state);
    await test.window.client.execute("asset.open", { path: HERO, viewState: { ...state, frame: 2 } });
    await expect(test.core.client.query("viewState.get", { assetId })).resolves.toEqual(state);
  });
});
