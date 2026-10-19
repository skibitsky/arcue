import { describe, expect, it } from "vitest";
import { cornerMismatches, type LoopReference } from "../../test/loops.js";
import type { BlockDefinition, FileDefinition } from "../../test/synthetic.js";
import { writeBlend } from "../../test/synthetic.js";
import { readBlendFile } from "../blend/file.js";
import { datablocks } from "../blend/ids.js";
import { identity } from "../math.js";
import { buildMesh } from "./mesh-build.js";
import { CustomDataType, defaultColorAttribute, type MeshData, MeshReadError, readMeshData } from "./mesh-data.js";
import { shapeTargets } from "./shape-keys.js";

/** The structs of a mesh as Blender 3.0 to 3.4 wrote them, with only the members the reader takes. */
const STRUCTS: FileDefinition["structs"] = [
  {
    type: "ListBase",
    fields: [
      ["void", "*first"],
      ["void", "*last"],
    ],
  },
  { type: "ID", fields: [["char", "name[66]"]] },
  {
    type: "CustomDataLayer",
    fields: [
      ["int", "type"],
      ["int", "offset"],
      ["int", "flag"],
      ["int", "active"],
      ["int", "active_rnd"],
      ["int", "active_clone"],
      ["int", "active_mask"],
      ["int", "uid"],
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
      ["char", "flag"],
      ["char", "bweight"],
      ["char", "_pad[2]"],
    ],
  },
  {
    type: "MEdge",
    fields: [
      ["uint", "v1"],
      ["uint", "v2"],
      ["char", "crease"],
      ["char", "bweight"],
      ["short", "flag"],
    ],
  },
  {
    type: "MPoly",
    fields: [
      ["int", "loopstart"],
      ["int", "totloop"],
      ["short", "mat_nr"],
      ["char", "flag"],
      ["char", "_pad"],
    ],
  },
  {
    type: "MLoop",
    fields: [
      ["uint", "v"],
      ["uint", "e"],
    ],
  },
  {
    type: "MLoopUV",
    fields: [
      ["float", "uv[2]"],
      ["int", "flag"],
    ],
  },
  {
    type: "MDeformWeight",
    fields: [
      ["uint", "def_nr"],
      ["float", "weight"],
    ],
  },
  {
    type: "MDeformVert",
    fields: [
      ["MDeformWeight", "*dw"],
      ["int", "totweight"],
      ["int", "flag"],
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
      ["short", "flag"],
      ["short", "_pad"],
      ["float", "smoothresh"],
    ],
  },
];

const AUTO_SMOOTH = 1 << 5;
const FACE_SMOOTH = 1 << 0;
const EDGE_SHARP = 1 << 9;

/** Two quads at a right angle along the edge from vertex 1 to vertex 4: face 0 faces +Z, face 1 faces +X. */
const POSITIONS = [
  [0, 0, 0],
  [1, 0, 0],
  [1, 0, -1],
  [0, 1, 0],
  [1, 1, 0],
  [1, 1, -1],
];
const EDGES = [
  [0, 1],
  [1, 4],
  [4, 3],
  [3, 0],
  [1, 2],
  [2, 5],
  [5, 4],
];
/** The vertex and edge of each face corner. */
const CORNERS = [
  [0, 0],
  [1, 1],
  [4, 2],
  [3, 3],
  [1, 4],
  [2, 5],
  [5, 6],
  [4, 1],
];
const LOOP_TRIANGLES = [
  [0, 1, 2],
  [0, 2, 3],
  [4, 5, 6],
  [4, 6, 7],
];
const UV_MAP = CORNERS.flatMap((_, corner) => [corner / 10, 1 - corner / 10]);
const LIGHTMAP = CORNERS.flatMap((_, corner) => [corner, -corner]);
/** A linear color for each face corner, so that the corners of the fold's shared vertices differ. */
const CORNER_COLORS = CORNERS.flatMap((_, corner) => [corner / 8, 1 - corner / 8, 0.5, 1]);
/** Each vertex's group and weight pairs, for the groups "Upper" and "Lower". */
const WEIGHTS = [
  [
    [0, 0.3],
    [1, 0.1],
  ],
  [[1, 0.5]],
  [[0, 0.75]],
  [],
  [
    [1, 0.25],
    [0, 0.25],
  ],
  [],
];

interface Fold {
  little?: boolean;
  pointerSize?: 4 | 8;
  meshFlag?: number;
  smoothresh?: number;
  faceFlags?: [number, number];
  edgeFlags?: number[];
  /** Zeroed custom normals, as a mesh with "Clear Custom Split Normals Data" undone stores them. */
  customNormals?: boolean;
  /** A float vector corner attribute, as Geometry Nodes or Attribute Convert make, before the UV maps. */
  vectorAttribute?: boolean;
  /** A float color attribute on the face corners, after the UV maps. */
  cornerColors?: boolean;
  /** Leaves out the MLoopUV maps. */
  withoutUvMaps?: boolean;
  /** MDeformWeight blocks that hold fewer weights than their vertex counts, or that the file does not hold. */
  damagedWeights?: boolean;
  /** Every vertex's weights in the block of vertex 0's two, as no file Blender writes has them. */
  sharedWeights?: boolean;
  /** MLoopUV layers without data after the two UV maps. */
  emptyUvMaps?: number;
  /** Shape key blocks with their data: one of the `KEY_DATA` blocks, or none. The first is the reference key. */
  shapeKeys?: { name: string; data: bigint | null }[];
}

/** The data blocks a fold's shape keys can have: its own positions, those lifted by 1, and those of 2 vertices. */
const KEY_DATA = { basis: 0x600n, lifted: 0x610n, short: 0x620n } as const;
const LIFTED = POSITIONS.map(([x = 0, y = 0, z = 0]) => [x, y, z + 1]);

function floats(values: readonly number[], little: boolean): Uint8Array {
  const view = new DataView(new ArrayBuffer(values.length * 4));
  values.forEach((value, index) => {
    view.setFloat32(index * 4, value, little);
  });
  return new Uint8Array(view.buffer);
}

function layer(type: number, name: string, data: bigint, activeRender = 0) {
  const zero = { offset: 0, flag: 0, active: 0, active_clone: 0, active_mask: 0, uid: 0 };
  return { ...zero, type, active_rnd: activeRender, name, data };
}

/** The fold, stored as Blender 3.0 to 3.4 stored meshes: one array of structs per kind of element. */
function legacyFold(options: Fold = {}): Uint8Array {
  const little = options.little ?? true;
  const faceFlags = options.faceFlags ?? [FACE_SMOOTH, FACE_SMOOTH];
  const cornerLayers = [
    layer(CustomDataType.loop, "", 0x330n),
    ...(options.vectorAttribute ? [layer(CustomDataType.float2, "offset", 0x370n)] : []),
    ...(options.withoutUvMaps
      ? []
      : [layer(CustomDataType.loopUv, "UVMap", 0x340n, 1), layer(CustomDataType.loopUv, "Lightmap", 0x350n, 1)]),
    ...Array.from({ length: options.emptyUvMaps ?? 0 }, (_, index) =>
      layer(CustomDataType.loopUv, `Empty${index}`, 0n),
    ),
    ...(options.customNormals ? [layer(CustomDataType.customLoopNormal, "", 0x360n)] : []),
    ...(options.cornerColors ? [layer(CustomDataType.floatColor, "Paint", 0x380n)] : []),
  ];
  const weightBlocks: BlockDefinition[] = WEIGHTS.flatMap((pairs, vertex) => {
    if (pairs.length === 0 || (options.damagedWeights && vertex === 2)) return [];
    const held = options.damagedWeights && vertex === 0 ? pairs.slice(0, 1) : pairs;
    return [
      {
        code: "DATA",
        struct: "MDeformWeight",
        address: 0x500n + BigInt(vertex) * 0x10n,
        data: held.map(([group, weight]) => ({ def_nr: group ?? 0, weight: weight ?? 0 })),
      },
    ];
  });
  const shapeKeys = options.shapeKeys ?? [];
  const keyBlockAt = (index: number) => 0x700n + BigInt(index) * 0x10n;
  const keyBlocks: BlockDefinition[] =
    shapeKeys.length === 0
      ? []
      : [
          {
            code: "KE",
            struct: "Key",
            address: 0x6f0n,
            data: [
              {
                id: { name: "KEKey" },
                refkey: keyBlockAt(0),
                block: { first: keyBlockAt(0), last: keyBlockAt(shapeKeys.length - 1) },
                type: 1,
              },
            ],
          },
          ...shapeKeys.map(({ name, data }, index) => ({
            code: "DATA",
            struct: "KeyBlock",
            address: keyBlockAt(index),
            data: [
              {
                next: index + 1 < shapeKeys.length ? keyBlockAt(index + 1) : 0n,
                prev: index > 0 ? keyBlockAt(index - 1) : 0n,
                name,
                data: data ?? 0n,
                totelem: POSITIONS.length,
                slidermax: 1,
              },
            ],
          })),
          { code: "DATA", struct: null, address: KEY_DATA.basis, data: floats(POSITIONS.flat(), little) },
          { code: "DATA", struct: null, address: KEY_DATA.lifted, data: floats(LIFTED.flat(), little) },
          { code: "DATA", struct: null, address: KEY_DATA.short, data: floats(POSITIONS.slice(0, 2).flat(), little) },
        ];
  return writeBlend({
    header: "old",
    pointerSize: options.pointerSize ?? 8,
    little,
    version: "304",
    structs: STRUCTS,
    blocks: [
      {
        code: "ME",
        struct: "Mesh",
        address: 0x100n,
        data: [
          {
            id: { name: "MEFold" },
            key: shapeKeys.length > 0 ? 0x6f0n : 0n,
            vdata: { layers: 0x200n, totlayer: 2 },
            edata: { layers: 0x210n, totlayer: 1 },
            pdata: { layers: 0x220n, totlayer: 1 },
            ldata: { layers: 0x230n, totlayer: cornerLayers.length },
            totvert: POSITIONS.length,
            totedge: EDGES.length,
            totpoly: 2,
            totloop: CORNERS.length,
            flag: options.meshFlag ?? 0,
            smoothresh: options.smoothresh ?? Math.PI / 6,
          },
        ],
      },
      {
        code: "DATA",
        struct: "CustomDataLayer",
        address: 0x200n,
        data: [layer(CustomDataType.vertex, "", 0x300n), layer(CustomDataType.deformVertex, "", 0x400n)],
      },
      { code: "DATA", struct: "CustomDataLayer", address: 0x210n, data: [layer(CustomDataType.edge, "", 0x310n)] },
      { code: "DATA", struct: "CustomDataLayer", address: 0x220n, data: [layer(CustomDataType.face, "", 0x320n)] },
      { code: "DATA", struct: "CustomDataLayer", address: 0x230n, data: cornerLayers },
      { code: "DATA", struct: "MVert", address: 0x300n, data: POSITIONS.map((co) => ({ co })) },
      {
        code: "DATA",
        struct: "MEdge",
        address: 0x310n,
        data: EDGES.map(([v1 = 0, v2 = 0], edge) => ({ v1, v2, flag: options.edgeFlags?.[edge] ?? 0 })),
      },
      {
        code: "DATA",
        struct: "MPoly",
        address: 0x320n,
        data: faceFlags.map((flag, face) => ({ loopstart: face * 4, totloop: 4, mat_nr: face, flag })),
      },
      { code: "DATA", struct: "MLoop", address: 0x330n, data: CORNERS.map(([v = 0, e = 0]) => ({ v, e })) },
      {
        code: "DATA",
        struct: "MLoopUV",
        address: 0x340n,
        data: CORNERS.map((_, corner) => ({ uv: UV_MAP.slice(corner * 2, corner * 2 + 2) })),
      },
      {
        code: "DATA",
        struct: "MLoopUV",
        address: 0x350n,
        data: CORNERS.map((_, corner) => ({ uv: LIGHTMAP.slice(corner * 2, corner * 2 + 2) })),
      },
      { code: "DATA", struct: null, address: 0x360n, data: new Uint8Array(CORNERS.length * 4) },
      {
        code: "DATA",
        struct: null,
        address: 0x370n,
        data: floats([5, 5, 6, 5, 6, 6, 5, 6, 7, 7, 8, 7, 8, 8, 7, 8], little),
      },
      { code: "DATA", struct: null, address: 0x380n, data: floats(CORNER_COLORS, little) },
      {
        code: "DATA",
        struct: "MDeformVert",
        address: 0x400n,
        data: WEIGHTS.map((pairs, vertex) =>
          options.sharedWeights
            ? { dw: 0x500n, totweight: 2 }
            : { dw: pairs.length > 0 ? 0x500n + BigInt(vertex) * 0x10n : 0n, totweight: pairs.length },
        ),
      },
      ...weightBlocks,
      ...keyBlocks,
    ],
  });
}

function readFold(options: Fold = {}): MeshData {
  const file = readBlendFile(legacyFold(options));
  const [mesh] = datablocks(file, "ME");
  if (!mesh) throw new Error("The synthetic file has no mesh.");
  return readMeshData(file, mesh, ["Upper", "Lower"]);
}

function build(data: MeshData) {
  return buildMesh(data, {
    conversion: identity(),
    slotCount: 2,
    skinBones: [
      { name: "Upper", node: 1 },
      { name: "Lower", node: 2 },
    ],
    meshNode: 0,
    smoothing: null,
    blenderVersion: 304,
  });
}

/** What Blender draws at each corner of the fold, with the normal of each face corner given. */
function foldLoops(normals: number[][]): LoopReference {
  return {
    loopTriangles: LOOP_TRIANGLES,
    loopVertices: CORNERS.map(([vertex = 0]) => vertex),
    normals,
    uvs: { UVMap: UV_MAP, Lightmap: LIGHTMAP },
  };
}

const UP = [0, 0, 1];
const SIDE = [1, 0, 0];
const BETWEEN = [Math.SQRT1_2, 0, Math.SQRT1_2];
/** The normals of a smooth fold that nothing splits: the two faces' average on the fold, each face's elsewhere. */
const SMOOTH_FOLD = [UP, BETWEEN, BETWEEN, UP, BETWEEN, SIDE, SIDE, BETWEEN];

describe("mesh data in files from Blender 3.0 to 3.4", () => {
  it("reads UV maps, smooth and sharp flags, slots, the auto smooth angle and deform weights", () => {
    const fold = readFold({ meshFlag: AUTO_SMOOTH, faceFlags: [0, FACE_SMOOTH], edgeFlags: [0, EDGE_SHARP] });
    expect(fold.uvMaps.map((map) => map.name)).toEqual(["UVMap", "Lightmap"]);
    expect(Array.from(fold.uvMaps[0]?.values ?? [])).toEqual(UV_MAP.map(Math.fround));
    expect(Array.from(fold.uvMaps[1]?.values ?? [])).toEqual(LIGHTMAP);
    expect(fold.defaultUv).toBe(1);
    expect(Array.from(fold.sharpFaces ?? [])).toEqual([1, 0]);
    expect(Array.from(fold.sharpEdges ?? [])).toEqual([0, 1, 0, 0, 0, 0, 0]);
    expect(Array.from(fold.materialIndices ?? [])).toEqual([0, 1]);
    expect(fold.autoSmoothAngle).toBeCloseTo(Math.PI / 6, 6);
    expect(fold.vertexGroupNames).toEqual(["Upper", "Lower"]);
    expect(Array.from(fold.deformWeights?.offsets ?? [])).toEqual([0, 2, 3, 4, 4, 6, 6]);
    expect(Array.from(fold.deformWeights?.groups ?? [])).toEqual(WEIGHTS.flat().map(([group]) => group));
    expect(Array.from(fold.deformWeights?.weights ?? [])).toEqual(
      WEIGHTS.flat().map(([, weight]) => Math.fround(weight ?? 0)),
    );
  });

  it("draws each corner with its UVs and with the normals of flat faces and sharp edges", () => {
    const built = build(readFold({ meshFlag: AUTO_SMOOTH, faceFlags: [0, FACE_SMOOTH], edgeFlags: [0, EDGE_SHARP] }));
    expect(cornerMismatches(built, foldLoops([UP, UP, UP, UP, SIDE, SIDE, SIDE, SIDE]))).toEqual([]);
  });

  it("draws each corner with its own color, splitting a vertex whose corners differ only in color", () => {
    const fold = readFold({ cornerColors: true, withoutUvMaps: true });
    expect(fold.colors?.name).toBe("Paint");
    expect(fold.colors?.domain).toBe("corner");
    const built = build(fold);
    const { loopTriangles, loopVertices } = foldLoops(SMOOTH_FOLD);
    const loops = { loopTriangles, loopVertices, normals: SMOOTH_FOLD, colors: CORNER_COLORS };
    expect(cornerMismatches(built, loops)).toEqual([]);
    expect(built.sourceVertex).toHaveLength(CORNERS.length);
  });

  it("splits normals where faces meet at more than the auto smooth angle, only with auto smooth on", () => {
    const split = build(readFold({ meshFlag: AUTO_SMOOTH }));
    expect(cornerMismatches(split, foldLoops([UP, UP, UP, UP, SIDE, SIDE, SIDE, SIDE]))).toEqual([]);
    const smooth = build(readFold({ meshFlag: 0 }));
    expect(cornerMismatches(smooth, foldLoops(SMOOTH_FOLD))).toEqual([]);
  });

  it("leaves the auto smooth angle out for a mesh with custom normals, as Blender does", () => {
    const fold = readFold({ meshFlag: AUTO_SMOOTH, customNormals: true });
    expect(fold.customNormals?.kind).toBe("encoded");
    expect(cornerMismatches(build(fold), foldLoops(SMOOTH_FOLD))).toEqual([]);
  });

  it("skins each vertex with its groups' bones, the four strongest scaled to 1 for rendering", () => {
    const built = build(readFold());
    const skin = built.skin;
    expect(skin?.joints).toEqual([1, 2, 0]);
    expect(Array.from(skin?.source.offsets ?? [])).toEqual([0, 2, 3, 4, 4, 6, 6]);
    expect(Array.from(skin?.source.joints ?? [])).toEqual([0, 1, 1, 0, 0, 1]);
    expect(Array.from(skin?.source.weights ?? [])).toEqual([0.3, 0.1, 0.5, 0.75, 0.25, 0.25].map(Math.fround));
    const strongest = new Map([
      [0, [0, 0.75, 1, 0.25]],
      [1, [1, 1]],
      [2, [0, 1]],
      [3, [2, 1]],
      [4, [0, 0.5, 1, 0.5]],
      [5, [2, 1]],
    ]);
    for (let r = 0; r < built.sourceVertex.length; r++) {
      const pairs = strongest.get(built.sourceVertex[r] ?? -1) ?? [];
      const rendered = [0, 1, 2, 3].flatMap((k) => {
        const weight = skin?.rendered.weights[r * 4 + k] ?? 0;
        return weight === 0 ? [] : [skin?.rendered.joints[r * 4 + k] ?? -1, weight];
      });
      expect(
        rendered.map((value) => Math.round(value * 1e6) / 1e6),
        `vertex ${built.sourceVertex[r]}`,
      ).toEqual(pairs);
    }
  });

  it("reads the same mesh from a big-endian file with 4-byte pointers", () => {
    const options = {
      meshFlag: AUTO_SMOOTH,
      faceFlags: [0, FACE_SMOOTH] as [number, number],
      edgeFlags: [0, EDGE_SHARP],
    };
    const little = readFold(options);
    const big = readFold({ ...options, little: false, pointerSize: 4 });
    const arrays = (data: MeshData) => ({
      positions: Array.from(data.positions),
      edges: Array.from(data.edges),
      faceOffsets: Array.from(data.faceOffsets),
      cornerVerts: Array.from(data.cornerVerts),
      cornerEdges: Array.from(data.cornerEdges),
      materialIndices: Array.from(data.materialIndices ?? []),
      sharpFaces: Array.from(data.sharpFaces ?? []),
      sharpEdges: Array.from(data.sharpEdges ?? []),
      uvMaps: data.uvMaps.map((map) => [map.name, Array.from(map.values)]),
      weights: [data.deformWeights?.offsets, data.deformWeights?.groups, data.deformWeights?.weights].map((values) =>
        Array.from(values ?? []),
      ),
    });
    expect(arrays(big)).toEqual(arrays(little));
    expect(arrays(little).positions).toEqual(POSITIONS.flat());
  });

  it("reads the weights in memory sized by the mesh, not by the number of blocks in the whole file", () => {
    const file = readBlendFile(legacyFold());
    Object.defineProperty(file, "blockCount", { value: Number.MAX_SAFE_INTEGER });
    const [mesh] = datablocks(file, "ME");
    if (!mesh) throw new Error("The synthetic file has no mesh.");
    const weights = readMeshData(file, mesh, ["Upper", "Lower"]).deformWeights;
    expect(Array.from(weights?.offsets ?? [])).toEqual([0, 2, 3, 4, 4, 6, 6]);
  });

  it("keeps the weights a vertex's block holds, and none for a block the file lacks", () => {
    const fold = readFold({ damagedWeights: true });
    expect(Array.from(fold.deformWeights?.offsets ?? [])).toEqual([0, 1, 2, 2, 2, 4, 4]);
    expect(Array.from(fold.deformWeights?.groups ?? [])).toEqual([0, 1, 1, 0]);
  });

  it("reads a float vector corner attribute and the MLoopUV maps as UV maps, rendering with the MLoopUV one", () => {
    const fold = readFold({ vectorAttribute: true });
    expect(fold.uvMaps.map((map) => map.name)).toEqual(["offset", "UVMap", "Lightmap"]);
    expect(Array.from(fold.uvMaps[0]?.values ?? [])).toEqual([5, 5, 6, 5, 6, 6, 5, 6, 7, 7, 8, 7, 8, 8, 7, 8]);
    expect(fold.uvMaps[fold.defaultUv]?.name).toBe("Lightmap");
  });

  it("reads a mesh with many corner layers in time that grows with their number, not its square", () => {
    const count = 20_000;
    const file = readBlendFile(
      writeBlend({
        header: "old",
        pointerSize: 8,
        little: true,
        version: "304",
        structs: STRUCTS,
        blocks: [
          {
            code: "ME",
            struct: "Mesh",
            address: 0x100n,
            data: [{ id: { name: "MELayers" }, ldata: { layers: 0x200n, totlayer: count } }],
          },
          {
            code: "DATA",
            struct: "CustomDataLayer",
            address: 0x200n,
            data: Array.from({ length: count }, (_, index) =>
              layer(CustomDataType.loopUv, `UV${index}`, 0n, count - 1),
            ),
          },
        ],
      }),
    );
    const [mesh] = datablocks(file, "ME");
    if (!mesh) throw new Error("The synthetic file has no mesh.");
    const start = performance.now();
    const data = readMeshData(file, mesh);
    expect(performance.now() - start).toBeLessThan(2000);
    expect(data.uvMaps).toHaveLength(count);
    expect(data.defaultUv).toBe(count - 1);
  });
});

describe("a damaged or crafted mesh", () => {
  it("gives a block of weights only to the first vertex that points at it", () => {
    const fold = readFold({ sharedWeights: true });
    expect(Array.from(fold.deformWeights?.offsets ?? [])).toEqual([0, 2, 2, 2, 2, 2, 2]);
    expect(Array.from(fold.deformWeights?.groups ?? [])).toEqual([0, 1]);
  });

  it("leaves out each shape key without positions of its own for every vertex, making none for it", () => {
    const fold = readFold({
      shapeKeys: [
        { name: "Basis", data: KEY_DATA.basis },
        { name: "Lift", data: KEY_DATA.lifted },
        { name: "Empty", data: null },
        { name: "Shared", data: KEY_DATA.lifted },
        { name: "Short", data: KEY_DATA.short },
      ],
    });
    expect(shapeTargets(fold).map((target) => target.name)).toEqual(["Lift"]);
    expect(Array.from(fold.shapeKeys[1]?.positions ?? [])).toEqual(LIFTED.flat());
    const left = fold.shapeKeys.slice(2);
    expect(left.map((key) => [key.name, key.muted, Array.from(key.positions)])).toEqual(
      ["Empty", "Shared", "Short"].map((name) => [name, true, POSITIONS.flat()]),
    );
    expect(new Set(left.map((key) => key.positions)).size).toBe(1);
  });

  it("keeps the names of UV maps past those the preview shows, and reads none of their values", () => {
    const fold = readFold({ emptyUvMaps: 20 });
    expect(fold.uvMaps.map((map) => map.name)).toEqual([
      "UVMap",
      "Lightmap",
      ...Array.from({ length: 20 }, (_, index) => `Empty${index}`),
    ]);
    expect(fold.uvMaps.map((map) => map.values.length)).toEqual([...Array(8).fill(16), ...Array(14).fill(0)]);
    expect(fold.defaultUv).toBe(1);
  });

  /** A mesh whose face corners list `count` layers of UV maps, in a block of `struct`, which holds one char. */
  function layeredMesh(struct: string, count: number) {
    const other: FileDefinition["structs"] =
      struct === "CustomDataLayer" ? [] : [{ type: struct, fields: [["char", "type"]] }];
    const file = readBlendFile(
      writeBlend({
        header: "old",
        pointerSize: 8,
        little: true,
        version: "304",
        structs: [
          { type: "ID", fields: [["char", "name[66]"]] },
          { type: "CustomDataLayer", fields: [["char", "type"]] },
          ...other,
          {
            type: "CustomData",
            fields: [
              ["CustomDataLayer", "*layers"],
              ["int", "totlayer"],
            ],
          },
          {
            type: "Mesh",
            fields: [
              ["ID", "id"],
              ["CustomData", "vdata"],
              ["CustomData", "ldata"],
            ],
          },
        ],
        blocks: [
          {
            code: "ME",
            struct: "Mesh",
            address: 0x100n,
            data: [{ id: { name: "MEBytes" }, ldata: { layers: 0x200n, totlayer: count } }],
          },
          {
            code: "DATA",
            struct,
            address: 0x200n,
            data: Array.from({ length: count }, () => ({ type: CustomDataType.loopUv })),
          },
        ],
      }),
    );
    const [mesh] = datablocks(file, "ME");
    if (!mesh) throw new Error("The synthetic file has no mesh.");
    return { file, mesh };
  }

  it("is refused when it lists far more layers than Blender writes", () => {
    const { file, mesh } = layeredMesh("CustomDataLayer", 70_000);
    expect(() => readMeshData(file, mesh)).toThrow(
      new MeshReadError("Mesh Bytes has 70000 layers of data, far more than Blender writes"),
    );
    expect(defaultColorAttribute(mesh)).toBe("");
  });

  it("reads no layers from a block that holds a struct other than CustomDataLayer", () => {
    const { file, mesh } = layeredMesh("Byte", 200_000);
    expect(readMeshData(file, mesh).uvMaps).toEqual([]);
  });

  it.each([
    ["a struct other than MVert", "Byte"],
    ["an MVert of one byte", "MVert"],
  ])("counts no vertices in a vertex layer whose block holds %s", (_, struct) => {
    const count = 100_000;
    const file = readBlendFile(
      writeBlend({
        header: "old",
        pointerSize: 8,
        little: true,
        version: "304",
        structs: [
          { type: "ID", fields: [["char", "name[66]"]] },
          { type: struct, fields: [["char", "value"]] },
          {
            type: "CustomDataLayer",
            fields: [
              ["int", "type"],
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
            type: "Mesh",
            fields: [
              ["ID", "id"],
              ["CustomData", "vdata"],
              ["int", "totvert"],
            ],
          },
        ],
        blocks: [
          {
            code: "ME",
            struct: "Mesh",
            address: 0x100n,
            data: [{ id: { name: "MEBytes" }, vdata: { layers: 0x200n, totlayer: 1 }, totvert: count }],
          },
          {
            code: "DATA",
            struct: "CustomDataLayer",
            address: 0x200n,
            data: [{ type: CustomDataType.vertex, data: 0x300n }],
          },
          { code: "DATA", struct, address: 0x300n, data: Array.from({ length: count }, () => ({ value: 0 })) },
        ],
      }),
    );
    const [mesh] = datablocks(file, "ME");
    if (!mesh) throw new Error("The synthetic file has no mesh.");
    expect(() => readMeshData(file, mesh)).toThrow(
      new MeshReadError(`Mesh Bytes counts ${count} vertices but holds 0`),
    );
  });
});
