import { describe, expect, it } from "vitest";
import type { FileDefinition } from "../../test/synthetic";
import { writeBlend } from "../../test/synthetic";
import { BlendParseError } from "./errors";
import { readBlendFile } from "./file";

const THING = {
  type: "Thing",
  fields: [
    ["Thing", "*next"],
    ["Thing", "*prev"],
    ["char", "name[8]"],
    ["short", "flag"],
    ["int", "count"],
    ["float", "co[3]"],
    ["float", "*values"],
    ["Thing", "*partner"],
  ],
} satisfies FileDefinition["structs"][number];

const LIST_BASE = {
  type: "ListBase",
  fields: [
    ["void", "*first"],
    ["void", "*last"],
  ],
} satisfies FileDefinition["structs"][number];

const OWNER = {
  type: "Owner",
  fields: [
    ["char", "name[8]"],
    ["ListBase", "things"],
  ],
} satisfies FileDefinition["structs"][number];

const MODIFIER_DATA = {
  type: "ModifierData",
  fields: [
    ["ModifierData", "*next"],
    ["ModifierData", "*prev"],
    ["char", "name[8]"],
  ],
} satisfies FileDefinition["structs"][number];

const MIRROR_MODIFIER = {
  type: "MirrorModifierData",
  fields: [
    ["ModifierData", "modifier"],
    ["short", "axis"],
  ],
} satisfies FileDefinition["structs"][number];

const ARMATURE_MODIFIER = {
  type: "ArmatureModifierData",
  fields: [
    ["ModifierData", "modifier"],
    ["int", "deformflag"],
  ],
} satisfies FileDefinition["structs"][number];

const OBJECT = {
  type: "Object",
  fields: [
    ["char", "name[8]"],
    ["ListBase", "modifiers"],
  ],
} satisfies FileDefinition["structs"][number];

function floats(values: number[], little: boolean): Uint8Array {
  const view = new DataView(new ArrayBuffer(values.length * 4));
  values.forEach((value, index) => {
    view.setFloat32(index * 4, value, little);
  });
  return new Uint8Array(view.buffer);
}

function sample(header: "old" | "new", pointerSize: 4 | 8, little: boolean): Uint8Array {
  return writeBlend({
    header,
    pointerSize,
    little,
    structs: [LIST_BASE, THING, OWNER],
    blocks: [
      {
        code: "OW",
        struct: "Owner",
        address: 0x100n,
        data: [{ name: "OWFirst", things: { first: 0x200n, last: 0x210n } }],
      },
      {
        code: "DATA",
        struct: "Thing",
        address: 0x200n,
        data: [{ name: "One", flag: -3, count: 7, co: [1, 2, 3], values: 0x300n, next: 0x210n, partner: 0x110n }],
      },
      { code: "DATA", struct: "Thing", address: 0x210n, data: [{ name: "Two", count: 8, prev: 0x200n }] },
      { code: "DATA", struct: null, address: 0x300n, data: floats([0.5, 1.5, 2.5], little) },
      {
        code: "OW",
        struct: "Owner",
        address: 0x110n,
        data: [{ name: "OWOther", things: { first: 0x200n, last: 0x200n } }],
      },
      { code: "DATA", struct: "Thing", address: 0x200n, data: [{ name: "Other", count: 9 }] },
    ],
  });
}

/** The inverse of multiplying by an odd number, modulo 2 ** 32. */
function inverseOf(odd: number): number {
  let inverse = odd;
  for (let step = 0; step < 5; step++) inverse = Math.imul(inverse, 2 - Math.imul(odd, inverse));
  return inverse;
}

/** The value that `value ^ (value >>> shift)` was computed from. */
function unshift(value: number, shift: number): number {
  let result = value;
  for (let step = 0; step * shift < 32; step++) result = value ^ (result >>> shift);
  return result;
}

/**
 * Addresses that the fixed hash this reader once used put in slot 0 of every table. That hash mixed in the low half,
 * the high half and the owner, -1 outside a datablock, with one multiplication each, so working back from a hash of 0
 * gives a low half for each high half.
 */
function addressesInOneSlot(count: number): bigint[] {
  const ownerFactor = Math.imul(unshift(0, 15), inverseOf(0x27d4eb2f));
  const highFactor = Math.imul(unshift(ownerFactor ^ -1, 16), inverseOf(0xc2b2ae35));
  return Array.from({ length: count }, (_, index) => {
    const high = index + 1;
    const lowFactor = Math.imul(unshift(highFactor ^ high, 13), inverseOf(0x85ebca6b));
    return (BigInt(high) << 32n) | BigInt((lowFactor ^ 0x9e3779b9) >>> 0);
  });
}

function emptyDataBlocks(addresses: readonly bigint[]): Uint8Array {
  const blocks = addresses.map((address) => ({ code: "DATA", struct: null, address, data: new Uint8Array() }));
  return writeBlend({ header: "old", pointerSize: 8, little: true, structs: [LIST_BASE, THING, OWNER], blocks });
}

/** The fastest of three reads of the bytes, in milliseconds. */
function fastestRead(bytes: Uint8Array): number {
  const times = [0, 1, 2].map(() => {
    const start = performance.now();
    readBlendFile(bytes);
    return performance.now() - start;
  });
  return Math.min(...times);
}

const FORMATS = [
  ["the old header with 4-byte pointers, big-endian", "old", 4, false],
  ["the old header with 8-byte pointers", "old", 8, true],
  ["Blender 5's header with large block headers", "new", 8, true],
] as const;

describe("readBlendFile", () => {
  it.each(FORMATS)("reads structs, arrays and pointers from %s", (_label, header, pointerSize, little) => {
    const file = readBlendFile(sample(header, pointerSize, little));
    expect(file.pointerSize).toBe(pointerSize);
    expect(file.little).toBe(little);
    const [owner] = file.blocksWithCode("OW").map((block) => file.first(block));
    expect(owner?.string("name")).toBe("OWFirst");
    const things = owner?.list("things") ?? [];
    expect(things.map((thing) => thing.string("name"))).toEqual(["One", "Two"]);
    const [one] = things;
    expect(one?.number("flag")).toBe(-3);
    expect(one?.number("count")).toBe(7);
    expect(one?.numbers("co")).toEqual([1, 2, 3]);
    const values = one?.target("values");
    expect(values && Array.from(file.float32(values))).toEqual([0.5, 1.5, 2.5]);
    expect(one?.deref("partner")?.string("name")).toBe("OWOther");
    expect(one?.number("missing")).toBe(0);
    expect(one?.pointer("missing")).toBe(0n);
  });

  it("resolves a datablock's pointers among its own blocks first, as addresses repeat across datablocks", () => {
    const file = readBlendFile(sample("new", 8, true));
    const [first, second] = file.blocksWithCode("OW").map((block) => file.first(block));
    expect(first?.list("things")[0]?.string("name")).toBe("One");
    expect(second?.list("things")[0]?.string("name")).toBe("Other");
  });

  it.each(FORMATS)(
    "follows a list whose elements embed their link in a header struct, from %s",
    (_label, header, pointerSize, little) => {
      const stacked = writeBlend({
        header,
        pointerSize,
        little,
        structs: [LIST_BASE, MODIFIER_DATA, MIRROR_MODIFIER, ARMATURE_MODIFIER, OBJECT],
        blocks: [
          { code: "OB", struct: "Object", address: 0x100n, data: [{ modifiers: { first: 0x200n, last: 0x220n } }] },
          {
            code: "DATA",
            struct: "MirrorModifierData",
            address: 0x200n,
            data: [{ modifier: { next: 0x210n, name: "Mirror" } }],
          },
          {
            code: "DATA",
            struct: "ArmatureModifierData",
            address: 0x210n,
            data: [{ modifier: { next: 0x220n, prev: 0x200n, name: "Arm" }, deformflag: 1 }],
          },
          {
            code: "DATA",
            struct: "MirrorModifierData",
            address: 0x220n,
            data: [{ modifier: { prev: 0x210n, name: "Last" } }],
          },
        ],
      });
      const file = readBlendFile(stacked);
      const object = file.first(file.blocksWithCode("OB")[0] ?? null);
      const modifiers = object?.list("modifiers") ?? [];
      expect(modifiers.map((modifier) => [modifier.typeName, modifier.struct("modifier")?.string("name")])).toEqual([
        ["MirrorModifierData", "Mirror"],
        ["ArmatureModifierData", "Arm"],
        ["MirrorModifierData", "Last"],
      ]);
      expect(modifiers[1]?.number("deformflag")).toBe(1);
    },
  );

  it("reads the two-letter codes a big-endian file writes after two zero bytes", () => {
    const bytes = sample("old", 4, false);
    expect(new TextDecoder().decode(bytes.subarray(12, 16))).toBe("\0\0OW");
    const file = readBlendFile(bytes);
    const codes = Array.from({ length: file.blockCount }, (_, index) => file.blockAt(index)?.code);
    expect(codes).toEqual(["OW", "DATA", "DATA", "DATA", "OW", "DATA", "DNA1"]);
    expect(file.blocksWithCode("OW").map((block) => block.index)).toEqual([0, 4]);
  });

  it("stops a list that loops back on itself", () => {
    const looped = writeBlend({
      header: "old",
      pointerSize: 8,
      little: true,
      structs: [LIST_BASE, THING, OWNER],
      blocks: [
        { code: "OW", struct: "Owner", address: 0x100n, data: [{ things: { first: 0x200n, last: 0x210n } }] },
        { code: "DATA", struct: "Thing", address: 0x200n, data: [{ name: "A", next: 0x210n }] },
        { code: "DATA", struct: "Thing", address: 0x210n, data: [{ name: "B", next: 0x200n }] },
      ],
    });
    const file = readBlendFile(looped);
    const owner = file.first(file.blocksWithCode("OW")[0] ?? null);
    expect(owner?.list("things").map((thing) => thing.string("name"))).toEqual(["A", "B"]);
  });

  it("refuses a block without a code, as a header followed by zeros has", () => {
    const zeros = new Uint8Array(12 + 24 * 1000);
    zeros.set(new TextEncoder().encode("BLENDER-v405"));
    expect(() => readBlendFile(zeros)).toThrow(new BlendParseError("its block at byte 12 has no code"));
  });

  it("finds blocks by address among many small data blocks", () => {
    const count = 100_000;
    const blocks: FileDefinition["blocks"] = [
      { code: "OW", struct: "Owner", address: 0x10n, data: [{ name: "Many", things: { first: 0x20n, last: 0x20n } }] },
    ];
    const tiny = new Uint8Array(1);
    for (let index = 0; index < count; index++) {
      blocks.push({ code: "DATA", struct: null, address: BigInt(0x20 + index * 8), data: tiny });
    }
    const structs = [LIST_BASE, THING, OWNER];
    const file = readBlendFile(writeBlend({ header: "old", pointerSize: 8, little: true, structs, blocks }));
    expect(file.blockCount).toBe(count + 2);
    const last = BigInt(0x20 + (count - 1) * 8);
    expect(file.block(last, 0)?.index).toBe(count);
    expect(file.block(last)?.index).toBe(count);
    expect(file.block(last + 4n)).toBeNull();
  });

  it("indexes blocks whose addresses a file chose to collide as fast as blocks with sequential addresses", () => {
    const count = 20_000;
    const colliding = addressesInOneSlot(count);
    const collidingBytes = emptyDataBlocks(colliding);
    const sequentialBytes = emptyDataBlocks(Array.from({ length: count }, (_, index) => BigInt(0x1000 + index * 8)));
    const file = readBlendFile(collidingBytes);
    expect(colliding.map((address) => file.block(address)?.index)).toEqual(colliding.map((_, index) => index));
    expect(file.block((colliding.at(-1) ?? 0n) + (1n << 32n))).toBeNull();
    expect(fastestRead(collidingBytes)).toBeLessThan(fastestRead(sequentialBytes) * 5 + 50);
  });

  it("refuses an SDNA name far longer than Blender writes", () => {
    const named = {
      type: "Thing",
      fields: [["int", "a".repeat(1_000_000)]],
    } satisfies FileDefinition["structs"][number];
    const bytes = writeBlend({ header: "old", pointerSize: 8, little: true, structs: [named], blocks: [] });
    expect(() => readBlendFile(bytes)).toThrow(new BlendParseError("its SDNA block has a name longer than 1024 bytes"));
  });

  it("refuses bytes without a Blender header, files cut short and newer file formats", () => {
    expect(() => readBlendFile(new TextEncoder().encode("GLTF and more bytes"))).toThrow(BlendParseError);
    const whole = sample("old", 8, true);
    expect(() => readBlendFile(whole.subarray(0, whole.length - 30))).toThrow(/cut short|past the end/);
    const newer = sample("new", 8, true);
    newer.set(new TextEncoder().encode("02"), 10);
    expect(() => readBlendFile(newer)).toThrow(/newer/);
  });
});
