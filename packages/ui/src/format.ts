import type { TimeSelection } from "@arcue/protocol";
import type { PartView, SceneDescription, SpatialAnchor, TimeAnchor } from "@arcue/scene";
import {
  cleanClipName,
  countInRanges,
  defaultPartView,
  isDefaultPartView,
  viewBounds,
  visibleMeshes,
} from "@arcue/scene";

const numberFormat = new Intl.NumberFormat("en-US");

export function formatCount(value: number): string {
  return numberFormat.format(value);
}

export function plural(count: number, word: string, pluralWord = `${word}s`): string {
  return `${formatCount(count)} ${count === 1 ? word : pluralWord}`;
}

export function clipDisplayName(scene: SceneDescription | null, clip: string): string {
  return scene?.clips.find((candidate) => candidate.name === clip)?.displayName ?? cleanClipName(clip);
}

/** "Charge · f34" or "Run · f12–24"; null for a time without a clip. */
export function timeLabel(time: TimeSelection | TimeAnchor, displayName: (clip: string) => string): string | null {
  if (time.kind === "none") return null;
  const name = "clipDisplayName" in time ? time.clipDisplayName : displayName(time.clip);
  return time.kind === "frame" ? `${name} · f${time.frame}` : `${name} · f${time.start}–${time.end}`;
}

export function rangeLabel(range: { start: number; end: number }): string {
  return `f${range.start}–${range.end}`;
}

export function vertexCountOf(target: SpatialAnchor): number {
  return target.kind === "surface" ? 3 : countInRanges(target.vertices);
}

/** "Region · 46 vertices" or "Point · Head". */
export function targetLabel(target: SpatialAnchor, nearestBone: string | null): string {
  if (target.kind === "region") return `Region · ${plural(vertexCountOf(target), "vertex", "vertices")}`;
  return `Point · ${nearestBone ?? meshName(target.mesh)}`;
}

export function meshName(meshPath: string): string {
  const segments = meshPath.split("/");
  return segments[segments.length - 1] ?? meshPath;
}

const twoDigits = (value: number) => String(value).padStart(2, "0");

export function formatClock(date: Date): string {
  return `${twoDigits(date.getHours())}:${twoDigits(date.getMinutes())}`;
}

const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** "Just now", "14:02", "Yesterday 18:40", "Monday", or "Mar 4". */
export function formatWhen(iso: string, now: Date): string {
  const date = new Date(iso);
  const elapsed = now.getTime() - date.getTime();
  if (elapsed >= 0 && elapsed < 60_000) return "Just now";
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
  if (days === 0) return formatClock(date);
  if (days === 1) return `Yesterday ${formatClock(date)}`;
  if (days > 1 && days < 7) return weekdays[date.getDay()] ?? formatClock(date);
  return `${months[date.getMonth()]} ${date.getDate()}`;
}

export interface SceneStats {
  triangles: number;
  bones: number;
  clips: number;
  height: number;
}

/** Figures for what a view draws, by default LOD0 without collision helpers. Height is 0 when it draws nothing. */
export function sceneStats(scene: SceneDescription, view: PartView = defaultPartView()): SceneStats {
  const visible = visibleMeshes(scene.parts, view);
  const triangles = scene.meshes.reduce(
    (sum, mesh, index) => (visible.has(index) ? sum + mesh.indices.length / 3 : sum),
    0,
  );
  const bones = scene.nodes.filter((node) => node.kind === "bone").length;
  const bounds = isDefaultPartView(view) ? scene.bounds : viewBounds(scene.meshes, scene.parts, view);
  const height = bounds ? bounds.max[1] - bounds.min[1] : 0;
  return { triangles, bones, clips: scene.clips.length, height };
}

export function formatHeight(meters: number): string {
  return meters >= 0.1 ? `${meters.toFixed(1)} m tall` : `${(meters * 100).toFixed(1)} cm tall`;
}

export function formatSeconds(seconds: number, digits = 3): string {
  return `${seconds.toFixed(digits)} s`;
}

export function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
}

/** Shortcut text for tooltips: "⌘⇧C" on macOS, "Ctrl+Shift+C" elsewhere. */
export function modShortcut(key: string, options: { shift?: boolean } = {}): string {
  if (isMacPlatform()) return `⌘${options.shift ? "⇧" : ""}${key}`;
  return `Ctrl+${options.shift ? "Shift+" : ""}${key}`;
}
