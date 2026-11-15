import { ManualClock } from "@arcue/core";
import { beforeEach, describe, expect, it } from "vitest";
import type { RelaySocket } from "./window-relay";
import { WindowRelay } from "./window-relay";

interface FakeSocket extends RelaySocket {
  sent: Buffer[];
  closed: boolean;
  deliver(bytes: Uint8Array): void;
  end(): void;
}

function fakeSocket(): FakeSocket {
  const messages: ((bytes: Uint8Array) => void)[] = [];
  const closes: (() => void)[] = [];
  const socket: FakeSocket = {
    sent: [],
    closed: false,
    send: (bytes) => socket.sent.push(Buffer.from(bytes)),
    onMessage: (listener) => messages.push(listener),
    onClose: (listener) => closes.push(listener),
    close: () => socket.end(),
    deliver: (bytes) => {
      for (const listener of messages) listener(bytes);
    },
    end: () => {
      if (socket.closed) return;
      socket.closed = true;
      for (const listener of closes) listener();
    },
  };
  return socket;
}

const base64 = (text: string) => Buffer.from(text).toString("base64");
const joined = (pieces: { data: string }[]) => Buffer.concat(pieces.map((piece) => Buffer.from(piece.data, "base64")));

let clock: ManualClock;
let sockets: FakeSocket[];

beforeEach(() => {
  clock = new ManualClock();
  sockets = [];
});

function relay(options: { pieceBytes?: number; receiveBytes?: number; maxChannels?: number } = {}): WindowRelay {
  return new WindowRelay({
    setTimer: (delayMs, callback) => clock.setTimer(delayMs, callback),
    connect: async () => {
      const socket = fakeSocket();
      sockets.push(socket);
      return socket;
    },
    waitMs: 20_000,
    idleMs: 60_000,
    sweepMs: 3000,
    ...options,
  });
}

describe("WindowRelay", () => {
  it("passes the view's messages to the core, joining pieces and skipping ones sent before", async () => {
    const windows = relay();
    const id = await windows.open();

    expect(windows.send(id, 0, [{ data: base64("one") }, { data: base64("tw"), more: true }])).toBe(2);
    expect(windows.send(id, 1, [{ data: base64("tw"), more: true }, { data: base64("o") }])).toBe(3);

    expect(sockets[0]?.sent.map(String)).toEqual(["one", "two"]);
    expect(() => windows.send(id, 5, [{ data: base64("x") }])).toThrow("did not arrive");
  });

  it("returns the core's messages in pieces from the number the view asks for", async () => {
    const windows = relay({ pieceBytes: 4, receiveBytes: 8 });
    const id = await windows.open();
    sockets[0]?.deliver(Buffer.from("abcdefghij"));
    sockets[0]?.deliver(Buffer.from("k"));

    const first = await windows.receive(id, 0);
    const again = await windows.receive(id, 0);
    const rest = await windows.receive(id, first.pieces.length);

    expect(first).toEqual({
      from: 0,
      pieces: [
        { data: base64("abcd"), more: true },
        { data: base64("efgh"), more: true },
      ],
      closed: false,
    });
    expect(again).toEqual(first);
    expect(rest.pieces).toEqual([{ data: base64("ij") }, { data: base64("k") }]);
    expect(String(joined([...first.pieces, ...rest.pieces]))).toBe("abcdefghijk");
    await expect(windows.receive(id, 0)).rejects.toThrow("took already");
  });

  it("waits for a message, and ends the wait when it comes, when the wait runs out, or when a later receive starts", async () => {
    const windows = relay();
    const id = await windows.open();

    const waiting = windows.receive(id, 0);
    sockets[0]?.deliver(Buffer.from("hi"));
    await expect(waiting).resolves.toEqual({ from: 0, pieces: [{ data: base64("hi") }], closed: false });

    const timed = windows.receive(id, 1);
    clock.advance(20_000);
    await expect(timed).resolves.toEqual({ from: 1, pieces: [], closed: false });

    const older = windows.receive(id, 1);
    const newer = windows.receive(id, 1);
    await expect(older).resolves.toEqual({ from: 1, pieces: [], closed: false });
    sockets[0]?.deliver(Buffer.from("later"));
    await expect(newer).resolves.toMatchObject({ pieces: [{ data: base64("later") }] });
  });

  it("ends a wait when the call's signal aborts", async () => {
    const windows = relay();
    const id = await windows.open();
    const abort = new AbortController();

    const waiting = windows.receive(id, 0, abort.signal);
    abort.abort();

    await expect(waiting).resolves.toEqual({ from: 0, pieces: [], closed: false });
  });

  it("says the channel closed once the view took the core's last messages, then forgets it", async () => {
    const windows = relay();
    const id = await windows.open();
    sockets[0]?.deliver(Buffer.from("bye"));
    sockets[0]?.end();

    await expect(windows.receive(id, 0)).resolves.toEqual({ from: 0, pieces: [{ data: base64("bye") }], closed: true });
    await expect(windows.receive(id, 1)).resolves.toEqual({ from: 1, pieces: [], closed: true });
    expect(() => windows.send(id, 0, [])).toThrow("closed");
  });

  it("closes a channel the view stopped calling, but never while a receive waits", async () => {
    const windows = relay();
    const id = await windows.open();

    const waiting = windows.receive(id, 0);
    clock.advance(19_000);
    expect(sockets[0]?.closed).toBe(false);
    clock.advance(1000);
    await waiting;
    clock.advance(59_000);
    expect(sockets[0]?.closed).toBe(false);
    clock.advance(1000);

    expect(sockets[0]?.closed).toBe(true);
    expect(() => windows.send(id, 0, [])).toThrow("closed");
  });

  it("sweeps away the channels of views that do not call again once their waits end", async () => {
    const windows = relay();
    const live = await windows.open();
    const gone = await windows.open();
    const quiet = await windows.open();
    const liveWait = windows.receive(live, 0);
    const goneWait = windows.receive(gone, 0);

    let swept = false;
    const sweeping = windows.sweep().then(() => {
      swept = true;
    });
    await expect(liveWait).resolves.toEqual({ from: 0, pieces: [], closed: false });
    await expect(goneWait).resolves.toEqual({ from: 0, pieces: [], closed: false });
    const again = windows.receive(live, 0);
    clock.advance(2999);
    await Promise.resolve();
    expect(swept).toBe(false);
    clock.advance(1);
    await sweeping;

    expect(sockets.map((socket) => socket.closed)).toEqual([false, true, true]);
    expect(() => windows.send(gone, 0, [])).toThrow("closed");
    expect(() => windows.send(quiet, 0, [])).toThrow("closed");
    sockets[0]?.deliver(Buffer.from("still here"));
    await expect(again).resolves.toMatchObject({ pieces: [{ data: base64("still here") }] });
  });

  it("keeps a few channels open at once", async () => {
    const windows = relay({ maxChannels: 2 });
    const one = await windows.open();
    await windows.open();

    await expect(windows.open()).rejects.toThrow("at most 2 views");
    expect(sockets).toHaveLength(2);
    windows.close(one);
    await expect(windows.open()).resolves.toEqual(expect.any(String));
  });

  it("closes its channels when the view closes one or the app goes away", async () => {
    const windows = relay();
    const one = await windows.open();
    await windows.open();

    windows.close(one);
    expect(sockets.map((socket) => socket.closed)).toEqual([true, false]);
    windows.dispose();
    expect(sockets.map((socket) => socket.closed)).toEqual([true, true]);
  });
});
