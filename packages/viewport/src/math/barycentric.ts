import type { Barycentric, Vec3 } from "@arcue/scene";
import { closestPointOnTriangle } from "@arcue/scene";

export interface RayHit {
  weights: Barycentric;
  /** Distance along the ray's direction, in units of its length. */
  distance: number;
}

/**
 * Barycentric weights of the point where a ray meets triangle abc. The ID pass already chose the triangle, so a ray
 * that grazes past an edge by a rounding error still counts: the point clamps onto the nearest edge. Null only when the
 * ray runs parallel to the triangle or the triangle has no area.
 */
export function rayTriangleWeights(origin: Vec3, direction: Vec3, a: Vec3, b: Vec3, c: Vec3): RayHit | null {
  const e1: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const e2: Vec3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const normal = cross(e1, e2);
  const area = Math.hypot(normal[0], normal[1], normal[2]);
  const denominator = dot(normal, direction);
  const scale = area * Math.hypot(direction[0], direction[1], direction[2]);
  if (area === 0 || scale === 0 || Math.abs(denominator) < 1e-12 * scale) return null;
  const distance = dot(normal, [a[0] - origin[0], a[1] - origin[1], a[2] - origin[2]]) / denominator;
  const point: Vec3 = [
    origin[0] + direction[0] * distance,
    origin[1] + direction[1] * distance,
    origin[2] + direction[2] * distance,
  ];
  return { weights: closestPointOnTriangle(point, a, b, c), distance };
}

export function mixPoint(weights: Barycentric, a: Vec3, b: Vec3, c: Vec3): Vec3 {
  return [
    weights[0] * a[0] + weights[1] * b[0] + weights[2] * c[0],
    weights[0] * a[1] + weights[1] * b[1] + weights[2] * c[1],
    weights[0] * a[2] + weights[1] * b[2] + weights[2] * c[2],
  ];
}

/** Weights rounded to six decimals that still sum to exactly 1, so stored anchors stay short and valid. */
export function roundWeights(weights: Barycentric): Barycentric {
  const total = weights[0] + weights[1] + weights[2] || 1;
  const u = Math.min(1, Math.max(0, Math.round((weights[0] / total) * 1e6) / 1e6));
  const v = Math.min(1 - u, Math.max(0, Math.round((weights[1] / total) * 1e6) / 1e6));
  return [u, Math.round(v * 1e6) / 1e6, Math.max(0, Math.round((1 - u - v) * 1e6) / 1e6)];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
