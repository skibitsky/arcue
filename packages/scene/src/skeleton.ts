import type { SceneDescription } from "./scene";

/**
 * The rest pose is the bind pose: the nodes' rest transforms place every joint where it was when the meshes were
 * bound, so skinning in the rest pose reproduces the meshes' rest positions.
 */
export interface Skeleton {
  /** Node index of each joint. Mesh joint indices point into this list. */
  joints: number[];
  /** One column-major 4×4 matrix per joint, mapping scene space at bind time into the joint's space. */
  inverseBindMatrices: Float32Array;
}

/** The nodes a skeleton view draws, in node order: bones, and any other node a skin binds as a joint. */
export function skeletonNodes(scene: Pick<SceneDescription, "nodes" | "skeletons">): number[] {
  const joints = new Set(scene.skeletons.flatMap((skeleton) => skeleton.joints));
  return scene.nodes.flatMap((node, index) => (node.kind === "bone" || joints.has(index) ? [index] : []));
}
