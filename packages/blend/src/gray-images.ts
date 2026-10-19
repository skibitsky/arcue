import { decompressor, startsWith, writeInSlices } from "./blend/decompress.js";

const PNG_GRAY = 0;
const PNG_RGB = 2;
const PNG_PALETTE = 3;
const PNG_GRAY_ALPHA = 4;
const PNG_RGBA = 6;
const PNG_INTERLACED = 1;
/** Where each Adam7 pass of an interlaced PNG starts, column then row, and its steps across and down. */
const ADAM7 = [
  [0, 0, 8, 8],
  [4, 0, 8, 8],
  [0, 4, 4, 8],
  [2, 0, 4, 4],
  [0, 2, 2, 4],
  [1, 0, 2, 2],
  [0, 1, 1, 2],
] as const;
/** The longest row the check reads, that of a 16-bit RGBA image 8 million pixels wide. */
const MAX_ROW_BYTES = 2 ** 26;
/** The most pixel bytes the checks of one import read, those of an 8-bit RGBA image 16384 pixels square. */
export const GRAY_CHECK_BYTES = 2 ** 30;
/** The most pixel bytes a check reads of an image where it looks only for a pixel that is not gray. */
export const GRAY_SAMPLE_BYTES = 2 ** 20;

/** The pixel bytes the gray checks of one import may still read. */
export interface GrayCheckBudget {
  bytes: number;
}
const LAST_FILTER = 4;
/** The JPEG markers that start a frame, which gives its number of components: 0xc0 to 0xcf but 0xc4, 0xc8 and 0xcc. */
const JPEG_FRAMES = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
const JPEG_MARKER = 0xff;
const JPEG_SCAN = 0xda;

interface PngChunk {
  type: string;
  data: Uint8Array;
}

function pngChunks(bytes: Uint8Array): PngChunk[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunks: PngChunk[] = [];
  for (let offset = 8; offset + 8 <= bytes.byteLength; ) {
    const end = offset + 8 + view.getUint32(offset);
    if (end > bytes.byteLength) break;
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    chunks.push({ type, data: bytes.subarray(offset + 8, end) });
    if (type === "IEND") break;
    offset = end + 4;
  }
  return chunks;
}

/** Whether each pixel of a row has equal red, green and blue samples. */
function isGrayRow(row: Uint8Array, pixel: number, sample: number): boolean {
  for (let start = 0; start < row.byteLength; start += pixel) {
    for (let byte = start; byte < start + sample; byte++) {
      const red = row[byte];
      if (row[byte + sample] !== red || row[byte + 2 * sample] !== red) return false;
    }
  }
  return true;
}

/** One pass of a PNG's rows: how many there are and the bytes of each after its filter byte. */
interface RowPass {
  rows: number;
  bytes: number;
}

/**
 * Reads a PNG's rows as they inflate, until a pixel is not gray, every row is read, or the next row would pass the
 * limit. PNG's filters predict each byte from the same channel of the pixels to its left and above, so an image's
 * filtered rows are gray exactly when its pixels are, and they are read without undoing the filters.
 */
class GrayRows {
  readonly #passes: readonly RowPass[];
  readonly #pixel: number;
  readonly #sample: number;
  #pass = 0;
  #row = 0;
  #filled = 0;
  #line: Uint8Array;
  #color = false;
  #damaged = false;
  #left: number;

  constructor(passes: readonly RowPass[], pixel: number, sample: number, limit: number) {
    this.#passes = passes;
    this.#pixel = pixel;
    this.#sample = sample;
    this.#line = new Uint8Array(1 + (passes[0]?.bytes ?? 0));
    this.#left = limit;
  }

  /** Whether every pixel is gray: false once one is not, and null where the rows end early, stop or are damaged. */
  get gray(): boolean | null {
    if (this.#color) return false;
    return !this.#damaged && this.#pass === this.#passes.length ? true : null;
  }

  /** Reads the next inflated bytes; false once there is nothing more to read. */
  take(bytes: Uint8Array): boolean {
    for (let offset = 0; offset < bytes.byteLength && this.#reading(); ) {
      const copied = Math.min(this.#line.byteLength - this.#filled, bytes.byteLength - offset);
      this.#line.set(bytes.subarray(offset, offset + copied), this.#filled);
      this.#filled += copied;
      offset += copied;
      if (this.#filled === this.#line.byteLength) this.#endRow();
    }
    return this.#reading();
  }

  #reading(): boolean {
    const more = this.#pass < this.#passes.length && this.#line.byteLength - 1 <= this.#left;
    return more && !this.#color && !this.#damaged;
  }

  #endRow(): void {
    this.#filled = 0;
    if ((this.#line[0] ?? 0) > LAST_FILTER) {
      this.#damaged = true;
      return;
    }
    if (!isGrayRow(this.#line.subarray(1), this.#pixel, this.#sample)) {
      this.#color = true;
      return;
    }
    this.#left -= this.#line.byteLength - 1;
    this.#row++;
    if (this.#row < (this.#passes[this.#pass]?.rows ?? 0)) return;
    this.#pass++;
    this.#row = 0;
    this.#line = new Uint8Array(1 + (this.#passes[this.#pass]?.bytes ?? 0));
  }
}

/** Inflates zlib data, passing each piece to `take` until it returns false; it stops where the data is damaged. */
async function inflate(data: readonly Uint8Array[], take: (piece: Uint8Array) => boolean): Promise<void> {
  const stream = decompressor("deflate");
  if (!stream) return;
  const written = writeInSlices(stream.writable.getWriter(), data);
  written.catch(() => undefined);
  const reader = stream.readable.getReader();
  try {
    for (let next = await reader.read(); !next.done; next = await reader.read()) {
      if (next.value && !take(next.value)) {
        await reader.cancel();
        return;
      }
    }
  } catch {
    return;
  }
}

function isGrayPalette(palette: Uint8Array): boolean {
  for (let entry = 0; entry + 2 < palette.byteLength; entry += 3) {
    if (palette[entry + 1] !== palette[entry] || palette[entry + 2] !== palette[entry]) return false;
  }
  return true;
}

async function isGrayPng(bytes: Uint8Array, budget: GrayCheckBudget, limit: number): Promise<boolean | null> {
  const chunks = pngChunks(bytes);
  const header = chunks[0]?.type === "IHDR" ? chunks[0].data : null;
  if (!header || header.byteLength < 13) return null;
  const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
  const [width, height, depth, colorType] = [view.getUint32(0), view.getUint32(4), header[8], header[9]];
  if (colorType === PNG_GRAY || colorType === PNG_GRAY_ALPHA) return true;
  if (colorType === PNG_PALETTE) {
    const palette = chunks.find((chunk) => chunk.type === "PLTE")?.data;
    return palette !== undefined && isGrayPalette(palette) ? true : null;
  }
  if ((colorType !== PNG_RGB && colorType !== PNG_RGBA) || (depth !== 8 && depth !== 16)) return null;
  const sample = depth / 8;
  const pixel = (colorType === PNG_RGBA ? 4 : 3) * sample;
  const sizes =
    header[12] === PNG_INTERLACED
      ? ADAM7.map(([column, row, across, down]) => [
          Math.ceil((width - column) / across),
          Math.ceil((height - row) / down),
        ])
      : [[width, height]];
  const passes = sizes.flatMap(([across = 0, down = 0]) =>
    across > 0 && down > 0 ? [{ rows: down, bytes: across * pixel }] : [],
  );
  if (passes.length === 0 || passes.some((pass) => pass.bytes > MAX_ROW_BYTES)) return null;
  const scanned = Math.min(
    passes.reduce((total, pass) => total + pass.rows * pass.bytes, 0),
    limit,
  );
  if (scanned > budget.bytes) return null;
  budget.bytes -= scanned;
  const rows = new GrayRows(passes, pixel, sample, limit);
  await inflate(
    chunks.filter((chunk) => chunk.type === "IDAT").map((chunk) => chunk.data),
    (piece) => rows.take(piece),
  );
  return rows.gray;
}

/** The number of components a JPEG's frame holds, or null where no frame comes before its data. */
function jpegComponents(bytes: Uint8Array): number | null {
  for (let offset = 2; offset + 4 <= bytes.byteLength && bytes[offset] === JPEG_MARKER; ) {
    const marker = bytes[offset + 1] ?? 0;
    if (marker === JPEG_MARKER) {
      offset++;
      continue;
    }
    if (JPEG_FRAMES.has(marker)) return bytes[offset + 9] ?? null;
    if (marker === JPEG_SCAN) return null;
    offset += 2 + (((bytes[offset + 2] ?? 0) << 8) | (bytes[offset + 3] ?? 0));
  }
  return null;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];

/**
 * Whether every pixel of an image is gray, so that each of its color channels and its brightness equal its color:
 * false where a pixel is known not to be, and null where the check cannot tell. A PNG is read to its last pixel, or to
 * the last whole row within `limit` bytes of pixels, unless it stores gray or a gray palette. It is not read where the
 * pixels it would read take more than the budget has left, which they use up. A JPEG is gray where it stores one
 * component, and other formats are not read.
 */
export async function isGrayImage(
  bytes: Uint8Array,
  budget: GrayCheckBudget = { bytes: GRAY_CHECK_BYTES },
  limit = Number.POSITIVE_INFINITY,
): Promise<boolean | null> {
  if (startsWith(bytes, PNG_SIGNATURE)) return isGrayPng(bytes, budget, limit);
  return startsWith(bytes, JPEG_SIGNATURE) && jpegComponents(bytes) === 1 ? true : null;
}
