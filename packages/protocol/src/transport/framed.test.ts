import { describe, expect, it } from "vitest";
import { acceptBridge, connectBridge, HANDSHAKE_MAX_FRAME_BYTES } from "../bridge";
import type { ByteStream } from "./framed";
import { encodeFrame, FrameReader, framedChannel, framedEndpoint, MAX_FRAME_BYTES } from "./framed";
import { jsonFrameCodec as json } from "./json-codec";
import { createPeer } from "./peer";
import { createRemoteClient } from "./remote-client";

/** Two connected streams that deliver every write as one-byte chunks, to exercise reassembly. */
function streamPair(): [ByteStream, ByteStream] {
  type Side = { data: Set<(bytes: Uint8Array) => void>; close: Set<() => void> };
  const a: Side = { data: new Set(), close: new Set() };
  const b: Side = { data: new Set(), close: new Set() };
  let closed = false;
  const make = (own: Side, other: Side): ByteStream => ({
    write(bytes) {
      const copy = bytes.slice();
      queueMicrotask(() => {
        for (let index = 0; index < copy.byteLength; index++)
          for (const listener of other.data) listener(copy.slice(index, index + 1));
      });
    },
    onData(listener) {
      own.data.add(listener);
      return () => own.data.delete(listener);
    },
    onClose(listener) {
      own.close.add(listener);
      return () => own.close.delete(listener);
    },
    close() {
      if (closed) return;
      closed = true;
      queueMicrotask(() => {
        for (const listener of [...a.close, ...b.close]) listener();
      });
    },
  });
  return [make(a, b), make(b, a)];
}

const timers = {
  ms: 1000,
  setTimer: (delayMs: number, callback: () => void) => {
    const handle = setTimeout(callback, delayMs);
    return () => clearTimeout(handle);
  },
};

describe("frames", () => {
  it("splits chunks into frames and joins frames split across chunks", () => {
    const reader = new FrameReader();
    const one = encodeFrame(Uint8Array.of(1, 2, 3));
    const two = encodeFrame(Uint8Array.of(4));
    const joined = new Uint8Array([...one, ...two]);
    expect(reader.push(joined.subarray(0, 5))).toEqual([]);
    expect(reader.push(joined.subarray(5, 9))).toEqual([Uint8Array.of(1, 2, 3)]);
    expect(reader.push(joined.subarray(9))).toEqual([Uint8Array.of(4)]);
  });

  it("refuses a frame larger than the limit", () => {
    const header = new Uint8Array(4);
    new DataView(header.buffer).setUint32(0, MAX_FRAME_BYTES + 1);
    expect(() => new FrameReader().push(header)).toThrow(/too large/);
  });

  it("holds only the first frame to the first-frame limit", () => {
    const small = encodeFrame(new Uint8Array(16));
    const large = encodeFrame(new Uint8Array(64));
    expect(() => new FrameReader({ firstFrameMaxBytes: 32 }).push(large)).toThrow(/too large/);
    const reader = new FrameReader({ firstFrameMaxBytes: 32 });
    expect(reader.push(new Uint8Array([...small, ...large]))).toHaveLength(2);
  });

  it("keeps messages that arrive before anyone listens", async () => {
    const [left, right] = streamPair();
    const sender = framedChannel(left, json);
    const receiver = framedChannel(right, json);
    sender.send({ n: 1 });
    sender.send({ n: 2 });
    await new Promise((resolve) => setTimeout(resolve, 10));
    await expect(receiver.receive()).resolves.toEqual({ n: 1 });
    const seen: unknown[] = [];
    receiver.listen((value) => seen.push(value));
    expect(seen).toEqual([{ n: 2 }]);
  });

  it("carries envelopes between peers", async () => {
    const [left, right] = streamPair();
    createPeer(framedEndpoint(framedChannel(left, json)), { handleRequest: () => ({ assets: [] }) });
    const client = createRemoteClient(createPeer(framedEndpoint(framedChannel(right, json))));
    await expect(client.query("asset.list", {})).resolves.toEqual({ assets: [] });
  });
});

describe("bridge handshake", () => {
  const token = "t".repeat(48);

  it("accepts the right token and then carries envelopes", async () => {
    const [left, right] = streamPair();
    const accepted = acceptBridge(framedChannel(left, json), { token, timeout: timers });
    const connected = connectBridge(framedChannel(right, json), { token, timeout: timers });
    const [coreSide, bridgeSide] = await Promise.all([accepted, connected]);
    expect(coreSide.user).toBeUndefined();
    createPeer(coreSide.endpoint, { handleRequest: ({ name }) => ({ answered: name }) });
    const peer = createPeer(bridgeSide);
    await expect(peer.request("query", "asset.list", {})).resolves.toEqual({ answered: "asset.list" });
  });

  it("keeps a request sent right after the hello", async () => {
    const [left, right] = streamPair();
    const bridge = framedChannel(right, json);
    bridge.send({ type: "arcue.hello", version: 1, token });
    bridge.send({ type: "request", id: 1, kind: "query", name: "asset.list", input: {} });
    const { endpoint } = await acceptBridge(framedChannel(left, json), { token, timeout: timers });
    const names: string[] = [];
    createPeer(endpoint, { handleRequest: ({ name }) => names.push(name) });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(names).toEqual(["asset.list"]);
  });

  it("passes on the user a bridge acts for", async () => {
    const [left, right] = streamPair();
    const accepted = acceptBridge(framedChannel(left, json), { token, timeout: timers });
    const connected = connectBridge(framedChannel(right, json), { token, timeout: timers, user: { name: "Agent" } });
    const [coreSide] = await Promise.all([accepted, connected]);
    expect(coreSide.user).toEqual({ name: "Agent" });
  });

  it("refuses a hello whose user is not valid, saying why", async () => {
    const [left, right] = streamPair();
    const accepted = acceptBridge(framedChannel(left, json), { token, timeout: timers });
    const connected = connectBridge(framedChannel(right, json), { token, timeout: timers, user: { name: " " } });
    await expect(accepted).rejects.toMatchObject({ code: "forbidden" });
    await expect(connected).rejects.toThrow(/user name is not valid/);
  });

  it("rejects a wrong token on both sides and closes the channel", async () => {
    const [left, right] = streamPair();
    const core = framedChannel(left, json);
    let closed = false;
    core.onClose(() => {
      closed = true;
    });
    const accepted = acceptBridge(core, { token, timeout: timers });
    const connected = connectBridge(framedChannel(right, json), { token: "x".repeat(48), timeout: timers });
    await expect(accepted).rejects.toMatchObject({ code: "forbidden" });
    await expect(connected).rejects.toMatchObject({ code: "forbidden" });
    expect(closed).toBe(true);
  });

  it("closes a connection whose hello is larger than the handshake limit", async () => {
    const [left, right] = streamPair();
    const core = framedChannel(left, json, { firstFrameMaxBytes: HANDSHAKE_MAX_FRAME_BYTES });
    const accepted = acceptBridge(core, { token, timeout: timers });
    framedChannel(right, json).send({ type: "arcue.hello", version: 1, token: "t".repeat(HANDSHAKE_MAX_FRAME_BYTES) });
    await expect(accepted).rejects.toMatchObject({ code: "disconnected" });
  });

  it("gives up on a silent client", async () => {
    const [left] = streamPair();
    const accepted = acceptBridge(framedChannel(left, json), { token, timeout: { ...timers, ms: 5 } });
    await expect(accepted).rejects.toMatchObject({ code: "timeout" });
  });
});
