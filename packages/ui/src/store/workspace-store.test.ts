import { ArcueError, commands } from "@arcue/protocol";
import { describe, expect, it, vi } from "vitest";
import { FakeCoreClient } from "../../dev/fake-core";
import { STONE_RESONATOR_PATH } from "../../dev/sample-data";
import { flush, ManualTimers, openStone, POINT, setup, withPoseClips } from "../test-helpers";
import { NEW_COMMENT_OVERLAY } from "./asset-session";
import { currentMessage } from "./history";
import { createWorkspaceStore, VIEW_COMMANDS } from "./workspace-store";

describe("opening assets", () => {
  it("adds a tab, loads the review and scene, and shows the requested clip and frame", async () => {
    const { store, session, viewport } = await openStone();
    expect(store.state.get().tabs).toEqual([{ kind: "asset", id: session.assetId }]);
    expect(session.state.get().summary.name).toBe("StoneResonator.fbx");
    expect(session.state.get().review?.queue).toEqual(["c7", "c8", "c9"]);
    expect(viewport.scene?.clips).toHaveLength(14);
    expect(viewport.clip).toBe("Armature|Charge");
    expect(viewport.seconds).toBeCloseTo(34 / 60);
    expect(session.currentFrame()).toBe(34);
    expect(session.state.get().viewportReady).toBe(true);
  });

  it("focuses the existing tab when an open asset is opened again, and replaces an empty tab", async () => {
    const { client, store } = setup();
    store.openNewTab();
    const { assetId } = await client.execute("asset.open", { path: STONE_RESONATOR_PATH });
    await client.execute("asset.open", { path: STONE_RESONATOR_PATH });
    expect(store.state.get().tabs).toEqual([{ kind: "asset", id: assetId }]);
    expect(store.state.get().active).toBe(assetId);
  });

  it("closes a tab through the core", async () => {
    const { store, session, client } = await openStone();
    await store.closeTab(session.assetId);
    await flush();
    expect(store.state.get().tabs).toEqual([]);
    expect(client.calls.some((call) => call.name === "asset.close")).toBe(true);
  });
});

describe("view commands", () => {
  it("handles every command that runs in the view", () => {
    const viewCommands = Object.entries(commands)
      .filter(([, definition]) => definition.runsIn === "view")
      .map(([name]) => name);
    expect([...VIEW_COMMANDS].sort()).toEqual(viewCommands.sort());
  });

  it("routes view commands from the core to the session", async () => {
    const { client, session, viewport } = await openStone();
    await client.execute("view.setFrame", { assetId: session.assetId, frame: 12 });
    expect(session.currentFrame()).toBe(12);
    await client.execute("view.setRange", { assetId: session.assetId, range: { start: 5, end: 20 } });
    expect(viewport.range).toEqual({ start: 5 / 60, end: 20 / 60 });
    await client.execute("view.setClip", { assetId: session.assetId, clip: null });
    expect(session.state.get().clip).toBeNull();
    const shot = await client.execute("view.screenshot", { assetId: session.assetId, drawComments: true });
    expect(shot.png).toBeInstanceOf(Uint8Array);
    expect(viewport.screenshots.at(-1)?.overlays?.every((overlay) => overlay.number === null)).toBe(true);
  });

  it("releases a tab without closing the asset or reporting, and returns its view", async () => {
    const { client, store, session } = await openStone();
    session.setFrame(12);
    const before = client.calls.length;
    const released = await store.handleRequest({
      kind: "command",
      name: "view.releaseAsset",
      input: { assetId: session.assetId },
    });
    expect(released).toMatchObject({ clip: "Armature|Charge", frame: 12 });
    expect(store.state.get().tabs).toEqual([]);
    expect(store.session(session.assetId)).toBeNull();
    expect(client.calls.slice(before)).toEqual([]);
  });

  it("answers a view command that finishes at once with its result, not a promise, so it leaves before the render", async () => {
    const { store, session } = await openStone();
    session.setFrame(12);

    const released = store.handleRequest({
      kind: "command",
      name: "view.releaseAsset",
      input: { assetId: session.assetId },
    });

    expect(released).toMatchObject({ clip: "Armature|Charge", frame: 12 });
    expect(store.handleRequest({ kind: "command", name: "view.showAsset", input: { assetId: session.assetId } })).toBe(
      undefined,
    );
  });

  it("refuses to release a tab whose comment box has unsaved text, and shakes the box", async () => {
    const { store, session, viewport } = await openStone();
    viewport.emit("pinPlaced", { anchor: POINT });
    session.setBoxText("Half written");

    await expect(
      store.handleRequest({ kind: "command", name: "view.releaseAsset", input: { assetId: session.assetId } }),
    ).rejects.toMatchObject({
      code: "conflict",
      message: "StoneResonator.fbx has unsaved comment text where it is open, so it stays there.",
    });

    expect(store.session(session.assetId)).toBe(session);
    expect(session.state.get().box).toMatchObject({ text: "Half written", nudge: 1 });
    expect(store.state.get().tabs).toEqual([{ kind: "asset", id: session.assetId }]);
  });

  it("does not play a clip of one or two frames", async () => {
    const { client, session, viewport } = await openStone({ scene: withPoseClips });
    session.setClip("Armature|Pose", 1);
    session.togglePlaying();
    await client.execute("view.setPlaying", { assetId: session.assetId, playing: true });
    expect(session.time.get().playing).toBe(false);
    expect(viewport.playing).toBe(false);
    expect(session.currentFrame()).toBe(1);
    session.step(1);
    expect(session.currentFrame()).toBe(0);
    session.setClip("Armature|Still");
    session.setPlaying(true);
    expect(viewport.playing).toBe(false);
    session.setClip("Armature|Charge");
    session.setPlaying(true);
    expect(viewport.playing).toBe(true);
  });

  it("does not play a range of one or two frames, and pauses when the range shrinks to one", async () => {
    const { client, session, viewport } = await openStone();
    session.setRange({ start: 10, end: 11 });
    session.setPlaying(true);
    expect(viewport.playing).toBe(false);
    session.setRange({ start: 10, end: 12 });
    session.setPlaying(true);
    expect(viewport.playing).toBe(true);
    await client.execute("view.setRange", { assetId: session.assetId, range: { start: 20, end: 21 } });
    expect(session.time.get().playing).toBe(false);
    expect(viewport.playing).toBe(false);
  });

  it("pauses when a new export turns the playing clip into a pose", async () => {
    const { client, session, viewport } = await openStone();
    session.setPlaying(true);
    expect(viewport.playing).toBe(true);
    const scene = session.state.get().scene;
    if (!scene) throw new Error("No scene.");
    const clips = scene.clips.map((clip) =>
      clip.name === "Armature|Charge" ? { ...clip, duration: 1 / clip.fps, frameCount: 2 } : clip,
    );
    await client.simulateExport(session.assetId, { scene: { ...scene, clips } });
    await flush();
    expect(session.clipInfo()?.frameCount).toBe(2);
    expect(session.time.get().playing).toBe(false);
    expect(viewport.playing).toBe(false);
  });

  it("does not play a selected comment's range of one or two frames", async () => {
    const { session, viewport } = await openStone();
    session.setRange({ start: 10, end: 11 });
    viewport.emit("pinPlaced", { anchor: POINT });
    session.setBoxText("The foot snaps here.");
    expect(await session.submitBox()).toBe(true);
    const made = session.state
      .get()
      .review?.comments.find((comment) => currentMessage(comment) === "The foot snaps here.");
    expect(session.selectComment(made?.id ?? null)).toBe("selected");
    expect(session.state.get().range).toBeNull();
    expect(session.canPlay()).toBe(false);
    session.setPlaying(true);
    expect(viewport.playing).toBe(false);
    session.deselect();
    expect(session.canPlay()).toBe(true);
  });

  it("refuses commands that do not run in a window, and unknown clips", async () => {
    const { store, session } = await openStone();
    await expect(store.handleRequest({ kind: "command", name: "comment.delete", input: {} })).rejects.toMatchObject({
      code: "unknown-command",
    });
    await expect(
      store.handleRequest({ kind: "command", name: "view.setClip", input: { assetId: session.assetId, clip: "Nope" } }),
    ).rejects.toBeInstanceOf(ArcueError);
  });
});

describe("comments", () => {
  it("opens a box on a pin, then creates the comment with context, screenshot and version", async () => {
    const { client, session, viewport } = await openStone();
    viewport.emit("pinPlaced", { anchor: POINT });
    const box = session.state.get().box;
    expect(box).toMatchObject({ mode: "new", time: { kind: "frame", frame: 34 }, targetBone: "Head" });
    expect(viewport.overlays.find((overlay) => overlay.id === NEW_COMMENT_OVERLAY)).toMatchObject({
      number: 4,
      selected: true,
      pending: true,
    });
    session.setBoxText("This spike is too short.");
    expect(await session.submitBox()).toBe(true);
    await flush();
    const create = client.calls.find((call) => call.name === "comment.create");
    expect(create?.input).toMatchObject({ text: "This spike is too short.", target: POINT, version: "3f9a2c1" });
    const added = session.state.get().review?.queue.at(-1);
    expect(session.state.get().review?.queue).toEqual(["c7", "c8", "c9", added]);
    expect(added).not.toMatch(/^c[789]$/);
    expect(session.state.get().box).toBeNull();
    expect(session.state.get().added).toBe(added);
    expect(viewport.screenshots.at(-1)?.overlays?.[0]?.number).toBeNull();
  });

  it("refuses to drop unsaved text: a new click shakes the box instead", async () => {
    const { session, viewport } = await openStone();
    viewport.emit("pinPlaced", { anchor: POINT });
    session.setBoxText("Half written");
    viewport.emit("pinPlaced", { anchor: { ...POINT, vertices: [1, 2, 3] } });
    expect(session.state.get().box).toMatchObject({ text: "Half written", nudge: 1, target: POINT });
    viewport.emit("emptyClicked", {});
    expect(session.state.get().box?.nudge).toBe(2);
  });

  it("keeps the box open and asks for a new pick when the model reloaded under it", async () => {
    const { client, session, store, viewport } = await openStone();
    viewport.emit("pinPlaced", { anchor: POINT });
    session.setBoxText("Fix this edge.");
    await client.simulateExport(session.assetId);
    await flush();
    expect(await session.submitBox()).toBe(false);
    expect(session.state.get().box).toMatchObject({ text: "Fix this edge.", needsRepick: true });
    expect(store.state.get().toast).toMatchObject({ kind: "alert" });
    const repicked = { ...POINT, vertices: [20, 21, 22] as [number, number, number] };
    viewport.emit("pinPlaced", { anchor: repicked });
    expect(session.state.get().box).toMatchObject({ target: repicked, needsRepick: false, nudge: 0 });
    expect(await session.submitBox()).toBe(true);
  });

  it("adds a comment without a surface target from the panel field", async () => {
    const { client, session } = await openStone();
    session.setRange({ start: 10, end: 20 });
    expect(await session.addTextComment("  The whole move is too slow. ")).toBe(true);
    await flush();
    const input = client.calls.find((call) => call.name === "comment.create")?.input;
    expect(input).toMatchObject({
      text: "The whole move is too slow.",
      target: null,
      screenshot: null,
      time: { kind: "range", clip: "Armature|Charge", start: 10, end: 20 },
    });
    expect(session.state.get().range).toBeNull();
  });

  it("clears the timeline's range once a comment is made on it", async () => {
    const { session, viewport } = await openStone();
    session.setRange({ start: 10, end: 20 });
    viewport.emit("pinPlaced", { anchor: POINT });
    expect(session.state.get().box?.time).toEqual({ kind: "range", clip: "Armature|Charge", start: 10, end: 20 });
    session.setBoxText("The arm swings too wide here.");
    expect(await session.submitBox()).toBe(true);
    expect(session.state.get().range).toBeNull();
    expect(viewport.range).toBeNull();
  });

  it("keeps a range picked after the box opened", async () => {
    const { session, viewport } = await openStone();
    session.setRange({ start: 10, end: 20 });
    viewport.emit("pinPlaced", { anchor: POINT });
    session.setRange({ start: 2, end: 6 });
    session.setBoxText("The arm swings too wide here.");
    expect(await session.submitBox()).toBe(true);
    expect(session.state.get().range).toEqual({ start: 2, end: 6 });
  });

  it("loops playback in a selected comment's range until it is deselected", async () => {
    const { session, viewport } = await openStone();
    session.selectComment("c8");
    expect(viewport.range).toEqual({ start: 12 / 60, end: 24 / 60 });
    session.setFrame(24);
    session.setPlaying(true);
    expect(session.currentFrame()).toBe(12);
    session.setPlaying(false);
    session.setRange({ start: 2, end: 6 });
    expect(viewport.range).toEqual({ start: 2 / 60, end: 6 / 60 });
    session.setRange(null);
    expect(viewport.range).toEqual({ start: 12 / 60, end: 24 / 60 });
    session.deselect();
    expect(session.state.get().range).toBeNull();
    expect(viewport.range).toBeNull();
  });

  it("selects a draft: jumps to its time and camera and opens it for editing", async () => {
    const { session, viewport } = await openStone();
    session.selectComment("c8");
    expect(session.state.get()).toMatchObject({ clip: "Armature|Run", range: null, selection: "c8" });
    expect(session.currentFrame()).toBe(12);
    expect(viewport.range).toEqual({ start: 12 / 60, end: 24 / 60 });
    expect(session.state.get().box).toMatchObject({ mode: "edit", commentId: "c8" });
    expect(viewport.camera.position).toEqual([4.3, 1.4, 0.95]);
    session.selectComment("c4");
    expect(session.state.get().box).toBeNull();
    expect(session.state.get().clip).toBe("Armature|Walk");
    session.selectComment("c9");
    expect(session.state.get().clip).toBeNull();
    expect(viewport.clip).toBeNull();
  });

  it("saves an edit with only the changed text", async () => {
    const { client, session } = await openStone();
    session.selectComment("c7");
    session.setBoxText("Fold the thumb further.");
    await session.submitBox();
    await flush();
    const update = client.calls.find((call) => call.name === "comment.update")?.input;
    expect(update).toEqual({ assetId: session.assetId, commentId: "c7", text: "Fold the thumb further." });
  });

  it("sends a new context, screenshot and version when the time chip is removed", async () => {
    const { client, session } = await openStone();
    session.selectComment("c7");
    session.removeBoxChip("time");
    await session.submitBox();
    const update = client.calls.find((call) => call.name === "comment.update")?.input;
    expect(update).toMatchObject({ time: { kind: "none" }, version: "3f9a2c1" });
    expect(update).toHaveProperty("context");
    expect(update).toHaveProperty("screenshot");
  });

  it("reopens a resolved comment with a follow-up", async () => {
    const { session } = await openStone();
    session.reopen("c5");
    expect(session.state.get().box).toMatchObject({ mode: "reopen", followUpRound: 3 });
    session.setBoxText("The shoulder still dips.");
    await session.submitBox();
    await flush();
    expect(session.state.get().review?.queue.at(-1)).toBe("c5");
  });

  it("picks a reopened comment's range for the follow-up, and clears it once sent", async () => {
    const { session } = await openStone();
    session.reopen("c4");
    expect(session.state.get()).toMatchObject({ clip: "Armature|Walk", range: { start: 20, end: 28 } });
    session.setBoxText("The foot still slides.");
    expect(await session.submitBox()).toBe(true);
    expect(session.state.get().range).toBeNull();
  });

  it("numbers draft pins by queue order and shows a selected resolved comment without a number", async () => {
    const { session, viewport } = await openStone();
    expect(viewport.overlays.map((overlay) => [overlay.id, overlay.number])).toEqual([
      ["c7", 1],
      ["c9", 3],
    ]);
    await session.deleteDraft("c7");
    await flush();
    expect(viewport.overlays.map((overlay) => [overlay.id, overlay.number])).toEqual([["c9", 2]]);
  });
});

describe("copy prompt", () => {
  it("copies the round, writes the clipboard when the core could not, and confirms", async () => {
    const { session, store, copied } = await openStone();
    await session.copyPrompt();
    await flush();
    expect(copied[0]).toContain("3D review · round 4 · 3 comments");
    expect(store.state.get().toast).toMatchObject({ kind: "copied", message: "Copied 3 comments as round 4" });
    expect(session.state.get().review?.queue).toEqual([]);
  });

  it("shows the copy sheet when the clipboard is blocked", async () => {
    const { session, store } = await openStone({ clipboard: "blocked" });
    await session.copyPrompt();
    expect(store.state.get().copySheet?.round).toBe(4);
    expect(store.state.get().toast?.kind).toBe("info");
  });
});

describe("view state and settings", () => {
  it("reports the view to the core after changes settle", async () => {
    const { client, session, timers } = await openStone();
    const reports = () => client.calls.filter((call) => call.name === "view.reportState");
    const before = reports().length;
    session.setFrame(10);
    session.setFrame(11);
    session.setDisplayMode("clay");
    expect(reports()).toHaveLength(before);
    timers.advance(400);
    await flush();
    expect(reports()).toHaveLength(before + 1);
    expect(reports().at(-1)?.input).toMatchObject({
      state: { clip: "Armature|Charge", frame: 11, display: { mode: "clay", skeleton: false } },
    });
  });

  it("loads and changes the prompt coordinate convention", async () => {
    const { client, store } = await openStone();
    expect(store.state.get().settings).toEqual({ coordinates: "y-up" });
    await store.setCoordinates("z-up-blender");
    expect(store.state.get().settings).toEqual({ coordinates: "z-up-blender" });
    expect(client.calls.at(-1)).toEqual({ name: "settings.set", input: { coordinates: "z-up-blender" } });
  });

  it("takes the settings another Arcue changed", async () => {
    const client = new FakeCoreClient({ catalog: () => null });
    const subscribe = vi.spyOn(client, "subscribe");
    const store = createWorkspaceStore({ client, setTimer: new ManualTimers().setTimer });
    store.start();
    await flush();
    expect(store.state.get().settings).toEqual({ coordinates: "y-up" });
    const changed = subscribe.mock.calls.find(([name]) => name === "settings.changed")?.[1];
    if (!changed) throw new Error("The store does not listen for settings.changed.");
    changed({ settings: { coordinates: "z-up-blender", authorName: "Ada" } });
    expect(store.state.get().settings).toEqual({ coordinates: "z-up-blender", authorName: "Ada" });
  });

  it("keeps the settings another Arcue changed while a change of its own fails", async () => {
    const client = new FakeCoreClient({ catalog: () => null });
    const subscribe = vi.spyOn(client, "subscribe");
    const execute = vi.spyOn(client, "execute");
    const store = createWorkspaceStore({ client, setTimer: new ManualTimers().setTimer });
    store.start();
    await flush();
    const changed = subscribe.mock.calls.find(([name]) => name === "settings.changed")?.[1];
    if (!changed) throw new Error("The store does not listen for settings.changed.");
    const busy = new ArcueError("timeout", "The settings are busy.");

    execute.mockRejectedValueOnce(busy);
    await store.setCoordinates("z-up-blender");
    expect(store.state.get().settings).toEqual({ coordinates: "y-up" });
    expect(store.state.get().toast).toMatchObject({ message: "The settings are busy.", kind: "alert" });

    execute.mockImplementationOnce(async () => {
      changed({ settings: { coordinates: "y-up", authorName: "Ada" } });
      throw busy;
    });
    await store.setCoordinates("z-up-blender");
    expect(store.state.get().settings).toEqual({ coordinates: "y-up", authorName: "Ada" });
  });
});

describe("reconnecting", () => {
  it("forgets the asset summaries, so an id that a new core gives another asset never shows the old name", async () => {
    const { store, session } = await openStone();
    const { assetId } = session;
    store.releaseAsset(assetId);
    store.showAsset({ assetId });
    expect(store.session(assetId)?.state.get().summary.name).toBe("StoneResonator.fbx");

    store.releaseAsset(assetId);
    store.forgetSummaries();
    store.showAsset({ assetId });
    expect(store.session(assetId)?.state.get().summary).toMatchObject({ path: "", name: "", status: "loading" });
    await flush();
    expect(store.session(assetId)?.state.get().summary.name).toBe("StoneResonator.fbx");
  });
});

describe("continuing an earlier review", () => {
  const earlier = STONE_RESONATOR_PATH.replace("StoneResonator.fbx", "StoneStriker.fbx");
  const candidate = {
    path: earlier,
    comments: 3,
    lastLoadedAt: "2026-10-08T14:00:00.000Z",
    match: "structure" as const,
  };

  it("shows one short toast naming the earlier file when the core continues a review by itself", async () => {
    const { client, store, session, timers } = await openStone();
    const renamed = STONE_RESONATOR_PATH.replace("StoneResonator.fbx", "Resonator.fbx");
    client.simulateRename(session.assetId, renamed);
    await flush();
    expect(session.state.get().summary).toMatchObject({ path: renamed, name: "Resonator.fbx" });
    expect(store.state.get().toast).toMatchObject({
      message: "Continued the review of StoneResonator.fbx",
      kind: "info",
    });
    timers.advance(3200);
    expect(store.state.get().toast).toBeNull();
  });

  it("keeps an offer until it is taken, which moves the review without a toast", async () => {
    const { client, store, session, timers } = await openStone();
    client.simulateOffer(session.assetId, candidate);
    await flush();
    expect(session.state.get().offer).toEqual(candidate);
    timers.advance(60_000);
    expect(session.state.get().offer).toEqual(candidate);

    await session.continueReview();
    await flush();
    expect(client.calls.find((call) => call.name === "review.relink")?.input).toEqual({
      assetId: session.assetId,
      from: earlier,
    });
    expect(session.state.get().offer).toBeNull();
    expect(store.state.get().toast).toBeNull();
  });

  it("shows the offer a tab's asset already has when the tab opens", async () => {
    const { client, store, session } = await openStone();
    client.simulateOffer(session.assetId, candidate);
    await flush();
    store.releaseAsset(session.assetId);
    store.showAsset({ assetId: session.assetId });
    await flush();
    expect(store.session(session.assetId)?.state.get().offer).toEqual(candidate);
  });

  it("remembers a dismissal in the tab's view state, so the tab asks only once", async () => {
    const { client, store, session } = await openStone();
    client.simulateOffer(session.assetId, candidate);
    await flush();
    session.dismissOffer();
    await flush();
    expect(session.state.get().offer).toBeNull();
    const report = client.calls.filter((call) => call.name === "view.reportState").at(-1);
    expect(report?.input).toMatchObject({ state: { relinkOfferDismissed: true } });

    client.simulateOffer(session.assetId, candidate);
    await session.refresh();
    await flush();
    expect(session.state.get().offer).toBeNull();

    const released = store.releaseAsset(session.assetId);
    await client.execute("view.reportState", { assetId: session.assetId, state: released ?? fail() });
    store.showAsset({ assetId: session.assetId });
    await flush();
    expect(store.session(session.assetId)?.state.get().offer).toBeNull();
  });
});

function fail(): never {
  throw new Error("The tab had no view to release.");
}
