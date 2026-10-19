import type { BlendFile, BlendStruct } from "../blend/file.js";
import { datablocks, idName } from "../blend/ids.js";
import type { Mat4, Trs } from "../math.js";
import { decompose, identity, invert, multiply, SHEAR_TOLERANCE, shearOf, toSceneAxes } from "../math.js";
import type { Bone } from "../scene/armature.js";
import { BoneFlag, inheritsFully, poseMatrices } from "../scene/armature.js";
import type { ArmatureRecord, BuiltScene, MeshRecord, ObjectRecord } from "../scene/build.js";
import { constraintWarnings } from "../scene/build.js";
import { ObjectType } from "../scene/objects.js";
import type { TransformValues } from "../scene/transforms.js";
import {
  channelMatrix,
  cloneValues,
  isTransformProperty,
  objectBasis,
  restChannel,
  setTransformProperty,
} from "../scene/transforms.js";
import type { BlendWarning, Track } from "../types.js";
import type { Action, ActionSlot } from "./actions.js";
import {
  actionRange,
  animatedPaths,
  animationUses,
  IdCode,
  parsePosePath,
  parseShapeKeyPath,
  slotFor,
  usedActions,
} from "./actions.js";
import type { FCurve } from "./fcurve.js";
import { canJump, canJumpAfter, curveEvaluator, jumpFrames, keyFrames } from "./fcurve.js";
import type { Lane, Player, Span } from "./nla.js";
import {
  clampSpans,
  DIRECT,
  joinSpans,
  MAX_META_DEPTH,
  NlaTracks,
  nlaDefault,
  scenePlayer,
  withoutSpans,
} from "./nla.js";
import { inRestPosition } from "./rest-position.js";

export interface ParsedClip {
  name: string;
  duration: number;
  /** Key times of each value the clip animates, in seconds from the clip start. */
  curveTimes: Float32Array[];
  tracks: Track[];
  /** The file's frame at the clip's frame 0, and how many of the file's frames each clip frame advances. */
  fileFrames: { start: number; step: number };
}

/** What one slot of an action animates. */
type Target = { kind: "object"; record: ObjectRecord } | { kind: "shapeKeys"; meshes: MeshRecord[] };

const SNAP_FRAMES = 1e-3;
/** The most whole frames a clip spans, and the most it samples with the frames between them where a curve jumps. */
const MAX_FRAMES = 100_000;

/** How many values clips may sample and keep, each counted once across nodes, frames and morph weights. */
export interface ClipLimits {
  /** The most one clip's samples hold at once. */
  clip: number;
  /** The most the samples of a file's clips take together, which bounds how long sampling them takes. */
  sampled: number;
  /** The most a file's clips keep together, in their tracks and key times. */
  kept: number;
}

/**
 * One clip samples at most a gigabyte of doubles, a file's clips sample at most four times that between them, and
 * they keep at most half a gigabyte of floats.
 */
const CLIP_LIMITS: ClipLimits = { clip: 2 ** 27, sampled: 2 ** 29, kept: 2 ** 27 };
/** How long before or after a jump, in frames, a track still holds the value on the other side of it. */
const HOLD_FRAMES = 1e-3;
/** Scales are sampled at least this far from zero, so a flattened transform keeps its rotation. */
const MIN_SCALE = 1e-6;
/** A value jumps at the end of a segment when its change over the last `HOLD_FRAMES` is this share of the rest. */
const JUMP_SHARE = 0.05;
const JUMP_MINIMUM = 1e-6;
const HOLD_TOLERANCE = 1e-9;
const TRANSFORM_PROPERTIES = ["translation", "rotation", "scale"] as const;
const LEAD_KEY = 1;
const HOLD_KEY = 2;

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

function keysHideViewport(curve: FCurve): boolean {
  return !curve.muted && !curve.empty && curve.path === "hide_viewport";
}

function relevantKeyCurve(curve: FCurve): boolean {
  return !curve.muted && parseShapeKeyPath(curve.path) !== null;
}

/** Whether a curve moves what the preview shows: an object's or bone's transform, or a shape key's weight. */
function shownCurve(curve: FCurve): boolean {
  if (curve.muted || curve.empty) return false;
  const pose = parsePosePath(curve.path);
  return isTransformProperty(pose ? pose.property : curve.path, !pose) || parseShapeKeyPath(curve.path) !== null;
}

/** The object transform values that curves key, such as "location[0]". */
function objectTransformValues(curves: readonly FCurve[]): Set<string> {
  const values = new Set<string>();
  for (const curve of curves) {
    if (!curve.muted && !curve.empty && isTransformProperty(curve.path, true))
      values.add(`${curve.path}[${curve.index}]`);
  }
  return values;
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

function shapeKeysOf(scene: BuiltScene): ShapeKeys[] {
  return scene.meshRecords.flatMap((mesh): ShapeKeys[] => {
    const key = shapeKeyOwner(mesh);
    return key ? [{ mesh, key }] : [];
  });
}

/** What a slot of an action nothing uses animates, and whether the slot's name named it. */
interface Guess {
  targets: Target[];
  named: boolean;
  /** Whether the slot's name names shape keys or an object outside the scene, which it animates instead. */
  outside: boolean;
}

/** The actions that the file's objects and shape keys outside the scene use, and the names of those IDs. */
interface Outside {
  actions: Set<number>;
  objects: Set<string>;
  keys: Set<string>;
}

function outsideScene(file: BlendFile | undefined, scene: BuiltScene, shapeKeys: readonly ShapeKeys[]): Outside {
  const outside: Outside = { actions: new Set(), objects: new Set(), keys: new Set() };
  if (!file) return outside;
  const inside = new Set([
    ...scene.objects.map((record) => record.object.struct.offset),
    ...shapeKeys.map(({ key }) => key.offset),
  ]);
  for (const [code, names] of [
    ["OB", outside.objects],
    ["KE", outside.keys],
  ] as const) {
    for (const id of datablocks(file, code)) {
      if (inside.has(id.offset)) continue;
      names.add(idName(id));
      for (const use of usedActions(id)) outside.actions.add(use.action.offset);
    }
  }
  return outside;
}

/** What `guessedTargets` reads besides the slot. */
interface GuessContext {
  scene: BuiltScene;
  shapeKeys: readonly ShapeKeys[];
  /** The object transform values that the actions each object uses key. */
  objectKeys: ReadonlyMap<ObjectRecord, ReadonlySet<string>>;
  outside: Outside;
}

/** The one object whose actions key every object transform value a slot keys, for a slot that keys nothing else. */
function guessedObject(slot: ActionSlot, { scene, objectKeys }: GuessContext): ObjectRecord | undefined {
  const values = objectTransformValues(slot.curves);
  if (values.size === 0 || slot.curves.some((curve) => parsePosePath(curve.path))) return undefined;
  const keying = scene.objects.filter((record) => {
    const keys = objectKeys.get(record);
    return keys !== undefined && [...values].every((value) => keys.has(value));
  });
  return keying.length === 1 ? keying[0] : undefined;
}

/**
 * What a slot of an action nothing uses animates: the shape keys or the object its name names, or failing that, the
 * meshes with the shape keys its curves name or the armatures with the most bones they name. A slot that keys only
 * object transforms falls back to the one object whose actions key them all. Shape keys the name names count only when
 * they have a key its curves name. A slot that names shape keys or an object outside the scene animates nothing.
 */
function guessedTargets(slot: ActionSlot, context: GuessContext): Guess {
  const { scene, shapeKeys, outside } = context;
  const prefix = slot.identifier.slice(0, 2);
  const name = slot.identifier.slice(2);
  const keyCurves = slot.curves.some(relevantKeyCurve);
  const forKeys =
    slot.idType === IdCode.shapeKey ||
    prefix === "KE" ||
    (slot.idType === 0 && prefix === "" && keyCurves && !slot.curves.some((curve) => parsePosePath(curve.path)));
  if (forKeys) {
    if (outside.keys.has(name) && !shapeKeys.some(({ key }) => idName(key) === name)) {
      return { targets: [], named: false, outside: true };
    }
    const names = new Set(slot.curves.flatMap((curve) => parseShapeKeyPath(curve.path) ?? []));
    const keyed = shapeKeys.filter(({ mesh }) => mesh.morphKeys.some((morph) => names.has(morph)));
    const named = name === "" ? [] : keyed.filter(({ key }) => idName(key) === name);
    const matched = named.length > 0 ? named : keyed;
    const targets: Target[] =
      matched.length > 0 ? [{ kind: "shapeKeys", meshes: matched.map(({ mesh }) => mesh) }] : [];
    return { targets, named: named.length > 0, outside: false };
  }
  if (slot.idType !== 0 && slot.idType !== IdCode.object) return { targets: [], named: false, outside: false };
  const named = name === "" ? undefined : scene.objects.find((record) => record.object.name === name);
  if (named) return { targets: [{ kind: "object", record: named }], named: true, outside: false };
  if (outside.objects.has(name)) return { targets: [], named: false, outside: true };
  const armatures = scene.objects.filter((record) => record.object.type === ObjectType.armature && record.armature);
  const scored = armatures.map((record) => ({ record, score: matchingBones(slot, record) }));
  const best = scored.reduce((most, entry) => Math.max(most, entry.score), 0);
  if (best > 0) {
    const targets = scored.flatMap((entry) =>
      entry.score === best ? [{ kind: "object" as const, record: entry.record }] : [],
    );
    return { targets, named: false, outside: false };
  }
  const guessed = guessedObject(slot, context);
  return { targets: guessed ? [{ kind: "object", record: guessed }] : [], named: false, outside: false };
}

/** A slot of an action and what it animates. */
interface Assignment {
  slot: ActionSlot;
  target: Target;
}

/** What each action's slots animate, and the actions that nothing uses and nothing could be found for. */
interface Targets {
  assigned: Map<Action, Assignment[]>;
  lost: Set<Action>;
}

/**
 * What each slot of each action animates: the objects and shape keys whose animation data plays it, each with every
 * slot it plays. Where Blender plays the action through a slot, only the uses it plays count; an action it plays
 * through none, such as one on muted tracks only, counts with every use. For an action that no animation data in the
 * scene uses through a slot, and none outside it uses at all, what `guessedTargets` finds, one slot to an object or
 * mesh: a slot named after it before one that only names its bones or keys. An object or mesh that uses the action
 * without a slot stays still. An action that nothing in the file uses, that moves what the preview shows and that no
 * guess places is lost.
 */
function assignTargets(actions: readonly Action[], scene: BuiltScene): Targets {
  const assigned = new Map<Action, Assignment[]>();
  const lost = new Set<Action>();
  const shapeKeys = shapeKeysOf(scene);
  const outside = outsideScene(actions[0]?.struct.file, scene, shapeKeys);
  const uses: { action: number; slot: number; played: boolean; target: Target }[] = [];
  for (const record of scene.objects) {
    for (const use of animationUses(record.object.struct).uses)
      uses.push({ ...use, target: { kind: "object", record } });
  }
  for (const { mesh, key } of shapeKeys) {
    for (const use of animationUses(key).uses) uses.push({ ...use, target: { kind: "shapeKeys", meshes: [mesh] } });
  }
  const byOffset = new Map(actions.map((action) => [action.struct.offset, action]));
  const objectKeys = new Map<ObjectRecord, Set<string>>();
  for (const use of uses) {
    const action = byOffset.get(use.action);
    const slot = action ? slotFor(action, use.slot) : undefined;
    if (use.target.kind !== "object" || !slot) continue;
    const values = objectTransformValues(slot.curves);
    if (values.size === 0) continue;
    const keys = objectKeys.get(use.target.record) ?? new Set<string>();
    for (const value of values) keys.add(value);
    objectKeys.set(use.target.record, keys);
  }
  const context: GuessContext = { scene, shapeKeys, objectKeys, outside };

  for (const action of actions) {
    const assignments: Assignment[] = [];
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
      if (slot) assignments.push({ slot, target });
      else claim(target);
    }
    let elsewhere = outside.actions.has(action.struct.offset);
    if (assignments.length === 0 && !elsewhere) {
      const guesses = action.slots.map((slot) => ({ slot, ...guessedTargets(slot, context) }));
      elsewhere = guesses.some((guess) => guess.outside);
      for (const named of [true, false]) {
        for (const guess of guesses) {
          if (guess.named !== named) continue;
          for (const target of guess.targets) {
            const free = claim(target);
            if (free) assignments.push({ slot: guess.slot, target: free });
          }
        }
      }
    }
    if (assignments.length > 0) assigned.set(action, assignments);
    else if (own.length === 0 && !elsewhere && action.slots.some((slot) => slot.curves.some(shownCurve))) {
      lost.add(action);
    }
  }
  return { assigned, lost };
}

/**
 * The property paths that animation plays on each object: those Blender plays now, as `animatedPaths` finds them, and
 * the unmuted curves of the slots that `clipped`, the assignments of the clips the reader makes, give the object.
 */
function playedPaths(
  scene: BuiltScene,
  actions: readonly Action[],
  clipped: readonly (readonly Assignment[])[],
): Map<ObjectRecord, Set<string>> {
  const byOffset = new Map(actions.map((action) => [action.struct.offset, action]));
  const paths = new Map(scene.objects.map((record) => [record, animatedPaths(record.object.struct, byOffset)]));
  for (const { slot, target } of clipped.flat()) {
    const played = target.kind === "object" ? paths.get(target.record) : undefined;
    if (!played) continue;
    for (const curve of slot.curves) if (!curve.muted && !curve.empty) played.add(curve.path);
  }
  return paths;
}

function snapTime(seconds: number, fps: number): number {
  const frames = seconds * fps;
  const whole = Math.round(frames);
  return Math.abs(frames - whole) < SNAP_FRAMES ? whole / fps : seconds;
}

/** The numbers `writeTrs` writes for a transform: its translation, then its rotation, then its scale. */
const TRS_SIZE = 10;

function writeTrs(out: Float64Array, offset: number, trs: Trs): void {
  out.set(trs.translation, offset);
  out.set(trs.rotation, offset + 3);
  out.set(trs.scale, offset + 7);
}

/**
 * Whether the transform `writeTrs` wrote at `base` of `values` matches `b`: translations and scales within 1e-6, and
 * rotations within a dot of 1e-9.
 */
function sameTrsAt(values: Float64Array, base: number, b: Trs): boolean {
  for (let c = 0; c < 3; c++) {
    if (!(Math.abs((values[base + c] ?? 0) - (b.translation[c] ?? 0)) <= 1e-6)) return false;
    if (!(Math.abs((values[base + 7 + c] ?? 0) - (b.scale[c] ?? 0)) <= 1e-6)) return false;
  }
  let dot = 0;
  for (let c = 0; c < 4; c++) dot += (values[base + 3 + c] ?? 0) * (b.rotation[c] ?? 0);
  return Math.abs(dot) > 1 - 1e-9;
}

function sameTrs(a: Trs, b: Trs): boolean {
  const written = new Float64Array(TRS_SIZE);
  writeTrs(written, 0, a);
  return sameTrsAt(written, 0, b);
}

function near(values: Float64Array, a: number, b: number, components: number): boolean {
  for (let c = 0; c < components; c++) {
    if (!(Math.abs((values[a + c] ?? 0) - (values[b + c] ?? 0)) <= HOLD_TOLERANCE)) return false;
  }
  return true;
}

/**
 * Whether a value jumps between the one at `probe` and the one at `after`, a sample a moment away, given the one at
 * `before` on the other side of the probe: by more than `JUMP_SHARE` of its change over the rest of the segment.
 */
function jumps(values: Float64Array, before: number, probe: number, after: number, components: number): boolean {
  for (let c = 0; c < components; c++) {
    const at = values[probe + c] ?? 0;
    const last = Math.abs((values[after + c] ?? 0) - at);
    if (last > JUMP_MINIMUM && last > JUMP_SHARE * Math.abs(at - (values[before + c] ?? 0))) return true;
  }
  return false;
}

/** Negates the quaternion at `q` when its negation is nearer the one at `reference`. */
function align(values: Float64Array, q: number, reference: number): void {
  let dot = 0;
  for (let c = 0; c < 4; c++) dot += (values[q + c] ?? 0) * (values[reference + c] ?? 0);
  if (dot < 0) for (let c = 0; c < 4; c++) values[q + c] = -(values[q + c] ?? 0);
}

/**
 * Times a moment inside each segment between two samples, where a value can jump: `lead` just after its first sample
 * and `hold` just before its last. Null where nothing can jump that way or the samples leave no room.
 */
interface EdgeTimes {
  lead: number | null;
  hold: number | null;
}

function keepScale(values: number[]): void {
  values.forEach((value, index) => {
    if (Math.abs(value) < MIN_SCALE) values[index] = value < 0 ? -MIN_SCALE : MIN_SCALE;
  });
}

/** Matrices a sampler writes each bone's and object's transform through, reused from one to the next. */
interface Scratch {
  basis: Mat4;
  local: Mat4;
  scene: Mat4;
}

function scratchMatrices(): Scratch {
  return { basis: new Float64Array(16), local: new Float64Array(16), scene: new Float64Array(16) };
}

/**
 * A bone's matrix relative to its parent bone's pose: its channel after its rest offset, or, for a bone that does not
 * inherit fully, from the armature's poses. It may be `scratch.local`, which the next call overwrites.
 */
function boneLocal(
  bones: readonly Bone[],
  index: number,
  channel: TransformValues | undefined,
  poses: readonly (Mat4 | undefined)[] | null,
  scratch: Scratch,
): Mat4 {
  const bone = bones[index];
  if (!bone) return identity();
  if (poses && !inheritsFully(bone)) {
    const pose = poses[index] ?? bone.rest;
    const parentPose = poses[bone.parent];
    return parentPose ? multiply(invert(parentPose), pose) : pose;
  }
  if (!channel) return bone.offset;
  const connected = (bone.flag & BoneFlag.connected) !== 0;
  return multiply(bone.offset, channelMatrix(channel, connected, scratch.basis), scratch.local);
}

/** An armature's saved pose: the channels actions start from, and the bones it moves from rest. */
interface SavedPose {
  channels: TransformValues[];
  moved: Map<number, Trs>;
  /** Bones whose saved pose shears them under their parents' scale. */
  sheared: Map<number, string>;
}

/**
 * The pose an armature's actions start from: the pose Blender shows at the scene's start frame, or, for an armature set
 * to its rest position, the rest pose in each channel's rotation mode.
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
  const scratch = scratchMatrices();
  armature.bones.forEach((bone, index) => {
    const node = armature.nodes[index];
    const rest = node === undefined ? undefined : restTrs[node];
    if (node === undefined || !rest) return;
    const local = boneLocal(armature.bones, index, channels[index], poses, scratch);
    const trs = decompose(toSceneAxes(local, unitScale, scratch.scene));
    if (sameTrs(trs, rest)) return;
    moved.set(node, trs);
    if (poses && !inheritsFully(bone) && shearOf(local) > SHEAR_TOLERANCE) sheared.set(node, bone.name);
  });
  return { channels, moved, sheared };
}

/** A time a clip samples: in clip frames from its start, and on the clock its curves play by. */
interface SamplePoint {
  frame: number;
  clock: number;
}

/**
 * Every whole frame of a clip from its start, its end, and the frames between where a curve or a use may jump. `late`
 * when a curve may jump too soon after one of those frames to sample on its own. Only the whole frames and the end,
 * with `dropped`, when the frames between would take the clip past `MAX_FRAMES`. `curves` play at the clip's clock,
 * which runs from `origin` to `end` at `rate` a frame, and `breaks` are the clock times where uses may jump.
 */
function samplePoints(
  { origin, end, rate }: { origin: number; end: number; rate: number },
  span: number,
  whole: number,
  curves: readonly FCurve[],
  breaks: readonly number[],
): { points: SamplePoint[]; late: boolean; dropped: boolean } {
  const points: SamplePoint[] = [];
  for (let k = 0; k <= whole; k++) points.push({ frame: k, clock: origin + k * rate });
  if (span - whole > 1e-6) points.push({ frame: span, clock: end });
  const between = new Map<number, SamplePoint>();
  let late = false;
  const addWithinLimit = (clocks: readonly number[] | null): boolean => {
    if (clocks === null) return false;
    for (const clock of clocks) {
      const frame = (clock - origin) / rate;
      const fraction = frame - Math.round(frame);
      if (Math.abs(fraction) >= SNAP_FRAMES && Math.abs(span - frame) >= SNAP_FRAMES) {
        between.set(clock, { frame, clock });
      } else if (fraction > 0 && fraction < SNAP_FRAMES) late = true;
    }
    return whole + between.size <= MAX_FRAMES;
  };
  const added =
    curves.every((curve) => addWithinLimit(jumpFrames(curve, origin, end, MAX_FRAMES))) && addWithinLimit(breaks);
  if (!added) return { points, late: false, dropped: true };
  if (between.size === 0) return { points, late, dropped: false };
  const all = [...points, ...between.values()].sort((a, b) => a.frame - b.frame);
  const kept = all.filter((point, index) => index === 0 || point.frame - (all[index - 1]?.frame ?? 0) >= SNAP_FRAMES);
  return { points: kept, late: late || kept.length < all.length, dropped: false };
}

/**
 * For each segment between two samples, a time just after its first sample when a value can jump right after a
 * frame, and a time just before its last when one can jump at a frame; null where the samples are too close. Both
 * in the segments of `nearBreaks`, where a use may jump.
 */
function edgeTimes(
  times: Float32Array,
  fps: number,
  leads: boolean,
  holds: boolean,
  nearBreaks: ReadonlySet<number>,
): EdgeTimes[] {
  const gap = (time: number) => Math.max(HOLD_FRAMES / fps, 1e-5, Math.abs(time) * 2 ** -20);
  const edges: EdgeTimes[] = [];
  if (!leads && !holds && nearBreaks.size === 0) return edges;
  for (let k = 0; k + 1 < times.length; k++) {
    const from = times[k] ?? 0;
    const to = times[k + 1] ?? 0;
    const both = nearBreaks.has(k);
    const holdTime = Math.fround(to - gap(to));
    const hold = (holds || both) && holdTime > from ? holdTime : null;
    const leadTime = Math.fround(from + gap(from));
    const lead = (leads || both) && leadTime < (hold ?? to) ? leadTime : null;
    edges.push({ lead, hold });
  }
  return edges;
}

/** The segments between sample points next to each of the clock times `breaks`: the one around it and its neighbors. */
function segmentsNear(
  points: readonly SamplePoint[],
  breaks: readonly number[],
  { origin, rate }: { origin: number; rate: number },
): Set<number> {
  const segments = new Set<number>();
  for (const clock of breaks) {
    const frame = (clock - origin) / rate;
    let low = 0;
    let high = points.length - 1;
    while (low < high) {
      const middle = (low + high + 1) >> 1;
      if ((points[middle]?.frame ?? 0) <= frame) low = middle;
      else high = middle - 1;
    }
    for (const segment of [low - 1, low, low + 1]) {
      if (segment >= 0 && segment + 1 < points.length) segments.add(segment);
    }
  }
  return segments;
}

/** A curve that sets a value while its use plays, by the use's place among the clip's players. */
interface Source {
  curve: FCurve;
  player: number;
}

/** A value a clip sets: from the first of its sources whose use plays at a time, or else from `fallback`. */
interface Channel {
  path: string;
  index: number;
  sources: Source[];
  /** Blender's default for the value, which the NLA gives a value that no strip plays. */
  fallback: number;
}

/** The values a clip sets, by owner, each value once, in the order the owners' animation data lists their sources. */
class Channels {
  readonly objects = new Map<ObjectRecord, Map<string, Channel>>();
  readonly meshes = new Map<MeshRecord, Map<string, Channel>>();

  /** Adds the curves of a slot that its target shows, played by `player`; whether there were any. */
  addSlot(slot: ActionSlot, target: Target, player: number): boolean {
    let added = false;
    const curves = slot.curves.filter((curve) => !curve.empty);
    if (target.kind === "object") {
      for (const curve of curves) {
        if (relevantObjectCurve(curve, target.record)) added = this.#add(this.objects, target.record, curve, player);
      }
      return added;
    }
    const keyCurves = curves.filter(relevantKeyCurve);
    for (const mesh of target.meshes) {
      if (mesh.shapeKeyLock) continue;
      for (const curve of keyCurves) {
        if (mesh.morphKeys.includes(parseShapeKeyPath(curve.path) ?? "")) {
          added = this.#add(this.meshes, mesh, curve, player);
        }
      }
    }
    return added;
  }

  #add<Owner>(owners: Map<Owner, Map<string, Channel>>, owner: Owner, curve: FCurve, player: number): true {
    let channels = owners.get(owner);
    if (!channels) {
      channels = new Map();
      owners.set(owner, channels);
    }
    const key = `${curve.path}[${curve.index}]`;
    let channel = channels.get(key);
    if (!channel) {
      channel = { path: curve.path, index: curve.index, sources: [], fallback: nlaDefault(curve.path, curve.index) };
      channels.set(key, channel);
    }
    if (channel.sources[channel.sources.length - 1]?.player !== player) channel.sources.push({ curve, player });
    return true;
  }
}

/** What a clip plays and over which frames. */
interface ClipPlan {
  name: string;
  /** The uses the clip plays; the first plays the action's frame equal to the clock time at every time. */
  players: Player[];
  channels: Channels;
  /** The slots the clip plays and their targets, which its warnings read. */
  played: Assignment[];
  /** Each action the clip plays, once. */
  actions: Action[];
  /** The clock time at the clip's first frame and at its end, and how far the clock advances a clip frame. */
  origin: number;
  end: number;
  rate: number;
  fileFrames: { start: number; step: number };
}

/**
 * The clip of an action: its slots on what they animate, over the action's frame range, a frame of the scene to each
 * `framelen` of the action's frames, as the scene's time remapping plays it.
 */
function actionPlan(action: Action, assignments: readonly Assignment[], scene: BuiltScene): ClipPlan {
  const channels = new Channels();
  for (const { slot, target } of assignments) channels.addSlot(slot, target, 0);
  const [start, end] = actionRange(action);
  const rate = scene.timeline.frameLength;
  return {
    name: action.name,
    players: [DIRECT],
    channels,
    played: [...assignments],
    actions: [action],
    origin: start,
    end,
    rate,
    fileFrames: { start, step: rate },
  };
}

/**
 * The clip of the scene's timeline: every use of an action that Blender plays, together, over the scene's frame range,
 * each where its NLA strip or extrapolation puts it. Null unless uses of more than one action move what it shows, and
 * null with a warning where NLA meta strips nest deeper than the players follow.
 */
function scenePlan(scene: BuiltScene, actions: readonly Action[], warnings: BlendWarning[]): ClipPlan | null {
  const byOffset = new Map(actions.map((action) => [action.struct.offset, action]));
  const tracks = new NlaTracks();
  const players: Player[] = [DIRECT];
  const channels = new Channels();
  const played: Assignment[] = [];
  const playing = new Set<Action>();
  const play = (id: BlendStruct, target: Target) => {
    for (const use of usedActions(id)) {
      const action = use.played ? byOffset.get(use.action.offset) : undefined;
      const slot = action ? slotFor(action, use.slot) : undefined;
      if (!action || !slot) continue;
      const player = scenePlayer(id, use, action, tracks);
      const index = player === DIRECT ? 0 : players.push(player) - 1;
      if (channels.addSlot(slot, target, index)) playing.add(action);
      played.push({ slot, target });
    }
  };
  for (const record of scene.objects) play(record.object.struct, { kind: "object", record });
  for (const { mesh, key } of shapeKeysOf(scene)) play(key, { kind: "shapeKeys", meshes: [mesh] });
  if (playing.size < 2) return null;
  const { name, start, end, frameLength } = scene.timeline;
  if (tracks.tooDeep) {
    warnings.push({
      code: "clip-not-sampled",
      subject: { kind: "clip", name },
      message: `Clip not sampled: ${name}`,
      detail: `Its NLA meta strips nest more than ${MAX_META_DEPTH} deep`,
    });
    return null;
  }
  return {
    name,
    players,
    channels,
    played,
    actions: [...playing],
    origin: start * frameLength,
    end: (end > start ? end : start + 1) * frameLength,
    rate: frameLength,
    fileFrames: { start, step: 1 },
  };
}

/** A value of a channel that a sampler sets, by the channel's place among the clip's channels. */
interface Setting {
  path: string;
  index: number;
  slot: number;
}

interface Binding {
  record: ObjectRecord;
  objectSettings: Setting[];
  boneSettings: Map<number, (Setting & { property: string })[]>;
  /** Bones sampled at every frame: those the clip keys and those whose transform depends on their parents'. */
  sampled: number[];
  needsPoses: boolean;
}

interface ClipScene {
  scene: BuiltScene;
  restTrs: readonly Trs[];
  saved: ReadonlyMap<ObjectRecord, SavedPose>;
  warnings: BlendWarning[];
  /** The most one clip's samples may hold. */
  clipLimit: number;
  /** The values the clips still to come may sample and keep together. */
  left: { sampled: number; kept: number };
  /** The array clips sample into, one after another, grown to the next power of two a clip needs. */
  buffer: Float64Array;
}

/** The first `needed` values of the clip scene's sample buffer, which grows to hold them. */
function sampleBuffer(clipScene: ClipScene, needed: number): Float64Array {
  if (clipScene.buffer.length < needed) {
    clipScene.buffer = new Float64Array(0);
    const grown = Math.min(clipScene.clipLimit, 2 ** Math.ceil(Math.log2(needed)));
    clipScene.buffer = new Float64Array(Math.max(needed, grown));
  }
  return clipScene.buffer.subarray(0, needed);
}

interface KeyTarget {
  mesh: MeshRecord;
  settings: Setting[];
}

function bind(record: ObjectRecord, channels: Iterable<Channel>, slots: ReadonlyMap<Channel, number>): Binding {
  const boneIndex = new Map(record.armature?.bones.map((bone, index) => [bone.name, index]) ?? []);
  const boneSettings = new Map<number, (Setting & { property: string })[]>();
  const objectSettings: Setting[] = [];
  for (const channel of channels) {
    const setting = { path: channel.path, index: channel.index, slot: slots.get(channel) ?? -1 };
    const pose = parsePosePath(channel.path);
    if (!pose) {
      objectSettings.push(setting);
      continue;
    }
    const index = boneIndex.get(pose.bone);
    if (index === undefined) continue;
    const list = boneSettings.get(index) ?? [];
    list.push({ ...setting, property: pose.property });
    boneSettings.set(index, list);
  }
  const bones = record.armature?.bones ?? [];
  const sampled = bones.flatMap((bone, index) => (boneSettings.has(index) || !inheritsFully(bone) ? [index] : []));
  const needsPoses = sampled.some((index) => {
    const bone = bones[index];
    return bone !== undefined && !inheritsFully(bone);
  });
  return { record, objectSettings, boneSettings, sampled, needsPoses };
}

/**
 * Where a sample keeps what it holds, one number after another: the translation, rotation and scale of each node the
 * clip moves, then the morph weights of each mesh.
 */
interface Layout {
  nodes: { node: number; offset: number }[];
  meshes: { mesh: MeshRecord; offset: number; components: number }[];
  size: number;
}

/** The bones and objects whose transforms shear in a clip, which the preview drops. */
interface Sheared {
  bones: Set<string>;
  objects: Set<string>;
}

/** Samples the nodes and morph weights a clip moves from its channels' values at a time. */
interface Sampler {
  layout: Layout;
  /** Writes the sample for the channels' `values` into `out` from `base`, and adds what shears to `sheared`. */
  sample(values: Float64Array, out: Float64Array, base: number, sheared: Sheared): void;
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

/**
 * The bones whose poses a bone that does not inherit fully needs, its ancestors and itself, as a bone list of their
 * own with each bone's parent among them, and their places in the armature.
 */
function poseChain(bones: readonly Bone[], sampled: readonly number[]): { bones: Bone[]; indices: number[] } {
  const needed = new Set<number>();
  for (const index of sampled) {
    const bone = bones[index];
    if (!bone || inheritsFully(bone)) continue;
    for (let at = index; at >= 0 && !needed.has(at); at = bones[at]?.parent ?? -1) needed.add(at);
  }
  const indices = [...needed].sort((a, b) => a - b);
  const place = new Map(indices.map((index, position) => [index, position]));
  const chain = indices.flatMap((index) => {
    const bone = bones[index];
    return bone ? [{ ...bone, parent: place.get(bone.parent) ?? -1 }] : [];
  });
  return { bones: chain, indices };
}

function sampler(bindings: readonly Binding[], keyTargets: readonly KeyTarget[], clipScene: ClipScene): Sampler {
  const { scene, saved } = clipScene;
  const scratch = scratchMatrices();
  const layout: Layout = { nodes: [], meshes: [], size: 0 };
  const place = (node: number) => {
    layout.nodes.push({ node, offset: layout.size });
    layout.size += TRS_SIZE;
    return layout.size - TRS_SIZE;
  };
  const objects = bindings.map((binding) => {
    const { record, objectSettings, boneSettings, sampled, needsPoses } = binding;
    const own =
      objectSettings.length > 0
        ? {
            offset: place(record.node),
            transform: scratchValues(record.values),
            parent: multiply(record.parentPart, record.parentInverse),
          }
        : null;
    const armature = record.armature;
    const pose = saved.get(record);
    if (!armature || !pose || boneSettings.size === 0) return { binding, own, posed: null };
    const channels = [...pose.channels];
    const keyed = [...boneSettings].map(([index, list]) => {
      const values = scratchValues(pose.channels[index] ?? restChannel());
      channels[index] = values.copy;
      return { values, list };
    });
    const bones = sampled.flatMap((index) => {
      const bone = armature.bones[index];
      const node = armature.nodes[index];
      return bone && node !== undefined ? [{ index, bone, offset: place(node) }] : [];
    });
    const chain = needsPoses ? poseChain(armature.bones, sampled) : null;
    const chainChannels = chain?.indices.map((index) => channels[index] ?? restChannel()) ?? [];
    const poses: (Mat4 | undefined)[] = [];
    return { binding, own, posed: { armature, channels, keyed, bones, chain, chainChannels, poses } };
  });
  const meshes = keyTargets.map(({ mesh, settings }) => {
    const offset = layout.size;
    const components = mesh.morphDefaults.length;
    layout.meshes.push({ mesh, offset, components });
    layout.size += components;
    const keyed = settings.map(({ path, slot }) => {
      const index = mesh.morphKeys.indexOf(parseShapeKeyPath(path) ?? "");
      return { index, range: mesh.morphRanges[index] ?? [0, 1], slot };
    });
    return { mesh, offset, keyed };
  });
  const sample = (values: Float64Array, out: Float64Array, base: number, sheared: Sheared) => {
    for (const { binding, own, posed } of objects) {
      const { record, objectSettings } = binding;
      if (own) {
        own.transform.reset();
        const transform = own.transform.copy;
        for (const { path, index, slot } of objectSettings)
          setTransformProperty(transform, path, index, values[slot] ?? 0);
        keepScale(transform.scale);
        keepScale(transform.deltaScale);
        const local = multiply(own.parent, objectBasis(transform, scratch.basis), scratch.local);
        if (shearOf(local) > SHEAR_TOLERANCE) sheared.objects.add(record.object.name);
        writeTrs(out, base + own.offset, decompose(toSceneAxes(local, scene.unitScale, scratch.scene)));
      }
      if (!posed) continue;
      const { armature, channels, keyed, bones, chain, chainChannels, poses } = posed;
      for (const { values: channel, list } of keyed) {
        channel.reset();
        for (const { property, index, slot } of list) {
          setTransformProperty(channel.copy, property, index, values[slot] ?? 0);
        }
        keepScale(channel.copy.scale);
      }
      if (chain) {
        const chainPoses = poseMatrices(chain.bones, chainChannels);
        chain.indices.forEach((index, position) => {
          poses[index] = chainPoses[position];
        });
      }
      for (const { index, bone, offset } of bones) {
        const local = boneLocal(armature.bones, index, channels[index], chain ? poses : null, scratch);
        if (chain && !inheritsFully(bone) && shearOf(local) > SHEAR_TOLERANCE) sheared.bones.add(bone.name);
        writeTrs(out, base + offset, decompose(toSceneAxes(local, scene.unitScale, scratch.scene)));
      }
    }
    for (const { mesh, offset, keyed } of meshes) {
      out.set(mesh.morphDefaults, base + offset);
      for (const { index, range, slot } of keyed) {
        if (index >= 0) out[base + offset + index] = Math.min(Math.max(values[slot] ?? 0, range[0]), range[1]);
      }
    }
  };
  return { layout, sample };
}

/**
 * A clip's samples: a row of `layout.size` numbers at each of `count` times, then rows at edge times, all in `values`.
 * `after` and `before` give each segment's row at its lead and hold time: its own, the row of the segment's first time
 * where the sample there is the same, or -1 where the segment has no such time.
 */
interface Samples {
  layout: Layout;
  count: number;
  values: Float64Array;
  after: Int32Array;
  before: Int32Array;
}

/** Whether every sample of the node at `offset`, at each time and edge time, is its rest transform. */
function resting(samples: Samples, edges: readonly EdgeTimes[], offset: number, rest: Trs): boolean {
  const { values, count, after, before } = samples;
  const at = (row: number) => row * samples.layout.size + offset;
  for (let k = 0; k < count; k++) if (!sameTrsAt(values, at(k), rest)) return false;
  return edges.every(
    (edge, k) =>
      (edge.lead === null || sameTrsAt(values, at(after[k] ?? k), rest)) &&
      (edge.hold === null || sameTrsAt(values, at(before[k] ?? k), rest)),
  );
}

/**
 * A track from the `components` numbers at `offset` of each sample, keyed at `times`. A track whose every segment
 * holds its first value until its end steps; any other keeps the values on either side of each jump. A track whose
 * keys all hold one value has one key at `zero`. Times are `times` itself wherever the track keys only them. Null
 * when its values and its own times would pass `room`.
 */
function sampledTrack(
  node: number,
  property: Track["property"],
  times: Float32Array,
  edges: readonly EdgeTimes[],
  samples: Samples,
  offset: number,
  components: number,
  zero: Float32Array,
  room: number,
): Track | null {
  if (components === 0) return null;
  const { values, count, after, before } = samples;
  const at = (row: number) => row * samples.layout.size + offset;
  const leadRow = (k: number) => at(after[k] ?? k);
  const holdRow = (k: number) => at(before[k] ?? k);
  if (property === "rotation") {
    for (let k = 1; k < count; k++) align(values, at(k), at(k - 1));
    edges.forEach((edge, k) => {
      if (edge.lead !== null) align(values, leadRow(k), at(k));
      if (edge.hold !== null) align(values, holdRow(k), at(k));
    });
  }
  const steps =
    edges.length > 0 &&
    edges.every(
      (edge, k) =>
        edge.hold !== null &&
        near(values, holdRow(k), at(k), components) &&
        (edge.lead === null || near(values, leadRow(k), at(k), components)),
    );
  const flags = new Uint8Array(steps ? 0 : edges.length);
  let keys = count;
  for (let k = 0; k < flags.length && k + 1 < count; k++) {
    const edge = edges[k];
    if (!edge) continue;
    let from = at(k);
    if (edge.lead !== null && jumps(values, at(k + 1), leadRow(k), at(k), components)) {
      flags[k] = LEAD_KEY;
      from = leadRow(k);
      keys++;
    }
    if (edge.hold !== null && jumps(values, from, holdRow(k), at(k + 1), components)) {
      flags[k] = (flags[k] ?? 0) | HOLD_KEY;
      keys++;
    }
  }
  const eachKey = (visit: (base: number, time: number) => void) => {
    for (let k = 0; k < count; k++) {
      visit(at(k), times[k] ?? 0);
      const flag = flags[k] ?? 0;
      const edge = edges[k];
      if (!edge) continue;
      if (flag & LEAD_KEY && edge.lead !== null) visit(leadRow(k), edge.lead);
      if (flag & HOLD_KEY && edge.hold !== null) visit(holdRow(k), edge.hold);
    }
  };
  const first = at(0);
  let constant = true;
  eachKey((base) => {
    for (let c = 0; c < components && constant; c++) {
      constant = Math.fround(values[base + c] ?? 0) === Math.fround(values[first + c] ?? 0);
    }
  });
  if (constant) {
    if (components > room) return null;
    const value = Float32Array.from({ length: components }, (_, c) => values[first + c] ?? 0);
    return { node, property, interpolation: "linear", times: zero, values: value };
  }
  if (keys * components + (keys === count ? 0 : keys) > room) return null;
  const keyTimes = keys === count ? times : new Float32Array(keys);
  const stored = new Float32Array(keys * components);
  let key = 0;
  eachKey((base, time) => {
    if (keyTimes !== times) keyTimes[key] = time;
    for (let c = 0; c < components; c++) stored[key * components + c] = values[base + c] ?? 0;
    key++;
  });
  return { node, property, interpolation: steps ? "step" : "linear", times: keyTimes, values: stored };
}

/**
 * The tracks of the sampled nodes that move from rest and of the sampled morph weights, then one-key tracks for the
 * bones that the saved pose of an armature the clip animates moves and that the clip does not sample, and the values
 * they keep: their values and times, each array of times once. Null once those pass `room`.
 */
function clipTracks(
  samples: Samples,
  edges: readonly EdgeTimes[],
  times: Float32Array,
  clipScene: ClipScene,
  armatures: readonly ObjectRecord[],
  sheared: Sheared,
  room: number,
): { tracks: Track[]; kept: number } | null {
  const { restTrs, saved } = clipScene;
  const zero = Float32Array.of(0);
  const tracks: Track[] = [];
  const keptTimes = new Set<Float32Array>();
  let kept = 0;
  const keep = (track: Track | null): boolean => {
    if (!track) return false;
    tracks.push(track);
    kept += track.values.length;
    if (!keptTimes.has(track.times)) {
      keptTimes.add(track.times);
      kept += track.times.length;
    }
    return kept <= room;
  };
  const sampledNodes = new Set<number>();
  for (const { node, offset } of samples.layout.nodes) {
    sampledNodes.add(node);
    const rest = restTrs[node];
    if (rest && resting(samples, edges, offset, rest)) continue;
    for (const [property, at, components] of [
      ["translation", 0, 3],
      ["rotation", 3, 4],
      ["scale", 7, 3],
    ] as const) {
      const made = sampledTrack(node, property, times, edges, samples, offset + at, components, zero, room - kept);
      if (!keep(made)) return null;
    }
  }
  for (const record of armatures) {
    const pose = saved.get(record);
    for (const [node, trs] of pose?.moved ?? []) {
      if (sampledNodes.has(node)) continue;
      const name = pose?.sheared.get(node);
      if (name !== undefined) sheared.bones.add(name);
      for (const property of TRANSFORM_PROPERTIES) {
        const values = Float32Array.from(trs[property]);
        if (!keep({ node, property, interpolation: "linear", times: zero, values, held: true })) return null;
      }
    }
  }
  for (const { mesh, offset, components } of samples.layout.meshes) {
    if (components === 0) continue;
    if (!keep(sampledTrack(mesh.node, "weights", times, edges, samples, offset, components, zero, room - kept))) {
      return null;
    }
  }
  return { tracks: tracks.sort((a, b) => a.node - b.node), kept };
}

/** The detail of a clip's warning about what shears, naming the bones and objects. */
function shearDetail({ bones, objects }: Sheared): string {
  const parts: string[] = [];
  if (bones.size > 0) {
    parts.push(`These bones shear under their parents' scale, which the preview drops: ${[...bones].join(", ")}`);
  }
  if (objects.size > 0) {
    const names = [...objects].join(", ");
    parts.push(`These objects shear under the scale they were parented with, which the preview drops: ${names}`);
  }
  return parts.join("; ");
}

type Warn = (code: BlendWarning["code"], message: string, detail: string) => void;

/** Warnings for what a clip plays other than Blender does. */
function approximationWarnings(plan: ClipPlan, curves: readonly FCurve[], warn: Warn): void {
  const keysRotationModes = plan.actions.some((action) =>
    action.slots.some((slot) => slot.curves.some(keysRotationMode)),
  );
  if (plan.channels.objects.size > 0 && keysRotationModes) {
    const detail = "Keys on rotation mode are left out; each object and bone keeps the mode it was saved with";
    warn("deform-approximated", "Rotation mode changes not followed", detail);
  }
  const unsupported = new Set(curves.flatMap((curve) => curve.unsupportedModifiers));
  if (unsupported.size > 0) {
    warn("curve-modifier-not-applied", "Curve modifiers not applied", [...unsupported].join(", "));
  }
  const layered = plan.actions.filter((action) => action.layers > 1);
  const [only] = layered;
  if (only) {
    const detail =
      plan.actions.length === 1
        ? `The action has ${only.layers} layers`
        : `These actions have more than one layer: ${layered.map((action) => action.name).join(", ")}`;
    warn("action-layer-not-played", "Only the first layer played", detail);
  }
  if (plan.players.some((player) => player.blends)) {
    const detail = "The preview plays each NLA strip and action in full over what plays under it";
    warn("deform-approximated", "NLA blending not followed", detail);
  }
}

/** When a clip samples. */
interface ClipTiming {
  points: SamplePoint[];
  times: Float32Array;
  edges: EdgeTimes[];
  duration: number;
}

/**
 * When a clip samples its sources: one time per frame, the times between where a curve or a use jumps, and the edge
 * times around jumps. Null, with a warning, for a clip longer than `MAX_FRAMES`.
 */
function clipTiming(plan: ClipPlan, sources: readonly Source[], fps: number, warn: Warn): ClipTiming | null {
  const { players, origin, end, rate } = plan;
  const span = (end - origin) / rate;
  const whole = Math.floor(span + 1e-6);
  if (whole > MAX_FRAMES) {
    warn("clip-not-sampled", "Clip not sampled", `It spans ${whole} frames, more than ${MAX_FRAMES}`);
    return null;
  }
  const direct = (source: Source) => players[source.player]?.direct ?? false;
  const directCurves = [...new Set(sources.filter(direct).map((source) => source.curve))];
  const nlaCurves = [...new Set(sources.filter((source) => !direct(source)).map((source) => source.curve))];
  const found = new Set<number>();
  let breaksEverywhere = false;
  for (const breaksOf of new Set(players.map((player) => player.breaks))) {
    if (found.size > MAX_FRAMES) break;
    const times = breaksOf(origin, end, MAX_FRAMES);
    if (times) for (const time of times) found.add(time);
    else breaksEverywhere = true;
  }
  const breaks = [...found];
  const { points, late, dropped } = samplePoints(plan, span, whole, directCurves, breaks);
  if (dropped) {
    const detail = `Sampling them would take more than ${MAX_FRAMES} frames, so the preview samples whole frames`;
    warn("deform-approximated", "Jumps between frames not shown", detail);
  }
  const times = Float32Array.from(points, (point) => snapTime(point.frame / fps, fps));
  const duration = snapTime(span / fps, fps);
  const anywhere = (jumpsWithin: (curve: FCurve, start: number, end: number) => boolean) =>
    breaksEverywhere ||
    directCurves.some((curve) => jumpsWithin(curve, origin, end)) ||
    nlaCurves.some((curve) => jumpsWithin(curve, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY));
  const nearBreaks = segmentsNear(points, breaks, plan);
  const edges = edgeTimes(times, fps, late || anywhere(canJumpAfter), anywhere(canJump), nearBreaks);
  return { points, times, edges, duration };
}

/** A channel's sources in order, in runs: those whose players share a lane, and so never play at once, together. */
function sourceRuns(
  sources: readonly Source[],
  players: readonly Player[],
): { lane: Lane | null; sources: Source[] }[] {
  const runs: { lane: Lane | null; sources: Source[] }[] = [];
  for (const source of sources) {
    const lane = players[source.player]?.lane ?? null;
    const last = runs[runs.length - 1];
    if (lane && last?.lane === lane) last.sources.push(source);
    else runs.push({ lane, sources: [source] });
  }
  return runs;
}

/**
 * The key times of each of `channels` in seconds from the clip's start: where each of its sources has a key while no
 * source before it plays, each time once. Null when there are more than `limit` of them together.
 */
function channelKeyTimes(
  plan: ClipPlan,
  channels: readonly Channel[],
  duration: number,
  fps: number,
  limit: number,
): Float32Array[] | null {
  const { players, origin, end, rate } = plan;
  const tolerance = 0.25 / fps;
  const clip: Span = [Math.min(origin, end) - rate, Math.max(origin, end) + rate];
  const all: Float32Array[] = [];
  let left = limit;
  for (const channel of channels) {
    let times: number[] = [];
    let covered: Span[] = [];
    for (const run of sourceRuns(channel.sources, players)) {
      const played: Span[] = [];
      for (const { curve, player: index } of run.sources) {
        const player = players[index];
        if (!player) continue;
        for (const span of player.spans) played.push(span);
        const within = withoutSpans(clampSpans(player.spans, clip), covered);
        if (within.length === 0) continue;
        for (const clock of player.timesOf(keyFrames(curve), within, left - times.length + 1)) {
          const time = snapTime((clock - origin) / rate / fps, fps);
          if (time >= -tolerance && time <= duration + tolerance) times.push(time);
        }
        if (times.length > left) return null;
      }
      covered = joinSpans(covered, played);
    }
    if (channel.sources.length > 1) {
      times = times.sort((a, b) => a - b).filter((time, index, sorted) => index === 0 || time !== sorted[index - 1]);
    }
    if (times.length === 0) continue;
    all.push(Float32Array.from(times));
    left -= times.length;
  }
  return all;
}

/** A source ready to evaluate: its player's place among the clip's players, and its curve's value at a frame. */
interface Evaluated {
  player: number;
  valueAt: (frame: number) => number;
}

/** A run of a channel's sources ready to evaluate: the lone source, or the one its lane plays at a time. */
interface EvaluatedRun {
  lane: Lane | null;
  first: Evaluated | undefined;
  byPlayer: Map<Player, Evaluated>;
}

/**
 * Writes the values of `channels` at a clock time into an array: each from the first of its sources whose use plays
 * then, or else its fallback. A run of sources on one NLA track asks the track once which of them plays.
 */
function channelEvaluator(
  channels: readonly Channel[],
  players: readonly Player[],
): (clock: number, values: Float64Array) => void {
  const evaluators = new Map<FCurve, (frame: number) => number>();
  const evaluator = (curve: FCurve) => {
    let valueAt = evaluators.get(curve);
    if (!valueAt) {
      valueAt = curveEvaluator(curve);
      evaluators.set(curve, valueAt);
    }
    return valueAt;
  };
  const compiled = channels.map((channel) => ({
    fallback: channel.fallback,
    runs: sourceRuns(channel.sources, players).map(({ lane, sources }): EvaluatedRun => {
      const evaluated = sources.map(({ curve, player }) => ({ player, valueAt: evaluator(curve) }));
      const byPlayer = new Map<Player, Evaluated>();
      for (const source of evaluated) {
        const player = players[source.player];
        if (player) byPlayer.set(player, source);
      }
      return { lane, first: evaluated[0], byPlayer };
    }),
  }));
  const playerFrames = new Float64Array(players.length);
  const askedAt = new Uint32Array(players.length);
  let asking = 0;
  const frameOf = (player: number, clock: number) => {
    if (askedAt[player] !== asking) {
      askedAt[player] = asking;
      playerFrames[player] = players[player]?.frameAt(clock) ?? Number.NaN;
    }
    return playerFrames[player] ?? Number.NaN;
  };
  return (clock, values) => {
    asking = (asking % 0xffffffff) + 1;
    for (let index = 0; index < compiled.length; index++) {
      const channel = compiled[index];
      if (!channel) continue;
      let value = channel.fallback;
      for (const { lane, first, byPlayer } of channel.runs) {
        const playing = lane?.playing(clock);
        const source = lane ? (playing ? byPlayer.get(playing) : undefined) : first;
        const frame = source ? frameOf(source.player, clock) : Number.NaN;
        if (source && !Number.isNaN(frame)) {
          value = source.valueAt(frame);
          break;
        }
      }
      values[index] = value;
    }
  };
}

/**
 * Samples a clip, one key per frame, with keys on either side of the jumps of stepped and cycled curves and of NLA
 * strips. Bones start from the pose Blender shows at the scene's start frame, and a clip that animates an armature
 * shows that pose on the bones it does not key, as Blender does with only that clip's uses playing. Null, with a
 * warning, for a clip whose samples would pass the clip limit or what the file's clips have left to sample, or whose
 * tracks and key times would pass what they have left to keep.
 */
function buildClip(plan: ClipPlan, clipScene: ClipScene): ParsedClip | null {
  const { scene, warnings } = clipScene;
  const warn: Warn = (code, message, detail) =>
    warnings.push({ code, subject: { kind: "clip", name: plan.name }, message: `${message}: ${plan.name}`, detail });
  const keysVisibility = plan.played.some(
    ({ slot, target }) => target.kind === "object" && slot.curves.some(keysHideViewport),
  );
  if (keysVisibility) {
    const detail = "Keys on Disable in Viewports are left out; each object stays as the file saves it";
    warn("deform-approximated", "Visibility changes not shown", detail);
  }
  const { objects, meshes } = plan.channels;
  if (objects.size === 0 && meshes.size === 0) return null;
  const channels = [...[...objects.values()], ...[...meshes.values()]].flatMap((owned) => [...owned.values()]);
  const sources = channels.flatMap((channel) => channel.sources);
  approximationWarnings(plan, [...new Set(sources.map((source) => source.curve))], warn);
  const fps = scene.fps;
  const timing = clipTiming(plan, sources, fps, warn);
  if (!timing) return null;
  const { points, times, edges } = timing;
  const { clipLimit, left } = clipScene;
  const curveTimes = channelKeyTimes(plan, channels, timing.duration, fps, left.kept);
  if (!curveTimes) {
    warn(
      "clip-not-sampled",
      "Clip not sampled",
      `Its keys take more than the ${left.kept} values left for this file's clips`,
    );
    return null;
  }

  const slots = new Map(channels.map((channel, index) => [channel, index]));
  const bindings = [...objects].map(([record, owned]) => bind(record, owned.values(), slots));
  const keyTargets: KeyTarget[] = [...meshes].map(([mesh, owned]) => ({
    mesh,
    settings: [...owned.values()].map((channel) => ({
      path: channel.path,
      index: channel.index,
      slot: slots.get(channel) ?? -1,
    })),
  }));
  const { layout, sample } = sampler(bindings, keyTargets, clipScene);
  const count = points.length;
  const rows = edges.reduce(
    (total, edge) => total + (edge.lead === null ? 0 : 1) + (edge.hold === null ? 0 : 1),
    count,
  );
  const needed = rows * layout.size;
  if (needed > clipLimit || needed > left.sampled) {
    const detail =
      needed > clipLimit
        ? `Sampling it takes ${needed} values, more than ${clipLimit}`
        : `Sampling it takes ${needed} values, more than the ${left.sampled} left for this file's clips`;
    warn("clip-not-sampled", "Clip not sampled", detail);
    return null;
  }
  left.sampled -= needed;

  const evaluate = channelEvaluator(channels, plan.players);
  const size = layout.size;
  const samples: Samples = {
    layout,
    count,
    values: sampleBuffer(clipScene, needed),
    after: new Int32Array(edges.length).fill(-1),
    before: new Int32Array(edges.length).fill(-1),
  };
  const frameValues = new Float64Array(channels.length);
  const edgeValues = new Float64Array(channels.length);
  const sheared: Sheared = { bones: new Set(), objects: new Set() };
  let nextRow = count;
  const edgeRow = (time: number | null, k: number): number => {
    if (time === null) return -1;
    evaluate(plan.origin + time * fps * plan.rate, edgeValues);
    if (edgeValues.every((value, index) => value === frameValues[index])) return k;
    const row = nextRow++;
    sample(edgeValues, samples.values, row * size, sheared);
    return row;
  };
  points.forEach((point, k) => {
    evaluate(point.clock, frameValues);
    sample(frameValues, samples.values, k * size, sheared);
    const edge = edges[k];
    if (!edge) return;
    samples.after[k] = edgeRow(edge.lead, k);
    samples.before[k] = edgeRow(edge.hold, k);
  });
  const armatures = bindings.flatMap(({ record }) => (record.armature ? [record] : []));
  const keys = curveTimes.reduce((total, array) => total + array.length, 0);
  const made = clipTracks(samples, edges, times, clipScene, armatures, sheared, left.kept - keys);
  if (!made) {
    warn(
      "clip-not-sampled",
      "Clip not sampled",
      `It keeps more than the ${left.kept} values left for this file's clips`,
    );
    return null;
  }
  const { tracks } = made;
  left.kept -= keys + made.kept;
  if (sheared.bones.size > 0 || sheared.objects.size > 0) {
    warn("deform-approximated", "Shear not shown", shearDetail(sheared));
  }
  return { name: plan.name, duration: timing.duration, curveTimes, tracks, fileFrames: plan.fileFrames };
}

/**
 * The clips of the actions that animate the scene, then, where the scene plays more than one action, a clip named
 * after the scene that plays them together over its frame range. A clip that would pass `limits` is left out with a
 * warning, as is an action that nothing plays and that `assignTargets` places nowhere. It also warns about the
 * constraints Blender evaluates where the scene's animation or one of these clips plays, which the preview does not.
 */
export function buildClips(
  scene: BuiltScene,
  actions: readonly Action[],
  warnings: BlendWarning[],
  limits: Partial<ClipLimits> = {},
): ParsedClip[] {
  const { assigned, lost } = assignTargets(actions, scene);
  const restTrs = scene.nodes.map((node) => decompose(toSceneAxes(node.rest, scene.unitScale)));
  const saved = new Map<ObjectRecord, SavedPose>();
  for (const record of scene.objects) {
    if (record.armature) {
      saved.set(record, savedPose(record.armature, inRestPosition(record), restTrs, scene.unitScale));
    }
  }
  const { clip: clipLimit, sampled, kept } = { ...CLIP_LIMITS, ...limits };
  const clipScene: ClipScene = {
    scene,
    restTrs,
    saved,
    warnings,
    clipLimit,
    left: { sampled, kept },
    buffer: new Float64Array(0),
  };
  const clips: ParsedClip[] = [];
  const clipped: Assignment[][] = [];
  for (const action of actions) {
    const assignments = assigned.get(action);
    const clip = assignments ? buildClip(actionPlan(action, assignments, scene), clipScene) : null;
    if (clip) clips.push(clip);
    if (clip && assignments) clipped.push(assignments);
    if (lost.has(action)) {
      warnings.push({
        code: "clip-not-sampled",
        subject: { kind: "clip", name: action.name },
        message: `Clip not shown: ${action.name}`,
        detail: "Nothing in the scene plays this action, and its curves do not say which object they move",
      });
    }
  }
  for (const warning of constraintWarnings(scene.objects, playedPaths(scene, actions, clipped))) warnings.push(warning);
  const together = scenePlan(scene, actions, warnings);
  const clip = together ? buildClip(together, clipScene) : null;
  if (clip) clips.push(clip);
  return clips;
}

/** Warnings for drivers that move what the scene shows: object and bone transforms and shape key values. */
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
    if (!key || mesh.shapeKeyLock) continue;
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
