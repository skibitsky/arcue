export type TrackProperty = "translation" | "rotation" | "scale" | "weights";

export type Interpolation = "linear" | "step";

export interface Track {
  node: number;
  property: TrackProperty;
  interpolation: Interpolation;
  /** Seconds from the start of the clip. */
  times: Float32Array;
  /**
   * Per key: three values for translation and scale, an xyzw quaternion for rotation, and for weights one value per
   * morph target, from 0 to 1.
   */
  values: Float32Array;
}

export interface Clip {
  /**
   * The name in the file, such as "Armature|Charge", made unique and non-empty by `clipNames`.
   * It identifies the clip in anchors and commands.
   */
  name: string;
  /** The name without its "Armature|" style prefix, unique within the scene, for people to read. */
  displayName: string;
  fps: number;
  duration: number;
  /**
   * Frames run from 0 to frameCount - 1, where frameCount is round(duration × fps) + 1, so a clip spanning frames
   * 0 to 60 has 61 frames and the clip list shows "60 f". When the clip is not a whole number of frames long, the last
   * frame is the one nearest its end, and its pose is clamped to `duration`.
   */
  frameCount: number;
  tracks: Track[];
  /** Sorted unique times, in seconds, where the file has a key on any curve. The timeline's key ticks use them. */
  keyTimes: Float32Array;
  /** Every animated curve in the file has a key on every frame; see `isKeyedEveryFrame`. */
  keyedEveryFrame: boolean;
}

const UNTITLED_CLIP = "Untitled clip";

/** The name a clip without one gets as its identity. */
export const UNNAMED_CLIP = "(unnamed)";

/**
 * Identities for a file's clips, in the same order. Every clip keeps its name in the file when it is the first to
 * use it. An empty name becomes "(unnamed)", and a repeated or empty name gets the lowest "#2", "#3" suffix that no
 * clip in the file uses, so no clip loses its own name to a generated one.
 */
export function clipNames(rawNames: readonly string[]): string[] {
  const reserved = new Set(rawNames.filter((raw) => raw !== ""));
  const taken = new Set<string>();
  return rawNames.map((raw) => {
    const base = raw === "" ? UNNAMED_CLIP : raw;
    let candidate = base;
    if (raw === "" || taken.has(raw)) {
      for (let suffix = 2; taken.has(candidate) || reserved.has(candidate); suffix++) candidate = `${base}#${suffix}`;
    }
    taken.add(candidate);
    return candidate;
  });
}

export function cleanClipName(name: string): string {
  const separator = name.lastIndexOf("|");
  const cleaned = (separator === -1 ? name : name.slice(separator + 1)).trim();
  if (cleaned !== "") return cleaned;
  return name.trim() === "" ? UNTITLED_CLIP : name.trim();
}

/**
 * Display names for a file's clips, in the same order. Clips whose cleaned names collide keep their full names,
 * and any names still equal get " (2)", " (3)" and so on.
 */
export function displayNames(names: readonly string[]): string[] {
  const cleaned = names.map(cleanClipName);
  const counts = new Map<string, number>();
  for (const name of cleaned) counts.set(name, (counts.get(name) ?? 0) + 1);
  const taken = new Set<string>();
  return names.map((name, index) => {
    const clean = cleaned[index] ?? UNTITLED_CLIP;
    const preferred = (counts.get(clean) ?? 0) > 1 && name.trim() !== "" ? name.trim() : clean;
    let candidate = preferred;
    for (let suffix = 2; taken.has(candidate); suffix++) candidate = `${preferred} (${suffix})`;
    taken.add(candidate);
    return candidate;
  });
}
