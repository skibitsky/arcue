import { deflateSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";
import { isGrayImage } from "./gray-images";

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const ADAM7 = [
  [0, 0, 8, 8],
  [4, 0, 8, 8],
  [0, 4, 4, 8],
  [2, 0, 4, 4],
  [0, 2, 2, 4],
  [1, 0, 2, 2],
  [0, 1, 1, 2],
] as const;

function bigEndian(value: number, length: number): number[] {
  return Array.from({ length }, (_, index) => Math.floor(value / 256 ** (length - 1 - index)) % 256);
}

function chunk(type: string, data: ArrayLike<number>): number[] {
  return [
    ...bigEndian(data.length, 4),
    ...Array.from(type, (letter) => letter.charCodeAt(0)),
    ...Array.from(data),
    0,
    0,
    0,
    0,
  ];
}

function paeth(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft;
  const [toLeft, toUp, toUpLeft] = [left, up, upLeft].map((value) => Math.abs(estimate - value));
  if ((toLeft ?? 0) <= (toUp ?? 0) && (toLeft ?? 0) <= (toUpLeft ?? 0)) return left;
  return (toUp ?? 0) <= (toUpLeft ?? 0) ? up : upLeft;
}

/** A row filtered the way PNG's filter `filter` stores it, given the row above. */
function filtered(filter: number, row: number[], above: number[], pixel: number): number[] {
  return row.map((value, index) => {
    const left = row[index - pixel] ?? 0;
    const up = above[index] ?? 0;
    const upLeft = above[index - pixel] ?? 0;
    const predicted = [0, left, up, (left + up) >> 1, paeth(left, up, upLeft)][filter] ?? 0;
    return (value - predicted + 256) % 256;
  });
}

interface PngImage {
  width: number;
  height: number;
  colorType: number;
  /** The samples of the pixel at a column and row. */
  pixel: (x: number, y: number) => number[];
  depth?: 8 | 16;
  interlaced?: boolean;
  filter?: (y: number) => number;
  palette?: number[];
  /** How many IDAT chunks hold the pixels. */
  parts?: number;
}

function png(image: PngImage): Uint8Array {
  const { width, height, colorType, pixel, depth = 8, interlaced = false, filter = () => 0, parts = 1 } = image;
  const samples = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 4 ? 2 : 1;
  const passes = interlaced ? ADAM7 : ([[0, 0, 1, 1]] as const);
  const data: number[] = [];
  for (const [column, row, across, down] of passes) {
    let above: number[] = [];
    for (let y = row; y < height; y += down) {
      const line: number[] = [];
      for (let x = column; x < width; x += across) {
        for (const sample of pixel(x, y)) line.push(...bigEndian(sample, depth / 8));
      }
      if (line.length === 0) break;
      const kind = filter(y);
      data.push(kind, ...filtered(kind, line, above, (samples * depth) / 8));
      above = line;
    }
  }
  const compressed = deflateSync(Uint8Array.from(data));
  const size = Math.ceil(compressed.byteLength / parts);
  const idats = Array.from({ length: parts }, (_, index) =>
    chunk("IDAT", compressed.subarray(index * size, (index + 1) * size)),
  );
  return Uint8Array.from([
    ...SIGNATURE,
    ...chunk("IHDR", [...bigEndian(width, 4), ...bigEndian(height, 4), depth, colorType, 0, 0, interlaced ? 1 : 0]),
    ...(image.palette ? chunk("PLTE", image.palette) : []),
    ...idats.flat(),
    ...chunk("IEND", []),
  ]);
}

const grayAt = (x: number, y: number) => (x * 37 + y * 101) % 256;

/** Puts a decompressor in place that counts the streams made and the bytes they hand out. */
function countInflated(): { streams: number; bytes: number } {
  const inflated = { streams: 0, bytes: 0 };
  const Native = globalThis.DecompressionStream;
  vi.stubGlobal(
    "DecompressionStream",
    class {
      readonly writable: WritableStream<Uint8Array>;
      readonly readable: { getReader(): Pick<ReadableStreamDefaultReader<Uint8Array>, "read" | "cancel"> };
      constructor(format: "deflate") {
        const native = new Native(format);
        const reader = native.readable.getReader();
        inflated.streams++;
        this.writable = native.writable;
        this.readable = {
          getReader: () => ({
            read: async () => {
              const next = await reader.read();
              inflated.bytes += next.value?.byteLength ?? 0;
              return next;
            },
            cancel: (reason) => reader.cancel(reason),
          }),
        };
      }
    },
  );
  return inflated;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isGrayImage", () => {
  it("reads a PNG that stores gray, with or without alpha, as gray", async () => {
    expect(await isGrayImage(png({ width: 3, height: 2, colorType: 0, pixel: (x, y) => [grayAt(x, y)] }))).toBe(true);
    const grayAlpha = png({ width: 3, height: 2, colorType: 4, pixel: (x, y) => [grayAt(x, y), 255 - x] });
    expect(await isGrayImage(grayAlpha)).toBe(true);
  });

  it("reads every pixel of an RGB or RGBA PNG, through each of its row filters", async () => {
    for (const colorType of [2, 6]) {
      const pixel = (x: number, y: number) => {
        const value = grayAt(x, y);
        return colorType === 6 ? [value, value, value, (x * 50) % 256] : [value, value, value];
      };
      const image = { width: 7, height: 10, colorType, pixel, filter: (y: number) => y % 5 };
      expect(await isGrayImage(png(image)), `color type ${colorType}`).toBe(true);
      const tinted = (x: number, y: number) => (x === 6 && y === 9 ? [10, 11, 10, 255] : pixel(x, y));
      expect(await isGrayImage(png({ ...image, pixel: tinted })), `color type ${colorType}`).toBe(false);
    }
  });

  it("compares both bytes of 16-bit samples", async () => {
    const pixel = (x: number, y: number) => [grayAt(x, y) * 200 + 7, grayAt(x, y) * 200 + 7, grayAt(x, y) * 200 + 7];
    const image = { width: 4, height: 3, colorType: 2, depth: 16 as const, pixel, filter: (y: number) => y + 1 };
    expect(await isGrayImage(png(image))).toBe(true);
    const lowByte = (x: number, y: number) => (x === 3 && y === 2 ? [1000, 1001, 1000] : pixel(x, y));
    expect(await isGrayImage(png({ ...image, pixel: lowByte }))).toBe(false);
  });

  it("reads each pass of an interlaced PNG", async () => {
    const pixel = (x: number, y: number) => [grayAt(x, y), grayAt(x, y), grayAt(x, y)];
    const image = { width: 9, height: 5, colorType: 2, interlaced: true, pixel, filter: (y: number) => y % 5 };
    expect(await isGrayImage(png(image))).toBe(true);
    const lastPass = (x: number, y: number) => (x === 8 && y === 3 ? [0, 0, 255] : pixel(x, y));
    expect(await isGrayImage(png({ ...image, pixel: lastPass }))).toBe(false);
  });

  it("reads pixels split over many IDAT chunks and many slices", async () => {
    const pixel = (x: number, y: number) => [grayAt(x, y), grayAt(x, y), grayAt(x, y), 255];
    const image = { width: 300, height: 120, colorType: 6, pixel, filter: (y: number) => y % 5, parts: 7 };
    expect(await isGrayImage(png(image))).toBe(true);
    const last = (x: number, y: number) => (x === 299 && y === 119 ? [5, 5, 6, 255] : pixel(x, y));
    expect(await isGrayImage(png({ ...image, pixel: last }))).toBe(false);
  });

  it("stops inflating at the first row that is not gray", async () => {
    const inflated = countInflated();
    const pixel = (x: number, y: number) => (x === 0 && y === 0 ? [255, 0, 0, 255] : [0, 0, 0, 255]);
    expect(await isGrayImage(png({ width: 512, height: 512, colorType: 6, pixel }))).toBe(false);
    expect(inflated.bytes).toBeGreaterThan(0);
    expect(inflated.bytes).toBeLessThan(512 * 512);
  });

  it("does not read a PNG whose rows are too long to hold", async () => {
    const inflated = countInflated();
    const header = chunk("IHDR", [...bigEndian(2 ** 31 - 1, 4), ...bigEndian(1, 4), 16, 6, 0, 0, 0]);
    expect(await isGrayImage(Uint8Array.from([...SIGNATURE, ...header, ...chunk("IEND", [])]))).toBe(false);
    expect(inflated.streams).toBe(0);
  });

  it("does not read a PNG whose pixels take more than the limit", async () => {
    const inflated = countInflated();
    const pixel = (x: number, y: number) => [grayAt(x, y), grayAt(x, y), grayAt(x, y)];
    const image = png({ width: 8, height: 8, colorType: 2, pixel });
    expect(await isGrayImage(image, { bytes: 8 * 8 * 3 - 1 })).toBe(false);
    expect(inflated.streams).toBe(0);
    expect(await isGrayImage(image, { bytes: 8 * 8 * 3 })).toBe(true);
  });

  it("shares one budget across the images of an import, so a file cannot repeat an image to read it many times", async () => {
    const inflated = countInflated();
    const pixel = (x: number, y: number) => [grayAt(x, y), grayAt(x, y), grayAt(x, y)];
    const image = png({ width: 8, height: 8, colorType: 2, pixel });
    const budget = { bytes: 8 * 8 * 3 * 2 };
    expect(await isGrayImage(image, budget)).toBe(true);
    expect(await isGrayImage(image, budget)).toBe(true);
    expect(await isGrayImage(image, budget)).toBe(false);
    expect(inflated.streams).toBe(2);
  });

  it("reads a palette PNG by its palette", async () => {
    const image = { width: 2, height: 2, colorType: 3, pixel: () => [0] };
    expect(await isGrayImage(png({ ...image, palette: [0, 0, 0, 128, 128, 128, 255, 255, 255] }))).toBe(true);
    expect(await isGrayImage(png({ ...image, palette: [0, 0, 0, 128, 0, 128] }))).toBe(false);
  });

  it("does not count a PNG it cannot read to the end", async () => {
    const pixel = (x: number, y: number) => [grayAt(x, y), grayAt(x, y), grayAt(x, y)];
    const whole = png({ width: 4, height: 4, colorType: 2, pixel });
    const short = png({ width: 4, height: 3, colorType: 2, pixel });
    const header = chunk("IHDR", [...bigEndian(4, 4), ...bigEndian(4, 4), 8, 2, 0, 0, 0]);
    expect(await isGrayImage(Uint8Array.from([...SIGNATURE, ...header, ...short.subarray(33)]))).toBe(false);
    const damaged = Uint8Array.from([...SIGNATURE, ...header, ...chunk("IDAT", [1, 2, 3, 4, 5]), ...chunk("IEND", [])]);
    expect(await isGrayImage(damaged)).toBe(false);
    expect(await isGrayImage(png({ width: 4, height: 4, colorType: 2, pixel, filter: () => 5 }))).toBe(false);
    expect(await isGrayImage(whole)).toBe(true);
  });

  it("reads a JPEG as gray only where its frame has one component", async () => {
    const jpeg = (components: number) =>
      Uint8Array.from([
        0xff,
        0xd8,
        ...[0xff, 0xe0, 0x00, 0x04, 0x4a, 0x46],
        ...[0xff, 0xff, 0xc0, 0x00, 8 + 3 * components, 8, 0, 4, 0, 4, components],
        ...Array.from({ length: components }, (_, index) => [index + 1, 0x11, 0]).flat(),
        ...[0xff, 0xda, 0x00, 0x02, 0xff, 0xd9],
      ]);
    expect(await isGrayImage(jpeg(1))).toBe(true);
    expect(await isGrayImage(jpeg(3))).toBe(false);
    expect(await isGrayImage(Uint8Array.from([0xff, 0xd8, 0xff, 0xda, 0x00, 0x02, 0xff, 0xd9]))).toBe(false);
  });

  it("does not count other formats", async () => {
    expect(await isGrayImage(Uint8Array.from([0x42, 0x4d, 0, 0, 0, 0]))).toBe(false);
    expect(await isGrayImage(new Uint8Array())).toBe(false);
  });
});
