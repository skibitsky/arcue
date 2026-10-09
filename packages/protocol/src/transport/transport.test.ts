import { afterEach, describe, expect, it } from "vitest";
import { ArcueError } from "../errors";
import { portEndpoint } from "./endpoint";
import { isEnvelope } from "./envelope";
import { createMemoryChannel } from "./memory-channel";
import type { RequestHandler } from "./peer";
import { createPeer, withTransfer } from "./peer";
import { createRemoteClient } from "./remote-client";

const channels: MessageChannel[] = [];

afterEach(() => {
  for (const channel of channels.splice(0)) {
    channel.port1.close();
    channel.port2.close();
  }
});

function connect(options: { core?: RequestHandler; window?: RequestHandler } = {}) {
  const channel = new MessageChannel();
  channels.push(channel);
  const core = createPeer(portEndpoint(channel.port1), { handleRequest: options.core });
  const window = createPeer(portEndpoint(channel.port2), { handleRequest: options.window });
  return { channel, core, window, client: createRemoteClient(window) };
}

describe("transport over a MessageChannel", () => {
  it("round-trips a command and its result", async () => {
    const received: unknown[] = [];
    const { client } = connect({
      core: (request) => {
        received.push(request);
        return { round: 4, prompt: "3D review · round 4 · 3 comments", copiedToClipboard: true };
      },
    });
    const result = await client.execute("round.copy", { assetId: "a1" });
    expect(result).toEqual({ round: 4, prompt: "3D review · round 4 · 3 comments", copiedToClipboard: true });
    expect(received).toEqual([{ kind: "command", name: "round.copy", input: { assetId: "a1" } }]);
  });

  it("round-trips a query", async () => {
    const { client } = connect({ core: (request) => (request.kind === "query" ? { assets: [] } : null) });
    await expect(client.query("asset.list", {})).resolves.toEqual({ assets: [] });
  });

  it("rejects with the handler's error code", async () => {
    const { client } = connect({
      core: () => {
        throw new ArcueError("not-found", "No asset a9 is open.");
      },
    });
    const failure = client.execute("asset.close", { assetId: "a9" });
    await expect(failure).rejects.toBeInstanceOf(ArcueError);
    await expect(failure).rejects.toMatchObject({ code: "not-found", message: "No asset a9 is open." });
  });

  it("reports unexpected errors as internal", async () => {
    const { client } = connect({
      core: async () => {
        throw new TypeError("boom");
      },
    });
    await expect(client.execute("asset.close", { assetId: "a1" })).rejects.toMatchObject({
      code: "internal",
      message: "boom",
    });
  });

  it("fails requests when the other side does not answer requests", async () => {
    const { core } = connect();
    await expect(core.request("command", "view.setFrame", { assetId: "a1", frame: 3 })).rejects.toMatchObject({
      code: "unavailable",
    });
  });

  it("lets the core send requests to a window", async () => {
    const { core } = connect({ window: (request) => ({ handledInWindow: request.name }) });
    await expect(core.request("command", "view.setFrame", { assetId: "a1", frame: 3 })).resolves.toEqual({
      handledInWindow: "view.setFrame",
    });
  });

  it("delivers events to subscribers until they unsubscribe", async () => {
    const { core, client } = connect();
    const payloads: unknown[] = [];
    const first = new Promise<void>((resolve) => {
      const unsubscribe = client.subscribe("round.copied", (payload) => {
        payloads.push(payload);
        unsubscribe();
        resolve();
      });
    });
    core.emit("round.copied", { assetId: "a1", round: 4 });
    await first;
    core.emit("round.copied", { assetId: "a1", round: 5 });
    await client.query("asset.list", {}).catch(() => undefined);
    expect(payloads).toEqual([{ assetId: "a1", round: 4 }]);
  });

  it("moves marked buffers instead of copying them", async () => {
    const png = new Uint8Array([137, 80, 78, 71]);
    const { core } = connect({ window: () => withTransfer({ png }, [png.buffer]) });
    const result = await core.request("command", "view.screenshot", { assetId: "a1" });
    expect(result).toEqual({ png: new Uint8Array([137, 80, 78, 71]) });
    expect(png.byteLength).toBe(0);
  });

  it("rejects pending requests when the peer closes", async () => {
    const { window, client } = connect({ core: () => new Promise(() => undefined) });
    const pending = client.execute("asset.reload", { assetId: "a1" });
    window.close();
    await expect(pending).rejects.toMatchObject({ code: "disconnected" });
    await expect(client.execute("asset.reload", { assetId: "a1" })).rejects.toMatchObject({ code: "disconnected" });
  });

  it("closes and rejects pending requests when the other side closes its port", async () => {
    const { channel, window, client } = connect({ core: () => new Promise(() => undefined) });
    const closed = new Promise<void>((resolve) => window.onClose(resolve));
    const pending = client.execute("asset.reload", { assetId: "a1" });
    channel.port1.close();
    await expect(pending).rejects.toMatchObject({ code: "disconnected" });
    await closed;
    expect(client.connectionState).toBe("closed");
  });

  it("ignores messages that are not envelopes", async () => {
    const { channel, client } = connect({ core: () => ({ assets: [] }) });
    channel.port1.postMessage({ hello: "world" });
    channel.port1.postMessage({ type: "response", id: 999, ok: true, output: null });
    await expect(client.query("asset.list", {})).resolves.toEqual({ assets: [] });
  });
});

describe("isEnvelope", () => {
  it("accepts the three envelope types", () => {
    expect(isEnvelope({ type: "request", id: 1, kind: "command", name: "asset.open", input: {} })).toBe(true);
    expect(isEnvelope({ type: "response", id: 1, ok: true, output: null })).toBe(true);
    expect(
      isEnvelope({ type: "response", id: 1, ok: false, error: { code: "internal", message: "x", issues: [] } }),
    ).toBe(true);
    expect(isEnvelope({ type: "event", name: "asset.closed", payload: {} })).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isEnvelope(null)).toBe(false);
    expect(isEnvelope("request")).toBe(false);
    expect(isEnvelope({ type: "request", id: "1", kind: "command", name: "x" })).toBe(false);
    expect(isEnvelope({ type: "request", id: 1, kind: "mutation", name: "x" })).toBe(false);
    expect(isEnvelope({ type: "response", id: 1, ok: false })).toBe(false);
  });
});

describe("peer over a memory channel", () => {
  function manualTimer() {
    const timers: { callback: () => void; cancelled: boolean }[] = [];
    return {
      timers,
      setTimer: (_delay: number, callback: () => void) => {
        const timer = { callback, cancelled: false };
        timers.push(timer);
        return () => {
          timer.cancelled = true;
        };
      },
      fireAll: () => {
        for (const timer of timers.splice(0)) if (!timer.cancelled) timer.callback();
      },
    };
  }

  it("times out requests that get no response", async () => {
    const [near, far] = createMemoryChannel();
    createPeer(far, { handleRequest: () => new Promise(() => undefined) });
    const timer = manualTimer();
    const peer = createPeer(near, { requestTimeout: { ms: 5000, setTimer: timer.setTimer } });
    const pending = peer.request("command", "asset.reload", { assetId: "a1" });
    timer.fireAll();
    await expect(pending).rejects.toMatchObject({ code: "timeout" });
  });

  it("cancels the timeout when the response arrives", async () => {
    const [near, far] = createMemoryChannel();
    createPeer(far, { handleRequest: () => ({ version: "v2" }) });
    const timer = manualTimer();
    const peer = createPeer(near, { requestTimeout: { ms: 5000, setTimer: timer.setTimer } });
    await expect(peer.request("command", "asset.reload", { assetId: "a1" })).resolves.toEqual({ version: "v2" });
    expect(timer.timers.map((entry) => entry.cancelled)).toEqual([true]);
  });

  it("keeps delivering events when a listener throws, and reports the error", async () => {
    const [near, far] = createMemoryChannel();
    const errors: unknown[] = [];
    const sender = createPeer(far);
    const client = createRemoteClient(createPeer(near), { onListenerError: (error) => errors.push(error) });
    const received: unknown[] = [];
    client.subscribe("asset.closed", () => {
      throw new Error("listener failed");
    });
    const delivered = new Promise<void>((resolve) =>
      client.subscribe("asset.closed", (payload) => {
        received.push(payload);
        resolve();
      }),
    );
    sender.emit("asset.closed", { assetId: "a1" });
    await delivered;
    expect(received).toEqual([{ assetId: "a1" }]);
    expect(errors).toEqual([new Error("listener failed")]);
  });

  it("copies messages, so the sender's later changes do not reach the receiver", async () => {
    const [near, far] = createMemoryChannel();
    const received = new Promise<unknown>((resolve) => far.listen(resolve));
    const payload = { assetId: "a1" };
    near.post({ type: "event", name: "asset.closed", payload }, []);
    payload.assetId = "changed";
    await expect(received).resolves.toEqual({ type: "event", name: "asset.closed", payload: { assetId: "a1" } });
  });

  it("closes both sides together", async () => {
    const [near, far] = createMemoryChannel();
    const peer = createPeer(far);
    const closed = new Promise<void>((resolve) => peer.onClose(resolve));
    near.close();
    await closed;
    await expect(peer.request("command", "asset.reload", { assetId: "a1" })).rejects.toMatchObject({
      code: "disconnected",
    });
  });
});
