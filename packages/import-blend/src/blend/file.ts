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

const HEADER_MAGIC = "BLENDER";
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

function digits(text: string): number | null {
  return /^\d+$/.test(text) ? Number(text) : null;
}

function readHeader(bytes: Uint8Array): Header {
  if (bytes.byteLength < 12 || ascii(bytes, 0, 7) !== HEADER_MAGIC) {
    throw new BlendParseError("it does not start with a Blender file header");
  }
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

/**
 * A .blend file's blocks and SDNA over its uncompressed bytes. Pointers in the file are addresses from the session
 * that saved it; `block` finds the block that starts at one.
 */
export class BlendFile {
  readonly bytes: Uint8Array;
  readonly view: DataView;
  readonly little: boolean;
  readonly pointerSize: 4 | 8;
  /** Major × 100 + minor, such as 502 for Blender 5.2. */
  readonly version: number;
  readonly sdna: Sdna;
  readonly blocks: BlendBlock[];
  readonly #global = new Map<bigint, BlendBlock>();
  readonly #owned = new Map<number, Map<bigint, BlendBlock>>();

  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const header = readHeader(bytes);
    this.little = header.little;
    this.pointerSize = header.pointerSize;
    this.version = header.version;

    const raw: { code: string; sdnaIndex: number; address: bigint; offset: number; size: number; count: number }[] = [];
    let offset = header.headerSize;
    let sdnaBlock: { offset: number; size: number } | null = null;
    let ended = false;
    while (offset + header.blockHeaderSize <= bytes.byteLength) {
      const code = ascii(bytes, offset, offset + 4).replace(/\0+$/, "");
      if (code === "ENDB") {
        ended = true;
        break;
      }
      const fields = this.#blockHeader(offset, header.blockHeaderSize);
      const dataOffset = offset + header.blockHeaderSize;
      if (fields.size < 0 || dataOffset + fields.size > bytes.byteLength || fields.count < 0) {
        throw new BlendParseError(`its "${code}" block at byte ${offset} runs past the end of the file`);
      }
      if (code === "DNA1") sdnaBlock = { offset: dataOffset, size: fields.size };
      raw.push({ code, ...fields, offset: dataOffset });
      offset = dataOffset + fields.size;
    }
    if (!ended) throw new BlendParseError("it is cut short: its last block is missing");
    if (!sdnaBlock) throw new BlendParseError("it has no SDNA block");
    this.sdna = parseSdna(
      bytes.subarray(sdnaBlock.offset, sdnaBlock.offset + sdnaBlock.size),
      this.little,
      this.pointerSize,
    );
    let owner = -1;
    this.blocks = raw.map((block, index) => {
      if (block.code !== "DATA") owner = index;
      return {
        index,
        code: block.code,
        struct: block.sdnaIndex > 0 ? this.sdna.structs[block.sdnaIndex] : undefined,
        address: block.address,
        offset: block.offset,
        size: block.size,
        count: block.count,
        owner,
      };
    });
    for (const block of this.blocks) {
      if (block.address === 0n) continue;
      if (block.code === "DATA") {
        let owned = this.#owned.get(block.owner);
        if (!owned) {
          owned = new Map();
          this.#owned.set(block.owner, owned);
        }
        if (!owned.has(block.address)) owned.set(block.address, block);
      }
      if (!this.#global.has(block.address) || block.code !== "DATA") this.#global.set(block.address, block);
    }
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

  /**
   * The block that starts at `address`, or null for a null or dangling pointer. A pointer read from the data of the
   * datablock at block index `owner` resolves among that datablock's blocks first.
   */
  block(address: bigint, owner = -1): BlendBlock | null {
    if (address === 0n) return null;
    return this.#owned.get(owner)?.get(address) ?? this.#global.get(address) ?? null;
  }

  /** Every block with `code`, such as all "OB" blocks, in file order. */
  blocksWithCode(code: string): BlendBlock[] {
    return this.blocks.filter((block) => block.code === code);
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

  /** The structs of a ListBase member, following each one's `next` pointer, at most once each. */
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
      if (!item) break;
      items.push(item);
      from = item;
      address = item.pointer("next");
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
