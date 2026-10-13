import type { AssetVersion, Comment, PartView } from "@arcue/protocol";
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
import { anchorRestPositions, meshesOf, modelSize, nameInPath, weightedPoint } from "./scene-lookup";

/** A target farther than this share of the model's size from every surface is detached. */
export const DETACH_SHARE = 0.02;

const INDEX_MIN_QUERIES = 128;

/**
 * Moves comment anchors onto a new version of the asset. A mesh whose topology fingerprint matches the one in the
 * comment's `anchorVersion` keeps its vertex and triangle numbers exactly. So does a mesh whose path alone changed, as
 * when its parent object was renamed: the one mesh of the same file with the same name and topology at a path the
 * anchor version did not have. Otherwise the stored rest positions are mapped onto the new rest pose: a pin to the
 * closest surface point, and a region vertex by vertex to the nearest vertices, tinting the new triangles whose
 * corners all mapped, or failing that the triangles that touch them. A target with no surface within `DETACH_SHARE`
 * of the model's size is detached and keeps its old anchor. In a composition a target moves only onto meshes of its
 * own file, so each file re-anchors on its own, and a target on a file the version does not load stays as it is until
 * the file loads again. The part ids a comment's parts view stores follow their meshes' paths the same way, and the
 * ids of LOD group nodes and sockets follow an ancestor whose path changed with its meshes.
 */
export class Reanchorer {
  readonly #versions: ReadonlyMap<string, AssetVersion>;
  /** The versions before this one, newest first. */
  readonly #earlier: readonly AssetVersion[];
  readonly #versionId: string;
  readonly #meshes: MeshAtPath[];
  readonly #paths: ReadonlySet<string>;
  /** The meshes by file and name, as a renamed mesh is looked up. */
  readonly #named = new Map<string, MeshAtPath[]>();
  readonly #partIds: ReadonlySet<string>;
  /** The files that brought meshes to the version, null for the model's own. */
  readonly #files: ReadonlySet<string | null>;
  readonly #threshold: number;
  readonly #triangles = new Map<number, Uint32Array>();
  readonly #vertices = new Map<number, VertexIndex>();
  readonly #versionPaths = new Map<string, ReadonlySet<string>>();
  readonly #movedAncestors = new Map<string, ReadonlyMap<string, string>>();

  constructor(versions: readonly AssetVersion[], versionId: string, scene: SceneDescription) {
    this.#versions = new Map(versions.map((version) => [version.id, version]));
    this.#earlier = versions.filter((version) => version.id !== versionId).reverse();
    this.#versionId = versionId;
    this.#meshes = meshesOf(scene);
    this.#paths = new Set(this.#meshes.map((entry) => entry.path));
    for (const entry of this.#meshes) {
      const key = namedKey(entry.path);
      const named = this.#named.get(key);
      if (named) named.push(entry);
      else this.#named.set(key, [entry]);
    }
    this.#partIds = new Set(scene.parts.map((part) => part.id));
    this.#files = new Set(this.#meshes.map((entry) => splitMemberPath(entry.path).file));
    this.#threshold = DETACH_SHARE * modelSize(scene);
  }

  reanchor(comment: Comment): Comment {
    if (comment.anchorVersion === this.#versionId) return comment;
    const anchored = this.#reanchorTarget(comment);
    const parts = comment.parts && this.#renamedParts(comment.parts, comment.anchorVersion);
    return parts === comment.parts ? anchored : { ...anchored, parts };
  }

  #reanchorTarget(comment: Comment): Comment {
    const target = comment.target;
    if (target === null) return comment;
    const samePath = this.#meshes.find((entry) => entry.path === target.mesh) ?? null;
    const anchorVersion = this.#versions.get(comment.anchorVersion);
    const previous = anchorVersion?.meshes.find((mesh) => mesh.mesh === target.mesh);
    if (samePath && previous && sameTopology(previous.topology, samePath.mesh.topology)) {
      return this.#anchored(comment, samePath, target, "exact");
    }
    const renamed = anchorVersion ? this.#renamed(target.mesh, anchorVersion) : null;
    if (renamed) return this.#anchored(comment, renamed, { ...target, mesh: renamed.path }, "exact");
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

  /**
   * The mesh that a mesh of an earlier version became when only its path changed: the one mesh of the same file with
   * the same name and topology at a path that version did not have. Null while a mesh still has the path.
   */
  #renamed(path: string, version: AssetVersion): MeshAtPath | null {
    if (this.#paths.has(path)) return null;
    const before = version.meshes.find((mesh) => mesh.mesh === path);
    if (!before) return null;
    const earlier = this.#pathsOf(version);
    const found = (this.#named.get(namedKey(path)) ?? []).filter(
      (entry) => !earlier.has(entry.path) && sameTopology(before.topology, entry.mesh.topology),
    );
    return found.length === 1 ? (found[0] ?? null) : null;
  }

  #pathsOf(version: AssetVersion): ReadonlySet<string> {
    let paths = this.#versionPaths.get(version.id);
    if (!paths) {
      paths = new Set(version.meshes.map((mesh) => mesh.mesh));
      this.#versionPaths.set(version.id, paths);
    }
    return paths;
  }

  /**
   * The ancestors whose path changed since an earlier version, old path to new, as the paths of its renamed meshes
   * show. An ancestor counts when its meshes agree on its new path, no mesh of that version was under the new path,
   * and no mesh of this version is under the old one.
   */
  #ancestorsMovedSince(version: AssetVersion): ReadonlyMap<string, string> {
    const known = this.#movedAncestors.get(version.id);
    if (known) return known;
    const found = new Map<string, string | null>();
    for (const { mesh: path } of version.meshes) {
      const renamed = this.#renamed(path, version);
      const moved = renamed && movedAncestor(path, renamed.path);
      if (!moved) continue;
      const seen = found.get(moved.from);
      found.set(moved.from, seen === undefined || seen === moved.to ? moved.to : null);
    }
    const under = (paths: ReadonlySet<string>, ancestor: string) =>
      [...paths].some((path) => path.startsWith(`${ancestor}/`));
    const moved = new Map<string, string>();
    for (const [from, to] of found) {
      if (to !== null && !under(this.#pathsOf(version), to) && !under(this.#paths, from)) moved.set(from, to);
    }
    this.#movedAncestors.set(version.id, moved);
    return moved;
  }

  /**
   * The part id an id of an earlier version became: the path its mesh moved to, as a target moves, or else its path
   * under the new path of an ancestor that moved. Null when the version gives no part of this one.
   */
  #renamedPart(id: string, version: AssetVersion): string | null {
    const mesh = this.#renamed(id, version)?.path;
    if (mesh !== undefined && this.#partIds.has(mesh)) return mesh;
    let best: string | null = null;
    let longest = -1;
    for (const [from, to] of this.#ancestorsMovedSince(version)) {
      if (from.length <= longest || !id.startsWith(`${from}/`)) continue;
      const renamed = to + id.slice(from.length);
      if (!this.#partIds.has(renamed)) continue;
      best = renamed;
      longest = from.length;
    }
    return best;
  }

  /**
   * A stored parts view with each part id this version lacks moved to the part it became, looked up in the anchor
   * version and then in each earlier version, newest first. The view itself when nothing moved.
   */
  #renamedParts(view: PartView, anchorVersion: string): PartView {
    const anchor = this.#versions.get(anchorVersion);
    const versions = anchor ? [anchor, ...this.#earlier.filter((version) => version !== anchor)] : this.#earlier;
    let changed = false;
    const rename = (id: string): string => {
      if (this.#partIds.has(id)) return id;
      for (const version of versions) {
        const renamed = this.#renamedPart(id, version);
        if (renamed === null) continue;
        changed = true;
        return renamed;
      }
      return id;
    };
    const renameAll = (ids: readonly string[]) => [...new Set(ids.map(rename))].sort();
    const next = {
      ...view,
      hidden: renameAll(view.hidden),
      shown: renameAll(view.shown),
      isolated: view.isolated === null ? null : rename(view.isolated),
    };
    return changed ? next : view;
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

const SEPARATOR = /(?<!\\)\//;

function namedKey(path: string): string {
  return `${splitMemberPath(path).file ?? ""}\n${nameInPath(path)}`;
}

/**
 * The ancestor whose path changed between two paths of one mesh: what is left of each once the segments they end in
 * alike are taken off. Null when they end in nothing alike, or when one has nothing left.
 */
function movedAncestor(before: string, after: string): { from: string; to: string } | null {
  const from = before.split(SEPARATOR);
  const to = after.split(SEPARATOR);
  let same = 0;
  while (same < from.length && same < to.length && from[from.length - 1 - same] === to[to.length - 1 - same]) same++;
  if (same === 0 || same === from.length || same === to.length) return null;
  return { from: from.slice(0, -same).join("/"), to: to.slice(0, -same).join("/") };
}
