import { describe, expect, it } from "vitest";
import { closestPointOnTriangle, closestSurfacePoint, nearestVertex, sourceIndices } from "./geometry";
import type { Vec3 } from "./math";

const a: Vec3 = [0, 0, 0];
const b: Vec3 = [1, 0, 0];
const c: Vec3 = [0, 1, 0];

function expectWeights(actual: number[], expected: number[]) {
  for (const [index, weight] of actual.entries()) expect(weight).toBeCloseTo(expected[index] ?? Number.NaN, 6);
}

describe("closestPointOnTriangle", () => {
  it("projects a point above the triangle onto its face", () => {
    expectWeights(closestPointOnTriangle([0.25, 0.25, 3], a, b, c), [0.5, 0.25, 0.25]);
  });

  it("snaps to a corner beyond it", () => {
    expectWeights(closestPointOnTriangle([-1, -1, 0], a, b, c), [1, 0, 0]);
    expectWeights(closestPointOnTriangle([2, -0.5, 0], a, b, c), [0, 1, 0]);
    expectWeights(closestPointOnTriangle([-0.5, 2, 0], a, b, c), [0, 0, 1]);
  });

  it("snaps to an edge beside it", () => {
    expectWeights(closestPointOnTriangle([0.5, -1, 0], a, b, c), [0.5, 0.5, 0]);
    expectWeights(closestPointOnTriangle([1, 1, 0], a, b, c), [0, 0.5, 0.5]);
    expectWeights(closestPointOnTriangle([-1, 0.5, 0], a, b, c), [0.5, 0, 0.5]);
  });

  it("returns a corner for a degenerate triangle", () => {
    expectWeights(closestPointOnTriangle([0, 0, 1], a, a, a), [1, 0, 0]);
  });
});

describe("closestSurfacePoint", () => {
  const positions = Float32Array.of(0, 0, 0, 1, 0, 0, 0, 1, 0, 10, 0, 0, 11, 0, 0, 10, 1, 0);
  const indices = Uint32Array.of(0, 1, 2, 3, 4, 5);

  it("picks the nearest triangle and the point on it", () => {
    const hit = closestSurfacePoint(positions, indices, [10.2, 0.2, 0.5]);
    expect(hit?.triangle).toBe(1);
    expect(hit?.distance).toBeCloseTo(0.5, 6);
    expect(hit?.point[0]).toBeCloseTo(10.2, 6);
    expect(hit?.point[2]).toBeCloseTo(0, 6);
  });

  it("returns null without triangles", () => {
    expect(closestSurfacePoint(positions, new Uint32Array(0), [0, 0, 0])).toBeNull();
  });

  it("rejects indices outside the positions", () => {
    expect(() => closestSurfacePoint(positions, Uint32Array.of(0, 1, 9), [0, 0, 0])).toThrow(RangeError);
  });
});

describe("nearestVertex", () => {
  it("finds the closest vertex", () => {
    expect(nearestVertex(Float32Array.of(0, 0, 0, 5, 5, 5, 1, 0, 0), [0.9, 0, 0])).toEqual({
      vertex: 2,
      distance: expect.closeTo(0.1, 6),
    });
    expect(nearestVertex(new Float32Array(0), [0, 0, 0])).toBeNull();
  });
});

describe("sourceIndices", () => {
  it("maps rendered vertices to source vertices", () => {
    expect([...sourceIndices(Uint32Array.of(0, 1, 2, 4, 5, 3), Uint32Array.of(0, 1, 2, 3, 0, 2))]).toEqual([
      0, 1, 2, 0, 2, 3,
    ]);
    expect(() => sourceIndices(Uint32Array.of(7), Uint32Array.of(0))).toThrow(RangeError);
  });
});
