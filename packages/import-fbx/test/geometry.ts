import type { Clip, Mesh, SceneDescription, Track } from "@arcue/scene";

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

export function composeTrs(
  [tx, ty, tz]: readonly number[],
  [qx = 0, qy = 0, qz = 0, qw = 1]: readonly number[],
  [sx = 1, sy = 1, sz = 1]: readonly number[],
): Matrix {
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
    tx ?? 0,
    ty ?? 0,
    tz ?? 0,
    1,
  );
}

/** World matrices of every node in its rest transform. */
export function restWorldMatrices(scene: SceneDescription): Matrix[] {
  const worlds: Matrix[] = [];
  for (const node of scene.nodes) {
    const local = composeTrs(node.translation, node.rotation, node.scale);
    const parent = node.parent === -1 ? undefined : worlds[node.parent];
    worlds.push(parent ? multiply(parent, local) : local);
  }
  return worlds;
}

/** Largest distance between each rendered vertex, skinned or placed in the rest pose, and its source rest position. */
export function restPoseError(scene: SceneDescription, meshIndex: number): number {
  const mesh: Mesh | undefined = scene.meshes[meshIndex];
  if (!mesh) throw new RangeError(`No mesh ${meshIndex}.`);
  const worlds = restWorldMatrices(scene);
  const nodeIndex = scene.nodes.findIndex((node) => node.mesh === meshIndex);
  let worst = 0;
  const skeleton = mesh.skeleton === null ? null : scene.skeletons[mesh.skeleton];
  const skinning: Matrix[] = [];
  if (skeleton && mesh.bindMatrix) {
    skeleton.joints.forEach((joint, index) => {
      const inverseBind = skeleton.inverseBindMatrices.subarray(index * 16, index * 16 + 16);
      skinning.push(multiply(multiply(worlds[joint] ?? identity(), inverseBind), mesh.bindMatrix ?? identity()));
    });
  }
  for (let vertex = 0; vertex < mesh.sourceVertex.length; vertex++) {
    const x = mesh.positions[vertex * 3] ?? 0;
    const y = mesh.positions[vertex * 3 + 1] ?? 0;
    const z = mesh.positions[vertex * 3 + 2] ?? 0;
    let placed: [number, number, number];
    if (skinning.length > 0 && mesh.joints && mesh.weights) {
      placed = [0, 0, 0];
      for (let k = 0; k < 4; k++) {
        const weight = mesh.weights[vertex * 4 + k] ?? 0;
        if (weight === 0) continue;
        const matrix = skinning[mesh.joints[vertex * 4 + k] ?? 0] ?? identity();
        const point = transformPoint(matrix, x, y, z);
        placed = [placed[0] + weight * point[0], placed[1] + weight * point[1], placed[2] + weight * point[2]];
      }
    } else {
      placed = transformPoint(worlds[nodeIndex] ?? identity(), x, y, z);
    }
    const source = mesh.sourceVertex[vertex] ?? 0;
    const dx = placed[0] - (mesh.restPositions[source * 3] ?? 0);
    const dy = placed[1] - (mesh.restPositions[source * 3 + 1] ?? 0);
    const dz = placed[2] - (mesh.restPositions[source * 3 + 2] ?? 0);
    worst = Math.max(worst, Math.hypot(dx, dy, dz));
  }
  return worst;
}

/** The track's value at `time`: linear between keys, spherical for rotations, held for step tracks. */
export function sampleTrack(track: Track, time: number): number[] {
  const width = track.values.length / track.times.length;
  let key = 0;
  while (key + 1 < track.times.length && (track.times[key + 1] ?? 0) <= time) key++;
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

/** World matrices of every node at `time` in the clip, with untracked channels at rest. */
export function posedWorldMatrices(scene: SceneDescription, clip: Clip, time: number): Matrix[] {
  const worlds: Matrix[] = [];
  for (const [index, node] of scene.nodes.entries()) {
    let translation: readonly number[] = node.translation;
    let rotation: readonly number[] = node.rotation;
    let scale: readonly number[] = node.scale;
    for (const track of clip.tracks) {
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

/** Skins one source vertex with its full weights, normalized, as the contract's formula does. */
export function skinnedSourceVertex(
  scene: SceneDescription,
  meshIndex: number,
  worlds: readonly Matrix[],
  source: number,
): [number, number, number] {
  const mesh = scene.meshes[meshIndex];
  const skeleton = scene.skeletons[mesh?.skeleton ?? -1];
  if (!mesh?.skinWeights || !mesh.bindMatrix || !skeleton) throw new RangeError(`Mesh ${meshIndex} is not skinned.`);
  const rendered = mesh.sourceVertex.indexOf(source);
  const [x, y, z] = [
    mesh.positions[rendered * 3] ?? 0,
    mesh.positions[rendered * 3 + 1] ?? 0,
    mesh.positions[rendered * 3 + 2] ?? 0,
  ];
  const { offsets, joints, weights } = mesh.skinWeights;
  const start = offsets[source] ?? 0;
  const end = offsets[source + 1] ?? 0;
  let total = 0;
  for (let k = start; k < end; k++) total += weights[k] ?? 0;
  const result: [number, number, number] = [0, 0, 0];
  for (let k = start; k < end; k++) {
    const joint = joints[k] ?? 0;
    const inverseBind = skeleton.inverseBindMatrices.subarray(joint * 16, joint * 16 + 16);
    const world = worlds[skeleton.joints[joint] ?? -1] ?? identity();
    const point = transformPoint(multiply(multiply(world, inverseBind), mesh.bindMatrix), x, y, z);
    const weight = (weights[k] ?? 0) / total;
    result[0] += weight * point[0];
    result[1] += weight * point[1];
    result[2] += weight * point[2];
  }
  return result;
}
