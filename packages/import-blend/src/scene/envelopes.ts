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

type DeformingBone = Pick<Bone, "name" | "flag" | "deform">;

export interface EnvelopeUse {
  /** Whether the bones' envelopes move some vertex, which is in no vertex group of a deform bone. */
  enveloped: boolean;
  /** Deform bones whose envelopes change how the vertex group weights of some vertex blend. */
  multiplying: string[];
}

/** The envelope of each bone of an armature's data, by the bone's name. */
export function readEnvelopes(armature: BlendStruct): Map<string, Envelope> {
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

/** How much of a bone's weight its envelope keeps at a point in armature space, as Blender's `distfactor_to_bone`. */
export function envelopeFactor(point: readonly number[], envelope: Envelope): number {
  return factorAt(point[0] ?? 0, point[1] ?? 0, point[2] ?? 0, envelope);
}

function factorAt(x: number, y: number, z: number, envelope: Envelope): number {
  const { head, tail, headRadius, tailRadius, falloff } = envelope;
  const headX = head[0] ?? 0;
  const headY = head[1] ?? 0;
  const headZ = head[2] ?? 0;
  const axisX = (tail[0] ?? 0) - headX;
  const axisY = (tail[1] ?? 0) - headY;
  const axisZ = (tail[2] ?? 0) - headZ;
  const toX = x - headX;
  const toY = y - headY;
  const toZ = z - headZ;
  const length = Math.sqrt(axisX * axisX + axisY * axisY + axisZ * axisZ);
  const along = length > 0 ? (axisX * toX + axisY * toY + axisZ * toZ) / length : 0;
  const fromHead = toX * toX + toY * toY + toZ * toZ;
  let distanceSquared: number;
  let radius: number;
  if (along < 0) {
    distanceSquared = fromHead;
    radius = headRadius;
  } else if (along > length) {
    distanceSquared = (toX - axisX) ** 2 + (toY - axisY) ** 2 + (toZ - axisZ) ** 2;
    radius = tailRadius;
  } else {
    distanceSquared = fromHead - along * along;
    const share = length > 0 ? along / length : 0;
    radius = share * tailRadius + (1 - share) * headRadius;
  }
  if (distanceSquared < radius * radius) return 1;
  if (falloff === 0 || distanceSquared >= (radius + falloff) ** 2) return 0;
  const beyond = Math.sqrt(distanceSquared) - radius;
  return 1 - (beyond * beyond) / (falloff * falloff);
}

/** An envelope and the box around its reach, outside which it keeps none of its bone's weight. */
interface Reach {
  envelope: Envelope;
  low: readonly [number, number, number];
  high: readonly [number, number, number];
}

function reachOf(envelope: Envelope): Reach {
  const { head, tail } = envelope;
  const reach = Math.max(Math.abs(envelope.headRadius), Math.abs(envelope.tailRadius)) + Math.abs(envelope.falloff);
  const low = (axis: number) => Math.min(head[axis] ?? 0, tail[axis] ?? 0) - reach;
  const high = (axis: number) => Math.max(head[axis] ?? 0, tail[axis] ?? 0) + reach;
  return { envelope, low: [low(0), low(1), low(2)], high: [high(0), high(1), high(2)] };
}

function inReach(x: number, y: number, z: number, { low, high }: Reach): boolean {
  return !(x < low[0] || x > high[0] || y < low[1] || y > high[1] || z < low[2] || z > high[2]);
}

/**
 * How an armature's envelopes act on a mesh, as Blender's armature deform uses them. A vertex that the modifier's mask
 * group leaves out does not move. A vertex in no vertex group of a deform bone moves with the envelopes of the deform
 * bones that reach it, when envelopes are on. A bone that multiplies by its envelope scales its weight by how far inside
 * the envelope the vertex lies, which matters only where it changes the blend of the vertex's weights. `envelopes` holds
 * the armature's, and `toArmature` takes the mesh's coordinates into the armature object's.
 */
export function envelopeUse(
  data: Pick<MeshData, "vertexCount" | "positions" | "deformWeights" | "vertexGroupNames">,
  deform: Pick<ArmatureDeform, "flags" | "maskGroup">,
  bones: readonly DeformingBone[],
  envelopes: ReadonlyMap<string, Envelope> | null,
  toArmature: Mat4,
): EnvelopeUse {
  const weights = data.deformWeights;
  const usesGroups = (deform.flags & ARMATURE_DEFORM_VERTEX_GROUPS) !== 0 && weights !== null;
  const usesEnvelopes = (deform.flags & ARMATURE_DEFORM_ENVELOPE) !== 0;
  const multiplies = (bone: DeformingBone) => (bone.flag & BONE_MULTIPLY_ENVELOPE) !== 0;
  const deformBones = new Map(bones.flatMap((bone) => (bone.deform ? [[bone.name, bone] as const] : [])));
  const canMultiply = usesGroups && [...deformBones.values()].some(multiplies);
  if (!usesEnvelopes && !canMultiply) return { enveloped: false, multiplying: [] };
  const mask = weights && deform.maskGroup !== "" ? data.vertexGroupNames.indexOf(deform.maskGroup) : -1;
  const inverted = (deform.flags & ARMATURE_DEFORM_INVERT_MASK) !== 0;
  const groupBones = data.vertexGroupNames.map((name) => deformBones.get(name));
  const reaches = [...deformBones.keys()].flatMap((name) => {
    const envelope = envelopes?.get(name);
    return envelope ? [reachOf(envelope)] : [];
  });
  const pointAt = (v: number) => {
    const [x = 0, y = 0, z = 0] = data.positions.subarray(v * 3, v * 3 + 3);
    return transformPoint(toArmature, x, y, z);
  };
  const reached = (v: number) => {
    if (!envelopes) return true;
    const [x, y, z] = pointAt(v);
    let sum = 0;
    for (const reach of reaches) {
      if (inReach(x, y, z, reach)) sum += factorAt(x, y, z, reach.envelope) * reach.envelope.weight;
    }
    return sum > MIN_CONTRIBUTION;
  };
  let enveloped = false;
  const multiplying = new Set<string>();
  for (let v = 0; v < data.vertexCount && !(enveloped && !canMultiply); v++) {
    const from = weights?.offsets[v] ?? 0;
    const to = weights?.offsets[v + 1] ?? 0;
    let maskWeight = 0;
    let grouped = false;
    for (let i = from; i < to; i++) {
      const group = weights?.groups[i] ?? -1;
      if (group === mask) maskWeight = weights?.weights[i] ?? 0;
      if (groupBones[group]) grouped = true;
    }
    if (mask >= 0 && (inverted ? 1 - maskWeight : maskWeight) <= 0) continue;
    if (!usesGroups || !grouped) {
      enveloped ||= usesEnvelopes && reached(v);
      continue;
    }
    if (!canMultiply) continue;
    const entries: { bone: DeformingBone; weight: number }[] = [];
    for (let i = from; i < to; i++) {
      const bone = groupBones[weights?.groups[i] ?? -1];
      if (bone) entries.push({ bone, weight: weights?.weights[i] ?? 0 });
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
