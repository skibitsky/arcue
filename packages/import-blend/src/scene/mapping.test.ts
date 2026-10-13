import type { UvTransform } from "@arcue/scene";
import { describe, expect, it } from "vitest";
import type { Affine } from "./mapping";
import { composeAffine, IDENTITY, MappingType, mappingAffine, uvTransformOf } from "./mapping";

function applyAffine(affine: Affine, [x, y, z]: [number, number, number]): number[] {
  return [0, 1, 2].map(
    (row) =>
      (affine[row * 4] ?? 0) * x +
      (affine[row * 4 + 1] ?? 0) * y +
      (affine[row * 4 + 2] ?? 0) * z +
      (affine[row * 4 + 3] ?? 0),
  );
}

/** Applies a UV transform in the order UvTransform gives: scale, then rotate, then offset. */
function applyTransform(transform: UvTransform | null, u: number, v: number): number[] {
  if (!transform) return [u, v];
  const { offset, scale, rotation } = transform;
  const [su, sv] = [u * scale[0], v * scale[1]];
  return [
    Math.cos(rotation) * su - Math.sin(rotation) * sv + offset[0],
    Math.sin(rotation) * su + Math.cos(rotation) * sv + offset[1],
  ];
}

const SAMPLES: [number, number][] = [
  [0, 0],
  [1, 0],
  [0, 1],
  [0.3, 0.7],
  [-0.5, 2],
];

function expectClose(actual: number[], expected: number[]): void {
  expect(actual).toHaveLength(expected.length);
  for (const [index, value] of actual.entries()) expect(value).toBeCloseTo(expected[index] ?? Number.NaN, 9);
}

/**
 * Where Blender's Point Mapping node with location (0.25, 0.1), Z rotation 0.3 and scale (2, 3) sends UVs, as Cycles
 * bakes them for the shading fixture's MappingPoint material: [u, v, x, y]. The viewport's tests sample with the same.
 */
const BLENDER_POINT_MAPPING: readonly [number, number, number, number][] = [
  [0.12525, 0.1255, 0.378048, 0.533712],
  [0.37525, 0.1255, 0.855717, 0.681473],
  [0.87525, 0.1255, 1.811052, 0.976992],
  [0.12525, 0.3755, 0.156408, 1.250214],
  [0.37525, 0.3755, 0.634077, 1.397974],
];

describe("a Mapping node", () => {
  it("sends UVs where Blender's does, and gives the transform of its own location, rotation and scale", () => {
    const affine = mappingAffine(MappingType.point, [0.25, 0.1, 0], [0, 0, 0.3], [2, 3, 1]) ?? IDENTITY;
    for (const [u, v, x, y] of BLENDER_POINT_MAPPING) {
      const [mappedU = Number.NaN, mappedV = Number.NaN] = applyAffine(affine, [u, v, 0]);
      expect(mappedU).toBeCloseTo(x, 5);
      expect(mappedV).toBeCloseTo(y, 5);
    }
    const { transform, skewed } = uvTransformOf(affine);
    expect(skewed).toBe(false);
    expectClose(
      [...(transform?.offset ?? []), ...(transform?.scale ?? []), transform?.rotation ?? Number.NaN],
      [0.25, 0.1, 2, 3, 0.3],
    );
  });

  it("scales, turns and then moves a point", () => {
    const affine = mappingAffine(MappingType.point, [0.25, 0.1, 0], [0, 0, Math.PI / 2], [2, 3, 1]);
    expectClose(applyAffine(affine ?? IDENTITY, [1, 1, 0]), [-3 + 0.25, 2 + 0.1, 0]);
  });

  it("undoes the Point map of the same values for the Texture type", () => {
    const location = [0.1, 0.2, 0.3] as const;
    const rotation = [0.4, -0.2, 0.7] as const;
    const scale = [2, 0.5, 3] as const;
    const point = mappingAffine(MappingType.point, location, rotation, scale) ?? IDENTITY;
    const texture = mappingAffine(MappingType.texture, location, rotation, scale) ?? IDENTITY;
    expectClose([...composeAffine(texture, point)], [...IDENTITY]);
  });

  it("leaves the location out for the Vector type and cannot follow the Normal type", () => {
    const vector = mappingAffine(MappingType.vector, [5, 5, 5], [0, 0, 0], [2, 2, 2]);
    expectClose(applyAffine(vector ?? IDENTITY, [1, 1, 0]), [2, 2, 0]);
    expect(mappingAffine(MappingType.normal, [0, 0, 0], [0, 0, 0], [1, 1, 1])).toBeNull();
  });

  it("gives zero, not infinity, for a Texture scale of zero, as Blender's safe divide does", () => {
    const texture = mappingAffine(MappingType.texture, [0, 0, 0], [0, 0, 0], [0, 2, 1]) ?? IDENTITY;
    expectClose(applyAffine(texture, [3, 4, 0]), [0, 2, 0]);
  });
});

describe("the UV transform of a Mapping", () => {
  it("reproduces every map that scales, turns and moves UVs", () => {
    for (const [type, rotation, scale] of [
      [MappingType.point, [0, 0, 0.3], [2, 3, 1]],
      [MappingType.texture, [0, 0, 0.5], [2, 2, 1]],
      [MappingType.point, [Math.PI, 0, 0], [1, 1, 1]],
      [MappingType.point, [1, 0, 0.4], [-2, 1, 1]],
      [MappingType.texture, [0, 0, 0], [0, 4, 1]],
    ] as const) {
      const affine = mappingAffine(type, [0.25, 0.5, 0.75], rotation, scale) ?? IDENTITY;
      const { transform, skewed } = uvTransformOf(affine);
      expect(skewed).toBe(false);
      for (const [u, v] of SAMPLES)
        expectClose(applyTransform(transform, u, v), applyAffine(affine, [u, v, 0]).slice(0, 2));
    }
  });

  it("reports a shear, which turning about both X and Y or scaling unevenly before a turn makes", () => {
    const tilted = mappingAffine(MappingType.point, [0, 0, 0], [0.5, 0.5, 0], [1, 1, 1]) ?? IDENTITY;
    expect(uvTransformOf(tilted).skewed).toBe(true);
    const texture = mappingAffine(MappingType.texture, [0, 0, 0], [0, 0, 0.5], [2, 3, 1]) ?? IDENTITY;
    expect(uvTransformOf(texture).skewed).toBe(true);
  });

  it("is null for a map that leaves UVs as they are", () => {
    const inverse = composeAffine(
      mappingAffine(MappingType.texture, [0.2, 0.3, 0], [0, 0, 1], [2, 2, 1]) ?? IDENTITY,
      mappingAffine(MappingType.point, [0.2, 0.3, 0], [0, 0, 1], [2, 2, 1]) ?? IDENTITY,
    );
    expect(uvTransformOf(inverse).transform).toBeNull();
  });
});
