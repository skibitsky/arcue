import type { Quat, Vec3 } from "./types";

/** A column-major 4×4 matrix, the layout Blender stores `float[4][4]` in: three axes, then the translation. */
export type Mat4 = Float64Array;

export interface Trs {
  translation: Vec3;
  rotation: Quat;
  scale: Vec3;
}

export function identity(): Mat4 {
  return Float64Array.of(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
}

/** A matrix from 16 numbers in Blender's order; anything else is the identity. */
export function mat4From(values: readonly number[]): Mat4 {
  return values.length === 16 && values.every(Number.isFinite) ? Float64Array.from(values) : identity();
}

/** `a × b`, written into `out`, which must not be `a` or `b`. */
export function multiply(a: Mat4, b: Mat4, out: Mat4 = new Float64Array(16)): Mat4 {
  for (let column = 0; column < 4; column++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += (a[k * 4 + row] ?? 0) * (b[column * 4 + k] ?? 0);
      out[column * 4 + row] = sum;
    }
  }
  return out;
}

/** `a × b × c × …`, left to right. */
export function multiplyAll(...matrices: Mat4[]): Mat4 {
  return matrices.reduce((product, matrix) => multiply(product, matrix), identity());
}

/** The inverse of an affine matrix; a singular one inverts to the identity. */
export function invert(m: Mat4): Mat4 {
  const at = (index: number) => m[index] ?? 0;
  const [a, b, c, d, e, f, g, h, i] = [at(0), at(1), at(2), at(4), at(5), at(6), at(8), at(9), at(10)];
  const det = a * (e * i - f * h) - d * (b * i - c * h) + g * (b * f - c * e);
  if (!Number.isFinite(det) || Math.abs(det) < 1e-30) return identity();
  const r = 1 / det;
  const out = new Float64Array(16);
  out[0] = (e * i - f * h) * r;
  out[1] = (c * h - b * i) * r;
  out[2] = (b * f - c * e) * r;
  out[4] = (f * g - d * i) * r;
  out[5] = (a * i - c * g) * r;
  out[6] = (c * d - a * f) * r;
  out[8] = (d * h - e * g) * r;
  out[9] = (b * g - a * h) * r;
  out[10] = (a * e - b * d) * r;
  const [tx, ty, tz] = [at(12), at(13), at(14)];
  out[12] = -((out[0] ?? 0) * tx + (out[4] ?? 0) * ty + (out[8] ?? 0) * tz);
  out[13] = -((out[1] ?? 0) * tx + (out[5] ?? 0) * ty + (out[9] ?? 0) * tz);
  out[14] = -((out[2] ?? 0) * tx + (out[6] ?? 0) * ty + (out[10] ?? 0) * tz);
  out[15] = 1;
  return out;
}

export function translation(x: number, y: number, z: number): Mat4 {
  const m = identity();
  m[12] = x;
  m[13] = y;
  m[14] = z;
  return m;
}

export function determinant3(m: Mat4): number {
  const at = (index: number) => m[index] ?? 0;
  return (
    at(0) * (at(5) * at(10) - at(6) * at(9)) -
    at(4) * (at(1) * at(10) - at(2) * at(9)) +
    at(8) * (at(1) * at(6) - at(2) * at(5))
  );
}

export function transformPoint(m: Mat4, x: number, y: number, z: number): Vec3 {
  const at = (index: number) => m[index] ?? 0;
  return [
    at(0) * x + at(4) * y + at(8) * z + at(12),
    at(1) * x + at(5) * y + at(9) * z + at(13),
    at(2) * x + at(6) * y + at(10) * z + at(14),
  ];
}

export function transformDirection(m: Mat4, x: number, y: number, z: number): Vec3 {
  const at = (index: number) => m[index] ?? 0;
  return [at(0) * x + at(4) * y + at(8) * z, at(1) * x + at(5) * y + at(9) * z, at(2) * x + at(6) * y + at(10) * z];
}

/** Scale of each axis column. */
export function axisLengths(m: Mat4): Vec3 {
  const at = (index: number) => m[index] ?? 0;
  return [Math.hypot(at(0), at(1), at(2)), Math.hypot(at(4), at(5), at(6)), Math.hypot(at(8), at(9), at(10))];
}

export function quatMultiply(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

/** A unit quaternion; a zero one becomes the identity, as Blender normalizes it. */
function quatNormalize(q: Quat): Quat {
  const length = Math.hypot(q[0], q[1], q[2], q[3]);
  if (!(length > 1e-12) || !Number.isFinite(length)) return [0, 0, 0, 1];
  return [q[0] / length, q[1] / length, q[2] / length, q[3] / length];
}

function quatFromAxisAngle(axis: Vec3, angle: number): Quat {
  const length = Math.hypot(axis[0], axis[1], axis[2]);
  if (!(length > 1e-12) || !Number.isFinite(length)) return [0, 0, 0, 1];
  const s = Math.sin(angle / 2) / length;
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(angle / 2)];
}

/** Blender's rotation modes: quaternion, the six Euler orders, then axis-angle. */
export type RotationMode = "quaternion" | "XYZ" | "XZY" | "YXZ" | "YZX" | "ZXY" | "ZYX" | "axisAngle";

const EULER_ORDERS: readonly RotationMode[] = ["XYZ", "XZY", "YXZ", "YZX", "ZXY", "ZYX"];

/** The mode a `rotmode` member stores: 0 for quaternions, 1 to 6 for Euler orders, -1 for axis-angle. */
export function rotationMode(rotmode: number): RotationMode {
  if (rotmode === -1) return "axisAngle";
  return EULER_ORDERS[rotmode - 1] ?? "quaternion";
}

const AXES: Readonly<Record<string, Vec3>> = { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] };

/** Euler angles in radians, applied about the axes in the order the mode names, first axis first. */
export function quatFromEuler(angles: readonly number[], order: RotationMode): Quat {
  const axes = EULER_ORDERS.includes(order) ? order : "XYZ";
  let q: Quat = [0, 0, 0, 1];
  for (const axis of axes) {
    const index = axis === "X" ? 0 : axis === "Y" ? 1 : 2;
    q = quatMultiply(quatFromAxisAngle(AXES[axis] ?? [1, 0, 0], angles[index] ?? 0), q);
  }
  return q;
}

/** A rotation as Blender stores it in a mode: Euler angles, a wxyz quaternion, or an axis and an angle. */
export interface RotationValues {
  euler: readonly number[];
  /** w, x, y, z, as Blender stores quaternions. */
  quaternion: readonly number[];
  axis: readonly number[];
  angle: number;
}

export function rotationQuat(mode: RotationMode, values: RotationValues): Quat {
  if (mode === "quaternion") {
    const [w = 1, x = 0, y = 0, z = 0] = values.quaternion;
    return quatNormalize([x, y, z, w]);
  }
  if (mode === "axisAngle") {
    const [x = 0, y = 1, z = 0] = values.axis;
    return quatFromAxisAngle([x, y, z], values.angle);
  }
  return quatFromEuler(values.euler, mode);
}

/** The matrix of a translation, rotation and scale, written into `out`. */
export function compose({ translation: t, rotation, scale }: Trs, out: Mat4 = new Float64Array(16)): Mat4 {
  const [x, y, z, w] = rotation;
  const [sx, sy, sz] = scale;
  const x2 = x + x;
  const y2 = y + y;
  const z2 = z + z;
  const xx = x * x2;
  const xy = x * y2;
  const xz = x * z2;
  const yy = y * y2;
  const yz = y * z2;
  const zz = z * z2;
  const wx = w * x2;
  const wy = w * y2;
  const wz = w * z2;
  out[0] = (1 - (yy + zz)) * sx;
  out[1] = (xy + wz) * sx;
  out[2] = (xz - wy) * sx;
  out[3] = 0;
  out[4] = (xy - wz) * sy;
  out[5] = (1 - (xx + zz)) * sy;
  out[6] = (yz + wx) * sy;
  out[7] = 0;
  out[8] = (xz + wy) * sz;
  out[9] = (yz - wx) * sz;
  out[10] = (1 - (xx + yy)) * sz;
  out[11] = 0;
  out[12] = t[0];
  out[13] = t[1];
  out[14] = t[2];
  out[15] = 1;
  return out;
}

/** Scratch for `decompose`, which writes and reads only its upper 3×3. */
const DECOMPOSED_ROTATION = identity();

/** The rotation of a matrix whose axes are orthonormal. */
function quatFromRotationMatrix(m: Mat4): Quat {
  const at = (index: number) => m[index] ?? 0;
  const [m00, m10, m20, m01, m11, m21, m02, m12, m22] = [
    at(0),
    at(1),
    at(2),
    at(4),
    at(5),
    at(6),
    at(8),
    at(9),
    at(10),
  ];
  const trace = m00 + m11 + m22;
  let q: Quat;
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1);
    q = [(m21 - m12) * s, (m02 - m20) * s, (m10 - m01) * s, 0.25 / s];
  } else if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    q = [0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s];
  } else if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    q = [(m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s];
  } else {
    const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
    q = [(m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s];
  }
  return quatNormalize(q);
}

/** The shear below which a matrix counts as a plain translation, rotation and scale. */
export const SHEAR_TOLERANCE = 1e-4;

/** How far a matrix's axes are from orthogonal, as the largest cosine between two of them. */
export function shearOf(m: Mat4): number {
  const axis = (index: number) => {
    const x = m[index * 4] ?? 0;
    const y = m[index * 4 + 1] ?? 0;
    const z = m[index * 4 + 2] ?? 0;
    const length = Math.hypot(x, y, z) || 1;
    return [x / length, y / length, z / length];
  };
  const [x, y, z] = [axis(0), axis(1), axis(2)];
  const cosine = (a: number[], b: number[]) => Math.abs(a.reduce((sum, value, k) => sum + value * (b[k] ?? 0), 0));
  return Math.max(cosine(x, y), cosine(y, z), cosine(x, z));
}

/** Splits an affine matrix into translation, rotation and scale. Shear is lost; a mirror flips the x scale. */
export function decompose(m: Mat4): Trs {
  const at = (index: number) => m[index] ?? 0;
  let [sx, sy, sz] = axisLengths(m);
  if (determinant3(m) < 0) sx = -sx;
  const ix = sx === 0 ? 0 : 1 / sx;
  const iy = sy === 0 ? 0 : 1 / sy;
  const iz = sz === 0 ? 0 : 1 / sz;
  const rotation = DECOMPOSED_ROTATION;
  for (let row = 0; row < 3; row++) {
    rotation[row] = at(row) * ix;
    rotation[4 + row] = at(4 + row) * iy;
    rotation[8 + row] = at(8 + row) * iz;
  }
  return {
    translation: [at(12), at(13), at(14)],
    rotation: quatFromRotationMatrix(rotation),
    scale: [sx, sy, sz],
  };
}

const AXIS_SOURCE: readonly number[] = [0, 2, 1];
const AXIS_SIGN: readonly number[] = [1, 1, -1];

/**
 * `C × m × C⁻¹` for C, the conversion from Blender's Z-up axes to Y-up ones scaled by `unitScale`, which takes
 * (x, y, z) to (x, z, −y): the same transform, written in the scene's axes and units, into `out`, which must not be `m`.
 */
export function toSceneAxes(m: Mat4, unitScale: number, out: Mat4 = new Float64Array(16)): Mat4 {
  for (let column = 0; column < 3; column++) {
    for (let row = 0; row < 3; row++) {
      const sign = (AXIS_SIGN[row] ?? 1) * (AXIS_SIGN[column] ?? 1);
      out[column * 4 + row] = sign * (m[(AXIS_SOURCE[column] ?? 0) * 4 + (AXIS_SOURCE[row] ?? 0)] ?? 0);
    }
    out[column * 4 + 3] = 0;
    out[12 + column] = unitScale * (AXIS_SIGN[column] ?? 1) * (m[12 + (AXIS_SOURCE[column] ?? 0)] ?? 0);
  }
  out[15] = 1;
  return out;
}
