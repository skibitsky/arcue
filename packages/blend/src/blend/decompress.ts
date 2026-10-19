import { Decompress as ZstdStream, decompress as zstdDecompress } from "../../vendor/fzstd/index.js";
import { BlendParseError } from "./errors.js";
import { checkHeaderMagic, HEADER_MAGIC } from "./file.js";

const ZSTD_MAGIC = 0xfd2fb528;
const ZSTD_SKIPPABLE_MAGIC = 0x184d2a50;
const ZSTD_BLOCK_RLE = 1;
/** Blender refuses a frame whose window is larger, as the Zstandard library does by default. */
const ZSTD_MAX_WINDOW = 2 ** 27 + 1;
/** The blocks the header check decodes at most, for a header split over short or empty blocks and frames. */
const HEADER_BLOCKS = 8;
const GZIP_MAGIC = [0x1f, 0x8b];
/** Deflate codes at most 258 bytes in 2 bits, so data expands at most this many times. */
const DEFLATE_MAX_RATIO = 1032;

/**
 * The most a compressed file may expand to: as much memory as the FBX importer lets its parser use. Data that declares
 * more is refused before its bytes are allocated. Its ratio to the file's size is no guide: Multires data that was
 * never sculpted compresses over 600 times.
 */
export const MAX_EXPANDED_BYTES = 2 ** 30;
/** Compressed data goes to a decompressor in slices this large, as a browser expands each slice it is given at once. */
const COMPRESSED_SLICE = 16 * 1024;

interface ChunkReader {
  read(): Promise<{ done: boolean; value?: Uint8Array }>;
  cancel(): Promise<void>;
}

interface ChunkWriter {
  write(chunk: Uint8Array): Promise<void>;
  close(): Promise<void>;
}

interface Decompressor {
  readable: { getReader(): ChunkReader };
  writable: { getWriter(): ChunkWriter };
}

type DecompressorConstructor = new (format: "gzip" | "deflate") => Decompressor;

/** The runtime's decompressor for gzip files or zlib data, as a PNG stores its pixels, or null where it has none. */
export function decompressor(format: "gzip" | "deflate"): Decompressor | null {
  const Stream = (globalThis as { DecompressionStream?: DecompressorConstructor }).DecompressionStream;
  return Stream ? new Stream(format) : null;
}

/** Writes compressed data to a decompressor in slices, then closes it. */
export async function writeInSlices(writer: ChunkWriter, data: readonly Uint8Array[]): Promise<void> {
  for (const part of data) {
    for (let start = 0; start < part.byteLength; start += COMPRESSED_SLICE) {
      await writer.write(part.subarray(start, start + COMPRESSED_SLICE));
    }
  }
  await writer.close();
}

export function startsWith(bytes: Uint8Array, magic: readonly number[]): boolean {
  return magic.every((byte, index) => bytes[index] === byte);
}

function concat(chunks: readonly Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

function tooLarge(limit: number): BlendParseError {
  const size = limit % 2 ** 30 === 0 ? `${limit / 2 ** 30} GiB` : `${limit} bytes`;
  return new BlendParseError(`it expands to more than ${size}`);
}

function littleEndian(bytes: Uint8Array, start: number, length: number): number {
  let value = 0;
  for (let index = length - 1; index >= 0; index--) value = value * 256 + (bytes[start + index] ?? 0);
  return value;
}

/**
 * The buffer with room for `needed` bytes and its first `length` bytes kept: itself when it has the room, or else a new
 * one of the `expected` bytes where they are enough, or of twice its size, at most `limit` bytes.
 */
function withRoom(buffer: Uint8Array, length: number, needed: number, expected: number, limit: number): Uint8Array {
  if (needed <= buffer.byteLength) return buffer;
  const size = needed <= expected ? expected : Math.max(needed, buffer.byteLength * 2);
  const grown = new Uint8Array(Math.min(limit, size));
  grown.set(buffer.subarray(0, length));
  return grown;
}

interface ZstdFrame {
  start: number;
  end: number;
  /** The bytes the frame declares it expands to, or 0 when it does not declare them. */
  content: number;
  /** Its window, which for a single-segment frame is its content size. */
  window: number;
}

/**
 * Calls `visit` with each Zstandard frame of the data other than skippable ones, read from its frame and block headers
 * alone, and returns where the frames end: before a damaged frame header, or with the data when a frame is cut short.
 */
function forEachZstdFrame(bytes: Uint8Array, visit: (frame: ZstdFrame) => void): number {
  let offset = 0;
  while (offset + 8 <= bytes.byteLength) {
    const magic = littleEndian(bytes, offset, 4);
    if ((magic & 0xfffffff0) >>> 0 === ZSTD_SKIPPABLE_MAGIC) {
      offset += 8 + littleEndian(bytes, offset + 4, 4);
      continue;
    }
    if (magic !== ZSTD_MAGIC) break;
    const descriptor = bytes[offset + 4] ?? 0;
    const singleSegment = (descriptor & 0x20) !== 0;
    let position = offset + 5;
    let window = 0;
    if (!singleSegment) {
      const windowDescriptor = bytes[position] ?? 0;
      const base = 2 ** (10 + (windowDescriptor >> 3));
      window = base + (base / 8) * (windowDescriptor & 7);
      position += 1;
    }
    position += [0, 1, 2, 4][descriptor & 3] ?? 0;
    const contentBytes = [singleSegment ? 1 : 0, 2, 4, 8][descriptor >> 6] ?? 0;
    const content = littleEndian(bytes, position, contentBytes) + (contentBytes === 2 ? 256 : 0);
    position += contentBytes;
    let last = false;
    while (!last && position + 3 <= bytes.byteLength) {
      const header = littleEndian(bytes, position, 3);
      last = (header & 1) === 1;
      position += 3 + (((header >> 1) & 3) === ZSTD_BLOCK_RLE ? 1 : header >>> 3);
    }
    position += (descriptor & 0x04) !== 0 ? 4 : 0;
    const end = last ? Math.min(position, bytes.byteLength) : bytes.byteLength;
    visit({ start: offset, end, content, window: singleSegment ? content : window });
    offset = end;
  }
  return offset;
}

/**
 * Refuses Zstandard data that Blender does not read, or that takes more than `limit` bytes up front: the bytes its
 * frames declare, and the window the decompressor sets up for each frame that does not declare its size. Gives the
 * bytes the frames declare and where they end.
 */
function checkZstdFrames(bytes: Uint8Array, limit: number): { declared: number; end: number } {
  let declared = 0;
  let windows = 0;
  let window = 0;
  const end = forEachZstdFrame(bytes, (frame) => {
    declared += frame.content;
    if (frame.content === 0) windows += frame.window;
    window = Math.max(window, frame.window);
  });
  if (declared + windows > limit) throw tooLarge(limit);
  if (window > ZSTD_MAX_WINDOW) {
    throw new BlendParseError("its compressed data needs a window over 128 MiB, which Blender refuses too");
  }
  return { declared, end };
}

/**
 * Expands each frame: a frame that declares its size into a buffer of that size, and a frame that does not block by
 * block, refusing data that expands past `limit` bytes. The vendored decompressor refuses a block expanding past the
 * most its frame allows or coding more Huffman weights than a table holds, so that a block takes work in proportion to
 * its size, its output and the largest block a frame allows. A first part
 * that holds all the declared bytes becomes the result without a copy. Data after the frames is left to the
 * decompressor, which refuses it.
 */
function unzstd(bytes: Uint8Array, declared: number, end: number, limit: number): Uint8Array {
  let output: Uint8Array = new Uint8Array(0);
  let length = 0;
  let expanded = declared;
  const append = (part: Uint8Array) => {
    if (length === 0 && part.byteLength >= declared) {
      output = part;
      length = part.byteLength;
      return;
    }
    output = withRoom(output, length, length + part.byteLength, declared, limit);
    output.set(part, length);
    length += part.byteLength;
  };
  forEachZstdFrame(bytes, (frame) => {
    const data = bytes.subarray(frame.start, frame.end);
    if (frame.content > 0) {
      append(zstdDecompress(data));
      return;
    }
    new ZstdStream((block) => {
      expanded += block.byteLength;
      if (expanded > limit) throw tooLarge(limit);
      append(block);
    }).push(data, true);
  });
  if (end < bytes.byteLength) append(zstdDecompress(bytes.subarray(end)));
  return output.subarray(0, length);
}

/**
 * The size gzip data says it expands to, from the trailer of its last member, or 0 where that is past `limit` or more
 * than the data could expand to. The trailer holds the size modulo 4 GiB, and a file of several members holds only the
 * last one's.
 */
function gzipSize(bytes: Uint8Array, limit: number): number {
  const size = bytes.byteLength >= 4 ? littleEndian(bytes, bytes.byteLength - 4, 4) : 0;
  return size <= Math.min(limit, bytes.byteLength * DEFLATE_MAX_RATIO) ? size : 0;
}

/**
 * Expands gzip data into one buffer of the size it says it expands to, allocated once its first bytes are a Blender file
 * header, and grows the buffer for data that expands to more, refusing data that expands past `limit` bytes.
 */
async function gunzip(bytes: Uint8Array, limit: number): Promise<Uint8Array> {
  const stream = decompressor("gzip");
  if (!stream) throw new BlendParseError("this runtime cannot read gzip-compressed files");
  const written = writeInSlices(stream.writable.getWriter(), [bytes]);
  written.catch(() => undefined);
  const reader = stream.readable.getReader();
  const expected = gzipSize(bytes, limit);
  let output: Uint8Array = new Uint8Array(0);
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    try {
      if (length + value.byteLength > limit) throw tooLarge(limit);
      const checked = length >= HEADER_MAGIC.length;
      output = withRoom(output, length, length + value.byteLength, checked ? expected : 0, limit);
      output.set(value, length);
      length += value.byteLength;
      if (!checked && length >= HEADER_MAGIC.length) checkHeaderMagic(output.subarray(0, length));
    } catch (error) {
      await reader.cancel();
      throw error;
    }
  }
  await written;
  return output.subarray(0, length);
}

/**
 * The first bytes of Zstandard data, decoded until they hold a Blender file header's magic or `HEADER_BLOCKS` blocks
 * have been decoded, so that data that is not a Blender file is refused before the rest is expanded.
 */
function zstdStart(bytes: Uint8Array): Uint8Array {
  const blocks: Uint8Array[] = [];
  let length = 0;
  const stop = new Error("start decoded");
  try {
    new ZstdStream((block) => {
      blocks.push(block);
      length += block.byteLength;
      if (length >= HEADER_MAGIC.length || blocks.length >= HEADER_BLOCKS) throw stop;
    }).push(bytes, true);
  } catch (error) {
    if (error !== stop) throw error;
  }
  return concat(blocks);
}

/** An error's message, or its cause's when it has none, as with the empty TypeError a gzip stream throws. */
function reasonOf(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  return error.message || (error.cause === undefined ? "" : reasonOf(error.cause));
}

/**
 * The file's uncompressed bytes. Blender 3.0 and later compress with Zstandard when "Compress" is on, and earlier
 * versions with gzip; an uncompressed file comes back as it is. A compressed file that Blender would refuse, that
 * expands past `limit` bytes, or whose first bytes are not a Blender file header, is refused before the rest is
 * expanded.
 */
export async function decompressBlend(bytes: Uint8Array, limit = MAX_EXPANDED_BYTES): Promise<Uint8Array> {
  try {
    if (littleEndian(bytes, 0, 4) === ZSTD_MAGIC) {
      const { declared, end } = checkZstdFrames(bytes, limit);
      checkHeaderMagic(zstdStart(bytes));
      return unzstd(bytes, declared, end, limit);
    }
    if (startsWith(bytes, GZIP_MAGIC)) return await gunzip(bytes, limit);
  } catch (error) {
    if (error instanceof BlendParseError) throw error;
    const reason = reasonOf(error);
    const damaged = "its compressed data is damaged";
    throw new BlendParseError(reason === "" ? damaged : `${damaged} (${reason})`, { cause: error });
  }
  return bytes;
}
