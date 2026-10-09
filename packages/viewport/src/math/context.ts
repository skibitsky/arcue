import type { BoneShare, ComputedContext, JointPosition } from "@arcue/protocol";
import type { Mesh, SceneDescription, SceneNode, SpatialAnchor, Vec3 } from "@arcue/scene";
import { decodeRanges, rangesWithin } from "@arcue/scene";

/** The source vertices an anchor covers, each once, with its weight: barycentric for a point, equal for a region. */
export interface AnchorVertices {
  vertices: Uint32Array;
  weights: Float64Array;
}

/** Shares below this are left out of a comment's bones. */
export const MIN_BONE_SHARE = 0.01;

export class AnchorError extends Error {
  override readonly name = "AnchorError";
}

export function anchorVertices(anchor: SpatialAnchor, mesh: Pick<Mesh, "sourceVertexCount">): AnchorVertices {
  if (anchor.kind === "surface") {
    const merged = new Map<number, number>();
    anchor.vertices.forEach((vertex, corner) => {
      if (!Number.isInteger(vertex) || vertex < 0 || vertex >= mesh.sourceVertexCount) {
        throw new AnchorError(`Vertex ${vertex} is not in mesh "${anchor.mesh}".`);
      }
      merged.set(vertex, (merged.get(vertex) ?? 0) + (anchor.weights[corner] ?? 0));
    });
    const total = [...merged.values()].reduce((sum, weight) => sum + weight, 0) || 1;
    return {
      vertices: Uint32Array.from(merged.keys()),
      weights: Float64Array.from(merged.values(), (weight) => weight / total),
    };
  }
  if (!rangesWithin(anchor.vertices, mesh.sourceVertexCount)) {
    throw new AnchorError(`The region's vertices are not all in mesh "${anchor.mesh}".`);
  }
  const vertices = decodeRanges(anchor.vertices);
  return { vertices, weights: new Float64Array(vertices.length).fill(vertices.length > 0 ? 1 / vertices.length : 0) };
}

/**
 * Each joint node's share of the anchor's skin weight, from the full source weights when the mesh has them and from
 * the four render influences otherwise. A rigid mesh moves with its nearest ancestor bone, which then has the whole
 * share. The result maps node index to share and sums to 1 unless it is empty.
 */
export function boneShares(
  scene: Pick<SceneDescription, "nodes" | "skeletons">,
  mesh: Mesh,
  meshNode: number,
  target: AnchorVertices,
  representatives: Int32Array,
): Map<number, number> {
  const shares = new Map<number, number>();
  const skeleton = mesh.skeleton === null ? undefined : scene.skeletons[mesh.skeleton];
  if (!skeleton) {
    const bone = nearestAncestorBone(scene.nodes, meshNode);
    if (bone >= 0) shares.set(bone, 1);
    return shares;
  }
  const add = (joint: number, weight: number) => {
    const node = skeleton.joints[joint];
    if (node === undefined || !(weight > 0)) return;
    shares.set(node, (shares.get(node) ?? 0) + weight);
  };
  target.vertices.forEach((vertex, index) => {
    const share = target.weights[index] ?? 0;
    const csr = mesh.skinWeights;
    if (csr) {
      const start = csr.offsets[vertex] ?? 0;
      const end = csr.offsets[vertex + 1] ?? start;
      let total = 0;
      for (let i = start; i < end; i++) total += csr.weights[i] ?? 0;
      for (let i = start; i < end && total > 0; i++) add(csr.joints[i] ?? 0, (share * (csr.weights[i] ?? 0)) / total);
      return;
    }
    const rendered = representatives[vertex] ?? -1;
    if (rendered < 0 || !mesh.joints || !mesh.weights) return;
    for (let k = 0; k < 4; k++) add(mesh.joints[rendered * 4 + k] ?? 0, share * (mesh.weights[rendered * 4 + k] ?? 0));
  });
  const total = [...shares.values()].reduce((sum, weight) => sum + weight, 0);
  if (total > 0) for (const [node, weight] of shares) shares.set(node, weight / total);
  return shares;
}

export function nearestAncestorBone(nodes: readonly SceneNode[], node: number): number {
  for (let current = nodes[node]?.parent ?? -1; current >= 0; current = nodes[current]?.parent ?? -1) {
    if (nodes[current]?.kind === "bone") return current;
  }
  return -1;
}

/** Bones by falling share, then by name; shares under `MIN_BONE_SHARE` are dropped and the rest rounded to 0.001. */
export function rankBones(
  shares: ReadonlyMap<number, number>,
  nodes: readonly SceneNode[],
): { node: number; bone: BoneShare }[] {
  return [...shares]
    .filter(([, share]) => share >= MIN_BONE_SHARE)
    .map(([node, share]) => ({ node, bone: { name: nodes[node]?.name ?? "", share: round(share, 3) } }))
    .sort((a, b) => b.bone.share - a.bone.share || a.bone.name.localeCompare(b.bone.name));
}

export function jointPosition(nodes: readonly SceneNode[], worlds: Float64Array, node: number): JointPosition {
  const offset = node * 16;
  return {
    name: nodes[node]?.name ?? "",
    path: nodes[node]?.path ?? "",
    position: roundVec([worlds[offset + 12] ?? 0, worlds[offset + 13] ?? 0, worlds[offset + 14] ?? 0]),
  };
}

export function weightedPoint(
  target: AnchorVertices,
  position: (vertex: number, out: Float64Array) => void,
  out: Float64Array = new Float64Array(3),
): Float64Array {
  const scratch = new Float64Array(3);
  out.fill(0);
  target.vertices.forEach((vertex, index) => {
    const weight = target.weights[index] ?? 0;
    position(vertex, scratch);
    out[0] = (out[0] ?? 0) + weight * (scratch[0] ?? 0);
    out[1] = (out[1] ?? 0) + weight * (scratch[1] ?? 0);
    out[2] = (out[2] ?? 0) + weight * (scratch[2] ?? 0);
  });
  return out;
}

export function restPosition(mesh: Pick<Mesh, "restPositions">): (vertex: number, out: Float64Array) => void {
  return (vertex, out) => {
    out[0] = mesh.restPositions[vertex * 3] ?? 0;
    out[1] = mesh.restPositions[vertex * 3 + 1] ?? 0;
    out[2] = mesh.restPositions[vertex * 3 + 2] ?? 0;
  };
}

export interface AnchorContextInput {
  scene: Pick<SceneDescription, "nodes" | "skeletons">;
  mesh: Mesh;
  meshNode: number;
  target: AnchorVertices;
  representatives: Int32Array;
  /** Node world matrices at the comment's time. */
  worlds: Float64Array;
  /** Posed position of a source vertex at the comment's time. */
  posedSource: (vertex: number, out: Float64Array) => void;
}

/** Everything in a comment's context except the view label, which depends on the camera rather than the target. */
export function anchorContext(input: AnchorContextInput): Omit<ComputedContext, "viewLabel"> {
  const { scene, mesh, target, worlds } = input;
  const ranked = rankBones(boneShares(scene, mesh, input.meshNode, target, input.representatives), scene.nodes);
  return {
    vertexCount: target.vertices.length,
    bones: ranked.map(({ bone }) => bone),
    centroid: {
      rest: roundVec(toVec3(weightedPoint(target, restPosition(mesh)))),
      posed: roundVec(toVec3(weightedPoint(target, input.posedSource))),
    },
    joints: ranked.map(({ node }) => jointPosition(scene.nodes, worlds, node)),
  };
}

export function toVec3(values: ArrayLike<number>): Vec3 {
  return [values[0] ?? 0, values[1] ?? 0, values[2] ?? 0];
}

/** Positions in context are rounded to 0.00001 m, the precision the core stores rest positions with. */
export function roundVec(vector: Vec3): Vec3 {
  return [round(vector[0], 5), round(vector[1], 5), round(vector[2], 5)];
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor + 0;
}
