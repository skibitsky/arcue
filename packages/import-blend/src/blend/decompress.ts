import { Decompress as ZstdStream } from "fzstd";
import { BlendParseError } from "./errors";

/** The most a compressed file may expand to: as much memory as the FBX importer lets its parser use. */
const MAX_EXPANDED_BYTES = 2 ** 30;

const ZSTD_MAGIC = [0x28, 0xb5, 0x2f, 0xfd];
const GZIP_MAGIC = [0x1f, 0x8b];

interface ChunkReader {
  read(): Promise<{ done: boolean; value?: Uint8Array }>;
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

/** Collects decompressed chunks, refusing to hold more than `limit` bytes. */
function expansion(limit: number): { add(chunk: Uint8Array): void; bytes(): Uint8Array } {
  const chunks: Uint8Array[] = [];
  let total = 0;
  return {
    add(chunk) {
      total += chunk.byteLength;
      if (total > limit) {
        const size = limit % 2 ** 30 === 0 ? `${limit / 2 ** 30} GiB` : `${limit} bytes`;
        throw new BlendParseError(`it expands to more than ${size}`);
      }
      chunks.push(chunk);
    },
    bytes: () => concat(chunks),
  };
}

function unzstd(bytes: Uint8Array, limit: number): Uint8Array {
  const expanded = expansion(limit);
  new ZstdStream((chunk) => expanded.add(chunk)).push(bytes, true);
  return expanded.bytes();
}

async function gunzip(bytes: Uint8Array, limit: number): Promise<Uint8Array> {
  const Stream = (globalThis as { DecompressionStream?: GzipStreamConstructor }).DecompressionStream;
  if (!Stream) throw new BlendParseError("this runtime cannot read gzip-compressed files");
  const stream = new Stream("gzip");
  const writer = stream.writable.getWriter();
  const written = writer.write(bytes).then(() => writer.close());
  const reader = stream.readable.getReader();
  const expanded = expansion(limit);
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) expanded.add(value);
  }
  await written;
  return expanded.bytes();
}

/**
 * The file's uncompressed bytes. Blender 3.0 and later compress with Zstandard when "Compress" is on, and earlier
 * versions with gzip; an uncompressed file comes back as it is. A compressed file that expands past `limit` bytes is
 * refused.
 */
export async function decompressBlend(bytes: Uint8Array, limit = MAX_EXPANDED_BYTES): Promise<Uint8Array> {
  try {
    if (startsWith(bytes, ZSTD_MAGIC)) return unzstd(bytes, limit);
    if (startsWith(bytes, GZIP_MAGIC)) return await gunzip(bytes, limit);
  } catch (error) {
    if (error instanceof BlendParseError) throw error;
    const reason = error instanceof Error ? error.message : String(error);
    throw new BlendParseError(`its compressed data is damaged (${reason})`, { cause: error });
  }
  return bytes;
}
