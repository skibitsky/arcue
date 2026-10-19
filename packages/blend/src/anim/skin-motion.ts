import type { Mat4, Trs } from "../math.js";
import { compose, decompose, identity, invert, multiply, toSceneAxes } from "../math.js";
import type { BuiltScene } from "../scene/build.js";
import type { BlendWarning, Quat, Track, Vec3 } from "../types.js";
import type { ParsedClip } from "./clips.js";

const TOLERANCE = 1e-4;
/** Float32 rounding relative to a value's size, which far from the origin exceeds `TOLERANCE`. */
const FLOAT32_ROUNDING = 2 ** -23;
const IDENTITY = identity();

/** The node and its ancestors, the node first. */
function lineage(scene: BuiltScene, node: number): number[] {
  const result: number[] = [];
  for (let at = node; at >= 0 && !result.includes(at); at = scene.nodes[at]?.parent ?? -1) result.push(at);
  return result;
}

/** The node of the armature object whose bones are the skeleton's joints. */
function armatureNode(scene: BuiltScene, joints: readonly number[]): number | null {
  let node = joints.find((joint) => scene.nodes[joint]?.kind === "bone");
  if (node === undefined) return null;
  while (scene.nodes[node]?.kind === "bone") node = scene.nodes[node]?.parent ?? -1;
  return node >= 0 ? node : null;
}

/** The nodes below `ancestor` on the way down to the chain's first node, top first; all of them for no ancestor. */
function pathBelow(chain: readonly number[], ancestor: number): number[] {
  const end = ancestor < 0 ? chain.length : chain.indexOf(ancestor);
  return chain.slice(0, end).reverse();
}

/** The value a track holds at one of its clip's sample times: its last key at or before the time. */
function valueAt(track: Track, time: number): number[] {
  let key = 0;
  let last = track.times.length - 1;
  while (key < last) {
    const middle = (key + last + 1) >> 1;
    if ((track.times[middle] ?? 0) <= time) key = middle;
    else last = middle - 1;
  }
  const width = track.values.length / Math.max(track.times.length, 1);
  const value: number[] = [];
  for (let c = 0; c < width; c++) value.push(track.values[key * width + c] ?? 0);
  return value;
}

/**
 * The times at which a track's value changes from the key before, and its first time. At any other of its clip's
 * sample times the track holds a value it holds at one of these.
 */
function changeTimes(track: Track): number[] {
  const width = track.values.length / Math.max(track.times.length, 1);
  const times: number[] = [];
  for (let k = 0; k < track.times.length; k++) {
    let changed = k === 0;
    for (let c = 0; c < width && !changed; c++) {
      changed = track.values[k * width + c] !== track.values[(k - 1) * width + c];
    }
    if (changed) times.push(track.times[k] ?? 0);
  }
  return times;
}

/** Local matrices in scene space, at rest or at a time of a clip. */
class Locals {
  readonly #rest: Mat4[];
  readonly #restTrs: Trs[];

  constructor(scene: BuiltScene) {
    this.#rest = scene.nodes.map((node) => toSceneAxes(node.rest, scene.unitScale));
    this.#restTrs = this.#rest.map(decompose);
  }

  /** `path`'s locals multiplied top first, with the tracks' values at `time`, or at rest without a time. */
  place(path: readonly number[], tracks: ReadonlyMap<number, Track[]>, time: number | null): Mat4 {
    let world: Mat4 | null = null;
    for (const node of path) {
      const local = this.#local(node, tracks.get(node) ?? [], time);
      world = world ? multiply(world, local) : local;
    }
    return world ?? IDENTITY;
  }

  #local(node: number, own: readonly Track[], time: number | null): Mat4 {
    const rest = this.#restTrs[node];
    if (own.length === 0 || !rest) return this.#rest[node] ?? identity();
    const trs: Trs = { ...rest };
    if (time === null) return compose(trs);
    for (const track of own) {
      const value = valueAt(track, time);
      if (track.property === "translation") trs.translation = value as Vec3;
      if (track.property === "rotation") trs.rotation = value as Quat;
      if (track.property === "scale") trs.scale = value as Vec3;
    }
    return compose(trs);
  }
}

/** Where a path places its last node, or the inverse of that, and the largest translation of the placement. */
interface Placement {
  matrix: Mat4;
  reach: number;
}

function placement(matrix: Mat4): Placement {
  return { matrix, reach: Math.max(Math.abs(matrix[12] ?? 0), Math.abs(matrix[13] ?? 0), Math.abs(matrix[14] ?? 0)) };
}

/** A clip's tracks other than shape key weights, by node. */
function tracksByNode(clip: ParsedClip): Map<number, Track[]> {
  const byNode = new Map<number, Track[]>();
  for (const track of clip.tracks) {
    if (track.property === "weights") continue;
    const own = byNode.get(track.node);
    if (own) own.push(track);
    else byNode.set(track.node, [track]);
  }
  return byNode;
}

/**
 * Whether the clip changes where the mesh's path puts it relative to the armature's path, below their common node, by
 * more than float32 rounding in the armature's space. `changesOf` gives the times at which a track's value changes, and
 * `armatureAt` the inverse of where the armature's path places it at a time, or at rest without one. The mesh's
 * placement is worked out again only at the times its own tracks change.
 */
function movesApart(
  locals: Locals,
  byNode: ReadonlyMap<number, Track[]>,
  meshPath: number[],
  armaturePath: number[],
  changesOf: (track: Track) => number[],
  armatureAt: (time: number | null) => Placement,
): boolean {
  const meshTracks = meshPath.flatMap((node) => byNode.get(node) ?? []);
  const tracks = [...meshTracks, ...armaturePath.flatMap((node) => byNode.get(node) ?? [])];
  if (tracks.length === 0) return false;
  const relative = (armature: Placement, mesh: Placement) => ({
    matrix: multiply(armature.matrix, mesh.matrix),
    reach: Math.max(armature.reach, mesh.reach),
  });
  const rest = relative(armatureAt(null), placement(locals.place(meshPath, byNode, null)));
  const meshChanges = new Set(meshTracks.flatMap(changesOf));
  const times = [...new Set(tracks.flatMap(changesOf))].sort((a, b) => a - b);
  let mesh: Placement | null = null;
  return times.some((time) => {
    if (!mesh || meshChanges.has(time)) mesh = placement(locals.place(meshPath, byNode, time));
    const { matrix, reach } = relative(armatureAt(time), mesh);
    const translationTolerance = TOLERANCE + 8 * FLOAT32_ROUNDING * Math.max(reach, rest.reach);
    return matrix.some((value, element) => {
      const tolerance = element >= 12 && element < 15 ? translationTolerance : TOLERANCE;
      return Math.abs(value - (rest.matrix[element] ?? 0)) > tolerance;
    });
  });
}

/**
 * Warnings for skinned meshes that a clip moves relative to the armature object that deforms them. Blender deforms a
 * mesh in its armature's space and then places it with the mesh object's transform at that frame; the scene's skin
 * follows the joints alone, so it keeps the mesh where it sits relative to the armature at rest.
 */
export function skinMotionWarnings(scene: BuiltScene, clips: readonly ParsedClip[]): BlendWarning[] {
  const locals = new Locals(scene);
  const changes = new Map<Track, number[]>();
  const changesOf = (track: Track) => {
    let times = changes.get(track);
    if (!times) {
      times = changeTimes(track);
      changes.set(track, times);
    }
    return times;
  };
  const skinned = scene.meshes.flatMap((mesh, index) => {
    const skeleton = mesh.skin ? scene.skeletons[mesh.skin.skeleton] : undefined;
    const meshNode = scene.meshRecords[index]?.node;
    const armature = skeleton ? armatureNode(scene, skeleton.joints) : null;
    if (meshNode === undefined || armature === null) return [];
    const meshChain = lineage(scene, meshNode);
    const armatureChain = lineage(scene, armature);
    const common = meshChain.find((node) => armatureChain.includes(node)) ?? -1;
    const armaturePath = pathBelow(armatureChain, common);
    return [{ mesh, armature, meshPath: pathBelow(meshChain, common), armaturePath, key: armaturePath.join(" ") }];
  });
  const moving = skinned.map((): string[] => []);
  for (const clip of clips) {
    const byNode = tracksByNode(clip);
    const armaturePlacements = new Map<string, Map<number | null, Placement>>();
    skinned.forEach(({ meshPath, armaturePath, key }, index) => {
      let placed = armaturePlacements.get(key);
      if (!placed) {
        placed = new Map();
        armaturePlacements.set(key, placed);
      }
      const cache = placed;
      const armatureAt = (time: number | null) => {
        let found = cache.get(time);
        if (!found) {
          found = placement(invert(locals.place(armaturePath, byNode, time)));
          cache.set(time, found);
        }
        return found;
      };
      if (movesApart(locals, byNode, meshPath, armaturePath, changesOf, armatureAt)) moving[index]?.push(clip.name);
    });
  }
  return skinned.flatMap(({ mesh, armature }, index): BlendWarning[] => {
    const names = moving[index] ?? [];
    if (names.length === 0) return [];
    const armatureName = scene.nodes[armature]?.name ?? "";
    return [
      {
        code: "deform-approximated",
        subject: { kind: "node", name: mesh.name },
        message: `Motion relative to armature not followed: ${mesh.name}`,
        detail: `The preview keeps its rest offset from ${armatureName} in ${names.join(", ")}`,
      },
    ];
  });
}
