import type { BlendFile, BlendStruct } from "../blend/file";
import { datablocks, idName, isLinked } from "../blend/ids";
import type { FCurve } from "./fcurve";
import { keyFrames, readFCurve } from "./fcurve";

/** Blender's two-letter ID codes as the `idtype` and `idroot` members store them. */
export const IdCode = {
  object: 0x424f,
  shapeKey: 0x454b,
} as const;

export interface ActionSlot {
  /** The slot's handle in a layered action; -1 for the curves of a legacy action. */
  handle: number;
  /** The slot's identifier, the ID type's two letters and a name, such as "OBArmature"; empty for a legacy action. */
  identifier: string;
  /** The ID type the slot animates, or 0 when the action does not say. */
  idType: number;
  curves: FCurve[];
}

export interface Action {
  struct: BlendStruct;
  name: string;
  slots: ActionSlot[];
  /** The manual frame range, when the action sets one. */
  manualRange: [number, number] | null;
  /** The layers of a layered action. Arcue plays the first; Blender 5.2 makes no more than one. */
  layers: number;
}

export const ADT_NLA_SOLO_TRACK = 1 << 0;
export const ADT_NLA_EVAL_OFF = 1 << 1;
export const ADT_NLA_EDIT_ON = 1 << 2;
export const ADT_NLA_EVAL_UPPER_TRACKS = 1 << 5;
export const NLATRACK_MUTED = 1 << 2;
const NLATRACK_SOLO = 1 << 3;
export const NLATRACK_DISABLED = 1 << 10;
export const NLASTRIP_MUTED = 1 << 12;
const ACTION_FRAME_RANGE = 1 << 12;
const KEYFRAME_STRIP = 0;

function pointedStructs(owner: BlendStruct, array: string, count: string): BlendStruct[] {
  return owner.pointers(array, Math.max(owner.number(count), 0)).flatMap((address) => {
    const struct = owner.file.first(owner.resolve(address));
    return struct ? [struct] : [];
  });
}

function layeredSlots(action: BlendStruct): ActionSlot[] | null {
  if (!action.has("layer_array") || action.number("layer_array_num") <= 0) return null;
  const slots = pointedStructs(action, "slot_array", "slot_array_num");
  const keyframeData = pointedStructs(action, "strip_keyframe_data_array", "strip_keyframe_data_array_num");
  const curvesBySlot = new Map<number, FCurve[]>();
  const [layer] = pointedStructs(action, "layer_array", "layer_array_num");
  for (const strip of layer ? pointedStructs(layer, "strip_array", "strip_array_num") : []) {
    if (strip.number("strip_type") !== KEYFRAME_STRIP) continue;
    const data = keyframeData[strip.number("data_index")];
    for (const bag of data ? pointedStructs(data, "channelbag_array", "channelbag_array_num") : []) {
      const curves = pointedStructs(bag, "fcurve_array", "fcurve_array_num").map(readFCurve);
      const handle = bag.number("slot_handle");
      curvesBySlot.set(handle, [...(curvesBySlot.get(handle) ?? []), ...curves]);
    }
  }
  return slots.map((slot) => ({
    handle: slot.number("handle"),
    identifier: slot.string("name") || slot.string("identifier"),
    idType: slot.number("idtype"),
    curves: curvesBySlot.get(slot.number("handle")) ?? [],
  }));
}

export function readAction(action: BlendStruct): Action {
  const layered = layeredSlots(action);
  const slots = layered ?? [
    { handle: -1, identifier: "", idType: action.number("idroot"), curves: action.list("curves").map(readFCurve) },
  ];
  const manual = (action.number("flag") & ACTION_FRAME_RANGE) !== 0;
  return {
    struct: action,
    name: idName(action),
    slots,
    manualRange: manual ? [action.number("frame_start"), action.number("frame_end")] : null,
    layers: layered ? action.number("layer_array_num") : 0,
  };
}

/**
 * The slot that an animation data's slot handle plays. A legacy action has no slots, so its curves play for any handle;
 * a layered action plays nothing for a handle that none of its slots has.
 */
export function slotFor(action: Action, handle: number): ActionSlot | undefined {
  const [only] = action.slots;
  if (action.slots.length === 1 && only?.handle === -1) return only;
  return action.slots.find((slot) => slot.handle === handle);
}

/** Every action the file holds, in file order, without linked ones. */
export function readActions(file: BlendFile): Action[] {
  return datablocks(file, "AC")
    .filter((action) => !isLinked(action))
    .map(readAction);
}

/** Blender's `BKE_action_frame_range_get`: the manual range or the keys' range, at least one frame long. */
export function actionRange(action: Action): [number, number] {
  let start: number;
  let end: number;
  if (action.manualRange) {
    [start, end] = action.manualRange;
  } else {
    start = Number.POSITIVE_INFINITY;
    end = Number.NEGATIVE_INFINITY;
    for (const slot of action.slots) {
      for (const curve of slot.curves) {
        const frames = keyFrames(curve);
        if (frames.length === 0) continue;
        start = Math.min(start, frames[0] ?? start);
        end = Math.max(end, frames[frames.length - 1] ?? end);
      }
    }
    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      start = 0;
      end = 0;
    }
  }
  if (start >= end) end = start + 1;
  return [start, end];
}

/** An ID an action can animate, with the action uses its animation data records. */
export interface AnimatedId {
  id: BlendStruct;
  /** The action struct offset, slot handle and whether Blender plays it, for each use that `usedActions` lists. */
  uses: { action: number; slot: number; played: boolean }[];
  drivers: FCurve[];
}

/** The actions, slots and drivers an ID's animation data uses: its active action, stashed action and NLA strips. */
export function animationUses(id: BlendStruct): AnimatedId {
  const adt = id.deref("adt");
  if (!adt) return { id, uses: [], drivers: [] };
  const uses = usedActions(id).map(({ action, slot, played }) => ({ action: action.offset, slot, played }));
  return { id, uses, drivers: adt.list("drivers").map(readFCurve) };
}

/**
 * Blender's `is_nlatrack_evaluatable`: whether an NLA track plays. The soloed track plays while one is, any unmuted
 * track otherwise, and in tweak mode no track that it disables but the tweaked one.
 */
export function trackPlays(flag: number, track: BlendStruct, tweaked: boolean): boolean {
  const trackFlag = track.number("flag");
  if ((trackFlag & NLATRACK_DISABLED) !== 0 && !tweaked) return false;
  if ((flag & ADT_NLA_SOLO_TRACK) !== 0) return (trackFlag & NLATRACK_SOLO) !== 0;
  return (trackFlag & NLATRACK_MUTED) === 0;
}

/** The slot handle an animation data or NLA strip stores in `field`, or -1 where the file has none. */
export function slotHandle(owner: BlendStruct, field: string): number {
  return owner.has(field) ? owner.number(field) : -1;
}

/** A use of an action by an ID's animation data. */
export interface ActionUse {
  action: BlendStruct;
  slot: number;
  played: boolean;
  /** The NLA strip that plays the action and the track the strip sits on, or null for the active or stashed action. */
  strip: { strip: BlendStruct; track: BlendStruct } | null;
}

/**
 * The actions an ID's animation data uses, as its active, stashed and NLA strip actions, with their slot handles, in
 * the order Blender lets those it plays override one another: the action it plays over the NLA first, then an upper
 * track before a lower one. `played` says whether Blender plays the use, as `animsys_evaluate_nla_for_flush` decides.
 * With the NLA off, only the active action plays. Otherwise the active action, or in tweak mode the stashed one, plays
 * over the tracks unless a track plays solo or tweak mode leaves out the tracks above the tweaked one. A strip plays
 * unless it or its track is muted, a soloed track or tweak mode leaves its track out, or it shares the tweaked track
 * with the tweaked strip.
 */
export function usedActions(id: BlendStruct): ActionUse[] {
  const adt = id.deref("adt");
  const uses: ActionUse[] = [];
  if (!adt) return uses;
  const flag = adt.number("flag");
  const tracks = adt.list("nla_tracks");
  const nla = tracks.length > 0 && (flag & ADT_NLA_EVAL_OFF) === 0;
  const tweaking = (flag & ADT_NLA_EDIT_ON) !== 0;
  const upper = !tweaking || (flag & ADT_NLA_EVAL_UPPER_TRACKS) !== 0;
  const overNla = nla && (flag & ADT_NLA_SOLO_TRACK) === 0 && upper;
  const add = (action: BlendStruct | null, slot: number, played: boolean, strip: ActionUse["strip"]) => {
    if (action) uses.push({ action, slot, played, strip });
  };
  add(adt.deref("action"), slotHandle(adt, "slot_handle"), !nla || (!tweaking && overNla), null);
  add(adt.deref("tmpact"), slotHandle(adt, "tmp_slot_handle"), tweaking && overNla, null);
  const visitStrips = (top: BlendStruct, track: BlendStruct, played: boolean) => {
    const pending = [{ strip: top, played }];
    const seen = new Set<number>();
    for (let next = pending.pop(); next; next = pending.pop()) {
      const { strip } = next;
      if (seen.has(strip.offset)) continue;
      seen.add(strip.offset);
      const plays = next.played && (strip.number("flag") & NLASTRIP_MUTED) === 0;
      add(strip.deref("act"), slotHandle(strip, "action_slot_handle"), plays, { strip, track });
      pending.push(...[...strip.list("strips")].reverse().map((inner) => ({ strip: inner, played: plays })));
    }
  };
  const tweakedTrack = tweaking ? adt.deref("act_track")?.offset : undefined;
  const tweakedStrip = adt.deref("actstrip")?.offset;
  for (const track of tracks.reverse()) {
    const tweaked = track.offset === tweakedTrack;
    const plays = nla && trackPlays(flag, track, tweaked);
    for (const strip of track.list("strips")) {
      visitStrips(strip, track, plays && (!tweaked || strip.offset === tweakedStrip));
    }
  }
  return uses;
}

/** Every property path an action, or a driver on an object, animates, such as `constraints["Follow"].influence`. */
export function animatedPaths(file: BlendFile, actions: readonly Action[]): Set<string> {
  const paths = new Set<string>();
  for (const action of actions) {
    for (const slot of action.slots) {
      for (const curve of slot.curves) if (!curve.muted && !curve.empty) paths.add(curve.path);
    }
  }
  for (const object of datablocks(file, "OB")) {
    for (const driver of animationUses(object).drivers) if (!driver.muted) paths.add(driver.path);
  }
  return paths;
}

/** A bone name in a `pose.bones["Name"]` path, with Blender's escapes undone, and the property after it. */
export function parsePosePath(path: string): { bone: string; property: string } | null {
  const match = /^pose\.bones\["((?:[^"\\]|\\.)*)"\]\.([a-z_]+)$/.exec(path);
  if (!match?.[1] || !match[2]) return null;
  return { bone: match[1].replace(/\\(.)/g, "$1"), property: match[2] };
}

/** A shape key name in a `key_blocks["Name"].value` path, with Blender's escapes undone. */
export function parseShapeKeyPath(path: string): string | null {
  const match = /^key_blocks\["((?:[^"\\]|\\.)*)"\]\.value$/.exec(path);
  return match?.[1] ? match[1].replace(/\\(.)/g, "$1") : null;
}
