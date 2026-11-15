import { randomBytes } from "node:crypto";
import type { ChannelPiece, SetTimer } from "@arcue/protocol";
import {
  ArcueError,
  bridgeAuthorization,
  MAX_FRAME_BYTES,
  MAX_PIECE_BYTES,
  SERVE_CORE_PATH,
  VIEW_PARAMETER,
} from "@arcue/protocol";
import { WebSocket } from "ws";

/** The pieces for the view from `from` on, and whether the channel closed after them. */
export interface Received {
  from: number;
  pieces: ChannelPiece[];
  closed: boolean;
}

/** A socket to the core as a window, which carries one message per frame. */
export interface RelaySocket {
  send(bytes: Uint8Array): void;
  onMessage(listener: (bytes: Uint8Array) => void): void;
  /** Calls the listener once when the socket closes, for whatever reason. */
  onClose(listener: () => void): void;
  close(): void;
}

export interface WindowRelayOptions {
  /** Opens a socket to the core as a page of the server's view. */
  connect(): Promise<RelaySocket>;
  setTimer: SetTimer;
  /** How long a receive waits for a message before it returns none. Defaults to 20 seconds. */
  waitMs?: number;
  /** How long a channel stays open with no call. Defaults to 15 seconds. */
  idleMs?: number;
  /** How long `sweep` waits for a view to call again. Defaults to 3 seconds. */
  sweepMs?: number;
  /** The most channels open at once. Defaults to 16. */
  maxChannels?: number;
  /** The most bytes one piece holds, at most `MAX_PIECE_BYTES`. */
  pieceBytes?: number;
  /** The most bytes of pieces one receive returns, unless its first piece alone is larger. */
  receiveBytes?: number;
}

const RECEIVE_BYTES = 2 * MAX_PIECE_BYTES;
const WAIT_MS = 20_000;
const IDLE_MS = 15_000;
const SWEEP_MS = 3000;
const MAX_CHANNELS = 16;
/** The largest message a view sends, such as a comment with its screenshot. */
const MAX_VIEW_MESSAGE_BYTES = 64 * 1024 * 1024;

/** A piece of a message for the view, kept as bytes until a receive takes it. */
interface OutPiece {
  bytes: Buffer;
  more: boolean;
}

interface Channel {
  socket: RelaySocket;
  /** The pieces for the view that it has not taken yet, from `base` on. */
  out: OutPiece[];
  base: number;
  /** The number of the next piece the view sends. */
  next: number;
  /** The view's message that its pieces so far make up. */
  partial: Buffer[];
  partialBytes: number;
  closed: boolean;
  /** Ends the receive that waits, if one does. */
  wake: (() => void) | null;
  calls: number;
  /** What waits for the view's next call. */
  onCall: Set<() => void>;
  cancelIdle: () => void;
}

/**
 * The channels of the windows in the views an app shows. A view cannot reach Arcue in the browser itself, so it calls a
 * tool for each piece of work, and the relay holds a socket to the core for it.
 *
 * The view numbers the pieces it sends, and names the first piece it has not taken when it receives, so a call that it
 * makes again after losing the answer neither repeats nor loses one.
 */
export class WindowRelay {
  readonly #channels = new Map<string, Channel>();
  readonly #options: WindowRelayOptions;
  readonly #pieceBytes: number;

  constructor(options: WindowRelayOptions) {
    this.#options = options;
    this.#pieceBytes = Math.min(options.pieceBytes ?? MAX_PIECE_BYTES, MAX_PIECE_BYTES);
  }

  async open(): Promise<string> {
    const limit = this.#options.maxChannels ?? MAX_CHANNELS;
    if (this.#channels.size >= limit) {
      throw new ArcueError("unavailable", `Arcue shows at most ${limit} views at once. Close one, or reload the app.`);
    }
    const socket = await this.#options.connect();
    const id = randomBytes(16).toString("base64url");
    const channel: Channel = {
      socket,
      out: [],
      base: 0,
      next: 0,
      partial: [],
      partialBytes: 0,
      closed: false,
      wake: null,
      calls: 0,
      onCall: new Set(),
      cancelIdle: () => undefined,
    };
    this.#channels.set(id, channel);
    socket.onMessage((bytes) => {
      if (channel.closed) return;
      channel.out.push(...this.#split(bytes));
      channel.wake?.();
    });
    socket.onClose(() => {
      channel.closed = true;
      channel.partial = [];
      channel.wake?.();
      if (channel.calls === 0 && channel.out.length === 0) this.#drop(id);
    });
    this.#armIdle(id, channel);
    return id;
  }

  /** Takes the view's pieces from number `seq` on, skipping those it sent before, and returns the next number. */
  send(id: string, seq: number, pieces: readonly ChannelPiece[]): number {
    return this.#during(id, (channel) => {
      if (seq > channel.next) throw new ArcueError("invalid-input", "A piece before these did not arrive.");
      for (const piece of pieces.slice(channel.next - seq)) {
        const bytes = Buffer.from(piece.data, "base64");
        channel.partial.push(bytes);
        channel.partialBytes += bytes.byteLength;
        if (channel.partialBytes > MAX_VIEW_MESSAGE_BYTES) {
          this.close(id);
          throw new ArcueError("invalid-input", "A message is too large.");
        }
        if (piece.more) continue;
        const message = Buffer.concat(channel.partial);
        channel.partial = [];
        channel.partialBytes = 0;
        if (!channel.closed) channel.socket.send(message);
      }
      channel.next = Math.max(channel.next, seq + pieces.length);
      return channel.next;
    });
  }

  /**
   * Returns the pieces for the view from number `from` on, which drops the ones before it, once there are any, the
   * channel closes, the wait ends, a later receive starts or the signal aborts.
   */
  async receive(id: string, from: number, signal?: AbortSignal): Promise<Received> {
    return this.#during(id, async (channel) => {
      if (from < channel.base || from > channel.base + channel.out.length) {
        throw new ArcueError("invalid-input", "The view asked for pieces it took already or that never came.");
      }
      channel.out.splice(0, from - channel.base);
      channel.base = from;
      channel.wake?.();
      if (channel.out.length === 0 && !channel.closed) await this.#wait(channel, signal);
      if (channel.base !== from) return { from, pieces: [], closed: false };
      const limit = this.#options.receiveBytes ?? RECEIVE_BYTES;
      const pieces: ChannelPiece[] = [];
      let bytes = 0;
      for (const piece of channel.out) {
        const size = piece.bytes.byteLength;
        if (pieces.length > 0 && bytes + size > limit) break;
        const data = piece.bytes.toString("base64");
        pieces.push(piece.more ? { data, more: true } : { data });
        bytes += size;
      }
      const closed = channel.closed && pieces.length === channel.out.length;
      return { from, pieces, closed };
    });
  }

  close(id: string): void {
    const channel = this.#channels.get(id);
    if (!channel) return;
    this.#drop(id);
    channel.closed = true;
    channel.wake?.();
    channel.socket.close();
  }

  /**
   * Closes the channels of views that are gone, which hold windows that never answer: it ends each receive that waits,
   * and closes each channel whose view does not call again within `sweepMs`. Resolves once their sockets closed.
   */
  async sweep(): Promise<void> {
    await Promise.all([...this.#channels].map(([id, channel]) => this.#check(id, channel)));
  }

  /** Closes every channel, as when the app's connection ends. */
  dispose(): void {
    for (const id of [...this.#channels.keys()]) this.close(id);
  }

  #channel(id: string): Channel {
    const channel = this.#channels.get(id);
    if (!channel) throw new ArcueError("not-found", "This window's channel is closed.");
    return channel;
  }

  /** Runs one call on the channel, which stays open while a call runs and for `idleMs` after the last. */
  #during<Value>(id: string, work: (channel: Channel) => Value): Value {
    const channel = this.#channel(id);
    channel.calls++;
    channel.cancelIdle();
    for (const listener of [...channel.onCall]) listener();
    const done = () => {
      channel.calls--;
      if (channel.calls > 0 || this.#channels.get(id) !== channel) return;
      if (channel.closed && channel.out.length === 0) this.#drop(id);
      else this.#armIdle(id, channel);
    };
    let value: Value;
    try {
      value = work(channel);
    } catch (error) {
      done();
      throw error;
    }
    if (value instanceof Promise) value.finally(done).catch(() => undefined);
    else done();
    return value;
  }

  #check(id: string, channel: Channel): Promise<void> {
    return new Promise<void>((resolve) => {
      const called = () => {
        cancel();
        channel.onCall.delete(called);
        resolve();
      };
      channel.onCall.add(called);
      const cancel = this.#options.setTimer(this.#options.sweepMs ?? SWEEP_MS, () => {
        channel.onCall.delete(called);
        const open = this.#channels.get(id) === channel && !channel.closed;
        if (open) channel.socket.onClose(resolve);
        this.close(id);
        if (!open) resolve();
      });
      channel.wake?.();
    });
  }

  #armIdle(id: string, channel: Channel): void {
    channel.cancelIdle();
    channel.cancelIdle = this.#options.setTimer(this.#options.idleMs ?? IDLE_MS, () => {
      if (channel.calls === 0) this.close(id);
    });
  }

  #drop(id: string): void {
    const channel = this.#channels.get(id);
    if (!channel) return;
    channel.cancelIdle();
    this.#channels.delete(id);
  }

  #wait(channel: Channel, signal: AbortSignal | undefined): Promise<void> {
    return new Promise<void>((resolve) => {
      const cancel = this.#options.setTimer(this.#options.waitMs ?? WAIT_MS, () => wake());
      const wake = () => {
        cancel();
        signal?.removeEventListener("abort", wake);
        if (channel.wake === wake) channel.wake = null;
        resolve();
      };
      channel.wake = wake;
      signal?.addEventListener("abort", wake, { once: true });
      if (signal?.aborted) wake();
    });
  }

  #split(bytes: Uint8Array): OutPiece[] {
    const size = this.#pieceBytes;
    const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const pieces: OutPiece[] = [];
    for (let at = 0; at === 0 || at < buffer.byteLength; at += size) {
      const end = Math.min(at + size, buffer.byteLength);
      pieces.push({ bytes: buffer.subarray(at, end), more: end < buffer.byteLength });
    }
    return pieces;
  }
}

const HANDSHAKE_MS = 10_000;

/**
 * Connects to Arcue in the browser at `url` as a page of the view, with the token from its `serve.json` in place of
 * a page's origin.
 */
export function openWindowSocket(url: string, token: string, view: string): Promise<RelaySocket> {
  const address = new URL(SERVE_CORE_PATH, url);
  address.protocol = address.protocol === "https:" ? "wss:" : "ws:";
  address.searchParams.set(VIEW_PARAMETER, view);
  const socket = new WebSocket(address, {
    headers: { authorization: bridgeAuthorization(token) },
    handshakeTimeout: HANDSHAKE_MS,
    maxPayload: MAX_FRAME_BYTES,
    perMessageDeflate: false,
  });
  return new Promise((resolve, reject) => {
    socket.once("error", reject);
    socket.once("open", () => {
      socket.off("error", reject);
      socket.on("error", () => socket.terminate());
      resolve({
        send: (bytes) => socket.send(bytes),
        onMessage(listener) {
          socket.on("message", (data, binary) => {
            if (binary && data instanceof Buffer) listener(data);
            else socket.terminate();
          });
        },
        onClose(listener) {
          socket.once("close", () => listener());
        },
        close: () => socket.close(),
      });
    });
  });
}
