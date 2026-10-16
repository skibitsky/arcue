import { describe, expect, it } from "vitest";
import { compose, decompose, invert, multiply, quatFromEuler, rotationQuat, toSceneAxes } from "./math";

describe("quatFromEuler", () => {
  it.each([
    ["XYZ", [0.296892, -0.215672, 0.52917, 0.765062]],
    ["XZY", [-0.05754, -0.215672, 0.52917, 0.818629]],
    ["YXZ", [0.296892, -0.215672, 0.4418, 0.818629]],
    ["YZX", [0.296892, -0.36242, 0.4418, 0.765062]],
    ["ZXY", [-0.05754, -0.36242, 0.52917, 0.765062]],
    ["ZYX", [-0.05754, -0.36242, 0.4418, 0.818629]],
  ] as const)("matches Blender's Euler(0.3, -0.7, 1.1, %s).to_quaternion()", (order, expected) => {
    const q = quatFromEuler([0.3, -0.7, 1.1], order);
    q.forEach((value, index) => {
      expect(value).toBeCloseTo(expected[index] ?? 0, 5);
    });
  });
});

describe("rotationQuat", () => {
  it("reads Blender's w-first quaternions and normalizes them", () => {
    expect(rotationQuat("quaternion", { euler: [], quaternion: [2, 0, 0, 0], axis: [], angle: 0 })).toEqual([
      0, 0, 0, 1,
    ]);
  });

  it("takes an axis without length as no rotation, as Blender does", () => {
    expect(rotationQuat("axisAngle", { euler: [], quaternion: [], axis: [0, 0, 0], angle: 1 })).toEqual([0, 0, 0, 1]);
  });
});

describe("toSceneAxes", () => {
  it("is the transform conjugated by Blender's Z-up to Y-up conversion and the unit scale", () => {
    const m = compose({ translation: [1, 2, 3], rotation: [0.1, 0.5, -0.3, 0.8], scale: [1, 2, 0.5] });
    const s = 0.01;
    const conversion = Float64Array.of(s, 0, 0, 0, 0, 0, -s, 0, 0, s, 0, 0, 0, 0, 0, 1);
    const expected = multiply(multiply(conversion, m), invert(conversion));
    Array.from(toSceneAxes(m, s)).forEach((value, index) => {
      expect(value).toBeCloseTo(expected[index] ?? 0, 12);
    });
  });
});

describe("decompose", () => {
  it("returns the translation, rotation and scale a matrix was composed from, a mirror as negative x scale", () => {
    const trs = {
      translation: [4, -1, 2] as [number, number, number],
      rotation: [0, 0.6, 0, 0.8] as [number, number, number, number],
      scale: [-2, 1, 3] as [number, number, number],
    };
    const back = decompose(compose(trs));
    back.translation.forEach((value, index) => {
      expect(value).toBeCloseTo(trs.translation[index] ?? 0, 12);
    });
    back.scale.forEach((value, index) => {
      expect(value).toBeCloseTo(trs.scale[index] ?? 0, 12);
    });
    const dot = back.rotation.reduce((sum, value, index) => sum + value * (trs.rotation[index] ?? 0), 0);
    expect(Math.abs(dot)).toBeCloseTo(1, 12);
  });
});
