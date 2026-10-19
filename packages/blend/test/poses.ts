import type { BlendNode, Track } from "../src/types.js";

/** The nodes of a scene, as `readBlend` and the importers built on it give them. */
export interface PosedScene {
  nodes: readonly Pick<BlendNode, "parent" | "translation" | "rotation" | "scale">[];
}

export type Matrix = Float64Array;

export function identity(): Matrix {
  return Float64Array.of(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
}

export function multiply(a: ArrayLike<number>, b: ArrayLike<number>): Matrix {
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

export function transformPoint(m: ArrayLike<number>, x: number, y: number, z: number): [number, number, number] {
  const at = (index: number) => m[index] ?? 0;
  return [
    at(0) * x + at(4) * y + at(8) * z + at(12),
    at(1) * x + at(5) * y + at(9) * z + at(13),
    at(2) * x + at(6) * y + at(10) * z + at(14),
  ];
}

export function composeTrs(t: readonly number[], q: readonly number[], s: readonly number[]): Matrix {
  const [qx = 0, qy = 0, qz = 0, qw = 1] = q;
  const [sx = 1, sy = 1, sz = 1] = s;
  const xx = qx * qx;
  const yy = qy * qy;
  const zz = qz * qz;
  const xy = qx * qy;
  const xz = qx * qz;
  const yz = qy * qz;
  const wx = qw * qx;
  const wy = qw * qy;
  const wz = qw * qz;
  return Float64Array.of(
    (1 - 2 * (yy + zz)) * sx,
    2 * (xy + wz) * sx,
    2 * (xz - wy) * sx,
    0,
    2 * (xy - wz) * sy,
    (1 - 2 * (xx + zz)) * sy,
    2 * (yz + wx) * sy,
    0,
    2 * (xz + wy) * sz,
    2 * (yz - wx) * sz,
    (1 - 2 * (xx + yy)) * sz,
    0,
    t[0] ?? 0,
    t[1] ?? 0,
    t[2] ?? 0,
    1,
  );
}

/** The largest difference between two matrices' elements. */
export function matrixError(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let worst = 0;
  for (let i = 0; i < 16; i++) worst = Math.max(worst, Math.abs((a[i] ?? 0) - (b[i] ?? 0)));
  return worst;
}

/**
 * The track's value at `time`: linear between keys, spherical for rotations, held for step tracks. A key counts as
 * reached at or before the float32 rounding of `time`, within 1e-6 seconds, and the track interpolates at that
 * rounding, as the viewport's `sampleTrack` does.
 */
export function sampleTrack(track: Track, time: number): number[] {
  const width = track.values.length / track.times.length;
  const reached = Math.max(time, Math.fround(time)) + 1e-6;
  let key = 0;
  while (key + 1 < track.times.length && (track.times[key + 1] ?? 0) <= reached) key++;
  const before = Array.from(track.values.subarray(key * width, key * width + width));
  const after = Array.from(track.values.subarray((key + 1) * width, (key + 2) * width));
  const t0 = track.times[key] ?? 0;
  const t1 = track.times[key + 1] ?? t0;
  if (after.length < width || track.interpolation === "step" || t1 <= t0) return before;
  const f = Math.min(Math.max((Math.fround(time) - t0) / (t1 - t0), 0), 1);
  if (track.property !== "rotation") return before.map((value, i) => value + f * ((after[i] ?? 0) - value));
  const dot = before.reduce((sum, value, i) => sum + value * (after[i] ?? 0), 0);
  const sign = dot < 0 ? -1 : 1;
  const angle = Math.acos(Math.min(1, Math.abs(dot)));
  const a = angle < 1e-6 ? 1 - f : Math.sin((1 - f) * angle) / Math.sin(angle);
  const b = angle < 1e-6 ? f : Math.sin(f * angle) / Math.sin(angle);
  return before.map((value, i) => a * value + b * sign * (after[i] ?? 0));
}

/** World matrices of every node at `time` in the clip, or in the rest pose without a clip. */
export function worldMatrices(scene: PosedScene, clip: { tracks: readonly Track[] } | null = null, time = 0): Matrix[] {
  const worlds: Matrix[] = [];
  for (const [index, node] of scene.nodes.entries()) {
    let translation: readonly number[] = node.translation;
    let rotation: readonly number[] = node.rotation;
    let scale: readonly number[] = node.scale;
    for (const track of clip?.tracks ?? []) {
      if (track.node !== index) continue;
      if (track.property === "translation") translation = sampleTrack(track, time);
      if (track.property === "rotation") rotation = sampleTrack(track, time);
      if (track.property === "scale") scale = sampleTrack(track, time);
    }
    const local = composeTrs(translation, rotation, scale);
    const parent = node.parent === -1 ? undefined : worlds[node.parent];
    worlds.push(parent ? multiply(parent, local) : local);
  }
  return worlds;
}

/** The largest distance between matching points of two xyz arrays, which must hold the same number of points. */
export function pointsError(a: ArrayLike<number>, b: ArrayLike<number>): number {
  if (a.length !== b.length || a.length % 3 !== 0) {
    throw new RangeError(`Comparing ${a.length} values with ${b.length}, not two lists of the same points.`);
  }
  let worst = 0;
  for (let i = 0; i < a.length; i += 3) {
    worst = Math.max(
      worst,
      Math.hypot((a[i] ?? 0) - (b[i] ?? 0), (a[i + 1] ?? 0) - (b[i + 1] ?? 0), (a[i + 2] ?? 0) - (b[i + 2] ?? 0)),
    );
  }
  return worst;
}
