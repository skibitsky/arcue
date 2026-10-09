import type { QueryInput, QueryName, QueryOutput } from "@arcue/protocol";
import { afterEach, describe, expect, it, vi } from "vitest";
import { flush, openStone, POINT } from "../test-helpers";

const callsNamed = (calls: readonly { name: string; input: unknown }[], name: string) =>
  calls.filter((call) => call.name === name);

describe("events while a box is open", () => {
  it("refreshes an untouched edit box from review.changed and saves only the text", async () => {
    const { client, session } = await openStone();
    session.selectComment("c7");
    await client.execute("comment.create", {
      assetId: session.assetId,
      text: "Another comment arrives.",
      version: "3f9a2c1",
      time: { kind: "none" },
      target: null,
      camera: { position: [0, 1, 4], target: [0, 1, 0], up: [0, 1, 0], fov: 30 },
      context: { vertexCount: 0, bones: [], centroid: null, joints: [], viewLabel: "front" },
      screenshot: null,
    });
    await flush();
    expect(session.state.get().box).toMatchObject({ mode: "edit", commentId: "c7" });
    session.setBoxText("Fold the thumb inward.");
    expect(await session.submitBox()).toBe(true);
    expect(callsNamed(client.calls, "comment.update").at(-1)?.input).toEqual({
      assetId: session.assetId,
      commentId: "c7",
      text: "Fold the thumb inward.",
    });
  });

  it("keeps a new box when the review changes, and closes an edit box whose draft was deleted elsewhere", async () => {
    const { client, session, viewport } = await openStone();
    viewport.emit("pinPlaced", { anchor: POINT });
    session.setBoxText("Unsaved");
    await client.execute("comment.delete", { assetId: session.assetId, commentId: "c8" });
    await flush();
    expect(session.state.get().box).toMatchObject({ mode: "new", text: "Unsaved" });
    session.closeBox();
    session.selectComment("c9");
    await client.execute("comment.delete", { assetId: session.assetId, commentId: "c9" });
    await flush();
    expect(session.state.get().box).toBeNull();
  });

  it("closes only the box of the deleted draft, read after the delete returns", async () => {
    const { session } = await openStone();
    session.selectComment("c7");
    const deleting = session.deleteDraft("c7");
    session.selectComment("c8");
    await deleting;
    await flush();
    expect(session.state.get().box).toMatchObject({ mode: "edit", commentId: "c8" });
  });
});

describe("conflicts and repicking", () => {
  it("nudges on Enter while a repick is pending, and lets the user drop the target instead", async () => {
    const { client, session, viewport } = await openStone();
    viewport.emit("pinPlaced", { anchor: POINT });
    session.setBoxText("Fix this edge.");
    await client.simulateExport(session.assetId);
    await flush();
    await session.submitBox();
    const creates = callsNamed(client.calls, "comment.create").length;
    expect(await session.submitBox()).toBe(false);
    expect(callsNamed(client.calls, "comment.create")).toHaveLength(creates);
    expect(session.state.get().box?.nudge).toBe(1);
    session.removeBoxChip("target");
    expect(session.state.get().box).toMatchObject({ target: null, needsRepick: false });
    expect(await session.submitBox()).toBe(true);
    expect(callsNamed(client.calls, "comment.create").at(-1)?.input).toMatchObject({ target: null });
  });

  it("does not treat a refused reopen as a model reload", async () => {
    const { client, session } = await openStone();
    session.reopen("c5");
    session.setBoxText("Still collapses.");
    await client.execute("comment.reopen", { assetId: session.assetId, commentId: "c5", text: "Elsewhere" });
    await flush();
    expect(await session.submitBox()).toBe(false);
    expect(session.state.get().box).toMatchObject({ mode: "reopen", needsRepick: false });
  });

  it("does not let a reopen box change its time or target", async () => {
    const { session } = await openStone();
    session.reopen("c5");
    session.removeBoxChip("time");
    session.removeBoxChip("target");
    expect(session.state.get().box).toMatchObject({
      time: { kind: "frame", clip: "Armature|Rush", frame: 9 },
      timeEdited: false,
    });
  });
});

describe("copy prompt", () => {
  it("keeps an unsent reopen box open after copying", async () => {
    const { session } = await openStone();
    session.reopen("c4");
    session.setBoxText("The foot still slides.");
    await session.copyPrompt();
    expect(session.state.get().box).toMatchObject({ mode: "reopen", commentId: "c4" });
  });

  it("copies once when asked twice before the first copy finishes", async () => {
    const { client, session } = await openStone();
    await Promise.all([session.copyPrompt(), session.copyPrompt()]);
    expect(callsNamed(client.calls, "round.copy")).toHaveLength(1);
  });
});

describe("view commands from agents", () => {
  it("frames exactly what view.frame names, even with a box open", async () => {
    const { client, session, viewport } = await openStone();
    viewport.emit("pinPlaced", { anchor: POINT });
    await client.execute("view.frame", { assetId: session.assetId, commentId: null });
    expect(viewport.framed.at(-1)).toBeNull();
    await client.execute("view.frame", { assetId: session.assetId, commentId: "c9" });
    expect(viewport.framed.at(-1)).toMatchObject({ kind: "surface", vertices: [5120, 5121, 5188] });
    await expect(client.execute("view.frame", { assetId: session.assetId, commentId: "c99" })).rejects.toMatchObject({
      code: "not-found",
    });
    session.frameSelection();
    expect(viewport.framed.at(-1)).toEqual(POINT);
  });

  it("refuses view.selectComment for unknown comments and for a box with unsaved text", async () => {
    const { client, session, viewport } = await openStone();
    await expect(
      client.execute("view.selectComment", { assetId: session.assetId, commentId: "c99" }),
    ).rejects.toMatchObject({ code: "not-found" });
    viewport.emit("pinPlaced", { anchor: POINT });
    session.setBoxText("Unsaved");
    await expect(
      client.execute("view.selectComment", { assetId: session.assetId, commentId: "c7" }),
    ).rejects.toMatchObject({ code: "conflict" });
    await expect(
      client.execute("view.selectComment", { assetId: session.assetId, commentId: null }),
    ).rejects.toMatchObject({ code: "conflict" });
    expect(session.state.get().box?.text).toBe("Unsaved");
  });
});

describe("reconnecting", () => {
  it("reads the review, summary and scene again when the connection returns", async () => {
    const { client, session, store, viewport } = await openStone();
    client.setConnectionState("reconnecting");
    client.setEventsMuted(true);
    await client.execute("comment.delete", { assetId: session.assetId, commentId: "c8" });
    await client.simulateExport(session.assetId);
    client.setEventsMuted(false);
    expect(session.state.get().review?.queue).toEqual(["c7", "c8", "c9"]);
    client.setConnectionState("connected");
    await flush(12);
    expect(store.state.get().connection).toBe("connected");
    expect(session.state.get().review?.queue).toEqual(["c7", "c9"]);
    expect(session.state.get().version).toBe(session.state.get().summary.version);
    expect(session.state.get().version).not.toBe("3f9a2c1");
    expect(viewport.scene).toBe(session.state.get().scene);
  });

  it("closes tabs of assets the core no longer has", async () => {
    const { client, session, store } = await openStone();
    client.setConnectionState("reconnecting");
    client.setEventsMuted(true);
    await client.execute("asset.close", { assetId: session.assetId });
    client.setEventsMuted(false);
    client.setConnectionState("connected");
    await flush(12);
    expect(store.state.get().tabs).toEqual([]);
  });
});

describe("overlapping reloads", () => {
  it("keeps the newest scene when an older scene.get answers last", async () => {
    const { client, session, viewport } = await openStone();
    const query = client.query.bind(client);
    let first = true;
    client.query = async <Name extends QueryName>(name: Name, input: QueryInput<Name>): Promise<QueryOutput<Name>> => {
      if (name === "scene.get" && first) {
        first = false;
        const answer = await query(name, input);
        await new Promise((resolve) => setTimeout(resolve, 30));
        return answer;
      }
      return query(name, input);
    };
    await client.simulateExport(session.assetId);
    await flush(2);
    await client.simulateExport(session.assetId);
    await new Promise((resolve) => setTimeout(resolve, 60));
    await flush();
    const latest = session.state.get().summary.version;
    expect(session.state.get().version).toBe(latest);
    expect(viewport.scene).toBe(session.state.get().scene);
    expect(session.state.get().viewportReady).toBe(true);
  });
});

describe("playback", () => {
  it("starts again from the range start at the range end, and from 0 at the clip end without looping", async () => {
    const { session, viewport } = await openStone();
    session.setRange({ start: 10, end: 20 });
    session.setFrame(20);
    session.setPlaying(true);
    expect(session.currentFrame()).toBe(10);
    expect(viewport.playing).toBe(true);
    session.setPlaying(false);
    session.setRange(null);
    session.setLoop(false);
    session.setFrame(45);
    session.setPlaying(true);
    expect(session.currentFrame()).toBe(0);
    session.setPlaying(false);
    session.setLoop(true);
    session.setFrame(45);
    session.setPlaying(true);
    expect(session.currentFrame()).toBe(45);
  });
});

describe("thumbnails", () => {
  const created: string[] = [];
  const revoked: string[] = [];
  afterEach(() => {
    vi.unstubAllGlobals();
    created.length = 0;
    revoked.length = 0;
  });

  function stubUrls() {
    let next = 0;
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: () => {
        const url = `blob:${next++}`;
        created.push(url);
        return url;
      },
      revokeObjectURL: (url: string) => revoked.push(url),
    });
  }

  it("revokes the URLs of comments that leave the queue", async () => {
    stubUrls();
    const { client, session } = await openStone();
    await client.execute("comment.update", {
      assetId: session.assetId,
      commentId: "c7",
      text: "Has a screenshot now.",
    });
    const c7 = session.comment("c7");
    if (!c7) throw new Error("c7 is missing");
    const withShot = { ...c7, context: { ...c7.context, screenshot: "screenshots/c7.png" } };
    client.query = async () => new Uint8Array([1, 2, 3]) as never;
    await session.loadThumbnail(withShot);
    expect(session.thumbnails.get().urls.c7).toBe("blob:0");
    await session.deleteDraft("c7");
    await flush();
    expect(revoked).toContain("blob:0");
    expect(session.thumbnails.get().urls.c7).toBeUndefined();
  });

  it("tries a failed screenshot fetch again", async () => {
    stubUrls();
    const { client, session, timers } = await openStone();
    let attempts = 0;
    client.query = async () => {
      attempts++;
      if (attempts === 1) throw new Error("Busy.");
      return new Uint8Array([1]) as never;
    };
    const c7 = session.comment("c7");
    if (!c7) throw new Error("c7 is missing");
    await session.loadThumbnail(c7);
    expect(session.thumbnails.get().urls.c7).toBeUndefined();
    timers.advance(2000);
    await flush();
    expect(attempts).toBe(2);
    expect(session.thumbnails.get().urls.c7).toBe("blob:0");
  });
});
