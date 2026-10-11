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
import { canJump, canJumpAfter, evaluateFCurve, jumpFrames, keyFrames } from "./fcurve";

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
 * slot it plays. For an action that plays nowhere, what `guessedTargets` finds, one slot to an object or mesh: a slot
 * named after it before one that only names its bones or keys. An object or mesh that uses the action without a slot
 * stays still.
 */
function assignTargets(actions: readonly Action[], scene: BuiltScene): Map<Action, Assignment[]> {
  const result = new Map<Action, Assignment[]>();
  const shapeKeys = scene.meshRecords.flatMap((mesh): ShapeKeys[] => {
    const key = shapeKeyOwner(mesh);
    return key ? [{ mesh, key }] : [];
  });
  const uses: { action: number; slot: number; target: Target }[] = [];
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
    for (const use of uses) {
      if (use.action !== action.struct.offset) continue;
      const slot = slotFor(action, use.slot);
      if (slot) assigned.push({ slot, target: use.target });
      else claim(use.target);
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

function sameTrs(a: Trs, b: Trs): boolean {
  const close = (x: readonly number[], y: readonly number[], tolerance: number) =>
    x.every((value, index) => Math.abs(value - (y[index] ?? 0)) <= tolerance);
  const dot = Math.abs(
    a.rotation[0] * b.rotation[0] +
      a.rotation[1] * b.rotation[1] +
      a.rotation[2] * b.rotation[2] +
      a.rotation[3] * b.rotation[3],
  );
  return close(a.translation, b.translation, 1e-6) && close(a.scale, b.scale, 1e-6) && dot > 1 - 1e-9;
}

function track(
  node: number,
  property: Track["property"],
  interpolation: Interpolation,
  times: Float32Array,
  values: number[],
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

function near(a: readonly number[], b: readonly number[], tolerance: number): boolean {
  return a.every((value, index) => Math.abs(value - (b[index] ?? 0)) <= tolerance);
}

/**
 * Whether a value jumps between `probe` and `after`, a sample a moment away, given `before` on the other side of the
 * probe: by more than `JUMP_SHARE` of its change over the rest of the segment.
 */
function jumps(before: readonly number[], probe: readonly number[], after: readonly number[]): boolean {
  return after.some((value, index) => {
    const last = Math.abs(value - (probe[index] ?? 0));
    return last > JUMP_MINIMUM && last > JUMP_SHARE * Math.abs((probe[index] ?? 0) - (before[index] ?? 0));
  });
}

/** The quaternion, or its negation when that is nearer `reference`. */
function aligned(q: number[], reference: readonly number[]): number[] {
  const dot = q.reduce((sum, value, index) => sum + value * (reference[index] ?? 0), 0);
  return dot < 0 ? q.map((value) => -value) : q;
}

/**
 * Times a moment inside each segment between two samples, where a value can jump: `lead` just after its first sample
 * and `hold` just before its last. Null where nothing can jump that way or the samples leave no room.
 */
interface EdgeTimes {
  lead: number | null;
  hold: number | null;
}

/** What one node, mesh or property is at each segment's edge times: `after` at its lead, `before` at its hold. */
interface EdgeSamples<Value> {
  after: readonly (Value | null)[];
  before: readonly (Value | null)[];
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
  series: number[][],
  edges: readonly EdgeTimes[],
  probes: EdgeSamples<number[]>,
): Track | null {
  const components = series[0]?.length ?? 0;
  if (components === 0) return null;
  let { after, before } = probes;
  if (property === "rotation") {
    for (let k = 1; k < series.length; k++) series[k] = aligned(series[k] ?? [], series[k - 1] ?? []);
    const align = (value: number[] | null, k: number) => value && aligned(value, series[k] ?? []);
    after = after.map(align);
    before = before.map(align);
  }
  const holds = (value: number[] | null | undefined, k: number) =>
    value !== null && value !== undefined && near(value, series[k] ?? [], HOLD_TOLERANCE);
  const steps =
    edges.length > 0 && edges.every((edge, k) => holds(before[k], k) && (edge.lead === null || holds(after[k], k)));
  if (steps) return track(node, property, "step", times, series.flat(), components);
  const keyTimes: number[] = [];
  const values: number[] = [];
  series.forEach((value, k) => {
    keyTimes.push(times[k] ?? 0);
    values.push(...value);
    const edge = edges[k];
    const next = series[k + 1];
    if (!edge || !next) return;
    const leading = after[k];
    const holding = before[k];
    let from = value;
    if (edge.lead !== null && leading && jumps(next, leading, value)) {
      keyTimes.push(edge.lead);
      values.push(...leading);
      from = leading;
    }
    if (edge.hold !== null && holding && jumps(from, holding, next)) {
      keyTimes.push(edge.hold);
      values.push(...holding);
    }
  });
  return track(node, property, "linear", Float32Array.from(keyTimes), values, components);
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

const ARMATURE_REST_POSITION = 1 << 0;

function inRestPosition(record: ObjectRecord): boolean {
  return ((record.object.data?.number("flag") ?? 0) & ARMATURE_REST_POSITION) !== 0;
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
 * a curve may jump too soon after one of those frames to sample on its own.
 */
function sampleFrames(
  start: number,
  end: number,
  whole: number,
  curves: readonly FCurve[],
): { frames: number[]; late: boolean } {
  const frames: number[] = [];
  for (let k = 0; k <= whole; k++) frames.push(start + k);
  if (end - start - whole > 1e-6) frames.push(end);
  const between = new Set<number>();
  let late = false;
  for (const curve of curves) {
    for (const frame of jumpFrames(curve, start, end)) {
      const offset = frame - start;
      const fraction = offset - Math.round(offset);
      if (Math.abs(fraction) >= SNAP_FRAMES && Math.abs(end - frame) >= SNAP_FRAMES) between.add(frame);
      else if (fraction > 0 && fraction < SNAP_FRAMES) late = true;
    }
  }
  if (between.size === 0) return { frames, late };
  const all = [...frames, ...between].sort((a, b) => a - b);
  const kept = all.filter((frame, index) => index === 0 || frame - (all[index - 1] ?? 0) >= SNAP_FRAMES);
  return { frames: kept, late: late || kept.length < all.length };
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

interface Binding {
  record: ObjectRecord;
  objectCurves: FCurve[];
  boneCurves: Map<number, { curve: FCurve; property: string }[]>;
  /** Bones sampled at every frame: those the action keys and those whose transform depends on their parents'. */
  sampled: number[];
  needsPoses: boolean;
}

interface Sample {
  nodes: Map<number, Trs>;
  weights: Map<MeshRecord, number[]>;
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

function bind(record: ObjectRecord, curves: readonly FCurve[]): Binding {
  const boneIndex = new Map(record.armature?.bones.map((bone, index) => [bone.name, index]) ?? []);
  const boneCurves = new Map<number, { curve: FCurve; property: string }[]>();
  const objectCurves: FCurve[] = [];
  for (const curve of curves) {
    const pose = parsePosePath(curve.path);
    if (!pose) {
      objectCurves.push(curve);
      continue;
    }
    const index = boneIndex.get(pose.bone);
    if (index === undefined) continue;
    boneCurves.set(index, [...(boneCurves.get(index) ?? []), { curve, property: pose.property }]);
  }
  const bones = record.armature?.bones ?? [];
  const sampled = bones.flatMap((bone, index) => (boneCurves.has(index) || !inheritsFully(bone) ? [index] : []));
  const needsPoses = sampled.some((index) => {
    const bone = bones[index];
    return bone !== undefined && !inheritsFully(bone);
  });
  return { record, objectCurves, boneCurves, sampled, needsPoses };
}

/** Samples the nodes and morph weights an action moves from its curves' values at a frame, noting bones that shear. */
function sampler(
  bindings: readonly Binding[],
  keyTargets: readonly KeyTarget[],
  clipScene: ClipScene,
  sheared: Set<string>,
): (played: (curve: FCurve) => number) => Sample {
  const { scene, saved } = clipScene;
  return (played) => {
    const nodes = new Map<number, Trs>();
    for (const { record, objectCurves, boneCurves, sampled, needsPoses } of bindings) {
      if (objectCurves.length > 0) {
        const values = cloneValues(record.values);
        for (const curve of objectCurves) {
          setTransformProperty(values, curve.path, curve.index, played(curve));
        }
        keepScale(values.scale);
        keepScale(values.deltaScale);
        const local = multiplyAll(record.parentPart, record.parentInverse, objectBasis(values));
        nodes.set(record.node, decompose(toSceneAxes(local, scene.unitScale)));
      }
      const armature = record.armature;
      const pose = saved.get(record);
      if (!armature || !pose || boneCurves.size === 0) continue;
      const channels = [...pose.channels];
      for (const [index, list] of boneCurves) {
        const channel = cloneValues(pose.channels[index] ?? restChannel());
        for (const { curve, property } of list) {
          setTransformProperty(channel, property, curve.index, played(curve));
        }
        keepScale(channel.scale);
        channels[index] = channel;
      }
      const poses = needsPoses ? poseMatrices(armature.bones, channels) : null;
      for (const index of sampled) {
        const bone = armature.bones[index];
        const node = armature.nodes[index];
        if (!bone || node === undefined) continue;
        const local = boneLocal(armature.bones, index, channels[index], poses);
        if (poses && !inheritsFully(bone) && shearOf(local) > SHEAR_TOLERANCE) sheared.add(bone.name);
        nodes.set(node, decompose(toSceneAxes(local, scene.unitScale)));
      }
    }
    const weights = new Map<MeshRecord, number[]>();
    for (const { mesh, curves } of keyTargets) {
      const values = [...mesh.morphDefaults];
      for (const curve of curves) {
        const index = mesh.morphKeys.indexOf(parseShapeKeyPath(curve.path) ?? "");
        const [min, max] = mesh.morphRanges[index] ?? [0, 1];
        if (index >= 0) values[index] = Math.min(Math.max(played(curve), min), max);
      }
      weights.set(mesh, values);
    }
    return { nodes, weights };
  };
}

function pickEdges<Value>(probes: EdgeSamples<Sample>, pick: (sample: Sample) => Value | null): EdgeSamples<Value> {
  return {
    after: probes.after.map((sample) => (sample ? pick(sample) : null)),
    before: probes.before.map((sample) => (sample ? pick(sample) : null)),
  };
}

/**
 * The tracks of the sampled nodes that move from rest and of the sampled morph weights, then one-key tracks for the
 * bones that the saved pose of an armature the clip animates moves and that the clip does not sample.
 */
function clipTracks(
  samples: readonly Sample[],
  edges: readonly EdgeTimes[],
  probes: EdgeSamples<Sample>,
  times: Float32Array,
  clipScene: ClipScene,
  armatures: readonly ObjectRecord[],
  sheared: Set<string>,
): Track[] {
  const { restTrs, saved } = clipScene;
  const tracks: Track[] = [];
  const sampledNodes = new Set(samples[0]?.nodes.keys());
  for (const node of sampledNodes) {
    const series = samples.map((sample) => sample.nodes.get(node));
    const nodeProbes = pickEdges(probes, (sample) => sample.nodes.get(node) ?? null);
    const rest = restTrs[node];
    const probed = [...nodeProbes.after, ...nodeProbes.before];
    if (rest && [...series, ...probed].every((trs) => !trs || sameTrs(trs, rest))) continue;
    for (const property of TRANSFORM_PROPERTIES) {
      const values = series.map((trs) => (trs ? [...trs[property]] : []));
      const pick = (trs: Trs | null) => (trs ? [...trs[property]] : null);
      const propertyProbes = { after: nodeProbes.after.map(pick), before: nodeProbes.before.map(pick) };
      const created = sampledTrack(node, property, times, values, edges, propertyProbes);
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
  for (const mesh of samples[0]?.weights.keys() ?? []) {
    const series = samples.map((sample) => sample.weights.get(mesh) ?? []);
    const weightProbes = pickEdges(probes, (sample) => sample.weights.get(mesh) ?? null);
    const created = sampledTrack(mesh.node, "weights", times, series, edges, weightProbes);
    if (created) tracks.push(created);
  }
  return tracks.sort((a, b) => a.node - b.node);
}

/**
 * The curves each object and mesh plays, from every slot that reaches it. Where two slots key one value, the one its
 * animation data lists first wins, so the active action's slot wins over an NLA strip's, and an upper track's strip
 * over a lower one's.
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
  const { frames, late } = sampleFrames(start, end, whole, animated);
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

  const sheared = new Set<string>();
  const bindings = objectTargets.map(({ record, curves }) => bind(record, curves));
  const sampleAt = sampler(bindings, keyTargets, clipScene, sheared);
  const distinct = [...new Set(animated)];
  const order = new Map(distinct.map((curve, index) => [curve, index]));
  const valuesAt = (frame: number) => {
    const values = new Float64Array(distinct.length);
    distinct.forEach((curve, index) => {
      values[index] = evaluateFCurve(curve, frame);
    });
    return values;
  };
  const sampleOf = (values: Float64Array) => sampleAt((curve) => values[order.get(curve) ?? -1] ?? 0);
  const frameValues = frames.map(valuesAt);
  const samples = frameValues.map(sampleOf);
  const leads = late || animated.some((curve) => canJumpAfter(curve, start, end));
  const edges = edgeTimes(times, fps, leads, animated.some(canJump));
  const probe = (time: number | null, k: number) => {
    if (time === null) return null;
    const values = valuesAt(start + time * fps);
    const before = frameValues[k];
    const held = before !== undefined && values.every((value, index) => value === before[index]);
    return held ? (samples[k] ?? null) : sampleOf(values);
  };
  const probes = {
    after: edges.map(({ lead }, k) => probe(lead, k)),
    before: edges.map(({ hold }, k) => probe(hold, k)),
  };
  const armatures = bindings.flatMap(({ record }) => (record.armature ? [record] : []));
  const tracks = clipTracks(samples, edges, probes, times, clipScene, armatures, sheared);
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
