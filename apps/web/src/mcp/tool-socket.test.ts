import { ManualClock } from "@arcue/core";
import type { ChannelPiece, WindowChannelInput, WindowChannelOutput } from "@arcue/protocol";
import { MAX_PIECE_BYTES } from "@arcue/protocol";
import { describe, expect, it, vi } from "vitest";
import { ChannelClosed, fromBase64, ToolSocket, toBase64 } from "./tool-socket";

const CHANNEL = "AAAAAAAAAAAAAAAAAAAAAA";

/** The server's end of one channel, as `window_channel` keeps it: pieces numbered from 0 each way. */
class FakeChannel {
  readonly calls: WindowChannelInput[] = [];
  /** The messages the server took, joined from their pieces. */
  readonly taken: Uint8Array[] = [];
  latest = true;
  closed = false;
  /** Errors the next calls of an op throw, in order. */
  readonly failures: Partial<Record<WindowChannelInput["op"], Error[]>> = {};
  #next = 0;
  #partial: Uint8Array[] = [];
  #out: ChannelPiece[] = [];
  #outBase = 0;
  #wake: (() => void) | null = null;

  call = async (input: WindowChannelInput): Promise<WindowChannelOutput> => {
    this.calls.push(input);
    const failure = this.failures[input.op]?.shift();
    if (failure) throw failure;
    if (input.op === "open") return { channel: CHANNEL, latest: this.latest };
    if (input.op === "close") {
      this.end();
      return {};
    }
    if (input.op === "send") {
      const seq = input.seq ?? 0;
      const pieces = input.pieces ?? [];
      for (const [index, piece] of pieces.entries()) {
        if (seq + index < this.#next) continue;
        this.#partial.push(fromBase64(piece.data));
        if (!piece.more) this.taken.push(joined(this.#partial.splice(0)));
        this.#next++;
      }
      return { next: this.#next };
    }
    const from = input.from ?? 0;
    this.#out.splice(0, from - this.#outBase);
    this.#outBase = from;
    if (this.#out.length === 0 && !this.closed) await new Promise<void>((resolve) => (this.#wake = resolve));
    return { from, pieces: this.#out.slice(0, 2), closed: this.closed && this.#out.length <= 2 };
  };

  /** Sends the page a message in pieces of at most `size` bytes. */
  push(bytes: Uint8Array, size = bytes.byteLength): void {
    for (let at = 0; at < bytes.byteLength; at += size) {
      const end = Math.min(at + size, bytes.byteLength);
      this.#out.push({ data: toBase64(bytes.subarray(at, end)), ...(end < bytes.byteLength ? { more: true } : {}) });
    }
    this.#wakeUp();
  }

  end(): void {
    this.closed = true;
    this.#wakeUp();
  }

  #wakeUp(): void {
    const wake = this.#wake;
    this.#wake = null;
    wake?.();
  }
}

function joined(parts: readonly Uint8Array[]): Uint8Array {
  const whole = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0));
  let at = 0;
  for (const part of parts) {
    whole.set(part, at);
    at += part.byteLength;
  }
  return whole;
}

function bytes(length: number, seed = 1): Uint8Array {
  return Uint8Array.from({ length }, (_, index) => (index * 7 + seed) % 251);
}

function events(socket: ToolSocket) {
  const seen = { opened: 0, messages: [] as Uint8Array[], closes: [] as number[] };
  socket.addEventListener("open", () => seen.opened++);
  socket.addEventListener("message", (event) => seen.messages.push(new Uint8Array((event as MessageEvent).data)));
  socket.addEventListener("close", (event) => seen.closes.push((event as Event & { code: number }).code));
  return seen;
}

describe("ToolSocket", () => {
  it("opens with the model it shows, and carries messages each way, a large one in pieces", async () => {
    const server = new FakeChannel();
    server.latest = false;
    const socket = new ToolSocket({ call: server.call, shown: { path: "/work/Hero.fbx", shownAt: 7 } });
    const seen = events(socket);
    await vi.waitFor(() => expect(seen.opened).toBe(1));
    expect(server.calls[0]).toEqual({ op: "open", path: "/work/Hero.fbx", shownAt: 7 });
    expect(socket.latest).toBe(false);
    expect(socket.readyState).toBe(WebSocket.OPEN);

    const large = bytes(MAX_PIECE_BYTES * 2 + 5);
    socket.send(bytes(3));
    socket.send(large);
    await vi.waitFor(() => expect(server.taken).toHaveLength(2));
    expect(server.taken).toEqual([bytes(3), large]);
    const sends = server.calls.filter((call) => call.op === "send");
    expect(sends.map((call) => [call.seq, call.pieces?.length])).toEqual([
      [0, 1],
      [1, 2],
      [3, 1],
    ]);

    server.push(bytes(10, 3), 4);
    server.push(bytes(2, 5));
    await vi.waitFor(() => expect(seen.messages).toHaveLength(2));
    expect(seen.messages).toEqual([bytes(10, 3), bytes(2, 5)]);
    expect(seen.closes).toEqual([]);
    socket.close();
  });

  it("sends a batch again after a failure that may pass, which the server takes once", async () => {
    const clock = new ManualClock(0);
    const server = new FakeChannel();
    server.failures.send = [new Error("The request timed out.")];
    const socket = new ToolSocket({ call: server.call, setTimer: clock.setTimer.bind(clock) });
    const seen = events(socket);
    await vi.waitFor(() => expect(seen.opened).toBe(1));
    socket.send(bytes(4));
    await vi.waitFor(() => expect(server.calls.filter((call) => call.op === "send")).toHaveLength(1));
    clock.advance(500);
    await vi.waitFor(() => expect(server.taken).toEqual([bytes(4)]));
    socket.send(bytes(5));
    await vi.waitFor(() => expect(server.taken).toEqual([bytes(4), bytes(5)]));
    expect(server.calls.filter((call) => call.op === "send").map((call) => call.seq)).toEqual([0, 0, 1]);
    socket.close();
  });

  it("closes abnormally once when the server says the channel is gone, and does not call again", async () => {
    const server = new FakeChannel();
    const socket = new ToolSocket({ call: server.call });
    const seen = events(socket);
    await vi.waitFor(() => expect(seen.opened).toBe(1));
    server.failures.send = [new ChannelClosed("This window's channel is closed.")];
    socket.send(bytes(4));
    await vi.waitFor(() => expect(seen.closes).toEqual([1006]));
    expect(socket.readyState).toBe(WebSocket.CLOSED);
    const calls = server.calls.length;
    socket.send(bytes(4));
    socket.close();
    expect(server.calls).toHaveLength(calls);
    expect(seen.closes).toEqual([1006]);
    server.end();
  });

  it("delivers the last messages of a channel the server closed, then closes", async () => {
    const server = new FakeChannel();
    const socket = new ToolSocket({ call: server.call });
    const seen = events(socket);
    await vi.waitFor(() => expect(seen.opened).toBe(1));
    server.push(bytes(6));
    server.end();
    await vi.waitFor(() => expect(seen.closes).toEqual([1006]));
    expect(seen.messages).toEqual([bytes(6)]);
  });

  it("closes cleanly and tells the server, and closes abnormally when it cannot open", async () => {
    const server = new FakeChannel();
    const socket = new ToolSocket({ call: server.call });
    const seen = events(socket);
    await vi.waitFor(() => expect(seen.opened).toBe(1));
    socket.close();
    expect(seen.closes).toEqual([1000]);
    await vi.waitFor(() => expect(server.calls.at(-1)).toEqual({ op: "close", channel: CHANNEL }));

    const refused = new FakeChannel();
    refused.failures.open = [new ChannelClosed("Arcue in the browser does not take the view's window.")];
    const failed = new ToolSocket({ call: refused.call });
    const failedSeen = events(failed);
    await vi.waitFor(() => expect(failedSeen.closes).toEqual([1006]));
    expect(failedSeen.opened).toBe(0);
  });

  it("closes the channel that opens after the page closed the socket", async () => {
    const server = new FakeChannel();
    const socket = new ToolSocket({ call: server.call });
    const seen = events(socket);
    socket.close();
    await vi.waitFor(() => expect(server.calls.at(-1)).toEqual({ op: "close", channel: CHANNEL }));
    expect(seen).toEqual({ opened: 0, messages: [], closes: [1000] });
  });
});
