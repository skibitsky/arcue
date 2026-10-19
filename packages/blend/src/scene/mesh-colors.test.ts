import { describe, expect, it } from "vitest";
import type { FileDefinition } from "../../test/synthetic.js";
import { writeBlend } from "../../test/synthetic.js";
import { readBlendFile } from "../blend/file.js";
import { datablocks } from "../blend/ids.js";
import { CustomDataType, defaultColorAttribute } from "./mesh-data.js";

const STRUCTS: FileDefinition["structs"] = [
  { type: "ID", fields: [["char", "name[66]"]] },
  {
    type: "CustomDataLayer",
    fields: [
      ["int", "type"],
      ["int", "flag"],
      ["int", "active_rnd"],
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
    type: "Mesh",
    fields: [
      ["ID", "id"],
      ["CustomData", "vdata"],
      ["CustomData", "ldata"],
    ],
  },
];

const RENDER_FLAG = 1 << 6;

interface Layer {
  type: number;
  name: string;
  flag?: number;
  active_rnd?: number;
}

/** The default color attribute of a mesh as Blender 3.2 to 3.4 stored it, with the given point and corner layers. */
function defaultOf(points: Layer[], corners: Layer[]): string {
  const data = (layers: Layer[]) => layers.map((layer) => ({ flag: 0, active_rnd: 0, ...layer, data: 0n }));
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
          data: [
            {
              id: { name: "MEColors" },
              vdata: { layers: points.length ? 0x200n : 0n, totlayer: points.length },
              ldata: { layers: corners.length ? 0x300n : 0n, totlayer: corners.length },
            },
          ],
        },
        ...(points.length ? [{ code: "DATA", struct: "CustomDataLayer", address: 0x200n, data: data(points) }] : []),
        ...(corners.length ? [{ code: "DATA", struct: "CustomDataLayer", address: 0x300n, data: data(corners) }] : []),
      ],
    }),
  );
  const [mesh] = datablocks(file, "ME");
  if (!mesh) throw new Error("The synthetic file has no mesh.");
  return defaultColorAttribute(mesh);
}

const float = CustomDataType.floatColor;
const byte = CustomDataType.byteColor;

describe("the default color attribute of a mesh from before Blender 3.5", () => {
  it("is the layer flagged for rendering, points first", () => {
    const corners = [{ type: byte, name: "Col" }];
    expect(defaultOf([{ type: float, name: "Paint", flag: RENDER_FLAG }], corners)).toBe("Paint");
    expect(defaultOf([], [...corners, { type: byte, name: "Dirt", flag: RENDER_FLAG }])).toBe("Dirt");
  });

  it("is the render layer of float colors and then byte colors when no layer is flagged", () => {
    const points = [
      { type: float, name: "First", active_rnd: 1 },
      { type: float, name: "Second", active_rnd: 1 },
    ];
    expect(defaultOf(points, [{ type: byte, name: "Col" }])).toBe("Second");
    const corners = [
      { type: byte, name: "Bytes" },
      { type: float, name: "Floats" },
    ];
    expect(defaultOf([], corners)).toBe("Floats");
    expect(defaultOf([], [{ type: byte, name: "Col" }])).toBe("Col");
  });

  it("is empty for a mesh without color layers", () => {
    expect(defaultOf([], [])).toBe("");
  });
});
