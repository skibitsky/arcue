import type { BlendStruct } from "../blend/file";
import type { Vec3 } from "../types";
import type { MeshData, ShapeKey } from "./mesh-data";

const OBJECT_SHAPE_LOCK = 1 << 0;

/** What a mesh's shape keys move its vertices by. */
export type ShapeSource = Pick<
  MeshData,
  "vertexCount" | "positions" | "shapeKeys" | "referenceKey" | "vertexGroupNames" | "deformWeights"
>;

/** A shape key that a mesh's morph target comes from, with its default weight and the range its weight keeps to. */
export interface ShapeTarget {
  name: string;
  defaultWeight: number;
  range: readonly [number, number];
}

/** The shape Blender shows alone on an object that pins its shape keys with Shape Key Lock. */
export interface PinnedShape {
  /** The pinned key, or null for the basis. */
  name: string | null;
  /** The keys whose morph targets at full weight add up to the pinned shape: the pinned key and those it builds on. */
  keys: ReadonlySet<string>;
  /** Why those morph targets only approach the pinned shape, or null where they make it exactly. */
  rough: string | null;
}

/** The mesh's vertex group a shape key's offsets are limited to, or -1 for none or one the mesh lacks. */
function keyGroup(mesh: ShapeSource, key: ShapeKey): number {
  return key.vertexGroup === "" ? -1 : mesh.vertexGroupNames.lastIndexOf(key.vertexGroup);
}

/** The key a shape key's offsets are measured from: its relative key, or the reference key for one out of range. */
function relativeIndex(mesh: ShapeSource, key: ShapeKey): number {
  return mesh.shapeKeys[key.relative] ? key.relative : mesh.referenceKey;
}

/** Whether a shape key gives the mesh a morph target: every key but the reference key and muted ones. */
function isTarget(mesh: ShapeSource, index: number): boolean {
  return index !== mesh.referenceKey && mesh.shapeKeys[index]?.muted === false;
}

/** A shape key that gives the mesh a morph target, the key its offsets run from, and the vertex group limiting them. */
interface TargetKey {
  key: ShapeKey;
  base: ShapeKey;
  group: number;
}

/** The shape keys that give the mesh morph targets, in order. */
function targetKeys(mesh: ShapeSource): TargetKey[] {
  return mesh.shapeKeys.flatMap((key, index) => {
    const base = mesh.shapeKeys[relativeIndex(mesh, key)];
    return isTarget(mesh, index) && base ? [{ key, base, group: keyGroup(mesh, key) }] : [];
  });
}

function shapeTarget({ key }: TargetKey): ShapeTarget {
  const range: [number, number] = key.max > key.min ? [key.min, key.max] : [0, 1];
  return { name: key.name, defaultWeight: Math.min(Math.max(key.value, range[0]), range[1]), range };
}

/** The shape keys that the mesh's morph targets come from, in order. */
export function shapeTargets(mesh: ShapeSource): ShapeTarget[] {
  return targetKeys(mesh).map(shapeTarget);
}

/** The shape keys that the mesh's morph targets come from, in order, each with every vertex's offset at full weight. */
export function shapeOffsets(mesh: ShapeSource): (ShapeTarget & { offsets: Float32Array })[] {
  return targetKeys(mesh).map((target) => {
    const offsets = new Float32Array(mesh.vertexCount * 3);
    for (let vertex = 0; vertex < mesh.vertexCount; vertex++) {
      const factor = groupFactor(mesh, target, vertex);
      for (let k = 0; k < 3; k++) offsets[vertex * 3 + k] = keyOffset(target, vertex * 3 + k) * factor;
    }
    return { ...shapeTarget(target), offsets };
  });
}

/** The index of the active shape key that an object pins with Shape Key Lock, or null without the lock. */
export function lockedShapeKey(object: BlendStruct): number | null {
  return (object.number("shapeflag") & OBJECT_SHAPE_LOCK) !== 0 ? object.number("shapenr") - 1 : null;
}

/**
 * The shape an object that pins the shape key at `locked` shows, or null without the lock. Blender's
 * `BKE_key_evaluate_object_ex` shows the pinned key's own positions, the reference key's for a muted pinned key, and the
 * first key's when the pinned one is missing. Morph targets hold each key's offsets from the key it is relative to, so
 * the pinned key's whole chain of relative keys at full weight makes its shape.
 */
export function pinnedShape(mesh: ShapeSource, locked: number | null): PinnedShape | null {
  if (locked === null || mesh.shapeKeys.length === 0) return null;
  let pinned = locked;
  if (mesh.shapeKeys[pinned]?.muted) pinned = mesh.referenceKey;
  if (!mesh.shapeKeys[pinned]) pinned = 0;
  const keys = new Set<string>();
  const chain = new Set<number>();
  let rough: string | null = null;
  let grouped = false;
  for (let at = pinned; at !== mesh.referenceKey; ) {
    const key = mesh.shapeKeys[at];
    if (!key) break;
    if (chain.has(at)) {
      rough = "the keys it builds on never reach the basis";
      break;
    }
    if (!isTarget(mesh, at)) {
      rough = "a key it builds on is muted";
      break;
    }
    chain.add(at);
    keys.add(key.name);
    grouped ||= keyGroup(mesh, key) >= 0;
    at = relativeIndex(mesh, key);
  }
  if (rough === null && grouped && chain.size > 1) rough = "vertex groups limit the keys it builds on";
  const name = pinned === mesh.referenceKey ? null : (mesh.shapeKeys[pinned]?.name ?? null);
  return { name, keys, rough };
}

/**
 * Each target's weight by name as an object shows it at the scene's start frame: 1 for the keys a pinned shape needs
 * and 0 for the rest, or else each key's value that its animation plays there, kept to its range.
 */
export function shapeWeights(
  targets: readonly ShapeTarget[],
  played: ReadonlyMap<string, number>,
  pinned: PinnedShape | null,
): Map<string, number> {
  return new Map(
    targets.map(({ name, defaultWeight, range: [min, max] }) => {
      if (pinned) return [name, pinned.keys.has(name) ? 1 : 0];
      const weight = played.get(name);
      return [name, weight === undefined ? defaultWeight : Math.min(Math.max(weight, min), max)];
    }),
  );
}

/**
 * A vertex's local position with each shape key at its weight, as the morph targets add the keys' offsets to the
 * reference shape: each offset runs from the key it is relative to, limited by the key's vertex group.
 */
export function shapedVertex(mesh: ShapeSource, vertex: number, weights: ReadonlyMap<string, number>): Vec3 {
  const at = vertex * 3;
  let [x, y, z] = [mesh.positions[at] ?? 0, mesh.positions[at + 1] ?? 0, mesh.positions[at + 2] ?? 0];
  for (const target of targetKeys(mesh)) {
    const weight = weights.get(target.key.name) ?? 0;
    if (weight === 0) continue;
    const factor = groupFactor(mesh, target, vertex) * weight;
    x += keyOffset(target, at) * factor;
    y += keyOffset(target, at + 1) * factor;
    z += keyOffset(target, at + 2) * factor;
  }
  return [x, y, z];
}

/** A key's full offset in one coordinate from the key it is relative to. */
function keyOffset({ key, base }: TargetKey, coordinate: number): number {
  return (key.positions[coordinate] ?? 0) - (base.positions[coordinate] ?? 0);
}

/** How much of a key's offset a vertex takes: its weight in the key's vertex group, all of it without one. */
function groupFactor(mesh: ShapeSource, { group }: TargetKey, vertex: number): number {
  return group < 0 ? 1 : groupWeight(mesh, group, vertex);
}

/** A vertex's weight in a vertex group: the last the vertex lists for the group, or 0. */
function groupWeight(mesh: ShapeSource, group: number, vertex: number): number {
  const weights = mesh.deformWeights;
  let found = 0;
  if (!weights) return found;
  for (let i = weights.offsets[vertex] ?? 0; i < (weights.offsets[vertex + 1] ?? 0); i++) {
    if (weights.groups[i] === group) found = weights.weights[i] ?? 0;
  }
  return found;
}
