import { describe, expect, it } from "vitest";
import type { MeshData } from "./mesh-data";
import { acosApprox, cornerNormals } from "./normals";

/** Two triangles folded 90° along the edge from vertex 0 to vertex 1. */
function fold(): Pick<
  MeshData,
  | "positions"
  | "edges"
  | "faceOffsets"
  | "cornerVerts"
  | "cornerEdges"
  | "faceCount"
  | "cornerCount"
  | "edgeCount"
  | "vertexCount"
> {
  return {
    positions: Float32Array.of(0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1),
    edges: Int32Array.of(0, 1, 1, 2, 2, 0, 1, 3, 3, 0),
    faceOffsets: Int32Array.of(0, 3, 6),
    cornerVerts: Int32Array.of(0, 1, 2, 1, 0, 3),
    cornerEdges: Int32Array.of(0, 1, 2, 0, 4, 3),
    faceCount: 2,
    cornerCount: 6,
    edgeCount: 5,
    vertexCount: 4,
  };
}

/**
 * A 2×2 grid around vertex 4, numbered so that the first corner's previous edge is on the boundary and edge 0 leads to
 * the middle vertex, whose corners come later.
 */
function grid(): Parameters<typeof cornerNormals>[0] {
  return {
    positions: Float32Array.of(
      0,
      0,
      0,
      1,
      0,
      0.2,
      2,
      0,
      0,
      0,
      1,
      0.1,
      1,
      1,
      0.5,
      2,
      1,
      0.1,
      0,
      2,
      0,
      1,
      2,
      0.3,
      2,
      2,
      0,
    ),
    edges: Int32Array.of(4, 5, 7, 4, 5, 8, 8, 7, 1, 2, 2, 5, 4, 1, 0, 1, 4, 3, 3, 0, 7, 6, 6, 3),
    faceOffsets: Int32Array.of(0, 4, 8, 12, 16),
    cornerVerts: Int32Array.of(7, 4, 5, 8, 1, 2, 5, 4, 0, 1, 4, 3, 3, 4, 7, 6),
    cornerEdges: Int32Array.of(1, 0, 2, 3, 4, 5, 0, 6, 7, 6, 8, 9, 8, 1, 10, 11),
    faceCount: 4,
    cornerCount: 16,
    edgeCount: 12,
    vertexCount: 9,
  };
}

describe("cornerNormals", () => {
  it("averages the faces around a smooth vertex", () => {
    const normals = cornerNormals(fold(), {
      sharpFaces: null,
      sharpEdges: null,
      autoSmoothAngle: null,
      customNormals: null,
    });
    const [x = 0, y = 0, z = 0] = normals.subarray(0, 3);
    expect([x, y, z].map((value) => value + 0)).toEqual([0, Math.fround(Math.SQRT1_2), Math.fround(Math.SQRT1_2)]);
  });

  it("splits normals along a sharp edge", () => {
    const normals = cornerNormals(fold(), {
      sharpFaces: null,
      sharpEdges: Uint8Array.of(1, 0, 0, 0, 0),
      autoSmoothAngle: null,
      customNormals: null,
    });
    expect(Array.from(normals.subarray(0, 3)).map((value) => value + 0)).toEqual([0, 0, 1]);
    expect(Array.from(normals.subarray(9, 12)).map((value) => value + 0)).toEqual([0, 1, 0]);
  });

  it("splits normals where faces meet at more than the auto smooth angle of older files", () => {
    const normals = cornerNormals(fold(), {
      sharpFaces: null,
      sharpEdges: null,
      autoSmoothAngle: 0.5,
      customNormals: null,
    });
    expect(Array.from(normals.subarray(0, 3)).map((value) => value + 0)).toEqual([0, 0, 1]);
  });

  it("applies custom normals to a smooth fan whose corners come after a corner on the boundary, as Blender 5.2 does", () => {
    const blender = [
      [-0.310765, 0.093517, 0.945875],
      [0.314669, 0.101322, 0.943778],
      [0.252404, 0.263602, 0.931024],
      [0.039812, 0.108729, 0.993274],
      [0.297068, -0.140821, 0.944415],
      [0.249796, 0.112875, 0.961697],
      [0.252404, 0.263602, 0.931024],
      [0.314669, 0.101322, 0.943778],
      [0.015984, -0.156682, 0.98752],
      [0.297068, -0.140821, 0.944415],
      [0.314669, 0.101322, 0.943778],
      [-0.248053, -0.310128, 0.917764],
      [-0.248053, -0.310128, 0.917764],
      [0.314669, 0.101322, 0.943778],
      [-0.310765, 0.093517, 0.945875],
      [-0.291348, -0.152381, 0.944403],
    ];
    const customNormals = new Int16Array(32);
    for (let corner = 0; corner < 16; corner++) customNormals.set([6000, 2000], corner * 2);
    const normals = cornerNormals(grid(), { sharpFaces: null, sharpEdges: null, autoSmoothAngle: null, customNormals });
    blender.forEach((expected, corner) => {
      const actual = Array.from(normals.subarray(corner * 3, corner * 3 + 3));
      expect(
        Math.max(...actual.map((value, k) => Math.abs(value - (expected[k] ?? 0)))),
        `corner ${corner}`,
      ).toBeLessThan(1e-5);
    });
  });
});

describe("acosApprox", () => {
  it("stays within 1e-4 radians of the exact arccosine", () => {
    for (let x = -1; x <= 1; x += 0.01) expect(Math.abs(acosApprox(x) - Math.acos(x))).toBeLessThan(1e-4);
  });
});
