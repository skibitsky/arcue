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
});

describe("acosApprox", () => {
  it("stays within 1e-4 radians of the exact arccosine", () => {
    for (let x = -1; x <= 1; x += 0.01) expect(Math.abs(acosApprox(x) - Math.acos(x))).toBeLessThan(1e-4);
  });
});
