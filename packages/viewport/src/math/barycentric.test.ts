import type { Vec3 } from "@arcue/scene";
import { describe, expect, it } from "vitest";
import { mixPoint, rayTriangleWeights, roundWeights } from "./barycentric";

const a: Vec3 = [0, 0, 0];
const b: Vec3 = [1, 0, 0];
const c: Vec3 = [0, 1, 0];

describe("rayTriangleWeights", () => {
  it("gives the weights of the hit point", () => {
    const hit = rayTriangleWeights([0.3, 0.3, 5], [0, 0, -1], a, b, c);
    expect(hit?.weights).toEqual([expect.closeTo(0.4, 9), expect.closeTo(0.3, 9), expect.closeTo(0.3, 9)]);
    expect(hit?.distance).toBeCloseTo(5, 9);
  });

  it("recovers the point it hit", () => {
    const tilted: [Vec3, Vec3, Vec3] = [
      [0.2, 1.1, -0.4],
      [1.3, 0.9, 0.2],
      [0.5, 2.0, 0.8],
    ];
    const target = mixPoint([0.2, 0.5, 0.3], ...tilted);
    const origin: Vec3 = [3, 4, 5];
    const direction: Vec3 = [target[0] - origin[0], target[1] - origin[1], target[2] - origin[2]];
    const hit = rayTriangleWeights(origin, direction, ...tilted);
    expect(hit?.weights).toEqual([expect.closeTo(0.2, 9), expect.closeTo(0.5, 9), expect.closeTo(0.3, 9)]);
    expect(hit?.distance).toBeCloseTo(1, 9);
  });

  it("clamps a ray that grazes past an edge onto the edge", () => {
    const hit = rayTriangleWeights([0.6, 0.6, 1], [0, 0, -1], a, b, c);
    expect(hit?.weights).toEqual([expect.closeTo(0, 9), expect.closeTo(0.5, 9), expect.closeTo(0.5, 9)]);
  });

  it("gives nothing for a parallel ray or a triangle without area", () => {
    expect(rayTriangleWeights([0, 0, 1], [1, 0, 0], a, b, c)).toBeNull();
    expect(rayTriangleWeights([0, 0, 1], [0, 0, -1], a, a, c)).toBeNull();
  });
});

describe("roundWeights", () => {
  it("rounds to six decimals and keeps the sum at 1 without going negative", () => {
    const rounded = roundWeights([0.3333334, 0.6666667, 0]);
    expect(rounded.every((weight) => weight >= 0)).toBe(true);
    expect(rounded[0] + rounded[1] + rounded[2]).toBeCloseTo(1, 9);
    expect(roundWeights([1 / 3, 1 / 3, 1 / 3])).toEqual([0.333333, 0.333333, 0.333334]);
  });
});
