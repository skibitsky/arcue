import type { FrameCodec } from "./framed";

const TAG = "$arcueTypedArray";

export const typedArrays = {
  Int8Array,
  Uint8Array,
  Uint8ClampedArray,
  Int16Array,
  Uint16Array,
  Int32Array,
  Uint32Array,
  Float32Array,
  Float64Array,
  BigInt64Array,
  BigUint64Array,
} as const;

export type TypedArrayName = keyof typeof typedArrays;

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const LOOKUP = new Map([...ALPHABET].map((char, index) => [char, index]));

function toBase64(bytes: Uint8Array): string {
  let text = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index] ?? 0;
    const b = bytes[index + 1];
    const c = bytes[index + 2];
    const triple = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);
    text += ALPHABET[(triple >> 18) & 63];
    text += ALPHABET[(triple >> 12) & 63];
    text += b === undefined ? "=" : ALPHABET[(triple >> 6) & 63];
    text += c === undefined ? "=" : ALPHABET[triple & 63];
  }
  return text;
}

function fromBase64(text: string): Uint8Array {
  if (text.length % 4 !== 0) throw new Error("Invalid base64 length.");
  const padding = text.endsWith("==") ? 2 : text.endsWith("=") ? 1 : 0;
  const bytes = new Uint8Array((text.length / 4) * 3 - padding);
  let offset = 0;
  for (let index = 0; index < text.length; index += 4) {
    let triple = 0;
    for (let part = 0; part < 4; part++) {
      const char = text[index + part] ?? "=";
      const value = char === "=" ? 0 : LOOKUP.get(char);
      if (value === undefined) throw new Error("Invalid base64 character.");
      triple = (triple << 6) | value;
    }
    for (let shift = 16; shift >= 0 && offset < bytes.length; shift -= 8) bytes[offset++] = (triple >> shift) & 255;
  }
  return bytes;
}

export function typedArrayName(value: object): TypedArrayName | null {
  if (!ArrayBuffer.isView(value) || value instanceof DataView) return null;
  const name = value.constructor.name;
  return Object.hasOwn(typedArrays, name) ? (name as TypedArrayName) : null;
}

function replacer(this: unknown, _key: string, value: unknown): unknown {
  if (typeof value !== "object" || value === null) return value;
  const name = typedArrayName(value);
  if (!name) return value;
  const view = value as ArrayBufferView;
  return { [TAG]: name, base64: toBase64(new Uint8Array(view.buffer, view.byteOffset, view.byteLength)) };
}

function reviver(_key: string, value: unknown): unknown {
  if (typeof value !== "object" || value === null || !(TAG in value)) return value;
  const { [TAG]: name, base64 } = value as Record<string, unknown>;
  if (typeof name !== "string" || !Object.hasOwn(typedArrays, name) || typeof base64 !== "string") {
    throw new Error("Invalid typed array in a message.");
  }
  const bytes = fromBase64(base64);
  const Constructor = typedArrays[name as TypedArrayName];
  if (bytes.byteLength % Constructor.BYTES_PER_ELEMENT !== 0) throw new Error("Invalid typed array length.");
  const create = Constructor as unknown as new (buffer: ArrayBuffer) => ArrayBufferView;
  return new create(bytes.buffer as ArrayBuffer);
}

/**
 * JSON with typed arrays carried as tagged base64, so both ends of a socket can run different JavaScript engines,
 * as the command line on the user's Node does with the core in Electron. Node's v8 serialization cannot do that: an
 * older V8 refuses data that a newer one wrote.
 */
export const jsonFrameCodec: FrameCodec = {
  encode: (value) => new TextEncoder().encode(JSON.stringify(value, replacer)),
  decode: (bytes) => JSON.parse(new TextDecoder().decode(bytes), reviver),
};
