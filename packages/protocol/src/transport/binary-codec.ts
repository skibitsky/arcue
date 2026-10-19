import { ArcueError } from "../errors";
import type { FrameCodec } from "./framed";
import { MAX_FRAME_BYTES } from "./framed";
import type { TypedArrayName } from "./json-codec";
import { typedArrayName, typedArrays } from "./json-codec";

const TAG = "$arcueTypedArray";
const LENGTH_BYTES = 4;
const DATA_ALIGNMENT = 8;
const LITTLE_ENDIAN = new Uint8Array(Uint16Array.of(1).buffer)[0] === 1;

type TypedArray = InstanceType<(typeof typedArrays)[TypedArrayName]>;
type ViewConstructor = new (buffer: ArrayBufferLike, byteOffset: number, length: number) => TypedArray;

interface Reference {
  [TAG]: TypedArrayName;
  offset: number;
  length: number;
}

const align = (offset: number, alignment: number) => Math.ceil(offset / alignment) * alignment;
const invalid = (reason: string) => new ArcueError("invalid-input", `A malformed frame arrived: ${reason}.`);

function encode(value: unknown): Uint8Array {
  if (!LITTLE_ENDIAN) throw new ArcueError("internal", "Binary frames need a little-endian computer.");
  const references = new Map<TypedArray, Reference>();
  let dataBytes = 0;
  const json = JSON.stringify(value, (_key, item: unknown) => {
    if (typeof item !== "object" || item === null) return item;
    const type = typedArrayName(item);
    if (!type) return item;
    const array = item as TypedArray;
    let reference = references.get(array);
    if (!reference) {
      const offset = align(dataBytes, array.BYTES_PER_ELEMENT);
      reference = { [TAG]: type, offset, length: array.length };
      references.set(array, reference);
      dataBytes = offset + array.byteLength;
    }
    return reference;
  });
  const header = new TextEncoder().encode(json ?? "null");
  const dataStart = align(LENGTH_BYTES + header.byteLength, DATA_ALIGNMENT);
  const total = dataStart + dataBytes;
  if (total > MAX_FRAME_BYTES)
    throw new ArcueError("invalid-input", `A message of ${total} bytes is too large to send.`);
  const frame = new Uint8Array(total);
  new DataView(frame.buffer).setUint32(0, header.byteLength, true);
  frame.set(header, LENGTH_BYTES);
  for (const [array, { offset }] of references) {
    frame.set(new Uint8Array(array.buffer, array.byteOffset, array.byteLength), dataStart + offset);
  }
  return frame;
}

function decode(bytes: Uint8Array): unknown {
  if (!LITTLE_ENDIAN) throw new ArcueError("internal", "Binary frames need a little-endian computer.");
  if (bytes.byteLength < LENGTH_BYTES) throw invalid("it has no header");
  if (bytes.byteLength > MAX_FRAME_BYTES) throw invalid(`its ${bytes.byteLength} bytes are too many`);
  const headerLength = new DataView(bytes.buffer, bytes.byteOffset, LENGTH_BYTES).getUint32(0, true);
  const dataStart = align(LENGTH_BYTES + headerLength, DATA_ALIGNMENT);
  if (dataStart > bytes.byteLength) throw invalid("its header is longer than the frame");
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(LENGTH_BYTES, LENGTH_BYTES + headerLength));
  } catch {
    throw invalid("its header is not UTF-8");
  }
  const data = alignedData(bytes.subarray(dataStart));
  try {
    return JSON.parse(text, (_key, value: unknown) => revive(value, data));
  } catch (error) {
    if (error instanceof ArcueError) throw error;
    throw invalid("its header is not JSON");
  }
}

/** Views need their element size as alignment in the buffer; a frame that arrived at an odd place is copied once. */
function alignedData(data: Uint8Array): Uint8Array {
  return data.byteOffset % DATA_ALIGNMENT === 0 ? data : new Uint8Array(data);
}

function revive(value: unknown, data: Uint8Array): unknown {
  if (typeof value !== "object" || value === null || !Object.hasOwn(value, TAG)) return value;
  const { [TAG]: type, offset, length, ...rest } = value as Record<string, unknown>;
  if (typeof type !== "string" || !Object.hasOwn(typedArrays, type)) throw invalid("it names an unknown array type");
  if (Object.keys(rest).length > 0) throw invalid("an array reference has unknown fields");
  if (!isCount(offset) || !isCount(length)) throw invalid("an array has an invalid offset or length");
  const Constructor = typedArrays[type as TypedArrayName] as unknown as ViewConstructor & { BYTES_PER_ELEMENT: number };
  const size = Constructor.BYTES_PER_ELEMENT;
  if (offset % size !== 0) throw invalid("an array is misaligned");
  if (offset + length * size > data.byteLength) throw invalid("an array reaches past the frame");
  return new Constructor(data.buffer, data.byteOffset + offset, length);
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/**
 * A JSON header followed by the raw bytes of the message's typed arrays, each aligned for its element size. In the
 * header each typed array becomes `{ "$arcueTypedArray": type, offset, length }`, with the offset in bytes from the
 * start of the data and the length in elements. The first 4 bytes are the header's length, little-endian, and the data
 * starts at the next multiple of 8. Decoded arrays are views into the frame, so they share its buffer.
 *
 * Like `jsonFrameCodec`, it depends on no JavaScript engine, but it neither copies arrays into strings nor parses them
 * back, which matters for scenes of several megabytes. A typed array that occurs twice is written once.
 */
export const binaryFrameCodec: FrameCodec = { encode, decode };
