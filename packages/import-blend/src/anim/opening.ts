import type { BlendStruct } from "../blend/file";
import type { ObjectValues, TransformValues } from "../scene/transforms";
import { cloneValues, isTransformProperty, setTransformProperty } from "../scene/transforms";
import type { Action } from "./actions";
import { parsePosePath, parseShapeKeyPath } from "./actions";
import type { AnimatedValue } from "./nla";
import { animatedValues } from "./nla";
import { sceneTimeline } from "./timeline";

/** An object's transforms and, for an armature, its bones' channels at the scene's start frame. */
export interface StartPose {
  object(values: ObjectValues): ObjectValues;
  channel(bone: string, values: TransformValues): TransformValues;
}

/**
 * The scene as Blender shows it at its start frame, which Arcue takes as its rest so that the rest does not depend on
 * the frame the file was saved at. There Blender plays each ID's active action and NLA strips and writes the result
 * over the values the file saves, which hold what it played at the saved frame. A value keeps what the file saves
 * where `animatedValues` leaves it out: where a driver sets it, a Noise or other modifier Arcue does not apply changes
 * it, or a meta or transition strip or an action linked from another file plays.
 */
export interface StartPoses {
  of(object: BlendStruct): StartPose;
  /** The shape key weights the key's animation plays, by key name. */
  weights(key: BlendStruct): Map<string, number>;
}

/** The scene's start frame through its time remapping, as Blender evaluates it after going to that frame. */
export function startFrame(scene: BlendStruct | null): number {
  const { start, frameLength } = sceneTimeline(scene);
  return start * frameLength;
}

const UNCHANGED: StartPose = { object: (values) => values, channel: (_, values) => values };

function applied<Values extends TransformValues>(values: Values, played: readonly AnimatedValue[] | undefined): Values {
  if (!played) return values;
  const result = cloneValues(values);
  for (const { path, index, value } of played) setTransformProperty(result, path, index, value);
  return result;
}

function poseOf(written: readonly AnimatedValue[]): StartPose {
  if (written.length === 0) return UNCHANGED;
  const own: AnimatedValue[] = [];
  const bones = new Map<string, AnimatedValue[]>();
  for (const played of written) {
    const pose = parsePosePath(played.path);
    if (pose && isTransformProperty(pose.property, false)) {
      const channel = bones.get(pose.bone);
      if (channel) channel.push({ ...played, path: pose.property });
      else bones.set(pose.bone, [{ ...played, path: pose.property }]);
    } else if (!pose && isTransformProperty(played.path, true)) {
      own.push(played);
    }
  }
  return {
    object: (values) => applied(values, own.length > 0 ? own : undefined),
    channel: (bone, values) => applied(values, bones.get(bone)),
  };
}

function weightsOf(written: readonly AnimatedValue[]): Map<string, number> {
  const weights = new Map<string, number>();
  for (const { path, value } of written) {
    const name = parseShapeKeyPath(path);
    if (name !== null) weights.set(name, value);
  }
  return weights;
}

/** The scene's start poses, from the actions `readActions` read. */
export function startPoses(scene: BlendStruct | null, actions: readonly Action[]): StartPoses {
  const frame = startFrame(scene);
  const byOffset = new Map(actions.map((action) => [action.struct.offset, action]));
  return {
    of: (object) => poseOf(animatedValues(object, frame, byOffset)),
    weights: (key) => weightsOf(animatedValues(key, frame, byOffset)),
  };
}
