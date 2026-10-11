import type { BlendStruct } from "../blend/file";

/** A curve's keyframes as parallel arrays: each key, its two handles, and how it interpolates to the next key. */
export interface Keys {
  count: number;
  frame: Float64Array;
  value: Float64Array;
  leftFrame: Float64Array;
  leftValue: Float64Array;
  rightFrame: Float64Array;
  rightValue: Float64Array;
  interpolation: Uint8Array;
  easing: Uint8Array;
  back: Float32Array;
  amplitude: Float32Array;
  period: Float32Array;
}

/** The frames a modifier acts on, with its effect ramping up over `blendIn` frames and down over `blendOut`. */
export interface ModifierRange {
  start: number;
  end: number;
  blendIn: number;
  blendOut: number;
}

interface ModifierScope {
  /** The frame range the modifier is restricted to, or null for every frame. */
  range: ModifierRange | null;
  influence: number;
}

export type CurveModifier = ModifierScope &
  (
    | { type: "cycles"; before: number; after: number; beforeCycles: number; afterCycles: number }
    | { type: "stepped"; step: number; offset: number; start: number; end: number; noBefore: boolean; noAfter: boolean }
    | { type: "limits"; rect: [number, number, number, number]; flag: number }
  );

export interface FCurve {
  path: string;
  index: number;
  keys: Keys;
  /** Baked samples, one value per frame from `sampleStart`, for curves Blender stores as samples. */
  samples: Float32Array | null;
  sampleStart: number;
  linearExtrapolation: boolean;
  discrete: boolean;
  muted: boolean;
  modifiers: CurveModifier[];
  /** Names of modifiers this evaluator does not apply. */
  unsupportedModifiers: string[];
}

export const Interpolation = {
  constant: 0,
  linear: 1,
  bezier: 2,
  back: 3,
  bounce: 4,
  circ: 5,
  cubic: 6,
  elastic: 7,
  expo: 8,
  quad: 9,
  quart: 10,
  quint: 11,
  sine: 12,
} as const;

const EASE_AUTO = 0;
const EASE_IN = 1;
const EASE_OUT = 2;
const EASE_IN_OUT = 3;

const FCURVE_MUTED = 1 << 4;
const FCURVE_DISCRETE_VALUES = 1 << 12;
const FCURVE_EXTRAPOLATE_LINEAR = 1;
const FMODIFIER_DISABLED = 1 << 0;
const FMODIFIER_MUTED = 1 << 3;
const FMODIFIER_RANGE_RESTRICTED = 1 << 4;
const FMODIFIER_USE_INFLUENCE = 1 << 5;
const FMODIFIER_CYCLES = 4;
const FMODIFIER_LIMITS = 8;
const FMODIFIER_STEPPED = 9;
const MODIFIER_NAMES: Readonly<Record<number, string>> = {
  1: "Generator",
  2: "Built-In Function",
  3: "Envelope",
  5: "Noise",
  7: "Python",
};

function emptyKeys(count: number): Keys {
  return {
    count,
    frame: new Float64Array(count),
    value: new Float64Array(count),
    leftFrame: new Float64Array(count),
    leftValue: new Float64Array(count),
    rightFrame: new Float64Array(count),
    rightValue: new Float64Array(count),
    interpolation: new Uint8Array(count),
    easing: new Uint8Array(count),
    back: new Float32Array(count),
    amplitude: new Float32Array(count),
    period: new Float32Array(count),
  };
}

function readModifiers(curve: BlendStruct): { modifiers: CurveModifier[]; unsupported: string[] } {
  const modifiers: CurveModifier[] = [];
  const unsupported: string[] = [];
  for (const modifier of curve.list("modifiers")) {
    const flag = modifier.number("flag");
    if ((flag & (FMODIFIER_MUTED | FMODIFIER_DISABLED)) !== 0) continue;
    const type = modifier.number("type");
    const data = modifier.deref("data");
    const scope: ModifierScope = {
      range:
        (flag & FMODIFIER_RANGE_RESTRICTED) !== 0
          ? {
              start: modifier.number("sfra"),
              end: modifier.number("efra"),
              blendIn: modifier.number("blendin"),
              blendOut: modifier.number("blendout"),
            }
          : null,
      influence: (flag & FMODIFIER_USE_INFLUENCE) !== 0 ? modifier.number("influence") : 1,
    };
    if (type === FMODIFIER_CYCLES && data) {
      modifiers.push({
        ...scope,
        type: "cycles",
        before: data.number("before_mode"),
        after: data.number("after_mode"),
        beforeCycles: data.number("before_cycles"),
        afterCycles: data.number("after_cycles"),
      });
    } else if (type === FMODIFIER_STEPPED && data) {
      const steppedFlag = data.number("flag");
      modifiers.push({
        ...scope,
        type: "stepped",
        step: data.number("step_size"),
        offset: data.number("offset"),
        start: data.number("start_frame"),
        end: data.number("end_frame"),
        noBefore: (steppedFlag & 1) !== 0,
        noAfter: (steppedFlag & 2) !== 0,
      });
    } else if (type === FMODIFIER_LIMITS && data) {
      const rect = data.struct("rect");
      modifiers.push({
        ...scope,
        type: "limits",
        rect: [
          rect?.number("xmin") ?? 0,
          rect?.number("xmax") ?? 0,
          rect?.number("ymin") ?? 0,
          rect?.number("ymax") ?? 0,
        ],
        flag: data.number("flag"),
      });
    } else {
      unsupported.push(MODIFIER_NAMES[type] ?? modifier.string("name"));
    }
  }
  return { modifiers, unsupported };
}

/** Reads the BezTriple array of a curve straight from the file through the struct's member offsets. */
function readKeys(curve: BlendStruct, count: number): Keys {
  const block = curve.target("bezt");
  const type = block?.struct;
  if (!block || !type || type.size === 0) return emptyKeys(0);
  const { view, little } = curve.file;
  const offset = (name: string) => type.field(name)?.offset ?? -1;
  const vec = offset("vec");
  const ipo = offset("ipo");
  const easing = offset("easing");
  const back = offset("back");
  const amplitude = offset("amplitude");
  const period = offset("period");
  const keys = emptyKeys(Math.max(0, Math.min(count, Math.floor(block.size / type.size))));
  const float = (at: number) => view.getFloat32(at, little);
  for (let i = 0; i < keys.count; i++) {
    const base = block.offset + i * type.size;
    if (vec >= 0) {
      keys.leftFrame[i] = float(base + vec);
      keys.leftValue[i] = float(base + vec + 4);
      keys.frame[i] = float(base + vec + 12);
      keys.value[i] = float(base + vec + 16);
      keys.rightFrame[i] = float(base + vec + 24);
      keys.rightValue[i] = float(base + vec + 28);
    }
    if (ipo >= 0) keys.interpolation[i] = view.getUint8(base + ipo);
    if (easing >= 0) keys.easing[i] = view.getUint8(base + easing);
    if (back >= 0) keys.back[i] = float(base + back);
    if (amplitude >= 0) keys.amplitude[i] = float(base + amplitude);
    if (period >= 0) keys.period[i] = float(base + period);
  }
  return keys;
}

function readSamples(curve: BlendStruct, count: number): { samples: Float32Array; start: number } | null {
  const block = curve.target("fpt");
  const type = block?.struct;
  if (!block || !type || type.size === 0) return null;
  const vec = type.field("vec")?.offset ?? 0;
  const available = Math.max(0, Math.min(count, Math.floor(block.size / type.size)));
  if (available === 0) return null;
  const { view, little } = curve.file;
  const samples = new Float32Array(available);
  for (let i = 0; i < available; i++) samples[i] = view.getFloat32(block.offset + i * type.size + vec + 4, little);
  return { samples, start: view.getFloat32(block.offset + vec, little) };
}

/** Reads an FCurve struct. */
export function readFCurve(curve: BlendStruct): FCurve {
  const count = Math.max(curve.number("totvert"), 0);
  const keys = readKeys(curve, count);
  const sampled = keys.count === 0 ? readSamples(curve, count) : null;
  const flag = curve.number("flag");
  const { modifiers, unsupported } = readModifiers(curve);
  return {
    path: curve.text("rna_path"),
    index: curve.number("array_index"),
    keys,
    samples: sampled?.samples ?? null,
    sampleStart: sampled?.start ?? 0,
    linearExtrapolation: curve.number("extend") === FCURVE_EXTRAPOLATE_LINEAR,
    discrete: (flag & FCURVE_DISCRETE_VALUES) !== 0,
    muted: (flag & FCURVE_MUTED) !== 0,
    modifiers,
    unsupportedModifiers: unsupported,
  };
}

/** Key frames of the curve, or its sample frames. */
export function keyFrames(curve: FCurve): number[] {
  if (curve.keys.count > 0) return Array.from(curve.keys.frame);
  if (curve.samples) return Array.from(curve.samples, (_, index) => curve.sampleStart + index);
  return [];
}

/** The real cube root, negative for negative input, as Blender's `sqrt3d`. */
function cubeRoot(d: number): number {
  if (d === 0) return 0;
  return d < 0 ? -Math.exp(Math.log(-d) / 3) : Math.exp(Math.log(d) / 3);
}

const SMALL = -1e-10;

/** Blender's `solve_cubic`: the first parameter in [0, 1] where c0 + c1 t + c2 t² + c3 t³ = 0, or null. */
function solveCubic(c0: number, c1: number, c2: number, c3: number): number | null {
  const valid = (value: number) => {
    const rounded = Math.fround(value);
    return rounded >= SMALL && rounded <= 1.000001 ? rounded : null;
  };
  if (c3 !== 0) {
    let a = c2 / c3;
    const b = c1 / c3;
    const c = c0 / c3;
    a /= 3;
    let p = b / 3 - a * a;
    let q = (2 * a * a * a - a * b + c) / 2;
    const d = q * q + p * p * p;
    if (d > 0) {
      const t = Math.sqrt(d);
      return valid(cubeRoot(-q + t) + cubeRoot(-q - t) - a);
    }
    if (d === 0) {
      const t = cubeRoot(-q);
      return valid(2 * t - a) ?? valid(-t - a);
    }
    const phi = Math.acos(-q / Math.sqrt(-(p * p * p)));
    const t = Math.sqrt(-p);
    p = Math.cos(phi / 3);
    q = Math.sqrt(3 - 3 * p * p);
    return valid(2 * t * p - a) ?? valid(-t * (p + q) - a) ?? valid(-t * (p - q) - a);
  }
  if (c2 !== 0) {
    const p = c1 * c1 - 4 * c2 * c0;
    if (p > 0) {
      const root = Math.sqrt(p);
      return valid((-c1 - root) / (2 * c2)) ?? valid((-c1 + root) / (2 * c2));
    }
    return p === 0 ? valid(-c1 / (2 * c2)) : null;
  }
  if (c1 !== 0) return valid(-c0 / c1);
  return c0 === 0 ? 0 : null;
}

/**
 * The Bezier segment from key `a` to key `b` at `frame`, with Blender's `BKE_fcurve_correct_bezpart`, which shortens
 * handles that reach past the other key so the curve cannot loop.
 */
function bezierValue(keys: Keys, a: number, b: number, frame: number): number {
  const x1 = keys.frame[a] ?? 0;
  const y1 = keys.value[a] ?? 0;
  let x2 = keys.rightFrame[a] ?? 0;
  let y2 = keys.rightValue[a] ?? 0;
  let x3 = keys.leftFrame[b] ?? 0;
  let y3 = keys.leftValue[b] ?? 0;
  const x4 = keys.frame[b] ?? 0;
  const y4 = keys.value[b] ?? 0;
  const epsilon = 1.1920929e-7;
  if (Math.abs(y1 - y4) < epsilon && Math.abs(y2 - y3) < epsilon && Math.abs(y3 - y4) < epsilon) return y1;
  const h1x = x1 - x2;
  const h1y = y1 - y2;
  const h2x = x4 - x3;
  const h2y = y4 - y3;
  const length = x4 - x1;
  const length1 = Math.abs(h1x);
  const length2 = Math.abs(h2x);
  if (length1 + length2 !== 0 && length1 + length2 > length) {
    const factor = length / (length1 + length2);
    x2 = x1 - factor * h1x;
    y2 = y1 - factor * h1y;
    x3 = x4 - factor * h2x;
    y3 = y4 - factor * h2y;
  }
  const t = solveCubic(x1 - frame, 3 * (x2 - x1), 3 * (x1 - 2 * x2 + x3), x4 - x1 + 3 * (x2 - x3));
  if (t === null) return 0;
  const c1 = 3 * (y2 - y1);
  const c2 = 3 * (y1 - 2 * y2 + y3);
  const c3 = y4 - y1 + 3 * (y2 - y3);
  return y1 + t * c1 + t * t * c2 + t * t * t * c3;
}

function bounceOut(time: number, begin: number, change: number, duration: number): number {
  let t = time / duration;
  if (t < 1 / 2.75) return change * (7.5625 * t * t) + begin;
  if (t < 2 / 2.75) {
    t -= 1.5 / 2.75;
    return change * (7.5625 * t * t + 0.75) + begin;
  }
  if (t < 2.5 / 2.75) {
    t -= 2.25 / 2.75;
    return change * (7.5625 * t * t + 0.9375) + begin;
  }
  t -= 2.625 / 2.75;
  return change * (7.5625 * t * t + 0.984375) + begin;
}

function bounceIn(time: number, begin: number, change: number, duration: number): number {
  return change - bounceOut(duration - time, 0, change, duration) + begin;
}

function elasticBlend(time: number, change: number, duration: number, amplitude: number, s: number, f: number): number {
  if (!change) return f;
  const t = Math.abs(s);
  let factor = amplitude ? (f * amplitude) / Math.abs(change) : 0;
  if (Math.abs(time * duration) < t) {
    const l = Math.abs(time * duration) / t;
    factor = factor * l + (1 - l);
  }
  return factor;
}

function elastic(
  mode: number,
  time: number,
  begin: number,
  change: number,
  duration: number,
  amplitudeIn: number,
  periodIn: number,
): number {
  if (time === 0) return begin;
  let amplitude = amplitudeIn;
  let f = 1;
  let s: number;
  if (mode === EASE_IN_OUT) {
    let t = time / (duration / 2);
    if (t === 2) return begin + change;
    t -= 1;
    const period = periodIn || duration * (0.3 * 1.5);
    if (!amplitude || amplitude < Math.abs(change)) {
      s = period / 4;
      f = elasticBlend(t, change, duration, amplitude, s, f);
      amplitude = change;
    } else {
      s = (period / (2 * Math.PI)) * Math.asin(change / amplitude);
    }
    const wave =
      amplitude * 2 ** (10 * (t < 0 ? t : -t)) * Math.sin((((t < 0 ? t : -t) * duration - s) * (2 * Math.PI)) / period);
    return t < 0 ? -0.5 * f * wave + begin : 0.5 * f * wave + change + begin;
  }
  let t = time / duration;
  if (t === 1) return begin + change;
  t = mode === EASE_IN ? t - 1 : -t;
  const period = periodIn || duration * 0.3;
  if (!amplitude || amplitude < Math.abs(change)) {
    s = period / 4;
    f = elasticBlend(t, change, duration, amplitude, s, f);
    amplitude = change;
  } else {
    s = (period / (2 * Math.PI)) * Math.asin(change / amplitude);
  }
  const wave = amplitude * 2 ** (10 * t) * Math.sin(((t * duration - s) * (2 * Math.PI)) / period);
  return mode === EASE_IN ? -f * wave + begin : f * wave + change + begin;
}

const POW_MIN = 0.0009765625;
const POW_SCALE = 1 / (1 - 0.0009765625);

function expoIn(time: number, begin: number, change: number, duration: number): number {
  if (time === 0) return begin;
  return change * (2 ** (10 * (time / duration - 1)) - POW_MIN) * POW_SCALE + begin;
}

function expoOut(time: number, begin: number, change: number, duration: number): number {
  if (time === 0) return begin;
  return change * (1 - (2 ** ((-10 * time) / duration) - POW_MIN) * POW_SCALE) + begin;
}

/** The polynomial easings: quad, cubic, quart and quint. */
function power(mode: number, exponent: number, time: number, begin: number, change: number, duration: number): number {
  const even = exponent % 2 === 0;
  if (mode === EASE_IN) return change * (time / duration) ** exponent + begin;
  if (mode === EASE_OUT) {
    if (exponent === 2) return -change * (time / duration) * (time / duration - 2) + begin;
    const t = time / duration - 1;
    return even ? -change * (t ** exponent - 1) + begin : change * (t ** exponent + 1) + begin;
  }
  let t = time / (duration / 2);
  if (t < 1) return (change / 2) * t ** exponent + begin;
  if (exponent === 2) {
    t -= 1;
    return (-change / 2) * (t * (t - 2) - 1) + begin;
  }
  t -= 2;
  return even ? (-change / 2) * (t ** exponent - 2) + begin : (change / 2) * (t ** exponent + 2) + begin;
}

/** Robert Penner's easing equations as Blender's `BLI_easing` implements them, for the segment starting at `key`. */
function eased(keys: Keys, key: number, time: number, begin: number, change: number, duration: number): number {
  const easing = keys.easing[key] ?? EASE_AUTO;
  const mode = (fallback: number) => (easing === EASE_AUTO ? fallback : easing);
  switch (keys.interpolation[key]) {
    case Interpolation.back: {
      const ease = mode(EASE_OUT);
      let overshoot = keys.back[key] ?? 0;
      if (ease === EASE_IN) {
        const t = time / duration;
        return change * t * t * ((overshoot + 1) * t - overshoot) + begin;
      }
      if (ease === EASE_OUT) {
        const t = time / duration - 1;
        return change * (t * t * ((overshoot + 1) * t + overshoot) + 1) + begin;
      }
      overshoot *= 1.525;
      let t = time / (duration / 2);
      if (t < 1) return (change / 2) * (t * t * ((overshoot + 1) * t - overshoot)) + begin;
      t -= 2;
      return (change / 2) * (t * t * ((overshoot + 1) * t + overshoot) + 2) + begin;
    }
    case Interpolation.bounce: {
      const ease = mode(EASE_OUT);
      if (ease === EASE_IN) return bounceIn(time, begin, change, duration);
      if (ease === EASE_OUT) return bounceOut(time, begin, change, duration);
      if (time < duration / 2) return bounceIn(time * 2, 0, change, duration) * 0.5 + begin;
      return bounceOut(time * 2 - duration, 0, change, duration) * 0.5 + change * 0.5 + begin;
    }
    case Interpolation.circ: {
      const ease = mode(EASE_IN);
      if (ease === EASE_IN) {
        const t = time / duration;
        return -change * (Math.sqrt(1 - t * t) - 1) + begin;
      }
      if (ease === EASE_OUT) {
        const t = time / duration - 1;
        return change * Math.sqrt(1 - t * t) + begin;
      }
      let t = time / (duration / 2);
      if (t < 1) return (-change / 2) * (Math.sqrt(1 - t * t) - 1) + begin;
      t -= 2;
      return (change / 2) * (Math.sqrt(1 - t * t) + 1) + begin;
    }
    case Interpolation.cubic:
      return power(mode(EASE_IN), 3, time, begin, change, duration);
    case Interpolation.quad:
      return power(mode(EASE_IN), 2, time, begin, change, duration);
    case Interpolation.quart:
      return power(mode(EASE_IN), 4, time, begin, change, duration);
    case Interpolation.quint:
      return power(mode(EASE_IN), 5, time, begin, change, duration);
    case Interpolation.elastic:
      return elastic(mode(EASE_OUT), time, begin, change, duration, keys.amplitude[key] ?? 0, keys.period[key] ?? 0);
    case Interpolation.expo: {
      const ease = mode(EASE_IN);
      if (ease === EASE_IN) return expoIn(time, begin, change, duration);
      if (ease === EASE_OUT) return expoOut(time, begin, change, duration);
      const half = duration * 0.5;
      if (time === 0) return begin;
      if (time === half) return begin + change * 0.5;
      return time < half
        ? expoIn(time, begin, change * 0.5, half)
        : expoOut(time - half, begin + change * 0.5, change * 0.5, half);
    }
    case Interpolation.sine: {
      const ease = mode(EASE_IN);
      if (ease === EASE_IN) return -change * Math.cos((time / duration) * (Math.PI / 2)) + change + begin;
      if (ease === EASE_OUT) return change * Math.sin((time / duration) * (Math.PI / 2)) + begin;
      return (-change / 2) * (Math.cos((Math.PI * time) / duration) - 1) + begin;
    }
    default:
      return begin;
  }
}

function isEqualWithin(a: number, b: number, threshold: number): boolean {
  return a > b ? a - b <= threshold : b - a <= threshold;
}

/** Blender's `BKE_fcurve_bezt_binarysearch_index_ex` with its 0.0001 threshold. */
function searchKey(keys: Keys, frame: number): { index: number; exact: boolean } {
  const threshold = 0.0001;
  const count = keys.count;
  const first = keys.frame[0] ?? 0;
  if (isEqualWithin(frame, first, threshold)) return { index: 0, exact: true };
  if (frame < first) return { index: 0, exact: false };
  const last = keys.frame[count - 1] ?? 0;
  if (isEqualWithin(frame, last, threshold)) return { index: count - 1, exact: true };
  if (frame > last) return { index: count, exact: false };
  let start = 0;
  let end = count;
  for (let loop = 0; start <= end && loop < count * 2; loop++) {
    const middle = start + Math.floor((end - start) / 2);
    const value = keys.frame[middle] ?? 0;
    if (isEqualWithin(frame, value, threshold)) return { index: middle, exact: true };
    if (frame > value) start = middle + 1;
    else if (frame < value) end = middle - 1;
  }
  return { index: start, exact: false };
}

function extrapolate(curve: FCurve, endpoint: number, neighbor: number, frame: number, side: "left" | "right"): number {
  const keys = curve.keys;
  const value = keys.value[endpoint] ?? 0;
  const interpolation = keys.interpolation[endpoint];
  if (interpolation === Interpolation.constant || !curve.linearExtrapolation) return value;
  const dx = (keys.frame[endpoint] ?? 0) - frame;
  if (interpolation === Interpolation.linear) {
    if (keys.count === 1) return value;
    const span = (keys.frame[neighbor] ?? 0) - (keys.frame[endpoint] ?? 0);
    if (span === 0) return value;
    return value - (((keys.value[neighbor] ?? 0) - value) / span) * dx;
  }
  const handleFrame = side === "left" ? keys.leftFrame[endpoint] : keys.rightFrame[endpoint];
  const handleValue = side === "left" ? keys.leftValue[endpoint] : keys.rightValue[endpoint];
  const span = (keys.frame[endpoint] ?? 0) - (handleFrame ?? 0);
  if (span === 0) return value;
  return value - ((value - (handleValue ?? 0)) / span) * dx;
}

/** Blender's `fcurve_eval_keyframes`. */
function evaluateKeys(curve: FCurve, frame: number): number {
  const keys = curve.keys;
  const last = keys.count - 1;
  if (last < 0) return 0;
  if (frame <= (keys.frame[0] ?? 0)) return extrapolate(curve, 0, 1, frame, "left");
  if ((keys.frame[last] ?? 0) <= frame) return extrapolate(curve, last, last - 1, frame, "right");
  const { index, exact } = searchKey(keys, frame);
  if (index > last) return keys.value[last] ?? 0;
  if (exact) return keys.value[index] ?? 0;
  const previous = index > 0 ? index - 1 : index;
  if (Math.abs((keys.frame[index] ?? 0) - frame) < 1e-8) return keys.value[index] ?? 0;
  const startFrame = keys.frame[previous] ?? 0;
  const endFrame = keys.frame[index] ?? 0;
  if (frame < startFrame || endFrame < frame) return 0;
  const begin = keys.value[previous] ?? 0;
  const change = (keys.value[index] ?? 0) - begin;
  const duration = endFrame - startFrame;
  const time = frame - startFrame;
  const interpolation = keys.interpolation[previous];
  if (interpolation === Interpolation.constant || curve.discrete || duration === 0) return begin;
  if (interpolation === Interpolation.bezier) return bezierValue(keys, previous, index, frame);
  if (interpolation === Interpolation.linear) return (change * time) / duration + begin;
  return eased(keys, previous, time, begin, change, duration);
}

function evaluateSamples(samples: Float32Array, start: number, frame: number): number {
  const count = samples.length;
  if (frame <= start) return samples[0] ?? 0;
  if (frame >= start + count - 1) return samples[count - 1] ?? 0;
  const fraction = Math.abs(frame - Math.floor(frame));
  const index = Math.trunc(frame) - Math.trunc(start);
  const value = samples[index] ?? 0;
  if (fraction !== 0 && fraction < 1) return value + ((samples[index + 1] ?? value) - value) * fraction;
  return value;
}

function rawValue(curve: FCurve, frame: number): number {
  if (curve.keys.count > 0) return evaluateKeys(curve, frame);
  if (curve.samples) return evaluateSamples(curve.samples, curve.sampleStart, frame);
  return 0;
}

function curveRange(curve: FCurve): [number, number] | null {
  const keys = curve.keys;
  if (keys.count > 0) return [keys.frame[0] ?? 0, keys.frame[keys.count - 1] ?? 0];
  if (curve.samples && curve.samples.length > 0)
    return [curve.sampleStart, curve.sampleStart + curve.samples.length - 1];
  return null;
}

/** Blender's `fcm_cycles_time`: where in the keyed range a frame outside it repeats, and the value offset to add. */
function cyclesTime(curve: FCurve, modifier: Extract<CurveModifier, { type: "cycles" }>, frame: number) {
  const range = curveRange(curve);
  if (!range) return { frame, offset: 0 };
  const [startFrame, endFrame] = range;
  let side = 0;
  let mode = 0;
  let cycles = 0;
  let origin = 0;
  if (frame < startFrame && modifier.before) {
    side = -1;
    mode = modifier.before;
    cycles = modifier.beforeCycles;
    origin = startFrame;
  } else if (frame > endFrame && modifier.after) {
    side = 1;
    mode = modifier.after;
    cycles = modifier.afterCycles;
    origin = endFrame;
  }
  if (side === 0 || mode === 0) return { frame, offset: 0 };
  const period = endFrame - startFrame;
  if (period === 0) return { frame, offset: 0 };
  const cycle = (side * (frame - origin)) / period;
  const within = (frame - origin) % period;
  if (cycles !== 0 && cycle > cycles) return { frame, offset: 0 };
  let offset = 0;
  if (mode === 2) {
    const count = side < 0 ? Math.floor((frame - origin) / period) : Math.ceil((frame - origin) / period);
    offset = count * (rawValue(curve, endFrame) - rawValue(curve, startFrame));
  }
  let time: number;
  if (within === 0) {
    time = side === 1 ? endFrame : startFrame;
    if (mode === 3 && Math.trunc(cycle) % 2) time = side === 1 ? startFrame : endFrame;
  } else if (mode === 3 && Math.trunc(cycle + 1) % 2) {
    time = side < 0 ? startFrame - within : endFrame - within;
  } else {
    time = startFrame + within;
  }
  if (time < startFrame) time += period;
  return { frame: time, offset };
}

function inRange(modifier: CurveModifier, frame: number): boolean {
  const { range } = modifier;
  return range === null || (range.start <= frame && frame <= range.end);
}

/** Blender's `eval_fmodifier_influence`: the modifier's influence, ramped over its blend frames. */
function influenceAt(modifier: CurveModifier, frame: number): number {
  const { range, influence } = modifier;
  if (range === null) return influence;
  if (frame < range.start || frame > range.end) return 0;
  if (range.blendIn !== 0 && frame <= range.start + range.blendIn) {
    return (influence * (frame - range.start)) / range.blendIn;
  }
  if (range.blendOut !== 0 && frame >= range.end - range.blendOut) {
    return (influence * (range.end - frame)) / range.blendOut;
  }
  return influence;
}

function mix(target: number, origin: number, factor: number): number {
  return factor * target + (1 - factor) * origin;
}

/**
 * The curve's value at a frame, with its Cycles, Stepped and Limits modifiers applied as Blender's
 * `evaluate_fcurve_ex` does: time modifiers last to first, then the curve, then value modifiers first to last.
 */
export function evaluateFCurve(curve: FCurve, frame: number): number {
  let time = frame;
  let offset = 0;
  for (let i = curve.modifiers.length - 1; i >= 0; i--) {
    const modifier = curve.modifiers[i];
    if (!modifier || !inRange(modifier, time)) continue;
    let target = time;
    if (modifier.type === "cycles") {
      if (i !== 0) continue;
      const cycled = cyclesTime(curve, modifier, time);
      target = cycled.frame;
      offset = cycled.offset;
    } else if (modifier.type === "stepped") {
      if (modifier.step === 0) continue;
      if ((modifier.noBefore && time < modifier.start) || (modifier.noAfter && time > modifier.end)) continue;
      target = Math.trunc((time - modifier.offset) / modifier.step) * modifier.step + modifier.offset;
    } else {
      if (modifier.flag & 1) target = Math.max(target, modifier.rect[0]);
      if (modifier.flag & 2) target = Math.min(target, modifier.rect[1]);
    }
    time = mix(target, time, influenceAt(modifier, time));
  }
  let value = rawValue(curve, time);
  curve.modifiers.forEach((modifier, i) => {
    if (!inRange(modifier, time)) return;
    let target = value;
    if (modifier.type === "cycles") {
      if (i !== 0) return;
      target = value + offset;
    } else if (modifier.type === "limits") {
      if (modifier.flag & 4) target = Math.max(target, modifier.rect[2]);
      if (modifier.flag & 8) target = Math.min(target, modifier.rect[3]);
    } else {
      return;
    }
    value = mix(target, value, influenceAt(modifier, time));
  });
  return value;
}

/** Whether every key of the curve holds its value until the next one. */
export function isStepped(curve: FCurve): boolean {
  if (curve.discrete) return true;
  const { count, interpolation } = curve.keys;
  if (count === 0) return false;
  for (let i = 0; i < count; i++) if (interpolation[i] !== Interpolation.constant) return false;
  return true;
}
