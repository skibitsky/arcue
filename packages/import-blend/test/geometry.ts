import type { Clip, SceneDescription, Track } from "@arcue/scene";

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

/** The track's value at `time`: linear between keys, spherical for rotations, held for step tracks. */
export function sampleTrack(track: Track, time: number): number[] {
  const width = track.values.length / track.times.length;
  let key = 0;
  while (key + 1 < track.times.length && (track.times[key + 1] ?? 0) <= time + 1e-7) key++;
  const before = Array.from(track.values.subarray(key * width, key * width + width));
  const after = Array.from(track.values.subarray((key + 1) * width, (key + 2) * width));
  const t0 = track.times[key] ?? 0;
  const t1 = track.times[key + 1] ?? t0;
  if (after.length < width || track.interpolation === "step" || t1 <= t0) return before;
  const f = Math.min(Math.max((time - t0) / (t1 - t0), 0), 1);
  if (track.property !== "rotation") return before.map((value, i) => value + f * ((after[i] ?? 0) - value));
  const dot = before.reduce((sum, value, i) => sum + value * (after[i] ?? 0), 0);
  const sign = dot < 0 ? -1 : 1;
  const angle = Math.acos(Math.min(1, Math.abs(dot)));
  const a = angle < 1e-6 ? 1 - f : Math.sin((1 - f) * angle) / Math.sin(angle);
  const b = angle < 1e-6 ? f : Math.sin(f * angle) / Math.sin(angle);
  return before.map((value, i) => a * value + b * sign * (after[i] ?? 0));
}

/** World matrices of every node at `time` in the clip, or in the rest pose without a clip. */
export function worldMatrices(scene: SceneDescription, clip: Clip | null = null, time = 0): Matrix[] {
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

/** Morph weights of a mesh at `time` in the clip, or its default weights. */
export function morphWeights(scene: SceneDescription, meshIndex: number, clip: Clip | null, time: number): number[] {
  const mesh = scene.meshes[meshIndex];
  const node = scene.nodes.findIndex((candidate) => candidate.mesh === meshIndex);
  const defaults = mesh?.morphTargets.map((target) => target.defaultWeight) ?? [];
  const track = clip?.tracks.find((candidate) => candidate.node === node && candidate.property === "weights");
  return track ? sampleTrack(track, time) : defaults;
}

/**
 * Scene-space positions of every source vertex, morphed by `weights` and skinned with the full weights as the
 * scene contract's formula does, or placed by the mesh node for a rigid mesh.
 */
export function placedSourceVertices(
  scene: SceneDescription,
  meshIndex: number,
  worlds: readonly Matrix[],
  weights: readonly number[],
): Float64Array {
  const mesh = scene.meshes[meshIndex];
  if (!mesh) throw new RangeError(`No mesh ${meshIndex}.`);
  const node = scene.nodes.findIndex((candidate) => candidate.mesh === meshIndex);
  const result = new Float64Array(mesh.sourceVertexCount * 3);
  const skeleton = mesh.skeleton === null ? null : scene.skeletons[mesh.skeleton];
  for (let rendered = 0; rendered < mesh.sourceVertex.length; rendered++) {
    const source = mesh.sourceVertex[rendered] ?? 0;
    let x = mesh.positions[rendered * 3] ?? 0;
    let y = mesh.positions[rendered * 3 + 1] ?? 0;
    let z = mesh.positions[rendered * 3 + 2] ?? 0;
    mesh.morphTargets.forEach((target, index) => {
      const weight = weights[index] ?? 0;
      x += weight * (target.positions[rendered * 3] ?? 0);
      y += weight * (target.positions[rendered * 3 + 1] ?? 0);
      z += weight * (target.positions[rendered * 3 + 2] ?? 0);
    });
    let placed: [number, number, number];
    if (skeleton && mesh.skinWeights && mesh.bindMatrix) {
      const { offsets, joints, weights: skin } = mesh.skinWeights;
      const start = offsets[source] ?? 0;
      const end = offsets[source + 1] ?? 0;
      let total = 0;
      for (let k = start; k < end; k++) total += skin[k] ?? 0;
      if (total === 0) {
        const joint = skeleton.joints.length - 1;
        const inverseBind = skeleton.inverseBindMatrices.subarray(joint * 16, joint * 16 + 16);
        const world = worlds[skeleton.joints[joint] ?? -1] ?? identity();
        placed = transformPoint(multiply(multiply(world, inverseBind), mesh.bindMatrix), x, y, z);
      } else {
        placed = [0, 0, 0];
        for (let k = start; k < end; k++) {
          const joint = joints[k] ?? 0;
          const inverseBind = skeleton.inverseBindMatrices.subarray(joint * 16, joint * 16 + 16);
          const world = worlds[skeleton.joints[joint] ?? -1] ?? identity();
          const point = transformPoint(multiply(multiply(world, inverseBind), mesh.bindMatrix), x, y, z);
          const weight = (skin[k] ?? 0) / total;
          placed = [placed[0] + weight * point[0], placed[1] + weight * point[1], placed[2] + weight * point[2]];
        }
      }
    } else {
      placed = transformPoint(worlds[node] ?? identity(), x, y, z);
    }
    result.set(placed, source * 3);
  }
  return result;
}

/** The largest distance between matching points of two xyz arrays. */
export function pointsError(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let worst = 0;
  for (let i = 0; i + 2 < Math.min(a.length, b.length); i += 3) {
    worst = Math.max(
      worst,
      Math.hypot((a[i] ?? 0) - (b[i] ?? 0), (a[i + 1] ?? 0) - (b[i + 1] ?? 0), (a[i + 2] ?? 0) - (b[i + 2] ?? 0)),
    );
  }
  return worst;
}

/** The inverse of an affine matrix. */
export function invertAffine(m: ArrayLike<number>): Matrix {
  const at = (index: number) => m[index] ?? 0;
  const [a, b, c, d, e, f, g, h, i] = [at(0), at(1), at(2), at(4), at(5), at(6), at(8), at(9), at(10)];
  const r = 1 / (a * (e * i - f * h) - d * (b * i - c * h) + g * (b * f - c * e));
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

/** How far the matrix's axes are from orthogonal: the largest cosine between two of them. */
export function shear(m: ArrayLike<number>): number {
  const axis = (index: number) => {
    const v = [m[index * 4] ?? 0, m[index * 4 + 1] ?? 0, m[index * 4 + 2] ?? 0];
    const length = Math.hypot(v[0] ?? 0, v[1] ?? 0, v[2] ?? 0) || 1;
    return v.map((value) => value / length);
  };
  const [x, y, z] = [axis(0), axis(1), axis(2)];
  const cosine = (a: number[], b: number[]) => Math.abs(a.reduce((sum, value, k) => sum + value * (b[k] ?? 0), 0));
  return Math.max(cosine(x, y), cosine(y, z), cosine(x, z));
}
