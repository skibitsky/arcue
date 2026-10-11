/**
 * Writes small .blend files from struct definitions, for reader tests that need what Blender no longer writes:
 * 4-byte pointers, big-endian bytes and the old headers.
 */

export type FieldValue = number | bigint | string | number[] | { [field: string]: FieldValue };

export interface StructDefinition {
  type: string;
  /** Type and name as SDNA writes them, such as ["float", "co[3]"] or ["Thing", "*next"]. */
  fields: [string, string][];
}

export interface BlockDefinition {
  code: string;
  /** The struct of each element, or null for raw data. */
  struct: string | null;
  address: bigint;
  /** One record of field values per element, or raw bytes. */
  data: Record<string, FieldValue>[] | Uint8Array;
}

export interface FileDefinition {
  header: "old" | "new";
  pointerSize: 4 | 8;
  little: boolean;
  version?: string;
  structs: StructDefinition[];
  blocks: BlockDefinition[];
}

const BASIC_SIZES: Readonly<Record<string, number>> = { char: 1, short: 2, int: 4, float: 4, void: 0 };

class Writer {
  readonly #chunks: number[] = [];
  readonly #little: boolean;

  constructor(little: boolean) {
    this.#little = little;
  }

  get length(): number {
    return this.#chunks.length;
  }

  bytes(values: ArrayLike<number>): void {
    for (let i = 0; i < values.length; i++) this.#chunks.push(values[i] ?? 0);
  }

  text(value: string): void {
    this.bytes(new TextEncoder().encode(value));
  }

  number(value: number, size: number, float = false): void {
    const view = new DataView(new ArrayBuffer(size));
    if (float) view.setFloat32(0, value, this.#little);
    else if (size === 1) view.setUint8(0, value);
    else if (size === 2) view.setInt16(0, value, this.#little);
    else if (size === 4) view.setInt32(0, value, this.#little);
    else view.setBigInt64(0, BigInt(value), this.#little);
    this.bytes(new Uint8Array(view.buffer));
  }

  pointer(value: bigint, size: number): void {
    const view = new DataView(new ArrayBuffer(size));
    if (size === 4) view.setUint32(0, Number(value), this.#little);
    else view.setBigUint64(0, value, this.#little);
    this.bytes(new Uint8Array(view.buffer));
  }

  align(): void {
    while (this.#chunks.length % 4 !== 0) this.#chunks.push(0);
  }

  result(): Uint8Array {
    return Uint8Array.from(this.#chunks);
  }
}

interface ParsedField {
  type: string;
  name: string;
  pointer: boolean;
  count: number;
}

function parseField([type, raw]: [string, string]): ParsedField {
  const name = raw.replace(/^\**/, "").replace(/\[.*$/, "");
  const dims = [...raw.matchAll(/\[(\d+)\]/g)].map((match) => Number(match[1]));
  return { type, name, pointer: raw.startsWith("*"), count: dims.reduce((product, dim) => product * dim, 1) };
}

/**
 * Writes the definition as an uncompressed .blend file. Like Blender, it puts a "Link" struct first, since a block
 * whose struct index is 0 holds raw data.
 */
export function writeBlend(given: FileDefinition): Uint8Array {
  const link: StructDefinition = {
    type: "Link",
    fields: [
      ["Link", "*next"],
      ["Link", "*prev"],
    ],
  };
  const definition = { ...given, structs: [link, ...given.structs] };
  const { pointerSize, little } = definition;
  const sizes = new Map(Object.entries(BASIC_SIZES));
  for (const struct of definition.structs) {
    const size = struct.fields.map(parseField).reduce((sum, field) => {
      const element = field.pointer ? pointerSize : (sizes.get(field.type) ?? 0);
      return sum + element * field.count;
    }, 0);
    sizes.set(struct.type, size);
  }
  const types = [...sizes.keys()];
  const names = [...new Set(definition.structs.flatMap((struct) => struct.fields.map(([, name]) => name)))];

  const out = new Writer(little);
  const version = definition.version ?? (definition.header === "new" ? "0500" : "400");
  if (definition.header === "new") out.text(`BLENDER17-01${little ? "v" : "V"}${version}`);
  else out.text(`BLENDER${pointerSize === 4 ? "_" : "-"}${little ? "v" : "V"}${version}`);

  const blockHeader = (code: string, sdna: number, address: bigint, size: number, count: number) => {
    out.text(code.padEnd(4, "\0"));
    if (definition.header === "new") {
      out.number(sdna, 4);
      out.pointer(address, 8);
      out.number(size, 8);
      out.number(count, 8);
    } else {
      out.number(size, 4);
      out.pointer(address, pointerSize);
      out.number(sdna, 4);
      out.number(count, 4);
    }
  };

  const writeRecord = (
    data: Writer,
    struct: StructDefinition | null | undefined,
    record: Record<string, FieldValue>,
  ) => {
    for (const field of (struct?.fields ?? []).map(parseField)) {
      const value = record[field.name];
      const nested = definition.structs.find((candidate) => candidate.type === field.type);
      if (nested && !field.pointer) {
        const inner = typeof value === "object" && !Array.isArray(value) ? value : {};
        writeRecord(data, nested, inner);
        continue;
      }
      const values = Array.isArray(value) ? value : value === undefined || typeof value === "object" ? [] : [value];
      for (let i = 0; i < field.count; i++) {
        if (field.pointer) data.pointer(BigInt(values[i] ?? 0), pointerSize);
        else if (field.type === "char" && typeof value === "string") {
          data.bytes([new TextEncoder().encode(value)[i] ?? 0]);
        } else data.number(Number(values[i] ?? 0), sizes.get(field.type) ?? 0, field.type === "float");
      }
    }
  };

  for (const block of definition.blocks) {
    const data = new Writer(little);
    let count = 1;
    const struct =
      block.struct === null ? null : definition.structs.find((candidate) => candidate.type === block.struct);
    if (block.data instanceof Uint8Array) data.bytes(block.data);
    else {
      count = block.data.length;
      for (const record of block.data) writeRecord(data, struct, record);
    }
    const bytes = data.result();
    const index = struct ? definition.structs.indexOf(struct) : 0;
    blockHeader(block.code, index, block.address, bytes.length, count);
    out.bytes(bytes);
  }

  const dna = new Writer(little);
  dna.text("SDNANAME");
  dna.number(names.length, 4);
  for (const name of names) dna.text(`${name}\0`);
  dna.align();
  dna.text("TYPE");
  dna.number(types.length, 4);
  for (const type of types) dna.text(`${type}\0`);
  dna.align();
  dna.text("TLEN");
  for (const type of types) dna.number(sizes.get(type) ?? 0, 2);
  dna.align();
  dna.text("STRC");
  dna.number(definition.structs.length, 4);
  for (const struct of definition.structs) {
    dna.number(types.indexOf(struct.type), 2);
    dna.number(struct.fields.length, 2);
    for (const [type, name] of struct.fields) {
      dna.number(types.indexOf(type), 2);
      dna.number(names.indexOf(name), 2);
    }
  }
  const sdna = dna.result();
  blockHeader("DNA1", 0, 0n, sdna.length, 1);
  out.bytes(sdna);
  blockHeader("ENDB", 0, 0n, 0, 0);
  return out.result();
}
