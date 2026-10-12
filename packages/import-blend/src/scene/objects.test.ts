import { describe, expect, it } from "vitest";
import type { FileDefinition } from "../../test/synthetic";
import { writeBlend } from "../../test/synthetic";
import { readBlendFile } from "../blend/file";
import { collectSceneObjects } from "./objects";

const STRUCTS: FileDefinition["structs"] = [
  {
    type: "ListBase",
    fields: [
      ["void", "*first"],
      ["void", "*last"],
    ],
  },
  {
    type: "ID",
    fields: [
      ["void", "*next"],
      ["void", "*prev"],
      ["char", "name[66]"],
      ["void", "*lib"],
    ],
  },
  {
    type: "Object",
    fields: [
      ["ID", "id"],
      ["Object", "*parent"],
    ],
  },
  {
    type: "CollectionObject",
    fields: [
      ["CollectionObject", "*next"],
      ["CollectionObject", "*prev"],
      ["Object", "*ob"],
    ],
  },
  {
    type: "Collection",
    fields: [
      ["ID", "id"],
      ["ListBase", "gobject"],
    ],
  },
  {
    type: "Scene",
    fields: [
      ["ID", "id"],
      ["Collection", "*master_collection"],
    ],
  },
];

describe("collectSceneObjects", () => {
  it("orders a chain of parents far deeper than the call stack, each parent first", () => {
    const depth = 20_000;
    const address = (index: number) => 0x100000n + BigInt(index) * 0x100n;
    const deepest = address(depth - 1);
    const bytes = writeBlend({
      header: "old",
      pointerSize: 8,
      little: true,
      structs: STRUCTS,
      blocks: [
        {
          code: "SC",
          struct: "Scene",
          address: 0x100n,
          data: [{ id: { name: "SCScene" }, master_collection: 0x200n }],
        },
        {
          code: "DATA",
          struct: "Collection",
          address: 0x200n,
          data: [{ gobject: { first: 0x300n, last: 0x300n } }],
        },
        { code: "DATA", struct: "CollectionObject", address: 0x300n, data: [{ ob: deepest }] },
        ...Array.from({ length: depth }, (_, index) => ({
          code: "OB",
          struct: "Object",
          address: address(index),
          data: [{ id: { name: `OBO${index}` }, parent: index > 0 ? address(index - 1) : 0n }],
        })),
      ],
    });
    const { objects } = collectSceneObjects(readBlendFile(bytes));
    expect(objects).toHaveLength(depth);
    expect(objects.map((object) => object.name).slice(0, 2)).toEqual(["O0", "O1"]);
    expect(objects.at(-1)).toMatchObject({ name: `O${depth - 1}`, shown: true });
  });
});
