import type { TopologyFingerprint } from "./fingerprint";

export interface UvSet {
  name: string;
  /** Two values per rendered vertex, as the file stores them: the origin at the bottom left, v pointing up. */
  values: Float32Array;
}

export interface MaterialGroup {
  /** First triangle of the group. */
  start: number;
  triangleCount: number;
  material: number;
}

export interface MorphTarget {
  name: string;
  /** The target's weight in the rest pose and in clips that do not animate it, usually from 0 to 1. */
  defaultWeight: number;
  /** Position offsets, three values per rendered vertex. */
  positions: Float32Array;
  /** Normal offsets. Either every target of a mesh has them or none does. */
  normals: Float32Array | null;
}

/**
 * Every skin influence of every source vertex, in compressed sparse row layout: `offsets` has
 * sourceVertexCount + 1 entries, and the influences of source vertex v sit at offsets[v] up to, not including,
 * offsets[v + 1].
 */
export interface SkinWeights {
  offsets: Uint32Array;
  /** Index into the mesh skeleton's `joints`. */
  joints: Uint16Array;
  weights: Float32Array;
}

/**
 * A triangle mesh in the local space of the one node that uses it. Importers give each mesh node its own mesh,
 * duplicating geometry that the file shares between nodes, so a mesh's node path identifies it.
 * "Rendered" vertices are split at UV seams and hard edges for the GPU; "source" vertices are the file's own,
 * which anchors and prompts use. Each rendered vertex records the source vertex it came from.
 */
export interface Mesh {
  /** The name of the object that holds the mesh, as the exporting tool shows it: its node's name. */
  name: string;
  /** The file's own name for the geometry, such as an FBX file's mesh data; empty when the file has none. */
  geometryName: string;
  positions: Float32Array;
  normals: Float32Array;
  uvs: UvSet[];
  /** Linear RGBA, four values per rendered vertex. */
  colors: Float32Array | null;
  /** Index into `SceneDescription.skeletons`, or null for a rigid mesh. */
  skeleton: number | null;
  /**
   * For a skinned mesh, the column-major 4×4 matrix that took its local positions into scene space when it was bound
   * to the skeleton. A skinned position is the sum over influences of
   * weight × jointWorld × inverseBindMatrix × bindMatrix × localPosition. Null for a rigid mesh.
   */
  bindMatrix: Float32Array | null;
  /** The four strongest influences per rendered vertex, for rendering. */
  joints: Uint16Array | null;
  /** Weights of `joints`, normalized to sum to 1. */
  weights: Float32Array | null;
  /** Three rendered vertex indices per triangle. */
  indices: Uint32Array;
  /** Runs of triangles that draw in one material. Several groups may use the same material. */
  groups: MaterialGroup[];
  morphTargets: MorphTarget[];
  sourceVertex: Uint32Array;
  sourceVertexCount: number;
  /** Bind-pose position of each source vertex in scene space (not node-local), three values each. */
  restPositions: Float32Array;
  skinWeights: SkinWeights | null;
  topology: TopologyFingerprint;
}
