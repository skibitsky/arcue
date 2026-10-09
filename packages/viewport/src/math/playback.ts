import type { TimeSelection } from "@arcue/protocol";
import type { Clip } from "@arcue/scene";
import { frameToSeconds, secondsToFrame } from "@arcue/scene";
import type { PlaybackRange } from "../viewport";
import { clampToClip } from "./pose";

const MIN_SPEED = 0.25;
const MAX_SPEED = 2;

export interface PlaybackSettings {
  speed: number;
  loop: boolean;
  range: PlaybackRange | null;
}

export interface PlaybackStep {
  time: number;
  playing: boolean;
}

export function clampSpeed(speed: number): number {
  if (!Number.isFinite(speed)) return 1;
  return Math.min(MAX_SPEED, Math.max(MIN_SPEED, speed));
}

/** The range inside the clip, or null when there is none or it lies past the clip's end. */
export function clampRange(range: PlaybackRange | null, duration: number): PlaybackRange | null {
  if (!range || !Number.isFinite(range.start) || !Number.isFinite(range.end)) return null;
  const low = Math.min(range.start, range.end);
  const high = Math.max(range.start, range.end);
  if (low > duration) return null;
  const clamp = (seconds: number) => Math.min(Math.max(seconds, 0), duration);
  return { start: clamp(low), end: clamp(high) };
}

export type PlaybackClip = Pick<Clip, "duration" | "fps">;

/**
 * Moves the playback clock forward by `dt` seconds of wall time. A range or a looping clip plays every frame from its
 * start to its end inclusive, so the end frame shows for one frame's time before playback wraps: the clock runs up to
 * end + 1/fps, and `shownTime` holds the pose at the end meanwhile. Inside a range, playback always loops, and a clock
 * outside the range jumps to its start. Without a range, a clip that does not loop stops on its last frame.
 */
export function advancePlayback(
  time: number,
  dt: number,
  clip: PlaybackClip,
  settings: PlaybackSettings,
): PlaybackStep {
  const duration = clip.duration;
  if (!(duration > 0)) return { time: 0, playing: false };
  const frame = clip.fps > 0 ? 1 / clip.fps : 0;
  const next = time + Math.max(0, dt) * clampSpeed(settings.speed);
  const range = clampRange(settings.range, duration);
  if (range) {
    const period = range.end - range.start + frame;
    if (time < range.start - 1e-9 || time >= range.end + frame || period <= 0)
      return { time: range.start, playing: true };
    return { time: range.start + wrap(next - range.start, period), playing: true };
  }
  if (settings.loop) return { time: wrap(next, duration + frame), playing: true };
  if (next < duration) return { time: next, playing: true };
  return { time: duration, playing: false };
}

/** `value` modulo `period`, where a remainder that rounding leaves a hair below `period` counts as 0. */
function wrap(value: number, period: number): number {
  const remainder = value % period;
  return remainder >= period - 1e-9 ? 0 : remainder;
}

/** The time whose pose is on screen: the clock, held at the range's or the clip's end while that frame shows. */
export function shownTime(time: number, clip: PlaybackClip, range: PlaybackRange | null): number {
  const frame = clip.fps > 0 ? 1 / clip.fps : 0;
  const end = clampRange(range, clip.duration)?.end ?? clip.duration;
  return clampToClip(time > end && time < end + frame ? end : time, clip);
}

/** The start of the frame a time falls in, so a paused pose is exactly the pose of a frame. */
export function frameStart(time: number, clip: PlaybackClip): number {
  if (!(clip.fps > 0)) return clampToClip(time, clip);
  return clampToClip(frameToSeconds(secondsToFrame(time, clip.fps, "down"), clip.fps), clip);
}

/** Where playback starts when it is switched on: at the start when the time sits at the end of what would play. */
export function playbackStart(time: number, duration: number, settings: PlaybackSettings): number {
  const range = clampRange(settings.range, duration);
  if (range) return time < range.start || time >= range.end ? range.start : time;
  return time >= duration ? 0 : time;
}

export interface ResolvedTime {
  clip: Clip | null;
  seconds: number;
}

/** The clip and seconds a time selection names. A range resolves to its start frame; an unknown clip to null. */
export function resolveTimeSelection(clips: readonly Clip[], selection: TimeSelection): ResolvedTime | null {
  if (selection.kind === "none") return { clip: null, seconds: 0 };
  const clip = clips.find((candidate) => candidate.name === selection.clip);
  if (!clip) return null;
  const frame = selection.kind === "frame" ? selection.frame : selection.start;
  return { clip, seconds: clampToClip(frameToSeconds(frame, clip.fps), clip) };
}
