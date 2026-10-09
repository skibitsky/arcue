import type { PartView, QueryOutput, TimeSelection } from "@arcue/protocol";
import { ArcueError } from "@arcue/protocol";
import type { Clip, Mesh, SceneDescription, SpatialAnchor, TimeAnchor, Vec3 } from "@arcue/scene";
import { decodeRanges, isDefaultPartView, knownPartView, lastFrame, rangesWithin, shownByDefault } from "@arcue/scene";
import { round5 } from "./coordinates";

export interface MeshAtPath {
  index: number;
  /** The mesh node's name, as the exporting tool shows the object. */
  name: string;
  path: string;
  mesh: Mesh;
}

export function meshesOf(scene: SceneDescription): MeshAtPath[] {
  const meshes: MeshAtPath[] = [];
  for (const node of scene.nodes) {
    const mesh = node.mesh === null ? undefined : scene.meshes[node.mesh];
    if (node.mesh !== null && mesh) meshes.push({ index: node.mesh, name: node.name, path: node.path, mesh });
  }
  return meshes;
}

export function meshAtPath(scene: SceneDescription, path: string): MeshAtPath | null {
  return meshesOf(scene).find((entry) => entry.path === path) ?? null;
}

export function findClip(scene: SceneDescription, name: string): Clip | null {
  return scene.clips.find((clip) => clip.name === name) ?? null;
}

/** Checks a time against the scene's clips and adds the clip's display name. */
export function resolveTime(scene: SceneDescription, time: TimeSelection): TimeAnchor {
  if (time.kind === "none") return { kind: "none" };
  const clip = findClip(scene, time.clip);
  if (!clip) throw new ArcueError("invalid-input", `The asset has no clip named "${time.clip}".`);
  const last = lastFrame(clip);
  const end = time.kind === "frame" ? time.frame : time.end;
  if (end > last) throw new ArcueError("invalid-input", `Clip "${clip.name}" ends at frame ${last}, not ${end}.`);
  if (time.kind === "frame") {
    return { kind: "frame", clip: clip.name, clipDisplayName: clip.displayName, frame: time.frame };
  }
  return { kind: "range", clip: clip.name, clipDisplayName: clip.displayName, start: time.start, end: time.end };
}

/** Checks that a target names a mesh of the scene and only its vertices and triangles. */
export function checkTarget(scene: SceneDescription, target: SpatialAnchor): MeshAtPath {
  const entry = meshAtPath(scene, target.mesh);
  if (!entry) throw new ArcueError("invalid-input", `The asset has no mesh at "${target.mesh}".`);
  const { mesh } = entry;
  if (target.kind === "surface") {
    if (target.vertices.some((vertex) => vertex >= mesh.sourceVertexCount)) {
      throw new ArcueError("invalid-input", `"${target.mesh}" has ${mesh.sourceVertexCount} vertices.`);
    }
    if (target.weights.some((weight) => !Number.isFinite(weight))) {
      throw new ArcueError("invalid-input", "The pin's weights must be finite numbers.");
    }
    return entry;
  }
  if (!rangesWithin(target.vertices, mesh.sourceVertexCount)) {
    throw new ArcueError("invalid-input", `"${target.mesh}" has ${mesh.sourceVertexCount} vertices.`);
  }
  if (!rangesWithin(target.triangles, mesh.indices.length / 3)) {
    throw new ArcueError("invalid-input", `"${target.mesh}" has ${mesh.indices.length / 3} triangles.`);
  }
  return entry;
}

/** The target's anchored source vertices, in its own order: a pin's three corners, or a region's decoded ranges. */
export function anchoredVertices(target: SpatialAnchor): number[] {
  return target.kind === "surface" ? [...target.vertices] : Array.from(decodeRanges(target.vertices));
}

export function restPosition(mesh: Mesh, vertex: number): Vec3 {
  const at = vertex * 3;
  return [mesh.restPositions[at] ?? 0, mesh.restPositions[at + 1] ?? 0, mesh.restPositions[at + 2] ?? 0];
}

/** Rest positions of the anchored vertices, rounded to 0.00001 m. */
export function anchorRestPositions(mesh: Mesh, target: SpatialAnchor | null): Vec3[] {
  if (target === null) return [];
  return anchoredVertices(target).map((vertex) => {
    const [x, y, z] = restPosition(mesh, vertex);
    return [round5(x), round5(y), round5(z)];
  });
}

/** Length of the diagonal of the scene's rest-pose bounds. */
export function modelSize(scene: SceneDescription): number {
  const { min, max } = scene.bounds;
  return Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
}

/** The point at barycentric `weights` between three positions. */
export function weightedPoint(positions: readonly Vec3[], weights: readonly [number, number, number]): Vec3 {
  const point: Vec3 = [0, 0, 0];
  positions.forEach((position, corner) => {
    const weight = weights[corner] ?? 0;
    point[0] += position[0] * weight;
    point[1] += position[1] * weight;
    point[2] += position[2] * weight;
  });
  return point;
}

/** The last name in a node path, without escapes or a "#n" repeat number. */
export function nameInPath(path: string): string {
  const segments = path.split(/(?<!\\)\//);
  return (segments.at(-1) ?? path).replace(/#\d+$/, "").replace(/\\(.)/g, "$1");
}

/**
 * A parts view as a comment stores it: parts the scene does not have dropped, ids sorted once each, and the LOD no
 * higher than the scene's highest level. Undefined for the default view.
 */
export function storedPartView(scene: SceneDescription, view: PartView | undefined): PartView | undefined {
  if (!view) return undefined;
  const stored = knownPartView(scene.parts, view);
  return isDefaultPartView(stored) ? undefined : stored;
}

/** The scene's parts with the node path and triangle count of each level, as `scene.parts` answers. */
export function partsOf(scene: SceneDescription): QueryOutput<"scene.parts">["parts"] {
  const paths = new Map(meshesOf(scene).map((entry) => [entry.index, entry]));
  return scene.parts.map((part) => ({
    id: part.id,
    name: part.name,
    role: part.role,
    shownByDefault: shownByDefault(part),
    levels: part.levels.map(({ level, meshes }) => ({
      level,
      meshes: meshes.flatMap((index) => paths.get(index)?.path ?? []),
      triangles: meshes.reduce((sum, index) => sum + (paths.get(index)?.mesh.indices.length ?? 0) / 3, 0),
    })),
  }));
}
