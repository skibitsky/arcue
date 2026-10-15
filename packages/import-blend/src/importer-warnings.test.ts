import { describe, expect, it } from "vitest";
import { importBytes } from "../test/fixtures";
import type { BlockDefinition, FieldValue, FileDefinition } from "../test/synthetic";
import { writeBlend } from "../test/synthetic";
import { IdCode, NLASTRIP_MUTED } from "./anim/actions";
import { Interpolation } from "./anim/fcurve";
import { CustomDataType } from "./scene/mesh-data";
import { ModifierType } from "./scene/modifiers";
import { ArmatureDeformFlag, ObjectType } from "./scene/objects";

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
    type: "Scene",
    fields: [
      ["ID", "id"],
      ["Collection", "*master_collection"],
    ],
  },
  {
    type: "Collection",
    fields: [
      ["ID", "id"],
      ["ListBase", "gobject"],
    ],
  },
  {
    type: "CollectionObject",
    fields: [
      ["CollectionObject", "*next"],
      ["CollectionObject", "*prev"],
      ["Object", "*ob"],
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
      ["char", "*rna_path"],
      ["int", "array_index"],
      ["int", "totvert"],
      ["short", "flag"],
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
    ],
  },
  {
    type: "AnimData",
    fields: [
      ["bAction", "*action"],
      ["int", "slot_handle"],
      ["ListBase", "nla_tracks"],
      ["ListBase", "drivers"],
    ],
  },
  {
    type: "bConstraint",
    fields: [
      ["bConstraint", "*next"],
      ["bConstraint", "*prev"],
      ["char", "name[64]"],
      ["float", "enforce"],
    ],
  },
  {
    type: "bPoseChannel",
    fields: [
      ["bPoseChannel", "*next"],
      ["bPoseChannel", "*prev"],
      ["char", "name[64]"],
      ["ListBase", "constraints"],
    ],
  },
  { type: "bPose", fields: [["ListBase", "chanbase"]] },
  {
    type: "ModifierData",
    fields: [
      ["ModifierData", "*next"],
      ["ModifierData", "*prev"],
      ["int", "type"],
      ["int", "mode"],
      ["char", "name[64]"],
    ],
  },
  {
    type: "ArmatureModifierData",
    fields: [
      ["ModifierData", "modifier"],
      ["Object", "*object"],
      ["short", "deformflag"],
    ],
  },
  {
    type: "Object",
    fields: [
      ["ID", "id"],
      ["AnimData", "*adt"],
      ["Object", "*parent"],
      ["void", "*data"],
      ["short", "type"],
      ["float", "parentinv[4][4]"],
      ["ListBase", "modifiers"],
      ["ListBase", "constraints"],
      ["bPose", "*pose"],
    ],
  },
  {
    type: "Bone",
    fields: [
      ["Bone", "*next"],
      ["Bone", "*prev"],
      ["char", "name[64]"],
      ["ListBase", "childbase"],
      ["float", "arm_mat[4][4]"],
      ["float", "length"],
    ],
  },
  {
    type: "bArmature",
    fields: [
      ["ID", "id"],
      ["ListBase", "bonebase"],
    ],
  },
  {
    type: "CustomDataLayer",
    fields: [
      ["int", "type"],
      ["void", "*data"],
    ],
  },
  {
    type: "CustomData",
    fields: [
      ["CustomDataLayer", "*layers"],
      ["int", "totlayer"],
    ],
  },
  { type: "MVert", fields: [["float", "co[3]"]] },
  {
    type: "MEdge",
    fields: [
      ["int", "v1"],
      ["int", "v2"],
    ],
  },
  {
    type: "MPoly",
    fields: [
      ["int", "loopstart"],
      ["int", "totloop"],
    ],
  },
  {
    type: "MLoop",
    fields: [
      ["int", "v"],
      ["int", "e"],
    ],
  },
  {
    type: "MDeformWeight",
    fields: [
      ["int", "def_nr"],
      ["float", "weight"],
    ],
  },
  {
    type: "MDeformVert",
    fields: [
      ["MDeformWeight", "*dw"],
      ["int", "totweight"],
    ],
  },
  {
    type: "bDeformGroup",
    fields: [
      ["bDeformGroup", "*next"],
      ["bDeformGroup", "*prev"],
      ["char", "name[64]"],
    ],
  },
  {
    type: "Mesh",
    fields: [
      ["ID", "id"],
      ["CustomData", "vdata"],
      ["CustomData", "edata"],
      ["CustomData", "pdata"],
      ["CustomData", "ldata"],
      ["int", "totvert"],
      ["int", "totedge"],
      ["int", "totpoly"],
      ["int", "totloop"],
      ["MDeformVert", "*dvert"],
      ["ListBase", "vertex_group_names"],
    ],
  },
];

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const MODIFIER_ON_IN_VIEWPORT = 1;
const FCURVE_MUTED = 1 << 4;

/**
 * A scene of `count` objects that share one triangle, skinned by Rig and parented to Carrier, which an action moves
 * along x while Rig stays. Every object then moves apart from the armature that deforms it.
 */
function skinnedCrowd(count: number): Uint8Array {
  const entry = (index: number) => 0x1000_0000n + BigInt(index) * 0x40n;
  const skinned = (index: number) => 0x2000_0000n + BigInt(index) * 0x100n;
  const modifier = (index: number) => 0x3000_0000n + BigInt(index) * 0x100n;
  const objects = [0x300n, 0x400n, ...Array.from({ length: count }, (_, index) => skinned(index))];
  const triangle = [0, 1, 2];
  const layer = (type: number, data: bigint) => [{ type, data }];
  const blocks: BlockDefinition[] = [
    { code: "SC", struct: "Scene", address: 0x100n, data: [{ id: { name: "SCScene" }, master_collection: 0x200n }] },
    {
      code: "DATA",
      struct: "Collection",
      address: 0x200n,
      data: [{ gobject: { first: entry(0), last: entry(objects.length - 1) } }],
    },
    ...objects.map((ob, index) => ({
      code: "DATA",
      struct: "CollectionObject",
      address: entry(index),
      data: [{ next: index + 1 < objects.length ? entry(index + 1) : 0n, prev: index > 0 ? entry(index - 1) : 0n, ob }],
    })),
    {
      code: "OB",
      struct: "Object",
      address: 0x300n,
      data: [{ id: { name: "OBRig" }, data: 0x310n, type: ObjectType.armature, parentinv: IDENTITY }],
    },
    {
      code: "AR",
      struct: "bArmature",
      address: 0x310n,
      data: [{ id: { name: "ARRig" }, bonebase: { first: 0x320n } }],
    },
    { code: "DATA", struct: "Bone", address: 0x320n, data: [{ name: "Bone", arm_mat: IDENTITY, length: 1 }] },
    {
      code: "OB",
      struct: "Object",
      address: 0x400n,
      data: [{ id: { name: "OBCarrier" }, adt: 0x410n, type: ObjectType.empty, parentinv: IDENTITY }],
    },
    { code: "DATA", struct: "AnimData", address: 0x410n, data: [{ action: 0x500n }] },
    { code: "AC", struct: "bAction", address: 0x500n, data: [{ id: { name: "ACCarry" }, curves: { first: 0x510n } }] },
    {
      code: "DATA",
      struct: "FCurve",
      address: 0x510n,
      data: [{ bezt: 0x520n, rna_path: 0x530n, array_index: 0, totvert: 2 }],
    },
    {
      code: "DATA",
      struct: "BezTriple",
      address: 0x520n,
      data: [
        { vec: [0, 0, 0, 1, 0, 0, 2, 0, 0], ipo: Interpolation.linear },
        { vec: [9, 4, 0, 10, 4, 0, 11, 4, 0], ipo: Interpolation.linear },
      ],
    },
    { code: "DATA", struct: null, address: 0x530n, data: new TextEncoder().encode("location\0") },
    {
      code: "ME",
      struct: "Mesh",
      address: 0x600n,
      data: [
        {
          id: { name: "METriangle" },
          vdata: { layers: 0x610n, totlayer: 1 },
          edata: { layers: 0x620n, totlayer: 1 },
          pdata: { layers: 0x630n, totlayer: 1 },
          ldata: { layers: 0x640n, totlayer: 1 },
          totvert: 3,
          totedge: 3,
          totpoly: 1,
          totloop: 3,
          dvert: 0x800n,
          vertex_group_names: { first: 0x900n, last: 0x900n },
        },
      ],
    },
    { code: "DATA", struct: "CustomDataLayer", address: 0x610n, data: layer(CustomDataType.vertex, 0x700n) },
    { code: "DATA", struct: "CustomDataLayer", address: 0x620n, data: layer(CustomDataType.edge, 0x710n) },
    { code: "DATA", struct: "CustomDataLayer", address: 0x630n, data: layer(CustomDataType.face, 0x720n) },
    { code: "DATA", struct: "CustomDataLayer", address: 0x640n, data: layer(CustomDataType.loop, 0x730n) },
    { code: "DATA", struct: "MVert", address: 0x700n, data: [{ co: [0, 0, 0] }, { co: [1, 0, 0] }, { co: [0, 1, 0] }] },
    {
      code: "DATA",
      struct: "MEdge",
      address: 0x710n,
      data: triangle.map((v) => ({ v1: v, v2: (v + 1) % 3 })),
    },
    { code: "DATA", struct: "MPoly", address: 0x720n, data: [{ loopstart: 0, totloop: 3 }] },
    { code: "DATA", struct: "MLoop", address: 0x730n, data: triangle.map((v) => ({ v, e: v })) },
    {
      code: "DATA",
      struct: "MDeformVert",
      address: 0x800n,
      data: triangle.map((v) => ({ dw: 0x810n + BigInt(v) * 0x10n, totweight: 1 })),
    },
    ...triangle.map((v) => ({
      code: "DATA",
      struct: "MDeformWeight",
      address: 0x810n + BigInt(v) * 0x10n,
      data: [{ def_nr: 0, weight: 1 }],
    })),
    { code: "DATA", struct: "bDeformGroup", address: 0x900n, data: [{ name: "Bone" }] },
    ...Array.from({ length: count }, (_, index): BlockDefinition[] => [
      {
        code: "OB",
        struct: "Object",
        address: skinned(index),
        data: [
          {
            id: { name: `OBSkin${index}` },
            parent: 0x400n,
            data: 0x600n,
            type: ObjectType.mesh,
            parentinv: IDENTITY,
            modifiers: { first: modifier(index), last: modifier(index) },
          },
        ],
      },
      {
        code: "DATA",
        struct: "ArmatureModifierData",
        address: modifier(index),
        data: [
          {
            modifier: { type: ModifierType.armature, mode: MODIFIER_ON_IN_VIEWPORT, name: "Armature" },
            object: 0x300n,
            deformflag: ArmatureDeformFlag.vertexGroups,
          },
        ],
      },
    ]).flat(),
  ];
  return writeBlend({ header: "old", pointerSize: 8, little: true, version: "300", structs: STRUCTS, blocks });
}

interface KeyedPath {
  path: string;
  muted?: boolean;
}

interface ConstrainedObject {
  name: string;
  /** The names of the object's constraints, each on and at zero influence. */
  constraints?: string[];
  /** For an armature, its bones, each with the names of its constraints, on and at zero influence. */
  bones?: { name: string; constraints: string[] }[];
  action?: string;
  slot?: number;
  /** The strips of the object's one NLA track. */
  strips?: { action: string; muted?: boolean }[];
  drivers?: KeyedPath[];
  /** Whether the file holds the object without the scene showing it. */
  outside?: boolean;
}

interface KeyedAction {
  name: string;
  /** A legacy action's curves. */
  curves?: KeyedPath[];
  /** A layered action's slots on objects, each with its curves. */
  slots?: { identifier: string; handle: number; curves: KeyedPath[] }[];
}

/** A scene of `objects`, each an empty or an armature, in a file that also holds `actions`. */
function constrainedScene(objects: readonly ConstrainedObject[], actions: readonly KeyedAction[]): Uint8Array {
  const blocks: BlockDefinition[] = [];
  let last = 0x1000n;
  const address = () => {
    last += 0x1000n;
    return last;
  };
  const data = (struct: string | null, records: Record<string, FieldValue>[] | Uint8Array) => {
    const at = address();
    blocks.push({ code: "DATA", struct, address: at, data: records });
    return at;
  };
  const linked = (struct: string, records: readonly Record<string, FieldValue>[]) => {
    const addresses = records.map(() => address());
    records.forEach((record, index) => {
      const links = { next: addresses[index + 1] ?? 0n, prev: addresses[index - 1] ?? 0n };
      blocks.push({ code: "DATA", struct, address: addresses[index] ?? 0n, data: [{ ...record, ...links }] });
    });
    return { first: addresses[0] ?? 0n, last: addresses.at(-1) ?? 0n };
  };
  const pointers = (targets: readonly bigint[]) => {
    const bytes = new Uint8Array(targets.length * 8);
    const view = new DataView(bytes.buffer);
    for (const [index, target] of targets.entries()) view.setBigUint64(index * 8, target, true);
    return data(null, bytes);
  };
  const curve = ({ path, muted }: KeyedPath): Record<string, FieldValue> => ({
    bezt: data("BezTriple", [{ vec: [0, 0, 0, 1, 0, 0, 2, 0, 0] }, { vec: [9, 1, 0, 10, 1, 0, 11, 1, 0] }]),
    rna_path: data(null, new TextEncoder().encode(`${path}\0`)),
    totvert: 2,
    flag: muted ? FCURVE_MUTED : 0,
  });
  const zeroInfluence = (names: readonly string[]) =>
    linked(
      "bConstraint",
      names.map((name) => ({ name })),
    );

  const actionAt = new Map(actions.map(({ name }) => [name, address()]));
  for (const { name, curves = [], slots } of actions) {
    let record: Record<string, FieldValue> = { id: { name: `AC${name}` }, curves: linked("FCurve", curves.map(curve)) };
    if (slots) {
      const bags = slots.map(({ handle, curves: keyed }) => {
        const array = pointers(keyed.map((path) => data("FCurve", [curve(path)])));
        return data("ActionChannelbag", [{ slot_handle: handle, fcurve_array: array, fcurve_array_num: keyed.length }]);
      });
      const keyframes = data("ActionStripKeyframeData", [
        { channelbag_array: pointers(bags), channelbag_array_num: bags.length },
      ]);
      const strip = data("ActionStrip", [{ data_index: 0 }]);
      const layer = data("ActionLayer", [{ strip_array: pointers([strip]), strip_array_num: 1 }]);
      const slotStructs = slots.map(({ identifier, handle }) =>
        data("ActionSlot", [{ name: identifier, idtype: IdCode.object, handle }]),
      );
      record = {
        ...record,
        layer_array: pointers([layer]),
        layer_array_num: 1,
        slot_array: pointers(slotStructs),
        slot_array_num: slots.length,
        strip_keyframe_data_array: pointers([keyframes]),
        strip_keyframe_data_array_num: 1,
      };
    }
    blocks.push({ code: "AC", struct: "bAction", address: actionAt.get(name) ?? 0n, data: [record] });
  }

  const objectAt = objects.map(() => address());
  for (const [index, object] of objects.entries()) {
    const record: Record<string, FieldValue> = {
      id: { name: `OB${object.name}` },
      type: object.bones ? ObjectType.armature : ObjectType.empty,
      parentinv: IDENTITY,
      constraints: zeroInfluence(object.constraints ?? []),
    };
    if (object.bones) {
      const armature = address();
      const bones = linked(
        "Bone",
        object.bones.map(({ name }) => ({ name, arm_mat: IDENTITY, length: 1 })),
      );
      blocks.push({
        code: "AR",
        struct: "bArmature",
        address: armature,
        data: [{ id: { name: `AR${object.name}` }, bonebase: bones }],
      });
      const channels = object.bones.map(({ name, constraints }) => ({ name, constraints: zeroInfluence(constraints) }));
      record.data = armature;
      record.pose = data("bPose", [{ chanbase: linked("bPoseChannel", channels) }]);
    }
    if (object.action || object.strips || object.drivers) {
      const strips = (object.strips ?? []).map(({ action, muted }) => ({
        act: actionAt.get(action) ?? 0n,
        flag: muted ? NLASTRIP_MUTED : 0,
      }));
      record.adt = data("AnimData", [
        {
          action: object.action ? (actionAt.get(object.action) ?? 0n) : 0n,
          slot_handle: object.slot ?? 0,
          nla_tracks: linked("NlaTrack", object.strips ? [{ strips: linked("NlaStrip", strips) }] : []),
          drivers: linked("FCurve", (object.drivers ?? []).map(curve)),
        },
      ]);
    }
    blocks.push({ code: "OB", struct: "Object", address: objectAt[index] ?? 0n, data: [record] });
  }

  const entries = linked(
    "CollectionObject",
    objectAt.flatMap((ob, index) => (objects[index]?.outside ? [] : [{ ob }])),
  );
  blocks.unshift(
    { code: "SC", struct: "Scene", address: 0x100n, data: [{ id: { name: "SCScene" }, master_collection: 0x200n }] },
    { code: "DATA", struct: "Collection", address: 0x200n, data: [{ gobject: entries }] },
  );
  return writeBlend({ header: "old", pointerSize: 8, little: true, version: "300", structs: STRUCTS, blocks });
}

/** The message and detail of each warning about constraints that an import of `constrainedScene` gives. */
async function constraintWarnings(
  objects: readonly ConstrainedObject[],
  actions: readonly KeyedAction[],
): Promise<[string, string | undefined][]> {
  const scene = await importBytes("constraints.blend", constrainedScene(objects, actions));
  return scene.source.warnings
    .filter((warning) => warning.code === "constraint-not-evaluated")
    .map((warning) => [warning.message, warning.detail]);
}

describe("the warnings of an import", () => {
  it("note each skinned mesh a clip moves apart from its armature, more than a call takes arguments", {
    timeout: 60_000,
  }, async () => {
    const count = 150_000;
    const scene = await importBytes("crowd.blend", skinnedCrowd(count));
    const motion = scene.source.warnings.filter((warning) => warning.message.startsWith("Motion relative"));
    expect(motion).toHaveLength(count);
    expect(motion[0]).toMatchObject({
      subject: { kind: "node", name: "Skin0" },
      detail: "The preview keeps its rest offset from Rig in Carry",
    });
  });

  describe("about constraints at zero influence", () => {
    const follow = 'constraints["Follow"].influence';
    const reach = 'pose.bones["Arm"].constraints["Reach"].influence';

    it("name only the object whose own action animates the influence", async () => {
      const warnings = await constraintWarnings(
        [
          { name: "Leader", constraints: ["Follow"], action: "Fade" },
          { name: "Bystander", constraints: ["Follow"] },
        ],
        [{ name: "Fade", curves: [{ path: follow }] }],
      );
      expect(warnings).toEqual([["Constraints not evaluated: Leader", undefined]]);
    });

    it("name only the rig whose own action animates a bone's influence", async () => {
      const warnings = await constraintWarnings(
        [
          { name: "Keyed", bones: [{ name: "Arm", constraints: ["Reach"] }], action: "Grab" },
          { name: "Still", bones: [{ name: "Arm", constraints: ["Reach"] }] },
        ],
        [{ name: "Grab", curves: [{ path: reach }] }],
      );
      expect(warnings).toEqual([["Bone constraints not evaluated: Keyed", "Bones: Arm"]]);
    });

    it("leave out an influence that only an action nothing uses animates, where no guess places the action", async () => {
      const warnings = await constraintWarnings(
        [{ name: "Loner", constraints: ["Follow"] }],
        [{ name: "Spare", curves: [{ path: follow }] }],
      );
      expect(warnings).toEqual([]);
    });

    const rig = { name: "Rig", bones: [{ name: "Arm", constraints: ["Reach"] }], action: "Idle" };
    const idle = { name: "Idle", curves: [{ path: 'pose.bones["Arm"].location' }] };
    const attack = { name: "Attack", curves: [{ path: 'pose.bones["Arm"].location' }, { path: reach }] };

    it("name a rig whose clip of an action on a muted strip animates a bone's influence", async () => {
      const warnings = await constraintWarnings(
        [{ ...rig, strips: [{ action: "Attack", muted: true }] }],
        [idle, attack],
      );
      expect(warnings).toEqual([["Bone constraints not evaluated: Rig", "Bones: Arm"]]);
    });

    it("name a rig whose clip of an action nothing uses, placed by the bones it keys, animates a bone's influence", async () => {
      const warnings = await constraintWarnings([rig], [idle, attack]);
      expect(warnings).toEqual([["Bone constraints not evaluated: Rig", "Bones: Arm"]]);
    });

    it("leave out an influence that only an action on a muted strip animates, which moves nothing to make a clip of", async () => {
      const reaching = { name: "Reaching", curves: [{ path: reach }] };
      const warnings = await constraintWarnings(
        [{ ...rig, strips: [{ action: "Reaching", muted: true }] }],
        [idle, reaching],
      );
      expect(warnings).toEqual([]);
    });

    it("leave out an influence that a driver on an object outside the scene animates", async () => {
      const warnings = await constraintWarnings(
        [
          { name: "Shown", constraints: ["Follow"] },
          { name: "Unshown", constraints: ["Follow"], drivers: [{ path: follow }], outside: true },
        ],
        [],
      );
      expect(warnings).toEqual([]);
    });

    it("leave out an influence that a layered action animates only in another object's slot", async () => {
      const warnings = await constraintWarnings(
        [
          { name: "First", constraints: ["Follow"], action: "Shared", slot: 1 },
          { name: "Second", constraints: ["Follow"], action: "Shared", slot: 2 },
        ],
        [
          {
            name: "Shared",
            slots: [
              { identifier: "OBFirst", handle: 1, curves: [{ path: "location" }] },
              { identifier: "OBSecond", handle: 2, curves: [{ path: follow }] },
            ],
          },
        ],
      );
      expect(warnings).toEqual([["Constraints not evaluated: Second", undefined]]);
    });

    it("leave out an object whose muted strip holds an action another object plays", async () => {
      const warnings = await constraintWarnings(
        [
          { name: "Playing", constraints: ["Follow"], strips: [{ action: "Fade" }] },
          { name: "Muted", constraints: ["Follow"], strips: [{ action: "Fade", muted: true }] },
        ],
        [{ name: "Fade", curves: [{ path: follow }] }],
      );
      expect(warnings).toEqual([["Constraints not evaluated: Playing", undefined]]);
    });

    it("count the object's drivers, not muted drivers or muted curves", async () => {
      const warnings = await constraintWarnings(
        [
          { name: "Driven", constraints: ["Follow"], drivers: [{ path: follow }] },
          { name: "MutedDriver", constraints: ["Follow"], drivers: [{ path: follow, muted: true }] },
          { name: "MutedCurve", constraints: ["Follow"], action: "Hushed" },
        ],
        [{ name: "Hushed", curves: [{ path: follow, muted: true }] }],
      );
      expect(warnings).toEqual([["Constraints not evaluated: Driven", undefined]]);
    });
  });
});
