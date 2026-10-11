import { decompress as zstdDecompress } from "fzstd";
import { BlendParseError } from "./errors";

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

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  const Stream = (globalThis as { DecompressionStream?: GzipStreamConstructor }).DecompressionStream;
  if (!Stream) throw new BlendParseError("this runtime cannot read gzip-compressed files");
  const stream = new Stream("gzip");
  const writer = stream.writable.getWriter();
  const written = writer.write(bytes).then(() => writer.close());
  const reader = stream.readable.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  await written;
  return concat(chunks);
}

/**
 * The file's uncompressed bytes. Blender 3.0 and later compress with Zstandard when "Compress" is on, and earlier
 * versions with gzip; an uncompressed file comes back as it is.
 */
export async function decompressBlend(bytes: Uint8Array): Promise<Uint8Array> {
  try {
    if (startsWith(bytes, ZSTD_MAGIC)) return zstdDecompress(bytes);
    if (startsWith(bytes, GZIP_MAGIC)) return await gunzip(bytes);
  } catch (error) {
    if (error instanceof BlendParseError) throw error;
    const reason = error instanceof Error ? error.message : String(error);
    throw new BlendParseError(`its compressed data is damaged (${reason})`, { cause: error });
  }
  return bytes;
}
