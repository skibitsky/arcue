import type { Quat, Vec3 } from "./math";
import type { SceneNode } from "./node";

/** A column-major 4×4 matrix, as three.js and the scene contract store them. */
export type Matrix4 = Float64Array;

export interface Trs {
  translation: Vec3;
  rotation: Quat;
  scale: Vec3;
}

export function composeMatrix({ translation, rotation, scale }: Trs): Matrix4 {
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
  return Float64Array.of(
    (1 - (yy + zz)) * sx,
    (xy + wz) * sx,
    (xz - wy) * sx,
    0,
    (xy - wz) * sy,
    (1 - (xx + zz)) * sy,
    (yz + wx) * sy,
    0,
    (xz + wy) * sz,
    (yz - wx) * sz,
    (1 - (xx + yy)) * sz,
    0,
    translation[0],
    translation[1],
    translation[2],
    1,
  );
}

export function multiplyMatrices(a: Matrix4, b: Matrix4): Matrix4 {
  const out = new Float64Array(16);
  for (let column = 0; column < 4; column++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += (a[k * 4 + row] ?? 0) * (b[column * 4 + k] ?? 0);
      out[column * 4 + row] = sum;
    }
  }
  return out;
}

/** The inverse of an affine matrix; a singular one inverts to the identity. */
export function invertAffine(m: Matrix4): Matrix4 {
  const at = (index: number) => m[index] ?? 0;
  const [a, b, c, d, e, f, g, h, i] = [at(0), at(1), at(2), at(4), at(5), at(6), at(8), at(9), at(10)];
  const det = a * (e * i - f * h) - d * (b * i - c * h) + g * (b * f - c * e);
  if (Math.abs(det) < 1e-12) return identityMatrix();
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

export function identityMatrix(): Matrix4 {
  return Float64Array.of(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
}

/** Splits an affine matrix into translation, rotation and scale. Shear is lost; a mirror flips the x scale. */
export function decomposeMatrix(m: Matrix4): Trs {
  const at = (index: number) => m[index] ?? 0;
  let sx = Math.hypot(at(0), at(1), at(2));
  const sy = Math.hypot(at(4), at(5), at(6));
  const sz = Math.hypot(at(8), at(9), at(10));
  const det =
    at(0) * (at(5) * at(10) - at(6) * at(9)) -
    at(4) * (at(1) * at(10) - at(2) * at(9)) +
    at(8) * (at(1) * at(6) - at(2) * at(5));
  if (det < 0) sx = -sx;
  const ix = sx === 0 ? 0 : 1 / sx;
  const iy = sy === 0 ? 0 : 1 / sy;
  const iz = sz === 0 ? 0 : 1 / sz;
  const m00 = at(0) * ix;
  const m10 = at(1) * ix;
  const m20 = at(2) * ix;
  const m01 = at(4) * iy;
  const m11 = at(5) * iy;
  const m21 = at(6) * iy;
  const m02 = at(8) * iz;
  const m12 = at(9) * iz;
  const m22 = at(10) * iz;
  let rotation: Quat;
  const trace = m00 + m11 + m22;
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1);
    rotation = [(m21 - m12) * s, (m02 - m20) * s, (m10 - m01) * s, 0.25 / s];
  } else if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    rotation = [0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s];
  } else if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    rotation = [(m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s];
  } else {
    const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
    rotation = [(m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s];
  }
  const length = Math.hypot(...rotation) || 1;
  return {
    translation: [at(12), at(13), at(14)],
    rotation: [rotation[0] / length, rotation[1] / length, rotation[2] / length, rotation[3] / length],
    scale: [sx, sy, sz],
  };
}

/** Each node's rest transform in scene space. Parents come before their children, as the scene contract requires. */
export function restWorldMatrices(nodes: readonly Pick<SceneNode, "parent" | "translation" | "rotation" | "scale">[]) {
  const worlds: Matrix4[] = [];
  for (const node of nodes) {
    const local = composeMatrix(node);
    const parent = node.parent >= 0 ? worlds[node.parent] : undefined;
    worlds.push(parent ? multiplyMatrices(parent, local) : local);
  }
  return worlds;
}
