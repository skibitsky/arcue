import { describe, expect, it } from "vitest";
import type { BlockDefinition, FieldValue, FileDefinition } from "../../test/synthetic.js";
import { writeBlend } from "../../test/synthetic.js";
import type { BlendStruct } from "../blend/file.js";
import { readBlendFile } from "../blend/file.js";
import { datablocks } from "../blend/ids.js";
import { actionRange, readActions, usedActions } from "./actions.js";

const STRUCTS: FileDefinition["structs"] = [
  {
    type: "ListBase",
    fields: [
      ["void", "*first"],
      ["void", "*last"],
    ],
  },
  {
    type: "ID",
    fields: [
      ["void", "*next"],
      ["void", "*prev"],
      ["char", "name[66]"],
      ["void", "*lib"],
    ],
  },
  {
    type: "BezTriple",
    fields: [
      ["float", "vec[3][3]"],
      ["char", "ipo"],
    ],
  },
  {
    type: "FCurve",
    fields: [
      ["FCurve", "*next"],
      ["FCurve", "*prev"],
      ["BezTriple", "*bezt"],
      ["int", "totvert"],
    ],
  },
  {
    type: "ActionSlot",
    fields: [
      ["char", "name[66]"],
      ["short", "idtype"],
      ["int", "handle"],
    ],
  },
  {
    type: "ActionStrip",
    fields: [
      ["char", "strip_type"],
      ["int", "data_index"],
    ],
  },
  {
    type: "ActionLayer",
    fields: [
      ["ActionStrip", "**strip_array"],
      ["int", "strip_array_num"],
    ],
  },
  {
    type: "ActionChannelbag",
    fields: [
      ["int", "slot_handle"],
      ["FCurve", "**fcurve_array"],
      ["int", "fcurve_array_num"],
    ],
  },
  {
    type: "ActionStripKeyframeData",
    fields: [
      ["ActionChannelbag", "**channelbag_array"],
      ["int", "channelbag_array_num"],
    ],
  },
  {
    type: "bAction",
    fields: [
      ["ID", "id"],
      ["ListBase", "curves"],
      ["ActionLayer", "**layer_array"],
      ["int", "layer_array_num"],
      ["ActionSlot", "**slot_array"],
      ["int", "slot_array_num"],
      ["ActionStripKeyframeData", "**strip_keyframe_data_array"],
      ["int", "strip_keyframe_data_array_num"],
    ],
  },
  {
    type: "NlaStrip",
    fields: [
      ["NlaStrip", "*next"],
      ["NlaStrip", "*prev"],
      ["ListBase", "strips"],
      ["bAction", "*act"],
      ["int", "flag"],
    ],
  },
  {
    type: "NlaTrack",
    fields: [
      ["NlaTrack", "*next"],
      ["NlaTrack", "*prev"],
      ["ListBase", "strips"],
      ["int", "flag"],
    ],
  },
  {
    type: "AnimData",
    fields: [
      ["bAction", "*action"],
      ["ListBase", "nla_tracks"],
      ["int", "flag"],
    ],
  },
  {
    type: "Object",
    fields: [
      ["ID", "id"],
      ["AnimData", "*adt"],
    ],
  },
];

const ACTION = 0x500n;

/** The object OBRig of a file that also holds ACWalk at `ACTION`, with the NLA tracks of `blocks` from 0x300 on. */
function rigWith(blocks: readonly BlockDefinition[]): BlendStruct {
  const bytes = writeBlend({
    header: "old",
    pointerSize: 8,
    little: true,
    structs: STRUCTS,
    blocks: [
      { code: "AC", struct: "bAction", address: ACTION, data: [{ id: { name: "ACWalk" } }] },
      { code: "OB", struct: "Object", address: 0x100n, data: [{ id: { name: "OBRig" }, adt: 0x200n }] },
      { code: "DATA", struct: "AnimData", address: 0x200n, data: [{ nla_tracks: { first: 0x300n, last: 0n } }] },
      ...blocks,
    ],
  });
  const [rig] = datablocks(readBlendFile(bytes), "OB");
  if (!rig) throw new Error("No object was written.");
  return rig;
}

/** `count` NLA strips with the fields of `record`, 0x100 apart from `first` on, each linked to the next. */
function stripChain(first: bigint, count: number, record: Record<string, FieldValue>): BlockDefinition[] {
  const address = (index: number) => first + BigInt(index) * 0x100n;
  return Array.from({ length: count }, (_, index) => ({
    code: "DATA",
    struct: "NlaStrip",
    address: address(index),
    data: [{ ...record, next: index + 1 < count ? address(index + 1) : 0n }],
  }));
}

/** A block of 8-byte pointers, as a pointer-to-pointer member points at. */
function pointers(address: bigint, targets: readonly bigint[]): BlockDefinition {
  const data = new Uint8Array(targets.length * 8);
  const view = new DataView(data.buffer);
  targets.forEach((target, index) => {
    view.setBigUint64(index * 8, target, true);
  });
  return { code: "DATA", struct: null, address, data };
}

const repeated = (address: bigint, count: number): bigint[] => Array<bigint>(count).fill(address);

describe("usedActions", () => {
  it("reads a strip that lists itself among its strips once", () => {
    const [object, track, strip, action] = [0x100n, 0x300n, 0x400n, 0x500n];
    const bytes = writeBlend({
      header: "old",
      pointerSize: 8,
      little: true,
      structs: STRUCTS,
      blocks: [
        { code: "AC", struct: "bAction", address: action, data: [{ id: { name: "ACWalk" } }] },
        { code: "OB", struct: "Object", address: object, data: [{ id: { name: "OBRig" }, adt: 0x200n }] },
        {
          code: "DATA",
          struct: "AnimData",
          address: 0x200n,
          data: [{ nla_tracks: { first: track, last: track } }],
        },
        { code: "DATA", struct: "NlaTrack", address: track, data: [{ strips: { first: strip, last: strip } }] },
        {
          code: "DATA",
          struct: "NlaStrip",
          address: strip,
          data: [{ strips: { first: strip, last: strip }, act: action }],
        },
      ],
    });
    const [rig] = datablocks(readBlendFile(bytes), "OB");
    if (!rig) throw new Error("No object was written.");
    expect(usedActions(rig).map((use) => use.played)).toEqual([true]);
  });

  it("reads a meta strip that holds more strips than a call takes arguments", { timeout: 30_000 }, () => {
    const count = 200_000;
    const rig = rigWith([
      { code: "DATA", struct: "NlaTrack", address: 0x300n, data: [{ strips: { first: 0x400n, last: 0x400n } }] },
      { code: "DATA", struct: "NlaStrip", address: 0x400n, data: [{ strips: { first: 0x10000n, last: 0n } }] },
      ...stripChain(0x10000n, count, { act: ACTION }),
    ]);
    expect(usedActions(rig)).toHaveLength(count);
  });

  it("reads each strip once where tracks and strips share one list of strips", () => {
    const count = 200;
    const shared = { first: 0x10000n, last: 0n };
    const rig = rigWith([
      { code: "DATA", struct: "NlaTrack", address: 0x300n, data: [{ next: 0x310n, strips: shared }] },
      { code: "DATA", struct: "NlaTrack", address: 0x310n, data: [{ strips: shared }] },
      ...stripChain(0x10000n, count, { strips: shared, act: ACTION }),
    ]);
    expect(usedActions(rig)).toHaveLength(count);
  });
});

describe("readActions", () => {
  it("reads once each slot, strip, keyframe data, channelbag and curve that layered actions list many times", () => {
    const [strips, bags, curves] = [0x400n, 0x600n, 0x800n];
    const bytes = writeBlend({
      header: "old",
      pointerSize: 8,
      little: true,
      structs: STRUCTS,
      blocks: [
        {
          code: "AC",
          struct: "bAction",
          address: 0x100n,
          data: [
            {
              id: { name: "ACLayered" },
              layer_array: 0x200n,
              layer_array_num: 1,
              slot_array: 0x210n,
              slot_array_num: 1,
              strip_keyframe_data_array: 0x220n,
              strip_keyframe_data_array_num: 2,
            },
          ],
        },
        pointers(0x200n, [0x300n]),
        pointers(0x210n, [0x310n]),
        pointers(0x220n, [0x500n, 0x510n]),
        { code: "DATA", struct: "ActionLayer", address: 0x300n, data: [{ strip_array: strips, strip_array_num: 40 }] },
        { code: "DATA", struct: "ActionSlot", address: 0x310n, data: [{ name: "OBRig", handle: 7 }] },
        pointers(strips, [...repeated(0x410n, 20), ...repeated(0x420n, 20)]),
        { code: "DATA", struct: "ActionStrip", address: 0x410n, data: [{ data_index: 0 }] },
        { code: "DATA", struct: "ActionStrip", address: 0x420n, data: [{ data_index: 1 }] },
        {
          code: "DATA",
          struct: "ActionStripKeyframeData",
          address: 0x500n,
          data: [{ channelbag_array: bags, channelbag_array_num: 20 }],
        },
        {
          code: "DATA",
          struct: "ActionStripKeyframeData",
          address: 0x510n,
          data: [{ channelbag_array: bags, channelbag_array_num: 20 }],
        },
        pointers(bags, repeated(0x700n, 20)),
        {
          code: "DATA",
          struct: "ActionChannelbag",
          address: 0x700n,
          data: [{ slot_handle: 7, fcurve_array: curves, fcurve_array_num: 20 }],
        },
        pointers(curves, repeated(0x900n, 20)),
        { code: "DATA", struct: "FCurve", address: 0x900n, data: [{ bezt: 0xa00n, totvert: 2 }] },
        { code: "DATA", struct: "BezTriple", address: 0xa00n, data: [{ vec: [0, 0, 0, 1] }, { vec: [0, 0, 0, 9] }] },
        {
          code: "AC",
          struct: "bAction",
          address: 0x1000n,
          data: [
            {
              id: { name: "ACCopy" },
              layer_array: 0x200n,
              layer_array_num: 1,
              slot_array: 0x210n,
              slot_array_num: 1,
              strip_keyframe_data_array: 0x220n,
              strip_keyframe_data_array_num: 2,
            },
          ],
        },
      ],
    });
    const actions = readActions(readBlendFile(bytes));
    expect(actions.map((action) => action.slots.map((slot) => [slot.identifier, slot.curves.length]))).toEqual([
      [["OBRig", 1]],
      [],
    ]);
  });

  it("gives a curve that two actions list only to the first", () => {
    const shared = { first: 0x300n, last: 0x310n };
    const bytes = writeBlend({
      header: "old",
      pointerSize: 8,
      little: true,
      structs: STRUCTS,
      blocks: [
        { code: "AC", struct: "bAction", address: 0x100n, data: [{ id: { name: "ACFirst" }, curves: shared }] },
        { code: "AC", struct: "bAction", address: 0x200n, data: [{ id: { name: "ACSecond" }, curves: shared }] },
        { code: "DATA", struct: "FCurve", address: 0x300n, data: [{ next: 0x310n }] },
        { code: "DATA", struct: "FCurve", address: 0x310n, data: [{}] },
      ],
    });
    const actions = readActions(readBlendFile(bytes));
    expect(actions.map((action) => [action.name, action.slots[0]?.curves.length])).toEqual([
      ["First", 2],
      ["Second", 0],
    ]);
  });

  it("keeps the first of the slots that share a handle, the one Blender finds by that handle", () => {
    const bytes = writeBlend({
      header: "old",
      pointerSize: 8,
      little: true,
      structs: STRUCTS,
      blocks: [
        {
          code: "AC",
          struct: "bAction",
          address: 0x100n,
          data: [
            {
              id: { name: "ACLayered" },
              layer_array: 0x200n,
              layer_array_num: 1,
              slot_array: 0x210n,
              slot_array_num: 3,
              strip_keyframe_data_array: 0x220n,
              strip_keyframe_data_array_num: 1,
            },
          ],
        },
        pointers(0x200n, [0x300n]),
        pointers(0x210n, [0x310n, 0x320n, 0x330n]),
        pointers(0x220n, [0x500n]),
        { code: "DATA", struct: "ActionLayer", address: 0x300n, data: [{ strip_array: 0x400n, strip_array_num: 1 }] },
        { code: "DATA", struct: "ActionSlot", address: 0x310n, data: [{ name: "OBRig", handle: 7 }] },
        { code: "DATA", struct: "ActionSlot", address: 0x320n, data: [{ name: "OBCopy", handle: 7 }] },
        { code: "DATA", struct: "ActionSlot", address: 0x330n, data: [{ name: "OBProp", handle: 8 }] },
        pointers(0x400n, [0x410n]),
        { code: "DATA", struct: "ActionStrip", address: 0x410n, data: [{ data_index: 0 }] },
        {
          code: "DATA",
          struct: "ActionStripKeyframeData",
          address: 0x500n,
          data: [{ channelbag_array: 0x600n, channelbag_array_num: 1 }],
        },
        pointers(0x600n, [0x700n]),
        {
          code: "DATA",
          struct: "ActionChannelbag",
          address: 0x700n,
          data: [{ slot_handle: 7, fcurve_array: 0x800n, fcurve_array_num: 2 }],
        },
        pointers(0x800n, [0x900n, 0x910n]),
        { code: "DATA", struct: "FCurve", address: 0x900n, data: [{}] },
        { code: "DATA", struct: "FCurve", address: 0x910n, data: [{}] },
      ],
    });
    const [action] = readActions(readBlendFile(bytes));
    expect(action?.slots.map((slot) => [slot.identifier, slot.handle, slot.curves.length])).toEqual([
      ["OBRig", 7, 2],
      ["OBProp", 8, 0],
    ]);
  });
});

describe("actionRange", () => {
  it("starts an action whose keys start after frame 1 at its first key", () => {
    const keys = [40, 55, 70].map((frame) => ({ vec: [frame - 1, 0, 0, frame, frame / 10, 0, frame + 1, 0, 0] }));
    const bytes = writeBlend({
      header: "old",
      pointerSize: 8,
      little: true,
      structs: STRUCTS,
      blocks: [
        {
          code: "AC",
          struct: "bAction",
          address: 0x100n,
          data: [{ id: { name: "ACLate" }, curves: { first: 0x200n } }],
        },
        { code: "DATA", struct: "FCurve", address: 0x200n, data: [{ bezt: 0x300n, totvert: keys.length }] },
        { code: "DATA", struct: "BezTriple", address: 0x300n, data: keys },
      ],
    });
    const [late] = readActions(readBlendFile(bytes));
    if (!late) throw new Error("No action was read.");
    expect(actionRange(late)).toEqual([40, 70]);
    expect(actionRange({ ...late, manualRange: [10, 20] })).toEqual([10, 20]);
  });
});
