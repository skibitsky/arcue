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

describe("readBlendFile", () => {
  it.each([
    ["the old header with 4-byte pointers, big-endian", "old", 4, false],
    ["the old header with 8-byte pointers", "old", 8, true],
    ["Blender 5's header with large block headers", "new", 8, true],
  ] as const)("reads structs, arrays and pointers from %s", (_label, header, pointerSize, little) => {
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

  it("refuses bytes without a Blender header, files cut short and newer file formats", () => {
    expect(() => readBlendFile(new TextEncoder().encode("GLTF and more bytes"))).toThrow(BlendParseError);
    const whole = sample("old", 8, true);
    expect(() => readBlendFile(whole.subarray(0, whole.length - 30))).toThrow(/cut short|past the end/);
    const newer = sample("new", 8, true);
    newer.set(new TextEncoder().encode("02"), 10);
    expect(() => readBlendFile(newer)).toThrow(/newer/);
  });
});
