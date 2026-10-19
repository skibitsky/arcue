import type { BlendStruct } from "../blend/file.js";
import { unseenList } from "../blend/lists.js";
import type { Action, ActionUse } from "./actions.js";
import {
  ADT_NLA_EDIT_ON,
  ADT_NLA_EVAL_OFF,
  ADT_NLA_EVAL_UPPER_TRACKS,
  ADT_NLA_SOLO_TRACK,
  actionRange,
  NLASTRIP_MUTED,
  NLATRACK_DISABLED,
  parsePosePath,
  parseShapeKeyPath,
  slotFor,
  slotHandle,
  trackPlays,
} from "./actions.js";
import type { FCurve } from "./fcurve.js";
import { evaluateFCurve, hasActiveModifiers, keyFrames, readFCurve } from "./fcurve.js";

const StripFlag = {
  userInfluence: 1 << 5,
  userTime: 1 << 6,
  userTimeCyclic: 1 << 7,
  syncLength: 1 << 9,
  reverse: 1 << 11,
  noTimeMap: 1 << 29,
} as const;
const ADT_NLA_EDIT_NOMAP = 1 << 3;

const StripType = { clip: 0, transition: 1, meta: 2 } as const;
const Extend = { hold: 0, holdForward: 1, nothing: 2 } as const;
const BlendMode = { replace: 0, add: 1, subtract: 2, multiply: 3, combine: 4 } as const;
const BLEND_MODES: ReadonlySet<number> = new Set(Object.values(BlendMode));

const FLOAT_EPSILON = 2 ** -23;
/** The deepest meta strips nest that players follow. */
export const MAX_META_DEPTH = 64;

/** Blender's `IS_EQF`. */
function isEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < FLOAT_EPSILON;
}

/** A closed stretch of the scene's clock, from its first time to its last. */
export type Span = readonly [from: number, to: number];

const EVERYWHERE: readonly Span[] = [[Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY]];

/** The place of the first of `spans`, which are in order, that ends at or after `time`. */
function firstReaching(spans: readonly Span[], time: number): number {
  let low = 0;
  let high = spans.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if ((spans[middle]?.[1] ?? Number.NaN) < time) low = middle + 1;
    else high = middle;
  }
  return low;
}

/** Whether `time` lies in one of `spans`, which are in order. */
function inSpans(spans: readonly Span[], time: number): boolean {
  const span = spans[firstReaching(spans, time)];
  return span !== undefined && time >= span[0] && time <= span[1];
}

/** The parts of `spans` from `from` to `to`. */
export function clampSpans(spans: readonly Span[], [from, to]: Span): Span[] {
  const clamped: Span[] = [];
  for (const [start, end] of spans) {
    const low = Math.max(start, from);
    const high = Math.min(end, to);
    if (low <= high) clamped.push([low, high]);
  }
  return clamped;
}

/** The stretches that `a` or `b`, each in order, cover: in order and apart. */
export function joinSpans(a: readonly Span[], b: readonly Span[]): Span[] {
  const all = [...a, ...b].sort((x, y) => x[0] - y[0]);
  const joined: [number, number][] = [];
  for (const [from, to] of all) {
    const last = joined[joined.length - 1];
    if (last && from <= last[1]) last[1] = Math.max(last[1], to);
    else joined.push([from, to]);
  }
  return joined;
}

/** The parts of `spans` outside `cut`, both in order and apart; each part keeps its ends, which `cut` may share. */
export function withoutSpans(spans: readonly Span[], cut: readonly Span[]): Span[] {
  const left: Span[] = [];
  for (const [from, to] of spans) {
    let start = from;
    for (let index = firstReaching(cut, start); index < cut.length && start <= to; index++) {
      const [cutFrom, cutTo] = cut[index] ?? [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
      if (cutFrom > to) break;
      if (cutFrom > start) left.push([start, cutFrom]);
      start = Math.max(start, cutTo);
      if (cutTo >= to) start = Number.POSITIVE_INFINITY;
    }
    if (start <= to) left.push([start, to]);
  }
  return left;
}

/**
 * Blender's `BKE_action_frame_range_calc` with modifiers, which bounds the active action when NLA strips play under
 * it: the frames its keys span, widened by the last modifier of each curve, and at least one frame long.
 */
function keyedRange(action: Action): [number, number] {
  let start = Number.POSITIVE_INFINITY;
  let end = Number.NEGATIVE_INFINITY;
  let found = false;
  for (const curve of action.slots.flatMap((slot) => slot.curves)) {
    const frames = keyFrames(curve);
    if (frames.length > 0) {
      start = Math.min(start, frames[0] ?? start);
      end = Math.max(end, frames[frames.length - 1] ?? end);
      found = true;
    }
    const last = curve.modifiers[curve.modifiers.length - 1];
    if (!last && curve.unsupportedModifiers.length === 0) continue;
    found = true;
    if (last?.type === "cycles") {
      if (last.before !== "none") start = Number.NEGATIVE_INFINITY;
      if (last.after !== "none") end = Number.POSITIVE_INFINITY;
    } else if (last?.type === "limits") {
      if (last.minFrame !== null) start = Math.min(start, last.minFrame);
      if (last.maxFrame !== null) end = Math.max(end, last.maxFrame);
    } else {
      return [Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY];
    }
  }
  if (!found) return [0, 1];
  return [start, start === end ? end + 1 : end];
}

/** An NLA strip's settings as the file saves them, or as Blender makes them for the action track and a tweaked strip. */
interface StripSettings {
  /** The strip in the file, which holds its curves and modifiers; null for the action track's strip. */
  struct: BlendStruct | null;
  type: number;
  flag: number;
  start: number;
  end: number;
  actionStart: number;
  actionEnd: number;
  repeat: number;
  scale: number;
  blendIn: number;
  blendOut: number;
  blendMode: number;
  extendMode: number;
  influence: number;
  time: number;
  action: BlendStruct | null;
  slot: number;
}

/** A strip read once, with a repeat and scale it can play by, and where it sits among the strips of its track. */
interface Strip extends StripSettings {
  reverse: boolean;
  /** Whether Blender plays nothing of it: muted, or at no influence. */
  silent: boolean;
  /** Whether Blender blends it with what plays under it other than by replacing it in full, or retimes it. */
  blends: boolean;
  /** The meta strip it sits in, or null for a strip on the track itself. */
  parent: Strip | null;
  /** The strips inside a meta strip. */
  inner: StripList;
}

/**
 * A stretch of a strip list's time from the end of the piece before it to `to`, and `to` itself when `closed`: the
 * strip that Blender picks there, or null, at the time itself or held at `held` throughout.
 */
interface Piece {
  to: number;
  closed: boolean;
  strip: Strip | null;
  held: number | null;
}

/** Strips side by side, on a track or in a meta strip, the pieces of their time, and the stretches each strip plays. */
interface StripList {
  strips: Strip[];
  pieces: Piece[];
  /** The stretches of the list's time where each strip plays, with the time it holds there, if any. */
  stretches: Map<Strip, { span: Span; held: number | null }[]>;
}

function stripSettings(strip: BlendStruct): StripSettings {
  return {
    struct: strip,
    type: strip.number("type"),
    flag: strip.number("flag"),
    start: strip.number("start"),
    end: strip.number("end"),
    actionStart: strip.number("actstart"),
    actionEnd: strip.number("actend"),
    repeat: strip.number("repeat"),
    scale: strip.number("scale"),
    blendIn: strip.number("blendin"),
    blendOut: strip.number("blendout"),
    blendMode: strip.number("blendmode"),
    extendMode: strip.number("extendmode"),
    influence: strip.number("influence"),
    time: strip.number("strip_time"),
    action: strip.deref("act"),
    slot: slotHandle(strip, "action_slot_handle"),
  };
}

function emptyList(): StripList {
  return { strips: [], pieces: [], stretches: new Map() };
}

/**
 * Whether a strip plays the action's frame equal to the scene's time, as Blender makes the action track and a tweaked
 * strip it does not remap, rather than through its range, scale and repeats.
 */
function keepsTime(strip: StripSettings): boolean {
  return (strip.flag & StripFlag.noTimeMap) !== 0;
}

function stripOf(settings: StripSettings, parent: Strip | null): Strip {
  const { flag, influence } = settings;
  const userInfluence = (flag & StripFlag.userInfluence) !== 0;
  const scale = Math.abs(settings.scale);
  const repeat = settings.repeat;
  return {
    ...settings,
    scale: Number.isFinite(scale) && scale > 0 ? scale : 1,
    repeat: Math.abs(repeat) < FLOAT_EPSILON || !Number.isFinite(repeat) ? 1 : repeat,
    reverse: (flag & StripFlag.reverse) !== 0,
    silent: (flag & NLASTRIP_MUTED) !== 0 || (userInfluence && influence <= 0),
    blends:
      settings.blendMode !== BlendMode.replace ||
      ((flag & StripFlag.userTime) !== 0 && !keepsTime(settings)) ||
      (userInfluence ? influence < 1 : settings.blendIn !== 0 || settings.blendOut !== 0),
    parent,
    inner: emptyList(),
  };
}

/**
 * The pieces of a strip list's time, as Blender's `nlastrips_ctime_get_strip` reads the list in order: the first strip
 * whose end is not yet past plays within its range, before it the strip before it holds its end unless it extends
 * nothing, and past every strip the last one holds its end the same way. The first strip holds its start before itself
 * only when it holds both ways. A strip that keeps the scene's time, as Blender makes for the action track and for a
 * tweaked strip it does not remap, plays at the time itself as far as it extends.
 */
function piecesOf(strips: readonly Strip[]): Piece[] {
  const pieces: Piece[] = [];
  const add = (to: number, closed: boolean, strip: Strip | null, held: number | null) => {
    const last = pieces[pieces.length - 1];
    if (last && !(to > last.to || (to === last.to && closed && !last.closed))) return;
    pieces.push({ to, closed, strip, held });
  };
  strips.forEach((strip, index) => {
    const previous = strips[index - 1];
    const always = keepsTime(strip) && strip.extendMode === Extend.hold;
    const onward = always || (keepsTime(strip) && strip.extendMode === Extend.holdForward);
    if (!always) {
      if (previous) add(strip.start, false, previous.extendMode !== Extend.nothing ? previous : null, previous.end);
      else add(strip.start, false, strip.extendMode === Extend.hold ? strip : null, strip.start);
    }
    add(onward ? Number.POSITIVE_INFINITY : strip.end, true, strip, null);
  });
  const last = strips[strips.length - 1];
  add(Number.POSITIVE_INFINITY, true, last && last.extendMode !== Extend.nothing ? last : null, last?.end ?? null);
  return pieces;
}

/** The stretches of a list's time where each strip plays, from its pieces. */
function stretchesOf(pieces: readonly Piece[]): Map<Strip, { span: Span; held: number | null }[]> {
  const stretches = new Map<Strip, { span: Span; held: number | null }[]>();
  let from = Number.NEGATIVE_INFINITY;
  for (const piece of pieces) {
    const span: Span = [from, piece.to];
    from = piece.to;
    if (!piece.strip || piece.strip.silent) continue;
    const list = stretches.get(piece.strip) ?? [];
    list.push({ span, held: piece.held });
    stretches.set(piece.strip, list);
  }
  return stretches;
}

/** Works out the pieces and stretches of a list whose strips are all read. */
function settle(list: StripList): void {
  list.pieces = piecesOf(list.strips);
  list.stretches = stretchesOf(list.pieces);
}

/** One strip as a list of its own. */
function soleStrip(strip: Strip): StripList {
  const list: StripList = { ...emptyList(), strips: [strip] };
  settle(list);
  return list;
}

/** The strip Blender picks in a list at `time`, muted or not, and the time it plays at, clamped where it only holds. */
function stripAt(list: StripList, time: number): { strip: Strip; time: number } | null {
  const { pieces } = list;
  let low = 0;
  let high = pieces.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    const piece = pieces[middle];
    if (piece && (time < piece.to || (time === piece.to && piece.closed))) high = middle;
    else low = middle + 1;
  }
  const piece = pieces[low];
  return piece?.strip ? { strip: piece.strip, time: piece.held ?? time } : null;
}

/** The length of a strip's action range, and how long one repeat of it lasts in the strip. */
function cycle(strip: Strip): { length: number; span: number } {
  const range = strip.actionEnd - strip.actionStart;
  const length = Math.abs(range) < FLOAT_EPSILON ? 1 : range;
  return { length, span: length * strip.scale };
}

/** Blender's `nlastrip_get_frame_actionclip`: the action's frame that an action strip plays at `time`. */
function actionFrame(strip: Strip, time: number): number {
  const { span } = cycle(strip);
  const whole = isEqual(time, strip.end) && isEqual(strip.repeat, Math.floor(strip.repeat));
  const played = ((time - strip.start) % span) / strip.scale;
  if (strip.reverse) return whole ? strip.actionStart : strip.actionEnd - played;
  return whole ? strip.actionEnd : strip.actionStart + played;
}

/** The time inside a meta strip at `time` outside it, and the reverse: mirrored when the meta plays reversed. */
function innerTime(meta: Strip, time: number): number {
  return meta.reverse ? meta.start + meta.end - time : time;
}

/** The action strip a track plays at `time`, through its meta strips, and the action's frame it plays there. */
function trackFrame(top: StripList, time: number): { strip: Strip; frame: number } | null {
  let list = top;
  let at = time;
  for (;;) {
    const found = stripAt(list, at);
    if (!found || found.strip.silent) return null;
    const { strip } = found;
    if (strip.type === StripType.clip) {
      return { strip, frame: keepsTime(strip) ? found.time : actionFrame(strip, found.time) };
    }
    if (strip.type !== StripType.meta) return null;
    list = strip.inner;
    at = innerTime(strip, found.time);
  }
}

/** The clock times from `from` to `to` where the frame a player plays can jump; null when there are more than `limit`. */
export type Breaks = (from: number, to: number, limit: number) => number[] | null;

/**
 * The clock times on a track where the frame a strip plays can jump, or a strip starts or stops playing: where every
 * strip, inside meta strips too, starts, ends or starts a repeat. A strip that keeps the scene's time breaks only where
 * it starts or stops playing.
 */
function trackBreaks(top: StripList): Breaks {
  return (from, to, limit) => {
    const times: number[] = [];
    const pending = [{ list: top, sign: 1, shift: 0, low: from, high: to }];
    for (let entry = pending.pop(); entry; entry = pending.pop()) {
      const { sign, shift, low, high } = entry;
      const outer = (time: number) => sign * time + shift;
      const add = (time: number) => {
        const at = outer(time);
        if (at >= low && at <= high) times.push(at);
        return times.length <= limit;
      };
      const [first, last] = sign > 0 ? [low - shift, high - shift] : [shift - high, shift - low];
      for (const strip of entry.list.strips) {
        if (keepsTime(strip)) {
          if (strip.extendMode !== Extend.hold && !add(strip.start)) return null;
          if (strip.extendMode === Extend.nothing && !add(strip.end)) return null;
          continue;
        }
        if (!add(strip.start) || !add(strip.end)) return null;
        if (strip.type === StripType.meta) {
          const [start, end] = [outer(strip.start), outer(strip.end)].sort((a, b) => a - b);
          const mirrored = { sign: -sign, shift: sign * (strip.start + strip.end) + shift };
          const range = { low: Math.max(low, start ?? low), high: Math.min(high, end ?? high) };
          pending.push({ list: strip.inner, ...(strip.reverse ? mirrored : { sign, shift }), ...range });
          continue;
        }
        const { span } = cycle(strip);
        if (strip.type !== StripType.clip || !(span > 0)) continue;
        for (let k = Math.max(1, Math.ceil((first - strip.start) / span)); ; k++) {
          const at = strip.start + k * span;
          if (!(at < strip.end && at <= last)) break;
          if (!add(at)) return null;
        }
      }
    }
    return times;
  };
}

/** Players that never play at once, such as the strips of one NLA track, and which of them plays at a clock time. */
export interface Lane {
  playing(time: number): Player | null;
}

/**
 * Where a use of an action plays on the scene's clock, Blender's `ctime`: the scene frame times the time remapping's
 * `framelen`.
 */
export interface Player {
  /** The action's frame that plays at a clock time, or null where the use plays none of it. */
  frameAt(time: number): number | null;
  /** Whether it plays the action's frame equal to the clock time at every time. */
  direct: boolean;
  /** The stretches of the clock where it plays some frame of the action, in order and apart. */
  spans: readonly Span[];
  /** The clock times within `within`, stretches in order, at which it plays each of `frames`: sorted, at most `limit`. */
  timesOf(frames: readonly number[], within: readonly Span[], limit: number): number[];
  /**
   * Where the frame it plays can jump, or stop or start being one: where strips start, end or repeat. The players of
   * one NLA track share this function, which gives those times for every strip on the track.
   */
  breaks: Breaks;
  /** Whether Blender blends it with what plays under it, which the preview leaves out. */
  blends: boolean;
  /** The lane it shares with the other strips of its NLA track, or null for an active or stashed action. */
  lane: Lane | null;
}

/** One NLA track, read once: its strips, which strip it plays at the last time asked, and where strips break. */
interface TrackTiming {
  top: StripList;
  byOffset: Map<number, Strip>;
  /** Whether meta strips nest deeper than `MAX_META_DEPTH`, which players leave out. */
  tooDeep: boolean;
  /** Whether it holds a transition strip, which blends the strips on either side of it. */
  transition: boolean;
  breaks: Breaks;
  at(time: number): { strip: Strip; frame: number } | null;
  /** The player of each of its action strips that a use plays, made once. */
  players: Map<Strip, Player>;
  lane: Lane;
}

/** Reads a track's strips, leaving out those `seen` holds, as another track's, and adding the rest to it. */
function readTrack(track: BlendStruct, seen: Set<number>): TrackTiming {
  const top = emptyList();
  const byOffset = new Map<number, Strip>();
  const lists = [top];
  let tooDeep = false;
  let transition = false;
  const pending = unseenList(track, "strips", seen).map((struct) => ({
    struct,
    parent: null as Strip | null,
    depth: 0,
  }));
  for (let next = 0; next < pending.length; next++) {
    const entry = pending[next];
    if (!entry) continue;
    const strip = stripOf(stripSettings(entry.struct), entry.parent);
    byOffset.set(entry.struct.offset, strip);
    (entry.parent?.inner ?? top).strips.push(strip);
    if (strip.type === StripType.transition) transition = true;
    const inner = unseenList(entry.struct, "strips", seen);
    if (inner.length === 0) continue;
    if (entry.depth >= MAX_META_DEPTH) {
      tooDeep = true;
      continue;
    }
    lists.push(strip.inner);
    for (const struct of inner) pending.push({ struct, parent: strip, depth: entry.depth + 1 });
  }
  for (const list of lists) settle(list);
  return trackTiming(top, byOffset, tooDeep, transition);
}

/**
 * The tweaked strip's track as Blender plays it in NLA tweak mode, `nlastrips_ctime_get_strip_single`: the strip
 * alone, as `tweakStrip` makes it, so the other strips of its track neither cut it short nor play.
 */
function tweakedTrack(strip: Strip): TrackTiming {
  const byOffset = new Map<number, Strip>(strip.struct ? [[strip.struct.offset, strip]] : []);
  return trackTiming(soleStrip(strip), byOffset, false, false);
}

function trackTiming(top: StripList, byOffset: Map<number, Strip>, tooDeep: boolean, transition: boolean): TrackTiming {
  let lastTime = Number.NaN;
  let last: { strip: Strip; frame: number } | null = null;
  const at = (time: number) => {
    if (time !== lastTime) {
      lastTime = time;
      last = trackFrame(top, time);
    }
    return last;
  };
  const players = new Map<Strip, Player>();
  const lane: Lane = {
    playing: (time) => {
      const found = at(time);
      return found ? (players.get(found.strip) ?? null) : null;
    },
  };
  return { top, byOffset, tooDeep, transition, breaks: trackBreaks(top), at, players, lane };
}

/** The NLA tracks that players read, each track read once, and each strip read with the first track that lists it. */
export class NlaTracks {
  readonly #read = new Map<number, TrackTiming>();
  readonly #tweaked = new Map<number, TrackTiming | null>();
  readonly #seen = new Set<number>();

  of(track: BlendStruct): TrackTiming {
    let timing = this.#read.get(track.offset);
    if (!timing) {
      timing = readTrack(track, this.#seen);
      this.#read.set(track.offset, timing);
    }
    return timing;
  }

  /**
   * The track of the strip that the animation data tweaks in NLA tweak mode, as Blender plays it: that strip alone, as
   * `tweakStrip` makes it from `action`, the strip's action. Null where the animation data names no tweaked strip.
   */
  tweaked(adt: BlendStruct, action: Action): TrackTiming | null {
    let timing = this.#tweaked.get(adt.offset);
    if (timing === undefined) {
      const strip = tweakStrip(adt, action);
      timing = strip ? tweakedTrack(strip) : null;
      this.#tweaked.set(adt.offset, timing);
    }
    return timing;
  }

  /** Whether a track that players read has meta strips nested deeper than `MAX_META_DEPTH`. */
  get tooDeep(): boolean {
    return [...this.#read.values()].some((timing) => timing.tooDeep);
  }
}

/** The tracks Blender evaluates: those `trackPlays` lets play, with the track of the tweaked strip in tweak mode. */
function evaluatedTracks(adt: BlendStruct): BlendStruct[] {
  const flag = adt.number("flag");
  const edited = (flag & ADT_NLA_EDIT_ON) !== 0 ? adt.deref("act_track")?.offset : undefined;
  return adt.list("nla_tracks").filter((track) => trackPlays(flag, track, track.offset === edited));
}

/**
 * Whether NLA strips play under an ID's active action, so that Blender plays it by the NLA's rules: where a track it
 * evaluates has strips, or a strip is tweaked. Otherwise `animsys_evaluate_nla_for_flush` plays the active action as
 * if there were no NLA.
 */
function stripsUnder(adt: BlendStruct): boolean {
  if (adt.list("nla_tracks").length === 0 || (adt.number("flag") & ADT_NLA_EVAL_OFF) !== 0) return false;
  return adt.deref("actstrip") !== null || evaluatedTracks(adt).some((track) => track.list("strips").length > 0);
}

/**
 * Blender's `animsys_create_action_track_strip`: the action track's action as a strip that keeps the scene's time,
 * which plays over the NLA within the frames its keys span, as far as it extends.
 */
function actionTrackStrip(adt: BlendStruct, action: Action, slot: number): Strip {
  const [start, end] = keyedRange(action);
  const settings: StripSettings = {
    struct: null,
    type: StripType.clip,
    flag: StripFlag.userInfluence | StripFlag.noTimeMap,
    start,
    end,
    actionStart: start,
    actionEnd: end,
    repeat: 1,
    scale: 1,
    blendIn: 0,
    blendOut: 0,
    blendMode: adt.number("act_blendmode"),
    extendMode: adt.number("act_extendmode"),
    influence: adt.has("act_influence") ? adt.number("act_influence") : 1,
    time: 0,
    action: action.struct,
    slot,
  };
  return stripOf(settings, null);
}

/** A use that plays its action's frames at the same clock times. */
export const DIRECT: Player = {
  frameAt: (time) => time,
  direct: true,
  spans: EVERYWHERE,
  timesOf: framesWithin,
  breaks: () => [],
  blends: false,
  lane: null,
};

const SILENT: Player = {
  frameAt: () => null,
  direct: false,
  spans: [],
  timesOf: () => [],
  breaks: () => [],
  blends: false,
  lane: null,
};

/** The `frames` that lie within `within`, sorted, at most `limit` of them. */
function framesWithin(frames: readonly number[], within: readonly Span[], limit: number): number[] {
  const times: number[] = [];
  for (const frame of frames) {
    if (times.length >= limit) break;
    if (inSpans(within, frame)) times.push(frame);
  }
  return times.sort((a, b) => a - b);
}

/** Where the action track plays an action over NLA strips: at the clock's own frame, as far as it extends. */
function actionTrackPlayer(adt: BlendStruct, action: Action, slot: number): Player {
  const strip = actionTrackStrip(adt, action, slot);
  const [stretch] = soleStrip(strip).stretches.get(strip) ?? [];
  if (!stretch) return SILENT;
  const { span } = stretch;
  const [from, to] = span;
  return {
    frameAt: (time) => (time >= from && time <= to ? time : null),
    direct: from === Number.NEGATIVE_INFINITY && to === Number.POSITIVE_INFINITY,
    spans: [span],
    timesOf: (frames, within, limit) => framesWithin(frames, clampSpans(within, span), limit),
    breaks: (low, high) => [from, to].filter((time) => Number.isFinite(time) && time >= low && time <= high),
    blends: strip.blends,
    lane: null,
  };
}

/** A strip and the meta strips around it, outermost first. */
function stripPath(strip: Strip): Strip[] {
  const path: Strip[] = [];
  for (let at: Strip | null = strip; at; at = at.parent) path.push(at);
  return path.reverse();
}

/** The stretches of the track's clock where it plays the last strip of `path`, through the meta strips before it. */
function pathSpans(top: StripList, path: readonly Strip[]): Span[] {
  let spans: Span[] = [];
  for (let depth = path.length - 1; depth >= 0; depth--) {
    const strip = path[depth];
    const list = depth === 0 ? top : path[depth - 1]?.inner;
    if (!strip || !list) return [];
    const inner = spans;
    const mirror = strip.start + strip.end;
    const outward = strip.reverse ? inner.map(([a, b]): Span => [mirror - b, mirror - a]).reverse() : inner;
    const found: Span[] = [];
    for (const { span, held } of list.stretches.get(strip) ?? []) {
      if (depth === path.length - 1) found.push(span);
      else if (held !== null) {
        if (inSpans(inner, innerTime(strip, held))) found.push(span);
      } else {
        for (const part of clampSpans(outward, span)) found.push(part);
      }
    }
    spans = joinSpans(found, []);
  }
  return spans;
}

/**
 * The clock times within `within` at which an action strip, inside `metas`, plays each of `frames` in each of its
 * repeats, sorted. Stops after `limit` of them. A strip that keeps the scene's time, which no meta strip holds, plays
 * each frame at that time.
 */
function stripTimes(
  strip: Strip,
  metas: readonly Strip[],
  frames: readonly number[],
  within: readonly Span[],
  limit: number,
): number[] {
  if (keepsTime(strip)) return framesWithin(frames, within, limit);
  let spans: Span[] = [...within];
  let sign = 1;
  let shift = 0;
  for (const meta of metas) {
    spans = clampSpans(spans, [meta.start, meta.end]);
    if (!meta.reverse) continue;
    const mirror = meta.start + meta.end;
    spans = spans.map(([a, b]): Span => [mirror - b, mirror - a]).reverse();
    shift += sign * mirror;
    sign = -sign;
  }
  spans = clampSpans(spans, [strip.start, strip.end + FLOAT_EPSILON]);
  const { length, span } = cycle(strip);
  const step = span > 0 && Number.isFinite(span) ? span : 0;
  const times: number[] = [];
  for (const frame of frames) {
    const offset = strip.reverse ? strip.actionEnd - frame : frame - strip.actionStart;
    if (!(offset >= -FLOAT_EPSILON && offset <= length + FLOAT_EPSILON)) continue;
    const first = strip.start + offset * strip.scale;
    for (const [from, to] of spans) {
      const low = step > 0 ? Math.max(0, Math.ceil((from - first) / step)) : 0;
      const high = step > 0 ? Math.floor((to - first) / step) : 0;
      for (let k = low; k <= high; k++) {
        const at = first + k * step;
        if (!(at >= from && at <= to)) continue;
        if (times.length >= limit) return times.sort((a, b) => a - b);
        times.push(sign * at + shift);
      }
    }
  }
  return times.sort((a, b) => a - b);
}

/** Whether NLA tweak mode tweaks the strip, on the track the animation data tweaks. */
function isTweaked(adt: BlendStruct, { strip, track }: NonNullable<ActionUse["strip"]>): boolean {
  if ((adt.number("flag") & ADT_NLA_EDIT_ON) === 0) return false;
  return track.offset === adt.deref("act_track")?.offset && strip.offset === adt.deref("actstrip")?.offset;
}

/**
 * Where a use of an action that Blender plays plays it on the scene's clock: the active or stashed action at the
 * clock's own frame, within its extrapolation where NLA strips play under it, and an NLA strip through its track's
 * timing, as `nlastrips_ctime_get_strip` and `nlastrip_get_frame` place it. A strip in NLA tweak mode plays alone on
 * its track, as `tweakStrip` makes it. Each strip replaces what plays under it in full; `blends` says where Blender
 * does otherwise. A strip nested deeper than `MAX_META_DEPTH` plays nothing.
 */
export function scenePlayer(id: BlendStruct, use: ActionUse, action: Action, tracks: NlaTracks): Player {
  const adt = id.deref("adt");
  if (!use.strip) return adt && stripsUnder(adt) ? actionTrackPlayer(adt, action, use.slot) : DIRECT;
  const timing = adt && isTweaked(adt, use.strip) ? tracks.tweaked(adt, action) : tracks.of(use.strip.track);
  const own = timing?.byOffset.get(use.strip.strip.offset);
  if (!timing || !own) return SILENT;
  const made = timing.players.get(own);
  if (made) return made;
  const path = stripPath(own);
  const metas = path.slice(0, -1);
  const player: Player = {
    frameAt: (time) => {
      const found = timing.at(time);
      return found?.strip === own ? found.frame : null;
    },
    direct: false,
    spans: pathSpans(timing.top, path),
    timesOf: (frames, within, limit) => stripTimes(own, metas, frames, within, limit),
    breaks: timing.breaks,
    blends: path.some((strip) => strip.blends) || timing.transition,
    lane: timing.lane,
  };
  timing.players.set(own, player);
  return player;
}

/** One component of a property that an ID's animation writes, such as index 1 of `location`. */
export interface AnimatedValue {
  path: string;
  index: number;
  value: number;
}

type MixMode = "add" | "multiply" | "quaternion" | "axis-angle";

interface Property {
  mix: MixMode;
  /** Blender's `nlaevalchan_get_default_values`: what the NLA writes where none of its strips plays. */
  defaults: readonly number[];
}

const VECTOR: Property = { mix: "add", defaults: [0, 0, 0] };
const SCALE: Property = { mix: "multiply", defaults: [1, 1, 1] };
const QUATERNION: Property = { mix: "quaternion", defaults: [1, 0, 0, 0] };
const AXIS_ANGLE: Property = { mix: "axis-angle", defaults: [0, 0, 0, 0] };
const SHAPE_KEY_VALUE: Property = { mix: "add", defaults: [0] };

const TRANSFORMS: ReadonlyMap<string, Property> = new Map([
  ["location", VECTOR],
  ["rotation_euler", VECTOR],
  ["rotation_quaternion", QUATERNION],
  ["rotation_axis_angle", AXIS_ANGLE],
  ["scale", SCALE],
]);
const DELTAS: ReadonlyMap<string, Property> = new Map([
  ["delta_location", VECTOR],
  ["delta_rotation_euler", VECTOR],
  ["delta_rotation_quaternion", QUATERNION],
  ["delta_scale", SCALE],
]);

/** The animated properties the reader reads: an object's transform, a pose bone's channel and a shape key's value. */
function propertyOf(path: string): Property | null {
  const pose = parsePosePath(path);
  if (pose) return TRANSFORMS.get(pose.property) ?? null;
  if (parseShapeKeyPath(path) !== null) return SHAPE_KEY_VALUE;
  return TRANSFORMS.get(path) ?? DELTAS.get(path) ?? null;
}

/** What the NLA writes for one value of a property that no strip plays, 0 for a property the reader does not read. */
export function nlaDefault(path: string, index: number): number {
  return propertyOf(path)?.defaults[index] ?? 0;
}

/** Blender's `nlastrip_get_influence`: full influence but over the strip's blend-in and blend-out frames. */
function blendedInfluence(strip: Strip, frame: number): number {
  const blendIn = Math.abs(strip.blendIn);
  const blendOut = Math.abs(strip.blendOut);
  if (!isEqual(blendIn, 0) && frame <= strip.start + blendIn) return Math.abs(frame - strip.start) / blendIn;
  if (!isEqual(blendOut, 0) && frame >= strip.end - blendOut) return Math.abs(strip.end - frame) / blendOut;
  return 1;
}

/** A strip Blender plays at a frame, with the influence and the action frame it plays there. */
interface Playing {
  strip: Strip;
  influence: number;
  time: number;
}

/**
 * Blender's `nlastrip_evaluate_controls`: the strip's influence and action frame, from its curves where it animates
 * them; null where such a curve has a modifier the reader does not apply.
 */
function controls(strip: Strip, frame: number): { influence: number; time: number } | null {
  let influence = strip.influence;
  let time = strip.time;
  for (const curve of strip.struct?.list("fcurves").map(readFCurve) ?? []) {
    if (curve.muted || curve.empty || (curve.path !== "influence" && curve.path !== "strip_time")) continue;
    if (curve.unsupportedModifiers.length > 0) return null;
    const value = evaluateFCurve(curve, frame);
    if (curve.path === "influence") influence = Math.min(Math.max(value, 0), 1);
    else time = value;
  }
  if ((strip.flag & StripFlag.userInfluence) === 0) influence = blendedInfluence(strip, frame);
  if (keepsTime(strip)) return { influence, time: frame };
  if ((strip.flag & StripFlag.userTime) === 0) {
    time = actionFrame(strip, frame);
  } else if ((strip.flag & StripFlag.userTimeCyclic) !== 0) {
    time = (time - strip.actionStart) % (strip.actionEnd - strip.actionStart);
  }
  return { influence, time };
}

/**
 * The strip of a list that Blender plays at a frame, as `stripAt` finds it, with its influence and action frame.
 * Undefined where none plays, and null where a meta or transition strip plays, or a curve that animates the strip has
 * a modifier the reader does not apply.
 */
function playingStrip(list: StripList, frame: number): Playing | null | undefined {
  const found = stripAt(list, frame);
  if (!found || (found.strip.flag & NLASTRIP_MUTED) !== 0) return undefined;
  const chosen = found.strip;
  const settings = controls(chosen, found.time);
  if (!settings) return null;
  if (settings.influence <= 0) return undefined;
  if (chosen.type === StripType.clip) return chosen.action ? { strip: chosen, ...settings } : undefined;
  if (chosen.type === StripType.transition) {
    const index = list.strips.indexOf(chosen);
    return index > 0 && index < list.strips.length - 1 ? null : undefined;
  }
  return chosen.type === StripType.meta ? null : { strip: chosen, ...settings };
}

/** A property's values, each null where the reader cannot tell what Blender writes. */
type Values = (number | null)[];

interface StripChannel {
  property: Property;
  values: Values;
  /** Which values the strip blends, as Blender's `blend_domain`. */
  blends: boolean[];
}

/** Blender's `nla_blend_value`. */
function blendValue(mode: number, lower: number | null, upper: number | null, influence: number): number | null {
  if (upper === null) return null;
  if (mode === BlendMode.replace && influence === 1) return upper;
  if (lower === null) return null;
  if (mode === BlendMode.add) return lower + upper * influence;
  if (mode === BlendMode.subtract) return lower - upper * influence;
  if (mode === BlendMode.multiply) return influence * (lower * upper) + (1 - influence) * lower;
  return lower * (1 - influence) + upper * influence;
}

/** Blender's `nla_combine_value`. */
function combineValue(
  mix: MixMode,
  base: number,
  lower: number | null,
  upper: number | null,
  influence: number,
): number | null {
  if (lower === null || upper === null) return null;
  if (mix === "multiply") return lower * (upper / (isEqual(base, 0) ? 1 : base)) ** influence;
  return lower + (upper - base) * influence;
}

/** Blender's `normalize_qt_qt`, which turns a zero quaternion into a half turn about x. */
function normalized(q: readonly number[]): number[] {
  const length = Math.hypot(...q);
  return length === 0 ? [0, 1, 0, 0] : q.map((value) => value / length);
}

/** Blender's `nla_combine_quaternion`: the lower rotation followed by the upper one raised to the influence. */
function combineQuaternion(lower: Values, upper: Values, influence: number): Values {
  const known = (values: Values): values is number[] => values.every((value) => value !== null);
  if (!known(lower) || !known(upper)) return [null, null, null, null];
  const [aw = 1, ax = 0, ay = 0, az = 0] = normalized(lower);
  const [uw = 1, ux = 0, uy = 0, uz = 0] = normalized(upper);
  const angle = influence * Math.acos(Math.min(Math.max(uw, -1), 1));
  const axisLength = Math.hypot(ux, uy, uz);
  const sine = axisLength * axisLength > 1e-35 ? Math.sin(angle) / axisLength : 0;
  const [bw, bx, by, bz] = [Math.cos(angle), ux * sine, uy * sine, uz * sine];
  return [
    aw * bw - ax * bx - ay * by - az * bz,
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by + ay * bw + az * bx - ax * bz,
    aw * bz + az * bw + ax * by - ay * bx,
  ];
}

/** Blender's `nlasnapshot_blend`: blends a strip's values into those below it, by its blend mode and influence. */
function blendInto(
  lower: Map<string, Values>,
  upper: ReadonlyMap<string, StripChannel>,
  mode: number,
  influence: number,
) {
  if (isEqual(influence, 0) || !BLEND_MODES.has(mode)) return;
  for (const [path, { property, values, blends }] of upper) {
    const below = lower.get(path) ?? [...property.defaults];
    let result: Values;
    if (mode !== BlendMode.combine) {
      result = below.map((value, i) => (blends[i] ? blendValue(mode, value, values[i] ?? null, influence) : value));
    } else if (property.mix === "quaternion") {
      result = blends[0] ? combineQuaternion(below, values, influence) : below;
    } else {
      result = below.map((value, i) =>
        blends[i] ? combineValue(property.mix, property.defaults[i] ?? 0, value, values[i] ?? null, influence) : value,
      );
    }
    lower.set(path, result);
  }
}

/** The curves of an action's slot that Blender plays, on properties the reader reads, with the value each one sets. */
function playedCurves(action: Action, slot: number): { curve: FCurve; property: Property; index: number }[] {
  return (slotFor(action, slot)?.curves ?? []).flatMap((curve) => {
    const property = curve.muted || curve.empty ? null : propertyOf(curve.path);
    if (!property) return [];
    if (property.defaults.length === 1) return [{ curve, property, index: 0 }];
    return curve.index >= 0 && curve.index < property.defaults.length ? [{ curve, property, index: curve.index }] : [];
  });
}

/**
 * Blender's `nlasnapshot_from_action`: the values a strip's action plays at its frame. A quaternion's strip sets all
 * four values, the identity's where its action keys fewer. A value is null where its curve, or the strip, has a
 * modifier the reader does not apply.
 */
function stripValues(action: Action, playing: Playing): Map<string, StripChannel> {
  const modified = playing.strip.struct !== null && hasActiveModifiers(playing.strip.struct);
  const channels = new Map<string, StripChannel>();
  for (const { curve, property, index } of playedCurves(action, playing.strip.slot)) {
    let channel = channels.get(curve.path);
    if (!channel) {
      channel = { property, values: [...property.defaults], blends: property.defaults.map(() => false) };
      channels.set(curve.path, channel);
    }
    const supported = !modified && curve.unsupportedModifiers.length === 0;
    channel.values[index] = supported ? evaluateFCurve(curve, playing.time) : null;
    if (property.mix === "quaternion") channel.blends.fill(true);
    else channel.blends[index] = true;
  }
  return channels;
}

/**
 * Blender's `animsys_create_tweak_strip`: the tweaked strip as Blender plays it in NLA tweak mode, given `action`, the
 * strip's action, or undefined where the reader has not read it.
 */
function tweakStrip(adt: BlendStruct, action: Action | undefined): Strip | null {
  const found = adt.deref("actstrip");
  if (!found) return null;
  const strip = stripSettings(found);
  if ((strip.flag & StripFlag.syncLength) !== 0 && strip.type === StripType.clip && action) {
    const previousStart = strip.actionStart;
    [strip.actionStart, strip.actionEnd] = actionRange(action);
    strip.start += (strip.actionStart - previousStart) * strip.scale;
    const mapping = strip.scale * strip.repeat;
    if (!isEqual(mapping, 0)) strip.end = (strip.actionEnd - strip.actionStart) * mapping + strip.start;
  }
  if ((adt.number("flag") & ADT_NLA_EDIT_NOMAP) !== 0 || (strip.flag & StripFlag.userTime) !== 0) {
    strip.extendMode = Extend.hold;
    strip.flag |= StripFlag.noTimeMap;
  }
  return stripOf(strip, null);
}

/**
 * Blender's `animsys_calculate_nla`: the values the NLA writes at a frame, by property path. They include the
 * defaults of the values that an action on an enabled track, or on the action track, keys and no playing strip sets.
 * Undefined where Blender plays the active action as if there were no NLA. Null where an action is not in `actions`,
 * as one linked from another file, or where `playingStrip` cannot tell what plays.
 */
function nlaValues(
  adt: BlendStruct,
  frame: number,
  actions: ReadonlyMap<number, Action>,
): Map<string, Values> | null | undefined {
  const flag = adt.number("flag");
  const tweaking = (flag & ADT_NLA_EDIT_ON) !== 0;
  const active = adt.deref("action");
  if (active && !stripsUnder(adt) && (flag & (ADT_NLA_SOLO_TRACK | ADT_NLA_EDIT_ON)) === 0) return undefined;
  const tracks = adt.list("nla_tracks");
  const actionOf = (struct: BlendStruct | null) => (struct ? actions.get(struct.offset) : undefined);
  const tweakedOffset = tracks.find((track) => (track.number("flag") & NLATRACK_DISABLED) !== 0)?.offset;
  const tweakedAction = actionOf(adt.deref("actstrip")?.deref("act") ?? null);
  const playing: Playing[] = [];
  const read = new Set<number>();
  for (const track of evaluatedTracks(adt)) {
    const tweaked = track.offset === tweakedOffset ? tweakStrip(adt, tweakedAction) : null;
    if (track.offset === tweakedOffset && !tweaked) return null;
    const played = playingStrip(tweaked ? soleStrip(tweaked) : readTrack(track, read).top, frame);
    if (played === null) return null;
    if (played) playing.push(played);
  }

  const upper = !tweaking || (flag & ADT_NLA_EVAL_UPPER_TRACKS) !== 0;
  const trackAction = tweaking ? adt.deref("tmpact") : active;
  const trackSlot = tweaking ? slotHandle(adt, "tmp_slot_handle") : slotHandle(adt, "slot_handle");
  const playedAction = actionOf(trackAction);
  if (trackAction && upper && !playedAction) return null;
  if (playedAction && upper && (flag & ADT_NLA_SOLO_TRACK) === 0) {
    const actionPlaying = playingStrip(soleStrip(actionTrackStrip(adt, playedAction, trackSlot)), frame);
    if (actionPlaying) playing.push(actionPlaying);
  }

  const domain = new Map<string, boolean[]>();
  const added = new Set<string>();
  const addToDomain = (struct: BlendStruct, slot: number) => {
    const action = actionOf(struct);
    if (!action) return false;
    const key = `${struct.offset}:${slot}`;
    if (added.has(key)) return true;
    added.add(key);
    for (const { property, index, curve } of playedCurves(action, slot)) {
      const flags = domain.get(curve.path) ?? property.defaults.map(() => false);
      if (property.mix === "quaternion") flags.fill(true);
      else flags[index] = true;
      domain.set(curve.path, flags);
    }
    return true;
  };
  if (trackAction && upper && !addToDomain(trackAction, trackSlot)) return null;
  const enabled = tracks.filter((track) => trackPlays(flag, track, true));
  const visited = new Set<number>();
  const pending = enabled.flatMap((track) => unseenList(track, "strips", visited));
  for (let strip = pending.pop(); strip; strip = pending.pop()) {
    const action = strip.deref("act");
    if (action && !addToDomain(action, slotHandle(strip, "action_slot_handle"))) return null;
    for (const inner of unseenList(strip, "strips", visited)) pending.push(inner);
  }

  const values = new Map<string, Values>();
  for (const played of playing) {
    if (played.strip.type !== StripType.clip) continue;
    const action = actionOf(played.strip.action);
    if (!action) return null;
    blendInto(values, stripValues(action, played), played.strip.blendMode, played.influence);
  }
  const written = new Map<string, Values>();
  for (const [path, flags] of domain) {
    const current = values.get(path) ?? [...(propertyOf(path)?.defaults ?? [])];
    written.set(
      path,
      flags.map((on, index) => (on ? (current[index] ?? null) : null)),
    );
  }
  return written;
}

/**
 * Blender's `BKE_animsys_evaluate_animdata` at a frame without drivers: the values that an ID's active action and NLA
 * write over the ones the file saves, in the order Blender writes them. It leaves out each value whose source the
 * reader does not play: one a driver overrides, one from a curve or strip with a modifier the reader does not apply,
 * and every value of an ID that plays an action linked from another file, a meta or transition strip.
 */
export function animatedValues(id: BlendStruct, frame: number, actions: ReadonlyMap<number, Action>): AnimatedValue[] {
  const adt = id.deref("adt");
  if (!adt) return [];
  const usesNla = adt.list("nla_tracks").length > 0 && (adt.number("flag") & ADT_NLA_EVAL_OFF) === 0;
  const nla = usesNla ? nlaValues(adt, frame, actions) : undefined;
  if (nla === null) return [];
  let written: AnimatedValue[];
  if (nla) {
    written = [...nla].flatMap(([path, values]) =>
      values.flatMap((value, index) => (value === null ? [] : [{ path, index, value }])),
    );
  } else {
    const struct = adt.deref("action");
    const action = struct ? actions.get(struct.offset) : undefined;
    if (!action) return [];
    written = playedCurves(action, slotHandle(adt, "slot_handle")).flatMap(({ curve, index }) =>
      curve.unsupportedModifiers.length > 0 ? [] : [{ path: curve.path, index, value: evaluateFCurve(curve, frame) }],
    );
  }
  const driven = new Set(
    adt
      .list("drivers")
      .map(readFCurve)
      .filter((driver) => !driver.muted)
      .map((driver) => `${driver.path}[${driver.index}]`),
  );
  return written.filter(({ path, index }) => !driven.has(`${path}[${index}]`));
}
