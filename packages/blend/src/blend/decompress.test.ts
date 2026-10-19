import { randomBytes } from "node:crypto";
import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";
import { decompressBlend, MAX_EXPANDED_BYTES } from "./decompress.js";
import { BlendParseError } from "./errors.js";

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
  const raw = start.length > 0 ? [...blockHeader(start.length, 0, false), ...start] : [];
  const body = Array.from({ length: blocks }, (_, index) => [...blockHeader(size, 1, index === blocks - 1), byte]);
  return Uint8Array.from([...frameHeader(content, windowDescriptor), ...raw, ...body.flat()]);
}

/** A frame header declaring `content` bytes or no size, as a single segment when it has no window descriptor. */
function frameHeader(content: number | null, windowDescriptor: number | null): number[] {
  const declared = content === null ? [] : littleEndian(content, 8);
  return windowDescriptor === null
    ? [0x28, 0xb5, 0x2f, 0xfd, 0xe0, ...declared]
    : [0x28, 0xb5, 0x2f, 0xfd, content === null ? 0x00 : 0xc0, windowDescriptor, ...declared];
}

function blockHeader(size: number, type: number, last: boolean): number[] {
  return littleEndian(size * 8 + type * 2 + (last ? 1 : 0), 3);
}

/** A compressed block that holds `bytes` as raw literals and no sequences. */
function literalsBlock(bytes: Uint8Array, last: boolean): number[] {
  const body = [((bytes.length & 15) << 4) | 0b0100, bytes.length >> 4, ...bytes, 0];
  return [...blockHeader(body.length, 2, last), ...body];
}

/**
 * A compressed block with no literals and `count` sequences, either at most 127 or exactly 32512, that all have the
 * same literal length, offset and match length `codes`. Their extra bits come from `bits`, read back from its last
 * byte, whose highest set bit marks where they start.
 */
function sequencesBlock(count: number, codes: [number, number, number], bits: number[], last: boolean): number[] {
  const sequences = count < 128 ? [count] : [0xff, 0, 0];
  const body = [0, ...sequences, 0b01010100, ...codes, ...bits];
  return [...blockHeader(body.length, 2, last), ...body];
}

/**
 * A compressed block with one literal, whose Huffman weights are coded with a table that gives a single weight all the
 * probability, so that reading a weight takes no bits.
 */
function endlessWeightsBlock(last: boolean): number[] {
  const literals = [0x12, 0x80, 0x02];
  const weights = [4, 0xf0, 0x03, 0x00, 0x80];
  const body = [...literals, ...weights, 0, 0, 0, 0, 0, 0, 0];
  return [...blockHeader(body.length, 2, last), ...body];
}

/** A Zstandard frame that declares no size, with one raw block for each part. */
function rawFrame(...parts: string[]): Uint8Array {
  const blocks = parts.map((part, index) => {
    const bytes = new TextEncoder().encode(part);
    return [...blockHeader(bytes.length, 0, index === parts.length - 1), ...bytes];
  });
  return Uint8Array.from([...frameHeader(null, windowOf(20)), ...blocks.flat()]);
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

/**
 * Puts a gzip decompressor in place that ignores what is written to it and gives `pieces`, each through one buffer that
 * it overwrites with the next, as a decompressor may reuse its output buffer.
 */
function emitGzip(pieces: readonly Uint8Array[]): void {
  vi.stubGlobal(
    "DecompressionStream",
    class {
      readonly writable = new WritableStream<Uint8Array>();
      readonly readable: ReadableStream<Uint8Array>;
      constructor() {
        const shared = new Uint8Array(Math.max(...pieces.map((piece) => piece.byteLength)));
        let next = 0;
        this.readable = new ReadableStream(
          {
            pull: (controller) => {
              const piece = pieces[next++];
              if (!piece) return controller.close();
              shared.set(piece);
              controller.enqueue(shared.subarray(0, piece.byteLength));
            },
          },
          { highWaterMark: 0 },
        );
      }
    },
  );
}

/** Bytes that start as gzip data does and end with a trailer giving `size` as the expanded size. */
function gzipWithSize(length: number, size: number): Uint8Array {
  const bytes = new Uint8Array(length);
  bytes.set([0x1f, 0x8b]);
  bytes.set(littleEndian(size, 4), length - 4);
  return bytes;
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
  vi.restoreAllMocks();
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

  it("expands frames without a declared size block by block, however many blocks and frames they have", async () => {
    const blocks = await decompressBlend(zstdFrame(HEADER, 600, 1024, 7, null, windowOf(27)));
    expect([blocks.length, blocks[12], blocks.at(-1)]).toEqual([12 + 600 * 1024, 7, 7]);
    const expected = [...HEADER];
    const matches = Array.from({ length: 2000 }, (_, index) => {
      expected.push(index % 251);
      for (let k = 0; k < 3; k++) expected.push(expected[expected.length - 5] ?? -1);
      return [...blockHeader(1, 0, false), index % 251, ...sequencesBlock(1, [0, 3, 0], [0x80], index === 1999)];
    });
    const start = [...blockHeader(12, 0, false), ...HEADER];
    const windowed = Uint8Array.from([...frameHeader(null, windowOf(10)), ...start, ...matches.flat()]);
    expect([...(await decompressBlend(windowed))]).toEqual(expected);
    const empty = new Uint8Array();
    const frames = Array.from({ length: 20_000 }, (_, index) =>
      zstdFrame(index === 0 ? HEADER : empty, 1, 1, 9, null, windowOf(10)),
    );
    expect((await decompressBlend(joined(...frames))).length).toBe(12 + 20_000);
  });

  it("counts the window of each frame without a declared size against the limit", async () => {
    const empty = new Uint8Array();
    const frames = (count: number) =>
      joined(
        ...Array.from({ length: count }, (_, index) =>
          zstdFrame(index === 0 ? HEADER : empty, 1, 1, 0, null, windowOf(27)),
        ),
      );
    expect((await decompressBlend(frames(8))).length).toBe(12 + 8);
    expect(await refusal(frames(9))).toEqual(new BlendParseError("it expands to more than 1 GiB"));
    const declared = Array.from({ length: 600 }, (_, index) =>
      index === 0
        ? zstdFrame(HEADER, 1, 1, 0, 13, windowOf(27))
        : zstdFrame(new Uint8Array(), 1, 1, 0, 1, windowOf(27)),
    );
    expect((await decompressBlend(joined(...declared))).length).toBe(12 + 600);
  });

  it("refuses frames without a declared size once their blocks expand past the limit", async () => {
    const blocks = zstdFrame(HEADER, 16, 128 * 1024, 0, null);
    await expect(decompressBlend(blocks, MIB)).rejects.toThrow("it expands to more than 1048576 bytes");
    const literals = Array.from({ length: 16 }, (_, index) =>
      literalsBlock(new Uint8Array(100).fill(index), index === 15),
    );
    const small = Uint8Array.from([
      ...frameHeader(null, windowOf(20)),
      ...blockHeader(12, 0, false),
      ...HEADER,
      ...literals.flat(),
    ]);
    const expanded = await decompressBlend(small, MIB);
    expect([expanded.length, expanded[12], expanded.at(-1)]).toEqual([12 + 1600, 0, 15]);
    const declaredFirst = joined(
      zstdFrame(HEADER, 5, 120 * 1024, 0, 12 + 600 * 1024),
      zstdFrame(new Uint8Array(), 5, 120 * 1024, 0, null, windowOf(17)),
    );
    await expect(decompressBlend(declaredFirst, MIB)).rejects.toThrow("it expands to more than 1048576 bytes");
  });

  it("stops a frame at the size it declares, as Blender does, without expanding its other blocks", async () => {
    const damaged = new BlendParseError("its compressed data is damaged (invalid zstd data)");
    const start = [...blockHeader(12, 0, false), ...HEADER];
    const rle = Uint8Array.from([...frameHeader(100, windowOf(20)), ...start, ...blockHeader(89, 1, true), 0]);
    expect(await refusal(rle)).toEqual(damaged);
    const raw = Uint8Array.from([
      ...frameHeader(100, windowOf(20)),
      ...start,
      ...blockHeader(89, 0, true),
      ...new Uint8Array(89),
    ]);
    expect(await refusal(raw)).toEqual(damaged);
    const literals = Uint8Array.from([
      ...frameHeader(100, windowOf(20)),
      ...start,
      ...literalsBlock(new Uint8Array(89), true),
    ]);
    expect(await refusal(literals)).toEqual(damaged);
    const sequences = Array.from({ length: 1000 }, (_, index) => sequencesBlock(1, [0, 0, 52], [0x80], index === 999));
    const matches = Uint8Array.from([...frameHeader(4096, windowOf(20)), ...start, ...sequences.flat()]);
    expect(await refusal(matches)).toEqual(damaged);
  });

  it("stops a block whose sequences expand past the largest block a frame allows", async () => {
    const start = [...blockHeader(12, 0, false), ...HEADER];
    for (const codes of [
      [0, 0, 52],
      [35, 0, 0],
    ] as const) {
      const block = sequencesBlock(32_512, [...codes], [0x80], true);
      const bytes = Uint8Array.from([...frameHeader(null, windowOf(20)), ...start, ...block]);
      expect(await refusal(bytes)).toEqual(new BlendParseError("its compressed data is damaged (invalid zstd data)"));
    }
  });

  it("stops reading Huffman weights after 255, as the reference decoder does", async () => {
    const start = [...blockHeader(12, 0, false), ...HEADER];
    for (const header of [frameHeader(4096, windowOf(17)), frameHeader(null, windowOf(17))]) {
      const bytes = Uint8Array.from([...header, ...start, ...endlessWeightsBlock(true)]);
      expect(await refusal(bytes)).toEqual(new BlendParseError("its compressed data is damaged (invalid zstd data)"));
    }
  });

  it("follows matches that reach back a whole window in a frame without a declared size", async () => {
    const history = Array.from({ length: 1024 - HEADER.length }, (_, index) => (index * 37 + 11) % 256);
    const expected = [...HEADER, ...history];
    const matches = Array.from({ length: 2000 }, (_, index) => {
      expected.push(index % 251);
      for (let k = 0; k < 3; k++) expected.push(expected[expected.length - 1024] ?? -1);
      return [...blockHeader(1, 0, false), index % 251, ...sequencesBlock(1, [0, 10, 0], [0x03, 0x04], index === 1999)];
    });
    const start = [...blockHeader(12, 0, false), ...HEADER, ...blockHeader(history.length, 0, false), ...history];
    const frame = Uint8Array.from([...frameHeader(null, windowOf(10)), ...start, ...matches.flat()]);
    expect([...(await decompressBlend(frame))]).toEqual(expected);
  });

  it("moves the window of a frame without a declared size by fewer bytes than the frame expands to", async () => {
    const copies = vi.spyOn(Uint8Array.prototype, "copyWithin");
    const moved = () => copies.mock.calls.reduce((sum, [, from, to]) => sum + (to ?? 0) - from, 0);
    const blocks = await decompressBlend(zstdFrame(HEADER, 600, 1024, 7, null, windowOf(27)));
    expect(moved()).toBeLessThanOrEqual(blocks.length);
    copies.mockClear();
    const small = await decompressBlend(zstdFrame(HEADER, 3000, 100, 7, null, windowOf(10)));
    expect(moved()).toBeGreaterThan(0);
    expect(moved()).toBeLessThanOrEqual(small.length);
  });

  it("follows matches that reach 64 MiB back or more", async () => {
    const distance = 96 * MIB;
    const zeros = Array.from({ length: 768 }, (_, index) => [
      ...blockHeader(index === 767 ? 128 * 1024 - 12 : 128 * 1024, 1, false),
      0,
    ]);
    const reach = sequencesBlock(1, [0, 26, 0], [0x80, 0x01, 0, 0, 0x03], true);
    const start = [...blockHeader(12, 0, false), ...HEADER];
    const frame = Uint8Array.from([...frameHeader(distance + 3, null), ...start, ...zeros.flat(), ...reach]);
    const expanded = await decompressBlend(frame);
    expect([expanded.length, ...expanded.subarray(distance)]).toEqual([distance + 3, ...HEADER.subarray(0, 3)]);
  });

  it("refuses gzip data once it streams past the limit", async () => {
    const zipped = gzipSync(blendBytes(4 * MIB));
    await expect(decompressBlend(zipped, MIB)).rejects.toThrow("it expands to more than 1048576 bytes");
    expect((await decompressBlend(zipped, 4 * MIB)).length).toBe(4 * MIB);
  });

  it("expands gzip data into one buffer of the size its trailer gives", async () => {
    const original = new Uint8Array(randomBytes(3 * MIB));
    original.set(HEADER);
    const expanded = await decompressBlend(gzipSync(original));
    expect(Buffer.from(expanded).equals(Buffer.from(original))).toBe(true);
    expect(expanded.buffer.byteLength).toBe(original.length);
  });

  it("copies each piece the gzip decompressor gives as it arrives, so that no piece is held", async () => {
    const pieces = [joined(HEADER, Uint8Array.of(1, 2)), Uint8Array.of(3, 4, 5), Uint8Array.of(6)];
    emitGzip(pieces);
    const expanded = await decompressBlend(gzipWithSize(64, 18));
    expect(expanded).toEqual(joined(...pieces));
    expect(expanded.buffer.byteLength).toBe(18);
  });

  it("grows the buffer for gzip data that expands past the size its trailer gives", async () => {
    const pieces = [HEADER, new Uint8Array(100).fill(7), new Uint8Array(1000).fill(9)];
    emitGzip(pieces);
    expect(await decompressBlend(gzipWithSize(64, 50))).toEqual(joined(...pieces));
  });

  it("ignores a gzip trailer that gives more than the data could expand to or the limit allows", async () => {
    const pieces = [HEADER, new Uint8Array(100).fill(7)];
    emitGzip(pieces);
    const unlikely = await decompressBlend(gzipWithSize(64, 64 * 1033));
    expect(unlikely).toEqual(joined(...pieces));
    expect(unlikely.buffer.byteLength).toBeLessThan(MIB);
    emitGzip(pieces);
    const pastLimit = await decompressBlend(gzipWithSize(MIB, 2 * MIB), MIB);
    expect(pastLimit.buffer.byteLength).toBeLessThan(MIB);
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

  it("refuses data after the last Zstandard frame that is not a frame", async () => {
    const trailing = joined(rawFrame("BLENDER-v405"), Uint8Array.of(1, 2, 3, 4, 5, 6, 7, 8, 9));
    expect(await refusal(trailing)).toEqual(new BlendParseError("its compressed data is damaged (invalid zstd data)"));
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
