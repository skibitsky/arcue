import { describe, expect, it } from "vitest";
import { findTriangle, forEachNeighbor, regionAnchor, regionTriangles, triangleAdjacency } from "./regions";
import { stripScene } from "./test-fixture";

function strip() {
  const mesh = stripScene().meshes[0];
  if (!mesh) throw new Error("fixture");
  return mesh;
}

describe("regionAnchor", () => {
  it("stores painted triangles and their source vertices as ranges", () => {
    expect(regionAnchor("Strip", strip(), [3, 1, 2, 2])).toEqual({
      kind: "region",
      mesh: "Strip",
      triangles: [[1, 3]],
      vertices: [
        [0, 0],
        [2, 5],
      ],
    });
  });

  it("maps a seam's duplicate rendered vertex to its source vertex", () => {
    expect(regionAnchor("Strip", strip(), [3])?.vertices).toEqual([
      [2, 2],
      [4, 5],
    ]);
  });

  it("gives nothing for an empty stroke", () => {
    expect(regionAnchor("Strip", strip(), [])).toBeNull();
  });
});

describe("regionTriangles", () => {
  it("decodes ranges that fit the mesh and refuses the rest", () => {
    const anchor = {
      kind: "region" as const,
      mesh: "Strip",
      triangles: [
        [0, 1],
        [3, 3],
      ] as [number, number][],
      vertices: [],
    };
    expect([...(regionTriangles(anchor, 4) ?? [])]).toEqual([0, 1, 3]);
    expect(regionTriangles(anchor, 3)).toBeNull();
    expect(
      regionTriangles(
        {
          ...anchor,
          triangles: [
            [2, 3],
            [0, 1],
          ],
        },
        4,
      ),
    ).toBeNull();
  });
});

describe("triangleAdjacency", () => {
  it("connects triangles across a seam through their source vertices", () => {
    const mesh = strip();
    const adjacency = triangleAdjacency(mesh);
    const neighbors = new Set<number>();
    forEachNeighbor(mesh, adjacency, 3, (triangle) => neighbors.add(triangle));
    expect([...neighbors].sort()).toEqual([1, 2, 3]);
  });

  it("finds a triangle by its source vertices in any order", () => {
    const mesh = strip();
    const adjacency = triangleAdjacency(mesh);
    expect(findTriangle(mesh, adjacency, [4, 2, 5])).toBe(3);
    expect(findTriangle(mesh, adjacency, [0, 1, 5])).toBe(-1);
  });
});
