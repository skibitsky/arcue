import { BlendParseError } from "./errors";

/** One member of a struct as the file's SDNA describes it. */
export interface SdnaField {
  /** The member's identifier without pointer stars and array sizes: "co" for "co[3]", "next" for "*next". */
  name: string;
  /** The member's type name, such as "float", "char" or "CustomDataLayer". */
  type: string;
  typeIndex: number;
  offset: number;
  /** Bytes the member takes, all array elements included. */
  size: number;
  /** Levels of indirection: 0 for a value, 1 for "*next", 2 for "**mat". Function pointers count as 1. */
  pointerDepth: number;
  /** Array sizes, outermost first: [4, 4] for "mat[4][4]"; empty for a single value. */
  dims: number[];
  /** Product of `dims`, or 1. */
  count: number;
}

export interface SdnaStruct {
  index: number;
  type: string;
  size: number;
  fields: SdnaField[];
  field(name: string): SdnaField | undefined;
}

export interface Sdna {
  structs: SdnaStruct[];
  /** Byte size of each type by name, for the basic types and every struct. */
  typeSize(type: string): number | undefined;
  struct(type: string): SdnaStruct | undefined;
}

/** The longest member or type name the reader takes; Blender's own are under 64 bytes. */
const MAX_NAME_BYTES = 1024;
/**
 * The most names, types or structs the SDNA may list: members name their name and type by 16-bit index, and each
 * struct has a type of its own. Blender's own list under 10,000 of each.
 */
const MAX_ENTRIES = 2 ** 16;
/** The most members all structs may have together; Blender's own have under 10,000. */
const MAX_MEMBERS = 2 ** 18;

class Cursor {
  #offset: number;
  readonly #view: DataView;
  readonly #bytes: Uint8Array;
  readonly #little: boolean;

  constructor(bytes: Uint8Array, little: boolean) {
    this.#bytes = bytes;
    this.#view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.#little = little;
    this.#offset = 0;
  }

  #need(bytes: number): void {
    if (this.#offset + bytes > this.#bytes.byteLength) throw new BlendParseError("its SDNA block is cut short");
  }

  tag(expected: string): void {
    this.#need(4);
    const tag = String.fromCharCode(...this.#bytes.subarray(this.#offset, this.#offset + 4));
    if (tag !== expected) throw new BlendParseError(`its SDNA block has "${tag}" where "${expected}" belongs`);
    this.#offset += 4;
  }

  int32(): number {
    this.#need(4);
    const value = this.#view.getInt32(this.#offset, this.#little);
    this.#offset += 4;
    return value;
  }

  int16(): number {
    this.#need(2);
    const value = this.#view.getInt16(this.#offset, this.#little);
    this.#offset += 2;
    return value;
  }

  uint16(): number {
    this.#need(2);
    const value = this.#view.getUint16(this.#offset, this.#little);
    this.#offset += 2;
    return value;
  }

  string(): string {
    const end = this.#bytes.indexOf(0, this.#offset);
    if (end === -1) throw new BlendParseError("its SDNA block has an unterminated name");
    if (end - this.#offset > MAX_NAME_BYTES) {
      throw new BlendParseError(`its SDNA block has a name longer than ${MAX_NAME_BYTES} bytes`);
    }
    const value = String.fromCharCode(...this.#bytes.subarray(this.#offset, end));
    this.#offset = end + 1;
    return value;
  }

  align(): void {
    this.#offset = (this.#offset + 3) & ~3;
  }
}

function count(cursor: Cursor, what: string): number {
  const value = cursor.int32();
  if (value < 0 || value > MAX_ENTRIES) throw new BlendParseError(`its SDNA block lists ${value} ${what}`);
  return value;
}

interface ParsedName {
  name: string;
  pointerDepth: number;
  dims: number[];
}

function parseName(raw: string): ParsedName {
  const isFunction = raw.startsWith("(*");
  let pointerDepth = 0;
  let start = isFunction ? 2 : 0;
  if (isFunction) pointerDepth = 1;
  while (raw[start] === "*") {
    pointerDepth++;
    start++;
  }
  let end = start;
  while (end < raw.length && raw[end] !== "[" && raw[end] !== ")") end++;
  const dims: number[] = [];
  for (const match of raw.slice(end).matchAll(/\[(\d+)\]/g)) dims.push(Number(match[1]));
  return { name: raw.slice(start, end), pointerDepth, dims };
}

/** Parses the "SDNA" data of a DNA1 block. */
export function parseSdna(bytes: Uint8Array, little: boolean, pointerSize: number): Sdna {
  const cursor = new Cursor(bytes, little);
  cursor.tag("SDNA");
  cursor.tag("NAME");
  const names: ParsedName[] = [];
  for (let i = count(cursor, "names"); i > 0; i--) names.push(parseName(cursor.string()));
  cursor.align();
  cursor.tag("TYPE");
  const types: string[] = [];
  for (let i = count(cursor, "types"); i > 0; i--) types.push(cursor.string());
  cursor.align();
  cursor.tag("TLEN");
  const lengths = types.map(() => cursor.uint16());
  cursor.align();
  cursor.tag("STRC");
  const sizes = new Map<string, number>();
  types.forEach((type, index) => {
    sizes.set(type, lengths[index] ?? 0);
  });

  const structs: SdnaStruct[] = [];
  let members = 0;
  for (let i = count(cursor, "structs"), index = 0; i > 0; i--, index++) {
    const typeIndex = cursor.uint16();
    const fieldCount = cursor.uint16();
    const type = types[typeIndex];
    if (type === undefined) throw new BlendParseError(`its SDNA struct ${index} has an unknown type`);
    members += fieldCount;
    if (members > MAX_MEMBERS) throw new BlendParseError(`its SDNA structs have over ${MAX_MEMBERS} members`);
    const fields: SdnaField[] = [];
    let offset = 0;
    for (let f = 0; f < fieldCount; f++) {
      const fieldType = cursor.uint16();
      const nameIndex = cursor.uint16();
      const parsed = names[nameIndex];
      const typeName = types[fieldType];
      if (parsed === undefined || typeName === undefined) {
        throw new BlendParseError(`its SDNA struct ${type} has a member with an unknown name or type`);
      }
      const elements = parsed.dims.reduce((product, dim) => product * dim, 1);
      const elementSize = parsed.pointerDepth > 0 ? pointerSize : (lengths[fieldType] ?? 0);
      if (elementSize === 0) throw new BlendParseError(`its SDNA struct ${type} has a member of no size`);
      fields.push({
        name: parsed.name,
        type: typeName,
        typeIndex: fieldType,
        offset,
        size: elementSize * elements,
        pointerDepth: parsed.pointerDepth,
        dims: parsed.dims,
        count: elements,
      });
      offset += elementSize * elements;
      const declared = lengths[typeIndex] ?? 0;
      if (!(offset <= declared)) {
        throw new BlendParseError(`its SDNA struct ${type} has members past its ${declared} bytes`);
      }
    }
    const byName = new Map<string, SdnaField>();
    for (const field of fields) if (!byName.has(field.name)) byName.set(field.name, field);
    structs.push({
      index,
      type,
      size: lengths[typeIndex] ?? offset,
      fields,
      field: (name) => byName.get(name),
    });
  }
  const structsByType = new Map(structs.map((struct) => [struct.type, struct]));
  return {
    structs,
    typeSize: (type) => sizes.get(type),
    struct: (type) => structsByType.get(type),
  };
}
