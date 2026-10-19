import { describe, expect, it } from "vitest";
import type { FileDefinition } from "../../test/synthetic.js";
import { writeBlend } from "../../test/synthetic.js";
import { readBlendFile } from "../blend/file.js";
import { datablocks } from "../blend/ids.js";
import { CustomDataType, MeshReadError, readMeshData } from "./mesh-data.js";

type Struct = FileDefinition["structs"][number];

const STRUCTS: Struct[] = [
  { type: "ID", fields: [["char", "name[66]"]] },
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
    type: "Mesh",
    fields: [
      ["ID", "id"],
      ["CustomData", "vdata"],
      ["CustomData", "edata"],
      ["CustomData", "pdata"],
      ["CustomData", "ldata"],
      ["int", "totvert"],
      ["int", "totedge"],
      ["int", "totpoly"],
      ["int", "totloop"],
    ],
  },
];

const QUAD = { totvert: 4, totedge: 4, totpoly: 1, totloop: 4 };

/** A quad as Blender before 3.6 stored meshes: MVert, MEdge, MPoly and MLoop arrays, with `counts` in the mesh. */
function legacyQuad(counts: Partial<typeof QUAD> = {}): Uint8Array {
  const layers = (type: number, address: bigint) => [{ type, data: address }];
  return writeBlend({
    header: "old",
    pointerSize: 8,
    little: true,
    version: "300",
    structs: STRUCTS,
    blocks: [
      {
        code: "ME",
        struct: "Mesh",
        address: 0x100n,
        data: [
          {
            id: { name: "MEQuad" },
            vdata: { layers: 0x200n, totlayer: 1 },
            edata: { layers: 0x210n, totlayer: 1 },
            pdata: { layers: 0x220n, totlayer: 1 },
            ldata: { layers: 0x230n, totlayer: 1 },
            ...QUAD,
            ...counts,
          },
        ],
      },
      { code: "DATA", struct: "CustomDataLayer", address: 0x200n, data: layers(CustomDataType.vertex, 0x300n) },
      { code: "DATA", struct: "CustomDataLayer", address: 0x210n, data: layers(CustomDataType.edge, 0x310n) },
      { code: "DATA", struct: "CustomDataLayer", address: 0x220n, data: layers(CustomDataType.face, 0x320n) },
      { code: "DATA", struct: "CustomDataLayer", address: 0x230n, data: layers(CustomDataType.loop, 0x330n) },
      {
        code: "DATA",
        struct: "MVert",
        address: 0x300n,
        data: [{ co: [0, 0, 0] }, { co: [1, 0, 0] }, { co: [1, 1, 0] }, { co: [0, 1, 0] }],
      },
      {
        code: "DATA",
        struct: "MEdge",
        address: 0x310n,
        data: [
          { v1: 0, v2: 1 },
          { v1: 1, v2: 2 },
          { v1: 2, v2: 3 },
          { v1: 3, v2: 0 },
        ],
      },
      { code: "DATA", struct: "MPoly", address: 0x320n, data: [{ loopstart: 0, totloop: 4 }] },
      {
        code: "DATA",
        struct: "MLoop",
        address: 0x330n,
        data: [0, 1, 2, 3].map((corner) => ({ v: corner, e: corner })),
      },
    ],
  });
}

function readQuad(counts: Partial<typeof QUAD> = {}) {
  const file = readBlendFile(legacyQuad(counts));
  const [mesh] = datablocks(file, "ME");
  if (!mesh) throw new Error("The synthetic file has no mesh.");
  return readMeshData(file, mesh);
}

describe("mesh element counts in files from before Blender 3.6", () => {
  it("reads a mesh whose counts match its MVert, MEdge, MPoly and MLoop arrays", () => {
    const quad = readQuad();
    expect([quad.vertexCount, quad.edgeCount, quad.faceCount, quad.cornerCount]).toEqual([4, 4, 1, 4]);
    expect(Array.from(quad.positions)).toEqual([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]);
    expect(Array.from(quad.edges)).toEqual([0, 1, 1, 2, 2, 3, 3, 0]);
    expect(Array.from(quad.faceOffsets)).toEqual([0, 4]);
    expect(Array.from(quad.cornerVerts)).toEqual([0, 1, 2, 3]);
  });

  it.each([
    ["totvert", "vertices", 4],
    ["totedge", "edges", 4],
    ["totpoly", "faces", 1],
    ["totloop", "face corners", 4],
  ] as const)("refuses a mesh whose %s is more than its array holds", (member, what, held) => {
    const counted = () => readQuad({ [member]: 100_000_000 });
    expect(counted).toThrow(MeshReadError);
    expect(counted).toThrow(`Mesh Quad counts 100000000 ${what} but holds ${held}`);
  });
});
