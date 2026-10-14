import { readFileSync } from "node:fs";
import type { SceneDescription } from "@arcue/scene";
import { describe, expect, it } from "vitest";
import type { MeshReference } from "../../test/fixtures";
import { fixturesDir, importBytes, importFixture, VERSIONS } from "../../test/fixtures";
import { matrixError, pointsError, worldMatrices } from "../../test/geometry";
import type { BlockDefinition, FileDefinition } from "../../test/synthetic";
import { writeBlend } from "../../test/synthetic";
import { readBlendFile } from "../blend/file";
import { datablocks } from "../blend/ids";
import { CustomDataType } from "../scene/mesh-data";
import { objectValues, restChannel } from "../scene/transforms";
import { readActions } from "./actions";
import { Interpolation } from "./fcurve";
import { startPoses } from "./opening";

interface OpeningReference {
  /** Where Blender shows each object when it opens the file, saved at frame 12. */
  objects: Record<string, { world: number[] }>;
  weights: Record<string, Record<string, number>>;
  /** What Blender shows at the scene's start frame, 1, with armatures at rest. */
  start: {
    frame: number;
    objects: Record<string, { world: number[] }>;
    weights: Record<string, Record<string, number>>;
    meshes: Record<string, MeshReference>;
  };
}

/** Noisy's x comes from a Noise modifier, which Arcue does not apply, so Arcue keeps where the file saves it. */
const SAVED = "Noisy";

describe.each(VERSIONS)("the opening fixture from Blender %s", async (version) => {
  const scene = await importFixture("opening", version);
  const expected: OpeningReference = JSON.parse(readFileSync(`${fixturesDir}opening-${version}.json`, "utf8"));
  const worlds = worldMatrices(scene);
  const nodeOf = (name: string) => scene.nodes.findIndex((node) => node.name === name && node.kind !== "bone");
  const worldOf = (name: string) => worlds[nodeOf(name)] ?? [];

  it("covers every object", () => {
    const names = Object.keys(expected.start.objects).sort();
    expect(Object.keys(expected.objects).sort()).toEqual(names);
    expect(names.filter((name) => nodeOf(name) < 0)).toEqual([]);
  });

  for (const name of Object.keys(expected.start.objects)) {
    if (name === SAVED) continue;
    it(`places ${name} where Blender shows it at the scene's start frame`, () => {
      expect(matrixError(worldOf(name), expected.start.objects[name]?.world ?? [])).toBeLessThan(1e-5);
    });
  }

  it(`keeps ${SAVED} where the file saves it`, () => {
    expect(matrixError(worldOf(SAVED), expected.objects[SAVED]?.world ?? [])).toBeLessThan(1e-5);
  });

  it("gives shape keys the weights Blender shows at the scene's start frame, and starts clips from them", () => {
    const start = expected.start.weights.Face ?? {};
    expect([start.Blink, start.Smile]).toEqual([0, 0.3]);
    const face = scene.meshes.findIndex((mesh) => mesh.name === "Face");
    const targets = scene.meshes[face]?.morphTargets ?? [];
    expect(targets.map((target) => target.name)).toEqual(["Blink", "Smile"]);
    for (const target of targets) expect(target.defaultWeight, target.name).toBeCloseTo(start[target.name] ?? 0, 6);
    const node = scene.nodes.findIndex((candidate) => candidate.mesh === face);
    const smile = scene.clips
      .find((clip) => clip.name === "SmileAct")
      ?.tracks.find((track) => track.node === node && track.property === "weights");
    const blinks = Array.from(smile?.values ?? []).filter((_, index) => index % 2 === 0);
    expect(blinks.length).toBeGreaterThan(1);
    for (const blink of blinks) expect(blink).toBeCloseTo(start.Blink ?? Number.NaN, 6);
  });

  it("binds a mesh that an armature's action moves where Blender shows it at the scene's start frame", () => {
    const carried = scene.meshes.find((mesh) => mesh.name === "Carried");
    const rest = expected.start.meshes.Carried?.restPositions ?? [];
    expect(rest.length).toBeGreaterThan(0);
    expect(pointsError(carried?.restPositions ?? [], rest)).toBeLessThan(1e-5);
    expect(matrixError(carried?.bindMatrix ?? [], expected.start.objects.Carried?.world ?? [])).toBeLessThan(1e-5);
  });

  it("starts the clip of an action keyed from frame 20 at its first key", () => {
    const clip = scene.clips.find((candidate) => candidate.name === "HoldBeforeAct");
    expect(clip?.frameCount).toBe(11);
    expect(clip?.duration).toBeCloseTo(10 / 24, 6);
    expect(clip?.keyTimes[0]).toBe(0);
  });
});

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
    type: "RenderData",
    fields: [
      ["int", "cfra"],
      ["int", "sfra"],
      ["float", "subframe"],
      ["float", "framelen"],
    ],
  },
  {
    type: "Scene",
    fields: [
      ["ID", "id"],
      ["RenderData", "r"],
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
      ["bAction", "*act"],
      ["float", "start"],
      ["float", "end"],
      ["float", "actstart"],
      ["float", "actend"],
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
      ["ListBase", "nla_tracks"],
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
      ["float", "loc[3]"],
      ["float", "parentinv[4][4]"],
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
    ],
  },
];

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** The x an action keys linearly from 0 at frame 1 to 4 at frame 20 gives at `frame`, as Blender saves it there. */
function keyedX(frame: number): number {
  return Math.fround((4 * (frame - 1)) / 19);
}

/**
 * A quad parented to an empty whose active action moves it along x, saved at `frame` as Blender saves a file: with the
 * empty's location set to what the action plays there. The scene starts at `start` and maps frames by `frameLength`.
 * With `pushed`, the action plays from a strip on an NLA track, as Blender's push down leaves it, instead.
 */
function savedAt(frame: number, start = 1, frameLength = 1, pushed = false): Uint8Array {
  const layer = (type: number, data: bigint) => [{ type, data }];
  const blocks: BlockDefinition[] = [
    {
      code: "SC",
      struct: "Scene",
      address: 0x100n,
      data: [
        { id: { name: "SCScene" }, r: { cfra: frame, sfra: start, framelen: frameLength }, master_collection: 0x200n },
      ],
    },
    { code: "DATA", struct: "Collection", address: 0x200n, data: [{ gobject: { first: 0x210n, last: 0x220n } }] },
    { code: "DATA", struct: "CollectionObject", address: 0x210n, data: [{ next: 0x220n, ob: 0x300n }] },
    { code: "DATA", struct: "CollectionObject", address: 0x220n, data: [{ prev: 0x210n, ob: 0x400n }] },
    {
      code: "OB",
      struct: "Object",
      address: 0x300n,
      data: [{ id: { name: "OBMover" }, adt: 0x310n, loc: [keyedX(frame), 0, 0], parentinv: IDENTITY }],
    },
    {
      code: "DATA",
      struct: "AnimData",
      address: 0x310n,
      data: [pushed ? { nla_tracks: { first: 0x320n, last: 0x320n } } : { action: 0x500n }],
    },
    { code: "DATA", struct: "NlaTrack", address: 0x320n, data: [{ strips: { first: 0x330n, last: 0x330n } }] },
    {
      code: "DATA",
      struct: "NlaStrip",
      address: 0x330n,
      data: [{ act: 0x500n, start: 1, end: 20, actstart: 1, actend: 20 }],
    },
    {
      code: "OB",
      struct: "Object",
      address: 0x400n,
      data: [{ id: { name: "OBBody" }, parent: 0x300n, data: 0x600n, type: 1, loc: [0, 0, 1], parentinv: IDENTITY }],
    },
    { code: "AC", struct: "bAction", address: 0x500n, data: [{ id: { name: "ACMove" }, curves: { first: 0x510n } }] },
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
        { vec: [19, 4, 0, 20, 4, 0, 21, 4, 0], ipo: Interpolation.linear },
      ],
    },
    { code: "DATA", struct: null, address: 0x530n, data: new TextEncoder().encode("location\0") },
    {
      code: "ME",
      struct: "Mesh",
      address: 0x600n,
      data: [
        {
          id: { name: "MEQuad" },
          vdata: { layers: 0x610n, totlayer: 1 },
          edata: { layers: 0x620n, totlayer: 1 },
          pdata: { layers: 0x630n, totlayer: 1 },
          ldata: { layers: 0x640n, totlayer: 1 },
          totvert: 4,
          totedge: 4,
          totpoly: 1,
          totloop: 4,
        },
      ],
    },
    { code: "DATA", struct: "CustomDataLayer", address: 0x610n, data: layer(CustomDataType.vertex, 0x700n) },
    { code: "DATA", struct: "CustomDataLayer", address: 0x620n, data: layer(CustomDataType.edge, 0x710n) },
    { code: "DATA", struct: "CustomDataLayer", address: 0x630n, data: layer(CustomDataType.face, 0x720n) },
    { code: "DATA", struct: "CustomDataLayer", address: 0x640n, data: layer(CustomDataType.loop, 0x730n) },
    {
      code: "DATA",
      struct: "MVert",
      address: 0x700n,
      data: [{ co: [0, 0, 0] }, { co: [1, 0, 0] }, { co: [1, 1, 0] }, { co: [0, 1, 0] }],
    },
    {
      code: "DATA",
      struct: "MEdge",
      address: 0x710n,
      data: [0, 1, 2, 3].map((v) => ({ v1: v, v2: (v + 1) % 4 })),
    },
    { code: "DATA", struct: "MPoly", address: 0x720n, data: [{ loopstart: 0, totloop: 4 }] },
    { code: "DATA", struct: "MLoop", address: 0x730n, data: [0, 1, 2, 3].map((v) => ({ v, e: v })) },
  ];
  return writeBlend({ header: "old", pointerSize: 8, little: true, version: "300", structs: STRUCTS, blocks });
}

function restOf(scene: SceneDescription) {
  return {
    nodes: scene.nodes.map(({ name, translation, rotation, scale }) => ({ name, translation, rotation, scale })),
    restPositions: scene.meshes.map((mesh) => Array.from(mesh.restPositions)),
  };
}

describe("the rest of a scene with an animated object", () => {
  it("does not depend on the frame the file was saved at", async () => {
    const first = await importBytes("first.blend", savedAt(1));
    const later = await importBytes("later.blend", savedAt(7));
    expect(restOf(later)).toEqual(restOf(first));
    expect(first.nodes.map((node) => node.name)).toEqual(["Mover", "Body"]);
    expect(first.nodes[0]?.translation[0]).toBe(0);
    expect(first.meshes[0]?.restPositions.slice(0, 3)).toEqual(Float32Array.of(0, 1, 0));
  });

  it("does not depend on the frame the file was saved at where the action plays from an NLA strip", async () => {
    const first = await importBytes("first.blend", savedAt(1, 1, 1, true));
    const later = await importBytes("later.blend", savedAt(7, 1, 1, true));
    expect(restOf(later)).toEqual(restOf(first));
    expect(first.nodes[0]?.translation[0]).toBe(0);
  });

  it("places animated objects as their actions play at the scene's start frame", async () => {
    const scene = await importBytes("late.blend", savedAt(7, 20));
    expect(scene.nodes[0]?.translation[0]).toBeCloseTo(4, 6);
    expect(scene.meshes[0]?.restPositions.slice(0, 3)).toEqual(Float32Array.of(4, 1, 0));
  });
});

describe("startPoses", () => {
  it("plays the actions it is given at the start frame, through the scene's time remapping", () => {
    const file = readBlendFile(savedAt(7, 20, 0.5));
    const [scene] = datablocks(file, "SC");
    const [mover] = datablocks(file, "OB");
    if (!scene || !mover) throw new Error("The synthetic file has no scene or object.");
    const values = objectValues(mover);
    expect(startPoses(scene, []).of(mover).object(values).location[0]).toBe(keyedX(7));
    expect(startPoses(scene, readActions(file)).of(mover).object(values).location[0]).toBeCloseTo(keyedX(10), 6);
  });

  it("plays an action that keys one bone channel with many curves without copying the bone's values for each", {
    timeout: 30_000,
  }, () => {
    const count = 100_000;
    const curve = (index: number) => 0x100000n + BigInt(index) * 0x40n;
    const path = new TextEncoder().encode('pose.bones["Bone"].location\0');
    const blocks: BlockDefinition[] = [
      { code: "OB", struct: "Object", address: 0x300n, data: [{ id: { name: "OBRig" }, adt: 0x310n }] },
      { code: "DATA", struct: "AnimData", address: 0x310n, data: [{ action: 0x500n }] },
      {
        code: "AC",
        struct: "bAction",
        address: 0x500n,
        data: [{ id: { name: "ACBusy" }, curves: { first: curve(0) } }],
      },
      { code: "DATA", struct: "BezTriple", address: 0x520n, data: [{ vec: [0, 3, 0, 1, 3, 0, 2, 3, 0] }] },
      { code: "DATA", struct: null, address: 0x530n, data: path },
      ...Array.from({ length: count }, (_, index) => ({
        code: "DATA",
        struct: "FCurve",
        address: curve(index),
        data: [{ next: index + 1 < count ? curve(index + 1) : 0n, bezt: 0x520n, rna_path: 0x530n, totvert: 1 }],
      })),
    ];
    const file = readBlendFile(writeBlend({ header: "old", pointerSize: 8, little: true, structs: STRUCTS, blocks }));
    const [rig] = datablocks(file, "OB");
    if (!rig) throw new Error("The synthetic file has no object.");
    const poses = startPoses(null, readActions(file));
    const start = performance.now();
    const location = poses.of(rig).channel("Bone", restChannel()).location;
    expect(performance.now() - start).toBeLessThan(1000);
    expect(location).toEqual([3, 0, 0]);
  });
});
