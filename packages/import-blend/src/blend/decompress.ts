import { Decompress as ZstdStream, decompress as zstdDecompress } from "fzstd";
import { BlendParseError } from "./errors";
import { checkHeaderMagic, HEADER_MAGIC } from "./file";

const ZSTD_MAGIC = 0xfd2fb528;
const ZSTD_SKIPPABLE_MAGIC = 0x184d2a50;
const ZSTD_MAX_BLOCK = 128 * 1024;
const ZSTD_BLOCK_RLE = 1;
const ZSTD_BLOCK_COMPRESSED = 2;
/** Blender refuses a frame whose window is larger, as the Zstandard library does by default. */
const ZSTD_MAX_WINDOW = 2 ** 27 + 1;
/**
 * The most window bytes the decompressor may move for frames that declare no size. It moves the whole window after each
 * of their blocks, so a small file with a large window and many tiny blocks would take minutes.
 */
const MAX_WINDOW_MOVES = 2 ** 36;
/** The blocks the header check decodes at most, for a header split over short or empty blocks and frames. */
const HEADER_BLOCKS = 8;
const GZIP_MAGIC = [0x1f, 0x8b];

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

function startsWith(bytes: Uint8Array, magic: readonly number[]): boolean {
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

interface ZstdFrames {
  /**
   * The bytes decompressing takes: a frame that declares its content size takes that, and one that does not takes its
   * window and what its blocks can hold.
   */
  expanded: number;
  /** The largest window of a frame, which for a single-segment frame is its content size. */
  window: number;
  /** The window bytes the decompressor moves for frames that declare no size: their window after each block. */
  moved: number;
}

/** What decompressing Zstandard data takes, from its frame and block headers alone. It stops at damaged headers. */
function zstdFrames(bytes: Uint8Array): ZstdFrames {
  const frames: ZstdFrames = { expanded: 0, window: 0, moved: 0 };
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
    frames.window = Math.max(frames.window, singleSegment ? content : window);
    const largestBlock = window > 0 ? Math.min(window, ZSTD_MAX_BLOCK) : ZSTD_MAX_BLOCK;
    let held = 0;
    let blocks = 0;
    const addFrame = () => {
      frames.expanded += content > 0 ? content : window + held;
      if (content === 0) frames.moved += window * blocks;
    };
    for (let last = false; !last; ) {
      if (position + 3 > bytes.byteLength) {
        addFrame();
        return frames;
      }
      const header = littleEndian(bytes, position, 3);
      const type = (header >> 1) & 3;
      const size = header >>> 3;
      last = (header & 1) === 1;
      held += type === ZSTD_BLOCK_COMPRESSED ? largestBlock : size;
      blocks += 1;
      position += 3 + (type === ZSTD_BLOCK_RLE ? 1 : size);
    }
    position += (descriptor & 0x04) !== 0 ? 4 : 0;
    addFrame();
    offset = position;
  }
  return frames;
}

/** Refuses Zstandard data that Blender does not read, that expands past `limit` bytes, or that is slow to expand. */
function checkZstdFrames(bytes: Uint8Array, limit: number): void {
  const { expanded, window, moved } = zstdFrames(bytes);
  if (expanded > limit) throw tooLarge(limit);
  if (window > ZSTD_MAX_WINDOW) {
    throw new BlendParseError("its compressed data needs a window over 128 MiB, which Blender refuses too");
  }
  if (moved > MAX_WINDOW_MOVES) {
    throw new BlendParseError("its compressed data does not declare its size and is too slow to expand");
  }
}

async function gunzip(bytes: Uint8Array, limit: number): Promise<Uint8Array> {
  const stream = decompressor("gzip");
  if (!stream) throw new BlendParseError("this runtime cannot read gzip-compressed files");
  const written = writeInSlices(stream.writable.getWriter(), [bytes]);
  written.catch(() => undefined);
  const reader = stream.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    const before = total;
    total += value.byteLength;
    chunks.push(value);
    try {
      if (total > limit) throw tooLarge(limit);
      if (before < HEADER_MAGIC.length && total >= HEADER_MAGIC.length) checkHeaderMagic(concat(chunks));
    } catch (error) {
      await reader.cancel();
      throw error;
    }
  }
  await written;
  return concat(chunks);
}

/**
 * The first bytes of Zstandard data, decoded until they hold a Blender file header's magic or `HEADER_BLOCKS` blocks
 * have been decoded. Decoding stops there, since the stream decoder moves all of a frame's window after each block.
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
 * expands past `limit` bytes or would be too slow to expand, or whose first bytes are not a Blender file header, is
 * refused before the rest is expanded.
 */
export async function decompressBlend(bytes: Uint8Array, limit = MAX_EXPANDED_BYTES): Promise<Uint8Array> {
  try {
    if (littleEndian(bytes, 0, 4) === ZSTD_MAGIC) {
      checkZstdFrames(bytes, limit);
      checkHeaderMagic(zstdStart(bytes));
      return zstdDecompress(bytes);
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
