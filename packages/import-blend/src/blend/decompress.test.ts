import { randomBytes } from "node:crypto";
import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";
import { decompressBlend, MAX_EXPANDED_BYTES } from "./decompress";
import { BlendParseError } from "./errors";

const MIB = 1024 * 1024;
const HEADER = new TextEncoder().encode("BLENDER-v405");
const NOT_A_HEADER = new BlendParseError("it does not start with a Blender file header");

function littleEndian(value: number, length: number): number[] {
  return Array.from({ length }, (_, index) => Math.floor(value / 256 ** index) % 256);
}

/**
 * A Zstandard frame declaring `content` bytes or no size: a raw block holding `start` when it has bytes, then run-length
 * blocks, each `size` copies of `byte`. Without a window descriptor, a frame that declares its size is a single segment.
 */
function zstdFrame(
  start: Uint8Array,
  blocks: number,
  size: number,
  byte: number,
  content: number | null,
  windowDescriptor: number | null = content === null ? (20 - 10) << 3 : null,
): Uint8Array {
  const declared = content === null ? [] : littleEndian(content, 8);
  const header =
    windowDescriptor === null
      ? [0x28, 0xb5, 0x2f, 0xfd, 0xe0, ...declared]
      : [0x28, 0xb5, 0x2f, 0xfd, content === null ? 0x00 : 0xc0, windowDescriptor, ...declared];
  const raw = start.length > 0 ? [...littleEndian(start.length << 3, 3), ...start] : [];
  const body = Array.from({ length: blocks }, (_, index) => {
    const last = index === blocks - 1 ? 1 : 0;
    return [...littleEndian(size * 8 + (1 << 1) + last, 3), byte];
  });
  return Uint8Array.from([...header, ...raw, ...body.flat()]);
}

/** A Zstandard frame that declares no size, with one raw block for each part. */
function rawFrame(...parts: string[]): Uint8Array {
  const blocks = parts.map((part, index) => {
    const bytes = new TextEncoder().encode(part);
    const last = index === parts.length - 1 ? 1 : 0;
    return [...littleEndian(bytes.length * 8 + last, 3), ...bytes];
  });
  return Uint8Array.from([0x28, 0xb5, 0x2f, 0xfd, 0x00, (20 - 10) << 3, ...blocks.flat()]);
}

function joined(...parts: Uint8Array[]): Uint8Array {
  return Uint8Array.from(parts.flatMap((part) => [...part]));
}

/** A window descriptor for `2 ** log` bytes, and an eighth more for each of `eighths`. */
function windowOf(log: number, eighths = 0): number {
  return ((log - 10) << 3) | eighths;
}

/** `length` zero bytes after a Blender file header. */
function blendBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  bytes.set(HEADER);
  return bytes;
}

/**
 * Puts a gzip decompressor in place that records the size of each piece of compressed data written to it, and how many
 * decompressed bytes were read from it.
 */
function recordGzip(): { writes: number[]; read: number } {
  const record: { writes: number[]; read: number } = { writes: [], read: 0 };
  const Native = globalThis.DecompressionStream;
  vi.stubGlobal(
    "DecompressionStream",
    class {
      readonly readable: ReadableStream<Uint8Array>;
      readonly writable: WritableStream<Uint8Array>;
      constructor(format: "gzip") {
        const native = new Native(format);
        const writer = native.writable.getWriter();
        const reader = native.readable.getReader();
        this.writable = new WritableStream({
          write: (chunk) => {
            record.writes.push(chunk.byteLength);
            return writer.write(chunk);
          },
          close: () => writer.close(),
          abort: (reason) => writer.abort(reason),
        });
        this.readable = new ReadableStream(
          {
            pull: async (controller) => {
              const { done, value } = await reader.read();
              if (done) return controller.close();
              record.read += value.byteLength;
              controller.enqueue(value);
            },
            cancel: (reason) => reader.cancel(reason),
          },
          { highWaterMark: 0 },
        );
      }
    },
  );
  return record;
}

/** What decompressing rejects with, or null when it succeeds, so that a test never prints the expanded bytes. */
function refusal(bytes: Uint8Array): Promise<unknown> {
  return decompressBlend(bytes).then(
    () => null,
    (error: unknown) => error,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("decompressBlend", () => {
  it("expands Zstandard frames with and without a declared size", async () => {
    const declared = zstdFrame(HEADER, 3, 100, 7, 312);
    const undeclared = zstdFrame(new Uint8Array(), 2, 50, 9, null);
    const bytes = new Uint8Array(declared.length + undeclared.length);
    bytes.set(declared);
    bytes.set(undeclared, declared.length);
    const result = await decompressBlend(bytes);
    expect(result.length).toBe(412);
    expect(result.subarray(0, 12)).toEqual(HEADER);
    expect([result[12], result[311], result[312], result[411]]).toEqual([7, 7, 9, 9]);
  });

  it("refuses a frame that declares more than the limit before allocating it", async () => {
    const bomb = zstdFrame(HEADER, 1, 128 * 1024, 0, MAX_EXPANDED_BYTES + 1, windowOf(27));
    await expect(decompressBlend(bomb)).rejects.toThrow(new BlendParseError("it expands to more than 1 GiB"));
  });

  it("allows any expansion below that, however small the file", async () => {
    const declared = 300 * MIB;
    const frame = zstdFrame(HEADER, 1, 128 * 1024, 0, declared, windowOf(27));
    expect((await decompressBlend(frame)).length).toBe(declared);
  });

  it("refuses a frame whose window is over 128 MiB, as Blender does, whether or not it declares its size", async () => {
    const refused = new BlendParseError("its compressed data needs a window over 128 MiB, which Blender refuses too");
    const largestWindow = zstdFrame(HEADER, 1, 100, 0, 112, windowOf(27));
    expect((await decompressBlend(largestWindow)).length).toBe(112);
    expect(await refusal(zstdFrame(HEADER, 1, 100, 0, 112, windowOf(27, 1)))).toEqual(refused);
    expect(await refusal(zstdFrame(HEADER, 1, 100, 0, null, windowOf(27, 1)))).toEqual(refused);
    expect(await refusal(zstdFrame(HEADER, 1, 100, 0, 2 ** 27 + 2))).toEqual(refused);
  });

  it("refuses frames without a declared size whose window the decompressor would move after too many blocks", async () => {
    const slow = zstdFrame(HEADER, 600, 1, 0, null, windowOf(27));
    expect(await refusal(slow)).toEqual(
      new BlendParseError("its compressed data does not declare its size and is too slow to expand"),
    );
    const declared = zstdFrame(HEADER, 600, 1, 0, 612, windowOf(27));
    expect((await decompressBlend(declared)).length).toBe(612);
  });

  it("refuses frames without a declared size whose blocks hold more than the limit", async () => {
    const blocks = zstdFrame(HEADER, 16, 128 * 1024, 0, null);
    await expect(decompressBlend(blocks, MIB)).rejects.toThrow("it expands to more than 1048576 bytes");
  });

  it("refuses gzip data once it streams past the limit", async () => {
    const zipped = gzipSync(blendBytes(4 * MIB));
    await expect(decompressBlend(zipped, MIB)).rejects.toThrow("it expands to more than 1048576 bytes");
    expect((await decompressBlend(zipped, 4 * MIB)).length).toBe(4 * MIB);
  });

  it("gives the gzip decompressor at most 16 KiB at a time, since a browser expands each piece whole", async () => {
    const { writes } = recordGzip();
    const original = new Uint8Array(randomBytes(40 * 1024));
    original.set(HEADER);
    const zipped = gzipSync(original);
    expect(await decompressBlend(zipped)).toEqual(original);
    expect(writes.length).toBe(Math.ceil(zipped.length / (16 * 1024)));
    expect(Math.max(...writes)).toBe(16 * 1024);
  });

  it("refuses Zstandard data whose first block is not a Blender file header without decoding the rest", async () => {
    const zerosThenCut = zstdFrame(new Uint8Array(), 2, 128 * 1024, 0, 64 * MIB).subarray(0, -1);
    expect(await refusal(zerosThenCut)).toEqual(NOT_A_HEADER);
    const emptyFirst = zstdFrame(new Uint8Array(), 2, 0, 0, null);
    expect(await refusal(emptyFirst)).toEqual(NOT_A_HEADER);
  });

  it("reads a Zstandard file header that spans short or empty blocks and frames", async () => {
    const acrossFrames = joined(rawFrame(""), rawFrame("BLE"), rawFrame("NDER-v405", "rest"));
    expect(new TextDecoder().decode(await decompressBlend(acrossFrames))).toBe("BLENDER-v405rest");
    const acrossBlocks = rawFrame("", "BLENDE", "R-v405");
    expect(new TextDecoder().decode(await decompressBlend(acrossBlocks))).toBe("BLENDER-v405");
  });

  it("gives up on a Zstandard file header after 8 blocks", async () => {
    const late = rawFrame(...Array.from({ length: 8 }, () => ""), "BLENDER-v405");
    expect(await refusal(late)).toEqual(NOT_A_HEADER);
    expect((await decompressBlend(rawFrame(...Array.from({ length: 7 }, () => ""), "BLENDER-v405"))).length).toBe(12);
  });

  it("refuses gzip data that does not start with a Blender file header before expanding the rest", async () => {
    const record = recordGzip();
    expect(await refusal(gzipSync(new Uint8Array(16 * MIB)))).toEqual(NOT_A_HEADER);
    expect(record.read).toBeGreaterThan(0);
    expect(record.read).toBeLessThan(MIB);
  });

  it("reports damaged gzip data without an empty reason or a stray rejection", async () => {
    const zipped = gzipSync(new TextEncoder().encode("BLENDER-v402".repeat(500)));
    const damaged = zipped.slice();
    damaged.fill(0xff, 12, 40);
    for (const bytes of [damaged, zipped.subarray(0, zipped.length / 2)]) {
      const error = await decompressBlend(bytes).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(BlendParseError);
      expect((error as Error).message).toMatch(/^its compressed data is damaged( \(.+\))?$/);
    }
  });
});
