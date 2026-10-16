import type { Vec3 } from "@arcue/scene";
import { describe, expect, it } from "vitest";
import type { FieldValue, FileDefinition } from "../../test/synthetic";
import { writeBlend } from "../../test/synthetic";
import type { BlendStruct } from "../blend/file";
import { readBlendFile } from "../blend/file";
import { datablocks, idName } from "../blend/ids";
import type { Mat4 } from "../math";
import { compose, identity, multiply, quatFromEuler, translation } from "../math";
import { ObjectType, ParentType } from "./objects";
import type { ParentVertices } from "./parents";
import { vertexParentPart, WorldMatrices } from "./parents";

const STRUCTS: FileDefinition["structs"] = [
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
      ["short", "type"],
      ["short", "partype"],
      ["int", "par1"],
      ["int", "par2"],
      ["int", "par3"],
      ["short", "rotmode"],
      ["float", "loc[3]"],
      ["float", "rot[3]"],
      ["float", "size[3]"],
    ],
  },
];

const GRID = 0x100n;
const ROTATION_MODE_XYZ = 1;
const GRID_VERTICES: Vec3[] = [
  [0, 0, 0],
  [1, 0, 0],
];

/** The objects by name: a mesh Grid, moved, turned a quarter about Z and doubled, and the unscaled `children`. */
function objects(children: Record<string, FieldValue>[]): Map<string, BlendStruct> {
  const grid = {
    id: { name: "OBGrid" },
    type: ObjectType.mesh,
    rotmode: ROTATION_MODE_XYZ,
    loc: [1, 2, 3],
    rot: [0, 0, Math.PI / 2],
    size: [2, 2, 2],
  };
  const blocks = [grid, ...children].map((data, index) => ({
    code: "OB",
    struct: "Object",
    address: GRID + BigInt(index) * 0x100n,
    data: [{ size: [1, 1, 1], ...data }],
  }));
  const file = readBlendFile(writeBlend({ header: "new", pointerSize: 8, little: true, structs: STRUCTS, blocks }));
  return new Map(datablocks(file, "OB").map((object) => [idName(object), object]));
}

const gridVertices: ParentVertices = (parent) =>
  idName(parent) === "Grid" ? { count: GRID_VERTICES.length, at: (index) => GRID_VERTICES[index] ?? [0, 0, 0] } : null;

function named(found: Map<string, BlendStruct>, name: string): BlendStruct {
  const object = found.get(name);
  if (!object) throw new RangeError(`No object ${name}.`);
  return object;
}

function expectMatrix(actual: Mat4, expected: Mat4): void {
  for (const [index, value] of expected.entries()) expect(actual[index], `element ${index}`).toBeCloseTo(value, 6);
}

/** A matrix from its columns: the X, Y and Z axes, then the origin. */
function columns(x: Vec3, y: Vec3, z: Vec3, origin: Vec3): Mat4 {
  return Float64Array.of(...x, 0, ...y, 0, ...z, 0, ...origin, 1);
}

describe("an object parented to one vertex", () => {
  const found = objects([
    { id: { name: "OBPinned" }, parent: GRID, partype: ParentType.vertex, par1: 1 },
    { id: { name: "OBStray" }, parent: GRID, partype: ParentType.vertex, par1: 7 },
  ]);
  const worlds = new WorldMatrices(gridVertices);

  it("moves to the vertex and takes none of the parent's rotation and scale", () => {
    const pinned = named(found, "Pinned");
    expectMatrix(worlds.of(pinned), translation(1, 4, 3));
    const gridWorld = worlds.of(named(found, "Grid"));
    const turned = compose({
      translation: [1, 2, 3],
      rotation: quatFromEuler([0, 0, Math.PI / 2], "XYZ"),
      scale: [2, 2, 2],
    });
    expectMatrix(gridWorld, turned);
    expectMatrix(
      multiply(gridWorld, vertexParentPart(pinned, [GRID_VERTICES[1] ?? [0, 0, 0]], gridWorld)),
      translation(1, 4, 3),
    );
  });

  it("moves to the parent's origin for a vertex the parent does not have", () => {
    expectMatrix(worlds.of(named(found, "Stray")), translation(1, 2, 3));
  });
});

describe("an object parented to three vertices", () => {
  const child = named(objects([{ id: { name: "OBFramed" }, parent: GRID, partype: ParentType.vertices }]), "Framed");
  const frame = (points: Vec3[]) => vertexParentPart(child, points, identity());
  const tiltedOntoY = (origin: Vec3) => columns([1, 0, 0], [0, 0, -1], [0, 1, 0], origin);

  it("tilts Z onto Y about the X axis for collinear points, which have no normal, as Blender's tri_to_quat does", () => {
    expectMatrix(
      frame([
        [0, 0, 0],
        [1, 0, 0],
        [2, 0, 0],
      ]),
      tiltedOntoY([1, 0, 0]),
    );
  });

  it("does the same for coincident points, whose first edge has no direction either", () => {
    expectMatrix(
      frame([
        [1, 2, 3],
        [1, 2, 3],
        [1, 2, 3],
      ]),
      tiltedOntoY([1, 2, 3]),
    );
  });

  it("turns Z down about the X axis for a triangle facing down, whose normal gives no axis to tilt about", () => {
    expectMatrix(
      frame([
        [0, 0, 0],
        [0, 1, 0],
        [1, 0, 0],
      ]),
      columns([0, 1, 0], [1, 0, 0], [0, 0, -1], [1 / 3, 1 / 3, 0]),
    );
  });
});
