import { BlendParseError } from "./errors";
import type { Sdna, SdnaField, SdnaStruct } from "./sdna";
import { parseSdna } from "./sdna";

/** One file block: an ID datablock or data that belongs to one, with the address it had when Blender saved it. */
export interface BlendBlock {
  index: number;
  /** "OB", "ME", "DATA", "DNA1" and so on, without trailing zero bytes. */
  code: string;
  /** The struct of each element, or undefined for raw data such as float arrays. */
  struct: SdnaStruct | undefined;
  address: bigint;
  /** Offset of the block's data in the file's uncompressed bytes. */
  offset: number;
  size: number;
  count: number;
  /**
   * The index of the block that owns this one: a "DATA" block belongs to the datablock written before it, and every
   * other block owns itself. Blender resolves pointers in a datablock's data among that datablock's blocks first, and
   * recent versions reuse addresses across datablocks.
   */
  owner: number;
}

/** The bytes every uncompressed .blend file starts with. */
export const HEADER_MAGIC = "BLENDER";
const textDecoder = new TextDecoder("utf-8");

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.subarray(start, end));
}

interface Header {
  headerSize: number;
  pointerSize: 4 | 8;
  little: boolean;
  version: number;
  /** Bytes of each block header, from the header format. */
  blockHeaderSize: 20 | 24 | 32;
}

/**
 * A block's code without trailing zero bytes. Blender writes the code as an int, so a big-endian file holds a
 * two-letter ID code such as "OB" after two zero bytes, and Blender's reader shifts it into place.
 */
function blockCode(bytes: Uint8Array, offset: number, little: boolean): string {
  const shifted = !little && bytes[offset] === 0 && bytes[offset + 1] === 0;
  return ascii(bytes, shifted ? offset + 2 : offset, offset + 4).replace(/\0+$/, "");
}

function digits(text: string): number | null {
  return /^\d+$/.test(text) ? Number(text) : null;
}

/** Refuses bytes that are shorter than `length` or do not start with `HEADER_MAGIC`. */
export function checkHeaderMagic(bytes: Uint8Array, length = HEADER_MAGIC.length): void {
  if (bytes.byteLength < length || ascii(bytes, 0, HEADER_MAGIC.length) !== HEADER_MAGIC) {
    throw new BlendParseError("it does not start with a Blender file header");
  }
}

function readHeader(bytes: Uint8Array): Header {
  checkHeaderMagic(bytes, 12);
  const headerSize = digits(ascii(bytes, 7, 9));
  if (headerSize !== null) {
    const format = digits(ascii(bytes, 10, 12));
    const version = digits(ascii(bytes, 13, 17));
    if (bytes[9] !== 0x2d || format === null || version === null || headerSize < 17) {
      throw new BlendParseError("its file header is damaged");
    }
    if (format !== 1) throw new BlendParseError(`its file format ${format} is newer than this reader`);
    const endian = bytes[12];
    if (endian !== 0x76 && endian !== 0x56) throw new BlendParseError("its file header is damaged");
    return { headerSize, pointerSize: 8, little: endian === 0x76, version, blockHeaderSize: 32 };
  }
  const pointer = bytes[7];
  const endian = bytes[8];
  const version = digits(ascii(bytes, 9, 12));
  if ((pointer !== 0x5f && pointer !== 0x2d) || (endian !== 0x76 && endian !== 0x56) || version === null) {
    throw new BlendParseError("its file header is damaged");
  }
  const pointerSize = pointer === 0x5f ? 4 : 8;
  return {
    headerSize: 12,
    pointerSize,
    little: endian === 0x76,
    version,
    blockHeaderSize: pointerSize === 4 ? 20 : 24,
  };
}

interface TypedArrays<Values> {
  create(length: number): Values;
  over(buffer: ArrayBufferLike, offset: number, length: number): Values;
}

const FLOAT32: TypedArrays<Float32Array> = {
  create: (length) => new Float32Array(length),
  over: (buffer, offset, length) => new Float32Array(buffer, offset, length),
};

const INT32: TypedArrays<Int32Array> = {
  create: (length) => new Int32Array(length),
  over: (buffer, offset, length) => new Int32Array(buffer, offset, length),
};

const INT16: TypedArrays<Int16Array> = {
  create: (length) => new Int16Array(length),
  over: (buffer, offset, length) => new Int16Array(buffer, offset, length),
};

/** A block code as the four bytes Blender writes, such as "OB\0\0", read as one big-endian number. */
function codeWord(code: string): number {
  let word = 0;
  for (let index = 0; index < 4; index++) word = word * 256 + (code.charCodeAt(index) || 0);
  return word;
}

const DATA = codeWord("DATA");
const ENDB = codeWord("ENDB");
const DNA1 = codeWord("DNA1");
const EMPTY_SLOT = 0;

/** MurmurHash3's finalizer: each bit of the value flips about half of the result's bits. */
function mix(value: number): number {
  let hash = Math.imul(value ^ (value >>> 16), 0x85ebca6b);
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
  return hash ^ (hash >>> 16);
}

/**
 * A hash table slot's starting point for an address and the datablock that owns it or -1. The key is random for each
 * file, so a file cannot choose addresses that all start at one slot.
 */
function hashAddress(key: number, low: number, high: number, owner: number): number {
  return mix(mix(mix(low ^ key) ^ high) ^ owner);
}

function randomKey(): number {
  return new DataView(crypto.getRandomValues(new Uint8Array(4)).buffer).getInt32(0);
}

/** Slots for an open-addressed table of `count` entries, a power of two at most two thirds full. */
/** Past this many blocks a file must average `MIN_BLOCK_BYTES` a block, as Blender's own files average hundreds. */
const MANY_BLOCKS = 2 ** 20;
const MIN_BLOCK_BYTES = 64;

function tableSlots(count: number): Int32Array {
  let size = 8;
  while (size < count * 1.5) size *= 2;
  return new Int32Array(size);
}

/**
 * A .blend file's blocks and SDNA over its uncompressed bytes. Pointers in the file are addresses from the session
 * that saved it; `block` finds the block that starts at one. The block index keeps a few numbers per block in typed
 * arrays and makes a block's object when it is first asked for, so a file of many small blocks takes memory in
 * proportion to its size.
 */
export class BlendFile {
  readonly bytes: Uint8Array;
  readonly view: DataView;
  readonly little: boolean;
  readonly pointerSize: 4 | 8;
  /** Major × 100 + minor, such as 502 for Blender 5.2. */
  readonly version: number;
  readonly sdna: Sdna;
  readonly blockCount: number;
  readonly #blockHeaderSize: 20 | 24 | 32;
  /** Where each block's header starts in the bytes. */
  readonly #starts: Float64Array;
  readonly #codes: Uint32Array;
  /** The index of the datablock each block belongs to, or -1 for data before the first datablock. */
  readonly #owners: Int32Array;
  /** Every block with an address, by address: the last ID block with it, or else the first data block. */
  readonly #global: Int32Array;
  /** Data blocks by their datablock and address, the first of each. */
  readonly #owned: Int32Array;
  readonly #hashKey = randomKey();
  readonly #made = new Map<number, BlendBlock>();

  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const header = readHeader(bytes);
    this.little = header.little;
    this.pointerSize = header.pointerSize;
    this.version = header.version;
    this.#blockHeaderSize = header.blockHeaderSize;

    let count = 0;
    const found: { sdna: Uint8Array | null } = { sdna: null };
    this.#walk(header.headerSize, (start, code, size) => {
      const data = start + header.blockHeaderSize;
      if (code === DNA1) found.sdna = bytes.subarray(data, data + size);
      count++;
    });
    if (!found.sdna) throw new BlendParseError("it has no SDNA block");
    if (count > MANY_BLOCKS && count * MIN_BLOCK_BYTES > bytes.byteLength) {
      throw new BlendParseError(`it has ${count} blocks in ${bytes.byteLength} bytes, far more than Blender writes`);
    }
    this.sdna = parseSdna(found.sdna, this.little, this.pointerSize);

    this.blockCount = count;
    this.#starts = new Float64Array(count);
    this.#codes = new Uint32Array(count);
    this.#owners = new Int32Array(count);
    let index = 0;
    let owner = -1;
    let dataCount = 0;
    this.#walk(header.headerSize, (start, code) => {
      if (code === DATA) dataCount++;
      else owner = index;
      this.#starts[index] = start;
      this.#codes[index] = code;
      this.#owners[index] = owner;
      index++;
    });
    this.#global = tableSlots(count);
    this.#owned = tableSlots(dataCount);
    for (let block = 0; block < count; block++) this.#addToTables(block);
  }

  /** Calls `visit` with each block's header offset, code and data size, up to the "ENDB" block, checking each. */
  #walk(from: number, visit: (start: number, code: number, size: number) => void): void {
    const bytes = this.bytes;
    const headerSize = this.#blockHeaderSize;
    let offset = from;
    while (offset + headerSize <= bytes.byteLength) {
      const code = this.#codeAt(offset);
      if (code === ENDB) return;
      if (code === 0) throw new BlendParseError(`its block at byte ${offset} has no code`);
      const fields = this.#blockHeader(offset, headerSize);
      const dataOffset = offset + headerSize;
      if (fields.size < 0 || dataOffset + fields.size > bytes.byteLength || fields.count < 0) {
        const name = blockCode(bytes, offset, this.little);
        throw new BlendParseError(`its "${name}" block at byte ${offset} runs past the end of the file`);
      }
      visit(offset, code, fields.size);
      offset = dataOffset + fields.size;
    }
    throw new BlendParseError("it is cut short: its last block is missing");
  }

  /** The block's code as `codeWord` gives it, with a big-endian file's two-letter ID codes shifted into place. */
  #codeAt(start: number): number {
    const word = this.view.getUint32(start, false);
    return !this.little && word < 0x10000 ? word * 0x10000 : word;
  }

  #addressHalves(block: number): [low: number, high: number] {
    const at = (this.#starts[block] ?? 0) + 8;
    if (this.pointerSize === 4) return [this.view.getUint32(at, this.little), 0];
    const first = this.view.getUint32(at, this.little);
    const second = this.view.getUint32(at + 4, this.little);
    return this.little ? [first, second] : [second, first];
  }

  /** The slot that holds the block with this address, and for `owner` 0 or more that datablock, or an empty one. */
  #slot(slots: Int32Array, low: number, high: number, owner: number): number {
    const mask = slots.length - 1;
    for (let slot = hashAddress(this.#hashKey, low, high, owner) & mask; ; slot = (slot + 1) & mask) {
      const entry = slots[slot] ?? EMPTY_SLOT;
      if (entry === EMPTY_SLOT) return slot;
      const block = entry - 1;
      if (owner >= 0 && this.#owners[block] !== owner) continue;
      const [blockLow, blockHigh] = this.#addressHalves(block);
      if (blockLow === low && blockHigh === high) return slot;
    }
  }

  #addToTables(block: number): void {
    const [low, high] = this.#addressHalves(block);
    if (low === 0 && high === 0) return;
    const data = this.#codes[block] === DATA;
    const owner = this.#owners[block] ?? -1;
    if (data && owner >= 0) {
      const slot = this.#slot(this.#owned, low, high, owner);
      if (this.#owned[slot] === EMPTY_SLOT) this.#owned[slot] = block + 1;
    }
    const slot = this.#slot(this.#global, low, high, -1);
    if (this.#global[slot] === EMPTY_SLOT || !data) this.#global[slot] = block + 1;
  }

  #blockHeader(offset: number, size: number): { sdnaIndex: number; address: bigint; size: number; count: number } {
    const view = this.view;
    const little = this.little;
    if (size === 32) {
      return {
        sdnaIndex: view.getInt32(offset + 4, little),
        address: view.getBigUint64(offset + 8, little),
        size: Number(view.getBigInt64(offset + 16, little)),
        count: Number(view.getBigInt64(offset + 24, little)),
      };
    }
    const pointerSize = size - 16;
    return {
      size: view.getInt32(offset + 4, little),
      address: pointerSize === 8 ? view.getBigUint64(offset + 8, little) : BigInt(view.getUint32(offset + 8, little)),
      sdnaIndex: view.getInt32(offset + 8 + pointerSize, little),
      count: view.getInt32(offset + 12 + pointerSize, little),
    };
  }

  /** The block at `index` in file order, or null past the last. */
  blockAt(index: number): BlendBlock | null {
    const made = this.#made.get(index);
    if (made) return made;
    const start = this.#starts[index];
    if (start === undefined) return null;
    const fields = this.#blockHeader(start, this.#blockHeaderSize);
    const block: BlendBlock = {
      index,
      code: blockCode(this.bytes, start, this.little),
      struct: fields.sdnaIndex > 0 ? this.sdna.structs[fields.sdnaIndex] : undefined,
      address: fields.address,
      offset: start + this.#blockHeaderSize,
      size: fields.size,
      count: fields.count,
      owner: this.#owners[index] ?? -1,
    };
    this.#made.set(index, block);
    return block;
  }

  /**
   * The block that starts at `address`, or null for a null or dangling pointer. A pointer read from the data of the
   * datablock at block index `owner` resolves among that datablock's blocks first.
   */
  block(address: bigint, owner = -1): BlendBlock | null {
    if (address === 0n) return null;
    const low = Number(address & 0xffffffffn);
    const high = Number((address >> 32n) & 0xffffffffn);
    const owned = owner >= 0 ? (this.#owned[this.#slot(this.#owned, low, high, owner)] ?? EMPTY_SLOT) : EMPTY_SLOT;
    const entry = owned !== EMPTY_SLOT ? owned : (this.#global[this.#slot(this.#global, low, high, -1)] ?? EMPTY_SLOT);
    return entry === EMPTY_SLOT ? null : this.blockAt(entry - 1);
  }

  /** Every block with `code`, such as all "OB" blocks, in file order. */
  blocksWithCode(code: string): BlendBlock[] {
    const word = codeWord(code);
    const found: BlendBlock[] = [];
    this.#codes.forEach((candidate, index) => {
      const block = candidate === word ? this.blockAt(index) : null;
      if (block) found.push(block);
    });
    return found;
  }

  /** The element structs of a block whose struct is known. */
  elements(block: BlendBlock): BlendStruct[] {
    const struct = block.struct;
    if (!struct || struct.size === 0) return [];
    const count = Math.min(block.count, Math.floor(block.size / struct.size));
    return Array.from({ length: count }, (_, index) => new BlendStruct(this, struct, block, index * struct.size));
  }

  /** The first element of a block whose struct is known, or null. */
  first(block: BlendBlock | null): BlendStruct | null {
    if (!block?.struct || block.size < block.struct.size) return null;
    return new BlendStruct(this, block.struct, block, 0);
  }

  pointerAt(offset: number): bigint {
    if (this.pointerSize === 8) return this.view.getBigUint64(offset, this.little);
    return BigInt(this.view.getUint32(offset, this.little));
  }

  /** The block's raw bytes. */
  bytesOf(block: BlendBlock): Uint8Array {
    return this.bytes.subarray(block.offset, block.offset + block.size);
  }

  float32(block: BlendBlock, count?: number): Float32Array {
    return this.#numbers(block, count, 4, (offset) => this.view.getFloat32(offset, this.little), FLOAT32);
  }

  int32(block: BlendBlock, count?: number): Int32Array {
    return this.#numbers(block, count, 4, (offset) => this.view.getInt32(offset, this.little), INT32);
  }

  int16(block: BlendBlock, count?: number): Int16Array {
    return this.#numbers(block, count, 2, (offset) => this.view.getInt16(offset, this.little), INT16);
  }

  /** Copies up to `wanted` numbers from the start of a block, or all that fit. */
  #numbers<Values extends Float32Array | Int32Array | Int16Array>(
    block: BlendBlock,
    wanted: number | undefined,
    elementSize: number,
    read: (offset: number) => number,
    arrays: TypedArrays<Values>,
  ): Values {
    const available = Math.floor(block.size / elementSize);
    const count = wanted === undefined ? available : Math.max(0, Math.min(wanted, available));
    const values = arrays.create(count);
    const start = this.bytes.byteOffset + block.offset;
    if (this.little && start % elementSize === 0) {
      values.set(arrays.over(this.bytes.buffer, start, count));
      return values;
    }
    for (let i = 0; i < count; i++) values[i] = read(block.offset + i * elementSize);
    return values;
  }

  /** Decodes UTF-8 text that ends at the first zero byte or at `end`. */
  text(start: number, end: number): string {
    const slice = this.bytes.subarray(start, end);
    const zero = slice.indexOf(0);
    return textDecoder.decode(zero === -1 ? slice : slice.subarray(0, zero));
  }
}

const NUMBER_READERS: Record<string, (view: DataView, offset: number, little: boolean) => number> = {
  char: (view, offset) => view.getUint8(offset),
  uchar: (view, offset) => view.getUint8(offset),
  int8_t: (view, offset) => view.getInt8(offset),
  uint8_t: (view, offset) => view.getUint8(offset),
  bool: (view, offset) => view.getUint8(offset),
  short: (view, offset, little) => view.getInt16(offset, little),
  ushort: (view, offset, little) => view.getUint16(offset, little),
  int16_t: (view, offset, little) => view.getInt16(offset, little),
  uint16_t: (view, offset, little) => view.getUint16(offset, little),
  int: (view, offset, little) => view.getInt32(offset, little),
  int32_t: (view, offset, little) => view.getInt32(offset, little),
  uint: (view, offset, little) => view.getUint32(offset, little),
  uint32_t: (view, offset, little) => view.getUint32(offset, little),
  long: (view, offset, little) => view.getInt32(offset, little),
  ulong: (view, offset, little) => view.getUint32(offset, little),
  float: (view, offset, little) => view.getFloat32(offset, little),
  double: (view, offset, little) => view.getFloat64(offset, little),
  int64_t: (view, offset, little) => Number(view.getBigInt64(offset, little)),
  uint64_t: (view, offset, little) => Number(view.getBigUint64(offset, little)),
};

/**
 * One struct in the file, read by member name through the file's SDNA. Members the struct does not have, as in files
 * from other Blender versions, read as their zero value: 0, an empty string, a null pointer or an empty list.
 */
export class BlendStruct {
  readonly file: BlendFile;
  readonly type: SdnaStruct;
  readonly block: BlendBlock;
  /** Offset of the struct in the file's bytes. */
  readonly offset: number;

  constructor(file: BlendFile, type: SdnaStruct, block: BlendBlock, offsetInBlock: number) {
    this.file = file;
    this.type = type;
    this.block = block;
    this.offset = block.offset + offsetInBlock;
  }

  get typeName(): string {
    return this.type.type;
  }

  has(name: string): boolean {
    return this.type.field(name) !== undefined;
  }

  field(name: string): SdnaField | undefined {
    return this.type.field(name);
  }

  /** The member as a number, or the `index`th element of an array member; 0 when the struct has no such member. */
  number(name: string, index = 0): number {
    const field = this.type.field(name);
    if (!field || field.pointerDepth > 0 || index >= field.count) return 0;
    const read = NUMBER_READERS[field.type];
    if (!read) return 0;
    const elementSize = field.size / field.count;
    return read(this.file.view, this.offset + field.offset + index * elementSize, this.file.little);
  }

  /** Every element of an array member, or the one value of a single member; empty when there is no such member. */
  numbers(name: string): number[] {
    const field = this.type.field(name);
    if (!field || field.pointerDepth > 0 || !NUMBER_READERS[field.type]) return [];
    return Array.from({ length: field.count }, (_, index) => this.number(name, index));
  }

  /** A char array member as text. */
  string(name: string): string {
    const field = this.type.field(name);
    if (!field || field.pointerDepth > 0) return "";
    const start = this.offset + field.offset;
    return this.file.text(start, start + field.size);
  }

  /** The address a pointer member holds, or 0n. */
  pointer(name: string, index = 0): bigint {
    const field = this.type.field(name);
    if (!field || field.pointerDepth === 0 || index >= field.count) return 0n;
    return this.file.pointerAt(this.offset + field.offset + index * this.file.pointerSize);
  }

  /** A struct member embedded in this one, or null when there is none. */
  struct(name: string, index = 0): BlendStruct | null {
    const field = this.type.field(name);
    if (!field || field.pointerDepth > 0 || index >= field.count) return null;
    const type = this.file.sdna.struct(field.type);
    if (!type) return null;
    return new BlendStruct(
      this.file,
      type,
      this.block,
      this.offset - this.block.offset + field.offset + index * type.size,
    );
  }

  /** The block an address read from this struct points at, resolved among its datablock's blocks first. */
  resolve(address: bigint): BlendBlock | null {
    return this.file.block(address, this.block.owner);
  }

  /** The block a pointer member points at, or null. */
  target(name: string, index = 0): BlendBlock | null {
    return this.resolve(this.pointer(name, index));
  }

  /** The struct a pointer member points at, typed by its block, or null. */
  deref(name: string, index = 0): BlendStruct | null {
    return this.file.first(this.target(name, index));
  }

  /** Every struct in the block a pointer member points at. */
  derefAll(name: string): BlendStruct[] {
    const block = this.target(name);
    return block ? this.file.elements(block) : [];
  }

  /** The pointers in the block a pointer-to-pointer member points at, such as a material array. */
  pointers(name: string, count?: number): bigint[] {
    const block = this.target(name);
    if (!block) return [];
    const available = Math.floor(block.size / this.file.pointerSize);
    const length = count === undefined ? available : Math.max(0, Math.min(count, available));
    return Array.from({ length }, (_, index) => this.file.pointerAt(block.offset + index * this.file.pointerSize));
  }

  /**
   * The structs of a ListBase member, at most once each. Every element starts with its `next` pointer, also when its
   * block's struct embeds the link in a header, as each modifier struct embeds `ModifierData`.
   */
  list(name: string): BlendStruct[] {
    const base = this.struct(name);
    if (!base) return [];
    const items: BlendStruct[] = [];
    const seen = new Set<bigint>();
    let address = base.pointer("first");
    let from: BlendStruct = base;
    while (address !== 0n && !seen.has(address)) {
      seen.add(address);
      const item = this.file.first(from.resolve(address));
      if (!item || item.type.size < this.file.pointerSize) break;
      items.push(item);
      from = item;
      address = this.file.pointerAt(item.offset);
    }
    return items;
  }

  /** A char pointer member as text, or an empty string. */
  text(name: string): string {
    const block = this.target(name);
    return block ? this.file.text(block.offset, block.offset + block.size) : "";
  }
}

/** Reads the blocks and SDNA of uncompressed .blend bytes. */
export function readBlendFile(bytes: Uint8Array): BlendFile {
  return new BlendFile(bytes);
}
