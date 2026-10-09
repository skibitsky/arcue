import type { RegionAnchor, SpatialAnchor, SurfaceAnchor, Vec3 } from "@arcue/scene";
import type { Camera } from "three";
import { Vector3 } from "three";
import type { AnchorVertices } from "../math/context";
import { anchorVertices } from "../math/context";
import { findTriangle, regionTriangles } from "../math/regions";
import type { MeshRuntime, Model } from "./model";

/** A surface anchor matched to the mesh on screen: the rendered corners its weights apply to. */
export interface ResolvedSurface {
  kind: "surface";
  runtime: MeshRuntime;
  /** The triangle with exactly the anchor's source vertices, or -1 when no triangle has them. */
  triangle: number;
  corners: [number, number, number];
  weights: [number, number, number];
}

export interface ResolvedRegion {
  kind: "region";
  runtime: MeshRuntime;
  triangles: Uint32Array;
  triangleSet: ReadonlySet<number>;
  target: AnchorVertices;
}

export type ResolvedAnchor = ResolvedSurface | ResolvedRegion;

/** Matches an anchor to the scene on screen, or null when its mesh is hidden or its mesh or vertices are not in it. */
export function resolveAnchor(model: Model, anchor: SpatialAnchor): ResolvedAnchor | null {
  const runtime = model.meshByPath.get(anchor.mesh);
  if (!runtime?.visible) return null;
  try {
    return anchor.kind === "surface" ? resolveSurface(runtime, anchor) : resolveRegion(runtime, anchor);
  } catch {
    return null;
  }
}

function resolveSurface(runtime: MeshRuntime, anchor: SurfaceAnchor): ResolvedSurface | null {
  const mesh = runtime.data;
  if (anchor.vertices.some((vertex) => !Number.isInteger(vertex) || vertex < 0 || vertex >= mesh.sourceVertexCount)) {
    return null;
  }
  const triangle = findTriangle(mesh, runtime.adjacency(), anchor.vertices);
  const corners: [number, number, number] = [-1, -1, -1];
  anchor.vertices.forEach((source, k) => {
    if (triangle >= 0) {
      for (let corner = 0; corner < 3; corner++) {
        const rendered = mesh.indices[triangle * 3 + corner] ?? 0;
        if ((mesh.sourceVertex[rendered] ?? -1) === source) corners[k] = rendered;
      }
    }
    if (corners[k] === -1) corners[k] = runtime.representatives[source] ?? -1;
  });
  if (corners.some((corner) => corner < 0)) return null;
  return { kind: "surface", runtime, triangle, corners, weights: [...anchor.weights] };
}

function resolveRegion(runtime: MeshRuntime, anchor: RegionAnchor): ResolvedRegion | null {
  const triangles = regionTriangles(anchor, runtime.triangleCount);
  if (!triangles) return null;
  return {
    kind: "region",
    runtime,
    triangles,
    triangleSet: new Set(triangles),
    target: anchorVertices(anchor, runtime.data),
  };
}

const scratch = new Float64Array(3);

/** The anchor's point in the current pose: a pin's spot on its triangle, or a region's posed centroid. */
export function anchorPoint(resolved: ResolvedAnchor, out = new Vector3()): Vector3 {
  out.set(0, 0, 0);
  if (resolved.kind === "surface") {
    resolved.corners.forEach((corner, k) => {
      resolved.runtime.posed.get(corner, scratch);
      const weight = resolved.weights[k] ?? 0;
      out.x += weight * (scratch[0] ?? 0);
      out.y += weight * (scratch[1] ?? 0);
      out.z += weight * (scratch[2] ?? 0);
    });
    return out;
  }
  const { vertices, weights } = resolved.target;
  vertices.forEach((source, index) => {
    sourcePosition(resolved.runtime, source, scratch);
    const weight = weights[index] ?? 0;
    out.x += weight * (scratch[0] ?? 0);
    out.y += weight * (scratch[1] ?? 0);
    out.z += weight * (scratch[2] ?? 0);
  });
  return out;
}

/** A source vertex in the current pose, through its first rendered vertex; its rest position if it has none. */
export function sourcePosition(runtime: MeshRuntime, source: number, out: Float64Array): void {
  const rendered = runtime.representatives[source] ?? -1;
  if (rendered >= 0) {
    runtime.posed.get(rendered, out);
    return;
  }
  out[0] = runtime.data.restPositions[source * 3] ?? 0;
  out[1] = runtime.data.restPositions[source * 3 + 1] ?? 0;
  out[2] = runtime.data.restPositions[source * 3 + 2] ?? 0;
}

const a = new Float64Array(3);
const b = new Float64Array(3);
const c = new Float64Array(3);

export function triangleCorners(runtime: MeshRuntime, triangle: number): [Vec3, Vec3, Vec3] {
  const indices = runtime.data.indices;
  runtime.posed.get(indices[triangle * 3] ?? 0, a);
  runtime.posed.get(indices[triangle * 3 + 1] ?? 0, b);
  runtime.posed.get(indices[triangle * 3 + 2] ?? 0, c);
  return [
    [a[0] ?? 0, a[1] ?? 0, a[2] ?? 0],
    [b[0] ?? 0, b[1] ?? 0, b[2] ?? 0],
    [c[0] ?? 0, c[1] ?? 0, c[2] ?? 0],
  ];
}

/**
 * Whether the triangle under a pin faces the camera in the current pose, by the same rule the GPU culls with: the
 * winding in scene space, flipped when the mesh's node is mirrored. Double-sided meshes, regions and a pin whose
 * vertices form no triangle count as facing, so only the ID pass decides whether they are hidden.
 */
export function facesCamera(resolved: ResolvedAnchor, camera: Camera): boolean {
  if (resolved.kind !== "surface" || resolved.triangle < 0 || resolved.runtime.doubleSided) return true;
  const [p0, p1, p2] = triangleCorners(resolved.runtime, resolved.triangle);
  const e1 = new Vector3(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
  const e2 = new Vector3(p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]);
  const normal = e1.cross(e2);
  if (normal.lengthSq() === 0) return true;
  const toCamera = new Vector3().setFromMatrixPosition(camera.matrixWorld).sub(new Vector3(...p0));
  return normal.dot(toCamera) > 0 !== resolved.runtime.mirrored;
}

export function regionRadius(resolved: ResolvedRegion, center: Vector3): number {
  let radius = 0;
  const { vertices } = resolved.target;
  const step = Math.max(1, Math.floor(vertices.length / 256));
  for (let index = 0; index < vertices.length; index += step) {
    sourcePosition(resolved.runtime, vertices[index] ?? 0, scratch);
    radius = Math.max(radius, center.distanceTo(new Vector3(scratch[0], scratch[1], scratch[2])));
  }
  return radius;
}
