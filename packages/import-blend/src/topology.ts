import type { BlendMesh } from "@arcue/blend";
import type { TopologyFingerprint } from "@arcue/scene";
import { topologyFingerprint } from "@arcue/scene";

/**
 * The fingerprint of a mesh's faces: each face fanned from its first corner, in the triangles' order, so that it does
 * not change with the positions that pick Blender's split, and triangle n stays in the face it is in.
 */
export function fanFingerprint(
  mesh: Pick<BlendMesh, "faces" | "triangleFaces" | "sourceVertexCount">,
): TopologyFingerprint {
  const { offsets, vertices } = mesh.faces;
  const indices = new Uint32Array(mesh.triangleFaces.length * 3);
  let fan = 0;
  for (let position = 0; position < mesh.triangleFaces.length; position++) {
    const face = mesh.triangleFaces[position] ?? 0;
    fan = position > 0 && mesh.triangleFaces[position - 1] === face ? fan + 1 : 0;
    const start = offsets[face] ?? 0;
    indices[position * 3] = vertices[start] ?? 0;
    indices[position * 3 + 1] = vertices[start + fan + 1] ?? 0;
    indices[position * 3 + 2] = vertices[start + fan + 2] ?? 0;
  }
  return topologyFingerprint({
    indices,
    sourceVertex: Uint32Array.from({ length: mesh.sourceVertexCount }, (_, vertex) => vertex),
    sourceVertexCount: mesh.sourceVertexCount,
  });
}
