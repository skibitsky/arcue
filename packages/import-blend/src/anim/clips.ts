import type { Interpolation, Quat, Track, Vec3 } from "@arcue/scene";
import type { BlendStruct } from "../blend/file";
import type { Mat4 } from "../math";
import { decompose, invert, multiply, multiplyAll, toSceneAxes } from "../math";
import { BoneFlag, inheritsFully, poseMatrices } from "../scene/armature";
import type { BlendWarning, BuiltScene, MeshRecord, ObjectRecord } from "../scene/build";
import { ObjectType } from "../scene/objects";
import type { TransformValues } from "../scene/transforms";
import {
  channelMatrix,
  cloneValues,
  isTransformProperty,
  objectBasis,
  setTransformProperty,
} from "../scene/transforms";
import type { Action, ActionSlot } from "./actions";
import { actionRange, animationUses, IdCode, parsePosePath, parseShapeKeyPath } from "./actions";
import type { FCurve } from "./fcurve";
import { evaluateFCurve, isStepped, keyFrames } from "./fcurve";

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

function shapeKeyOwner(mesh: MeshRecord): BlendStruct | null {
  return mesh.object.data?.deref("key") ?? null;
}

function relevantObjectCurve(curve: FCurve, record: ObjectRecord): boolean {
  if (curve.muted) return false;
  if (isTransformProperty(curve.path, true)) return true;
  const pose = parsePosePath(curve.path);
  return pose !== null && record.armature !== null && isTransformProperty(pose.property, false);
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

/**
 * The targets of each slot of each action: the objects and shape keys whose animation data uses it, or, for an action
 * nothing uses, the object or shape keys its slot names, or the armatures whose bones its curves name.
 */
function assignTargets(actions: readonly Action[], scene: BuiltScene): Map<Action, Map<ActionSlot, Target[]>> {
  const result = new Map<Action, Map<ActionSlot, Target[]>>();
  const objectUses = scene.objects.map((record) => ({ record, uses: animationUses(record.object.struct).uses }));
  const keyUses = scene.meshRecords.flatMap((mesh) => {
    const key = shapeKeyOwner(mesh);
    return key ? [{ mesh, key, uses: animationUses(key).uses }] : [];
  });
  const add = (action: Action, slot: ActionSlot, target: Target) => {
    const slots = result.get(action) ?? new Map<ActionSlot, Target[]>();
    const targets = slots.get(slot) ?? [];
    if (target.kind === "shapeKeys") {
      const existing = targets.find(
        (entry): entry is Extract<Target, { kind: "shapeKeys" }> => entry.kind === "shapeKeys",
      );
      if (existing) {
        for (const mesh of target.meshes) if (!existing.meshes.includes(mesh)) existing.meshes.push(mesh);
      } else targets.push(target);
    } else if (!targets.some((entry) => entry.kind === "object" && entry.record === target.record)) {
      targets.push(target);
    }
    slots.set(slot, targets);
    result.set(action, slots);
  };
  const slotFor = (action: Action, handle: number): ActionSlot | undefined =>
    action.slots.find((slot) => slot.handle === handle) ?? (action.slots.length === 1 ? action.slots[0] : undefined);

  for (const action of actions) {
    let used = false;
    for (const { record, uses } of objectUses) {
      for (const use of uses) {
        if (use.action !== action.struct.offset) continue;
        const slot = slotFor(action, use.slot);
        if (!slot) continue;
        add(action, slot, { kind: "object", record });
        used = true;
      }
    }
    for (const { mesh, uses } of keyUses) {
      for (const use of uses) {
        if (use.action !== action.struct.offset) continue;
        const slot = slotFor(action, use.slot);
        if (!slot) continue;
        add(action, slot, { kind: "shapeKeys", meshes: [mesh] });
        used = true;
      }
    }
    if (used) continue;
    for (const slot of action.slots) {
      const prefix = slot.identifier.slice(0, 2);
      const name = slot.identifier.slice(2);
      const keyCurves = slot.curves.some(relevantKeyCurve);
      const forKeys =
        slot.idType === IdCode.shapeKey ||
        prefix === "KE" ||
        (slot.idType === 0 && prefix === "" && keyCurves && !slot.curves.some((curve) => parsePosePath(curve.path)));
      if (forKeys) {
        const names = new Set(slot.curves.flatMap((curve) => parseShapeKeyPath(curve.path) ?? []));
        const meshes = keyUses
          .filter(
            ({ key, mesh }) =>
              (name !== "" && key.struct("id")?.string("name").slice(2) === name) ||
              mesh.morphKeys.some((morph) => names.has(morph)),
          )
          .map(({ mesh }) => mesh);
        if (meshes.length > 0) add(action, slot, { kind: "shapeKeys", meshes });
        continue;
      }
      if (slot.idType !== 0 && slot.idType !== IdCode.object) continue;
      const named = name === "" ? undefined : scene.objects.find((record) => record.object.name === name);
      if (named) {
        add(action, slot, { kind: "object", record: named });
        continue;
      }
      const armatures = scene.objects.filter((record) => record.object.type === ObjectType.armature && record.armature);
      const scored = armatures.map((record) => ({ record, score: matchingBones(slot, record) }));
      const best = Math.max(0, ...scored.map((entry) => entry.score));
      if (best === 0) continue;
      for (const entry of scored) if (entry.score === best) add(action, slot, { kind: "object", record: entry.record });
    }
  }
  return result;
}

function snapTime(seconds: number, fps: number): number {
  const frames = seconds * fps;
  const whole = Math.round(frames);
  return Math.abs(frames - whole) < SNAP_FRAMES ? whole / fps : seconds;
}

interface NodeSamples {
  translation: number[];
  rotation: number[];
  scale: number[];
  stepped: { translation: boolean; rotation: boolean; scale: boolean };
}

const SHEAR_TOLERANCE = 1e-4;

/** How far a matrix's axes are from orthogonal, as the largest cosine between two of them. */
function shearOf(m: Mat4): number {
  const axis = (index: number) => {
    const x = m[index * 4] ?? 0;
    const y = m[index * 4 + 1] ?? 0;
    const z = m[index * 4 + 2] ?? 0;
    const length = Math.hypot(x, y, z) || 1;
    return [x / length, y / length, z / length];
  };
  const [x, y, z] = [axis(0), axis(1), axis(2)];
  const cosine = (a: number[], b: number[]) => Math.abs(a.reduce((sum, value, k) => sum + value * (b[k] ?? 0), 0));
  return Math.max(cosine(x, y), cosine(y, z), cosine(x, z));
}

function sameTrs(
  a: { translation: Vec3; rotation: Quat; scale: Vec3 },
  b: { translation: Vec3; rotation: Quat; scale: Vec3 },
): boolean {
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
  let constant = true;
  for (let i = 1; i < count && constant; i++) {
    for (let c = 0; c < components; c++) {
      if (values[i * components + c] !== values[c]) {
        constant = false;
        break;
      }
    }
  }
  if (constant) {
    return {
      node,
      property,
      interpolation: "linear",
      times: Float32Array.of(0),
      values: Float32Array.from(values.slice(0, components)),
    };
  }
  return { node, property, interpolation, times, values: Float32Array.from(values) };
}

/** Samples every action that animates the scene into a clip, one key per frame of its range. */
export function buildClips(scene: BuiltScene, actions: readonly Action[], warnings: BlendWarning[]): ParsedClip[] {
  const targets = assignTargets(actions, scene);
  const clips: ParsedClip[] = [];
  const restTrs = scene.nodes.map((node) => decompose(toSceneAxes(node.rest, scene.unitScale)));

  for (const action of actions) {
    const slots = targets.get(action);
    if (!slots) continue;
    const objectTargets: { record: ObjectRecord; curves: FCurve[] }[] = [];
    const keyTargets: { mesh: MeshRecord; curves: FCurve[] }[] = [];
    for (const [slot, list] of slots) {
      for (const target of list) {
        if (target.kind === "object") {
          const curves = slot.curves.filter((curve) => relevantObjectCurve(curve, target.record));
          if (curves.length > 0) objectTargets.push({ record: target.record, curves });
        } else {
          const curves = slot.curves.filter(relevantKeyCurve);
          for (const mesh of target.meshes) {
            const own = curves.filter((curve) => mesh.morphKeys.includes(parseShapeKeyPath(curve.path) ?? ""));
            if (own.length > 0) keyTargets.push({ mesh, curves: own });
          }
        }
      }
    }
    if (objectTargets.length === 0 && keyTargets.length === 0) continue;

    const unsupported = new Set<string>();
    for (const { curves } of [...objectTargets, ...keyTargets]) {
      for (const curve of curves) for (const name of curve.unsupportedModifiers) unsupported.add(name);
    }
    if (unsupported.size > 0) {
      warnings.push({
        code: "curve-modifier-not-applied",
        subject: { kind: "clip", name: action.name },
        message: `Curve modifiers not applied: ${action.name}`,
        detail: [...unsupported].join(", "),
      });
    }

    const [start, end] = actionRange(action);
    const fps = scene.fps;
    const span = end - start;
    const whole = Math.floor(span + 1e-6);
    if (whole > MAX_FRAMES) {
      warnings.push({
        code: "clip-not-sampled",
        subject: { kind: "clip", name: action.name },
        message: `Clip not sampled: ${action.name}`,
        detail: `It spans ${whole} frames, more than ${MAX_FRAMES}`,
      });
      continue;
    }
    const frames: number[] = [];
    for (let k = 0; k <= whole; k++) frames.push(start + k);
    if (span - whole > 1e-6) frames.push(end);
    const times = Float32Array.from(frames, (frame) => snapTime((frame - start) / fps, fps));
    const duration = snapTime(span / fps, fps);

    const curveTimes: Float32Array[] = [];
    const tolerance = 0.25 / fps;
    for (const { curves } of [...objectTargets, ...keyTargets]) {
      for (const curve of curves) {
        const keyed = keyFrames(curve)
          .map((frame) => snapTime((frame - start) / fps, fps))
          .filter((time) => time >= -tolerance && time <= duration + tolerance);
        if (keyed.length > 0) curveTimes.push(Float32Array.from(keyed));
      }
    }

    const samples = new Map<number, NodeSamples>();
    const sampleOf = (node: number): NodeSamples => {
      let entry = samples.get(node);
      if (!entry) {
        entry = {
          translation: [],
          rotation: [],
          scale: [],
          stepped: { translation: true, rotation: true, scale: true },
        };
        samples.set(node, entry);
      }
      return entry;
    };
    const steppedOf = (curves: readonly FCurve[]) => ({
      translation: curves.filter((curve) => curve.path.endsWith("location")).every(isStepped),
      rotation: curves.filter((curve) => curve.path.includes("rotation")).every(isStepped),
      scale: curves.filter((curve) => curve.path.endsWith("scale")).every(isStepped),
    });
    const weightSamples = new Map<MeshRecord, number[]>();
    const sheared = new Set<string>();

    const bound = objectTargets.map(({ record, curves }) => {
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
      const boneStepped = new Map(
        [...boneCurves].map(([index, list]) => [index, steppedOf(list.map((entry) => entry.curve))]),
      );
      const bones = record.armature?.bones ?? [];
      const sampled = bones.flatMap((bone, index) => (boneCurves.has(index) || !inheritsFully(bone) ? [index] : []));
      const needsPoses = sampled.some((index) => {
        const bone = bones[index];
        return bone !== undefined && !inheritsFully(bone);
      });
      return {
        record,
        objectCurves,
        boneCurves,
        objectStepped: steppedOf(objectCurves),
        boneStepped,
        sampled,
        needsPoses,
      };
    });

    for (const frame of frames) {
      for (const { record, objectCurves, boneCurves, objectStepped, boneStepped, sampled, needsPoses } of bound) {
        if (objectCurves.length > 0) {
          const values = cloneValues(record.values);
          for (const curve of objectCurves)
            setTransformProperty(values, curve.path, curve.index, evaluateFCurve(curve, frame));
          const local = multiplyAll(record.parentPart, record.parentInverse, objectBasis(values));
          const trs = decompose(toSceneAxes(local, scene.unitScale));
          const entry = sampleOf(record.node);
          entry.translation.push(...trs.translation);
          entry.rotation.push(...trs.rotation);
          entry.scale.push(...trs.scale);
          entry.stepped = objectStepped;
        }
        const armature = record.armature;
        if (!armature || boneCurves.size === 0) continue;
        const channels: TransformValues[] = [...armature.rest];
        for (const [index, list] of boneCurves) {
          const rest = armature.rest[index];
          if (!rest) continue;
          const channel = cloneValues(rest);
          for (const { curve, property } of list) {
            setTransformProperty(channel, property, curve.index, evaluateFCurve(curve, frame));
          }
          channels[index] = channel;
        }
        const poses = needsPoses ? poseMatrices(armature.bones, channels) : null;
        for (const index of sampled) {
          const bone = armature.bones[index];
          const node = armature.nodes[index];
          if (!bone || node === undefined) continue;
          let local: Mat4;
          if (poses && !inheritsFully(bone)) {
            const pose = poses[index] ?? bone.rest;
            const parentPose = poses[bone.parent];
            local = parentPose ? multiply(invert(parentPose), pose) : pose;
            if (shearOf(local) > SHEAR_TOLERANCE) sheared.add(bone.name);
          } else {
            const channel = channels[index];
            local = channel
              ? multiply(bone.offset, channelMatrix(channel, (bone.flag & BoneFlag.connected) !== 0))
              : bone.offset;
          }
          const trs = decompose(toSceneAxes(local, scene.unitScale));
          const entry = sampleOf(node);
          entry.translation.push(...trs.translation);
          entry.rotation.push(...trs.rotation);
          entry.scale.push(...trs.scale);
          entry.stepped = boneStepped.get(index) ?? { translation: false, rotation: false, scale: false };
        }
      }
      for (const { mesh, curves } of keyTargets) {
        const weights = [...mesh.morphDefaults];
        for (const curve of curves) {
          const index = mesh.morphKeys.indexOf(parseShapeKeyPath(curve.path) ?? "");
          if (index >= 0) weights[index] = Math.min(Math.max(evaluateFCurve(curve, frame), 0), 1);
        }
        const list = weightSamples.get(mesh) ?? [];
        list.push(...weights);
        weightSamples.set(mesh, list);
      }
    }

    if (sheared.size > 0) {
      warnings.push({
        code: "deform-approximated",
        subject: { kind: "clip", name: action.name },
        message: `Shear not shown: ${action.name}`,
        detail: `These bones shear under their parents' scale, which the preview drops: ${[...sheared].join(", ")}`,
      });
    }
    const tracks: Track[] = [];
    for (const [node, entry] of samples) {
      const rest = restTrs[node];
      const unchanged =
        rest !== undefined &&
        frames.every((_, k) =>
          sameTrs(
            {
              translation: entry.translation.slice(k * 3, k * 3 + 3) as Vec3,
              rotation: entry.rotation.slice(k * 4, k * 4 + 4) as Quat,
              scale: entry.scale.slice(k * 3, k * 3 + 3) as Vec3,
            },
            rest,
          ),
        );
      if (unchanged) continue;
      for (let k = 1; k < frames.length; k++) {
        const dot =
          (entry.rotation[k * 4] ?? 0) * (entry.rotation[k * 4 - 4] ?? 0) +
          (entry.rotation[k * 4 + 1] ?? 0) * (entry.rotation[k * 4 - 3] ?? 0) +
          (entry.rotation[k * 4 + 2] ?? 0) * (entry.rotation[k * 4 - 2] ?? 0) +
          (entry.rotation[k * 4 + 3] ?? 0) * (entry.rotation[k * 4 - 1] ?? 0);
        if (dot < 0) for (let c = 0; c < 4; c++) entry.rotation[k * 4 + c] = -(entry.rotation[k * 4 + c] ?? 0);
      }
      for (const created of [
        track(node, "translation", entry.stepped.translation ? "step" : "linear", times, entry.translation, 3),
        track(node, "rotation", entry.stepped.rotation ? "step" : "linear", times, entry.rotation, 4),
        track(node, "scale", entry.stepped.scale ? "step" : "linear", times, entry.scale, 3),
      ]) {
        if (created) tracks.push(created);
      }
    }
    for (const [mesh, values] of weightSamples) {
      const created = track(mesh.node, "weights", "linear", times, values, mesh.morphKeys.length);
      if (created) tracks.push(created);
    }
    tracks.sort((a, b) => a.node - b.node);
    clips.push({ name: action.name, duration, curveTimes, tracks });
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
