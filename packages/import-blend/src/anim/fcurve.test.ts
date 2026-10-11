import { describe, expect, it } from "vitest";
import type { CurveModifier, FCurve, Keys } from "./fcurve";
import { evaluateFCurve, Interpolation, isStepped, keyFrames } from "./fcurve";

function keys(points: [frame: number, value: number][], interpolation: number = Interpolation.linear): Keys {
  const count = points.length;
  const at = (index: number) => points[index] ?? [0, 0];
  return {
    count,
    frame: Float64Array.from(points, (point) => point[0]),
    value: Float64Array.from(points, (point) => point[1]),
    leftFrame: Float64Array.from(points, (_, index) => at(index)[0] - 1),
    leftValue: Float64Array.from(points, (_, index) => at(index)[1]),
    rightFrame: Float64Array.from(points, (_, index) => at(index)[0] + 1),
    rightValue: Float64Array.from(points, (_, index) => at(index)[1]),
    interpolation: new Uint8Array(count).fill(interpolation),
    easing: new Uint8Array(count),
    back: new Float32Array(count),
    amplitude: new Float32Array(count),
    period: new Float32Array(count),
  };
}

function curve(points: [number, number][], options: Partial<FCurve> & { interpolation?: number } = {}): FCurve {
  const { interpolation, ...rest } = options;
  return {
    path: "location",
    index: 0,
    keys: keys(points, interpolation),
    samples: null,
    sampleStart: 0,
    linearExtrapolation: false,
    discrete: false,
    muted: false,
    modifiers: [],
    unsupportedModifiers: [],
    ...rest,
  };
}

describe("evaluateFCurve", () => {
  it("interpolates linearly and holds the end values outside the keys", () => {
    const linear = curve([
      [1, 0],
      [11, 10],
    ]);
    expect(evaluateFCurve(linear, 6)).toBeCloseTo(5);
    expect(evaluateFCurve(linear, -5)).toBe(0);
    expect(evaluateFCurve(linear, 20)).toBe(10);
  });

  it("extrapolates along the end segments when the curve says so", () => {
    const linear = curve(
      [
        [1, 0],
        [11, 10],
      ],
      { linearExtrapolation: true },
    );
    expect(evaluateFCurve(linear, 21)).toBeCloseTo(20);
    expect(evaluateFCurve(linear, -1)).toBeCloseTo(-2);
  });

  it("holds each value until the next key under constant interpolation", () => {
    const stepped = curve(
      [
        [0, 1],
        [4, 3],
      ],
      { interpolation: Interpolation.constant },
    );
    expect(evaluateFCurve(stepped, 3.9)).toBe(1);
    expect(evaluateFCurve(stepped, 4)).toBe(3);
    expect(isStepped(stepped)).toBe(true);
  });

  it("follows a Bezier segment with flat handles through its midpoint", () => {
    const smooth = curve(
      [
        [0, 0],
        [10, 1],
      ],
      { interpolation: Interpolation.bezier },
    );
    expect(evaluateFCurve(smooth, 5)).toBeCloseTo(0.5, 5);
    expect(evaluateFCurve(smooth, 2)).toBeLessThan(0.2);
  });

  it("repeats the keyed range with a Cycles modifier, offset per cycle when it says so", () => {
    const cycles: CurveModifier = { type: "cycles", before: 1, after: 2, beforeCycles: 0, afterCycles: 0 };
    const ramp = curve(
      [
        [0, 0],
        [10, 1],
      ],
      { modifiers: [cycles] },
    );
    expect(evaluateFCurve(ramp, 15)).toBeCloseTo(1.5);
    expect(evaluateFCurve(ramp, -5)).toBeCloseTo(0.5);
  });

  it("reads curves Blender stores as baked samples", () => {
    const baked = curve([], { samples: Float32Array.of(1, 2, 4), sampleStart: 10 });
    expect(evaluateFCurve(baked, 11.5)).toBeCloseTo(3);
    expect(keyFrames(baked)).toEqual([10, 11, 12]);
  });
});
