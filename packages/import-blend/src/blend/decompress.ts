import { decompress as zstdDecompress } from "fzstd";
import { BlendParseError } from "./errors";

const ZSTD_MAGIC = 0xfd2fb528;
const ZSTD_SKIPPABLE_MAGIC = 0x184d2a50;
const ZSTD_MAX_BLOCK = 128 * 1024;
const ZSTD_BLOCK_RLE = 1;
const ZSTD_BLOCK_COMPRESSED = 2;
const GZIP_MAGIC = [0x1f, 0x8b];

/**
 * The most a compressed file may expand to: as much memory as the FBX importer lets its parser use. Data that declares
 * more is refused before its bytes are allocated. Its ratio to the file's size is no guide: Multires data that was
 * never sculpted compresses over 600 times.
 */
export const MAX_EXPANDED_BYTES = 2 ** 30;
/** Gzip data goes to the decompressor in slices this large, since a browser expands each slice it is given at once. */
const GZIP_SLICE = 16 * 1024;

interface ChunkReader {
  read(): Promise<{ done: boolean; value?: Uint8Array }>;
  cancel(): Promise<void>;
}

interface ChunkWriter {
  write(chunk: Uint8Array): Promise<void>;
  close(): Promise<void>;
}

interface GzipStream {
  readable: { getReader(): ChunkReader };
  writable: { getWriter(): ChunkWriter };
}

type GzipStreamConstructor = new (format: "gzip") => GzipStream;

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

/**
 * The bytes decompressing Zstandard data takes, from its frame and block headers alone: a frame that declares its
 * content size takes that, and one that does not takes its window and what its blocks can hold. It stops at damaged
 * headers, which decompressing then reports.
 */
function zstdSize(bytes: Uint8Array): number {
  let total = 0;
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
    const largestBlock = window > 0 ? Math.min(window, ZSTD_MAX_BLOCK) : ZSTD_MAX_BLOCK;
    let blocks = 0;
    const frameSize = () => (content > 0 ? content : window + blocks);
    for (let last = false; !last; ) {
      if (position + 3 > bytes.byteLength) return total + frameSize();
      const header = littleEndian(bytes, position, 3);
      const type = (header >> 1) & 3;
      const size = header >>> 3;
      last = (header & 1) === 1;
      blocks += type === ZSTD_BLOCK_COMPRESSED ? largestBlock : size;
      position += 3 + (type === ZSTD_BLOCK_RLE ? 1 : size);
    }
    position += (descriptor & 0x04) !== 0 ? 4 : 0;
    total += frameSize();
    offset = position;
  }
  return total;
}

async function gunzip(bytes: Uint8Array, limit: number): Promise<Uint8Array> {
  const Stream = (globalThis as { DecompressionStream?: GzipStreamConstructor }).DecompressionStream;
  if (!Stream) throw new BlendParseError("this runtime cannot read gzip-compressed files");
  const stream = new Stream("gzip");
  const writer = stream.writable.getWriter();
  const written = (async () => {
    for (let start = 0; start < bytes.byteLength; start += GZIP_SLICE) {
      await writer.write(bytes.subarray(start, start + GZIP_SLICE));
    }
    await writer.close();
  })();
  written.catch(() => undefined);
  const reader = stream.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw tooLarge(limit);
    }
    chunks.push(value);
  }
  await written;
  return concat(chunks);
}

/** An error's message, or its cause's when it has none, as with the empty TypeError a gzip stream throws. */
function reasonOf(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  return error.message || (error.cause === undefined ? "" : reasonOf(error.cause));
}

/**
 * The file's uncompressed bytes. Blender 3.0 and later compress with Zstandard when "Compress" is on, and earlier
 * versions with gzip; an uncompressed file comes back as it is. A compressed file that expands past `limit` bytes is
 * refused.
 */
export async function decompressBlend(bytes: Uint8Array, limit = MAX_EXPANDED_BYTES): Promise<Uint8Array> {
  try {
    if (littleEndian(bytes, 0, 4) === ZSTD_MAGIC) {
      if (zstdSize(bytes) > limit) throw tooLarge(limit);
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
