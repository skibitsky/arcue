import { describe, expect, it } from "vitest";
import type { Trs } from "./transform";
import { composeMatrix, decomposeMatrix, identityMatrix, invertAffine, multiplyMatrices } from "./transform";

const turned: Trs = {
  translation: [1, 2, -3],
  rotation: [0.1825742, 0.3651484, 0.5477226, 0.7302967],
  scale: [2, 0.5, 1.5],
};

function close(values: ArrayLike<number>, expected: ArrayLike<number>): void {
  expect(values.length).toBe(expected.length);
  for (let index = 0; index < values.length; index++) {
    expect(values[index]).toBeCloseTo(expected[index] ?? Number.NaN, 6);
  }
}

describe("transform", () => {
  it("decomposes what it composed", () => {
    const { translation, rotation, scale } = decomposeMatrix(composeMatrix(turned));
    close(translation, turned.translation);
    close(rotation, turned.rotation);
    close(scale, turned.scale);
  });

  it("keeps a mirror as a negative x scale", () => {
    const mirrored = decomposeMatrix(composeMatrix({ ...turned, scale: [-1, 1, 1] }));
    close(composeMatrix(mirrored), composeMatrix({ ...turned, scale: [-1, 1, 1] }));
  });

  it("inverts an affine matrix", () => {
    const matrix = composeMatrix(turned);
    close(multiplyMatrices(invertAffine(matrix), matrix), identityMatrix());
  });
});
