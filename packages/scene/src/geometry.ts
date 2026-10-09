import type { Vec3 } from "./math";

export type Barycentric = [number, number, number];

export interface SurfacePoint {
  /** The triangle's position in the index list. */
  triangle: number;
  /** Weights of the triangle's three corners, summing to 1. */
  weights: Barycentric;
  point: Vec3;
  distance: number;
}

export interface NearestVertex {
  vertex: number;
  distance: number;
}

/** A mesh's triangles in source vertex numbers, three per triangle, for queries against `restPositions`. */
export function sourceIndices(indices: Uint32Array, sourceVertex: Uint32Array): Uint32Array {
  return indices.map((rendered) => {
    const source = sourceVertex[rendered];
    if (source === undefined) throw new RangeError(`Rendered vertex ${rendered} has no source vertex.`);
    return source;
  });
}

/** Barycentric weights of the point on triangle abc closest to p. */
export function closestPointOnTriangle(p: Vec3, a: Vec3, b: Vec3, c: Vec3): Barycentric {
  const out: Barycentric = [0, 0, 0];
  closestWeights(p[0], p[1], p[2], a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], out);
  return out;
}

/**
 * The point on a mesh's surface closest to `point`, checking every triangle. `positions` holds xyz per vertex and
 * `indices` three vertex numbers per triangle. Null when the mesh has no triangles.
 */
export function closestSurfacePoint(positions: Float32Array, indices: Uint32Array, point: Vec3): SurfacePoint | null {
  const vertexCount = Math.floor(positions.length / 3);
  for (const index of indices) if (index >= vertexCount) throw new RangeError(`Vertex ${index} is out of range.`);
  const [px, py, pz] = point;
  const weights: Barycentric = [0, 0, 0];
  let bestTriangle = -1;
  let bestSquared = Infinity;
  let best: Barycentric = [0, 0, 0];
  for (let triangle = 0; triangle * 3 + 2 < indices.length; triangle++) {
    const a = (indices[triangle * 3] ?? 0) * 3;
    const b = (indices[triangle * 3 + 1] ?? 0) * 3;
    const c = (indices[triangle * 3 + 2] ?? 0) * 3;
    const ax = positions[a] ?? 0;
    const ay = positions[a + 1] ?? 0;
    const az = positions[a + 2] ?? 0;
    const bx = positions[b] ?? 0;
    const by = positions[b + 1] ?? 0;
    const bz = positions[b + 2] ?? 0;
    const cx = positions[c] ?? 0;
    const cy = positions[c + 1] ?? 0;
    const cz = positions[c + 2] ?? 0;
    closestWeights(px, py, pz, ax, ay, az, bx, by, bz, cx, cy, cz, weights);
    const [u, v, w] = weights;
    const dx = u * ax + v * bx + w * cx - px;
    const dy = u * ay + v * by + w * cy - py;
    const dz = u * az + v * bz + w * cz - pz;
    const squared = dx * dx + dy * dy + dz * dz;
    if (squared < bestSquared) {
      bestSquared = squared;
      bestTriangle = triangle;
      best = [u, v, w];
    }
  }
  if (bestTriangle < 0) return null;
  const corner = (k: number, axis: number) => positions[(indices[bestTriangle * 3 + k] ?? 0) * 3 + axis] ?? 0;
  const mix = (axis: number) => best[0] * corner(0, axis) + best[1] * corner(1, axis) + best[2] * corner(2, axis);
  return { triangle: bestTriangle, weights: best, point: [mix(0), mix(1), mix(2)], distance: Math.sqrt(bestSquared) };
}

/** The vertex nearest to `point`. Null when there are no vertices. */
export function nearestVertex(positions: Float32Array, point: Vec3): NearestVertex | null {
  const [px, py, pz] = point;
  let bestVertex = -1;
  let bestSquared = Infinity;
  for (let vertex = 0; vertex * 3 + 2 < positions.length; vertex++) {
    const dx = (positions[vertex * 3] ?? 0) - px;
    const dy = (positions[vertex * 3 + 1] ?? 0) - py;
    const dz = (positions[vertex * 3 + 2] ?? 0) - pz;
    const squared = dx * dx + dy * dy + dz * dz;
    if (squared < bestSquared) {
      bestSquared = squared;
      bestVertex = vertex;
    }
  }
  return bestVertex < 0 ? null : { vertex: bestVertex, distance: Math.sqrt(bestSquared) };
}

function assign(out: Barycentric, u: number, v: number, w: number): Barycentric {
  out[0] = u;
  out[1] = v;
  out[2] = w;
  return out;
}

// Region tests from Ericson, "Real-Time Collision Detection", section 5.1.5.
function closestWeights(
  px: number,
  py: number,
  pz: number,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  cx: number,
  cy: number,
  cz: number,
  out: Barycentric,
): Barycentric {
  const abx = bx - ax;
  const aby = by - ay;
  const abz = bz - az;
  const acx = cx - ax;
  const acy = cy - ay;
  const acz = cz - az;
  const dot = (x: number, y: number, z: number, ux: number, uy: number, uz: number) => x * ux + y * uy + z * uz;

  const d1 = dot(abx, aby, abz, px - ax, py - ay, pz - az);
  const d2 = dot(acx, acy, acz, px - ax, py - ay, pz - az);
  if (d1 <= 0 && d2 <= 0) return assign(out, 1, 0, 0);

  const d3 = dot(abx, aby, abz, px - bx, py - by, pz - bz);
  const d4 = dot(acx, acy, acz, px - bx, py - by, pz - bz);
  if (d3 >= 0 && d4 <= d3) return assign(out, 0, 1, 0);

  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    return assign(out, 1 - v, v, 0);
  }

  const d5 = dot(abx, aby, abz, px - cx, py - cy, pz - cz);
  const d6 = dot(acx, acy, acz, px - cx, py - cy, pz - cz);
  if (d6 >= 0 && d5 <= d6) return assign(out, 0, 0, 1);

  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    return assign(out, 1 - w, 0, w);
  }

  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
    return assign(out, 0, 1 - w, w);
  }

  const sum = va + vb + vc;
  if (sum === 0) return assign(out, 1, 0, 0);
  const v = vb / sum;
  const w = vc / sum;
  return assign(out, 1 - v - w, v, w);
}
