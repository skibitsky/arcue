import type { RegionAnchor } from "@arcue/scene";
import { decodeRanges, encodeRanges, rangesWithin } from "@arcue/scene";

export interface RegionMesh {
  indices: Uint32Array;
  sourceVertex: Uint32Array;
  sourceVertexCount: number;
}

/** A region anchor for painted triangles, or null when nothing is painted. */
export function regionAnchor(meshPath: string, mesh: RegionMesh, triangles: Iterable<number>): RegionAnchor | null {
  const triangleRanges = encodeRanges(triangles);
  if (triangleRanges.length === 0) return null;
  const vertices = new Set<number>();
  for (const triangle of decodeRanges(triangleRanges)) {
    for (let corner = 0; corner < 3; corner++) {
      const rendered = mesh.indices[triangle * 3 + corner];
      const source = rendered === undefined ? undefined : mesh.sourceVertex[rendered];
      if (source !== undefined) vertices.add(source);
    }
  }
  return { kind: "region", mesh: meshPath, triangles: triangleRanges, vertices: encodeRanges(vertices) };
}

/** The painted triangles of a region, or null when its ranges do not fit the mesh. */
export function regionTriangles(anchor: RegionAnchor, triangleCount: number): Uint32Array | null {
  try {
    if (!rangesWithin(anchor.triangles, triangleCount)) return null;
    return decodeRanges(anchor.triangles);
  } catch {
    return null;
  }
}

/**
 * Triangles grouped by the source vertices they touch, in compressed sparse row layout: the triangles around source
 * vertex v are `triangles[offsets[v]]` up to `triangles[offsets[v + 1]]`. Seams split rendered vertices but not source
 * vertices, so neighbors across a UV seam stay connected.
 */
export interface TriangleAdjacency {
  offsets: Uint32Array;
  triangles: Uint32Array;
}

export function triangleAdjacency(mesh: RegionMesh): TriangleAdjacency {
  const triangleCount = Math.floor(mesh.indices.length / 3);
  const offsets = new Uint32Array(mesh.sourceVertexCount + 1);
  const sourceOf = (corner: number) => mesh.sourceVertex[mesh.indices[corner] ?? 0] ?? 0;
  for (let corner = 0; corner < triangleCount * 3; corner++) {
    const source = sourceOf(corner);
    if (source < mesh.sourceVertexCount) offsets[source + 1] = (offsets[source + 1] ?? 0) + 1;
  }
  for (let vertex = 0; vertex < mesh.sourceVertexCount; vertex++) {
    offsets[vertex + 1] = (offsets[vertex + 1] ?? 0) + (offsets[vertex] ?? 0);
  }
  const fill = offsets.slice(0, mesh.sourceVertexCount);
  const triangles = new Uint32Array(offsets[mesh.sourceVertexCount] ?? 0);
  for (let corner = 0; corner < triangleCount * 3; corner++) {
    const source = sourceOf(corner);
    if (source >= mesh.sourceVertexCount) continue;
    const slot = fill[source] ?? 0;
    triangles[slot] = Math.floor(corner / 3);
    fill[source] = slot + 1;
  }
  return { offsets, triangles };
}

/** Calls `visit` for every triangle that shares a source vertex with `triangle`, itself included, possibly twice. */
export function forEachNeighbor(
  mesh: RegionMesh,
  adjacency: TriangleAdjacency,
  triangle: number,
  visit: (neighbor: number) => void,
): void {
  for (let corner = 0; corner < 3; corner++) {
    const source = mesh.sourceVertex[mesh.indices[triangle * 3 + corner] ?? 0] ?? 0;
    const end = adjacency.offsets[source + 1] ?? 0;
    for (let i = adjacency.offsets[source] ?? 0; i < end; i++) visit(adjacency.triangles[i] ?? 0);
  }
}

/** The triangle whose corners are these three source vertices, in any order, or -1. */
export function findTriangle(mesh: RegionMesh, adjacency: TriangleAdjacency, vertices: readonly number[]): number {
  const [a, b, c] = vertices;
  if (a === undefined || b === undefined || c === undefined || a >= mesh.sourceVertexCount) return -1;
  const wanted = [a, b, c].sort((x, y) => x - y).join(",");
  const end = adjacency.offsets[a + 1] ?? 0;
  for (let i = adjacency.offsets[a] ?? 0; i < end; i++) {
    const triangle = adjacency.triangles[i] ?? 0;
    const corners = [0, 1, 2].map((corner) => mesh.sourceVertex[mesh.indices[triangle * 3 + corner] ?? 0] ?? 0);
    if (corners.sort((x, y) => x - y).join(",") === wanted) return triangle;
  }
  return -1;
}
