import { MAX_NODE_DEPTH } from "@arcue/scene";
import { describe, expect, it, vi } from "vitest";
import { importBytes, readFixture, VERSIONS } from "../../test/fixtures";
import type { BlockDefinition, FieldValue, FileDefinition } from "../../test/synthetic";
import { writeBlend } from "../../test/synthetic";
import { decompressBlend } from "../blend/decompress";
import { BlendLimitError } from "../blend/errors";
import type { BlendStruct } from "../blend/file";
import { readBlendFile } from "../blend/file";
import { idName } from "../blend/ids";
import type { Mat4 } from "../math";
import { compose, decompose, multiply } from "../math";
import type { BuiltScene } from "./build";
import { buildScene, grayCandidates, linkedDataWarning, shownMeshSlots } from "./build";
import { buildMesh } from "./mesh-build";
import { CustomDataType, MAX_CORNERS_PER_KEYED_VERTEX } from "./mesh-data";
import { collectSceneObjects } from "./objects";

vi.mock("./mesh-build", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./mesh-build")>();
  return { ...actual, buildMesh: vi.fn(actual.buildMesh) };
});

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
    type: "CustomDataLayer",
    fields: [
      ["int", "type"],
      ["char", "name[64]"],
      ["void", "*data"],
    ],
  },
  {
    type: "CustomData",
    fields: [
      ["CustomDataLayer", "*layers"],
      ["int", "totlayer"],
    ],
  },
  {
    type: "MVert",
    fields: [
      ["float", "co[3]"],
      ["int", "flag"],
    ],
  },
  {
    type: "MEdge",
    fields: [
      ["int", "v1"],
      ["int", "v2"],
    ],
  },
  {
    type: "MPoly",
    fields: [
      ["int", "loopstart"],
      ["int", "totloop"],
    ],
  },
  {
    type: "MLoop",
    fields: [
      ["int", "v"],
      ["int", "e"],
    ],
  },
  {
    type: "KeyBlock",
    fields: [
      ["KeyBlock", "*next"],
      ["KeyBlock", "*prev"],
      ["char", "name[64]"],
      ["void", "*data"],
      ["int", "totelem"],
      ["int", "relative"],
      ["float", "curval"],
      ["float", "slidermin"],
      ["float", "slidermax"],
      ["short", "flag"],
    ],
  },
  {
    type: "Key",
    fields: [
      ["ID", "id"],
      ["KeyBlock", "*refkey"],
      ["ListBase", "block"],
      ["int", "type"],
    ],
  },
  {
    type: "Mesh",
    fields: [
      ["ID", "id"],
      ["Key", "*key"],
      ["CustomData", "vdata"],
      ["CustomData", "edata"],
      ["CustomData", "pdata"],
      ["CustomData", "ldata"],
      ["int", "totvert"],
      ["int", "totedge"],
      ["int", "totpoly"],
      ["int", "totloop"],
      ["int", "totcol"],
      ["void", "**mat"],
    ],
  },
  {
    type: "Material",
    fields: [["ID", "id"]],
  },
  {
    type: "Object",
    fields: [
      ["ID", "id"],
      ["Object", "*parent"],
      ["void", "*data"],
      ["short", "type"],
      ["short", "partype"],
      ["int", "par1"],
      ["int", "par2"],
      ["int", "par3"],
      ["float", "parentinv[4][4]"],
      ["float", "loc[3]"],
      ["float", "rot[3]"],
      ["float", "size[3]"],
      ["short", "rotmode"],
      ["short", "shapeflag"],
      ["short", "shapenr"],
      ["int", "totcol"],
      ["void", "**mat"],
      ["char", "*matbits"],
    ],
  },
  {
    type: "Bone",
    fields: [
      ["Bone", "*next"],
      ["Bone", "*prev"],
      ["char", "name[64]"],
      ["ListBase", "childbase"],
      ["float", "arm_mat[4][4]"],
    ],
  },
  {
    type: "bArmature",
    fields: [
      ["ID", "id"],
      ["ListBase", "bonebase"],
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

const OBJECT_MESH = 1;
const ARMATURE = 25;
const XYZ_EULER = 1;
const MESH_ADDRESS = 0x1000n;

/** A column-major matrix from the rows Blender's Python prints. */
function rows(...values: number[][]): number[] {
  return [0, 1, 2, 3].flatMap((column) => values.map((row) => row[column] ?? 0));
}

/**
 * A mesh as Blender before 3.6 stored one, with `copies` faces on `face` and shape keys of the vertices moved by each.
 */
function meshBlocks(
  vertices: number[][],
  face: number[],
  keys: { name: string; offsets: number[][]; value?: number; flag?: number; relative?: number }[] = [],
  copies = 1,
): BlockDefinition[] {
  const at = (offset: number) => MESH_ADDRESS + BigInt(offset);
  const layer = (address: bigint, type: number, data: bigint): BlockDefinition => ({
    code: "DATA",
    struct: "CustomDataLayer",
    address,
    data: [{ type, data }],
  });
  const keyBlocks = keys.map((key, index) => ({
    code: "DATA",
    struct: "KeyBlock",
    address: at(0x800 + index * 0x100),
    data: [
      {
        next: index + 1 < keys.length ? at(0x800 + (index + 1) * 0x100) : 0n,
        prev: index > 0 ? at(0x800 + (index - 1) * 0x100) : 0n,
        name: key.name,
        data: at(0x880 + index * 0x100),
        totelem: vertices.length,
        relative: key.relative ?? 0,
        curval: key.value ?? 0,
        slidermax: 1,
        flag: key.flag ?? 0,
      },
    ],
  }));
  const keyData = keys.map((key, index) => ({
    code: "DATA",
    struct: null,
    address: at(0x880 + index * 0x100),
    data: new Uint8Array(
      Float32Array.from(vertices.flatMap((vertex, v) => vertex.map((value, k) => value + (key.offsets[v]?.[k] ?? 0))))
        .buffer,
    ),
  }));
  const blocks: BlockDefinition[] = [
    {
      code: "ME",
      struct: "Mesh",
      address: MESH_ADDRESS,
      data: [
        {
          id: { name: "MEPlateMesh" },
          key: keys.length > 0 ? at(0x700) : 0n,
          vdata: { layers: at(0x10), totlayer: 1 },
          edata: { layers: at(0x20), totlayer: 1 },
          pdata: { layers: at(0x30), totlayer: 1 },
          ldata: { layers: at(0x40), totlayer: 1 },
          totvert: vertices.length,
          totedge: face.length,
          totpoly: copies,
          totloop: face.length * copies,
        },
      ],
    },
    layer(at(0x10), CustomDataType.vertex, at(0x100)),
    layer(at(0x20), CustomDataType.edge, at(0x200)),
    layer(at(0x30), CustomDataType.face, at(0x300)),
    layer(at(0x40), CustomDataType.loop, at(0x400)),
    { code: "DATA", struct: "MVert", address: at(0x100), data: vertices.map((co) => ({ co })) },
    {
      code: "DATA",
      struct: "MEdge",
      address: at(0x200),
      data: face.map((vertex, corner) => ({ v1: vertex, v2: face[(corner + 1) % face.length] ?? 0 })),
    },
    {
      code: "DATA",
      struct: "MPoly",
      address: at(0x300),
      data: Array.from({ length: copies }, (_, copy) => ({ loopstart: copy * face.length, totloop: face.length })),
    },
    {
      code: "DATA",
      struct: "MLoop",
      address: at(0x400),
      data: Array.from({ length: copies }, () => face.map((vertex, corner) => ({ v: vertex, e: corner }))).flat(),
    },
    ...keyBlocks,
    ...keyData,
  ];
  if (keys.length > 0) {
    blocks.push({
      code: "KE",
      struct: "Key",
      address: at(0x700),
      data: [
        {
          id: { name: "KEKey" },
          refkey: at(0x800),
          block: { first: at(0x800), last: at(0x800 + (keys.length - 1) * 0x100) },
          type: 1,
        },
      ],
    });
  }
  return blocks;
}

/** A file whose scene collection holds `objects`, each a record of Object members, at their own addresses. */
function sceneFile(objects: Record<string, FieldValue>[], more: BlockDefinition[] = []): Uint8Array {
  const objectAddress = (index: number) => 0x100000n + BigInt(index) * 0x100n;
  const entryAddress = (index: number) => 0x10000000n + BigInt(index) * 0x40n;
  return writeBlend({
    header: "old",
    pointerSize: 8,
    little: true,
    version: "300",
    structs: STRUCTS,
    blocks: [
      { code: "SC", struct: "Scene", address: 0x100n, data: [{ id: { name: "SCScene" }, master_collection: 0x200n }] },
      {
        code: "DATA",
        struct: "Collection",
        address: 0x200n,
        data: [{ gobject: { first: entryAddress(0), last: entryAddress(objects.length - 1) } }],
      },
      ...objects.map((_, index) => ({
        code: "DATA",
        struct: "CollectionObject",
        address: entryAddress(index),
        data: [
          {
            next: index + 1 < objects.length ? entryAddress(index + 1) : 0n,
            prev: index > 0 ? entryAddress(index - 1) : 0n,
            ob: objectAddress(index),
          },
        ],
      })),
      ...objects.map((object, index) => ({
        code: "OB",
        struct: "Object",
        address: objectAddress(index),
        data: [{ size: [1, 1, 1], parentinv: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], ...object }],
      })),
      ...more,
    ],
  });
}

function objectAt(index: number): bigint {
  return 0x100000n + BigInt(index) * 0x100n;
}

/** Each node's rest world matrix in Blender's space as the scene's TRS nodes give it, which drop any shear. */
function nodeWorlds(scene: BuiltScene): Map<string, Mat4> {
  const worlds: Mat4[] = [];
  for (const node of scene.nodes) {
    const local = compose(decompose(node.rest));
    const parent = node.parent >= 0 ? worlds[node.parent] : undefined;
    worlds.push(parent ? multiply(parent, local) : local);
  }
  return new Map(scene.nodes.map((node, index) => [node.name, worlds[index] ?? node.rest]));
}

/** The name of each node's parent, or null for a root. */
function parentNames(scene: BuiltScene): Map<string, string | null> {
  return new Map(scene.nodes.map((node) => [node.name, scene.nodes[node.parent]?.name ?? null]));
}

function expectPoints(actual: ArrayLike<number> | undefined, expected: number[]): void {
  expect(actual?.length).toBe(expected.length);
  for (const [index, value] of expected.entries()) expect(actual?.[index]).toBeCloseTo(value, 5);
}

function expectMatrix(actual: Mat4 | undefined, expected: number[]): void {
  expect(actual).toBeDefined();
  for (const [index, value] of expected.entries()) expect(actual?.[index]).toBeCloseTo(value, 5);
}

/** The plate of scenes made in Blender 5.2: a quad with a loose vertex, turned and stretched. */
const PLATE_VERTICES = [
  [0, 0, 0],
  [1, 0, 0],
  [1, 1, 0.3],
  [0, 1, 0.5],
  [0.5, 0.5, 1],
];
const PLATE = {
  id: { name: "OBPlate" },
  type: OBJECT_MESH,
  data: MESH_ADDRESS,
  loc: [1, 2, 0],
  rot: [0.4, 0.2, 0.9],
  size: [2, 1, 1],
  rotmode: XYZ_EULER,
};

describe("buildScene", () => {
  it("reads and builds a mesh once for all the objects that share it, placing each where it is", () => {
    const bytes = sceneFile(
      [PLATE, { id: { name: "OBCopy" }, type: OBJECT_MESH, data: MESH_ADDRESS, loc: [5, 0, 0] }],
      meshBlocks(PLATE_VERTICES, [0, 1, 2, 3]),
    );
    const { meshes } = buildScene(readBlendFile(bytes));
    const [plate, copy] = meshes;
    expect(meshes.map((mesh) => mesh.name)).toEqual(["Plate", "Copy"]);
    expect(copy?.positions).toBe(plate?.positions);
    expect(copy?.indices).toBe(plate?.indices);
    expect(copy?.sourceVertex).toBe(plate?.sourceVertex);
    expectPoints(copy?.restPositions.subarray(3, 6), [6, 0, 0]);
    expectPoints(plate?.restPositions.subarray(0, 3), [1, 0, -2]);
  });

  describe("with objects parented to one vertex or three", () => {
    /** Pin follows Plate's vertex 3 and Tri its vertices 0, 1 and 2, as Make Vertex Parent left them. */
    const evenChildren: Record<string, FieldValue>[] = [
      {
        id: { name: "OBPin" },
        parent: objectAt(0),
        partype: 5,
        par1: 3,
        loc: [3, -1, 2],
        rot: [0.2, 0.5, 0.1],
        rotmode: XYZ_EULER,
        parentinv: rows(
          [1, 0, 0, -0.3039900064468384],
          [0, 1, 0, -2.87566876411438],
          [0, 0, 1, -1.249509572982788],
          [0, 0, 0, 1],
        ),
      },
      {
        id: { name: "OBTri" },
        parent: objectAt(0),
        partype: 6,
        par1: 0,
        par2: 1,
        par3: 2,
        loc: [-1, 0.5, 1],
        rot: [0.3, 0, 0.1],
        rotmode: XYZ_EULER,
        parentinv: rows(
          [0.4061461091041565, 0.5118083357810974, -0.13244619965553284, -2.0964291095733643],
          [-0.3497752547264099, 0.38538119196891785, 0.41663289070129395, -0.7689972519874573],
          [0.3964177370071411, -0.18433113396167755, 0.5033084750175476, -0.027755385264754295],
          [0, 0, 0, 1],
        ),
      },
    ];
    const evenPlate = { ...PLATE, size: [1.5, 1.5, 1.5] };
    const pinWorld = (x: number, y: number, z: number) =>
      rows(
        [0.8731983304023743, -0.003072083229199052, 0.48735541105270386, x],
        [0.08761207014322281, 0.9846791625022888, -0.1507681906223297, y],
        [-0.4794255495071411, 0.17434874176979065, 0.8600893616676331, z],
        [0, 0, 0, 1],
      );
    const triWorld = (x: number, y: number, z: number) =>
      rows(
        [0.9950041770935059, -0.09537448734045029, 0.02950281836092472, x],
        [0.09983345866203308, 0.9505637288093567, -0.29404380917549133, y],
        [2.5190534103103346e-8, 0.295520156621933, 0.9553365111351013, z],
        [0, 0, 0, 1],
      );
    const vertexParentDetails = (scene: BuiltScene) =>
      scene.warnings
        .filter((warning) => warning.message.startsWith("Vertex parent") || warning.message.startsWith("Shear"))
        .map((warning) => [warning.code, warning.message, warning.detail]);

    it("hangs them from a parent of even scale and places them where Blender 5.2 does at rest", () => {
      const scene = buildScene(
        readBlendFile(sceneFile([evenPlate, ...evenChildren], meshBlocks(PLATE_VERTICES, [0, 1, 2, 3]))),
      );
      const worlds = nodeWorlds(scene);
      expectMatrix(worlds.get("Pin"), pinWorld(3, -1, 2));
      expectMatrix(worlds.get("Tri"), triWorld(-1, 0.5, 1));
      expect(parentNames(scene)).toEqual(
        new Map([
          ["Plate", null],
          ["Pin", "Plate"],
          ["Tri", "Plate"],
        ]),
      );
      const keeps = "It keeps its rest offset from Plate instead of following its vertices";
      expect(vertexParentDetails(scene)).toEqual([
        ["deform-approximated", "Vertex parent not followed: Pin", keeps],
        ["deform-approximated", "Vertex parent not followed: Tri", keeps],
      ]);
    });

    it("places them at the vertices as the parent's shape keys move them, as Blender 5.2 does", () => {
      const lift = { name: "Lift", offsets: PLATE_VERTICES.map(() => [0, 0, 2]), value: 0.5 };
      const keys = [{ name: "Basis", offsets: [] }, lift];
      const bytes = sceneFile([evenPlate, ...evenChildren], meshBlocks(PLATE_VERTICES, [0, 1, 2, 3], keys));
      const worlds = nodeWorlds(buildScene(readBlendFile(bytes)));
      expectMatrix(worlds.get("Pin"), pinWorld(3.6281821727752686, -1.1480920314788818, 3.3540515899658203));
      expectMatrix(worlds.get("Tri"), triWorld(-0.37181758880615234, 0.3519083857536316, 2.3540515899658203));
    });

    it("hangs them from the root where the parent's uneven scale would shear them, since Blender leaves it out", () => {
      const bytes = sceneFile(
        [
          PLATE,
          {
            id: { name: "OBPin" },
            parent: objectAt(0),
            partype: 5,
            par1: 3,
            loc: [3, -1, 2],
            parentinv: rows(
              [1, 0, 0, -0.5359933376312256],
              [0, 1, 0, -2.5837790966033936],
              [0, 0, 1, -0.8330064415931702],
              [0, 0, 0, 1],
            ),
          },
          {
            id: { name: "OBTri" },
            parent: objectAt(0),
            partype: 6,
            par1: 0,
            par2: 1,
            par3: 2,
            loc: [-1, 0.5, 1],
            rot: [0.3, 0, 0.1],
            rotmode: XYZ_EULER,
            parentinv: rows(
              [0.30460959672927856, 0.38385626673698425, -0.09933464229106903, -1.7389888763427734],
              [-0.524662971496582, 0.5780718326568604, 0.6249493956565857, -0.9794909954071045],
              [0.5946266055107117, -0.2764967083930969, 0.7549628019332886, -0.04163314774632454],
              [0, 0, 0, 1],
            ),
          },
        ],
        meshBlocks(PLATE_VERTICES, [0, 1, 2, 3]),
      );
      const scene = buildScene(readBlendFile(bytes));
      const worlds = nodeWorlds(scene);
      expectMatrix(worlds.get("Pin"), rows([1, 0, 0, 3], [0, 1, 0, -1], [0, 0, 1, 2], [0, 0, 0, 1]));
      expectMatrix(
        worlds.get("Tri"),
        rows(
          [0.9950042963027954, -0.09537450224161148, 0.02950282208621502, -1.0000001192092896],
          [0.0998334214091301, 0.9505637884140015, -0.2940438389778137, 0.4999997615814209],
          [-3.2628701518433445e-8, 0.29552018642425537, 0.9553365111351013, 1.0],
          [0, 0, 0, 1],
        ),
      );
      expect(parentNames(scene).get("Pin")).toBeNull();
      expect(parentNames(scene).get("Tri")).toBeNull();
      const stays = "It stays where it is at rest instead of following the vertices of Plate";
      expect(vertexParentDetails(scene)).toEqual([
        ["deform-approximated", "Vertex parent not followed: Pin", stays],
        ["deform-approximated", "Vertex parent not followed: Tri", stays],
      ]);
    });

    it("puts one parented to a vertex the mesh lacks at the parent's origin, as Blender does", () => {
      const bytes = sceneFile(
        [PLATE, { id: { name: "OBPin" }, parent: objectAt(0), partype: 5, par1: 99 }],
        meshBlocks(PLATE_VERTICES, [0, 1, 2, 3]),
      );
      expectMatrix(
        nodeWorlds(buildScene(readBlendFile(bytes))).get("Pin"),
        rows([1, 0, 0, 1], [0, 1, 0, 2], [0, 0, 1, 0], [0, 0, 0, 1]),
      );
    });
  });

  it("nests as many objects as it may, and refuses a scene that nests more", { timeout: 30_000 }, () => {
    const parentChain = (length: number, cycle: boolean) =>
      readBlendFile(
        sceneFile(
          Array.from({ length }, (_, index) => ({
            id: { name: `OBO${index}` },
            parent: index > 0 || cycle ? objectAt((index + length - 1) % length) : 0n,
            loc: [1, 0, 0],
          })),
        ),
      );
    const tooDeep = new BlendLimitError(
      `nests objects and bones more than ${MAX_NODE_DEPTH} levels deep, more than Arcue can show`,
    );
    for (const cycle of [false, true]) {
      const nodes = buildScene(parentChain(MAX_NODE_DEPTH, cycle)).nodes;
      expect(nodes.map((node) => node.parent)).toEqual(nodes.map((_, index) => index - 1));
      expect(() => buildScene(parentChain(MAX_NODE_DEPTH + 1, cycle))).toThrow(tooDeep);
    }
    expect(() => buildScene(parentChain(20_000, true))).toThrow(tooDeep);
  });

  it("counts an armature's bones among the levels a scene nests", async () => {
    const armatureAt = 0x2000000n;
    const boneAt = (index: number) => 0x3000000n + BigInt(index) * 0x100n;
    const rig = (bones: number) =>
      sceneFile(
        [{ id: { name: "OBRig" }, type: ARMATURE, data: armatureAt }],
        [
          {
            code: "AR",
            struct: "bArmature",
            address: armatureAt,
            data: [{ id: { name: "ARRigData" }, bonebase: { first: boneAt(0), last: boneAt(0) } }],
          },
          ...Array.from({ length: bones }, (_, index) => ({
            code: "DATA",
            struct: "Bone",
            address: boneAt(index),
            data: [
              {
                name: `B${index}`,
                childbase: { first: index + 1 < bones ? boneAt(index + 1) : 0n },
                arm_mat: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
              },
            ],
          })),
        ],
      );
    expect(buildScene(readBlendFile(rig(MAX_NODE_DEPTH - 1))).nodes).toHaveLength(MAX_NODE_DEPTH);
    await expect(importBytes("deep.blend", rig(MAX_NODE_DEPTH))).rejects.toMatchObject({
      code: "invalid-input",
      message: `deep.blend nests objects and bones more than ${MAX_NODE_DEPTH} levels deep, more than Arcue can show.`,
    });
  });

  it("keeps an object's material slots to those its file holds, and to as many as Blender makes", () => {
    const bitsAt = 0x5000000n;
    const slotCounts = (object: Record<string, FieldValue>, bits = 0) => {
      const more: BlockDefinition[] =
        bits > 0 ? [{ code: "DATA", struct: null, address: bitsAt, data: new Uint8Array(bits) }] : [];
      const file = readBlendFile(
        sceneFile([{ ...PLATE, ...object }], [...meshBlocks(PLATE_VERTICES, [0, 1, 2, 3]), ...more]),
      );
      return [...shownMeshSlots(file, collectSceneObjects(file))].map(({ slots }) => slots.length);
    };
    expect(slotCounts({ totcol: 100_000 })).toEqual([0]);
    expect(slotCounts({ totcol: 3, matbits: bitsAt }, 3)).toEqual([3]);
    expect(slotCounts({ totcol: 40_000, matbits: bitsAt }, 40_000)).toEqual([32_767]);
    const built = (totcol: number) => {
      const bytes = sceneFile([{ ...PLATE, totcol }], meshBlocks(PLATE_VERTICES, [0, 1, 2, 3]));
      vi.mocked(buildMesh).mockClear();
      const { meshes } = buildScene(readBlendFile(bytes));
      const given = vi.mocked(buildMesh).mock.calls.map(([, options]) => options.slotCount);
      return { given, groups: meshes.map((mesh) => mesh.groups.length) };
    };
    expect(built(100_000)).toEqual({ given: [0], groups: [1] });
    expect(built(2 ** 31 - 1)).toEqual({ given: [0], groups: [1] });
  });

  it("reads a mesh's slots once for all its objects, and an object's own slots only from arrays it alone holds", () => {
    const slotCount = 1000;
    const at = { shared: 0x6000000n, own: 0x6000100n, meshSlots: 0x6100000n, ownSlots: 0x6200000n, links: 0x6300000n };
    const pointerArray = (address: bigint, target: bigint): BlockDefinition => {
      const bytes = new Uint8Array(slotCount * 8);
      const view = new DataView(bytes.buffer);
      for (let slot = 0; slot < slotCount; slot++) view.setBigUint64(slot * 8, target, true);
      return { code: "DATA", struct: null, address, data: bytes };
    };
    const mesh = meshBlocks(PLATE_VERTICES, [0, 1, 2, 3]).map((block) =>
      block.code === "ME" && !(block.data instanceof Uint8Array)
        ? { ...block, data: block.data.map((values) => ({ ...values, totcol: slotCount, mat: at.meshSlots })) }
        : block,
    );
    const named = (name: string, more: Record<string, FieldValue> = {}) => ({
      ...PLATE,
      id: { name: `OB${name}` },
      ...more,
    });
    const own = { totcol: slotCount, mat: at.ownSlots, matbits: at.links };
    const file = readBlendFile(
      sceneFile(
        [named("A"), named("B"), named("Own", own), named("Again", own)],
        [
          ...mesh,
          { code: "MA", struct: "Material", address: at.shared, data: [{ id: { name: "MAShared" } }] },
          { code: "MA", struct: "Material", address: at.own, data: [{ id: { name: "MAOwn" } }] },
          pointerArray(at.meshSlots, at.shared),
          pointerArray(at.ownSlots, at.own),
          { code: "DATA", struct: null, address: at.links, data: new Uint8Array(slotCount).fill(1) },
        ],
      ),
    );
    const shown = [...shownMeshSlots(file, collectSceneObjects(file))];
    expect(shown.map(({ object }) => object.name)).toEqual(["A", "B", "Own", "Again"]);
    const [a, b, ownSlots, again] = shown.map(({ slots }) => slots);
    const names = (slots: readonly (BlendStruct | null)[] | undefined) =>
      [...new Set(slots)].map((material) => (material ? idName(material) : null));
    expect(a).toHaveLength(slotCount);
    expect(names(a)).toEqual(["Shared"]);
    expect(b).toBe(a);
    expect(ownSlots).toHaveLength(slotCount);
    expect(names(ownSlots)).toEqual(["Own"]);
    expect(again).toBe(a);
  });

  it("shows the shape keys of a mesh with as many face corners for each vertex as it may, and of none with more", () => {
    const keys = [
      { name: "Basis", offsets: [] },
      { name: "Lift", offsets: PLATE_VERTICES.map(() => [0, 0, 1]), value: 0.5 },
    ];
    const copies = (MAX_CORNERS_PER_KEYED_VERTEX * PLATE_VERTICES.length) / 4;
    const scene = (faces: number) =>
      buildScene(readBlendFile(sceneFile([PLATE], meshBlocks(PLATE_VERTICES, [0, 1, 2, 3], keys, faces))));
    const shapeWarnings = (built: BuiltScene) => built.warnings.filter(({ message }) => message.startsWith("Shape"));
    const kept = scene(copies);
    expect(kept.meshes[0]?.morphTargets.map((target) => target.name)).toEqual(["Lift"]);
    expect(shapeWarnings(kept)).toEqual([]);
    const left = scene(copies + 1);
    expect(left.meshes[0]?.morphTargets).toEqual([]);
    expect(left.meshRecords[0]?.morphKeys).toEqual([]);
    expect(shapeWarnings(left)).toEqual([
      {
        code: "deform-approximated",
        subject: { kind: "node", name: "Plate" },
        message: "Shape keys not shown: Plate",
        detail: `Its mesh has ${(copies + 1) * 4} face corners for 5 vertices; shown in its basis shape`,
      },
    ]);
  });

  describe("with Shape Key Lock", () => {
    const keys = (domeFlag = 0) => [
      { name: "Basis", offsets: [] },
      { name: "Dome", offsets: PLATE_VERTICES.map(() => [0, 0, 1]), value: 0.3, flag: domeFlag },
      { name: "Tilt", offsets: PLATE_VERTICES.map(([x = 0]) => [0, 0, x]), value: 0.6 },
    ];
    const pinned = (shapeflag: number, shapenr: number, domeFlag = 0) =>
      buildScene(
        readBlendFile(
          sceneFile([{ ...PLATE, shapeflag, shapenr }], meshBlocks(PLATE_VERTICES, [0, 1, 2, 3], keys(domeFlag))),
        ),
      );

    it("blends every key by its value without the lock", () => {
      const scene = pinned(0, 2);
      expect(scene.meshes[0]?.morphTargets.map((target) => target.defaultWeight)).toEqual([
        Math.fround(0.3),
        Math.fround(0.6),
      ]);
      expect(scene.meshRecords[0]?.shapeKeyLock).toBe(false);
      expect(scene.warnings.filter((warning) => warning.message.startsWith("Shape key"))).toEqual([]);
    });

    it("shows only the active key at full strength, and says so", () => {
      const scene = pinned(1, 2);
      expect(scene.meshes[0]?.morphTargets.map((target) => target.defaultWeight)).toEqual([1, 0]);
      expect(scene.meshRecords[0]).toMatchObject({ shapeKeyLock: true, morphDefaults: [1, 0] });
      expect(scene.warnings.filter((warning) => warning.message.startsWith("Shape key"))).toEqual([
        {
          code: "deform-approximated",
          subject: { kind: "node", name: "Plate" },
          message: "Shape key pinned: Plate",
          detail: "Shows Dome alone, as Blender does, so key values and their animation change nothing",
        },
      ]);
    });

    it("shows a pinned key relative to another key in its own shape, with the keys it builds on", () => {
      const relative = [
        { name: "Basis", offsets: [] },
        { name: "Dome", offsets: PLATE_VERTICES.map(() => [0, 0, 1]), value: 0.3 },
        { name: "Tilt", offsets: PLATE_VERTICES.map(([x = 0]) => [0, 0, 1 + 0.8 * x]), value: 0.6, relative: 1 },
      ];
      const scene = buildScene(
        readBlendFile(
          sceneFile([{ ...PLATE, shapeflag: 1, shapenr: 3 }], meshBlocks(PLATE_VERTICES, [0, 1, 2, 3], relative)),
        ),
      );
      const mesh = scene.meshes[0];
      expect(scene.meshRecords[0]?.morphDefaults).toEqual([1, 1]);
      for (let rendered = 0; rendered < (mesh?.sourceVertex.length ?? 0); rendered++) {
        const [x = 0, y = 0, z = 0] = PLATE_VERTICES[mesh?.sourceVertex[rendered] ?? 0] ?? [];
        const shown = [0, 1, 2].map(
          (k) =>
            (mesh?.positions[rendered * 3 + k] ?? 0) +
            (mesh?.morphTargets ?? []).reduce(
              (sum, target) => sum + target.defaultWeight * (target.positions[rendered * 3 + k] ?? 0),
              0,
            ),
        );
        expectPoints(shown, [x, z + 1 + 0.8 * x, -y]);
      }
      expect(scene.warnings.find((warning) => warning.message.startsWith("Shape key"))?.detail).toBe(
        "Shows Tilt alone, as Blender does, so key values and their animation change nothing",
      );
    });

    it("says when the morph targets only approach the pinned key", () => {
      const relative = [
        { name: "Basis", offsets: [] },
        { name: "Dome", offsets: PLATE_VERTICES.map(() => [0, 0, 1]), flag: 1 },
        { name: "Tilt", offsets: PLATE_VERTICES.map(([x = 0]) => [0, 0, 1 + 0.8 * x]), relative: 1 },
      ];
      const scene = buildScene(
        readBlendFile(
          sceneFile([{ ...PLATE, shapeflag: 1, shapenr: 3 }], meshBlocks(PLATE_VERTICES, [0, 1, 2, 3], relative)),
        ),
      );
      expect(scene.meshRecords[0]?.morphDefaults).toEqual([1]);
      expect(scene.warnings.find((warning) => warning.message.startsWith("Shape key"))?.detail).toBe(
        "Shows Tilt alone, roughly, since a key it builds on is muted; key values and their animation change nothing",
      );
    });

    it("shows the basis for a pinned basis or a pinned key that is muted", () => {
      expect(pinned(1, 1).meshes[0]?.morphTargets.map((target) => target.defaultWeight)).toEqual([0, 0]);
      const muted = pinned(1, 2, 1);
      expect(muted.meshes[0]?.morphTargets.map((target) => [target.name, target.defaultWeight])).toEqual([["Tilt", 0]]);
      expect(muted.warnings.find((warning) => warning.message.startsWith("Shape key"))?.detail).toBe(
        "Shows its basis shape, as Blender does, so key values and their animation change nothing",
      );
    });
  });
});

describe("linkedDataWarning", () => {
  it("names data from other files apart from data of files packed into this one", () => {
    expect(linkedDataWarning([])).toBeNull();
    expect(
      linkedDataWarning([
        { kind: "objects", name: "Rock", packed: false },
        { kind: "collections", name: "Kit", packed: false },
        { kind: "objects", name: "Rock", packed: false },
        { kind: "collections", name: "Char", packed: true },
      ]),
    ).toEqual({
      code: "library-not-loaded",
      subject: { kind: "file", name: "" },
      message: "Linked data not shown",
      detail:
        "From other .blend files: collections Kit; objects Rock. From .blend files packed in this one, which Arcue does not read: collections Char",
    });
  });
});

describe.each(VERSIONS)("the gray check of the fixtures from Blender %s", (version) => {
  it.each([
    "clips",
    "features",
    "images",
    "materials",
    "opening",
    "relations",
    "rig",
    "scenes",
    "shading",
    "shapes",
    "skin",
    "stacks",
  ])("asks about the images the build asks about in %s", async (name) => {
    const file = readBlendFile(await decompressBlend(readFixture(name, version)));
    const contents = collectSceneObjects(file);
    const candidates = grayCandidates(file, contents).map(({ image }) => image.offset);
    const asked = new Set<number>();
    buildScene(
      file,
      new Set(),
      (image) => {
        asked.add(image.offset);
        return false;
      },
      contents,
    );
    expect(new Set(candidates)).toEqual(asked);
  });
});
