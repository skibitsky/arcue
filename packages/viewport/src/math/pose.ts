import type { Clip, Mesh, SceneNode, Track } from "@arcue/scene";
import { composeInto, multiplyInto } from "./mat4";

export interface PoseScene {
  nodes: readonly SceneNode[];
  meshes: readonly Pick<Mesh, "morphTargets">[];
}

export interface Pose {
  translations: Float64Array;
  rotations: Float64Array;
  scales: Float64Array;
  /** One array per mesh, indexed like `SceneDescription.meshes`, with one weight per morph target. */
  morphWeights: Float32Array[];
}

export function createPose(scene: PoseScene): Pose {
  const count = scene.nodes.length;
  const pose: Pose = {
    translations: new Float64Array(count * 3),
    rotations: new Float64Array(count * 4),
    scales: new Float64Array(count * 3),
    morphWeights: scene.meshes.map((mesh) => new Float32Array(mesh.morphTargets.length)),
  };
  resetPose(scene, pose);
  return pose;
}

export function resetPose(scene: PoseScene, pose: Pose): void {
  scene.nodes.forEach((node, index) => {
    pose.translations.set(node.translation, index * 3);
    pose.rotations.set(node.rotation, index * 4);
    pose.scales.set(node.scale, index * 3);
  });
  scene.meshes.forEach((mesh, index) => {
    const weights = pose.morphWeights[index];
    if (!weights) return;
    mesh.morphTargets.forEach((target, morph) => {
      weights[morph] = target.defaultWeight;
    });
  });
}

export function clampToClip(seconds: number, clip: Pick<Clip, "duration">): number {
  if (!Number.isFinite(seconds)) return 0;
  return Math.min(Math.max(seconds, 0), Math.max(clip.duration, 0));
}

/** Evaluates a clip at a time over the rest pose. Nodes the clip does not animate keep their rest transforms. */
export function poseAt(scene: PoseScene, clip: Clip | null, seconds: number, pose: Pose = createPose(scene)): Pose {
  resetPose(scene, pose);
  if (!clip) return pose;
  const time = clampToClip(seconds, clip);
  const scratch = new Float64Array(maxStride(clip));
  for (const track of clip.tracks) applyTrack(scene, track, time, pose, scratch);
  return pose;
}

function maxStride(clip: Clip): number {
  let stride = 4;
  for (const track of clip.tracks) stride = Math.max(stride, trackStride(track));
  return stride;
}

function trackStride(track: Track): number {
  if (track.times.length === 0) return 0;
  return Math.floor(track.values.length / track.times.length);
}

function applyTrack(scene: PoseScene, track: Track, time: number, pose: Pose, scratch: Float64Array): void {
  const node = scene.nodes[track.node];
  const stride = trackStride(track);
  if (!node || stride === 0) return;
  sampleTrack(track, time, scratch);
  switch (track.property) {
    case "translation":
      if (stride >= 3) pose.translations.set(scratch.subarray(0, 3), track.node * 3);
      break;
    case "scale":
      if (stride >= 3) pose.scales.set(scratch.subarray(0, 3), track.node * 3);
      break;
    case "rotation":
      if (stride >= 4) pose.rotations.set(scratch.subarray(0, 4), track.node * 4);
      break;
    case "weights": {
      const weights = node.mesh === null ? undefined : pose.morphWeights[node.mesh];
      if (!weights) return;
      for (let i = 0; i < weights.length && i < stride; i++) weights[i] = scratch[i] ?? 0;
      break;
    }
  }
}

/**
 * Key times are float32 and seek times float64, so a key stored as fround(N / fps) can sit just above the frame's
 * exact time, by up to half a float32 step, which grows with the time. A key counts as reached when it is at or before
 * the float32 rounding of the time, or within this many seconds of the time.
 */
const KEY_TOLERANCE = 1e-6;

/** Index of the last key at or before `time`, or -1 when `time` is before the first key. */
export function keyIndexAt(times: Float32Array, time: number): number {
  const reached = Math.max(time, Math.fround(time)) + KEY_TOLERANCE;
  let low = 0;
  let high = times.length - 1;
  let found = -1;
  while (low <= high) {
    const middle = (low + high) >>> 1;
    if ((times[middle] ?? 0) <= reached) {
      found = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return found;
}

/** Writes the track's value at `time` into `out`; rotations blend spherically. */
export function sampleTrack(track: Track, time: number, out: Float64Array): void {
  const stride = trackStride(track);
  const keys = track.times.length;
  if (stride === 0) return;
  const index = keyIndexAt(track.times, time);
  if (index < 0 || index >= keys - 1 || track.interpolation === "step") {
    const key = Math.min(Math.max(index, 0), keys - 1);
    for (let i = 0; i < stride; i++) out[i] = track.values[key * stride + i] ?? 0;
    return;
  }
  const t0 = track.times[index] ?? 0;
  const t1 = track.times[index + 1] ?? t0;
  const alpha = t1 > t0 ? Math.min(1, Math.max(0, (time - t0) / (t1 - t0))) : 0;
  const a = index * stride;
  const b = (index + 1) * stride;
  if (track.property === "rotation" && stride === 4) {
    slerpInto(out, track.values, a, track.values, b, alpha);
    return;
  }
  for (let i = 0; i < stride; i++) {
    const from = track.values[a + i] ?? 0;
    out[i] = from + ((track.values[b + i] ?? 0) - from) * alpha;
  }
}

export function slerpInto(
  out: Float64Array,
  from: ArrayLike<number>,
  fromOffset: number,
  to: ArrayLike<number>,
  toOffset: number,
  alpha: number,
): void {
  const ax = from[fromOffset] ?? 0;
  const ay = from[fromOffset + 1] ?? 0;
  const az = from[fromOffset + 2] ?? 0;
  const aw = from[fromOffset + 3] ?? 1;
  let bx = to[toOffset] ?? 0;
  let by = to[toOffset + 1] ?? 0;
  let bz = to[toOffset + 2] ?? 0;
  let bw = to[toOffset + 3] ?? 1;
  let cos = ax * bx + ay * by + az * bz + aw * bw;
  if (cos < 0) {
    cos = -cos;
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
  }
  let wa = 1 - alpha;
  let wb = alpha;
  if (cos < 0.9995) {
    const angle = Math.acos(Math.min(cos, 1));
    const sin = Math.sin(angle);
    wa = Math.sin((1 - alpha) * angle) / sin;
    wb = Math.sin(alpha * angle) / sin;
  }
  const x = ax * wa + bx * wb;
  const y = ay * wa + by * wb;
  const z = az * wa + bz * wb;
  const w = aw * wa + bw * wb;
  const length = Math.hypot(x, y, z, w) || 1;
  out[0] = x / length;
  out[1] = y / length;
  out[2] = z / length;
  out[3] = w / length;
}

export function worldMatrices(
  nodes: readonly SceneNode[],
  pose: Pose,
  out: Float64Array = new Float64Array(nodes.length * 16),
): Float64Array {
  const local = new Float64Array(16);
  nodes.forEach((node, index) => {
    composeInto(local, 0, pose.translations, index * 3, pose.rotations, index * 4, pose.scales, index * 3);
    if (node.parent < 0) out.set(local, index * 16);
    else multiplyInto(out, index * 16, out, node.parent * 16, local, 0);
  });
  return out;
}
