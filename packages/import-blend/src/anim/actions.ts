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
}

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
  };
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
  /** Pairs of action struct offset and slot handle that the ID's animation data uses. */
  uses: { action: number; slot: number }[];
  drivers: FCurve[];
}

/** The actions, slots and drivers an ID's animation data uses: its active action, tweak action and NLA strips. */
export function animationUses(id: BlendStruct): AnimatedId {
  const adt = id.deref("adt");
  const uses: { action: number; slot: number }[] = [];
  if (!adt) return { id, uses, drivers: [] };
  const add = (action: BlendStruct | null, slot: number) => {
    if (action) uses.push({ action: action.offset, slot });
  };
  add(adt.deref("action"), adt.has("slot_handle") ? adt.number("slot_handle") : -1);
  add(adt.deref("tmpact"), adt.has("tmp_slot_handle") ? adt.number("tmp_slot_handle") : -1);
  const visitStrips = (strips: BlendStruct[]) => {
    for (const strip of strips) {
      add(strip.deref("act"), strip.has("action_slot_handle") ? strip.number("action_slot_handle") : -1);
      visitStrips(strip.list("strips"));
    }
  };
  for (const track of adt.list("nla_tracks")) visitStrips(track.list("strips"));
  return { id, uses, drivers: adt.list("drivers").map(readFCurve) };
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
