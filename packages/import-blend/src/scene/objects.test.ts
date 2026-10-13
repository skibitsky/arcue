import { describe, expect, it } from "vitest";
import type { BlockDefinition, FieldValue, FileDefinition } from "../../test/synthetic";
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
    type: "Library",
    fields: [
      ["ID", "id"],
      ["char", "name[64]"],
      ["void", "*packedfile"],
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
    type: "CollectionChild",
    fields: [
      ["CollectionChild", "*next"],
      ["CollectionChild", "*prev"],
      ["Collection", "*collection"],
    ],
  },
  {
    type: "Collection",
    fields: [
      ["ID", "id"],
      ["ListBase", "gobject"],
      ["ListBase", "children"],
    ],
  },
  {
    type: "Scene",
    fields: [
      ["ID", "id"],
      ["Collection", "*master_collection"],
      ["Scene", "*set"],
    ],
  },
];

/** A list of `addresses` as blocks of `struct` that point at `targets` in the member `field`, at `at` onwards. */
function listBlocks(struct: string, field: string, at: bigint, targets: bigint[]): BlockDefinition[] {
  const address = (index: number) => at + BigInt(index) * 0x40n;
  return targets.map((target, index) => ({
    code: "DATA",
    struct,
    address: address(index),
    data: [
      {
        next: index + 1 < targets.length ? address(index + 1) : 0n,
        prev: index > 0 ? address(index - 1) : 0n,
        [field]: target,
      },
    ],
  }));
}

function listOf(at: bigint, count: number): Record<string, FieldValue> {
  return count > 0 ? { first: at, last: at + BigInt(count - 1) * 0x40n } : {};
}

function fileOf(blocks: BlockDefinition[]) {
  return readBlendFile(writeBlend({ header: "old", pointerSize: 8, little: true, structs: STRUCTS, blocks }));
}

/**
 * A chain of `depth` collections under the scene's, each listing the next `listed` times, with an object in the
 * last.
 */
function collectionChain(depth: number, listed: number, cycle = false): BlockDefinition[] {
  const collection = (index: number) => 0x1000000n + BigInt(index) * 0x1000n;
  return [
    {
      code: "SC",
      struct: "Scene",
      address: 0x100n,
      data: [{ id: { name: "SCScene" }, master_collection: collection(0) }],
    },
    ...Array.from({ length: depth }, (_, index) => {
      const last = index === depth - 1;
      const children = last
        ? cycle
          ? [collection(0)]
          : []
        : Array.from({ length: listed }, () => collection(index + 1));
      return [
        {
          code: index === 0 ? "DATA" : "GR",
          struct: "Collection",
          address: collection(index),
          data: [
            {
              id: { name: `GRC${index}` },
              gobject: last ? listOf(collection(index) + 0x100n, 1) : {},
              children: listOf(collection(index) + 0x200n, children.length),
            },
          ],
        },
        ...listBlocks("CollectionChild", "collection", collection(index) + 0x200n, children),
        ...(last ? listBlocks("CollectionObject", "ob", collection(index) + 0x100n, [0x900n]) : []),
      ];
    }).flat(),
    { code: "OB", struct: "Object", address: 0x900n, data: [{ id: { name: "OBDeep" } }] },
  ];
}

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

  it("walks collections that each list the next twice once per place, not once per path", () => {
    const { objects } = collectSceneObjects(fileOf(collectionChain(60, 2)));
    expect(objects.map((object) => [object.name, object.shown])).toEqual([["Deep", true]]);
  });

  it("walks a chain of collections far deeper than the call stack, and stops at a cycle", () => {
    expect(collectSceneObjects(fileOf(collectionChain(20_000, 1))).objects).toHaveLength(1);
    expect(collectSceneObjects(fileOf(collectionChain(3, 1, true))).objects).toHaveLength(1);
  });

  it("walks a collection that lists more children than a call takes arguments", { timeout: 30_000 }, () => {
    const entries = 200_000;
    const contents = collectSceneObjects(
      fileOf([
        {
          code: "SC",
          struct: "Scene",
          address: 0x100n,
          data: [{ id: { name: "SCScene" }, master_collection: 0x200n }],
        },
        { code: "DATA", struct: "Collection", address: 0x200n, data: [{ children: listOf(0x100000n, entries) }] },
        ...listBlocks("CollectionChild", "collection", 0x100000n, Array(entries).fill(0x300n)),
        { code: "GR", struct: "Collection", address: 0x300n, data: [{ gobject: listOf(0x400n, 1) }] },
        ...listBlocks("CollectionObject", "ob", 0x400n, [0x500n]),
        { code: "OB", struct: "Object", address: 0x500n, data: [{ id: { name: "OBShared" } }] },
      ]),
    );
    expect(contents.objects.map((object) => object.name)).toEqual(["Shared"]);
  });

  it("orders more children of one parent than a call takes arguments", { timeout: 30_000 }, () => {
    const children = 150_000;
    const object = (index: number) => 0x10000000n + BigInt(index) * 0x80n;
    const contents = collectSceneObjects(
      fileOf([
        {
          code: "SC",
          struct: "Scene",
          address: 0x100n,
          data: [{ id: { name: "SCScene" }, master_collection: 0x200n }],
        },
        { code: "DATA", struct: "Collection", address: 0x200n, data: [{ gobject: listOf(0x100000n, children + 1) }] },
        ...listBlocks(
          "CollectionObject",
          "ob",
          0x100000n,
          Array.from({ length: children + 1 }, (_, index) => object(index)),
        ),
        ...Array.from({ length: children + 1 }, (_, index) => ({
          code: "OB",
          struct: "Object",
          address: object(index),
          data: [{ parent: index === children ? 0n : object(children) }],
        })),
      ]),
    );
    expect(contents.objects).toHaveLength(children + 1);
    expect(contents.objects[0]?.struct.offset).toBe(contents.objects.at(-1)?.parent?.offset);
  });

  it("shows the objects of the scene's background sets, each set once", () => {
    const scene = (index: number, set: bigint) => ({
      code: "SC",
      struct: "Scene",
      address: 0x100n + BigInt(index) * 0x100n,
      data: [{ id: { name: `SCScene${index}` }, master_collection: 0x1000n + BigInt(index) * 0x100n, set }],
    });
    const collection = (index: number) => [
      {
        code: "DATA",
        struct: "Collection",
        address: 0x1000n + BigInt(index) * 0x100n,
        data: [{ gobject: listOf(0x2000n + BigInt(index) * 0x100n, 1) }],
      },
      ...listBlocks("CollectionObject", "ob", 0x2000n + BigInt(index) * 0x100n, [0x3000n + BigInt(index) * 0x100n]),
      {
        code: "OB",
        struct: "Object",
        address: 0x3000n + BigInt(index) * 0x100n,
        data: [{ id: { name: `OBObject${index}` } }],
      },
    ];
    const contents = collectSceneObjects(
      fileOf([
        scene(0, 0x200n),
        scene(1, 0x300n),
        scene(2, 0x200n),
        ...collection(0),
        ...collection(1),
        ...collection(2),
      ]),
    );
    expect(contents.objects.map((object) => [object.name, object.shown, object.hidden])).toEqual([
      ["Object0", true, false],
      ["Object1", true, false],
      ["Object2", true, false],
    ]);
  });

  it("names data from other files, and says which of those files are packed into this one", () => {
    const contents = collectSceneObjects(
      fileOf([
        {
          code: "SC",
          struct: "Scene",
          address: 0x100n,
          data: [{ id: { name: "SCScene" }, master_collection: 0x200n }],
        },
        { code: "DATA", struct: "Collection", address: 0x200n, data: [{ gobject: listOf(0x300n, 2) }] },
        ...listBlocks("CollectionObject", "ob", 0x300n, [0x500n, 0x600n]),
        { code: "LI", struct: "Library", address: 0x400n, data: [{ id: { name: "LIkit.blend" } }] },
        {
          code: "LI",
          struct: "Library",
          address: 0x480n,
          data: [{ id: { name: "LIchar.blend" }, packedfile: 0x700n }],
        },
        { code: "ID", struct: "ID", address: 0x500n, data: [{ name: "OBRock", lib: 0x400n }] },
        { code: "ID", struct: "ID", address: 0x600n, data: [{ name: "OBHero", lib: 0x480n }] },
      ]),
    );
    expect(contents.linked).toEqual([
      { kind: "objects", name: "Rock", packed: false },
      { kind: "objects", name: "Hero", packed: true },
    ]);
  });
});
