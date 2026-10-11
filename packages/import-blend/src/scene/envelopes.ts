import type { BlendStruct } from "../blend/file";
import type { Mat4 } from "../math";
import { transformPoint } from "../math";
import type { Bone } from "./armature";
import type { MeshData } from "./mesh-data";
import type { ArmatureDeform } from "./objects";
import { ARMATURE_DEFORM_VERTEX_GROUPS } from "./objects";

const ARMATURE_DEFORM_ENVELOPE = 1 << 1;
const ARMATURE_DEFORM_INVERT_MASK = 1 << 4;
const BONE_MULTIPLY_ENVELOPE = 1 << 11;
/** Blender leaves a vertex in place when the weights that reach it add up to no more than this. */
const MIN_CONTRIBUTION = 1e-4;
const WEIGHT_TOLERANCE = 1e-4;

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

export interface EnvelopeUse {
  /** Whether the bones' envelopes move some vertex, which is in no vertex group of a deform bone. */
  enveloped: boolean;
  /** Deform bones whose envelopes change how the vertex group weights of some vertex blend. */
  multiplying: string[];
}

function readEnvelopes(armature: BlendStruct): Map<string, Envelope> {
  const envelopes = new Map<string, Envelope>();
  const seen = new Set<number>();
  const visit = (bone: BlendStruct) => {
    if (seen.has(bone.offset)) return;
    seen.add(bone.offset);
    envelopes.set(bone.string("name"), {
      head: bone.numbers("arm_head"),
      tail: bone.numbers("arm_tail"),
      headRadius: bone.number("rad_head"),
      tailRadius: bone.number("rad_tail"),
      falloff: bone.number("dist"),
      weight: bone.number("weight"),
    });
    for (const child of bone.list("childbase")) visit(child);
  };
  for (const root of armature.list("bonebase")) visit(root);
  return envelopes;
}

function squaredDistance(a: readonly number[], b: readonly number[]): number {
  return [0, 1, 2].reduce((sum, i) => sum + ((a[i] ?? 0) - (b[i] ?? 0)) ** 2, 0);
}

/** How much of a bone's weight its envelope keeps at a point in armature space, as Blender's `distfactor_to_bone`. */
export function envelopeFactor(point: readonly number[], envelope: Envelope): number {
  const { head, tail, headRadius, tailRadius, falloff } = envelope;
  const axis = [0, 1, 2].map((i) => (tail[i] ?? 0) - (head[i] ?? 0));
  const toPoint = [0, 1, 2].map((i) => (point[i] ?? 0) - (head[i] ?? 0));
  const length = Math.hypot(...axis);
  const along = length > 0 ? axis.reduce((sum, value, i) => sum + value * (toPoint[i] ?? 0), 0) / length : 0;
  let distanceSquared: number;
  let radius: number;
  if (along < 0) {
    distanceSquared = squaredDistance(point, head);
    radius = headRadius;
  } else if (along > length) {
    distanceSquared = squaredDistance(point, tail);
    radius = tailRadius;
  } else {
    distanceSquared = squaredDistance(point, head) - along * along;
    const share = length > 0 ? along / length : 0;
    radius = share * tailRadius + (1 - share) * headRadius;
  }
  if (distanceSquared < radius * radius) return 1;
  if (falloff === 0 || distanceSquared >= (radius + falloff) ** 2) return 0;
  const beyond = Math.sqrt(distanceSquared) - radius;
  return 1 - (beyond * beyond) / (falloff * falloff);
}

/**
 * How an armature's envelopes act on a mesh, as Blender's armature deform uses them. A vertex that the modifier's mask
 * group leaves out does not move. A vertex in no vertex group of a deform bone moves with the envelopes of the deform
 * bones that reach it, when envelopes are on. A bone that multiplies by its envelope scales its weight by how far inside
 * the envelope the vertex lies, which matters only where it changes the blend of the vertex's weights. `toArmature`
 * takes the mesh's coordinates into the armature object's.
 */
export function envelopeUse(
  data: MeshData,
  deform: ArmatureDeform,
  bones: readonly Bone[],
  armature: BlendStruct | null,
  toArmature: Mat4,
): EnvelopeUse {
  const weights = data.deformWeights;
  const usesGroups = (deform.flags & ARMATURE_DEFORM_VERTEX_GROUPS) !== 0 && weights !== null;
  const usesEnvelopes = (deform.flags & ARMATURE_DEFORM_ENVELOPE) !== 0;
  const mask = weights && deform.maskGroup !== "" ? data.vertexGroupNames.indexOf(deform.maskGroup) : -1;
  const inverted = (deform.flags & ARMATURE_DEFORM_INVERT_MASK) !== 0;
  const deformBones = new Map(bones.flatMap((bone) => (bone.deform ? [[bone.name, bone] as const] : [])));
  const groupBones = data.vertexGroupNames.map((name) => deformBones.get(name));
  const multiplies = (bone: Bone) => (bone.flag & BONE_MULTIPLY_ENVELOPE) !== 0;
  const envelopes = armature ? readEnvelopes(armature) : null;
  const deformEnvelopes = [...deformBones.keys()].flatMap((name) => envelopes?.get(name) ?? []);
  const pointAt = (v: number) => {
    const [x = 0, y = 0, z = 0] = data.positions.subarray(v * 3, v * 3 + 3);
    return transformPoint(toArmature, x, y, z);
  };
  const reached = (v: number) => {
    if (!envelopes) return true;
    const point = pointAt(v);
    const factors = deformEnvelopes.map((envelope) => envelopeFactor(point, envelope) * envelope.weight);
    return factors.reduce((sum, factor) => sum + factor, 0) > MIN_CONTRIBUTION;
  };
  let enveloped = false;
  const multiplying = new Set<string>();
  for (let v = 0; v < data.vertexCount; v++) {
    const entries: { bone: Bone; weight: number }[] = [];
    let maskWeight = 0;
    for (let i = weights?.offsets[v] ?? 0; i < (weights?.offsets[v + 1] ?? 0); i++) {
      const group = weights?.groups[i] ?? -1;
      const weight = weights?.weights[i] ?? 0;
      if (group === mask) maskWeight = weight;
      const bone = groupBones[group];
      if (bone) entries.push({ bone, weight });
    }
    if (mask >= 0 && (inverted ? 1 - maskWeight : maskWeight) <= 0) continue;
    if (!usesGroups || entries.length === 0) {
      enveloped ||= usesEnvelopes && reached(v);
      continue;
    }
    const total = entries.reduce((sum, { weight }) => sum + weight, 0);
    if (total <= MIN_CONTRIBUTION || !entries.some(({ bone, weight }) => weight > 0 && multiplies(bone))) continue;
    const point = pointAt(v);
    const kept = entries.map(({ bone, weight }) => {
      if (!multiplies(bone)) return weight;
      const envelope = envelopes?.get(bone.name);
      return envelope ? weight * envelopeFactor(point, envelope) : 0;
    });
    const scaled = kept.reduce((sum, weight) => sum + weight, 0);
    const blendChanges =
      scaled <= MIN_CONTRIBUTION ||
      entries.some(({ weight }, i) => Math.abs((kept[i] ?? 0) / scaled - weight / total) > WEIGHT_TOLERANCE);
    if (!blendChanges) continue;
    entries.forEach(({ bone, weight }, i) => {
      if (multiplies(bone) && (kept[i] ?? 0) < weight) multiplying.add(bone.name);
    });
  }
  return { enveloped, multiplying: [...multiplying] };
}
