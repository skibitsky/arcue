import type { AssetVersion, Comment } from "@arcue/protocol";
import type { RegionAnchor, SceneDescription, SpatialAnchor, SurfaceAnchor } from "@arcue/scene";
import {
  closestSurfacePoint,
  encodeRanges,
  nearestVertex,
  sameTopology,
  sourceIndices,
  splitMemberPath,
  VertexIndex,
} from "@arcue/scene";
import type { MeshAtPath } from "./scene-lookup";
import { anchorRestPositions, meshesOf, modelSize, weightedPoint } from "./scene-lookup";

/** A target farther than this share of the model's size from every surface is detached. */
export const DETACH_SHARE = 0.02;

const INDEX_MIN_QUERIES = 128;

/**
 * Moves comment anchors onto a new version of the asset. A mesh whose topology fingerprint matches the one in the
 * comment's `anchorVersion` keeps its vertex and triangle numbers exactly. Otherwise the stored rest positions are
 * mapped onto the new rest pose: a pin to the closest surface point, and a region vertex by vertex to the nearest
 * vertices, tinting the new triangles whose corners all mapped, or failing that the triangles that touch them. A target with no surface within `DETACH_SHARE` of the model's size is detached and keeps its old anchor.
 * In a composition a target moves only onto meshes of its own file, so each file re-anchors on its own, and a target
 * on a file the version does not load stays as it is until the file loads again.
 */
export class Reanchorer {
  readonly #versions: ReadonlyMap<string, AssetVersion>;
  readonly #versionId: string;
  readonly #meshes: MeshAtPath[];
  /** The files that brought meshes to the version, null for the model's own. */
  readonly #files: ReadonlySet<string | null>;
  readonly #threshold: number;
  readonly #triangles = new Map<number, Uint32Array>();
  readonly #vertices = new Map<number, VertexIndex>();

  constructor(versions: readonly AssetVersion[], versionId: string, scene: SceneDescription) {
    this.#versions = new Map(versions.map((version) => [version.id, version]));
    this.#versionId = versionId;
    this.#meshes = meshesOf(scene);
    this.#files = new Set(this.#meshes.map((entry) => splitMemberPath(entry.path).file));
    this.#threshold = DETACH_SHARE * modelSize(scene);
  }

  reanchor(comment: Comment): Comment {
    const target = comment.target;
    if (target === null || comment.anchorVersion === this.#versionId) return comment;
    const samePath = this.#meshes.find((entry) => entry.path === target.mesh) ?? null;
    const previous = this.#versions.get(comment.anchorVersion)?.meshes.find((mesh) => mesh.mesh === target.mesh);
    if (samePath && previous && sameTopology(previous.topology, samePath.mesh.topology)) {
      return this.#anchored(comment, samePath, target, "exact");
    }
    const file = splitMemberPath(target.mesh).file;
    if (file !== null && !this.#files.has(file)) return comment;
    const candidates = samePath
      ? [samePath]
      : this.#meshes.filter((entry) => splitMemberPath(entry.path).file === file);
    const moved =
      target.kind === "surface" ? this.#movePin(comment, target, candidates) : this.#moveRegion(comment, candidates);
    if (!moved) return { ...comment, anchorState: "detached" };
    return this.#anchored(comment, moved.entry, moved.target, "moved");
  }

  #anchored(comment: Comment, entry: MeshAtPath, target: SpatialAnchor, state: "exact" | "moved"): Comment {
    return {
      ...comment,
      target,
      anchorVersion: this.#versionId,
      anchorRestPositions: anchorRestPositions(entry.mesh, target),
      anchorState: state,
    };
  }

  #sourceTriangles(entry: MeshAtPath): Uint32Array {
    let triangles = this.#triangles.get(entry.index);
    if (!triangles) {
      triangles = sourceIndices(entry.mesh.indices, entry.mesh.sourceVertex);
      this.#triangles.set(entry.index, triangles);
    }
    return triangles;
  }

  #movePin(
    comment: Comment,
    target: SurfaceAnchor,
    candidates: readonly MeshAtPath[],
  ): { entry: MeshAtPath; target: SurfaceAnchor } | null {
    const point = weightedPoint(comment.anchorRestPositions, target.weights);
    let best: { entry: MeshAtPath; target: SurfaceAnchor; distance: number } | null = null;
    for (const entry of candidates) {
      const triangles = this.#sourceTriangles(entry);
      const found = closestSurfacePoint(entry.mesh.restPositions, triangles, point);
      if (!found || (best && found.distance >= best.distance)) continue;
      const corner = (k: number) => triangles[found.triangle * 3 + k] ?? 0;
      best = {
        entry,
        distance: found.distance,
        target: {
          kind: "surface",
          mesh: entry.path,
          vertices: [corner(0), corner(1), corner(2)],
          weights: found.weights,
        },
      };
    }
    return best && best.distance <= this.#threshold ? best : null;
  }

  #moveRegion(comment: Comment, candidates: readonly MeshAtPath[]): { entry: MeshAtPath; target: RegionAnchor } | null {
    let best: { entry: MeshAtPath; kept: Set<number>; total: number } | null = null;
    for (const entry of candidates) {
      let vertices = this.#vertices.get(entry.index);
      if (!vertices && comment.anchorRestPositions.length >= INDEX_MIN_QUERIES) {
        vertices = new VertexIndex(entry.mesh.restPositions);
        this.#vertices.set(entry.index, vertices);
      }
      const kept = new Set<number>();
      let total = 0;
      for (const position of comment.anchorRestPositions) {
        const found = vertices ? vertices.nearest(position) : nearestVertex(entry.mesh.restPositions, position);
        if (!found || found.distance > this.#threshold) continue;
        kept.add(found.vertex);
        total += found.distance;
      }
      if (kept.size === 0) continue;
      if (!best || kept.size > best.kept.size || (kept.size === best.kept.size && total < best.total)) {
        best = { entry, kept, total };
      }
    }
    if (!best) return null;
    const { entry, kept } = best;
    const triangles = this.#sourceTriangles(entry);
    const covered = (every: boolean) => {
      const chosen: number[] = [];
      for (let triangle = 0; triangle * 3 + 2 < triangles.length; triangle++) {
        const corners = [0, 1, 2].map((k) => kept.has(triangles[triangle * 3 + k] ?? -1));
        if (every ? corners.every(Boolean) : corners.some(Boolean)) chosen.push(triangle);
      }
      return chosen;
    };
    const fullyInside = covered(true);
    const chosen = fullyInside.length > 0 ? fullyInside : covered(false);
    if (chosen.length === 0) return null;
    return {
      entry,
      target: { kind: "region", mesh: entry.path, triangles: encodeRanges(chosen), vertices: encodeRanges(kept) },
    };
  }
}
