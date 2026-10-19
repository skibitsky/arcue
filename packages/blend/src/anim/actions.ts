import type { BlendFile, BlendStruct } from "../blend/file.js";
import { datablocks, idName, isLinked } from "../blend/ids.js";
import { unseenList } from "../blend/lists.js";
import type { FCurve } from "./fcurve.js";
import { keyFrames, readFCurve } from "./fcurve.js";

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
  /** The layers of a layered action. The reader plays the first; Blender 5.2 makes no more than one. */
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

/**
 * The structs an array of `count` pointers points at, without those `claimed` holds, each added to it. The array
 * itself is claimed too, so an array that another struct also points at points at nothing the second time.
 */
function pointedStructs(owner: BlendStruct, array: string, count: string, claimed: Set<number>): BlendStruct[] {
  const block = owner.target(array);
  const structs: BlendStruct[] = [];
  if (!block || claimed.has(block.offset)) return structs;
  claimed.add(block.offset);
  const { file } = owner;
  const length = Math.min(Math.max(owner.number(count), 0), Math.floor(block.size / file.pointerSize));
  for (let index = 0; index < length; index++) {
    const struct = file.first(owner.resolve(file.pointerAt(block.offset + index * file.pointerSize)));
    if (!struct || claimed.has(struct.offset)) continue;
    claimed.add(struct.offset);
    structs.push(struct);
  }
  return structs;
}

/** The struct that the `index`th of an array of `count` pointers points at, or null. */
function pointedStruct(owner: BlendStruct, array: string, count: string, index: number): BlendStruct | null {
  const block = owner.target(array);
  const { file } = owner;
  if (!block || index < 0 || index >= owner.number(count) || (index + 1) * file.pointerSize > block.size) return null;
  return file.first(owner.resolve(file.pointerAt(block.offset + index * file.pointerSize)));
}

/**
 * The slots of a layered action, each with the curves of the channelbags its handle names, or null for a legacy one. Of
 * the slots that share a handle, only the first is kept, the one Blender's `slot_for_handle` finds.
 */
function layeredSlots(action: BlendStruct, claimed: Set<number>): ActionSlot[] | null {
  if (!action.has("layer_array") || action.number("layer_array_num") <= 0) return null;
  const slots = pointedStructs(action, "slot_array", "slot_array_num", claimed);
  const curvesBySlot = new Map<number, FCurve[]>();
  const layer = pointedStruct(action, "layer_array", "layer_array_num", 0);
  for (const strip of layer ? pointedStructs(layer, "strip_array", "strip_array_num", claimed) : []) {
    if (strip.number("strip_type") !== KEYFRAME_STRIP) continue;
    const index = strip.number("data_index");
    const data = pointedStruct(action, "strip_keyframe_data_array", "strip_keyframe_data_array_num", index);
    if (!data || claimed.has(data.offset)) continue;
    claimed.add(data.offset);
    for (const bag of pointedStructs(data, "channelbag_array", "channelbag_array_num", claimed)) {
      const handle = bag.number("slot_handle");
      let curves = curvesBySlot.get(handle);
      if (!curves) {
        curves = [];
        curvesBySlot.set(handle, curves);
      }
      for (const curve of pointedStructs(bag, "fcurve_array", "fcurve_array_num", claimed)) {
        curves.push(readFCurve(curve));
      }
    }
  }
  const handles = new Set<number>();
  return slots.flatMap((slot) => {
    const handle = slot.number("handle");
    if (handles.has(handle)) return [];
    handles.add(handle);
    const identifier = slot.string("name") || slot.string("identifier");
    return [{ handle, identifier, idType: slot.number("idtype"), curves: curvesBySlot.get(handle) ?? [] }];
  });
}

/**
 * Reads an action. Its slots, strips, keyframe data, channelbags and curves that `claimed` holds, as another action's,
 * are left out, and the rest are added to it.
 */
function readAction(action: BlendStruct, claimed: Set<number>): Action {
  const layered = layeredSlots(action, claimed);
  const slots = layered ?? [
    {
      handle: -1,
      identifier: "",
      idType: action.number("idroot"),
      curves: unseenList(action, "curves", claimed).map(readFCurve),
    },
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

/**
 * Every action the file holds, in file order, without linked ones. Blender gives each curve, and each slot, strip,
 * keyframe data and channelbag of a layered action, to one action and lists it there once, so one that the file lists
 * again is read only where it is first listed.
 */
export function readActions(file: BlendFile): Action[] {
  const claimed = new Set<number>();
  return datablocks(file, "AC")
    .filter((action) => !isLinked(action))
    .map((action) => readAction(action, claimed));
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
  const seen = new Set<number>();
  const visitStrips = (top: BlendStruct, track: BlendStruct, played: boolean) => {
    const pending = [{ strip: top, played }];
    for (let next = pending.pop(); next; next = pending.pop()) {
      const { strip } = next;
      const plays = next.played && (strip.number("flag") & NLASTRIP_MUTED) === 0;
      add(strip.deref("act"), slotHandle(strip, "action_slot_handle"), plays, { strip, track });
      for (const inner of unseenList(strip, "strips", seen).reverse()) pending.push({ strip: inner, played: plays });
    }
  };
  const tweakedTrack = tweaking ? adt.deref("act_track")?.offset : undefined;
  const tweakedStrip = adt.deref("actstrip")?.offset;
  for (const track of tracks.reverse()) {
    const tweaked = track.offset === tweakedTrack;
    const plays = nla && trackPlays(flag, track, tweaked);
    for (const strip of unseenList(track, "strips", seen)) {
      visitStrips(strip, track, plays && (!tweaked || strip.offset === tweakedStrip));
    }
  }
  return uses;
}

/**
 * Every property path an ID's own animation animates, such as `constraints["Follow"].influence`: the unmuted curves of
 * the action slots it plays, from `actions` by struct offset, and its unmuted drivers.
 */
export function animatedPaths(id: BlendStruct, actions: ReadonlyMap<number, Action>): Set<string> {
  const paths = new Set<string>();
  const { uses, drivers } = animationUses(id);
  for (const use of uses) {
    const action = use.played ? actions.get(use.action) : undefined;
    const slot = action ? slotFor(action, use.slot) : undefined;
    for (const curve of slot?.curves ?? []) if (!curve.muted && !curve.empty) paths.add(curve.path);
  }
  for (const driver of drivers) if (!driver.muted) paths.add(driver.path);
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
