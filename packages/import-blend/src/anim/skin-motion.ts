import type { Quat, Track, Vec3 } from "@arcue/scene";
import type { Mat4, Trs } from "../math";
import { compose, decompose, identity, invert, multiply, toSceneAxes } from "../math";
import type { BlendWarning, BuiltScene } from "../scene/build";
import type { ParsedClip } from "./clips";

const TOLERANCE = 1e-4;
/** Float32 rounding relative to a value's size, which far from the origin exceeds `TOLERANCE`. */
const FLOAT32_ROUNDING = 2 ** -23;
const TRANSLATION_ELEMENTS = [12, 13, 14];

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
  return Array.from(track.values.subarray(key * width, key * width + width));
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
    return path.reduce((world, node) => multiply(world, this.#local(node, tracks.get(node) ?? [], time)), identity());
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

/** Whether the clip changes where the mesh's path puts it relative to the armature's path, below their common node. */
function movesApart(locals: Locals, clip: ParsedClip, meshPath: number[], armaturePath: number[]): boolean {
  const tracks = clip.tracks.filter(
    (track) => track.property !== "weights" && (meshPath.includes(track.node) || armaturePath.includes(track.node)),
  );
  if (tracks.length === 0) return false;
  const byNode = new Map<number, Track[]>();
  for (const track of tracks) byNode.set(track.node, [...(byNode.get(track.node) ?? []), track]);
  const relative = (time: number | null) => {
    const armature = locals.place(armaturePath, byNode, time);
    const mesh = locals.place(meshPath, byNode, time);
    const reach = Math.max(
      ...TRANSLATION_ELEMENTS.flatMap((element) => [armature[element] ?? 0, mesh[element] ?? 0].map(Math.abs)),
    );
    return { matrix: multiply(invert(armature), mesh), reach };
  };
  const rest = relative(null);
  const times = new Set(tracks.flatMap((track) => Array.from(track.times)));
  return [...times].some((time) => {
    const { matrix, reach } = relative(time);
    const translationTolerance = TOLERANCE + 8 * FLOAT32_ROUNDING * Math.max(reach, rest.reach);
    return matrix.some((value, element) => {
      const tolerance = TRANSLATION_ELEMENTS.includes(element) ? translationTolerance : TOLERANCE;
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
  const warnings: BlendWarning[] = [];
  scene.meshes.forEach((mesh, index) => {
    const skeleton = mesh.skeleton === null ? undefined : scene.skeletons[mesh.skeleton];
    const meshNode = scene.meshRecords[index]?.node;
    const armature = skeleton ? armatureNode(scene, skeleton.joints) : null;
    if (meshNode === undefined || armature === null) return;
    const meshChain = lineage(scene, meshNode);
    const armatureChain = lineage(scene, armature);
    const common = meshChain.find((node) => armatureChain.includes(node)) ?? -1;
    const meshPath = pathBelow(meshChain, common);
    const armaturePath = pathBelow(armatureChain, common);
    const moving = clips.filter((clip) => movesApart(locals, clip, meshPath, armaturePath));
    if (moving.length === 0) return;
    const armatureName = scene.nodes[armature]?.name ?? "";
    warnings.push({
      code: "deform-approximated",
      subject: { kind: "node", name: mesh.name },
      message: `Motion relative to armature not followed: ${mesh.name}`,
      detail: `The preview keeps its rest offset from ${armatureName} in ${moving.map((clip) => clip.name).join(", ")}`,
    });
  });
  return warnings;
}
