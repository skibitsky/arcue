import type { ChannelPiece, WindowChannelInput, WindowChannelOutput } from "@arcue/protocol";
import { MAX_CHANNEL_PIECES, MAX_PIECE_BYTES, MAX_SEND_BYTES } from "@arcue/protocol";

/** One `window_channel` call. It rejects with a `ChannelClosed` when the server answers that the channel is gone. */
export type ChannelCall = (input: WindowChannelInput) => Promise<WindowChannelOutput>;

/** The server answered that the channel is gone, so calling again cannot help. */
export class ChannelClosed extends Error {}

export interface ToolSocketOptions {
  call: ChannelCall;
  /** The model the view shows, which `open` names so the server can say whether a later view took over. */
  shown?: { path: string; shownAt: number };
  /** Waits between calls that failed for a reason other than a closed channel. */
  setTimer?: (delayMs: number, callback: () => void) => () => void;
}

/** How often a call is tried again after a failure that may pass, such as a timeout. */
const RETRIES = 3;
const RETRY_MS = 500;
const CLOSED_ABNORMALLY = 1006;

const defaultTimer = (delayMs: number, callback: () => void) => {
  const handle = setTimeout(callback, delayMs);
  return () => clearTimeout(handle);
};

/**
 * A socket to the core that the view of an app that shows MCP Apps opens through `window_channel`, since its frame
 * cannot reach Arcue in the browser itself. It acts as the WebSocket of the served page: it opens, carries one message
 * per frame, and closes once, with a close event.
 *
 * One receive waits on the server at a time, and sends go one call at a time in order. A call that fails for a reason
 * that may pass is made again with the same numbers, which the server takes only once.
 */
export class ToolSocket extends EventTarget {
  binaryType: BinaryType = "arraybuffer";
  readyState: WebSocket["readyState"] = WebSocket.CONNECTING;
  /** Whether no later `open_model` showed the view's model, as `open` answered; null until it answers. */
  latest: boolean | null = null;
  readonly #options: ToolSocketOptions;
  readonly #setTimer: NonNullable<ToolSocketOptions["setTimer"]>;
  #channel: string | null = null;
  /** The pieces to send that the server has not taken, from number `#outBase` on. */
  #out: ChannelPiece[] = [];
  #outBase = 0;
  #sending = false;
  #from = 0;
  #partial: Uint8Array[] = [];

  constructor(options: ToolSocketOptions) {
    super();
    this.#options = options;
    this.#setTimer = options.setTimer ?? defaultTimer;
    void this.#open();
  }

  send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
    if (this.readyState !== WebSocket.OPEN) return;
    if (!(data instanceof Uint8Array)) throw new TypeError("The view sends bytes only.");
    this.#out.push(...split(data));
    void this.#pump();
  }

  close(): void {
    if (this.readyState === WebSocket.CLOSING || this.readyState === WebSocket.CLOSED) return;
    const channel = this.#channel;
    this.#finish(1000);
    if (channel !== null) this.#options.call({ op: "close", channel }).catch(() => undefined);
  }

  async #open(): Promise<void> {
    const { shown } = this.#options;
    let output: WindowChannelOutput;
    try {
      output = await this.#options.call({ op: "open", ...(shown ? { path: shown.path, shownAt: shown.shownAt } : {}) });
    } catch {
      this.#finish(CLOSED_ABNORMALLY);
      return;
    }
    if (output.channel === undefined) {
      this.#finish(CLOSED_ABNORMALLY);
      return;
    }
    if (this.readyState !== WebSocket.CONNECTING) {
      this.#options.call({ op: "close", channel: output.channel }).catch(() => undefined);
      return;
    }
    this.#channel = output.channel;
    this.latest = output.latest ?? true;
    this.readyState = WebSocket.OPEN;
    this.dispatchEvent(new Event("open"));
    void this.#receiveAll(output.channel);
  }

  /** Receives until the socket closes. Each receive goes out before the page handles the pieces of the last. */
  async #receiveAll(channel: string): Promise<void> {
    let next = this.#receive(channel);
    while (this.readyState === WebSocket.OPEN) {
      const output = await next;
      if (output === null || this.readyState !== WebSocket.OPEN) return;
      const pieces = output.from === this.#from ? (output.pieces ?? []) : [];
      this.#from += pieces.length;
      if (!output.closed) next = this.#receive(channel);
      for (const piece of pieces) {
        this.#partial.push(fromBase64(piece.data));
        if (piece.more) continue;
        const message = joined(this.#partial.splice(0));
        this.dispatchEvent(new MessageEvent("message", { data: message.buffer }));
        if (this.readyState !== WebSocket.OPEN) return;
      }
      if (output.closed) this.#finish(CLOSED_ABNORMALLY);
    }
  }

  #receive(channel: string): Promise<WindowChannelOutput | null> {
    const from = this.#from;
    return this.#retried(() => this.#options.call({ op: "receive", channel, from }));
  }

  async #pump(): Promise<void> {
    const channel = this.#channel;
    if (this.#sending || channel === null) return;
    this.#sending = true;
    try {
      while (this.#out.length > 0 && this.readyState === WebSocket.OPEN) {
        const pieces = batch(this.#out);
        const seq = this.#outBase;
        const output = await this.#retried(() => this.#options.call({ op: "send", channel, seq, pieces }));
        if (output === null) return;
        const taken = Math.min(Math.max(0, (output.next ?? seq) - this.#outBase), this.#out.length);
        this.#out.splice(0, taken);
        this.#outBase += taken;
        if (taken === 0) {
          this.#finish(CLOSED_ABNORMALLY);
          return;
        }
      }
    } finally {
      this.#sending = false;
    }
  }

  /** Makes the call, and again after a failure that may pass; null once the socket closed. */
  async #retried(call: () => Promise<WindowChannelOutput>): Promise<WindowChannelOutput | null> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await call();
      } catch (error) {
        if (this.readyState !== WebSocket.OPEN) return null;
        if (error instanceof ChannelClosed || attempt >= RETRIES) {
          this.#finish(CLOSED_ABNORMALLY);
          return null;
        }
        await new Promise<void>((resolve) => this.#setTimer(RETRY_MS * (attempt + 1), resolve));
        if (this.readyState !== WebSocket.OPEN) return null;
      }
    }
  }

  #finish(code: number): void {
    if (this.readyState === WebSocket.CLOSED) return;
    this.readyState = WebSocket.CLOSED;
    this.#out = [];
    this.#partial = [];
    this.dispatchEvent(Object.assign(new Event("close"), { code, wasClean: code === 1000 }));
  }
}

function split(bytes: Uint8Array): ChannelPiece[] {
  if (bytes.byteLength <= MAX_PIECE_BYTES) return [{ data: toBase64(bytes) }];
  const pieces: ChannelPiece[] = [];
  for (let at = 0; at < bytes.byteLength; at += MAX_PIECE_BYTES) {
    const end = Math.min(at + MAX_PIECE_BYTES, bytes.byteLength);
    const data = toBase64(bytes.subarray(at, end));
    pieces.push(end < bytes.byteLength ? { data, more: true } : { data });
  }
  return pieces;
}

/** The first pieces that fit in one send. */
function batch(pieces: readonly ChannelPiece[]): ChannelPiece[] {
  const limit = (MAX_SEND_BYTES / 3) * 4;
  let length = 0;
  let count = 0;
  for (const piece of pieces) {
    if (count === MAX_CHANNEL_PIECES || (count > 0 && length + piece.data.length > limit)) break;
    length += piece.data.length;
    count++;
  }
  return pieces.slice(0, count);
}

function joined(parts: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
  const size = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const whole = new Uint8Array(size);
  let at = 0;
  for (const part of parts) {
    whole.set(part, at);
    at += part.byteLength;
  }
  return whole;
}

const BASE64_CHUNK = 0x8000;

export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let at = 0; at < bytes.byteLength; at += BASE64_CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(at, at + BASE64_CHUNK));
  }
  return btoa(binary);
}

export function fromBase64(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let at = 0; at < binary.length; at++) bytes[at] = binary.charCodeAt(at);
  return bytes;
}
