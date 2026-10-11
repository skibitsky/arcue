import type { BlendFile, BlendStruct } from "../blend/file";
import { isLinked } from "../blend/ids";
import type { ObjectValues, TransformValues } from "../scene/transforms";
import { cloneValues, isTransformProperty, setTransformProperty } from "../scene/transforms";
import type { Action } from "./actions";
import { parsePosePath, parseShapeKeyPath, readAction, slotFor } from "./actions";
import type { FCurve } from "./fcurve";
import { evaluateFCurve, keyFrames, readFCurve } from "./fcurve";

/**
 * The transforms Blender shows when it opens the file: it plays each object's active action at the scene's current
 * frame and writes the result over the values the file saves, so an unkeyed change to a keyed value is lost.
 */
export interface OpeningPose {
  object(values: ObjectValues): ObjectValues;
  channel(bone: string, values: TransformValues): TransformValues;
}

const ADT_NLA_SOLO_TRACK = 1 << 0;
const ADT_NLA_EVAL_OFF = 1 << 1;
const ADT_NLA_EDIT_ON = 1 << 2;
const NLATRACK_MUTED = 1 << 2;
const NLA_BLEND_REPLACE = 0;
const NLA_EXTEND_HOLD = 0;
const NLA_EXTEND_HOLD_FORWARD = 1;
const LIMIT_X_MIN = 1 << 0;
const LIMIT_X_MAX = 1 << 1;

/** Blender's `BKE_scene_ctime_get`: the current frame with its subframe, through the scene's time remapping. */
function currentFrame(scene: BlendStruct | null): number {
  const render = scene?.struct("r");
  if (!render) return 1;
  const length = render.number("framelen");
  return (render.number("cfra") + render.number("subframe")) * (length > 0 ? length : 1);
}

/** Active actions already read from each file, by struct offset, as many objects can play one action. */
const activeActions = new WeakMap<BlendFile, Map<number, Action>>();

function activeAction(action: BlendStruct): Action {
  let read = activeActions.get(action.file);
  if (!read) {
    read = new Map();
    activeActions.set(action.file, read);
  }
  const known = read.get(action.offset) ?? readAction(action);
  read.set(action.offset, known);
  return known;
}

/**
 * Blender's `BKE_action_frame_range_calc` with modifiers, which bounds the active action when NLA strips play under
 * it: the frames its keys span, widened by the last modifier of each curve, and at least one frame long.
 */
function keyedRange(action: Action): [number, number] {
  let start = Number.POSITIVE_INFINITY;
  let end = Number.NEGATIVE_INFINITY;
  let found = false;
  for (const curve of action.slots.flatMap((slot) => slot.curves)) {
    const frames = keyFrames(curve);
    if (frames.length > 0) {
      start = Math.min(start, frames[0] ?? start);
      end = Math.max(end, frames[frames.length - 1] ?? end);
      found = true;
    }
    const last = curve.modifiers[curve.modifiers.length - 1];
    if (!last && curve.unsupportedModifiers.length === 0) continue;
    found = true;
    if (last?.type === "cycles") {
      if (last.before !== 0) start = Number.NEGATIVE_INFINITY;
      if (last.after !== 0) end = Number.POSITIVE_INFINITY;
    } else if (last?.type === "limits") {
      if ((last.flag & LIMIT_X_MIN) !== 0) start = Math.min(start, last.rect[0]);
      if ((last.flag & LIMIT_X_MAX) !== 0) end = Math.max(end, last.rect[1]);
    } else {
      return [Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY];
    }
  }
  if (!found) return [0, 1];
  return [start, start === end ? end + 1 : end];
}

/**
 * Whether Blender plays the active action at `frame` over the NLA strips under it: only alone, replacing what they
 * give, and within the frames its extrapolation reaches.
 */
function playsOverStrips(adt: BlendStruct, action: Action, frame: number): boolean {
  if (adt.number("act_blendmode") !== NLA_BLEND_REPLACE || adt.number("act_influence") < 1) return false;
  const extend = adt.number("act_extendmode");
  if (extend === NLA_EXTEND_HOLD) return true;
  const [start, end] = keyedRange(action);
  return frame >= start && (extend === NLA_EXTEND_HOLD_FORWARD || frame <= end);
}

/**
 * The curves of an ID's active action that Blender writes over its saved values at `frame`. None in NLA tweak mode or
 * while an NLA track plays solo, and none where NLA strips play under the action unless it replaces them there. Never
 * a curve that a driver, a modifier Arcue does not apply or a mute overrides.
 */
function activeCurves(id: BlendStruct, frame: number): FCurve[] {
  const adt = id.deref("adt");
  const struct = adt?.deref("action");
  if (!adt || !struct || isLinked(struct)) return [];
  const flag = adt.number("flag");
  if ((flag & ADT_NLA_EDIT_ON) !== 0) return [];
  const action = activeAction(struct);
  const tracks = adt.list("nla_tracks");
  if (tracks.length > 0 && (flag & ADT_NLA_EVAL_OFF) === 0) {
    if ((flag & ADT_NLA_SOLO_TRACK) !== 0) return [];
    const strips =
      adt.deref("actstrip") !== null ||
      tracks.some((track) => (track.number("flag") & NLATRACK_MUTED) === 0 && track.list("strips").length > 0);
    if (strips && !playsOverStrips(adt, action, frame)) return [];
  }
  const slot = slotFor(action, adt.has("slot_handle") ? adt.number("slot_handle") : -1);
  const driven = new Set(
    adt
      .list("drivers")
      .map(readFCurve)
      .filter((driver) => !driver.muted)
      .map((driver) => `${driver.path}[${driver.index}]`),
  );
  return (slot?.curves ?? []).filter(
    (curve) =>
      !curve.muted &&
      !curve.empty &&
      curve.unsupportedModifiers.length === 0 &&
      !driven.has(`${curve.path}[${curve.index}]`),
  );
}

const UNCHANGED: OpeningPose = { object: (values) => values, channel: (_, values) => values };

interface PlayedValue {
  property: string;
  index: number;
  value: number;
}

function applied<Values extends TransformValues>(values: Values, played: readonly PlayedValue[] | undefined): Values {
  if (!played) return values;
  const result = cloneValues(values);
  for (const { property, index, value } of played) setTransformProperty(result, property, index, value);
  return result;
}

export function openingPose(object: BlendStruct, scene: BlendStruct | null): OpeningPose {
  const frame = currentFrame(scene);
  const curves = activeCurves(object, frame);
  if (curves.length === 0) return UNCHANGED;
  const own: PlayedValue[] = [];
  const bones = new Map<string, PlayedValue[]>();
  for (const curve of curves) {
    const played = { property: curve.path, index: curve.index, value: evaluateFCurve(curve, frame) };
    const pose = parsePosePath(curve.path);
    if (pose && isTransformProperty(pose.property, false)) {
      bones.set(pose.bone, [...(bones.get(pose.bone) ?? []), { ...played, property: pose.property }]);
    } else if (!pose && isTransformProperty(curve.path, true)) {
      own.push(played);
    }
  }
  return {
    object: (values) => applied(values, own.length > 0 ? own : undefined),
    channel: (bone, values) => applied(values, bones.get(bone)),
  };
}

/** The shape key weights Blender shows when it opens the file, by key name: those the key's active action plays. */
export function openingWeights(key: BlendStruct, scene: BlendStruct | null): Map<string, number> {
  const frame = currentFrame(scene);
  const weights = new Map<string, number>();
  for (const curve of activeCurves(key, frame)) {
    const name = parseShapeKeyPath(curve.path);
    if (name !== null && !weights.has(name)) weights.set(name, evaluateFCurve(curve, frame));
  }
  return weights;
}
