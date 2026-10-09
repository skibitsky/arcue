import type { Vec3 } from "./math";

/** Inclusive range of indices: [5, 7] covers 5, 6 and 7. */
export type IndexRange = [start: number, end: number];

/** A point on a mesh surface. It follows the surface as the mesh deforms. */
export interface SurfaceAnchor {
  kind: "surface";
  /** Path of the mesh node. */
  mesh: string;
  /** The source vertices of the triangle under the point. */
  vertices: [number, number, number];
  /** Barycentric weights of `vertices`, summing to 1. */
  weights: [number, number, number];
}

/** A painted area of a mesh surface. */
export interface RegionAnchor {
  kind: "region";
  /** Path of the mesh node. */
  mesh: string;
  /** Painted triangles, as ranges in `encodeRanges` form. */
  triangles: IndexRange[];
  /** Source vertices of the painted triangles, as ranges in `encodeRanges` form. */
  vertices: IndexRange[];
}

export type SpatialAnchor = SurfaceAnchor | RegionAnchor;

/**
 * Frames count from 0 at the clip's start. `clip` is the clip's name in the file, which identifies it; lookups use
 * it. `clipDisplayName` is for people. Screenshots and context of a range use its start frame.
 */
export type TimeAnchor =
  | { kind: "none" }
  | { kind: "frame"; clip: string; clipDisplayName: string; frame: number }
  | { kind: "range"; clip: string; clipDisplayName: string; start: number; end: number };

export interface CameraAnchor {
  position: Vec3;
  target: Vec3;
  up: Vec3;
  /** Vertical field of view in degrees. */
  fov: number;
}
