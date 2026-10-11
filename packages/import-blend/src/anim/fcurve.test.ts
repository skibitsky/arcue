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
    const cycles: CurveModifier = {
      type: "cycles",
      before: 1,
      after: 2,
      beforeCycles: 0,
      afterCycles: 0,
      range: null,
      influence: 1,
    };
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

  it("passes the midpoint of an exponential ease in and out", () => {
    const expo = curve(
      [
        [0, 0],
        [10, 1],
      ],
      { interpolation: Interpolation.expo },
    );
    expo.keys.easing.fill(3);
    const values = [4.9, 5, 5.1].map((frame) => evaluateFCurve(expo, frame));
    values.forEach((value, index) => {
      expect(value).toBeCloseTo([0.435212, 0.5, 0.564788][index] ?? 0, 5);
    });
  });

  it("ramps a restricted Limits modifier in and out at its influence, as Blender does", () => {
    const limits: CurveModifier = {
      type: "limits",
      rect: [0, 0, 0, 0.2],
      flag: 8,
      range: { start: 2, end: 8, blendIn: 2, blendOut: 1 },
      influence: 0.5,
    };
    const ramp = curve(
      [
        [0, 0],
        [10, 1],
      ],
      { modifiers: [limits] },
    );
    const frames = [1, 2, 3, 4, 5, 7, 7.5, 8, 9];
    const expected = [0.1, 0.2, 0.275, 0.3, 0.35, 0.45, 0.6125, 0.8, 0.9];
    frames.forEach((frame, index) => {
      expect(evaluateFCurve(ramp, frame)).toBeCloseTo(expected[index] ?? 0, 6);
    });
  });

  it("mixes Stepped and Cycles time changes by their influence, as Blender does", () => {
    const stepped: CurveModifier = {
      type: "stepped",
      step: 4,
      offset: 0,
      start: 0,
      end: 0,
      noBefore: false,
      noAfter: false,
      range: { start: 1, end: 9, blendIn: 2, blendOut: 0 },
      influence: 0.5,
    };
    const points: [number, number][] = [
      [0, 0],
      [10, 10],
    ];
    const steps = curve(points, { modifiers: [stepped] });
    expect([0.5, 1, 2, 3, 5, 7, 9, 9.5].map((frame) => evaluateFCurve(steps, frame))).toEqual([
      0.5, 1, 1.5, 1.5, 4.5, 5.5, 8.5, 9.5,
    ]);

    const cycles: CurveModifier = {
      type: "cycles",
      before: 0,
      after: 2,
      beforeCycles: 0,
      afterCycles: 0,
      range: null,
      influence: 0.25,
    };
    const repeated = curve(points, { modifiers: [cycles] });
    expect([5, 12, 15, 25].map((frame) => evaluateFCurve(repeated, frame))).toEqual([5, 12, 12.5, 15]);
    const fading = curve(points, { modifiers: [{ ...cycles, range: { start: 0, end: 20, blendIn: 0, blendOut: 4 } }] });
    const faded = [12, 18, 20, 25].map((frame) => evaluateFCurve(fading, frame));
    [12, 12.03125, 10, 10].forEach((value, index) => {
      expect(faded[index]).toBeCloseTo(value, 6);
    });
  });

  it("reads curves Blender stores as baked samples", () => {
    const baked = curve([], { samples: Float32Array.of(1, 2, 4), sampleStart: 10 });
    expect(evaluateFCurve(baked, 11.5)).toBeCloseTo(3);
    expect(keyFrames(baked)).toEqual([10, 11, 12]);
  });

  it("interpolates baked samples between the frames around a negative time", () => {
    const baked = curve([], { samples: Float32Array.of(0, 10, 20), sampleStart: -2 });
    expect(evaluateFCurve(baked, -1.5)).toBeCloseTo(5);
    expect(evaluateFCurve(baked, -0.5)).toBeCloseTo(15);
  });
});
