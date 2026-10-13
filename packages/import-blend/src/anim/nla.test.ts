import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fixturesDir, importFixture, readFixture, VERSIONS } from "../../test/fixtures";
import { matrixError, worldMatrices } from "../../test/geometry";
import type { BlockDefinition, FieldValue, FileDefinition } from "../../test/synthetic";
import { writeBlend } from "../../test/synthetic";
import { decompressBlend } from "../blend/decompress";
import { readBlendFile } from "../blend/file";
import { datablocks, idName } from "../blend/ids";
import { channelValues, objectValues } from "../scene/transforms";
import type { Action } from "./actions";
import { readActions, usedActions } from "./actions";
import { Interpolation } from "./fcurve";
import type { Player } from "./nla";
import { animatedValues, clampSpans, joinSpans, MAX_META_DEPTH, NlaTracks, scenePlayer, withoutSpans } from "./nla";
import { startPoses } from "./opening";

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
    type: "FModifier",
    fields: [
      ["FModifier", "*next"],
      ["FModifier", "*prev"],
      ["short", "type"],
      ["short", "flag"],
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
      ["short", "extend"],
      ["ListBase", "modifiers"],
    ],
  },
  {
    type: "bAction",
    fields: [
      ["ID", "id"],
      ["ListBase", "curves"],
    ],
  },
  {
    type: "NlaStrip",
    fields: [
      ["NlaStrip", "*next"],
      ["NlaStrip", "*prev"],
      ["ListBase", "strips"],
      ["bAction", "*act"],
      ["ListBase", "fcurves"],
      ["ListBase", "modifiers"],
      ["float", "influence"],
      ["float", "strip_time"],
      ["float", "start"],
      ["float", "end"],
      ["float", "actstart"],
      ["float", "actend"],
      ["float", "repeat"],
      ["float", "scale"],
      ["float", "blendin"],
      ["float", "blendout"],
      ["short", "blendmode"],
      ["short", "extendmode"],
      ["short", "type"],
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
      ["bAction", "*tmpact"],
      ["ListBase", "nla_tracks"],
      ["NlaTrack", "*act_track"],
      ["NlaStrip", "*actstrip"],
      ["ListBase", "drivers"],
      ["int", "flag"],
      ["short", "act_blendmode"],
      ["short", "act_extendmode"],
      ["float", "act_influence"],
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

const Blend = { replace: 0, add: 1, subtract: 2, multiply: 3, combine: 4 } as const;
const Extend = { hold: 0, holdForward: 1, nothing: 2 } as const;
const StripType = { clip: 0, transition: 1, meta: 2 } as const;
const StripFlag = {
  userInfluence: 1 << 5,
  userTime: 1 << 6,
  userTimeCyclic: 1 << 7,
  syncLength: 1 << 9,
  reverse: 1 << 11,
  muted: 1 << 12,
};
const TrackFlag = { solo: 1 << 3, muted: 1 << 2, disabled: 1 << 10 };
const AnimFlag = { solo: 1 << 0, tweaking: 1 << 2, upperTracks: 1 << 5 };
const NOISE = 5;

interface CurveSpec {
  path: string;
  index?: number;
  /** Linear keys as frame, value, frame, value and so on. */
  keys: readonly number[];
  noise?: boolean;
  linearExtrapolation?: boolean;
}

interface ActionSpec {
  curves: readonly CurveSpec[];
  linked?: boolean;
}

interface StripSpec {
  action?: string;
  start: number;
  end: number;
  actionStart?: number;
  actionEnd?: number;
  blendMode?: number;
  extendMode?: number;
  influence?: number;
  time?: number;
  repeat?: number;
  scale?: number;
  blendIn?: number;
  flag?: number;
  type?: number;
  curves?: readonly CurveSpec[];
  modified?: boolean;
  tweaked?: boolean;
}

interface TrackSpec {
  flag?: number;
  strips: StripSpec[];
}

interface AnimationSpec {
  actions: Record<string, ActionSpec>;
  action?: string;
  tmpact?: string;
  tracks?: TrackSpec[];
  flag?: number;
  blendMode?: number;
  extendMode?: number;
  influence?: number;
  drivers?: readonly CurveSpec[];
}

function pairs(keys: readonly number[]): [number, number][] {
  return Array.from({ length: keys.length / 2 }, (_, i) => [keys[2 * i] ?? 0, keys[2 * i + 1] ?? 0]);
}

class FileBuilder {
  readonly blocks: BlockDefinition[] = [];
  readonly actions = new Map<string, bigint>();
  tweakedTrack = 0n;
  tweakedStrip = 0n;
  #next = 0x1000n;

  address(): bigint {
    this.#next += 0x100n;
    return this.#next;
  }

  /** A ListBase over records written at fresh addresses, each linked to its neighbors. */
  list<T>(items: readonly T[], struct: string, record: (item: T, address: bigint) => Record<string, FieldValue>) {
    const addresses = items.map(() => this.address());
    items.forEach((item, i) => {
      const address = addresses[i] ?? 0n;
      const links = { next: addresses[i + 1] ?? 0n, prev: addresses[i - 1] ?? 0n };
      this.blocks.push({ code: "DATA", struct, address, data: [{ ...links, ...record(item, address) }] });
    });
    return { first: addresses[0] ?? 0n, last: addresses[addresses.length - 1] ?? 0n };
  }

  text(value: string): bigint {
    const address = this.address();
    this.blocks.push({ code: "DATA", struct: null, address, data: new TextEncoder().encode(`${value}\0`) });
    return address;
  }

  curves(specs: readonly CurveSpec[]) {
    return this.list(specs, "FCurve", (spec) => {
      const bezt = this.address();
      const data = pairs(spec.keys).map(([frame, value]) => ({
        vec: [frame - 1, value, 0, frame, value, 0, frame + 1, value, 0],
        ipo: Interpolation.linear,
      }));
      this.blocks.push({ code: "DATA", struct: "BezTriple", address: bezt, data });
      return {
        bezt,
        rna_path: this.text(spec.path),
        array_index: spec.index ?? 0,
        totvert: spec.keys.length / 2,
        extend: spec.linearExtrapolation ? 1 : 0,
        modifiers: this.list(spec.noise ? [NOISE] : [], "FModifier", (type) => ({ type })),
      };
    });
  }

  strips(specs: readonly StripSpec[]) {
    return this.list(specs, "NlaStrip", (spec, address) => {
      if (spec.tweaked) this.tweakedStrip = address;
      return {
        act: spec.action ? (this.actions.get(spec.action) ?? 0n) : 0n,
        fcurves: this.curves(spec.curves ?? []),
        modifiers: this.list(spec.modified ? [NOISE] : [], "FModifier", (type) => ({ type })),
        influence: spec.influence ?? 1,
        strip_time: spec.time ?? 0,
        start: spec.start,
        end: spec.end,
        actstart: spec.actionStart ?? spec.start,
        actend: spec.actionEnd ?? spec.end,
        repeat: spec.repeat ?? 1,
        scale: spec.scale ?? 1,
        blendin: spec.blendIn ?? 0,
        blendmode: spec.blendMode ?? Blend.replace,
        extendmode: spec.extendMode ?? Extend.hold,
        type: spec.type ?? 0,
        flag: spec.flag ?? 0,
      };
    });
  }

  file(spec: AnimationSpec): Uint8Array {
    for (const [name, action] of Object.entries(spec.actions)) {
      const address = this.address();
      this.actions.set(name, address);
      const id = { name: `AC${name}`, lib: action.linked ? 1n : 0n };
      this.blocks.push({ code: "AC", struct: "bAction", address, data: [{ id, curves: this.curves(action.curves) }] });
    }
    const tracks = this.list(spec.tracks ?? [], "NlaTrack", (track, address) => {
      if (track.strips.some((strip) => strip.tweaked)) this.tweakedTrack = address;
      return { strips: this.strips(track.strips), flag: track.flag ?? 0 };
    });
    const adt = this.address();
    this.blocks.push({
      code: "DATA",
      struct: "AnimData",
      address: adt,
      data: [
        {
          action: spec.action ? (this.actions.get(spec.action) ?? 0n) : 0n,
          tmpact: spec.tmpact ? (this.actions.get(spec.tmpact) ?? 0n) : 0n,
          nla_tracks: tracks,
          act_track: this.tweakedTrack,
          actstrip: this.tweakedStrip,
          drivers: this.curves(spec.drivers ?? []),
          flag: spec.flag ?? 0,
          act_blendmode: spec.blendMode ?? Blend.replace,
          act_extendmode: spec.extendMode ?? Extend.hold,
          act_influence: spec.influence ?? 1,
        },
      ],
    });
    this.blocks.push({ code: "OB", struct: "Object", address: 0x100n, data: [{ id: { name: "OBThing" }, adt }] });
    return writeBlend({
      header: "old",
      pointerSize: 8,
      little: true,
      version: "300",
      structs: STRUCTS,
      blocks: this.blocks,
    });
  }
}

/** The values the object's animation writes at `frame`, by path and index such as "location[1]". */
function written(spec: AnimationSpec, frame: number): Record<string, number> {
  const file = readBlendFile(new FileBuilder().file(spec));
  const [object] = datablocks(file, "OB");
  if (!object) throw new Error("The synthetic file has no object.");
  const actions = new Map(readActions(file).map((action) => [action.struct.offset, action]));
  const values = animatedValues(object, frame, actions);
  return Object.fromEntries(values.map(({ path, index, value }) => [`${path}[${index}]`, value]));
}

const keyed = (path: string, index: number, ...keys: number[]): ActionSpec => ({ curves: [{ path, index, keys }] });
const y = (...keys: number[]) => keyed("location", 1, ...keys);
const constant = (path: string, index: number, value: number) => keyed(path, index, 1, value, 11, value);
const quaternion = (...values: number[]): ActionSpec => ({
  curves: values.map((value, index) => ({ path: "rotation_quaternion", index, keys: [1, value, 11, value] })),
});

describe("animatedValues of an NLA strip", () => {
  const pushed = (extendMode: number): AnimationSpec => ({
    actions: { Move: y(1, 10, 21, 30) },
    tracks: [{ strips: [{ action: "Move", start: 11, end: 31, actionStart: 1, actionEnd: 21, extendMode }] }],
  });

  it("plays the action frame the strip maps a frame to", () => {
    expect(written(pushed(Extend.hold), 16)).toEqual({ "location[1]": 15 });
    expect(written(pushed(Extend.hold), 31)).toEqual({ "location[1]": 30 });
  });

  it("holds the first strip's first frame before it, and writes the default where no strip plays", () => {
    expect(written(pushed(Extend.hold), 5)).toEqual({ "location[1]": 10 });
    expect(written(pushed(Extend.holdForward), 5)).toEqual({ "location[1]": 0 });
    expect(written(pushed(Extend.nothing), 40)).toEqual({ "location[1]": 0 });
  });

  it("holds a strip's last frame until the next strip starts", () => {
    const spec: AnimationSpec = {
      actions: { First: constant("location", 1, 1), Second: constant("location", 1, 3) },
      tracks: [
        {
          strips: [
            { action: "First", start: 1, end: 3, actionStart: 1, actionEnd: 3 },
            { action: "Second", start: 8, end: 10, actionStart: 1, actionEnd: 3, extendMode: Extend.holdForward },
          ],
        },
      ],
    };
    expect(written(spec, 5)).toEqual({ "location[1]": 1 });
    expect(written(spec, 20)).toEqual({ "location[1]": 3 });
  });

  it.each([
    ["scaled and repeated", { scale: 0.5, repeat: 3, start: -3, end: 12 }, 6],
    ["reversed", { flag: StripFlag.reverse }, 6],
    ["timed by its own curve", { flag: StripFlag.userTime, curves: [{ path: "strip_time", keys: [1, 11, 11, 1] }] }, 6],
    [
      "timed by its own cyclic curve",
      { flag: StripFlag.userTime | StripFlag.userTimeCyclic, curves: [{ path: "strip_time", keys: [1, 9, 9, 17] }] },
      1,
    ],
  ] as const)("plays a strip %s", (_, settings, expected) => {
    const spec: AnimationSpec = {
      actions: { Move: y(1, 0, 11, 10) },
      tracks: [{ strips: [{ action: "Move", start: 1, end: 11, actionStart: 1, actionEnd: 11, ...settings }] }],
    };
    expect(written(spec, 5)["location[1]"]).toBeCloseTo(expected, 5);
  });
});

describe("animatedValues of NLA strips blended over one another", () => {
  const layered = (lower: ActionSpec, upper: ActionSpec, settings: Partial<StripSpec> = {}): AnimationSpec => ({
    actions: { Lower: lower, Upper: upper },
    tracks: [
      { strips: [{ action: "Lower", start: 1, end: 20, actionStart: 1, actionEnd: 11 }] },
      { strips: [{ action: "Upper", start: 1, end: 20, actionStart: 1, actionEnd: 11, ...settings }] },
    ],
  });
  const half = Math.SQRT1_2;

  it.each([
    ["replaces at a quarter", "location", 3, 10, Blend.replace, 0.25, 4.75],
    ["adds at half", "location", 3, 2, Blend.add, 0.5, 4],
    ["subtracts", "location", 3, 2, Blend.subtract, 1, 1],
    ["multiplies", "scale", 2, 3, Blend.multiply, 1, 6],
    ["combines a location by adding", "location", 3, 2, Blend.combine, 1, 5],
    ["combines a scale by multiplying", "scale", 2, 3, Blend.combine, 0.5, 2 * Math.sqrt(3)],
  ] as const)("%s", (_, path, lower, upper, blendMode, influence, expected) => {
    const spec = layered(constant(path, 0, lower), constant(path, 0, upper), {
      blendMode,
      influence,
      flag: StripFlag.userInfluence,
    });
    expect(written(spec, 5)[`${path}[0]`]).toBeCloseTo(expected, 5);
  });

  it("combines quaternions by rotating the lower one by the upper one raised to the influence", () => {
    const spec = layered(quaternion(half, 0, 0, half), quaternion(half, half, 0, 0), {
      blendMode: Blend.combine,
      influence: 0.5,
      flag: StripFlag.userInfluence,
    });
    const values = written(spec, 5);
    const expected = [0.65328148, 0.27059805, 0.27059805, 0.65328148];
    for (const [index, value] of expected.entries()) {
      expect(values[`rotation_quaternion[${index}]`]).toBeCloseTo(value, 6);
    }
  });

  it("replaces all of a quaternion, with the identity's values where the strip keys fewer", () => {
    const values = written(layered(quaternion(0.5, 0.5, 0.5, 0.5), constant("rotation_quaternion", 0, 0.7)), 5);
    expect([0, 1, 2, 3].map((index) => values[`rotation_quaternion[${index}]`])).toEqual([
      expect.closeTo(0.7, 6),
      0,
      0,
      0,
    ]);
  });

  it("ramps a strip's influence over its blend-in frames and by its influence curve", () => {
    const lower = constant("location", 1, 3);
    const upper = constant("location", 1, 10);
    expect(written(layered(lower, upper, { blendIn: 8 }), 5)["location[1]"]).toBeCloseTo(6.5, 6);
    const curves = [{ path: "influence", keys: [1, 0, 9, 1] }];
    const animated = layered(lower, upper, { flag: StripFlag.userInfluence, curves });
    expect(written(animated, 5)["location[1]"]).toBeCloseTo(6.5, 6);
  });

  it("plays only the soloed track, and no muted track or strip", () => {
    const tracks = (lower: number, upper: number, stripFlag = 0): AnimationSpec => ({
      actions: {
        Lower: constant("location", 1, 3),
        Upper: constant("location", 1, 7),
        Act: constant("location", 1, 100),
      },
      tracks: [
        { flag: lower, strips: [{ action: "Lower", start: 1, end: 20, actionStart: 1, actionEnd: 11 }] },
        { flag: upper, strips: [{ action: "Upper", start: 1, end: 20, flag: stripFlag }] },
      ],
    });
    expect(written({ ...tracks(TrackFlag.solo, 0), flag: AnimFlag.solo, action: "Act" }, 5)).toEqual({
      "location[1]": 3,
    });
    expect(written(tracks(0, TrackFlag.muted), 5)).toEqual({ "location[1]": 3 });
    expect(written(tracks(TrackFlag.muted, TrackFlag.muted), 5)).toEqual({});
    expect(written(tracks(TrackFlag.muted, 0, StripFlag.muted), 5)).toEqual({ "location[1]": 0 });
  });
});

describe("animatedValues of an active action", () => {
  const over = (settings: Partial<AnimationSpec>, action: ActionSpec): AnimationSpec => ({
    actions: { Base: constant("location", 1, 3), Act: action },
    action: "Act",
    tracks: [{ strips: [{ action: "Base", start: 1, end: 20, actionStart: 1, actionEnd: 11 }] }],
    ...settings,
  });

  it("plays it alone where no track has strips", () => {
    const spec: AnimationSpec = { actions: { Act: y(1, 0, 21, 20) }, action: "Act", tracks: [{ strips: [] }] };
    expect(written(spec, 5)).toEqual({ "location[1]": 4 });
  });

  it("blends it over the strips by its blend mode and influence", () => {
    const spec = over({ blendMode: Blend.combine, influence: 0.7 }, y(1, 0, 20, 19));
    expect(written(spec, 5)["location[1]"]).toBeCloseTo(5.8, 6);
  });

  it("plays its curves past its keys where it holds, and not where it does not", () => {
    const action: ActionSpec = {
      curves: [{ path: "location", index: 1, keys: [8, 10, 9, 11], linearExtrapolation: true }],
    };
    expect(written(over({}, action), 5)["location[1]"]).toBeCloseTo(7, 6);
    expect(written(over({ extendMode: Extend.nothing }, action), 5)).toEqual({ "location[1]": 3 });
  });
});

describe("animatedValues in NLA tweak mode", () => {
  const tweaking = (flag: number, strip: Partial<StripSpec> = {}): AnimationSpec => ({
    actions: {
      Tweaked: y(-1, -4, 1, 0, 10, 18),
      Stashed: {
        curves: [0, 1].map((index) => ({ path: "location", index, keys: [1, 5 + 45 * index, 20, 24 + 45 * index] })),
      },
    },
    action: "Tweaked",
    tmpact: "Stashed",
    flag: AnimFlag.tweaking | flag,
    tracks: [
      {
        flag: TrackFlag.disabled,
        strips: [{ action: "Tweaked", start: 10, end: 19, actionStart: 1, actionEnd: 10, tweaked: true, ...strip }],
      },
    ],
  });

  it("plays the tweaked strip, and the action it replaced only with the tracks above", () => {
    expect(written(tweaking(0), 5)).toEqual({ "location[1]": 0 });
    expect(written(tweaking(AnimFlag.upperTracks), 5)).toEqual({ "location[0]": 9, "location[1]": 54 });
  });

  it("plays the tweaked strip over its action's keys where it syncs its length", () => {
    expect(written(tweaking(0, { flag: StripFlag.syncLength, scale: 2, end: 28 }), 5)).toEqual({ "location[1]": -4 });
  });

  it("plays the tweaked strip at the scene's frame where a curve times it", () => {
    const curves = [{ path: "strip_time", keys: [1, 2] }];
    expect(written(tweaking(0, { flag: StripFlag.userTime, curves }), 5)["location[1]"]).toBeCloseTo(8, 6);
  });
});

describe("animatedValues it cannot tell", () => {
  const strip: StripSpec = { action: "Move", start: 1, end: 11, actionStart: 1, actionEnd: 11 };

  it("leaves out a value from a curve or strip with a modifier it does not apply, until a strip above replaces it", () => {
    const noisy: AnimationSpec = {
      actions: { Move: { curves: [{ path: "location", index: 1, keys: [1, 0, 11, 10], noise: true }] } },
      tracks: [{ strips: [strip] }],
    };
    expect(written(noisy, 5)).toEqual({});
    const modified: AnimationSpec = {
      actions: { Move: constant("location", 1, 2) },
      tracks: [{ strips: [{ ...strip, modified: true }] }],
    };
    expect(written(modified, 5)).toEqual({});
    const covered: AnimationSpec = {
      actions: { ...noisy.actions, Cover: constant("location", 1, 4) },
      tracks: [...(noisy.tracks ?? []), { strips: [{ ...strip, action: "Cover" }] }],
    };
    expect(written(covered, 5)).toEqual({ "location[1]": 4 });
  });

  it("leaves out every value while a meta strip or an action linked from another file plays", () => {
    const meta: AnimationSpec = {
      actions: { Move: constant("location", 1, 2) },
      tracks: [{ strips: [{ ...strip, action: undefined, type: 2 }] }],
    };
    expect(written(meta, 5)).toEqual({});
    const linked: AnimationSpec = {
      actions: { Move: { ...constant("location", 1, 2), linked: true } },
      tracks: [{ strips: [strip] }],
    };
    expect(written(linked, 5)).toEqual({});
  });

  it("leaves out a value a driver sets", () => {
    const spec: AnimationSpec = {
      actions: { Move: { curves: [0, 1].map((index) => ({ path: "location", index, keys: [1, 2, 11, 2] })) } },
      tracks: [{ strips: [strip] }],
      drivers: [{ path: "location", index: 0, keys: [] }],
    };
    expect(written(spec, 5)).toEqual({ "location[1]": 2 });
  });
});

interface TimedStrip {
  start: number;
  end: number;
  actstart?: number;
  actend?: number;
  repeat?: number;
  scale?: number;
  extendmode?: number;
  blendmode?: number;
  blendin?: number;
  flag?: number;
  type?: number;
  strips?: TimedStrip[];
}

/** How the object's active action plays over its NLA tracks. */
interface ActiveAction {
  extendmode: number;
  influence: number;
}

/**
 * The players of each strip of NLA tracks given lowest first, as Blender lists them, on an object whose action is keyed
 * over frames 1 to 11, and the tracks they read. The upper track's players come first, each track's in the order its
 * strips nest. With `active`, the object also plays an action with no keys over the tracks, whose player comes first.
 */
function trackPlayers(
  trackSpecs: readonly (readonly TimedStrip[])[],
  active?: ActiveAction,
): { players: Player[]; tracks: NlaTracks } {
  const action = 0x500n;
  const blocks: FileDefinition["blocks"] = [
    { code: "AC", struct: "bAction", address: action, data: [{ id: { name: "ACWalk" } }] },
  ];
  let next = 0x1000n;
  const writeList = (list: readonly TimedStrip[]): { first: bigint; last: bigint } => {
    const addresses = list.map(() => {
      next += 0x100n;
      return next;
    });
    list.forEach((spec, index) => {
      const inner = writeList(spec.strips ?? []);
      blocks.push({
        code: "DATA",
        struct: "NlaStrip",
        address: addresses[index] ?? 0n,
        data: [
          {
            next: addresses[index + 1] ?? 0n,
            prev: addresses[index - 1] ?? 0n,
            strips: inner,
            act: (spec.type ?? 0) === 0 ? action : 0n,
            start: spec.start,
            end: spec.end,
            actstart: spec.actstart ?? 1,
            actend: spec.actend ?? 11,
            repeat: spec.repeat ?? 1,
            scale: spec.scale ?? 1,
            influence: 1,
            blendin: spec.blendin ?? 0,
            blendmode: spec.blendmode ?? 0,
            extendmode: spec.extendmode ?? Extend.hold,
            type: spec.type ?? 0,
            flag: spec.flag ?? 0,
          },
        ],
      });
    });
    return { first: addresses[0] ?? 0n, last: addresses[addresses.length - 1] ?? 0n };
  };
  const trackAddresses = trackSpecs.map((_, index) => 0x10000000n + BigInt(index) * 0x100n);
  trackSpecs.forEach((strips, index) => {
    blocks.push({
      code: "DATA",
      struct: "NlaTrack",
      address: trackAddresses[index] ?? 0n,
      data: [
        {
          next: trackAddresses[index + 1] ?? 0n,
          prev: trackAddresses[index - 1] ?? 0n,
          strips: writeList(strips),
        },
      ],
    });
  });
  const tracksList = { first: trackAddresses[0] ?? 0n, last: trackAddresses[trackAddresses.length - 1] ?? 0n };
  blocks.push(
    { code: "OB", struct: "Object", address: 0x100n, data: [{ id: { name: "OBMover" }, adt: 0x200n }] },
    {
      code: "DATA",
      struct: "AnimData",
      address: 0x200n,
      data: [
        active
          ? { nla_tracks: tracksList, action, act_extendmode: active.extendmode, act_influence: active.influence }
          : { nla_tracks: tracksList },
      ],
    },
  );
  const file = readBlendFile(writeBlend({ header: "old", pointerSize: 8, little: true, structs: STRUCTS, blocks }));
  const [object] = datablocks(file, "OB");
  const [struct] = datablocks(file, "AC");
  if (!object || !struct) throw new Error("No object");
  const parsed: Action = { struct, name: "Walk", slots: [], manualRange: null, layers: 0 };
  const tracks = new NlaTracks();
  return { players: usedActions(object).map((use) => scenePlayer(object, use, parsed, tracks)), tracks };
}

/** The players of each strip of one NLA track, in the order the strips nest. */
function playersOf(strips: readonly TimedStrip[]): Player[] {
  return trackPlayers([strips]).players;
}

const framesAt = (player: Player | undefined, times: readonly number[]) =>
  times.map((time) => player?.frameAt(time) ?? null);

/**
 * Blender's `nlastrips_ctime_get_strip`, walking the strips in order: the place of the strip that plays at `time`, or
 * null where none does or the one that would is muted.
 */
function walkedStrip(strips: readonly TimedStrip[], time: number): number | null {
  const playing = (index: number) => ((strips[index]?.flag ?? 0) & StripFlag.muted ? null : index);
  for (let index = 0; index < strips.length; index++) {
    const strip = strips[index];
    if (!strip) continue;
    if (time >= strip.start && time <= strip.end) return playing(index);
    if (time < strip.start) {
      if (index === 0) return (strip.extendmode ?? Extend.hold) === Extend.hold ? playing(index) : null;
      return (strips[index - 1]?.extendmode ?? Extend.hold) !== Extend.nothing ? playing(index - 1) : null;
    }
    if (index === strips.length - 1)
      return (strip.extendmode ?? Extend.hold) !== Extend.nothing ? playing(index) : null;
  }
  return null;
}

describe("scenePlayer for NLA strips", () => {
  const stretched: TimedStrip = { start: 5, end: 35, scale: 2, repeat: 1.5 };

  it("plays a scaled, repeated strip at the action frames Blender does, and holds it before and after", () => {
    const [player] = playersOf([stretched]);
    expect(player?.direct).toBe(false);
    expect(framesAt(player, [4, 5, 10, 25, 26, 30, 35, 40])).toEqual([1, 1, 3.5, 1, 1.5, 3.5, 6, 6]);
  });

  it("plays a reversed strip from the end of the action", () => {
    const [player] = playersOf([{ ...stretched, flag: StripFlag.reverse }]);
    expect(framesAt(player, [5, 10, 25, 26, 35, 40])).toEqual([11, 8.5, 11, 10.5, 6, 6]);
  });

  it("ends a strip of whole repeats on the last frame of the action, or the first when reversed", () => {
    const whole = { start: 5, end: 45, scale: 2, repeat: 2 };
    expect(framesAt(playersOf([whole])[0], [25, 45])).toEqual([1, 11]);
    expect(framesAt(playersOf([{ ...whole, flag: StripFlag.reverse }])[0], [25, 45])).toEqual([11, 1]);
  });

  it("plays nothing outside a strip that does not extrapolate, and nothing of a muted strip", () => {
    expect(framesAt(playersOf([{ start: 20, end: 30, extendmode: Extend.nothing }])[0], [10, 25, 30, 40])).toEqual([
      null,
      6,
      11,
      null,
    ]);
    const [muted, after] = playersOf([
      { start: 1, end: 11, flag: StripFlag.muted },
      { start: 20, end: 30, extendmode: Extend.holdForward },
    ]);
    expect([framesAt(muted, [5, 15]), framesAt(after, [5, 15, 25, 40])]).toEqual([
      [null, null],
      [null, null, 6, 11],
    ]);
  });

  it("holds the strip before a gap until the next strip starts", () => {
    const [first, second] = playersOf([
      { start: 20, end: 30 },
      { start: 50, end: 60, extendmode: Extend.holdForward },
    ]);
    expect([framesAt(first, [10, 25, 40, 55]), framesAt(second, [10, 40, 55, 70])]).toEqual([
      [1, 6, 11, null],
      [null, null, 6, 11],
    ]);
  });

  it("plays the strips inside a meta strip at its time", () => {
    const [early, late] = playersOf([
      {
        start: 10,
        end: 40,
        type: StripType.meta,
        strips: [
          { start: 10, end: 20 },
          { start: 30, end: 40, actstart: 5, actend: 15 },
        ],
      },
    ]);
    expect([framesAt(early, [12, 25, 35]), framesAt(late, [12, 25, 35])]).toEqual([
      [3, 11, null],
      [null, null, 10],
    ]);
  });

  it("finds where each action frame plays in each repeat, and where the strip can jump", () => {
    const [player] = playersOf([stretched]);
    expect(player?.timesOf([1, 6, 11], player.spans, 100)).toEqual([5, 15, 25, 25, 35]);
    expect(player?.breaks(0, 100, 100)?.sort((a, b) => a - b)).toEqual([5, 25, 35]);
    expect(player?.breaks(0, 100, 0)).toBeNull();
  });

  it("finds an action frame's times only within the stretches it is asked about", () => {
    const [player] = playersOf([stretched]);
    expect(player?.timesOf([1, 6, 11], [[0, 20]], 100)).toEqual([5, 15]);
    expect(
      player?.timesOf(
        [1, 6, 11],
        [
          [10, 26],
          [34, 40],
        ],
        100,
      ),
    ).toEqual([15, 25, 25, 35]);
    expect(player?.timesOf([1, 6, 11], [[0, 100]], 2)).toHaveLength(2);
  });

  it("knows the stretches of the clock where each strip plays, the frames it holds included", () => {
    const [held, last] = playersOf([
      { start: 20, end: 30 },
      { start: 50, end: 60, extendmode: Extend.nothing },
    ]);
    expect([held?.spans, last?.spans]).toEqual([[[Number.NEGATIVE_INFINITY, 50]], [[50, 60]]]);
    const [lone] = playersOf([{ start: 20, end: 30, extendmode: Extend.holdForward }]);
    expect(lone?.spans).toEqual([[20, Number.POSITIVE_INFINITY]]);
    const [, after] = playersOf([
      { start: 1, end: 11, flag: StripFlag.muted },
      { start: 20, end: 30, extendmode: Extend.holdForward },
    ]);
    expect(after?.spans).toEqual([[20, Number.POSITIVE_INFINITY]]);
  });

  const inner: TimedStrip[] = [
    { start: 10, end: 20 },
    { start: 30, end: 40, actstart: 5, actend: 15 },
  ];

  it("plays the strips inside a reversed meta strip mirrored, and knows where each plays", () => {
    const [early, late] = playersOf([
      { start: 10, end: 40, type: StripType.meta, flag: StripFlag.reverse, strips: inner },
    ]);
    expect([framesAt(early, [5, 15, 25, 35, 45]), framesAt(late, [5, 15, 25, 35, 45])]).toEqual([
      [null, null, 11, 6, 1],
      [15, 10, null, null, null],
    ]);
    expect([early?.spans, late?.spans]).toEqual([[[20, Number.POSITIVE_INFINITY]], [[Number.NEGATIVE_INFINITY, 20]]]);
    expect(early?.timesOf([1, 11], [[25, 45]], 100)).toEqual([30, 30, 40]);
    expect(early?.breaks(0, 100, 100)?.sort((a, b) => a - b)).toEqual([10, 10, 20, 30, 40, 40]);
  });

  it("shares one lane and one list of breaks among the strips of a track, and none between tracks", () => {
    const { players } = trackPlayers([[{ start: 1, end: 11 }], inner]);
    const [early, late, under] = players;
    expect(early?.lane).toBe(late?.lane);
    expect(early?.breaks).toBe(late?.breaks);
    expect(under?.lane).not.toBe(early?.lane);
    const playing = (time: number) => {
      const found = early?.lane?.playing(time);
      return found ? players.indexOf(found) : -1;
    };
    expect([5, 15, 25, 35].map(playing)).toEqual([0, 0, 0, 1]);
    expect(late?.breaks(0, 100, 100)?.sort((a, b) => a - b)).toEqual([10, 20, 30, 40]);
  });

  it("picks the strip that Blender's walk along the track picks, for strips in any order", () => {
    let seed = 7;
    const random = () => {
      seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31;
      return seed / 2 ** 31;
    };
    const whole = (limit: number) => Math.floor(random() * limit);
    for (let round = 0; round < 200; round++) {
      const strips = Array.from({ length: 1 + whole(5) }, (): TimedStrip => {
        const start = whole(40);
        return {
          start,
          end: random() < 0.15 ? start - whole(5) : start + whole(10),
          extendmode: whole(3),
          flag: random() < 0.15 ? StripFlag.muted : 0,
        };
      });
      if (random() < 0.6) strips.sort((a, b) => a.start - b.start);
      const players = playersOf(strips);
      const boundaries = strips.flatMap((strip) => [strip.start, strip.end]);
      for (const time of [...boundaries, ...Array.from({ length: 110 }, (_, k) => k / 2 - 5)]) {
        const expected = walkedStrip(strips, time);
        const playing = players.flatMap((player, index) => (player.frameAt(time) === null ? [] : [index]));
        expect(playing, `${JSON.stringify(strips)} at ${time}`).toEqual(expected === null ? [] : [expected]);
      }
    }
  });

  it("plays each of thousands of strips on a track without walking the track for each of them", () => {
    const strips = Array.from({ length: 3000 }, (_, k) => ({ start: 1 + 10 * k, end: 10 + 10 * k }));
    const players = playersOf(strips);
    let played = 0;
    for (let time = 0; time <= 30_000; time += 3) {
      for (const player of players) if (player.frameAt(time) !== null) played++;
    }
    expect(played).toBe(10_001);
  });

  it("plays nothing of a strip that meta strips nest deeper than the players follow, and says so", () => {
    const nested = (depth: number): TimedStrip =>
      depth === 0 ? { start: 1, end: 11 } : { start: 1, end: 11, type: StripType.meta, strips: [nested(depth - 1)] };
    const followed = trackPlayers([[nested(MAX_META_DEPTH)]]);
    expect([followed.players[0]?.frameAt(5), followed.tracks.tooDeep]).toEqual([5, false]);
    const deeper = trackPlayers([[nested(MAX_META_DEPTH + 1)]]);
    expect([deeper.players[0]?.frameAt(5), deeper.tracks.tooDeep]).toEqual([null, true]);
  });

  it("says where Blender blends a strip with what plays under it, which the preview leaves out", () => {
    const blends = (strips: TimedStrip[]) => playersOf(strips).map((player) => player.blends);
    expect(blends([{ start: 1, end: 11 }])).toEqual([false]);
    expect(blends([{ start: 1, end: 11, blendmode: Blend.add }])).toEqual([true]);
    expect(blends([{ start: 1, end: 11, blendin: 2 }])).toEqual([true]);
    expect(
      blends([
        { start: 1, end: 11 },
        { start: 11, end: 15, type: StripType.transition },
        { start: 15, end: 25 },
      ]),
    ).toEqual([true, true]);
  });
});

describe("scenePlayer for an active action over NLA strips", () => {
  const activePlayer = (extendmode: number, influence = 1) =>
    trackPlayers([[{ start: 1, end: 11 }]], { extendmode, influence }).players[0];

  it("plays it at the clock's own frame as far as it extends past its keys, which span frames 0 to 1 without keys", () => {
    const held = activePlayer(Extend.hold);
    expect([held?.spans, held?.direct, held?.frameAt(-5)]).toEqual([
      [[Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY]],
      true,
      -5,
    ]);
    const forward = activePlayer(Extend.holdForward);
    expect([forward?.spans, forward?.direct, forward?.frameAt(-1), forward?.frameAt(5)]).toEqual([
      [[0, Number.POSITIVE_INFINITY]],
      false,
      null,
      5,
    ]);
    expect(forward?.breaks(-10, 10, 10)).toEqual([0]);
    const bounded = activePlayer(Extend.nothing);
    expect([bounded?.spans, bounded?.frameAt(0.5), bounded?.frameAt(2)]).toEqual([[[0, 1]], 0.5, null]);
    expect(bounded?.breaks(-10, 10, 10)).toEqual([0, 1]);
    expect(bounded?.timesOf([0.5, 3], [[-10, 10]], 10)).toEqual([0.5]);
  });

  it("plays nothing of it at no influence, and says where it blends with the strips under it", () => {
    const silent = activePlayer(Extend.hold, 0);
    expect([silent?.spans, silent?.frameAt(5)]).toEqual([[], null]);
    expect([activePlayer(Extend.hold)?.blends, activePlayer(Extend.hold, 0.5)?.blends]).toEqual([false, true]);
  });
});

describe("scenePlayer in NLA tweak mode", () => {
  const playedPlayers = (spec: AnimationSpec): Player[] => {
    const file = readBlendFile(new FileBuilder().file(spec));
    const [object] = datablocks(file, "OB");
    if (!object) throw new Error("The synthetic file has no object.");
    const actions = new Map(readActions(file).map((action) => [action.struct.offset, action]));
    const tracks = new NlaTracks();
    return usedActions(object).flatMap((use) => {
      const action = actions.get(use.action.offset);
      return use.played && action ? [scenePlayer(object, use, action, tracks)] : [];
    });
  };
  const tweaking = (strip: Partial<StripSpec>, ...others: StripSpec[]): AnimationSpec => ({
    actions: { Tweaked: y(-1, -4, 1, 0, 10, 18), Other: y(1, 100, 11, 110) },
    action: "Tweaked",
    flag: AnimFlag.tweaking,
    tracks: [
      {
        flag: TrackFlag.disabled,
        strips: [
          { action: "Tweaked", start: 10, end: 19, actionStart: 1, actionEnd: 10, tweaked: true, ...strip },
          ...others,
        ],
      },
    ],
  });

  it("plays the tweaked strip alone on its track, holding it where another strip of the track would play", () => {
    const later: StripSpec = { action: "Other", start: 20, end: 30, actionStart: 1, actionEnd: 11 };
    const players = playedPlayers(tweaking({}, { ...later, extendMode: Extend.holdForward }));
    expect(players).toHaveLength(1);
    expect(framesAt(players[0], [5, 15, 25])).toEqual([1, 6, 10]);
  });

  it("plays the tweaked strip over its action's keys where it syncs its length, and breaks where it then starts", () => {
    const [player] = playedPlayers(tweaking({ flag: StripFlag.syncLength, scale: 2, end: 28 }));
    expect(framesAt(player, [5, 8, 28, 30])).toEqual([-1, 0, 10, 10]);
    expect(player?.breaks(0, 40, 10)?.sort((a, b) => a - b)).toEqual([6, 28]);
    expect(player?.timesOf([0, 10], [[0, 40]], 10)).toEqual([8, 28]);
  });

  it("plays the tweaked strip at the scene's frame everywhere where a curve times it, without breaks", () => {
    const [player] = playedPlayers(
      tweaking({ flag: StripFlag.userTime, curves: [{ path: "strip_time", keys: [1, 2] }] }),
    );
    expect(framesAt(player, [-5, 5, 25])).toEqual([-5, 5, 25]);
    expect([player?.spans, player?.blends, player?.breaks(0, 40, 10)]).toEqual([
      [[Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY]],
      false,
      [],
    ]);
    expect(player?.timesOf([-1, 1, 10], [[0, 40]], 10)).toEqual([1, 10]);
  });
});

describe("stretches of the clock", () => {
  it("joins, clamps and cuts them", () => {
    expect(
      joinSpans(
        [
          [0, 2],
          [5, 6],
        ],
        [
          [1, 3],
          [6, 8],
        ],
      ),
    ).toEqual([
      [0, 3],
      [5, 8],
    ]);
    expect(
      clampSpans(
        [
          [Number.NEGATIVE_INFINITY, 2],
          [5, Number.POSITIVE_INFINITY],
        ],
        [1, 6],
      ),
    ).toEqual([
      [1, 2],
      [5, 6],
    ]);
    expect(
      withoutSpans(
        [[0, 10]],
        [
          [2, 3],
          [5, 6],
        ],
      ),
    ).toEqual([
      [0, 2],
      [3, 5],
      [6, 10],
    ]);
    expect(
      withoutSpans(
        [
          [0, 10],
          [20, 30],
        ],
        [
          [Number.NEGATIVE_INFINITY, 1],
          [25, Number.POSITIVE_INFINITY],
        ],
      ),
    ).toEqual([
      [1, 10],
      [20, 25],
    ]);
    expect(withoutSpans([[0, 10]], [[Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY]])).toEqual([]);
  });
});

interface NlaReference {
  /** Each object's world matrix where Blender shows it when it opens the file, saved at frame 14. */
  saved: { frame: number; objects: Record<string, { world: number[] }> };
  /** What Blender shows at the scene's start frame, 5. */
  start: {
    frame: number;
    objects: Record<string, { world: number[] }>;
    transforms: Record<
      string,
      { rotationMode: string; location: number[]; euler: number[]; quaternion: number[]; scale: number[] }
    >;
    bones: Record<string, Record<string, { location: number[]; quaternion: number[]; scale: number[] }>>;
    weights: Record<string, Record<string, number>>;
  };
}

function largestDifference(got: readonly number[], want: readonly number[] | undefined): number {
  if (!want || got.length !== want.length) return Number.POSITIVE_INFINITY;
  return Math.max(...want.map((value, index) => Math.abs(value - (got[index] ?? Number.NaN))));
}

describe.each(VERSIONS)("the nla fixture from Blender %s", async (version) => {
  const file = readBlendFile(await decompressBlend(readFixture("nla", version)));
  const expected: NlaReference = JSON.parse(readFileSync(`${fixturesDir}nla-${version}.json`, "utf8"));
  const [sceneStruct] = datablocks(file, "SC");
  const poses = startPoses(sceneStruct ?? null, readActions(file));
  const objects = datablocks(file, "OB");

  it("saves objects where the start frame shows them elsewhere", () => {
    expect([expected.saved.frame, expected.start.frame]).toEqual([14, 5]);
    const y = (objects: NlaReference["saved"]["objects"], name: string) => objects[name]?.world[14] ?? Number.NaN;
    for (const name of ["PushDown", "LateStrip", "Tweak", "TweakSync", "BlendIn"]) {
      expect(Math.abs(y(expected.saved.objects, name) - y(expected.start.objects, name)), name).toBeGreaterThan(0.1);
    }
  });

  it("covers every object", () => {
    expect(objects.map(idName).sort()).toEqual(Object.keys(expected.start.transforms).sort());
  });

  for (const object of objects) {
    const name = idName(object);
    it(`plays ${name}'s strips and active action at the start frame as Blender does`, () => {
      const want = expected.start.transforms[name];
      const got = poses.of(object).object(objectValues(object));
      expect(got.rotationMode).toBe(want?.rotationMode === "QUATERNION" ? "quaternion" : "XYZ");
      const rotation =
        got.rotationMode === "quaternion" ? [got.quaternion, want?.quaternion] : [got.euler, want?.euler];
      expect(largestDifference(got.location, want?.location), "location").toBeLessThan(1e-5);
      expect(largestDifference(rotation[0] ?? [], rotation[1]), "rotation").toBeLessThan(1e-5);
      expect(largestDifference(got.scale, want?.scale), "scale").toBeLessThan(1e-5);
    });
  }

  it("plays the bone's strips at the start frame, blended in quaternion combine, as Blender does", () => {
    const rig = objects.find((object) => idName(object) === "Rig");
    const channel = rig?.deref("pose")?.list("chanbase")[0];
    if (!rig || !channel) throw new Error("No Rig bone");
    const want = expected.start.bones.Rig?.Bone;
    const got = poses.of(rig).channel(channel.string("name"), channelValues(channel));
    expect(largestDifference(got.location, want?.location), "location").toBeLessThan(1e-5);
    expect(largestDifference(got.quaternion, want?.quaternion), "quaternion").toBeLessThan(1e-5);
    expect(largestDifference(got.scale, want?.scale), "scale").toBeLessThan(1e-5);
  });

  it("plays the shape key strips at the start frame as Blender does", () => {
    const key = objects
      .find((object) => idName(object) === "Face")
      ?.deref("data")
      ?.deref("key");
    if (!key) throw new Error("No Face shape keys");
    const weights = poses.weights(key);
    const got = Object.fromEntries(
      key
        .list("block")
        .map((block) => [block.string("name"), weights.get(block.string("name")) ?? block.number("curval")]),
    );
    const want = expected.start.weights.Face ?? {};
    expect(Object.keys(got)).toEqual(Object.keys(want));
    for (const [block, value] of Object.entries(want)) expect(got[block], block).toBeCloseTo(value, 5);
  });

  it("places each object and weighs each shape key as Blender shows them at the start frame", async () => {
    const scene = await importFixture("nla", version);
    const worlds = worldMatrices(scene);
    for (const [name, { world }] of Object.entries(expected.start.objects)) {
      const node = scene.nodes.findIndex((candidate) => candidate.name === name && candidate.kind !== "bone");
      expect(matrixError(worlds[node] ?? [], world), name).toBeLessThan(1e-5);
    }
    const face = scene.meshes.find((mesh) => mesh.name === "Face");
    const targets = face?.morphTargets ?? [];
    expect(targets.map((target) => target.name)).toEqual(["Smile", "Blink"]);
    for (const target of targets) {
      expect(target.defaultWeight, target.name).toBeCloseTo(
        expected.start.weights.Face?.[target.name] ?? Number.NaN,
        5,
      );
    }
  });
});
