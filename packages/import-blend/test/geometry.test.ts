import { describe, expect, it } from "vitest";
import { cornerMismatches, pointsError } from "./geometry";

describe("pointsError", () => {
  it("is the largest distance between matching points", () => {
    expect(pointsError([0, 0, 0, 1, 1, 1], [0, 0, 1, 1, 1, 1])).toBe(1);
  });

  it("refuses lists of different lengths, so a mesh that lost vertices cannot pass", () => {
    expect(() => pointsError([], [0, 0, 0])).toThrow(RangeError);
    expect(() => pointsError([0, 0, 0], [0, 0, 0, 1, 1, 1])).toThrow(RangeError);
  });
});

describe("cornerMismatches", () => {
  /** A quad of four source vertices that draws a seam at vertex 0: two rendered vertices with different UVs. */
  const mesh = {
    indices: Uint32Array.of(0, 1, 2, 4, 2, 3),
    sourceVertex: Uint32Array.of(0, 1, 2, 3, 0),
    normals: Float32Array.from({ length: 15 }, (_, index) => (index % 3 === 2 ? 1 : 0)),
    uvs: [{ name: "UVMap", values: Float32Array.of(0, 0, 1, 0, 1, 1, 0, 1, 0.5, 0) }],
    colors: null,
  };
  const reference = {
    loopTriangles: [
      [0, 1, 2],
      [4, 2, 3],
    ],
    loopVertices: [0, 1, 2, 3, 0],
    normals: Array.from({ length: 5 }, () => [0, 0, 1]),
    uvs: { UVMap: [0, 0, 1, 0, 1, 1, 0, 1, 0.5, 0] },
  };

  it("finds nothing where every triangle corner draws its loop's values", () => {
    expect(cornerMismatches(mesh, reference)).toEqual([]);
  });

  it("finds a triangle corner that draws another corner's rendered vertex of the same source vertex", () => {
    const indices = Uint32Array.of(0, 1, 2, 0, 2, 3);
    expect(cornerMismatches({ ...mesh, indices }, reference)).toEqual([
      "triangle 1 of vertices 0 2 3: UV map UVMap 0,0, Blender 0.5,0",
    ]);
  });

  it("finds triangles Blender does not make", () => {
    const indices = Uint32Array.of(0, 1, 3, 4, 2, 3);
    expect(cornerMismatches({ ...mesh, indices }, reference)).toEqual([
      "triangle 0 of vertices 0 1 3: Blender has no triangle of these vertices",
    ]);
  });
});
