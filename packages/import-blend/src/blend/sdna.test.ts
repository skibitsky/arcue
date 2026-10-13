import { describe, expect, it } from "vitest";
import { BlendParseError } from "./errors";
import { parseSdna } from "./sdna";

interface SdnaDefinition {
  names: string[];
  /** Each type's name and byte size. */
  types: [string, number][];
  /** Each struct's type index and its members' type and name indices. */
  structs: [type: number, members: [type: number, name: number][]][];
}

/** SDNA bytes as a DNA1 block of a little-endian file holds them. */
function sdnaBytes({ names, types, structs }: SdnaDefinition): Uint8Array {
  const bytes: number[] = [];
  const text = (value: string) => bytes.push(...new TextEncoder().encode(value));
  const int32 = (value: number) => bytes.push(value & 255, (value >> 8) & 255, (value >> 16) & 255, value >>> 24);
  const int16 = (value: number) => bytes.push(value & 255, (value >> 8) & 255);
  const align = () => {
    while (bytes.length % 4 !== 0) bytes.push(0);
  };
  text("SDNANAME");
  int32(names.length);
  for (const name of names) text(`${name}\0`);
  align();
  text("TYPE");
  int32(types.length);
  for (const [type] of types) text(`${type}\0`);
  align();
  text("TLEN");
  for (const [, size] of types) int16(size);
  align();
  text("STRC");
  int32(structs.length);
  for (const [type, members] of structs) {
    int16(type);
    int16(members.length);
    for (const [memberType, name] of members) {
      int16(memberType);
      int16(name);
    }
  }
  return Uint8Array.from(bytes);
}

const BASIC_TYPES: [string, number][] = [
  ["void", 0],
  ["char", 1],
];

/** `count` structs of the largest size SDNA describes, each filled with one-byte members. */
function fullStructs(count: number): SdnaDefinition {
  const types: [string, number][] = [...BASIC_TYPES];
  const structs: SdnaDefinition["structs"] = [];
  for (let index = 0; index < count; index++) {
    types.push([`Full${index}`, 0xffff]);
    structs.push([types.length - 1, Array.from({ length: 0xffff }, () => [1, 0])]);
  }
  return { names: ["v"], types, structs };
}

describe("parseSdna", () => {
  it("reads each struct's members with their offsets and sizes", () => {
    const sdna = parseSdna(
      sdnaBytes({
        names: ["*next", "co[3]", "flag"],
        types: [...BASIC_TYPES, ["float", 4], ["Thing", 21]],
        structs: [
          [
            3,
            [
              [3, 0],
              [2, 1],
              [1, 2],
            ],
          ],
        ],
      }),
      true,
      8,
    );
    expect(sdna.struct("Thing")?.fields.map((field) => [field.name, field.offset, field.size])).toEqual([
      ["next", 0, 8],
      ["co", 8, 12],
      ["flag", 20, 1],
    ]);
  });

  it("refuses members past the bytes their struct has, however large their arrays", () => {
    for (const name of ["co[3]", `co[${"9".repeat(400)}]`]) {
      const bytes = sdnaBytes({ names: [name], types: [...BASIC_TYPES, ["Thing", 2]], structs: [[2, [[1, 0]]]] });
      expect(() => parseSdna(bytes, true, 8)).toThrow(
        new BlendParseError("its SDNA struct Thing has members past its 2 bytes"),
      );
    }
  });

  it("refuses a member whose value takes no bytes, which no struct Blender writes has", () => {
    const bytes = sdnaBytes({ names: ["v", "*p"], types: [...BASIC_TYPES, ["Thing", 8]], structs: [[2, [[0, 0]]]] });
    expect(() => parseSdna(bytes, true, 8)).toThrow(
      new BlendParseError("its SDNA struct Thing has a member of no size"),
    );
    const pointer = sdnaBytes({ names: ["v", "*p"], types: [...BASIC_TYPES, ["Thing", 8]], structs: [[2, [[0, 1]]]] });
    expect(parseSdna(pointer, true, 8).struct("Thing")?.field("p")?.size).toBe(8);
  });

  it("refuses structs with far more members between them than Blender's", () => {
    expect(parseSdna(sdnaBytes(fullStructs(4)), true, 8).structs).toHaveLength(4);
    expect(() => parseSdna(sdnaBytes(fullStructs(5)), true, 8)).toThrow(
      new BlendParseError("its SDNA structs have over 262144 members"),
    );
  });

  it("refuses more structs, names or types than 16-bit indices reach", () => {
    const types: [string, number][] = [...BASIC_TYPES, ["Empty", 0]];
    const structs = (count: number): SdnaDefinition["structs"] => Array.from({ length: count }, () => [2, []]);
    expect(parseSdna(sdnaBytes({ names: [], types, structs: structs(2 ** 16) }), true, 8).structs).toHaveLength(
      2 ** 16,
    );
    expect(() => parseSdna(sdnaBytes({ names: [], types, structs: structs(2 ** 16 + 1) }), true, 8)).toThrow(
      new BlendParseError("its SDNA block lists 65537 structs"),
    );
    const names = Array.from({ length: 2 ** 16 + 1 }, () => "v");
    expect(() => parseSdna(sdnaBytes({ names, types, structs: [] }), true, 8)).toThrow(
      new BlendParseError("its SDNA block lists 65537 names"),
    );
    const manyTypes = Array.from({ length: 2 ** 16 + 1 }, (_, index): [string, number] => [`T${index}`, 1]);
    expect(() => parseSdna(sdnaBytes({ names: [], types: manyTypes, structs: [] }), true, 8)).toThrow(
      new BlendParseError("its SDNA block lists 65537 types"),
    );
  });
});
