import type { Matrix } from "@arcue/blend/test/poses";
import { identity, multiply, sampleTrack, transformPoint } from "@arcue/blend/test/poses";
import type { Clip, Mesh, SceneDescription } from "@arcue/scene";

export type { Matrix, PosedScene } from "@arcue/blend/test/poses";
export {
  composeTrs,
  identity,
  matrixError,
  multiply,
  pointsError,
  sampleTrack,
  transformPoint,
  worldMatrices,
} from "@arcue/blend/test/poses";

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

/**
 * The four joints and weights each rendered vertex should skin with, worked out from the full skin weights: the four
 * largest influences of its source vertex, the lower joint first among equal weights, scaled to sum to 1. A vertex
 * without influences follows the skeleton's last joint, the mesh's own node, at full weight.
 */
export function strongestInfluences(mesh: Mesh, jointCount: number): { joints: Uint16Array; weights: Float32Array } {
  const joints = new Uint16Array(mesh.sourceVertex.length * 4);
  const weights = new Float32Array(mesh.sourceVertex.length * 4);
  const skin = mesh.skinWeights;
  if (!skin) throw new RangeError(`Mesh ${mesh.name} has no skin weights.`);
  for (let r = 0; r < mesh.sourceVertex.length; r++) {
    const source = mesh.sourceVertex[r] ?? 0;
    const influences: [number, number][] = [];
    for (let k = skin.offsets[source] ?? 0; k < (skin.offsets[source + 1] ?? 0); k++) {
      influences.push([skin.joints[k] ?? 0, skin.weights[k] ?? 0]);
    }
    const strongest = influences.sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 4);
    if (strongest.length === 0) strongest.push([jointCount - 1, 1]);
    const sum = strongest.reduce((total, [, weight]) => total + weight, 0);
    strongest.forEach(([joint, weight], k) => {
      joints[r * 4 + k] = joint;
      weights[r * 4 + k] = weight / sum;
    });
  }
  return { joints, weights };
}

/**
 * Scene-space positions of every rendered vertex at rest shape, skinned the way the viewport skins them: with each
 * rendered vertex's four joints and weights.
 */
export function placedRenderedVertices(
  scene: SceneDescription,
  meshIndex: number,
  worlds: readonly Matrix[],
): Float64Array {
  const mesh = scene.meshes[meshIndex];
  const skeleton = mesh?.skeleton === null ? null : scene.skeletons[mesh?.skeleton ?? -1];
  if (!mesh || !skeleton || !mesh.joints || !mesh.weights || !mesh.bindMatrix) {
    throw new RangeError(`No skinned mesh ${meshIndex}.`);
  }
  const result = new Float64Array(mesh.sourceVertex.length * 3);
  for (let r = 0; r < mesh.sourceVertex.length; r++) {
    const [x = 0, y = 0, z = 0] = mesh.positions.subarray(r * 3, r * 3 + 3);
    for (let k = 0; k < 4; k++) {
      const weight = mesh.weights[r * 4 + k] ?? 0;
      if (weight === 0) continue;
      const joint = mesh.joints[r * 4 + k] ?? 0;
      const inverseBind = skeleton.inverseBindMatrices.subarray(joint * 16, joint * 16 + 16);
      const world = worlds[skeleton.joints[joint] ?? -1] ?? identity();
      const point = transformPoint(multiply(multiply(world, inverseBind), mesh.bindMatrix), x, y, z);
      for (let axis = 0; axis < 3; axis++) {
        result[r * 3 + axis] = (result[r * 3 + axis] ?? 0) + weight * (point[axis] ?? 0);
      }
    }
  }
  return result;
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

export type { Faces, LoopReference } from "@arcue/blend/test/loops";
export { cornerMismatches } from "@arcue/blend/test/loops";
