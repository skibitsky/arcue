import { describe, expect, it, vi } from "vitest";
import type { BlockDefinition, FieldValue, FileDefinition } from "../../test/synthetic";
import { writeBlend } from "../../test/synthetic";
import { BlendFile, BlendStruct, readBlendFile } from "../blend/file";
import { datablocks } from "../blend/ids";
import { childInstancing, collectSceneObjects } from "./objects";

const ARMATURE = 25;
const ARMATURE_MODIFIER = 8;
const MODIFIER_ON_IN_VIEWPORT = 1;
const LAYER_COLLECTION_HIDE = 1 << 7;

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
      ["short", "type"],
      ["ListBase", "modifiers"],
      ["short", "transflag"],
      ["ListBase", "particlesystem"],
      ["char", "duplicator_visibility_flag"],
    ],
  },
  {
    type: "ParticleSystem",
    fields: [
      ["ParticleSystem", "*next"],
      ["ParticleSystem", "*prev"],
    ],
  },
  {
    type: "ModifierData",
    fields: [
      ["ModifierData", "*next"],
      ["ModifierData", "*prev"],
      ["int", "type"],
      ["int", "mode"],
    ],
  },
  {
    type: "ArmatureModifierData",
    fields: [
      ["ModifierData", "modifier"],
      ["Object", "*object"],
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
    type: "LayerCollection",
    fields: [
      ["LayerCollection", "*next"],
      ["LayerCollection", "*prev"],
      ["Collection", "*collection"],
      ["ListBase", "layer_collections"],
      ["short", "flag"],
    ],
  },
  {
    type: "ViewLayer",
    fields: [
      ["ViewLayer", "*next"],
      ["ViewLayer", "*prev"],
      ["ListBase", "layer_collections"],
    ],
  },
  {
    type: "Scene",
    fields: [
      ["ID", "id"],
      ["Collection", "*master_collection"],
      ["Scene", "*set"],
      ["ListBase", "view_layers"],
    ],
  },
];

/** What `read` returns, and how many structs it read through `BlendFile.first`. */
function countingFirst<T>(read: () => T): { result: T; calls: number } {
  const first = vi.spyOn(BlendFile.prototype, "first");
  try {
    const result = read();
    return { result, calls: first.mock.calls.length };
  } finally {
    first.mockRestore();
  }
}

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

  it("reads child lists that share their tails only as far as their own children", () => {
    const count = 1000;
    const collection = (index: number) => 0x1000000n + BigInt(index) * 0x100n;
    const entries = 0x100000n;
    const entry = (index: number) => entries + BigInt(index) * 0x40n;
    const file = fileOf([
      {
        code: "SC",
        struct: "Scene",
        address: 0x100n,
        data: [{ id: { name: "SCScene" }, master_collection: 0x200n }],
      },
      { code: "DATA", struct: "Collection", address: 0x200n, data: [{ children: listOf(entries, count) }] },
      ...listBlocks(
        "CollectionChild",
        "collection",
        entries,
        Array.from({ length: count }, (_, index) => collection(index)),
      ),
      ...Array.from({ length: count }, (_, index) => {
        const last = index === count - 1;
        return {
          code: "GR",
          struct: "Collection",
          address: collection(index),
          data: [
            {
              id: { name: `GRC${index}` },
              children: { first: last ? 0n : entry(index + 1) },
              gobject: last ? listOf(0x400n, 1) : {},
            },
          ],
        };
      }),
      ...listBlocks("CollectionObject", "ob", 0x400n, [0x500n]),
      { code: "OB", struct: "Object", address: 0x500n, data: [{ id: { name: "OBDeep" } }] },
    ]);
    const contents = countingFirst(() => collectSceneObjects(file));
    expect(contents.result.objects.map((object) => [object.name, object.shown])).toEqual([["Deep", true]]);
    expect(contents.calls).toBeLessThan(10 * count);
  });

  it("queues each object that shown ones need once, however many modifier lists share their tails", () => {
    const count = 1000;
    const object = (index: number) => 0x1000000n + BigInt(index) * 0x100n;
    const modifier = (index: number) => 0x2000000n + BigInt(index) * 0x100n;
    const file = fileOf([
      {
        code: "SC",
        struct: "Scene",
        address: 0x100n,
        data: [{ id: { name: "SCScene" }, master_collection: 0x200n }],
      },
      { code: "DATA", struct: "Collection", address: 0x200n, data: [{ gobject: listOf(0x300n, 1) }] },
      ...listBlocks("CollectionObject", "ob", 0x300n, [0x400n]),
      {
        code: "OB",
        struct: "Object",
        address: 0x400n,
        data: [{ id: { name: "OBBody" }, modifiers: { first: modifier(0) } }],
      },
      ...Array.from({ length: count }, (_, index): BlockDefinition[] => [
        {
          code: "OB",
          struct: "Object",
          address: object(index),
          data: [{ id: { name: `OBRig${index}` }, type: ARMATURE, modifiers: { first: modifier(index) } }],
        },
        {
          code: "DATA",
          struct: "ArmatureModifierData",
          address: modifier(index),
          data: [
            {
              modifier: {
                next: index + 1 < count ? modifier(index + 1) : 0n,
                type: ARMATURE_MODIFIER,
                mode: MODIFIER_ON_IN_VIEWPORT,
              },
              object: object(index),
            },
          ],
        },
      ]).flat(),
    ]);
    const contents = countingFirst(() => collectSceneObjects(file));
    expect(contents.result.objects).toHaveLength(count + 1);
    expect(contents.result.objects.slice(0, 3).map((object) => [object.name, object.shown])).toEqual([
      ["Body", true],
      ["Rig0", false],
      ["Rig1", false],
    ]);
    expect(contents.calls).toBeLessThan(10 * count);
  });

  it("reads object lists that share their tails only as far as each collection's own entries", () => {
    const count = 1000;
    const collection = (index: number) => 0x1000000n + BigInt(index) * 0x100n;
    const entry = (index: number) => 0x2000000n + BigInt(index) * 0x40n;
    const object = (index: number) => 0x3000000n + BigInt(index) * 0x100n;
    const file = fileOf([
      {
        code: "SC",
        struct: "Scene",
        address: 0x100n,
        data: [{ id: { name: "SCScene" }, master_collection: 0x200n }],
      },
      { code: "DATA", struct: "Collection", address: 0x200n, data: [{ children: listOf(0x100000n, count) }] },
      ...listBlocks(
        "CollectionChild",
        "collection",
        0x100000n,
        Array.from({ length: count }, (_, index) => collection(index)),
      ),
      ...Array.from({ length: count }, (_, index): BlockDefinition[] => [
        {
          code: "GR",
          struct: "Collection",
          address: collection(index),
          data: [{ id: { name: `GRC${index}` }, gobject: { first: entry(index) } }],
        },
        {
          code: "DATA",
          struct: "CollectionObject",
          address: entry(index),
          data: [{ next: index + 1 < count ? entry(index + 1) : 0n, ob: object(index) }],
        },
        { code: "OB", struct: "Object", address: object(index), data: [{ id: { name: `OBO${index}` } }] },
      ]).flat(),
    ]);
    const contents = countingFirst(() => collectSceneObjects(file));
    expect(contents.result.objects.map((found) => found.name)).toEqual(
      Array.from({ length: count }, (_, index) => `O${index}`),
    );
    expect(contents.calls).toBeLessThan(10 * count);
  });

  it("reads layer collection lists that share their tails only as far as each layer's own children", () => {
    const count = 1000;
    const collection = (index: number) => 0x1000000n + BigInt(index) * 0x100n;
    const layer = (index: number) => 0x2000000n + BigInt(index) * 0x100n;
    const file = fileOf([
      {
        code: "SC",
        struct: "Scene",
        address: 0x100n,
        data: [{ id: { name: "SCScene" }, master_collection: 0x200n, view_layers: listOf(0x400n, 1) }],
      },
      {
        code: "DATA",
        struct: "Collection",
        address: 0x200n,
        data: [{ children: listOf(0x100000n, count), gobject: listOf(0x300n, 1) }],
      },
      ...listBlocks("CollectionObject", "ob", 0x300n, [0x900n]),
      { code: "OB", struct: "Object", address: 0x900n, data: [{ id: { name: "OBShown" } }] },
      { code: "DATA", struct: "ViewLayer", address: 0x400n, data: [{ layer_collections: listOf(0x500n, 1) }] },
      {
        code: "DATA",
        struct: "LayerCollection",
        address: 0x500n,
        data: [{ collection: 0x200n, layer_collections: { first: layer(0) } }],
      },
      ...listBlocks(
        "CollectionChild",
        "collection",
        0x100000n,
        Array.from({ length: count }, (_, index) => collection(index)),
      ),
      ...Array.from({ length: count }, (_, index): BlockDefinition[] => [
        { code: "GR", struct: "Collection", address: collection(index), data: [{ id: { name: `GRC${index}` } }] },
        {
          code: "DATA",
          struct: "LayerCollection",
          address: layer(index),
          data: [
            {
              next: index + 1 < count ? layer(index + 1) : 0n,
              collection: collection(index),
              layer_collections: { first: index + 1 < count ? layer(index + 1) : 0n },
            },
          ],
        },
      ]).flat(),
    ]);
    const contents = countingFirst(() => collectSceneObjects(file));
    expect(contents.result.objects.map((found) => [found.name, found.shown])).toEqual([["Shown", true]]);
    expect(contents.calls).toBeLessThan(10 * count);
  });

  it("finds each object's particle systems without reading lists that share their tails", () => {
    const count = 1000;
    const object = (index: number) => 0x1000000n + BigInt(index) * 0x100n;
    const system = (index: number) => 0x2000000n + BigInt(index) * 0x40n;
    const file = fileOf([
      {
        code: "SC",
        struct: "Scene",
        address: 0x100n,
        data: [{ id: { name: "SCScene" }, master_collection: 0x200n }],
      },
      { code: "DATA", struct: "Collection", address: 0x200n, data: [{ gobject: listOf(0x100000n, count + 1) }] },
      ...listBlocks(
        "CollectionObject",
        "ob",
        0x100000n,
        Array.from({ length: count + 1 }, (_, index) => object(index)),
      ),
      ...Array.from({ length: count + 1 }, (_, index): BlockDefinition[] => [
        {
          code: "OB",
          struct: "Object",
          address: object(index),
          data: [{ id: { name: `OBO${index}` }, particlesystem: { first: index < count ? system(index) : 0n } }],
        },
        ...(index < count
          ? [
              {
                code: "DATA",
                struct: "ParticleSystem",
                address: system(index),
                data: [{ next: index + 1 < count ? system(index + 1) : 0n }],
              },
            ]
          : []),
      ]).flat(),
    ]);
    const contents = countingFirst(() => collectSceneObjects(file));
    expect(contents.result.objects.map((found) => found.instancerHidden)).toEqual([...Array(count).fill(true), false]);
    expect(contents.calls).toBeLessThan(10 * count);
  });

  it("shows a collection's objects unhidden where any of its places is, whichever place comes first", () => {
    const hide = (hidden: boolean) => (hidden ? LAYER_COLLECTION_HIDE : 0);
    const placed = (firstHidden: boolean) =>
      fileOf([
        {
          code: "SC",
          struct: "Scene",
          address: 0x100n,
          data: [{ id: { name: "SCScene" }, master_collection: 0x200n, view_layers: listOf(0x1000n, 1) }],
        },
        { code: "DATA", struct: "Collection", address: 0x200n, data: [{ children: listOf(0x300n, 2) }] },
        ...listBlocks("CollectionChild", "collection", 0x300n, [0x400n, 0x500n]),
        ...[0x400n, 0x500n].flatMap((parent, index): BlockDefinition[] => [
          {
            code: "GR",
            struct: "Collection",
            address: parent,
            data: [{ id: { name: `GRParent${index}` }, children: listOf(parent + 0x10000n, 1) }],
          },
          ...listBlocks("CollectionChild", "collection", parent + 0x10000n, [0x600n]),
        ]),
        {
          code: "GR",
          struct: "Collection",
          address: 0x600n,
          data: [{ id: { name: "GRShared" }, gobject: listOf(0x700n, 1) }],
        },
        ...listBlocks("CollectionObject", "ob", 0x700n, [0x800n]),
        { code: "OB", struct: "Object", address: 0x800n, data: [{ id: { name: "OBShared" } }] },
        { code: "DATA", struct: "ViewLayer", address: 0x1000n, data: [{ layer_collections: listOf(0x1100n, 1) }] },
        {
          code: "DATA",
          struct: "LayerCollection",
          address: 0x1100n,
          data: [{ collection: 0x200n, layer_collections: listOf(0x1200n, 2) }],
        },
        ...[0x400n, 0x500n].map(
          (parent, index): BlockDefinition => ({
            code: "DATA",
            struct: "LayerCollection",
            address: 0x1200n + BigInt(index) * 0x40n,
            data: [
              {
                next: index === 0 ? 0x1240n : 0n,
                collection: parent,
                flag: hide(firstHidden === (index === 0)),
                layer_collections: listOf(0x1400n + BigInt(index) * 0x40n, 1),
              },
            ],
          }),
        ),
        ...[0, 1].map(
          (index): BlockDefinition => ({
            code: "DATA",
            struct: "LayerCollection",
            address: 0x1400n + BigInt(index) * 0x40n,
            data: [{ collection: 0x600n }],
          }),
        ),
      ]);
    for (const firstHidden of [true, false]) {
      const { objects } = collectSceneObjects(placed(firstHidden));
      expect(objects.map((object) => [object.name, object.hidden])).toEqual([["Shared", false]]);
    }
  });

  it("orders the objects shown ones need by the first path that reaches each, parents before Armature targets", () => {
    const address = { Shown: 0x400n, Parent: 0x500n, Above: 0x600n, Top: 0x700n, Rig: 0x800n };
    const object = (name: string, members: Record<string, FieldValue>): BlockDefinition => ({
      code: "OB",
      struct: "Object",
      address: address[name as keyof typeof address],
      data: [{ id: { name: `OB${name}` }, ...members }],
    });
    const armatureTarget = (at: bigint, next: bigint, target: bigint): BlockDefinition => ({
      code: "DATA",
      struct: "ArmatureModifierData",
      address: at,
      data: [{ modifier: { next, type: ARMATURE_MODIFIER, mode: MODIFIER_ON_IN_VIEWPORT }, object: target }],
    });
    const file = fileOf([
      {
        code: "SC",
        struct: "Scene",
        address: 0x100n,
        data: [{ id: { name: "SCScene" }, master_collection: 0x200n }],
      },
      { code: "DATA", struct: "Collection", address: 0x200n, data: [{ gobject: listOf(0x300n, 1) }] },
      ...listBlocks("CollectionObject", "ob", 0x300n, [address.Shown]),
      object("Shown", { parent: address.Parent }),
      object("Parent", { parent: address.Above, modifiers: { first: 0x1000n, last: 0x1100n } }),
      armatureTarget(0x1000n, 0x1100n, address.Rig),
      armatureTarget(0x1100n, 0n, address.Top),
      object("Above", { parent: address.Top }),
      object("Top", { type: ARMATURE }),
      object("Rig", { type: ARMATURE }),
    ]);
    expect(collectSceneObjects(file).objects.map((found) => found.name)).toEqual([
      "Top",
      "Above",
      "Parent",
      "Shown",
      "Rig",
    ]);
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

const GEOMETRY_SOCKET = 10;
const NODES_MODIFIER = 57;
const INSTANCES_ON_VERTICES = 1 << 4;

/** A mesh object with a Geometry Nodes modifier and the node groups it runs, with only the members the reader takes. */
const INSTANCER_STRUCTS: FileDefinition["structs"] = [
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
      ["char", "name[66]"],
      ["void", "*lib"],
    ],
  },
  {
    type: "Mesh",
    fields: [
      ["ID", "id"],
      ["int", "totvert"],
      ["int", "totpoly"],
    ],
  },
  {
    type: "ModifierData",
    fields: [
      ["ModifierData", "*next"],
      ["ModifierData", "*prev"],
      ["int", "type"],
      ["int", "mode"],
    ],
  },
  {
    type: "NodesModifierBake",
    fields: [
      ["int", "id"],
      ["void", "*packed"],
    ],
  },
  { type: "Byte", fields: [["char", "value"]] },
  {
    type: "NodesModifierData",
    fields: [
      ["ModifierData", "modifier"],
      ["bNodeTree", "*node_group"],
      ["int", "bakes_num"],
      ["NodesModifierBake", "*bakes"],
    ],
  },
  {
    type: "Object",
    fields: [
      ["ID", "id"],
      ["short", "type"],
      ["int", "transflag"],
      ["Mesh", "*data"],
      ["ListBase", "modifiers"],
    ],
  },
  {
    type: "bNodeSocket",
    fields: [
      ["bNodeSocket", "*next"],
      ["bNodeSocket", "*prev"],
      ["short", "type"],
      ["int", "flag"],
    ],
  },
  {
    type: "bNode",
    fields: [
      ["bNode", "*next"],
      ["bNode", "*prev"],
      ["char", "idname[32]"],
      ["int", "flag"],
      ["ID", "*id"],
      ["ListBase", "inputs"],
      ["ListBase", "outputs"],
    ],
  },
  {
    type: "bNodeLink",
    fields: [
      ["bNodeLink", "*next"],
      ["bNodeLink", "*prev"],
      ["bNode", "*fromnode"],
      ["bNode", "*tonode"],
      ["bNodeSocket", "*fromsock"],
      ["bNodeSocket", "*tosock"],
      ["int", "flag"],
    ],
  },
  {
    type: "bNodeTree",
    fields: [
      ["ID", "id"],
      ["ListBase", "nodes"],
      ["ListBase", "links"],
    ],
  },
];

function groupAt(index: number): bigint {
  return 0x1000000n + BigInt(index) * 0x100n;
}

/**
 * `count` node groups, each of whose Group Output reads a Group node that runs the next group, and the last's a node
 * of type `last`.
 */
function nodeGroupChain(count: number, last: string): BlockDefinition[] {
  return Array.from({ length: count }, (_, index): BlockDefinition[] => {
    const at = groupAt(index);
    const output = at + 0x10n;
    const source = at + 0x20n;
    const input = at + 0x30n;
    const geometry = at + 0x40n;
    const link = at + 0x50n;
    const inner = index + 1 < count;
    return [
      {
        code: "NT",
        struct: "bNodeTree",
        address: at,
        data: [{ id: { name: `NTGroup${index}` }, nodes: { first: output, last: source }, links: { first: link } }],
      },
      {
        code: "DATA",
        struct: "bNode",
        address: output,
        data: [{ next: source, idname: "NodeGroupOutput", inputs: { first: input, last: input } }],
      },
      {
        code: "DATA",
        struct: "bNode",
        address: source,
        data: [
          {
            prev: output,
            idname: inner ? "GeometryNodeGroup" : last,
            id: inner ? groupAt(index + 1) : 0n,
            outputs: { first: geometry, last: geometry },
          },
        ],
      },
      { code: "DATA", struct: "bNodeSocket", address: input, data: [{ type: GEOMETRY_SOCKET }] },
      { code: "DATA", struct: "bNodeSocket", address: geometry, data: [{ type: GEOMETRY_SOCKET }] },
      {
        code: "DATA",
        struct: "bNodeLink",
        address: link,
        data: [{ fromnode: source, tonode: output, fromsock: geometry, tosock: input }],
      },
    ];
  }).flat();
}

/**
 * A mesh object with vertices that places its children on them, and a Geometry Nodes modifier with `members` that
 * runs the first of `groups`. `modifierData` follows the modifier.
 */
function instancer(
  members: Record<string, FieldValue>,
  modifierData: BlockDefinition[],
  groups: BlockDefinition[],
): BlendStruct {
  const bytes = writeBlend({
    header: "old",
    pointerSize: 8,
    little: true,
    structs: INSTANCER_STRUCTS,
    blocks: [
      {
        code: "OB",
        struct: "Object",
        address: 0x100n,
        data: [
          {
            id: { name: "OBScatter" },
            type: 1,
            transflag: INSTANCES_ON_VERTICES,
            data: 0x200n,
            modifiers: { first: 0x300n, last: 0x300n },
          },
        ],
      },
      {
        code: "DATA",
        struct: "NodesModifierData",
        address: 0x300n,
        data: [
          { modifier: { type: NODES_MODIFIER, mode: MODIFIER_ON_IN_VIEWPORT }, node_group: groupAt(0), ...members },
        ],
      },
      ...modifierData,
      { code: "ME", struct: "Mesh", address: 0x200n, data: [{ id: { name: "MEPoints" }, totvert: 3 }] },
      ...groups,
    ],
  });
  const [object] = datablocks(readBlendFile(bytes), "OB");
  if (!object) throw new Error("The synthetic file has no object.");
  return object;
}

describe("childInstancing", () => {
  it("follows Geometry Nodes groups nested far deeper than the call stack", { timeout: 30_000 }, () => {
    const depth = 20_000;
    expect(childInstancing(instancer({}, [], nodeGroupChain(depth, "GeometryNodeInstanceOnPoints")))).toBeNull();
    expect(childInstancing(instancer({}, [], nodeGroupChain(depth, "GeometryNodeSetPosition")))).toBe("vertex");
  });

  it("looks for a packed bake only among the bakes the modifier counts", () => {
    const bakes: BlockDefinition[] = [
      {
        code: "DATA",
        struct: "NodesModifierBake",
        address: 0x400n,
        data: [{ id: 1 }, { id: 2 }, { id: 3, packed: 0x500n }],
      },
      { code: "DATA", struct: "Byte", address: 0x500n, data: [{ value: 1 }] },
    ];
    const baking = nodeGroupChain(1, "GeometryNodeBake");
    expect(childInstancing(instancer({ bakes_num: 2, bakes: 0x400n }, bakes, baking))).toBe("vertex");
    expect(childInstancing(instancer({ bakes_num: 3, bakes: 0x400n }, bakes, baking))).toBeNull();
  });

  it("reads bakes of one byte each as no bakes, without reading each byte as a struct", () => {
    const count = 200_000;
    const object = instancer(
      { bakes_num: count, bakes: 0x400n },
      [{ code: "DATA", struct: "Byte", address: 0x400n, data: Array.from({ length: count }, () => ({ value: 1 })) }],
      nodeGroupChain(1, "GeometryNodeBake"),
    );
    const pointer = vi.spyOn(BlendStruct.prototype, "pointer");
    expect(childInstancing(object)).toBe("vertex");
    expect(pointer.mock.calls.length).toBeLessThan(1_000);
    pointer.mockRestore();
  });
});
