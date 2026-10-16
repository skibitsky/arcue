import type { UvTransform } from "@arcue/scene";

/** Blender's Mapping node types, `node.vector_type`. */
export const MappingType = { point: 0, texture: 1, vector: 2, normal: 3 } as const;

/** An affine map of 3D vectors as a row-major 3×4 matrix: the linear part, then the translation, in each row. */
export type Affine = readonly number[];

export const IDENTITY: Affine = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];

type Vec3 = readonly [number, number, number];

/** Blender's `euler_to_mat` for XYZ Euler angles: X turns first, then Y, then Z. */
function eulerMatrix([x, y, z]: Vec3): number[] {
  const [cx, sx, cy, sy, cz, sz] = [Math.cos(x), Math.sin(x), Math.cos(y), Math.sin(y), Math.cos(z), Math.sin(z)];
  return [
    cy * cz,
    sx * sy * cz - cx * sz,
    cx * sy * cz + sx * sz,
    cy * sz,
    sx * sy * sz + cx * cz,
    cx * sy * sz - sx * cz,
    -sy,
    sx * cy,
    cx * cy,
  ];
}

function safeInverse(value: number): number {
  return value === 0 ? 0 : 1 / value;
}

/**
 * What a Mapping node does to the vectors it reads, as `node_shader_mapping` computes it, or null for the Normal type,
 * which normalizes and so is not affine.
 */
export function mappingAffine(type: number, location: Vec3, rotation: Vec3, scale: Vec3): Affine | null {
  const r = eulerMatrix(rotation);
  const at = (row: number, column: number) => r[row * 3 + column] ?? 0;
  if (type === MappingType.point || type === MappingType.vector) {
    const offset = type === MappingType.point ? location : [0, 0, 0];
    return [0, 1, 2].flatMap((row) => [
      at(row, 0) * scale[0],
      at(row, 1) * scale[1],
      at(row, 2) * scale[2],
      offset[row] ?? 0,
    ]);
  }
  if (type === MappingType.texture) {
    return [0, 1, 2].flatMap((row) => {
      const inverse = safeInverse(scale[row] ?? 1);
      const [a, b, c] = [at(0, row) * inverse, at(1, row) * inverse, at(2, row) * inverse];
      return [a, b, c, -(a * location[0] + b * location[1] + c * location[2])];
    });
  }
  return null;
}

/** `outer` after `inner`: the map that applies `inner` to a vector, then `outer`. */
export function composeAffine(outer: Affine, inner: Affine): Affine {
  const at = (m: Affine, row: number, column: number) => m[row * 4 + column] ?? 0;
  return [0, 1, 2].flatMap((row) => [
    ...[0, 1, 2].map(
      (column) =>
        at(outer, row, 0) * at(inner, 0, column) +
        at(outer, row, 1) * at(inner, 1, column) +
        at(outer, row, 2) * at(inner, 2, column),
    ),
    at(outer, row, 0) * at(inner, 0, 3) +
      at(outer, row, 1) * at(inner, 1, 3) +
      at(outer, row, 2) * at(inner, 2, 3) +
      at(outer, row, 3),
  ]);
}

const EPSILON = 1e-9;

/**
 * The UV transform an affine map makes of UV coordinates, which Blender reads as (u, v, 0) and samples an image at x
 * and y of. `skewed` is true when the map shears UVs, which a transform of scale, rotation and offset cannot do, and
 * the transform then keeps its scale and turn along U.
 */
export function uvTransformOf(affine: Affine): { transform: UvTransform | null; skewed: boolean } {
  const [a = 1, b = 0, , tu = 0, c = 0, d = 1, , tv = 0] = affine;
  let rotation = Math.atan2(c, a);
  let scaleU = Math.hypot(a, c);
  let scaleV = -Math.sin(rotation) * b + Math.cos(rotation) * d;
  let along = Math.cos(rotation) * b + Math.sin(rotation) * d;
  if (scaleU < EPSILON) {
    rotation = Math.atan2(-b, d);
    scaleU = 0;
    scaleV = Math.hypot(b, d);
    along = 0;
  }
  const skewed = Math.abs(along) > 1e-6 * Math.max(1, Math.abs(scaleU), Math.abs(scaleV));
  return { transform: transformOrNull([tu, tv], [scaleU, scaleV], rotation), skewed };
}

/** A transform, or null when it leaves UVs as they are. */
function transformOrNull(offset: [number, number], scale: [number, number], rotation: number): UvTransform | null {
  const identity =
    Math.abs(offset[0]) < EPSILON &&
    Math.abs(offset[1]) < EPSILON &&
    Math.abs(scale[0] - 1) < EPSILON &&
    Math.abs(scale[1] - 1) < EPSILON &&
    Math.abs(rotation) < EPSILON;
  return identity ? null : { offset, scale, rotation };
}
