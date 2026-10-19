import type { BlendStruct } from "../blend/file.js";
import { idName } from "../blend/ids.js";
import type { Mat4 } from "../math.js";
import { axisLengths, determinant3, identity, invert, mat4From, multiply, transformPoint } from "../math.js";
import type { TransformValues } from "./transforms.js";
import { channelMatrix } from "./transforms.js";

export const BoneFlag = {
  connected: 1 << 4,
  hinge: 1 << 9,
  noDeform: 1 << 12,
  noScaleLegacy: 1 << 15,
  noLocalLocation: 1 << 22,
  relativeParenting: 1 << 23,
} as const;

export const InheritScale = {
  full: 0,
  fixShear: 1,
  average: 2,
  none: 3,
  noneLegacy: 4,
  aligned: 5,
} as const;

/** A bone's envelope at rest in armature space: its ends, their radii, and how far beyond them its influence fades. */
export interface Envelope {
  head: readonly number[];
  tail: readonly number[];
  headRadius: number;
  tailRadius: number;
  falloff: number;
  /** How strongly the envelope deforms a vertex it holds that is in no vertex group of a deform bone. */
  weight: number;
}

export interface Bone {
  name: string;
  /** Index of the parent bone, or -1. Parents come first. */
  parent: number;
  /** The rest matrix in armature space, `arm_mat`. */
  rest: Mat4;
  /** The rest matrix relative to the parent bone's, Blender's `offs_bone`; `rest` for a root bone. */
  offset: Mat4;
  length: number;
  flag: number;
  inheritScale: number;
  deform: boolean;
  /** B-Bone segments; more than one bends the bone's deformation along a curve. */
  segments: number;
  envelope: Envelope;
}

/** The armature's bone lists are damaged; the scene reads the rest of the file without its bones. */
export class ArmatureReadError extends Error {
  override readonly name = "ArmatureReadError";
}

/**
 * The armature's bones, each parent before its children, in the order Blender lists them. Throws `ArmatureReadError`
 * as soon as the lists reach a bone twice, so that lists sharing their tails queue each bone at most once.
 */
export function readBones(armature: BlendStruct): Bone[] {
  const bones: Bone[] = [];
  const reached = new Set<number>();
  const pending: { bone: BlendStruct; parent: number }[] = [];
  const queue = (list: readonly BlendStruct[], parent: number) => {
    for (const bone of list) {
      if (reached.has(bone.offset)) {
        throw new ArmatureReadError(`Armature ${idName(armature)} lists bone ${bone.string("name")} twice`);
      }
      reached.add(bone.offset);
    }
    for (let index = list.length - 1; index >= 0; index--) {
      const bone = list[index];
      if (bone) pending.push({ bone, parent });
    }
  };
  queue(armature.list("bonebase"), -1);
  for (let next = pending.pop(); next; next = pending.pop()) {
    const { bone, parent } = next;
    const flag = bone.number("flag");
    const index = bones.length;
    const rest = mat4From(bone.numbers("arm_mat"));
    const parentRest = bones[parent]?.rest;
    bones.push({
      name: bone.string("name"),
      parent,
      rest,
      offset: parentRest ? multiply(invert(parentRest), rest) : rest,
      length: bone.number("length"),
      flag,
      inheritScale: bone.has("inherit_scale_mode")
        ? bone.number("inherit_scale_mode")
        : (flag & BoneFlag.noScaleLegacy) !== 0
          ? InheritScale.noneLegacy
          : InheritScale.full,
      deform: (flag & BoneFlag.noDeform) === 0,
      segments: bone.number("segments"),
      envelope: {
        head: bone.numbers("arm_head"),
        tail: bone.numbers("arm_tail"),
        headRadius: bone.number("rad_head"),
        tailRadius: bone.number("rad_tail"),
        falloff: bone.number("dist"),
        weight: bone.number("weight"),
      },
    });
    queue(bone.list("childbase"), index);
  }
  return bones;
}

/**
 * Whether the bone takes its parent's full transform, so that its matrix relative to the parent's pose is
 * `offset × channel` whatever the parent does.
 */
export function inheritsFully(bone: Bone): boolean {
  return (bone.flag & (BoneFlag.hinge | BoneFlag.noLocalLocation)) === 0 && bone.inheritScale === InheritScale.full;
}

type Axis = [number, number, number];

function axis(m: Mat4, index: number): Axis {
  return [m[index * 4] ?? 0, m[index * 4 + 1] ?? 0, m[index * 4 + 2] ?? 0];
}

function setAxis(m: Mat4, index: number, value: Axis): void {
  m[index * 4] = value[0];
  m[index * 4 + 1] = value[1];
  m[index * 4 + 2] = value[2];
}

function dot(a: Axis, b: Axis): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: Axis, b: Axis): Axis {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function scaledAxis(a: Axis, factor: number): Axis {
  return [a[0] * factor, a[1] * factor, a[2] * factor];
}

function plus(a: Axis, b: Axis): Axis {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function unit(a: Axis): { axis: Axis; length: number } {
  const length = Math.hypot(a[0], a[1], a[2]);
  return { axis: length > 0 ? scaledAxis(a, 1 / length) : [0, 0, 0], length };
}

/**
 * Blender's `orthogonalize_m4_stable`: keeps the primary axis, makes the other two orthogonal to it and then to each
 * other, splitting the correction evenly between them so the result does not lean, and with `normalize` makes every
 * axis unit length; without it the axes keep their area and proportion.
 */
function orthogonalized(m: Mat4, primary: number, normalize: boolean): Mat4 {
  const out = Float64Array.from(m);
  const [i, j, k] = primary === 0 ? [0, 1, 2] : primary === 1 ? [1, 0, 2] : [2, 0, 1];
  let v1 = axis(m, i);
  let v2 = axis(m, j);
  let v3 = axis(m, k);
  const lengthSquared = dot(v1, v1);
  if (lengthSquared > 0) {
    v2 = plus(v2, scaledAxis(v1, -dot(v2, v1) / lengthSquared));
    v3 = plus(v3, scaledAxis(v1, -dot(v3, v1) / lengthSquared));
    if (normalize) v1 = scaledAxis(v1, 1 / Math.sqrt(lengthSquared));
  }
  const second = unit(v2);
  const third = unit(v3);
  let norm2 = second.axis;
  let norm3 = third.axis;
  const cosine = dot(norm2, norm3);
  const absolute = Math.abs(cosine);
  if (absolute > 1e-4 && absolute < 1 - 1.1920929e-7) {
    const angle = Math.acos(cosine);
    const target = angle + (Math.PI / 2 - angle) / 2;
    norm2 = plus(norm2, scaledAxis(norm3, -cosine));
    norm2 = scaledAxis(norm2, Math.sin(target) / Math.hypot(...norm2));
    norm2 = plus(norm2, scaledAxis(norm3, Math.cos(target)));
    norm3 = unit(cross(cross(norm2, norm3), norm2)).axis;
    if (!normalize) {
      const factor = Math.sqrt(Math.sin(angle));
      v2 = scaledAxis(norm2, second.length * factor);
      v3 = scaledAxis(norm3, third.length * factor);
    }
  }
  if (normalize) {
    v2 = norm2;
    v3 = norm3;
  }
  setAxis(out, i, v1);
  setAxis(out, j, v2);
  setAxis(out, k, v3);
  return out;
}

function normalizedAxes(m: Mat4): { matrix: Mat4; scale: [number, number, number] } {
  const scale = axisLengths(m);
  const matrix = Float64Array.from(m);
  for (let index = 0; index < 3; index++) {
    const length = scale[index] ?? 0;
    if (length === 0) continue;
    for (let row = 0; row < 3; row++) matrix[index * 4 + row] = (matrix[index * 4 + row] ?? 0) / length;
  }
  return { matrix, scale };
}

function rescaled(m: Mat4, scale: readonly number[]): Mat4 {
  const out = Float64Array.from(m);
  for (let index = 0; index < 3; index++) {
    for (let row = 0; row < 3; row++) out[index * 4 + row] = (out[index * 4 + row] ?? 0) * (scale[index] ?? 1);
  }
  return out;
}

/** Blender's `mat4_to_size_fix_shear`: axis scales corrected so their product is the matrix's volume scale. */
function sizeFixShear(m: Mat4): number[] {
  const size = axisLengths(m);
  const volume = size[0] * size[1] * size[2];
  if (volume === 0) return size;
  const factor = Math.cbrt(Math.abs(determinant3(m) / volume));
  return size.map((value) => value * factor);
}

/**
 * Blender's `BKE_bone_parent_transform_calc_from_matrices` and `BKE_bone_parent_transform_apply`: the bone's pose
 * matrix in armature space from its parent's pose matrix and its channel matrix, for every way a bone can inherit
 * rotation, scale and location.
 */
function poseMatrix(bone: Bone, offset: Mat4, parentRest: Mat4 | null, parentPose: Mat4 | null, channel: Mat4): Mat4 {
  let rotscale: Mat4;
  let location: Mat4;
  let postScale: number[] | null = null;
  if (parentPose && parentRest) {
    const useRotation = (bone.flag & BoneFlag.hinge) === 0;
    const mode = bone.inheritScale;
    const full = useRotation && mode === InheritScale.full;
    if (full) {
      rotscale = multiply(parentPose, offset);
    } else {
      let parent: Mat4;
      if (useRotation) {
        parent = Float64Array.from(parentPose);
        if (mode === InheritScale.none || mode === InheritScale.average) parent = orthogonalized(parent, 1, true);
        else if (mode === InheritScale.aligned) {
          const normalized = normalizedAxes(orthogonalized(parent, 1, false));
          parent = normalized.matrix;
          postScale = normalized.scale;
        } else if (mode === InheritScale.noneLegacy) parent = normalizedAxes(parent).matrix;
      } else {
        parent = Float64Array.from(parentRest);
        if (mode === InheritScale.full) parent = rescaled(parent, axisLengths(parentPose));
        else if (mode === InheritScale.fixShear) parent = rescaled(parent, sizeFixShear(parentPose));
        else if (mode === InheritScale.aligned) postScale = sizeFixShear(parentPose);
      }
      if (mode === InheritScale.average) {
        const factor = Math.cbrt(Math.abs(determinant3(parentPose)));
        parent = rescaled(parent, [factor, factor, factor]);
      }
      rotscale = multiply(parent, offset);
      if (mode === InheritScale.fixShear) rotscale = orthogonalized(rotscale, 1, false);
    }
    if ((bone.flag & BoneFlag.noLocalLocation) !== 0) {
      const origin = transformPoint(parentPose, offset[12] ?? 0, offset[13] ?? 0, offset[14] ?? 0);
      location = Float64Array.from(parentPose);
      location[12] = origin[0];
      location[13] = origin[1];
      location[14] = origin[2];
    } else if (!full) {
      location = multiply(parentPose, offset);
    } else {
      location = rotscale;
    }
  } else {
    rotscale = offset;
    if ((bone.flag & BoneFlag.noLocalLocation) !== 0) {
      location = identity();
      location[12] = offset[12] ?? 0;
      location[13] = offset[13] ?? 0;
      location[14] = offset[14] ?? 0;
    } else {
      location = rotscale;
    }
  }
  const out = multiply(rotscale, channel);
  const origin = transformPoint(location, channel[12] ?? 0, channel[13] ?? 0, channel[14] ?? 0);
  out[12] = origin[0];
  out[13] = origin[1];
  out[14] = origin[2];
  return postScale ? rescaled(out, postScale) : out;
}

/** Pose matrices in armature space for the given channel values, one per bone, without constraints. */
export function poseMatrices(bones: readonly Bone[], channels: readonly TransformValues[]): Mat4[] {
  const result: Mat4[] = [];
  bones.forEach((bone, index) => {
    const values = channels[index];
    const channel = values ? channelMatrix(values, (bone.flag & BoneFlag.connected) !== 0) : identity();
    const parent = bones[bone.parent];
    result.push(poseMatrix(bone, bone.offset, parent?.rest ?? null, result[bone.parent] ?? null, channel));
  });
  return result;
}
