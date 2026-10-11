import type { Interpolation, Track } from "@arcue/scene";
import type { BlendStruct } from "../blend/file";
import type { Mat4, Trs } from "../math";
import { decompose, identity, invert, multiply, multiplyAll, SHEAR_TOLERANCE, shearOf, toSceneAxes } from "../math";
import type { Bone } from "../scene/armature";
import { BoneFlag, inheritsFully, poseMatrices } from "../scene/armature";
import type { ArmatureRecord, BlendWarning, BuiltScene, MeshRecord, ObjectRecord } from "../scene/build";
import { ObjectType } from "../scene/objects";
import type { TransformValues } from "../scene/transforms";
import {
  channelMatrix,
  cloneValues,
  isTransformProperty,
  objectBasis,
  restChannel,
  setTransformProperty,
} from "../scene/transforms";
import type { Action, ActionSlot } from "./actions";
import { actionRange, animationUses, IdCode, parsePosePath, parseShapeKeyPath, slotFor } from "./actions";
import type { FCurve } from "./fcurve";
import { canJump, canJumpAfter, curveEvaluator, jumpFrames, keyFrames } from "./fcurve";
import { inRestPosition } from "./rest-position";

export interface ParsedClip {
  name: string;
  duration: number;
  /** Key times of each animated curve in seconds from the clip start. */
  curveTimes: Float32Array[];
  tracks: Track[];
}

/** What one slot of an action animates. */
type Target = { kind: "object"; record: ObjectRecord } | { kind: "shapeKeys"; meshes: MeshRecord[] };

const SNAP_FRAMES = 1e-3;
/** The most whole frames a clip spans, and the most it samples with the frames between them where a curve jumps. */
const MAX_FRAMES = 100_000;
/** How long before or after a jump, in frames, a track still holds the value on the other side of it. */
const HOLD_FRAMES = 1e-3;
/** Scales are sampled at least this far from zero, so a flattened transform keeps its rotation. */
const MIN_SCALE = 1e-6;
/** A value jumps at the end of a segment when its change over the last `HOLD_FRAMES` is this share of the rest. */
const JUMP_SHARE = 0.05;
const JUMP_MINIMUM = 1e-6;
const HOLD_TOLERANCE = 1e-9;
const TRANSFORM_PROPERTIES = ["translation", "rotation", "scale"] as const;

function shapeKeyOwner(mesh: MeshRecord): BlendStruct | null {
  return mesh.object.data?.deref("key") ?? null;
}

function relevantObjectCurve(curve: FCurve, record: ObjectRecord): boolean {
  if (curve.muted) return false;
  if (isTransformProperty(curve.path, true)) return true;
  const pose = parsePosePath(curve.path);
  return pose !== null && record.armature !== null && isTransformProperty(pose.property, false);
}

function keysRotationMode(curve: FCurve): boolean {
  return !curve.muted && (curve.path === "rotation_mode" || parsePosePath(curve.path)?.property === "rotation_mode");
}

function relevantKeyCurve(curve: FCurve): boolean {
  return !curve.muted && parseShapeKeyPath(curve.path) !== null;
}

/** Which bones of an armature an action slot's pose curves name. */
function matchingBones(slot: ActionSlot, record: ObjectRecord): number {
  const names = new Set(record.armature?.bones.map((bone) => bone.name) ?? []);
  let count = 0;
  for (const curve of slot.curves) {
    const pose = parsePosePath(curve.path);
    if (pose && names.has(pose.bone)) count++;
  }
  return count;
}

interface ShapeKeys {
  mesh: MeshRecord;
  key: BlendStruct;
}

/** What a slot of an action nothing uses animates, and whether the slot's name named it. */
interface Guess {
  targets: Target[];
  named: boolean;
}

/**
 * What a slot of an action nothing uses animates: the shape keys or the object its name names, or failing that, the
 * meshes with the shape keys its curves name or the armatures with the most bones they name. Shape keys the name
 * names count only when they have a key its curves name.
 */
function guessedTargets(slot: ActionSlot, scene: BuiltScene, shapeKeys: readonly ShapeKeys[]): Guess {
  const prefix = slot.identifier.slice(0, 2);
  const name = slot.identifier.slice(2);
  const keyCurves = slot.curves.some(relevantKeyCurve);
  const forKeys =
    slot.idType === IdCode.shapeKey ||
    prefix === "KE" ||
    (slot.idType === 0 && prefix === "" && keyCurves && !slot.curves.some((curve) => parsePosePath(curve.path)));
  if (forKeys) {
    const names = new Set(slot.curves.flatMap((curve) => parseShapeKeyPath(curve.path) ?? []));
    const keyed = shapeKeys.filter(({ mesh }) => mesh.morphKeys.some((morph) => names.has(morph)));
    const named = name === "" ? [] : keyed.filter(({ key }) => key.struct("id")?.string("name").slice(2) === name);
    const matched = named.length > 0 ? named : keyed;
    const targets: Target[] =
      matched.length > 0 ? [{ kind: "shapeKeys", meshes: matched.map(({ mesh }) => mesh) }] : [];
    return { targets, named: named.length > 0 };
  }
  if (slot.idType !== 0 && slot.idType !== IdCode.object) return { targets: [], named: false };
  const named = name === "" ? undefined : scene.objects.find((record) => record.object.name === name);
  if (named) return { targets: [{ kind: "object", record: named }], named: true };
  const armatures = scene.objects.filter((record) => record.object.type === ObjectType.armature && record.armature);
  const scored = armatures.map((record) => ({ record, score: matchingBones(slot, record) }));
  const best = Math.max(0, ...scored.map((entry) => entry.score));
  const targets = scored.flatMap((entry) =>
    best > 0 && entry.score === best ? [{ kind: "object" as const, record: entry.record }] : [],
  );
  return { targets, named: false };
}

/** A slot of an action and what it animates. */
interface Assignment {
  slot: ActionSlot;
  target: Target;
}

/**
 * What each slot of each action animates: the objects and shape keys whose animation data plays it, each with every
 * slot it plays. Where Blender plays the action through a slot, only the uses it plays count; an action it plays
 * through none, such as one on muted tracks only, counts with every use. For an action that no animation data uses
 * through a slot, what `guessedTargets` finds, one slot to an object or mesh: a slot named after it before one that
 * only names its bones or keys. An object or mesh that uses the action without a slot stays still.
 */
function assignTargets(actions: readonly Action[], scene: BuiltScene): Map<Action, Assignment[]> {
  const result = new Map<Action, Assignment[]>();
  const shapeKeys = scene.meshRecords.flatMap((mesh): ShapeKeys[] => {
    const key = shapeKeyOwner(mesh);
    return key ? [{ mesh, key }] : [];
  });
  const uses: { action: number; slot: number; played: boolean; target: Target }[] = [];
  for (const record of scene.objects) {
    for (const use of animationUses(record.object.struct).uses)
      uses.push({ ...use, target: { kind: "object", record } });
  }
  for (const { mesh, key } of shapeKeys) {
    for (const use of animationUses(key).uses) uses.push({ ...use, target: { kind: "shapeKeys", meshes: [mesh] } });
  }

  for (const action of actions) {
    const assigned: Assignment[] = [];
    const claimed = new Set<ObjectRecord | MeshRecord>();
    const claim = (target: Target): Target | null => {
      if (target.kind === "object") {
        if (claimed.has(target.record)) return null;
        claimed.add(target.record);
        return target;
      }
      const meshes = target.meshes.filter((mesh) => !claimed.has(mesh));
      for (const mesh of meshes) claimed.add(mesh);
      return meshes.length > 0 ? { kind: "shapeKeys", meshes } : null;
    };
    const own = uses.flatMap((use) =>
      use.action === action.struct.offset ? [{ ...use, slot: slotFor(action, use.slot) }] : [],
    );
    const plays = own.some((use) => use.played && use.slot);
    for (const { slot, played, target } of own) {
      if (plays && !played) continue;
      if (slot) assigned.push({ slot, target });
      else claim(target);
    }
    if (assigned.length === 0) {
      const guesses = action.slots.map((slot) => ({ slot, ...guessedTargets(slot, scene, shapeKeys) }));
      for (const named of [true, false]) {
        for (const guess of guesses) {
          if (guess.named !== named) continue;
          for (const target of guess.targets) {
            const free = claim(target);
            if (free) assigned.push({ slot: guess.slot, target: free });
          }
        }
      }
    }
    if (assigned.length > 0) result.set(action, assigned);
  }
  return result;
}

function snapTime(seconds: number, fps: number): number {
  const frames = seconds * fps;
  const whole = Math.round(frames);
  return Math.abs(frames - whole) < SNAP_FRAMES ? whole / fps : seconds;
}

/** Whether the `at`th translation, rotation and scale in arrays of them match `b`, as `sameTrs` decides. */
function sameTrsAt(
  translation: ArrayLike<number>,
  rotation: ArrayLike<number>,
  scale: ArrayLike<number>,
  at: number,
  b: Trs,
): boolean {
  for (let c = 0; c < 3; c++) {
    if (!(Math.abs((translation[at * 3 + c] ?? 0) - (b.translation[c] ?? 0)) <= 1e-6)) return false;
    if (!(Math.abs((scale[at * 3 + c] ?? 0) - (b.scale[c] ?? 0)) <= 1e-6)) return false;
  }
  const r = at * 4;
  const dot = Math.abs(
    (rotation[r] ?? 0) * b.rotation[0] +
      (rotation[r + 1] ?? 0) * b.rotation[1] +
      (rotation[r + 2] ?? 0) * b.rotation[2] +
      (rotation[r + 3] ?? 0) * b.rotation[3],
  );
  return dot > 1 - 1e-9;
}

/** Whether two transforms match: translations and scales within 1e-6, and rotations within a dot of 1e-9. */
function sameTrs(a: Trs, b: Trs): boolean {
  return sameTrsAt(a.translation, a.rotation, a.scale, 0, b);
}

function track(
  node: number,
  property: Track["property"],
  interpolation: Interpolation,
  times: Float32Array,
  values: ArrayLike<number>,
  components: number,
): Track | null {
  const count = times.length;
  if (count === 0) return null;
  const stored = Float32Array.from(values);
  let constant = true;
  for (let i = 1; i < count && constant; i++) {
    for (let c = 0; c < components; c++) {
      if (stored[i * components + c] !== stored[c]) {
        constant = false;
        break;
      }
    }
  }
  if (constant) {
    return { node, property, interpolation: "linear", times: Float32Array.of(0), values: stored.slice(0, components) };
  }
  return { node, property, interpolation, times, values: stored };
}

/** A value of `components` numbers at `at` in an array of such values. */
interface At {
  values: Float64Array;
  at: number;
}

function near(a: At, b: At, components: number): boolean {
  for (let c = 0; c < components; c++) {
    if (!(Math.abs((a.values[a.at + c] ?? 0) - (b.values[b.at + c] ?? 0)) <= HOLD_TOLERANCE)) return false;
  }
  return true;
}

/**
 * Whether a value jumps between `probe` and `after`, a sample a moment away, given `before` on the other side of the
 * probe: by more than `JUMP_SHARE` of its change over the rest of the segment.
 */
function jumps(before: At, probe: At, after: At, components: number): boolean {
  for (let c = 0; c < components; c++) {
    const at = probe.values[probe.at + c] ?? 0;
    const last = Math.abs((after.values[after.at + c] ?? 0) - at);
    if (last > JUMP_MINIMUM && last > JUMP_SHARE * Math.abs(at - (before.values[before.at + c] ?? 0))) return true;
  }
  return false;
}

/** Negates the quaternion at `q` when its negation is nearer the one at `reference`. */
function align(q: At, reference: At): void {
  let dot = 0;
  for (let c = 0; c < 4; c++) dot += (q.values[q.at + c] ?? 0) * (reference.values[reference.at + c] ?? 0);
  if (dot < 0) for (let c = 0; c < 4; c++) q.values[q.at + c] = -(q.values[q.at + c] ?? 0);
}

/**
 * Times a moment inside each segment between two samples, where a value can jump: `lead` just after its first sample
 * and `hold` just before its last. Null where nothing can jump that way or the samples leave no room.
 */
interface EdgeTimes {
  lead: number | null;
  hold: number | null;
}

/**
 * What a node's property or a mesh's weights are at each sample time, one value of `components` numbers after another,
 * and at the edge times of each segment between samples: `after` at its lead and `before` at its hold, where it has
 * them.
 */
interface Series {
  components: number;
  frames: Float64Array;
  after: Float64Array;
  before: Float64Array;
}

/**
 * A track from values sampled at `times`, with what they are at the `edges` of each segment between them. A track
 * whose every segment holds its first value until its end steps; any other keeps the values on either side of each
 * jump.
 */
function sampledTrack(
  node: number,
  property: Track["property"],
  times: Float32Array,
  edges: readonly EdgeTimes[],
  { components, frames, after, before }: Series,
): Track | null {
  if (components === 0) return null;
  const count = times.length;
  const frame = (k: number): At => ({ values: frames, at: k * components });
  const leading = (k: number): At => ({ values: after, at: k * components });
  const holding = (k: number): At => ({ values: before, at: k * components });
  if (property === "rotation") {
    for (let k = 1; k < count; k++) align(frame(k), frame(k - 1));
    edges.forEach((edge, k) => {
      if (edge.lead !== null) align(leading(k), frame(k));
      if (edge.hold !== null) align(holding(k), frame(k));
    });
  }
  const steps =
    edges.length > 0 &&
    edges.every(
      (edge, k) =>
        edge.hold !== null &&
        near(holding(k), frame(k), components) &&
        (edge.lead === null || near(leading(k), frame(k), components)),
    );
  if (steps) return track(node, property, "step", times, frames, components);
  const most = count + 2 * edges.length;
  const keyTimes = new Float32Array(most);
  const values = new Float64Array(most * components);
  let keys = 0;
  const key = (time: number, value: At) => {
    keyTimes[keys] = time;
    values.set(value.values.subarray(value.at, value.at + components), keys * components);
    keys++;
  };
  for (let k = 0; k < count; k++) {
    key(times[k] ?? 0, frame(k));
    const edge = edges[k];
    if (!edge || k + 1 >= count) continue;
    let from = frame(k);
    if (edge.lead !== null && jumps(frame(k + 1), leading(k), frame(k), components)) {
      key(edge.lead, leading(k));
      from = leading(k);
    }
    if (edge.hold !== null && jumps(from, holding(k), frame(k + 1), components)) key(edge.hold, holding(k));
  }
  return track(node, property, "linear", keyTimes.slice(0, keys), values.subarray(0, keys * components), components);
}

function keepScale(values: number[]): void {
  values.forEach((value, index) => {
    if (Math.abs(value) < MIN_SCALE) values[index] = value < 0 ? -MIN_SCALE : MIN_SCALE;
  });
}

/**
 * A bone's matrix relative to its parent bone's pose: its channel after its rest offset, or, for a bone that does not
 * inherit fully, from the armature's poses.
 */
function boneLocal(bones: readonly Bone[], index: number, channel: TransformValues | undefined, poses: Mat4[] | null) {
  const bone = bones[index];
  if (!bone) return identity();
  if (poses && !inheritsFully(bone)) {
    const pose = poses[index] ?? bone.rest;
    const parentPose = poses[bone.parent];
    return parentPose ? multiply(invert(parentPose), pose) : pose;
  }
  return channel ? multiply(bone.offset, channelMatrix(channel, (bone.flag & BoneFlag.connected) !== 0)) : bone.offset;
}

/** An armature's saved pose: the channels actions start from, and the bones it moves from rest. */
interface SavedPose {
  channels: TransformValues[];
  moved: Map<number, Trs>;
  /** Bones whose saved pose shears them under their parents' scale. */
  sheared: Map<number, string>;
}

/**
 * The pose an armature's actions start from: the pose Blender shows when it opens the file, or, for an armature set to
 * its rest position, the rest pose in each channel's rotation mode.
 */
function savedPose(armature: ArmatureRecord, atRest: boolean, restTrs: readonly Trs[], unitScale: number): SavedPose {
  const channels = armature.pose.map((values) => {
    const copy = atRest ? { ...restChannel(), rotationMode: values.rotationMode } : cloneValues(values);
    keepScale(copy.scale);
    return copy;
  });
  const poses = armature.bones.some((bone) => !inheritsFully(bone)) ? poseMatrices(armature.bones, channels) : null;
  const moved = new Map<number, Trs>();
  const sheared = new Map<number, string>();
  armature.bones.forEach((bone, index) => {
    const node = armature.nodes[index];
    const rest = node === undefined ? undefined : restTrs[node];
    if (node === undefined || !rest) return;
    const local = boneLocal(armature.bones, index, channels[index], poses);
    const trs = decompose(toSceneAxes(local, unitScale));
    if (sameTrs(trs, rest)) return;
    moved.set(node, trs);
    if (poses && !inheritsFully(bone) && shearOf(local) > SHEAR_TOLERANCE) sheared.set(node, bone.name);
  });
  return { channels, moved, sheared };
}

/**
 * Every whole frame of the range from its start, its end, and the frames between where a curve may jump. `late` when
 * a curve may jump too soon after one of those frames to sample on its own. Only the whole frames and the end, with
 * `dropped`, when the frames between would take the clip past `MAX_FRAMES`.
 */
function sampleFrames(
  start: number,
  end: number,
  whole: number,
  curves: readonly FCurve[],
): { frames: number[]; late: boolean; dropped: boolean } {
  const frames: number[] = [];
  for (let k = 0; k <= whole; k++) frames.push(start + k);
  if (end - start - whole > 1e-6) frames.push(end);
  const between = new Set<number>();
  let late = false;
  for (const curve of curves) {
    const jumps = jumpFrames(curve, start, end, MAX_FRAMES);
    if (jumps === null) return { frames, late: false, dropped: true };
    for (const frame of jumps) {
      const offset = frame - start;
      const fraction = offset - Math.round(offset);
      if (Math.abs(fraction) >= SNAP_FRAMES && Math.abs(end - frame) >= SNAP_FRAMES) between.add(frame);
      else if (fraction > 0 && fraction < SNAP_FRAMES) late = true;
    }
    if (whole + between.size > MAX_FRAMES) return { frames, late: false, dropped: true };
  }
  if (between.size === 0) return { frames, late, dropped: false };
  const all = [...frames, ...between].sort((a, b) => a - b);
  const kept = all.filter((frame, index) => index === 0 || frame - (all[index - 1] ?? 0) >= SNAP_FRAMES);
  return { frames: kept, late: late || kept.length < all.length, dropped: false };
}

/**
 * For each segment between two samples, a time just after its first sample when a value can jump right after a
 * frame, and a time just before its last when one can jump at a frame; null where the samples are too close.
 */
function edgeTimes(times: Float32Array, fps: number, leads: boolean, holds: boolean): EdgeTimes[] {
  const gap = (time: number) => Math.max(HOLD_FRAMES / fps, 1e-5, Math.abs(time) * 2 ** -20);
  const edges: EdgeTimes[] = [];
  if (!leads && !holds) return edges;
  for (let k = 0; k + 1 < times.length; k++) {
    const from = times[k] ?? 0;
    const to = times[k + 1] ?? 0;
    const holdTime = Math.fround(to - gap(to));
    const hold = holds && holdTime > from ? holdTime : null;
    const leadTime = Math.fround(from + gap(from));
    const lead = leads && leadTime < (hold ?? to) ? leadTime : null;
    edges.push({ lead, hold });
  }
  return edges;
}

/** A curve the clip plays and the place of its value among those the clip evaluates at each time. */
interface PlayedCurve {
  curve: FCurve;
  slot: number;
}

interface Binding {
  record: ObjectRecord;
  objectCurves: PlayedCurve[];
  boneCurves: Map<number, (PlayedCurve & { property: string })[]>;
  /** Bones sampled at every frame: those the action keys and those whose transform depends on their parents'. */
  sampled: number[];
  needsPoses: boolean;
}

interface ClipScene {
  scene: BuiltScene;
  restTrs: readonly Trs[];
  saved: ReadonlyMap<ObjectRecord, SavedPose>;
  warnings: BlendWarning[];
}

interface KeyTarget {
  mesh: MeshRecord;
  curves: FCurve[];
}

function bind(record: ObjectRecord, curves: readonly FCurve[], slots: ReadonlyMap<FCurve, number>): Binding {
  const boneIndex = new Map(record.armature?.bones.map((bone, index) => [bone.name, index]) ?? []);
  const boneCurves = new Map<number, (PlayedCurve & { property: string })[]>();
  const objectCurves: PlayedCurve[] = [];
  for (const curve of curves) {
    const slot = slots.get(curve) ?? -1;
    const pose = parsePosePath(curve.path);
    if (!pose) {
      objectCurves.push({ curve, slot });
      continue;
    }
    const index = boneIndex.get(pose.bone);
    if (index === undefined) continue;
    boneCurves.set(index, [...(boneCurves.get(index) ?? []), { curve, slot, property: pose.property }]);
  }
  const bones = record.armature?.bones ?? [];
  const sampled = bones.flatMap((bone, index) => (boneCurves.has(index) || !inheritsFully(bone) ? [index] : []));
  const needsPoses = sampled.some((index) => {
    const bone = bones[index];
    return bone !== undefined && !inheritsFully(bone);
  });
  return { record, objectCurves, boneCurves, sampled, needsPoses };
}

const TRS_SIZE = 10;

/**
 * Where a sample keeps what it holds, one number after another: the translation, rotation and scale of each node the
 * clip moves, then the morph weights of each mesh.
 */
interface Layout {
  nodes: { node: number; offset: number }[];
  meshes: { mesh: MeshRecord; offset: number; components: number }[];
  size: number;
}

/** Samples the nodes and morph weights an action moves from its curves' values at a time. */
interface Sampler {
  layout: Layout;
  /** Writes the sample for the curves' `values` into `row`, and adds the bones that shear to `sheared`. */
  sample(values: Float64Array, row: Float64Array, sheared: Set<string>): void;
}

/** A copy of transform values that each sample changes, after `reset` copies the values' arrays into it again. */
function scratchValues<Values extends TransformValues>(values: Values): { copy: Values; reset(): void } {
  const copy = cloneValues(values);
  const arrays = Object.entries(values).flatMap(([key, from]) => {
    const to = (copy as unknown as Record<string, unknown>)[key];
    return Array.isArray(from) && Array.isArray(to) ? [{ from: from as number[], to: to as number[] }] : [];
  });
  const reset = () => {
    for (const { from, to } of arrays) for (let i = 0; i < from.length; i++) to[i] = from[i] ?? 0;
  };
  return { copy, reset };
}

function writeTrs(row: Float64Array, offset: number, trs: Trs): void {
  row.set(trs.translation, offset);
  row.set(trs.rotation, offset + 3);
  row.set(trs.scale, offset + 7);
}

function sampler(
  bindings: readonly Binding[],
  keyTargets: readonly KeyTarget[],
  clipScene: ClipScene,
  slots: ReadonlyMap<FCurve, number>,
): Sampler {
  const { scene, saved } = clipScene;
  const layout: Layout = { nodes: [], meshes: [], size: 0 };
  const place = (node: number) => {
    layout.nodes.push({ node, offset: layout.size });
    layout.size += TRS_SIZE;
    return layout.size - TRS_SIZE;
  };
  const objects = bindings.map((binding) => {
    const { record, objectCurves, boneCurves, sampled } = binding;
    const own = objectCurves.length > 0 ? { offset: place(record.node), scratch: scratchValues(record.values) } : null;
    const armature = record.armature;
    const pose = saved.get(record);
    if (!armature || !pose || boneCurves.size === 0) return { binding, own, posed: null };
    const channels = [...pose.channels];
    const keyed = [...boneCurves].map(([index, list]) => {
      const scratch = scratchValues(pose.channels[index] ?? restChannel());
      channels[index] = scratch.copy;
      return { scratch, list };
    });
    const bones = sampled.flatMap((index) => {
      const bone = armature.bones[index];
      const node = armature.nodes[index];
      return bone && node !== undefined ? [{ index, bone, offset: place(node) }] : [];
    });
    return { binding, own, posed: { armature, channels, keyed, bones } };
  });
  const meshes = keyTargets.map(({ mesh, curves }) => {
    const offset = layout.size;
    const components = mesh.morphDefaults.length;
    layout.meshes.push({ mesh, offset, components });
    layout.size += components;
    const keyed = curves.map((curve) => {
      const index = mesh.morphKeys.indexOf(parseShapeKeyPath(curve.path) ?? "");
      return { index, range: mesh.morphRanges[index] ?? [0, 1], slot: slots.get(curve) ?? -1 };
    });
    return { mesh, offset, keyed };
  });
  const sample = (values: Float64Array, row: Float64Array, sheared: Set<string>) => {
    for (const { binding, own, posed } of objects) {
      const { record, objectCurves, needsPoses } = binding;
      if (own) {
        own.scratch.reset();
        const transform = own.scratch.copy;
        for (const { curve, slot } of objectCurves) {
          setTransformProperty(transform, curve.path, curve.index, values[slot] ?? 0);
        }
        keepScale(transform.scale);
        keepScale(transform.deltaScale);
        const local = multiplyAll(record.parentPart, record.parentInverse, objectBasis(transform));
        writeTrs(row, own.offset, decompose(toSceneAxes(local, scene.unitScale)));
      }
      if (!posed) continue;
      const { armature, channels, keyed, bones } = posed;
      for (const { scratch, list } of keyed) {
        scratch.reset();
        for (const { curve, property, slot } of list) {
          setTransformProperty(scratch.copy, property, curve.index, values[slot] ?? 0);
        }
        keepScale(scratch.copy.scale);
      }
      const poses = needsPoses ? poseMatrices(armature.bones, channels) : null;
      for (const { index, bone, offset } of bones) {
        const local = boneLocal(armature.bones, index, channels[index], poses);
        if (poses && !inheritsFully(bone) && shearOf(local) > SHEAR_TOLERANCE) sheared.add(bone.name);
        writeTrs(row, offset, decompose(toSceneAxes(local, scene.unitScale)));
      }
    }
    for (const { mesh, offset, keyed } of meshes) {
      row.set(mesh.morphDefaults, offset);
      for (const { index, range, slot } of keyed) {
        if (index >= 0) row[offset + index] = Math.min(Math.max(values[slot] ?? 0, range[0]), range[1]);
      }
    }
  };
  return { layout, sample };
}

/** A sample just inside a segment: its own, the same as the sample at the segment's first frame, or none. */
type EdgeSample = Float64Array | "first" | null;

/** A clip's samples: a row at each of `count` frames, laid out by `layout`, and those at each segment's edge times. */
interface Samples {
  layout: Layout;
  count: number;
  frames: Float64Array;
  after: EdgeSample[];
  before: EdgeSample[];
}

/** The series of the `components` numbers at `offset` in each sample. */
function seriesOf({ layout, count, frames, after, before }: Samples, offset: number, components: number): Series {
  const values = new Float64Array(count * components);
  for (let k = 0; k < count; k++) {
    for (let c = 0; c < components; c++) values[k * components + c] = frames[k * layout.size + offset + c] ?? 0;
  }
  const edgeValues = (edgeSamples: readonly EdgeSample[]) => {
    const result = new Float64Array(edgeSamples.length * components);
    edgeSamples.forEach((edgeSample, k) => {
      if (edgeSample === null) return;
      const source = edgeSample === "first" ? frames : edgeSample;
      const at = edgeSample === "first" ? k * layout.size + offset : offset;
      for (let c = 0; c < components; c++) result[k * components + c] = source[at + c] ?? 0;
    });
    return result;
  };
  return { components, frames: values, after: edgeValues(after), before: edgeValues(before) };
}

/** Whether every sample of a node, at each frame and edge time, is its rest transform. */
function resting(
  translation: Series,
  rotation: Series,
  scale: Series,
  edges: readonly EdgeTimes[],
  rest: Trs,
): boolean {
  const count = translation.frames.length / 3;
  for (let k = 0; k < count; k++) {
    if (!sameTrsAt(translation.frames, rotation.frames, scale.frames, k, rest)) return false;
  }
  return edges.every(
    (edge, k) =>
      (edge.lead === null || sameTrsAt(translation.after, rotation.after, scale.after, k, rest)) &&
      (edge.hold === null || sameTrsAt(translation.before, rotation.before, scale.before, k, rest)),
  );
}

/**
 * The tracks of the sampled nodes that move from rest and of the sampled morph weights, then one-key tracks for the
 * bones that the saved pose of an armature the clip animates moves and that the clip does not sample.
 */
function clipTracks(
  samples: Samples,
  edges: readonly EdgeTimes[],
  times: Float32Array,
  clipScene: ClipScene,
  armatures: readonly ObjectRecord[],
  sheared: Set<string>,
): Track[] {
  const { restTrs, saved } = clipScene;
  const tracks: Track[] = [];
  const sampledNodes = new Set<number>();
  for (const { node, offset } of samples.layout.nodes) {
    sampledNodes.add(node);
    const translation = seriesOf(samples, offset, 3);
    const rotation = seriesOf(samples, offset + 3, 4);
    const scale = seriesOf(samples, offset + 7, 3);
    const rest = restTrs[node];
    if (rest && resting(translation, rotation, scale, edges, rest)) continue;
    for (const [property, series] of [
      ["translation", translation],
      ["rotation", rotation],
      ["scale", scale],
    ] as const) {
      const created = sampledTrack(node, property, times, edges, series);
      if (created) tracks.push(created);
    }
  }
  for (const record of armatures) {
    const pose = saved.get(record);
    for (const [node, trs] of pose?.moved ?? []) {
      if (sampledNodes.has(node)) continue;
      const name = pose?.sheared.get(node);
      if (name !== undefined) sheared.add(name);
      for (const property of TRANSFORM_PROPERTIES) {
        const created = track(node, property, "linear", Float32Array.of(0), [...trs[property]], trs[property].length);
        if (created) tracks.push({ ...created, held: true });
      }
    }
  }
  for (const { mesh, offset, components } of samples.layout.meshes) {
    const created = sampledTrack(mesh.node, "weights", times, edges, seriesOf(samples, offset, components));
    if (created) tracks.push(created);
  }
  return tracks.sort((a, b) => a.node - b.node);
}

/**
 * The curves each object and mesh plays, from every slot that reaches it. Where two slots key one value, the one its
 * animation data lists first wins, so the slot Blender plays over the NLA wins over an NLA strip's, and an upper
 * track's strip over a lower one's.
 */
function playedCurves<Owner>(entries: readonly { owner: Owner; curves: readonly FCurve[] }[]): Map<Owner, FCurve[]> {
  const byValue = new Map<Owner, Map<string, FCurve>>();
  for (const { owner, curves } of entries) {
    const own = byValue.get(owner) ?? new Map<string, FCurve>();
    for (const curve of curves) {
      const value = `${curve.path}[${curve.index}]`;
      if (!own.has(value)) own.set(value, curve);
    }
    byValue.set(owner, own);
  }
  const played = new Map<Owner, FCurve[]>();
  for (const [owner, own] of byValue) if (own.size > 0) played.set(owner, [...own.values()]);
  return played;
}

function buildClip(action: Action, assignments: readonly Assignment[], clipScene: ClipScene): ParsedClip | null {
  const { scene, warnings } = clipScene;
  const objectEntries: { owner: ObjectRecord; curves: FCurve[] }[] = [];
  const keyEntries: { owner: MeshRecord; curves: FCurve[] }[] = [];
  for (const { slot, target } of assignments) {
    const curves = slot.curves.filter((curve) => !curve.empty);
    if (target.kind === "object") {
      objectEntries.push({
        owner: target.record,
        curves: curves.filter((curve) => relevantObjectCurve(curve, target.record)),
      });
      continue;
    }
    const keyCurves = curves.filter(relevantKeyCurve);
    for (const mesh of target.meshes) {
      const own = keyCurves.filter((curve) => mesh.morphKeys.includes(parseShapeKeyPath(curve.path) ?? ""));
      keyEntries.push({ owner: mesh, curves: own });
    }
  }
  const objectTargets = [...playedCurves(objectEntries)].map(([record, curves]) => ({ record, curves }));
  const keyTargets: KeyTarget[] = [...playedCurves(keyEntries)].map(([mesh, curves]) => ({ mesh, curves }));
  if (objectTargets.length === 0 && keyTargets.length === 0) return null;
  const animated = [...objectTargets, ...keyTargets].flatMap(({ curves }) => curves);

  const warn = (code: BlendWarning["code"], message: string, detail: string) =>
    warnings.push({
      code,
      subject: { kind: "clip", name: action.name },
      message: `${message}: ${action.name}`,
      detail,
    });
  if (objectTargets.length > 0 && action.slots.some((slot) => slot.curves.some(keysRotationMode))) {
    const detail = "Keys on rotation mode are left out; each object and bone keeps the mode it was saved with";
    warn("deform-approximated", "Rotation mode changes not followed", detail);
  }
  const unsupported = new Set(animated.flatMap((curve) => curve.unsupportedModifiers));
  if (unsupported.size > 0) {
    warn("curve-modifier-not-applied", "Curve modifiers not applied", [...unsupported].join(", "));
  }
  if (action.layers > 1) {
    warn("action-layer-not-played", "Only the first layer played", `The action has ${action.layers} layers`);
  }

  const [start, end] = actionRange(action);
  const fps = scene.fps;
  const span = end - start;
  const whole = Math.floor(span + 1e-6);
  if (whole > MAX_FRAMES) {
    warn("clip-not-sampled", "Clip not sampled", `It spans ${whole} frames, more than ${MAX_FRAMES}`);
    return null;
  }
  const { frames, late, dropped } = sampleFrames(start, end, whole, animated);
  if (dropped) {
    const detail = `Sampling them would take more than ${MAX_FRAMES} frames, so the preview samples whole frames`;
    warn("deform-approximated", "Jumps between frames not shown", detail);
  }
  const times = Float32Array.from(frames, (frame) => snapTime((frame - start) / fps, fps));
  const duration = snapTime(span / fps, fps);

  const curveTimes: Float32Array[] = [];
  const tolerance = 0.25 / fps;
  for (const curve of animated) {
    const keyed = keyFrames(curve)
      .map((frame) => snapTime((frame - start) / fps, fps))
      .filter((time) => time >= -tolerance && time <= duration + tolerance);
    if (keyed.length > 0) curveTimes.push(Float32Array.from(keyed));
  }

  const distinct = [...new Set(animated)];
  const slots = new Map(distinct.map((curve, index) => [curve, index]));
  const bindings = objectTargets.map(({ record, curves }) => bind(record, curves, slots));
  const { layout, sample } = sampler(bindings, keyTargets, clipScene, slots);
  const evaluators = distinct.map(curveEvaluator);
  const evaluate = (frame: number, values: Float64Array) => {
    evaluators.forEach((valueAt, index) => {
      values[index] = valueAt(frame);
    });
  };
  const leads = late || animated.some((curve) => canJumpAfter(curve, start, end));
  const holds = animated.some((curve) => canJump(curve, start, end));
  const edges = edgeTimes(times, fps, leads, holds);
  const count = frames.length;
  const samples: Samples = { layout, count, frames: new Float64Array(count * layout.size), after: [], before: [] };
  const frameValues = new Float64Array(distinct.length);
  const edgeValues = new Float64Array(distinct.length);
  const shearedAt = { frames: new Set<string>(), after: new Set<string>(), before: new Set<string>() };
  const edgeSample = (time: number | null, sheared: Set<string>): EdgeSample => {
    if (time === null) return null;
    evaluate(start + time * fps, edgeValues);
    if (edgeValues.every((value, index) => value === frameValues[index])) return "first";
    const row = new Float64Array(layout.size);
    sample(edgeValues, row, sheared);
    return row;
  };
  frames.forEach((frame, k) => {
    evaluate(frame, frameValues);
    sample(frameValues, samples.frames.subarray(k * layout.size, (k + 1) * layout.size), shearedAt.frames);
    const edge = edges[k];
    if (!edge) return;
    samples.after.push(edgeSample(edge.lead, shearedAt.after));
    samples.before.push(edgeSample(edge.hold, shearedAt.before));
  });
  const sheared = new Set([...shearedAt.frames, ...shearedAt.after, ...shearedAt.before]);
  const armatures = bindings.flatMap(({ record }) => (record.armature ? [record] : []));
  const tracks = clipTracks(samples, edges, times, clipScene, armatures, sheared);
  if (sheared.size > 0) {
    const detail = `These bones shear under their parents' scale, which the preview drops: ${[...sheared].join(", ")}`;
    warn("deform-approximated", "Shear not shown", detail);
  }
  return { name: action.name, duration, curveTimes, tracks };
}

/**
 * Samples every action that animates the scene into a clip, one key per frame of its range, with keys on either side
 * of the jumps of stepped and cycled curves. Bones start from the pose Blender shows when it opens the file, and a
 * clip that animates an armature shows that pose on the bones it does not key, as Blender does with only that action
 * playing.
 */
export function buildClips(scene: BuiltScene, actions: readonly Action[], warnings: BlendWarning[]): ParsedClip[] {
  const targets = assignTargets(actions, scene);
  const restTrs = scene.nodes.map((node) => decompose(toSceneAxes(node.rest, scene.unitScale)));
  const saved = new Map<ObjectRecord, SavedPose>();
  for (const record of scene.objects) {
    if (record.armature) {
      saved.set(record, savedPose(record.armature, inRestPosition(record), restTrs, scene.unitScale));
    }
  }
  const clips: ParsedClip[] = [];
  for (const action of actions) {
    const assignments = targets.get(action);
    const clip = assignments ? buildClip(action, assignments, { scene, restTrs, saved, warnings }) : null;
    if (clip) clips.push(clip);
  }
  return clips;
}

/** Warnings for drivers that move what Arcue shows: object and bone transforms and shape key values. */
export function driverWarnings(scene: BuiltScene): BlendWarning[] {
  const warnings: BlendWarning[] = [];
  for (const record of scene.objects) {
    const drivers = animationUses(record.object.struct).drivers.filter((curve) => relevantObjectCurve(curve, record));
    if (drivers.length > 0) {
      warnings.push({
        code: "driver-not-evaluated",
        subject: { kind: "node", name: record.object.name },
        message: `Drivers not evaluated: ${record.object.name}`,
        detail: [...new Set(drivers.map((curve) => curve.path))].join(", "),
      });
    }
  }
  for (const mesh of scene.meshRecords) {
    const key = shapeKeyOwner(mesh);
    if (!key) continue;
    const drivers = animationUses(key).drivers.filter(relevantKeyCurve);
    if (drivers.length > 0) {
      warnings.push({
        code: "driver-not-evaluated",
        subject: { kind: "node", name: mesh.object.name },
        message: `Shape key drivers not evaluated: ${mesh.object.name}`,
        detail: drivers.map((curve) => parseShapeKeyPath(curve.path) ?? curve.path).join(", "),
      });
    }
  }
  return warnings;
}
