import type { CommentStatus, FrameRange, ReviewFile } from "@arcue/protocol";
import type { Clip } from "@arcue/scene";
import { lastFrame } from "@arcue/scene";
import { currentMessage, lastRound } from "./history";

export interface RulerTick {
  frame: number;
  major: boolean;
}

export interface Ruler {
  /** Frame ticks, or the clip's key ticks when it is not keyed on every frame. */
  ticks: RulerTick[];
  labels: number[];
  mode: "frames" | "keys";
}

function labelStep(last: number, width: number): number {
  const preferred = last <= 12 ? 1 : last <= 36 ? 5 : last <= 80 ? 10 : 20;
  const pxPerFrame = width / Math.max(1, last);
  const steps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
  return steps.find((step) => step >= preferred && step * pxPerFrame >= 40) ?? 1000;
}

/** Ticks and labels for a clip whose last frame is `last`, drawn `width` pixels wide. */
export function rulerTicks(last: number, width: number, keys: readonly number[] | null): Ruler {
  if (last <= 0) return { ticks: [], labels: [], mode: "frames" };
  const every = labelStep(last, width);
  const pxPerFrame = width / last;
  const labels: number[] = [];
  for (let frame = 0; frame <= last; frame += every) {
    if (frame === 0 || (last - frame) * pxPerFrame > 26) labels.push(frame);
  }
  if (labels[labels.length - 1] !== last) labels.push(last);
  if (keys) {
    const ticks = keys.filter((frame) => frame >= 0 && frame <= last).map((frame) => ({ frame, major: true }));
    return { ticks, labels, mode: "keys" };
  }
  const minorStep = pxPerFrame >= 3 ? 1 : pxPerFrame >= 1.2 ? 2 : pxPerFrame >= 0.5 ? 5 : every;
  const ticks: RulerTick[] = [];
  for (let frame = 0; frame <= last; frame++) {
    const major = frame % every === 0 || frame === last;
    if (major || frame % minorStep === 0) ticks.push({ frame, major });
  }
  return { ticks, labels, mode: "frames" };
}

/** Frames of the clip's key times; null when every curve has a key on every frame. */
export function keyFrames(clip: Clip): number[] | null {
  if (clip.keyedEveryFrame) return null;
  const frames = new Set<number>();
  for (const time of clip.keyTimes) frames.add(Math.round(time * clip.fps));
  return [...frames].sort((a, b) => a - b);
}

/** The next key after `frame`, or the previous one before it; null when there is none. */
export function adjacentKey(clip: Clip, frame: number, direction: 1 | -1): number | null {
  const keys = keyFrames(clip) ?? Array.from({ length: clip.frameCount }, (_, index) => index);
  const candidates = direction > 0 ? keys.filter((key) => key > frame) : keys.filter((key) => key < frame).reverse();
  return candidates[0] ?? null;
}

export function clampFrame(frame: number, clip: Clip): number {
  return Math.max(0, Math.min(lastFrame(clip), Math.round(frame)));
}

export function stepFrame(frame: number, delta: number, last: number, loop: boolean): number {
  const next = frame + delta;
  if (next < 0) return loop ? last : 0;
  if (next > last) return loop ? 0 : last;
  return next;
}

export function frameAt(ratio: number, last: number): number {
  return Math.round(Math.max(0, Math.min(1, ratio)) * last);
}

export function percentOf(frame: number, last: number): string {
  return last > 0 ? `${((frame / last) * 100).toFixed(3)}%` : "0%";
}

export function normalizeRange(a: number, b: number): FrameRange | null {
  const start = Math.min(a, b);
  const end = Math.max(a, b);
  return end > start ? { start, end } : null;
}

export interface TimelineMarker {
  id: string;
  /** The draft's queue number; null for sent and resolved comments. */
  number: number | null;
  status: CommentStatus;
  text: string;
  round: number | null;
  selected: boolean;
}

export interface MarkerBar extends TimelineMarker {
  start: number;
  end: number;
}

export interface MarkerDots {
  frame: number;
  markers: TimelineMarker[];
}

/** Markers of the clip's comments: a bar per range, and dots grouped by frame. */
export function timelineMarkers(
  review: ReviewFile | null,
  clip: string | null,
  selection: string | null,
): { bars: MarkerBar[]; dots: MarkerDots[] } {
  if (!review || clip === null) return { bars: [], dots: [] };
  const numbers = new Map(review.queue.map((id, index) => [id, index + 1]));
  const bars: MarkerBar[] = [];
  const dots = new Map<number, TimelineMarker[]>();
  const ordered = [...review.comments].sort((a, b) => rank(a.status) - rank(b.status));
  for (const comment of ordered) {
    const time = comment.time;
    if (time.kind === "none" || time.clip !== clip) continue;
    const marker: TimelineMarker = {
      id: comment.id,
      number: numbers.get(comment.id) ?? null,
      status: comment.status,
      text: currentMessage(comment),
      round: lastRound(comment),
      selected: comment.id === selection,
    };
    if (time.kind === "range") bars.push({ ...marker, start: time.start, end: time.end });
    else dots.set(time.frame, [...(dots.get(time.frame) ?? []), marker]);
  }
  const grouped = [...dots].sort(([a], [b]) => a - b).map(([frame, markers]) => ({ frame, markers }));
  return { bars, dots: grouped };
}

function rank(status: CommentStatus): number {
  return status === "draft" ? 2 : status === "sent" ? 1 : 0;
}

export function draftCountsByClip(review: ReviewFile | null): Map<string | null, number> {
  const counts = new Map<string | null, number>();
  if (!review) return counts;
  const queued = new Set(review.queue);
  for (const comment of review.comments) {
    if (!queued.has(comment.id)) continue;
    const key = comment.time.kind === "none" ? null : comment.time.clip;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

export const SPEEDS = [0.25, 0.5, 1, 1.5, 2] as const;
