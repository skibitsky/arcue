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
