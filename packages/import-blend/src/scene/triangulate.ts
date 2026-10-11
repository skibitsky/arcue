import type { MeshData } from "./mesh-data";

type Vec = [number, number, number];

function point(positions: Float32Array, vertex: number): Vec {
  return [positions[vertex * 3] ?? 0, positions[vertex * 3 + 1] ?? 0, positions[vertex * 3 + 2] ?? 0];
}

function sub(a: Vec, b: Vec): Vec {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function cross(a: Vec, b: Vec): Vec {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function dot(a: Vec, b: Vec): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/** Blender's `is_quad_flip_v3_first_third_fast`: whether splitting along 0–2 would fold the quad. */
function quadFlips(a: Vec, b: Vec, c: Vec, d: Vec): boolean {
  const ab = sub(b, a);
  const ac = sub(c, a);
  const ad = sub(d, a);
  return dot(cross(ab, ac), cross(ad, ac)) > 0;
}

/** Corner positions of a polygon projected onto the plane of its normal. */
function project(points: readonly Vec[], normal: Vec): [number, number][] {
  const axis = Math.abs(normal[0]) > Math.abs(normal[1]) ? [0, 1, 0] : [1, 0, 0];
  let u = cross(axis as Vec, normal);
  const length = Math.hypot(u[0], u[1], u[2]) || 1;
  u = [u[0] / length, u[1] / length, u[2] / length];
  const v = cross(normal, u);
  return points.map((p) => [dot(p, u), dot(p, v)]);
}

function area2(a: [number, number], b: [number, number], c: [number, number]): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function inside(p: [number, number], a: [number, number], b: [number, number], c: [number, number]): boolean {
  return area2(a, b, p) >= 0 && area2(b, c, p) >= 0 && area2(c, a, p) >= 0;
}

/** Ear clipping in the polygon's plane; falls back to a fan when no ear is left, as for degenerate polygons. */
function earClip(flat: [number, number][]): number[] {
  const triangles: number[] = [];
  const remaining = flat.map((_, index) => index);
  let guard = remaining.length * remaining.length;
  while (remaining.length > 3 && guard-- > 0) {
    let clipped = false;
    for (let i = 0; i < remaining.length; i++) {
      const ia = remaining[(i + remaining.length - 1) % remaining.length] ?? 0;
      const ib = remaining[i] ?? 0;
      const ic = remaining[(i + 1) % remaining.length] ?? 0;
      const a = flat[ia] ?? [0, 0];
      const b = flat[ib] ?? [0, 0];
      const c = flat[ic] ?? [0, 0];
      if (area2(a, b, c) <= 0) continue;
      const blocked = remaining.some((other) => {
        if (other === ia || other === ib || other === ic) return false;
        return inside(flat[other] ?? [0, 0], a, b, c);
      });
      if (blocked) continue;
      triangles.push(ia, ib, ic);
      remaining.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) break;
  }
  for (let i = 1; i + 1 < remaining.length; i++) {
    triangles.push(remaining[0] ?? 0, remaining[i] ?? 0, remaining[i + 1] ?? 0);
  }
  return triangles;
}

/**
 * Triangles of each face as corner indices, three per triangle, in face order: quads split along the 0–2 diagonal
 * unless that folds them, as Blender does, and larger polygons by ear clipping. `faceTriangles[f]` is the first
 * triangle of face f.
 */
export function triangulate(
  mesh: Pick<MeshData, "positions" | "faceOffsets" | "cornerVerts" | "faceCount">,
  faceNormals: Float32Array,
): { corners: Uint32Array; faceTriangles: Uint32Array } {
  const { positions, faceOffsets, cornerVerts } = mesh;
  let total = 0;
  for (let f = 0; f < mesh.faceCount; f++) total += Math.max((faceOffsets[f + 1] ?? 0) - (faceOffsets[f] ?? 0) - 2, 0);
  const corners = new Uint32Array(total * 3);
  const faceTriangles = new Uint32Array(mesh.faceCount + 1);
  let written = 0;
  for (let f = 0; f < mesh.faceCount; f++) {
    faceTriangles[f] = written / 3;
    const start = faceOffsets[f] ?? 0;
    const size = (faceOffsets[f + 1] ?? 0) - start;
    if (size < 3) continue;
    const at = (k: number) => point(positions, cornerVerts[start + k] ?? 0);
    if (size === 3) {
      corners.set([start, start + 1, start + 2], written);
    } else if (size === 4) {
      if (quadFlips(at(0), at(1), at(2), at(3)))
        corners.set([start, start + 1, start + 3, start + 1, start + 2, start + 3], written);
      else corners.set([start, start + 1, start + 2, start, start + 2, start + 3], written);
    } else {
      const normal: Vec = [faceNormals[f * 3] ?? 0, faceNormals[f * 3 + 1] ?? 0, faceNormals[f * 3 + 2] ?? 1];
      const local = earClip(
        project(
          Array.from({ length: size }, (_, k) => at(k)),
          normal,
        ),
      );
      corners.set(
        local.map((k) => start + k),
        written,
      );
    }
    written += (size - 2) * 3;
  }
  faceTriangles[mesh.faceCount] = written / 3;
  return { corners, faceTriangles };
}
