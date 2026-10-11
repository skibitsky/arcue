import type { BlendStruct } from "../blend/file";
import type { Mat4, RotationMode } from "../math";
import { compose, quatMultiply, rotationMode, rotationQuat } from "../math";

/** A transform as Blender's properties hold it, in every rotation mode at once. */
export interface TransformValues {
  location: number[];
  rotationMode: RotationMode;
  euler: number[];
  /** w, x, y, z. */
  quaternion: number[];
  /** angle, x, y, z, in the order of the `rotation_axis_angle` property. */
  axisAngle: number[];
  scale: number[];
}

export interface ObjectValues extends TransformValues {
  deltaLocation: number[];
  deltaEuler: number[];
  deltaQuaternion: number[];
  deltaAxisAngle: number[];
  deltaScale: number[];
}

function three(values: number[], fallback: number): number[] {
  return [values[0] ?? fallback, values[1] ?? fallback, values[2] ?? fallback];
}

function quaternionOf(values: number[]): number[] {
  return values.length === 4 ? [...values] : [1, 0, 0, 0];
}

/** The rest values of a pose channel: no offset from the bone's rest pose. */
export function restChannel(): TransformValues {
  return {
    location: [0, 0, 0],
    rotationMode: "quaternion",
    euler: [0, 0, 0],
    quaternion: [1, 0, 0, 0],
    axisAngle: [0, 0, 1, 0],
    scale: [1, 1, 1],
  };
}

export function channelValues(channel: BlendStruct): TransformValues {
  const axis = three(channel.numbers("rotAxis"), 0);
  return {
    location: three(channel.numbers("loc"), 0),
    rotationMode: rotationMode(channel.number("rotmode")),
    euler: three(channel.numbers("eul"), 0),
    quaternion: quaternionOf(channel.numbers("quat")),
    axisAngle: [channel.number("rotAngle"), ...axis],
    scale: three(channel.numbers("size"), 1),
  };
}

export function objectValues(object: BlendStruct): ObjectValues {
  const deltaScale = object.has("dscale") ? three(object.numbers("dscale"), 1) : [1, 1, 1];
  return {
    location: three(object.numbers("loc"), 0),
    rotationMode: rotationMode(object.number("rotmode")),
    euler: three(object.numbers("rot"), 0),
    quaternion: quaternionOf(object.numbers("quat")),
    axisAngle: [object.number("rotAngle"), ...three(object.numbers("rotAxis"), 0)],
    scale: three(object.numbers("size"), 1),
    deltaLocation: three(object.numbers("dloc"), 0),
    deltaEuler: three(object.numbers("drot"), 0),
    deltaQuaternion: quaternionOf(object.numbers("dquat")),
    deltaAxisAngle: [object.number("drotAngle"), ...three(object.numbers("drotAxis"), 0)],
    deltaScale,
  };
}

export function cloneValues<Values extends TransformValues>(values: Values): Values {
  const copy = { ...values };
  for (const [key, value] of Object.entries(values)) {
    if (Array.isArray(value)) (copy as Record<string, unknown>)[key] = [...value];
  }
  return copy;
}

function rotationOf(mode: RotationMode, euler: number[], quaternion: number[], axisAngle: number[]) {
  return rotationQuat(mode, {
    euler,
    quaternion,
    axis: axisAngle.slice(1),
    angle: axisAngle[0] ?? 0,
  });
}

/** Blender's `BKE_pchan_to_mat4`: location, then rotation, then scale. A connected bone ignores its location. */
export function channelMatrix(values: TransformValues, connected: boolean): Mat4 {
  const location = connected ? [0, 0, 0] : values.location;
  return compose({
    translation: [location[0] ?? 0, location[1] ?? 0, location[2] ?? 0],
    rotation: rotationOf(values.rotationMode, values.euler, values.quaternion, values.axisAngle),
    scale: [values.scale[0] ?? 1, values.scale[1] ?? 1, values.scale[2] ?? 1],
  });
}

/** Blender's `BKE_object_to_mat4`: the object's own transform with its delta transform applied. */
export function objectBasis(values: ObjectValues): Mat4 {
  const rotation = quatMultiply(
    rotationOf(values.rotationMode, values.deltaEuler, values.deltaQuaternion, values.deltaAxisAngle),
    rotationOf(values.rotationMode, values.euler, values.quaternion, values.axisAngle),
  );
  return compose({
    translation: [
      (values.location[0] ?? 0) + (values.deltaLocation[0] ?? 0),
      (values.location[1] ?? 0) + (values.deltaLocation[1] ?? 0),
      (values.location[2] ?? 0) + (values.deltaLocation[2] ?? 0),
    ],
    rotation,
    scale: [
      (values.scale[0] ?? 1) * (values.deltaScale[0] ?? 1),
      (values.scale[1] ?? 1) * (values.deltaScale[1] ?? 1),
      (values.scale[2] ?? 1) * (values.deltaScale[2] ?? 1),
    ],
  });
}

const TRANSFORM_PROPERTIES: Readonly<Record<string, keyof TransformValues>> = {
  location: "location",
  rotation_euler: "euler",
  rotation_quaternion: "quaternion",
  rotation_axis_angle: "axisAngle",
  scale: "scale",
};

const DELTA_PROPERTIES: Readonly<Record<string, keyof ObjectValues>> = {
  delta_location: "deltaLocation",
  delta_rotation_euler: "deltaEuler",
  delta_rotation_quaternion: "deltaQuaternion",
  delta_scale: "deltaScale",
};

/** Whether a property path names a transform property that animation can set, such as "rotation_euler". */
export function isTransformProperty(property: string, object: boolean): boolean {
  return property in TRANSFORM_PROPERTIES || (object && property in DELTA_PROPERTIES);
}

/** Sets one component of a transform property; returns false for a property or index it does not have. */
export function setTransformProperty(values: TransformValues, property: string, index: number, value: number): boolean {
  const key = TRANSFORM_PROPERTIES[property] ?? DELTA_PROPERTIES[property];
  if (!key || !(key in values)) return false;
  const target = (values as unknown as Record<string, unknown>)[key];
  if (!Array.isArray(target) || index < 0 || index >= target.length) return false;
  target[index] = value;
  return true;
}
