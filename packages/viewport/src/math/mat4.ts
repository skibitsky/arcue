/** Column-major 4×4 matrices stored 16 values apart in a Float64Array, as three.js and the scene contract store them. */

export function composeInto(
  out: Float64Array,
  offset: number,
  translation: ArrayLike<number>,
  translationOffset: number,
  rotation: ArrayLike<number>,
  rotationOffset: number,
  scale: ArrayLike<number>,
  scaleOffset: number,
): void {
  const x = rotation[rotationOffset] ?? 0;
  const y = rotation[rotationOffset + 1] ?? 0;
  const z = rotation[rotationOffset + 2] ?? 0;
  const w = rotation[rotationOffset + 3] ?? 1;
  const sx = scale[scaleOffset] ?? 1;
  const sy = scale[scaleOffset + 1] ?? 1;
  const sz = scale[scaleOffset + 2] ?? 1;
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
  out[offset] = (1 - (yy + zz)) * sx;
  out[offset + 1] = (xy + wz) * sx;
  out[offset + 2] = (xz - wy) * sx;
  out[offset + 3] = 0;
  out[offset + 4] = (xy - wz) * sy;
  out[offset + 5] = (1 - (xx + zz)) * sy;
  out[offset + 6] = (yz + wx) * sy;
  out[offset + 7] = 0;
  out[offset + 8] = (xz + wy) * sz;
  out[offset + 9] = (yz - wx) * sz;
  out[offset + 10] = (1 - (xx + yy)) * sz;
  out[offset + 11] = 0;
  out[offset + 12] = translation[translationOffset] ?? 0;
  out[offset + 13] = translation[translationOffset + 1] ?? 0;
  out[offset + 14] = translation[translationOffset + 2] ?? 0;
  out[offset + 15] = 1;
}

/** out = a × b. The 16 values written must not overlap either input's 16 values. */
export function multiplyInto(
  out: Float64Array,
  outOffset: number,
  a: ArrayLike<number>,
  aOffset: number,
  b: ArrayLike<number>,
  bOffset: number,
): void {
  for (let column = 0; column < 4; column++) {
    const b0 = b[bOffset + column * 4] ?? 0;
    const b1 = b[bOffset + column * 4 + 1] ?? 0;
    const b2 = b[bOffset + column * 4 + 2] ?? 0;
    const b3 = b[bOffset + column * 4 + 3] ?? 0;
    for (let row = 0; row < 4; row++) {
      out[outOffset + column * 4 + row] =
        (a[aOffset + row] ?? 0) * b0 +
        (a[aOffset + 4 + row] ?? 0) * b1 +
        (a[aOffset + 8 + row] ?? 0) * b2 +
        (a[aOffset + 12 + row] ?? 0) * b3;
    }
  }
}

export const IDENTITY: readonly number[] = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

export function transformPointInto(
  out: Float64Array | Float32Array | number[],
  outOffset: number,
  m: ArrayLike<number>,
  mOffset: number,
  x: number,
  y: number,
  z: number,
): void {
  out[outOffset] =
    (m[mOffset] ?? 0) * x + (m[mOffset + 4] ?? 0) * y + (m[mOffset + 8] ?? 0) * z + (m[mOffset + 12] ?? 0);
  out[outOffset + 1] =
    (m[mOffset + 1] ?? 0) * x + (m[mOffset + 5] ?? 0) * y + (m[mOffset + 9] ?? 0) * z + (m[mOffset + 13] ?? 0);
  out[outOffset + 2] =
    (m[mOffset + 2] ?? 0) * x + (m[mOffset + 6] ?? 0) * y + (m[mOffset + 10] ?? 0) * z + (m[mOffset + 14] ?? 0);
}
