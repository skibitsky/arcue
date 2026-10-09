import { ArcueError } from "../errors";
import type { MessageEndpoint } from "./endpoint";

/** Bytes in both directions, such as a Node socket or a Windows named pipe. */
export interface ByteStream {
  write(bytes: Uint8Array): void;
  onData(listener: (bytes: Uint8Array) => void): () => void;
  /** Calls the listener once when the stream ends, fails or is closed. */
  onClose(listener: () => void): () => void;
  close(): void;
}

/** Turns one message into bytes and back, such as Node's v8 serialization, which keeps typed arrays. */
export interface FrameCodec {
  encode(value: unknown): Uint8Array;
  decode(bytes: Uint8Array): unknown;
}

/** The largest frame either side accepts. A scene of a large asset fits comfortably. */
export const MAX_FRAME_BYTES = 1024 * 1024 * 1024;

const HEADER_BYTES = 4;

/** A frame is a 4-byte big-endian length followed by that many bytes. */
export function encodeFrame(payload: Uint8Array): Uint8Array {
  if (payload.byteLength > MAX_FRAME_BYTES) {
    throw new ArcueError("invalid-input", `A message of ${payload.byteLength} bytes is too large to send.`);
  }
  const frame = new Uint8Array(HEADER_BYTES + payload.byteLength);
  new DataView(frame.buffer).setUint32(0, payload.byteLength);
  frame.set(payload, HEADER_BYTES);
  return frame;
}

export interface FrameLimits {
  /** The largest first frame, for a handshake that must stay small before the other side is trusted. */
  firstFrameMaxBytes?: number;
}

/** Collects stream chunks and returns the frames they complete. */
export class FrameReader {
  #chunks: Uint8Array[] = [];
  #buffered = 0;
  #limit: number;

  constructor(limits: FrameLimits = {}) {
    this.#limit = Math.min(limits.firstFrameMaxBytes ?? MAX_FRAME_BYTES, MAX_FRAME_BYTES);
  }

  /** Throws an `ArcueError` when a frame announces more than its limit; the stream is then unusable. */
  push(chunk: Uint8Array): Uint8Array[] {
    this.#chunks.push(chunk);
    this.#buffered += chunk.byteLength;
    const frames: Uint8Array[] = [];
    for (;;) {
      if (this.#buffered < HEADER_BYTES) return frames;
      const length = new DataView(this.#peek(HEADER_BYTES).buffer).getUint32(0);
      if (length > this.#limit) throw new ArcueError("invalid-input", `A frame of ${length} bytes is too large.`);
      if (this.#buffered < HEADER_BYTES + length) return frames;
      this.#take(HEADER_BYTES);
      frames.push(this.#take(length));
      this.#limit = MAX_FRAME_BYTES;
    }
  }

  #peek(count: number): Uint8Array {
    const first = this.#chunks[0];
    if (first && first.byteLength >= count) return first.slice(0, count);
    return this.#joined().slice(0, count);
  }

  #take(count: number): Uint8Array {
    const joined = this.#joined();
    const taken = joined.slice(0, count);
    const rest = joined.subarray(count);
    this.#chunks = rest.byteLength > 0 ? [rest] : [];
    this.#buffered = rest.byteLength;
    return taken;
  }

  #joined(): Uint8Array {
    if (this.#chunks.length === 1 && this.#chunks[0]) return this.#chunks[0];
    const joined = new Uint8Array(this.#buffered);
    let offset = 0;
    for (const chunk of this.#chunks) {
      joined.set(chunk, offset);
      offset += chunk.byteLength;
    }
    this.#chunks = [joined];
    return joined;
  }
}

/** Messages framed over a byte stream. Messages that arrive before anyone listens wait in order for the first listener. */
export interface FramedChannel {
  send(value: unknown): void;
  /** Takes the next message that no listener received; rejects as "disconnected" when the channel closes first. */
  receive(): Promise<unknown>;
  listen(listener: (value: unknown) => void): () => void;
  onClose(listener: () => void): () => void;
  close(): void;
}

export function framedChannel(stream: ByteStream, codec: FrameCodec, limits: FrameLimits = {}): FramedChannel {
  const reader = new FrameReader(limits);
  const listeners = new Set<(value: unknown) => void>();
  const waiting: unknown[] = [];
  const receivers: { resolve(value: unknown): void; reject(error: unknown): void }[] = [];
  let closed = false;
  const closeListeners = new Set<() => void>();

  const close = () => {
    if (closed) return;
    closed = true;
    stopData();
    stopClose();
    stream.close();
    const error = new ArcueError("disconnected", "The connection closed.");
    for (const receiver of receivers.splice(0)) receiver.reject(error);
    for (const listener of [...closeListeners]) listener();
    closeListeners.clear();
    listeners.clear();
  };

  const stopData = stream.onData((chunk) => {
    if (closed) return;
    let frames: Uint8Array[];
    try {
      frames = reader.push(chunk);
    } catch {
      close();
      return;
    }
    for (const frame of frames) {
      let value: unknown;
      try {
        value = codec.decode(frame);
      } catch {
        close();
        return;
      }
      const receiver = listeners.size === 0 ? receivers.shift() : undefined;
      if (receiver) receiver.resolve(value);
      else if (listeners.size === 0) waiting.push(value);
      else for (const listener of [...listeners]) listener(value);
    }
  });
  const stopClose = stream.onClose(close);

  return {
    send(value) {
      if (!closed) stream.write(encodeFrame(codec.encode(value)));
    },
    receive() {
      if (waiting.length > 0) return Promise.resolve(waiting.shift());
      if (closed) return Promise.reject(new ArcueError("disconnected", "The connection is closed."));
      return new Promise((resolve, reject) => receivers.push({ resolve, reject }));
    },
    listen(listener) {
      listeners.add(listener);
      for (const value of waiting.splice(0)) listener(value);
      return () => {
        listeners.delete(listener);
      };
    },
    onClose(listener) {
      if (closed) {
        listener();
        return () => undefined;
      }
      closeListeners.add(listener);
      return () => {
        closeListeners.delete(listener);
      };
    },
    close,
  };
}

/** An endpoint over a framed channel. Buffers are copied, since a stream cannot transfer them. */
export function framedEndpoint(channel: FramedChannel): MessageEndpoint {
  return {
    post: (message) => channel.send(message),
    listen: (listener) => channel.listen(listener),
    onClose: (listener) => channel.onClose(listener),
  };
}
