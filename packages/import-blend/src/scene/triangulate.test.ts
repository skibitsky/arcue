import type { SceneDescription } from "@arcue/scene";
import { describe, expect, it } from "vitest";
import { importFixture, type Reference, reference, VERSIONS } from "../../test/fixtures";
import { triangulate } from "./triangulate";

/**
 * The triangles of a mesh with one face through the given corners, as corner triplets in order, for a file saved by the
 * given Blender version.
 */
function triangles(corners: readonly (readonly number[])[], blenderVersion = 502): number[][] {
  const mesh = {
    positions: Float32Array.from(corners.flat()),
    faceOffsets: Int32Array.of(0, corners.length),
    cornerVerts: Int32Array.from(corners.keys()),
    faceCount: 1,
  };
  const { corners: result } = triangulate(mesh, blenderVersion);
  return Array.from({ length: result.length / 3 }, (_, index) => Array.from(result.subarray(index * 3, index * 3 + 3)));
}

function circle(radius: number, steps: readonly number[]): number[][] {
  return steps.map((k) => [radius * Math.cos((2 * Math.PI * k) / 8), radius * Math.sin((2 * Math.PI * k) / 8), 0]);
}

describe("triangulate, against the loop triangles of Blender 5.2 and, where given, 4.2", () => {
  it("splits a quad along its first diagonal unless that folds it", () => {
    expect(
      triangles([
        [0, 0, 0],
        [1, 0, 0],
        [1, 1, 0],
        [0, 1, 0],
      ]),
    ).toEqual([
      [0, 1, 2],
      [0, 2, 3],
    ]);
    expect(
      triangles([
        [0, 0, 0],
        [2, 1, 0],
        [0, 2, 0],
        [0.5, 1, 0],
      ]),
    ).toEqual([
      [0, 1, 3],
      [1, 2, 3],
    ]);
  });

  it("clips every other corner of a convex polygon, which picks the diagonals of a bent hexagon", () => {
    const crown = Array.from({ length: 6 }, (_, k) => [
      Math.cos((2 * Math.PI * k) / 6),
      Math.sin((2 * Math.PI * k) / 6),
      k % 2 ? 0.4 : -0.4,
    ]);
    expect(triangles(crown)).toEqual([
      [5, 0, 1],
      [1, 2, 3],
      [3, 4, 5],
      [1, 3, 5],
    ]);
  });

  it("clips a convex corner before one in line with its neighbors", () => {
    const midEdge = [
      [1, 0, 0],
      [2, 0, 0],
      [2, 1, 0],
      [0, 1, 0],
      [0, 0, 0],
    ];
    const expected = [
      [0, 1, 2],
      [2, 3, 4],
      [0, 2, 4],
    ];
    expect(triangles(midEdge, 402)).toEqual(expected);
    expect(triangles(midEdge, 502)).toEqual(expected);
  });

  it("tests a corner on the line of a flat ear as Blender 4.2 does, or as 5.1 and later do", () => {
    const line = [
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
      [3, 0, 0],
      [2, 0, 0],
    ];
    expect(triangles(line, 402)).toEqual([
      [2, 3, 4],
      [1, 2, 4],
      [0, 1, 4],
    ]);
    expect(triangles(line, 502)).toEqual([
      [4, 0, 1],
      [2, 3, 4],
      [1, 2, 4],
    ]);
  });

  it("keeps a concave polygon's triangles inside it", () => {
    expect(
      triangles([
        [0, 0, 0],
        [3, 0, 0],
        [3, 3, 0],
        [2, 3, 0],
        [2, 1, 0],
        [1, 1, 0],
        [1, 3, 0],
        [0, 3, 0],
      ]),
    ).toEqual([
      [1, 2, 3],
      [1, 3, 4],
      [6, 7, 0],
      [1, 4, 5],
      [5, 6, 0],
      [0, 1, 5],
    ]);
  });

  it("fills around a hole joined to the outside by corners at the same place", () => {
    expect(
      triangles([
        [0, 0, 0],
        [4, 0, 0],
        [4, 4, 0],
        [0, 4, 0],
        [0, 0, 0],
        [1, 1, 0],
        [1, 3, 0],
        [3, 3, 0],
        [3, 1, 0],
        [1, 1, 0],
      ]),
    ).toEqual([
      [9, 0, 1],
      [3, 4, 5],
      [3, 5, 6],
      [8, 9, 1],
      [3, 6, 7],
      [7, 8, 1],
      [2, 3, 7],
      [1, 2, 7],
    ]);
    const outer = circle(2, [0, 1, 2, 3, 4, 5, 6, 7, 0]);
    const inner = circle(1, [0, 7, 6, 5, 4, 3, 2, 1, 0]);
    expect(triangles([...outer, ...inner])).toEqual([
      [17, 0, 1],
      [1, 2, 3],
      [3, 4, 5],
      [5, 6, 7],
      [7, 8, 9],
      [7, 9, 10],
      [16, 17, 1],
      [15, 16, 1],
      [7, 10, 11],
      [5, 7, 11],
      [15, 1, 3],
      [14, 15, 3],
      [5, 11, 12],
      [13, 14, 3],
      [5, 12, 13],
      [3, 5, 13],
    ]);
  });

  it("leaves a slit of no width open and clips a corner that lies on the line of its neighbors", () => {
    expect(
      triangles([
        [0, 0, 0],
        [4, 0, 0],
        [4, 4, 0],
        [2, 4, 0],
        [2, 1.5, 0],
        [2, 4, 0],
        [0, 4, 0],
      ]),
    ).toEqual([
      [1, 2, 3],
      [4, 5, 6],
      [1, 3, 4],
      [4, 6, 0],
      [0, 1, 4],
    ]);
    expect(
      triangles([
        [0, 0, 0],
        [2, 0, 0],
        [2, 2, 0],
        [1, 1, 0],
        [1, 1, 0],
        [0, 2, 0],
      ]),
    ).toEqual([
      [2, 3, 4],
      [4, 5, 0],
      [1, 2, 4],
      [0, 1, 4],
    ]);
  });
});

type TriangleReference = Reference & { loopTriangles: Record<string, number[][]> };

/** The triangles of an imported mesh that are not among Blender's loop triangles, and Blender's it does not make. */
function triangleMismatches(scene: SceneDescription, name: string, expected: readonly number[][]) {
  const mesh = scene.meshes.find((candidate) => candidate.name === name);
  if (!mesh) throw new Error(`No mesh ${name}.`);
  const made = Array.from({ length: mesh.indices.length / 3 }, (_, triangle) =>
    [0, 1, 2].map((k) => mesh.sourceVertex[mesh.indices[triangle * 3 + k] ?? 0] ?? -1).join(" "),
  );
  const blender = expected.map((triangle) => triangle.join(" "));
  const ours = new Set(made);
  const theirs = new Set(blender);
  return {
    count: [made.length, blender.length],
    extra: made.filter((triangle) => !theirs.has(triangle)),
    missing: blender.filter((triangle) => !ours.has(triangle)),
  };
}

describe.each(VERSIONS)("triangulate, against a file from Blender %s", async (version) => {
  const features = await importFixture("features", version);
  const polyfill = await importFixture("polyfill", version);

  it("makes the triangles Blender's mesh tessellation makes, each as the vertices of its corners", () => {
    const expected = reference("features", version) as TriangleReference;
    expect(Object.keys(expected.loopTriangles)).toEqual(["Polygons", "NGons"]);
    for (const [name, triangles] of Object.entries(expected.loopTriangles)) {
      const mismatches = triangleMismatches(features, name, triangles);
      expect(mismatches, name).toEqual({ count: [triangles.length, triangles.length], extra: [], missing: [] });
    }
  });

  it("makes Blender's triangles for n-gons with corners in line, repeated or far from the origin", () => {
    const expected = reference("polyfill", version) as TriangleReference;
    expect(Object.keys(expected.loopTriangles)).toEqual([
      "Stars",
      "Keyholes",
      "Walks",
      "BentRings",
      "FarRings",
      "Runs",
    ]);
    for (const [name, triangles] of Object.entries(expected.loopTriangles)) {
      const mismatches = triangleMismatches(polyfill, name, triangles);
      expect(mismatches, name).toEqual({ count: [triangles.length, triangles.length], extra: [], missing: [] });
    }
  });
});
