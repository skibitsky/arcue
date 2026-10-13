import { describe, expect, it } from "vitest";
import type { FileDefinition } from "../../test/synthetic";
import { writeBlend } from "../../test/synthetic";
import { readBlendFile } from "../blend/file";
import type { CurveModifier, FCurve, Keys } from "./fcurve";
import {
  canJump,
  canJumpAfter,
  curveEvaluator,
  evaluateFCurve,
  Interpolation,
  jumpFrames,
  keyFrames,
  readFCurve,
} from "./fcurve";

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
    empty: false,
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
    expect(canJump(stepped, 0, 10)).toBe(true);
    expect(jumpFrames(stepped, 0, 10, 100)).toEqual([4]);
  });

  it("finds jumps at the keys that end a constant segment, not at a constant last key", () => {
    const smooth = curve([
      [0, 1],
      [4, 3],
      [8, 5],
    ]);
    smooth.keys.interpolation[2] = Interpolation.constant;
    expect(canJump(smooth, 0, 10)).toBe(false);
    expect(jumpFrames(smooth, 0, 10, 100)).toEqual([]);
    smooth.keys.interpolation[1] = Interpolation.constant;
    expect(canJump(smooth, 0, 10)).toBe(true);
    expect(jumpFrames(smooth, 0, 10, 100)).toEqual([8]);
  });

  it("finds the steps of a Stepped modifier inside the range, and leaves steps under a frame to interpolation", () => {
    const stepped: CurveModifier = {
      type: "stepped",
      step: 2.5,
      offset: 0.5,
      start: 0,
      end: 0,
      noBefore: false,
      noAfter: false,
      range: null,
      influence: 1,
    };
    const ramp = curve(
      [
        [0, 0],
        [10, 10],
      ],
      { modifiers: [stepped] },
    );
    expect(canJump(ramp, 1, 9)).toBe(true);
    expect(jumpFrames(ramp, 1, 9, 100)).toEqual([3, 5.5, 8]);
    const fine = curve(
      [
        [0, 0],
        [10, 10],
      ],
      { modifiers: [{ ...stepped, step: 0.5 }] },
    );
    expect(canJump(fine, 1, 9)).toBe(false);
  });

  it("finds that a Stepped modifier's steps before its offset jump just after their frame", () => {
    const stepped: CurveModifier = {
      type: "stepped",
      step: 2,
      offset: 6,
      start: 0,
      end: 0,
      noBefore: false,
      noAfter: false,
      range: null,
      influence: 1,
    };
    const ramp = curve(
      [
        [1, 0],
        [13, 12],
      ],
      { modifiers: [stepped] },
    );
    expect([2, 2.5, 4, 4.5, 5.9, 6, 7.9, 8].map((frame) => evaluateFCurve(ramp, frame))).toEqual([
      1, 3, 3, 5, 5, 5, 5, 7,
    ]);
    expect(canJumpAfter(ramp, 1, 13)).toBe(true);
    expect(canJumpAfter(ramp, 5, 13)).toBe(false);
    expect(canJumpAfter({ ...ramp, modifiers: [{ ...stepped, offset: 0 }] }, 1, 13)).toBe(false);
  });

  it("finds the jumps a Cycles modifier repeats, and the ends of its cycles, which jump just after the frame", () => {
    const cycles: CurveModifier = {
      type: "cycles",
      before: "none",
      after: "repeat",
      beforeCycles: 0,
      afterCycles: 0,
      range: null,
      influence: 1,
    };
    const constant = curve(
      [
        [1, 0],
        [2.5, 1],
        [4, 0],
      ],
      { interpolation: Interpolation.constant, modifiers: [cycles] },
    );
    expect(canJump(constant, 1, 10)).toBe(true);
    expect([3.999, 4, 4.001].map((frame) => evaluateFCurve(constant, frame))).toEqual([1, 0, 0]);
    expect(canJumpAfter(constant, 1, 10)).toBe(false);
    expect([...new Set(jumpFrames(constant, 1, 10, 100))].sort((a, b) => a - b)).toEqual([2.5, 4, 5.5, 7, 8.5]);
    const ramp = curve(
      [
        [1, 0],
        [3, 1],
      ],
      { modifiers: [cycles] },
    );
    expect(canJump(ramp, 1, 10)).toBe(false);
    expect(canJumpAfter(ramp, 1, 10)).toBe(true);
    expect(canJumpAfter(ramp, 1, 3)).toBe(false);
    expect(canJumpAfter(ramp, 3, 5.5)).toBe(true);
    expect(canJumpAfter({ ...ramp, modifiers: [{ ...cycles, after: "repeat-offset" }] }, 1, 10)).toBe(false);
    [1, 0.0005, 1, 0.125].forEach((value, index) => {
      expect(evaluateFCurve(ramp, [3, 3.001, 5, 5.25][index] ?? 0)).toBeCloseTo(value, 9);
    });
  });

  it("finds that a Cycles modifier repeating before the first key jumps at the start of each cycle", () => {
    const cycles: CurveModifier = {
      type: "cycles",
      before: "repeat",
      after: "none",
      beforeCycles: 0,
      afterCycles: 0,
      range: null,
      influence: 1,
    };
    const ramp = curve(
      [
        [20, 0],
        [30, 10],
      ],
      { modifiers: [cycles] },
    );
    [9.5, 0, 0.5, 9.5, 0].forEach((value, index) => {
      expect(evaluateFCurve(ramp, [9.5, 10, 10.5, 19.5, 20][index] ?? 0)).toBeCloseTo(value, 9);
    });
    expect(canJump(ramp, 0, 40)).toBe(true);
    expect(canJump(ramp, 0, 10)).toBe(true);
    expect(canJump(ramp, 10, 19.5)).toBe(false);
    expect(canJump(ramp, 20, 40)).toBe(false);
    expect(canJump({ ...ramp, modifiers: [{ ...cycles, before: "repeat-offset" }] }, 0, 40)).toBe(false);
    expect(canJump({ ...ramp, modifiers: [{ ...cycles, before: "none", after: "repeat" }] }, 0, 40)).toBe(false);
    expect(canJumpAfter(ramp, 0, 40)).toBe(false);
  });

  it("gives up on finding jumps past a limit, counting only the frames inside the range", () => {
    const halves = curve(
      Array.from({ length: 41 }, (_, index): [number, number] => [index / 2, index]),
      { interpolation: Interpolation.constant },
    );
    expect(jumpFrames(halves, 5, 10, 9)).toEqual([5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5]);
    expect(jumpFrames(halves, 5, 10, 8)).toBeNull();
    const cycles: CurveModifier = {
      type: "cycles",
      before: "repeat",
      after: "repeat",
      beforeCycles: 0,
      afterCycles: 0,
      range: null,
      influence: 1,
    };
    const cycled = { ...halves, modifiers: [cycles] };
    expect(jumpFrames(cycled, 0, 1e9, 100_000)).toBeNull();
    const stepped: CurveModifier = {
      type: "stepped",
      step: 1,
      offset: 0.5,
      start: 0,
      end: 0,
      noBefore: false,
      noAfter: false,
      range: null,
      influence: 1,
    };
    expect(jumpFrames({ ...halves, modifiers: [stepped] }, 0, 1e9, 100_000)).toBeNull();
  });

  it("counts each jump once, so that jumps a Cycles or Stepped modifier repeats on whole frames stay under the limit", () => {
    const wholes = curve(
      Array.from({ length: 11 }, (_, index): [number, number] => [index, index % 2]),
      { interpolation: Interpolation.constant },
    );
    const cycles: CurveModifier = {
      type: "cycles",
      before: "repeat",
      after: "repeat",
      beforeCycles: 0,
      afterCycles: 0,
      range: null,
      influence: 1,
    };
    const stepped: CurveModifier = {
      type: "stepped",
      step: 1,
      offset: 0,
      start: 0,
      end: 0,
      noBefore: false,
      noAfter: false,
      range: null,
      influence: 1,
    };
    expect(jumpFrames({ ...wholes, modifiers: [cycles] }, 0, 99_999, 100_000)).toHaveLength(99_998);
    const mirrored: FCurve = { ...wholes, modifiers: [{ ...cycles, before: "mirror", after: "mirror" }] };
    expect(jumpFrames(mirrored, 0, 99_999, 100_000)).toHaveLength(99_998);
    expect(jumpFrames({ ...wholes, modifiers: [cycles, stepped] }, 0, 60_001, 100_000)).toHaveLength(60_000);
    const shared = curve(
      Array.from({ length: 20_000 }, (_, index): [number, number] => (index < 10_000 ? [0, 0] : [1, 1])),
      { interpolation: Interpolation.constant, modifiers: [cycles] },
    );
    expect(jumpFrames(shared, 0, 100_000, 100_000)).toHaveLength(99_999);
  });

  it("mirrors the jumps of a curve with more keys than a call takes arguments", () => {
    const many = curve(
      Array.from({ length: 130_000 }, (_, index): [number, number] => [index * 0.37, index % 7]),
      { interpolation: Interpolation.constant },
    );
    const mirror: CurveModifier = {
      type: "cycles",
      before: "mirror",
      after: "mirror",
      beforeCycles: 0,
      afterCycles: 0,
      range: null,
      influence: 1,
    };
    const frames = jumpFrames({ ...many, modifiers: [mirror] }, 1, 1001, 100_000) ?? [];
    expect(frames.length).toBeGreaterThan(2700);
    expect(frames.every((frame) => frame > 1 && frame < 1001)).toBe(true);
    const uneven = curve(
      [
        [0, 0],
        [1, 1],
        [4, 0],
      ],
      { interpolation: Interpolation.constant, modifiers: [mirror] },
    );
    expect(jumpFrames(uneven, 0, 12, 100)?.sort((a, b) => a - b)).toEqual([1, 3, 4, 5, 7, 8, 9, 11]);
  });

  it("finds that mirrored constant keys jump just after each mirrored key, on either side, as Blender does", () => {
    const mirror: CurveModifier = {
      type: "cycles",
      before: "none",
      after: "mirror",
      beforeCycles: 0,
      afterCycles: 0,
      range: null,
      influence: 1,
    };
    const points: [number, number][] = [
      [1, 0],
      [5, 1],
      [9, 2],
    ];
    const after = curve(points, { interpolation: Interpolation.constant, modifiers: [mirror] });
    expect([9, 9.125, 10, 13, 13.125, 17].map((frame) => evaluateFCurve(after, frame))).toEqual([2, 1, 1, 1, 0, 0]);
    expect(canJumpAfter(after, 1, 17)).toBe(true);
    expect(canJumpAfter(after, 1, 9)).toBe(false);
    expect(jumpFrames(after, 1, 17, 100)).toEqual(expect.arrayContaining([9, 13]));

    const before = curve(points, {
      interpolation: Interpolation.constant,
      modifiers: [{ ...mirror, before: "mirror", after: "none" }],
    });
    expect([-7, -6.875, -3, -2.875, 1].map((frame) => evaluateFCurve(before, frame))).toEqual([2, 1, 1, 0, 0]);
    expect(canJumpAfter(before, -7, 1)).toBe(true);
    expect(canJumpAfter(before, 1, 17)).toBe(false);

    expect(canJumpAfter(curve(points, { modifiers: [mirror] }), 1, 17)).toBe(false);
    expect(canJumpAfter(curve(points, { discrete: true, modifiers: [mirror] }), 1, 17)).toBe(true);
  });

  it("finds jumps under a Stepped modifier of a frame or more per step, at any influence or frame range", () => {
    const step: CurveModifier = {
      type: "stepped",
      step: 2,
      offset: 0,
      start: 0,
      end: 0,
      noBefore: false,
      noAfter: false,
      range: null,
      influence: 1,
    };
    const points: [number, number][] = [
      [0, 0],
      [10, 10],
    ];
    expect(canJump(curve(points, { modifiers: [step] }), 0, 10)).toBe(true);
    const half = curve(points, { modifiers: [{ ...step, influence: 0.5 }] });
    expect(canJump(half, 0, 10)).toBe(true);
    expect([3.5, 4].map((frame) => evaluateFCurve(half, frame))).toEqual([2.75, 4]);
    expect(canJump(curve(points, { modifiers: [{ ...step, noAfter: true }] }), 0, 10)).toBe(true);
    expect(canJump(curve(points, { modifiers: [{ ...step, step: 0.5 }] }), 0, 10)).toBe(false);
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

  describe("shortens only the Bezier handles that alone reach further than the other key, as Blender does", () => {
    const cases: {
      name: string;
      keys: [number, number][];
      handles: [right: [number, number], left: [number, number]];
      expected: [frame: number, value: number][];
    }[] = [
      {
        name: "two handles together longer than the gap",
        keys: [
          [1, 0],
          [11, 1],
        ],
        handles: [
          [7, 0],
          [5, 1],
        ],
        expected: [
          [3, 0.047968],
          [5, 0.272978],
          [8, 0.87277],
        ],
      },
      {
        name: "one handle longer than the gap",
        keys: [
          [0, 0],
          [10, 1],
        ],
        handles: [
          [15, 0.5],
          [8, 1],
        ],
        expected: [
          [2, 0.077742],
          [5, 0.255562],
          [7.5, 0.532811],
          [9, 0.890625],
        ],
      },
      {
        name: "handles that cross each other and both reach past the other key",
        keys: [
          [0, 0],
          [10, 1],
        ],
        handles: [
          [12, 0],
          [-2, 1],
        ],
        expected: [
          [2, 0.017425],
          [4, 0.111397],
          [5, 0.5],
          [6, 0.888603],
          [8, 0.982574],
        ],
      },
      {
        name: "handles that cross where single-precision rounding moves the root, as Blender computes it",
        keys: [
          [1, 0],
          [11, 1],
        ],
        handles: [
          [13.375432968139648, -0.25715550780296326],
          [-5.168770790100098, 1.6142659187316895],
        ],
        expected: [
          [5, 0.06906],
          [6, 0.568995],
          [7, 1.015879],
        ],
      },
      {
        name: "handles that overlap in time",
        keys: [
          [0, 0],
          [10, 1],
        ],
        handles: [
          [9, 0.3],
          [1, 0.6],
        ],
        expected: [
          [1, 0.035984],
          [3, 0.134223],
          [5, 0.4625],
          [7, 0.827785],
          [9, 0.952503],
        ],
      },
    ];
    for (const { name, keys: points, handles, expected } of cases) {
      it(name, () => {
        const smooth = curve(points, { interpolation: Interpolation.bezier });
        const [[rightFrame, rightValue], [leftFrame, leftValue]] = handles;
        smooth.keys.rightFrame[0] = rightFrame;
        smooth.keys.rightValue[0] = rightValue;
        smooth.keys.leftFrame[1] = leftFrame;
        smooth.keys.leftValue[1] = leftValue;
        for (const [frame, value] of expected) {
          expect(evaluateFCurve(smooth, frame), `at ${frame}`).toBeCloseTo(value, 5);
        }
      });
    }
  });

  it("repeats the keyed range with a Cycles modifier, offset per cycle when it says so", () => {
    const cycles: CurveModifier = {
      type: "cycles",
      before: "repeat",
      after: "repeat-offset",
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
      minFrame: null,
      maxFrame: null,
      minValue: null,
      maxValue: 0.2,
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

  it("holds time at the lower bound of a Limits modifier whose bounds cross, as Blender does", () => {
    const limits: CurveModifier = {
      type: "limits",
      minFrame: 6,
      maxFrame: 4,
      minValue: null,
      maxValue: null,
      range: null,
      influence: 1,
    };
    const ramp = curve(
      [
        [0, 0],
        [10, 10],
      ],
      { modifiers: [limits] },
    );
    expect([2, 5, 8].map((frame) => evaluateFCurve(ramp, frame))).toEqual([6, 6, 4]);
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
      before: "none",
      after: "repeat-offset",
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

describe("curveEvaluator", () => {
  it("gives what evaluateFCurve gives, at rising and falling frames, on keys, near them and between them", () => {
    const cycles: CurveModifier = {
      type: "cycles",
      before: "repeat",
      after: "repeat",
      beforeCycles: 0,
      afterCycles: 0,
      range: null,
      influence: 1,
    };
    const spread = Array.from({ length: 40 }, (_, k): [number, number] => [k * 1.5 + (k % 3) * 0.25, Math.sin(k)]);
    const crowded: [number, number][] = [
      [0, 0],
      [1, 1],
      [1.00005, 2],
      [1.0002, 3],
      [3, 4],
    ];
    const curves = [
      curve(spread),
      curve(spread, { interpolation: Interpolation.constant }),
      curve(spread, { interpolation: Interpolation.bezier, modifiers: [cycles] }),
      curve(crowded, { interpolation: Interpolation.constant }),
    ];
    const near = [...spread, ...crowded].flatMap(([frame]) =>
      [-0.00011, -0.0001, -0.00009, 0, 0.00009, 0.0001, 0.00011].map((offset) => frame + offset),
    );
    const rising = Array.from({ length: 2400 }, (_, k) => -5 + k * 0.0371);
    const frames = [...rising, ...near, ...[...rising].reverse()];
    for (const tested of curves) {
      const valueAt = curveEvaluator(tested);
      const found = frames.map((frame) => valueAt(frame));
      const expected = frames.map((frame) => evaluateFCurve(tested, frame));
      expect(found.every((value, index) => Object.is(value, expected[index]))).toBe(true);
    }
  });
});

describe("readFCurve", () => {
  /** How many keys a curve of `count` keys reads, each a struct of `fields`, in a file written from scratch. */
  const keysOf = (fields: [string, string][], count: number) => {
    const structs: FileDefinition["structs"] = [
      { type: "BezTriple", fields },
      {
        type: "FCurve",
        fields: [
          ["BezTriple", "*bezt"],
          ["int", "totvert"],
        ],
      },
    ];
    const bytes = writeBlend({
      header: "old",
      pointerSize: 8,
      little: true,
      structs,
      blocks: [
        { code: "DATA", struct: "FCurve", address: 0x100n, data: [{ bezt: 0x200n, totvert: count }] },
        { code: "DATA", struct: "BezTriple", address: 0x200n, data: Array.from({ length: count }, () => ({})) },
      ],
    });
    const file = readBlendFile(bytes);
    const block = file.blocksWithCode("DATA").find((candidate) => candidate.struct?.type === "FCurve");
    const [struct] = block ? file.elements(block) : [];
    if (!struct) throw new Error("No curve was written.");
    return readFCurve(struct).keys.count;
  };

  it("reads keys only from a key struct laid out as Blender's", () => {
    expect(keysOf([["float", "vec[3][3]"]], 3)).toBe(3);
    expect(keysOf([["char", "vec"]], 4096)).toBe(0);
    expect(keysOf([["float", "vec[3]"]], 16)).toBe(0);
  });

  it("names the modes and flags of its Cycles, Stepped and Limits modifiers", () => {
    const structs: FileDefinition["structs"] = [
      {
        type: "ListBase",
        fields: [
          ["void", "*first"],
          ["void", "*last"],
        ],
      },
      {
        type: "FModifier",
        fields: [
          ["FModifier", "*next"],
          ["FModifier", "*prev"],
          ["void", "*data"],
          ["short", "type"],
          ["short", "flag"],
        ],
      },
      {
        type: "FMod_Cycles",
        fields: [
          ["short", "before_mode"],
          ["short", "after_mode"],
          ["short", "before_cycles"],
          ["short", "after_cycles"],
        ],
      },
      {
        type: "FMod_Stepped",
        fields: [
          ["float", "step_size"],
          ["float", "offset"],
          ["float", "start_frame"],
          ["float", "end_frame"],
          ["int", "flag"],
        ],
      },
      {
        type: "rctf",
        fields: [
          ["float", "xmin"],
          ["float", "xmax"],
          ["float", "ymin"],
          ["float", "ymax"],
        ],
      },
      {
        type: "FMod_Limits",
        fields: [
          ["rctf", "rect"],
          ["int", "flag"],
        ],
      },
      { type: "FCurve", fields: [["ListBase", "modifiers"]] },
    ];
    const modifiersOf = (cycles: [before: number, after: number], stepped: number, limits: number) => {
      const bytes = writeBlend({
        header: "old",
        pointerSize: 8,
        little: true,
        structs,
        blocks: [
          { code: "DATA", struct: "FCurve", address: 0x100n, data: [{ modifiers: { first: 0x200n, last: 0x220n } }] },
          { code: "DATA", struct: "FModifier", address: 0x200n, data: [{ next: 0x210n, data: 0x300n, type: 4 }] },
          { code: "DATA", struct: "FModifier", address: 0x210n, data: [{ next: 0x220n, data: 0x310n, type: 9 }] },
          { code: "DATA", struct: "FModifier", address: 0x220n, data: [{ data: 0x320n, type: 8 }] },
          {
            code: "DATA",
            struct: "FMod_Cycles",
            address: 0x300n,
            data: [{ before_mode: cycles[0], after_mode: cycles[1] }],
          },
          { code: "DATA", struct: "FMod_Stepped", address: 0x310n, data: [{ step_size: 2, flag: stepped }] },
          {
            code: "DATA",
            struct: "FMod_Limits",
            address: 0x320n,
            data: [{ rect: { xmin: 2, xmax: 8, ymin: -1, ymax: 3 }, flag: limits }],
          },
        ],
      });
      const file = readBlendFile(bytes);
      const block = file.blocksWithCode("DATA").find((candidate) => candidate.struct?.type === "FCurve");
      const [struct] = block ? file.elements(block) : [];
      if (!struct) throw new Error("No curve was written.");
      return readFCurve(struct).modifiers;
    };
    const [cycles, stepped, limits] = modifiersOf([3, 2], 1, 0b1010);
    expect(cycles).toMatchObject({ type: "cycles", before: "mirror", after: "repeat-offset" });
    expect(stepped).toMatchObject({ type: "stepped", step: 2, noBefore: true, noAfter: false });
    expect(limits).toMatchObject({ type: "limits", minFrame: null, maxFrame: 8, minValue: null, maxValue: 3 });
    const [none, , open] = modifiersOf([0, 7], 2, 0b0101);
    expect(none).toMatchObject({ before: "none", after: "repeat" });
    expect(open).toMatchObject({ minFrame: 2, maxFrame: null, minValue: -1, maxValue: null });
  });
});
