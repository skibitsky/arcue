import type { Mesh, Skeleton } from "@arcue/scene";
import { IDENTITY, multiplyInto, transformPointInto } from "./mat4";

/** Each joint's world matrix times its inverse bind matrix, 16 values per joint. */
export function jointMatrices(skeleton: Skeleton, worlds: Float64Array, out?: Float64Array): Float64Array {
  const result = out ?? new Float64Array(skeleton.joints.length * 16);
  skeleton.joints.forEach((node, joint) => {
    multiplyInto(result, joint * 16, worlds, node * 16, skeleton.inverseBindMatrices, joint * 16);
  });
  return result;
}

/**
 * The matrices that take a skinned mesh's local positions straight to scene space:
 * jointWorld × inverseBindMatrix × bindMatrix for each joint.
 */
export function meshSkinMatrices(
  joints: Float64Array,
  bindMatrix: ArrayLike<number>,
  out?: Float64Array,
): Float64Array {
  const count = joints.length / 16;
  const result = out ?? new Float64Array(joints.length);
  for (let joint = 0; joint < count; joint++) multiplyInto(result, joint * 16, joints, joint * 16, bindMatrix, 0);
  return result;
}

export type PosedMesh = Pick<Mesh, "positions" | "morphTargets" | "joints" | "weights">;

/**
 * How one mesh is posed: `skin` holds the matrices from `meshSkinMatrices` for a skinned mesh, or null for a rigid one,
 * whose positions `nodeWorld` places.
 */
export interface MeshPose {
  skin: Float64Array | null;
  /** The mesh's bind matrix; a skinned vertex without weights stays where it was bound. */
  bindMatrix: ArrayLike<number> | null;
  nodeWorld: ArrayLike<number>;
  morphWeights: Float32Array;
}

/**
 * Where a rendered vertex is in scene space: morph offsets first, then the four render influences, the same sum the GPU
 * computes. A vertex of a skinned mesh whose weights are all zero keeps its bind position.
 */
export function posedVertex(
  mesh: PosedMesh,
  vertex: number,
  pose: MeshPose,
  out: Float64Array | Float32Array | number[],
  outOffset = 0,
): void {
  let x = mesh.positions[vertex * 3] ?? 0;
  let y = mesh.positions[vertex * 3 + 1] ?? 0;
  let z = mesh.positions[vertex * 3 + 2] ?? 0;
  const weights = pose.morphWeights;
  for (let target = 0; target < weights.length; target++) {
    const weight = weights[target] ?? 0;
    const offsets = mesh.morphTargets[target]?.positions;
    if (weight === 0 || !offsets) continue;
    x += weight * (offsets[vertex * 3] ?? 0);
    y += weight * (offsets[vertex * 3 + 1] ?? 0);
    z += weight * (offsets[vertex * 3 + 2] ?? 0);
  }
  const skin = pose.skin;
  if (!skin || !mesh.joints || !mesh.weights) {
    transformPointInto(out, outOffset, pose.nodeWorld, 0, x, y, z);
    return;
  }
  let sx = 0;
  let sy = 0;
  let sz = 0;
  let total = 0;
  for (let k = 0; k < 4; k++) {
    const weight = mesh.weights[vertex * 4 + k] ?? 0;
    if (weight === 0) continue;
    const m = (mesh.joints[vertex * 4 + k] ?? 0) * 16;
    if (m + 15 >= skin.length) continue;
    total += weight;
    sx += weight * ((skin[m] ?? 0) * x + (skin[m + 4] ?? 0) * y + (skin[m + 8] ?? 0) * z + (skin[m + 12] ?? 0));
    sy += weight * ((skin[m + 1] ?? 0) * x + (skin[m + 5] ?? 0) * y + (skin[m + 9] ?? 0) * z + (skin[m + 13] ?? 0));
    sz += weight * ((skin[m + 2] ?? 0) * x + (skin[m + 6] ?? 0) * y + (skin[m + 10] ?? 0) * z + (skin[m + 14] ?? 0));
  }
  if (total === 0) {
    transformPointInto(out, outOffset, pose.bindMatrix ?? IDENTITY, 0, x, y, z);
    return;
  }
  out[outOffset] = sx;
  out[outOffset + 1] = sy;
  out[outOffset + 2] = sz;
}

/** The first rendered vertex of each source vertex, or -1 for a source vertex no triangle uses. */
export function representativeVertices(sourceVertex: Uint32Array, sourceVertexCount: number): Int32Array {
  const representative = new Int32Array(sourceVertexCount).fill(-1);
  for (let rendered = 0; rendered < sourceVertex.length; rendered++) {
    const source = sourceVertex[rendered] ?? 0;
    if (source < sourceVertexCount && representative[source] === -1) representative[source] = rendered;
  }
  return representative;
}

/** Posed positions of rendered vertices, computed on first use and kept until the pose changes. */
export class PosedVertexCache {
  private readonly positions: Float32Array;
  private readonly stamps: Uint32Array;
  private stamp = 1;
  private pose: MeshPose | null = null;
  private readonly mesh: PosedMesh;

  constructor(mesh: PosedMesh) {
    this.mesh = mesh;
    const count = mesh.positions.length / 3;
    this.positions = new Float32Array(count * 3);
    this.stamps = new Uint32Array(count);
  }

  setPose(pose: MeshPose): void {
    this.pose = pose;
    this.stamp++;
    if (this.stamp === 0xffffffff) {
      this.stamps.fill(0);
      this.stamp = 1;
    }
  }

  get(vertex: number, out: Float64Array | Float32Array | number[], outOffset = 0): void {
    const offset = vertex * 3;
    if (this.stamps[vertex] !== this.stamp) {
      if (!this.pose) throw new Error("PosedVertexCache has no pose.");
      posedVertex(this.mesh, vertex, this.pose, this.positions, offset);
      this.stamps[vertex] = this.stamp;
    }
    out[outOffset] = this.positions[offset] ?? 0;
    out[outOffset + 1] = this.positions[offset + 1] ?? 0;
    out[outOffset + 2] = this.positions[offset + 2] ?? 0;
  }
}
