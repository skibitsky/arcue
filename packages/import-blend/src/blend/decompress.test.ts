import { randomBytes } from "node:crypto";
import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";
import { decompressBlend, MAX_EXPANDED_BYTES } from "./decompress";
import { BlendParseError } from "./errors";

const MIB = 1024 * 1024;

function littleEndian(value: number, length: number): number[] {
  return Array.from({ length }, (_, index) => Math.floor(value / 256 ** index) % 256);
}

/** A Zstandard frame of run-length blocks, each `size` copies of `byte`, declaring `content` bytes or no size. */
function zstdFrame(blocks: number, size: number, byte: number, content: number | null): Uint8Array {
  const header =
    content === null
      ? [0x28, 0xb5, 0x2f, 0xfd, 0x00, (20 - 10) << 3]
      : [0x28, 0xb5, 0x2f, 0xfd, 0xe0, ...littleEndian(content, 8)];
  const body = Array.from({ length: blocks }, (_, index) => {
    const last = index === blocks - 1 ? 1 : 0;
    return [...littleEndian(size * 8 + (1 << 1) + last, 3), byte];
  });
  return Uint8Array.from([...header, ...body.flat()]);
}

/** Puts a gzip decompressor in place that records the size of each piece of compressed data written to it. */
function recordGzipWrites(): number[] {
  const writes: number[] = [];
  const Native = globalThis.DecompressionStream;
  vi.stubGlobal(
    "DecompressionStream",
    class {
      readonly readable: ReadableStream<Uint8Array>;
      readonly writable: WritableStream<Uint8Array>;
      constructor(format: "gzip") {
        const native = new Native(format);
        const writer = native.writable.getWriter();
        this.readable = native.readable;
        this.writable = new WritableStream({
          write: (chunk) => {
            writes.push(chunk.byteLength);
            return writer.write(chunk);
          },
          close: () => writer.close(),
          abort: (reason) => writer.abort(reason),
        });
      }
    },
  );
  return writes;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("decompressBlend", () => {
  it("expands Zstandard frames with and without a declared size", async () => {
    const declared = zstdFrame(3, 100, 7, 300);
    const undeclared = zstdFrame(2, 50, 9, null);
    const bytes = new Uint8Array(declared.length + undeclared.length);
    bytes.set(declared);
    bytes.set(undeclared, declared.length);
    const result = await decompressBlend(bytes);
    expect(result.length).toBe(400);
    expect([result[0], result[299], result[300], result[399]]).toEqual([7, 7, 9, 9]);
  });

  it("refuses a frame that declares more than the limit before allocating it", async () => {
    const bomb = zstdFrame(1, 128 * 1024, 0, MAX_EXPANDED_BYTES + 1);
    await expect(decompressBlend(bomb)).rejects.toThrow(new BlendParseError("it expands to more than 1 GiB"));
  });

  it("allows any expansion below that, however small the file", async () => {
    const declared = 300 * MIB;
    const frame = zstdFrame(1, 128 * 1024, 0, declared);
    expect((await decompressBlend(frame)).length).toBe(declared);
  });

  it("refuses frames without a declared size whose blocks hold more than the limit", async () => {
    const blocks = zstdFrame(16, 128 * 1024, 0, null);
    await expect(decompressBlend(blocks, MIB)).rejects.toThrow("it expands to more than 1048576 bytes");
  });

  it("refuses gzip data once it streams past the limit", async () => {
    const zipped = gzipSync(new Uint8Array(4 * MIB));
    await expect(decompressBlend(zipped, MIB)).rejects.toThrow("it expands to more than 1048576 bytes");
    expect((await decompressBlend(zipped, 4 * MIB)).length).toBe(4 * MIB);
  });

  it("gives the gzip decompressor at most 16 KiB at a time, since a browser expands each piece whole", async () => {
    const writes = recordGzipWrites();
    const original = new Uint8Array(randomBytes(40 * 1024));
    const zipped = gzipSync(original);
    expect(await decompressBlend(zipped)).toEqual(original);
    expect(writes.length).toBe(Math.ceil(zipped.length / (16 * 1024)));
    expect(Math.max(...writes)).toBe(16 * 1024);
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
