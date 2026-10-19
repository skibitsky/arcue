import { readFileSync } from "node:fs";
import type { BlendWarning } from "@arcue/blend";
import type { Action } from "@arcue/blend/internal/anim/actions";
import { IdCode, readActions, slotFor, usedActions } from "@arcue/blend/internal/anim/actions";
import type { ClipLimits } from "@arcue/blend/internal/anim/clips";
import { buildClips } from "@arcue/blend/internal/anim/clips";
import { evaluateFCurve } from "@arcue/blend/internal/anim/fcurve";
import { decompressBlend } from "@arcue/blend/internal/blend/decompress";
import { readBlendFile } from "@arcue/blend/internal/blend/file";
import { datablocks, idName } from "@arcue/blend/internal/blend/ids";
import type { BuiltScene } from "@arcue/blend/internal/scene/build";
import { buildScene } from "@arcue/blend/internal/scene/build";
import type { Clip, SceneDescription, Track } from "@arcue/scene";
import { describe, expect, it } from "vitest";
import type { Version } from "../test/fixtures";
import { fixturesDir, importBytes, importFixture, readFixture, VERSIONS } from "../test/fixtures";
import { matrixError, morphWeights, sampleTrack, worldMatrices } from "../test/geometry";

interface ClipsReference {
  clips: Record<
    string,
    {
      frame: number;
      bones: Record<string, number[]>;
      objects: Record<string, { world: number[] }>;
      weights: Record<string, Record<string, number>>;
    }[]
  >;
  curves: Record<string, [frame: number, value: number][]>;
}

function clipsReference(version: Version): ClipsReference {
  return JSON.parse(readFileSync(`${fixturesDir}clips-${version}.json`, "utf8"));
}

/** Blender's world matrix of each object in a fixture at frames, some between whole frames. */
type WorldSamples = { frame: number; worlds: Record<string, number[]> }[];

function worldSamples(name: string, version: Version): WorldSamples {
  return JSON.parse(readFileSync(`${fixturesDir}${name}-${version}.json`, "utf8")).samples;
}

function clipNamed(scene: SceneDescription, name: string): Clip {
  const found = scene.clips.find((candidate) => candidate.name === name);
  if (!found) throw new RangeError(`No clip ${name}.`);
  return found;
}

/** How far the clip's world matrix of each named object at `time` is from Blender's in the sample. */
function worldErrors(
  scene: SceneDescription,
  clip: Clip,
  sample: WorldSamples[number],
  time: number,
  names: readonly string[] = Object.keys(sample.worlds),
): Map<string, number> {
  const worlds = worldMatrices(scene, clip, time);
  const errors = new Map<string, number>();
  for (const name of names) {
    const index = scene.nodes.findIndex((node) => node.name === name && node.kind !== "bone");
    if (index < 0) throw new RangeError(`No node ${name}.`);
    errors.set(name, matrixError(worlds[index] ?? [], sample.worlds[name] ?? []));
  }
  return errors;
}

describe.each(VERSIONS)("the clips fixture from Blender %s", async (version) => {
  const scene = await importFixture("clips", version);
  const expected = clipsReference(version);
  const clip = (name: string): Clip => {
    const found = scene.clips.find((candidate) => candidate.name === name);
    if (!found) throw new RangeError(`No clip ${name}.`);
    return found;
  };
  const tracksOf = (clipName: string, node: string, property?: Track["property"]) =>
    clip(clipName).tracks.filter(
      (track) => scene.nodes[track.node]?.name === node && (property === undefined || track.property === property),
    );
  const keyFrames = (track: Track | undefined, fps: number) => Array.from(track?.times ?? [], (time) => time * fps);

  for (const [name, samples] of Object.entries(expected.clips)) {
    it(`plays ${name} as Blender does, on frames and between them`, () => {
      const played = clip(name);
      const start = samples[0]?.frame ?? 1;
      for (const sample of samples) {
        const time = (sample.frame - start) / played.fps;
        const worlds = worldMatrices(scene, played, time);
        scene.nodes.forEach((node, index) => {
          const world = node.kind === "bone" ? sample.bones[node.name] : sample.objects[node.name]?.world;
          if (!world) return;
          expect(matrixError(worlds[index] ?? [], world), `${node.name} at ${sample.frame}`).toBeLessThan(1e-4);
        });
        for (const [mesh, weights] of Object.entries(sample.weights)) {
          const index = scene.meshes.findIndex((candidate) => candidate.name === mesh);
          const values = morphWeights(scene, index, played, time);
          scene.meshes[index]?.morphTargets.forEach((target, k) => {
            expect(values[k], `${mesh} ${target.name} at ${sample.frame}`).toBeCloseTo(weights[target.name] ?? 0, 5);
          });
        }
      }
    });
  }

  it("steps tracks whose values hold between samples and keys the others just before each jump", () => {
    const [twos] = tracksOf("OnTwos", "Twos", "translation");
    expect(twos?.interpolation).toBe("step");
    const [late] = tracksOf("LateStep", "Late", "translation");
    expect(late?.interpolation).toBe("step");
    expect(keyFrames(late, 24).some((frame) => Math.abs(frame - 3.5) < 1e-4)).toBe(true);
    for (const [clipName, node, property] of [
      ["HingeSteps", "Hand", "rotation"],
      ["MixedSteps", "Mixed", "translation"],
    ] as const) {
      const [stepping] = tracksOf(clipName, node, property);
      expect(stepping?.interpolation, node).toBe("linear");
      const between = keyFrames(stepping, 24).filter((frame) => Math.abs(frame - Math.round(frame)) > 1e-4);
      expect(between, node).toHaveLength(1);
      expect(between[0], node).toBeGreaterThan(3.99);
      expect(between[0], node).toBeLessThan(4);
    }
  });

  it("keys the jumps a Cycles modifier repeats, and the value just after each cycle that ends on a frame", () => {
    const near = (frames: number[], frame: number) => frames.some((key) => key > frame - 1e-4 && key < frame + 0.01);
    const cycled = keyFrames(tracksOf("CycJump", "CycJump", "translation")[0], 24);
    expect([2.001, 4.001, 6.001].map((frame) => near(cycled, frame))).toEqual([true, true, true]);
    const repeated = keyFrames(tracksOf("CycConst", "CycConst", "translation")[0], 24);
    expect([4.5, 7.5].map((frame) => near(repeated, frame))).toEqual([true, true]);
  });

  it("samples whole frames, and warns, when the jumps between frames would take a clip past 100000 frames", async () => {
    const bytes = await decompressBlend(readFixture("clips", version));
    const file = readBlendFile(bytes);
    const action = datablocks(file, "AC").find((candidate) => idName(candidate) === "CycConst");
    const field = action?.field("frame_end");
    if (!action || !field) throw new Error("No CycConst range");
    new DataView(bytes.buffer, bytes.byteOffset).setFloat32(action.offset + field.offset, 90_001, file.little);
    const long = await importBytes("long.blend", bytes);
    expect(
      long.source.warnings
        .filter((warning) => warning.subject.name === "CycConst")
        .map((warning) => [warning.code, warning.message, warning.detail]),
    ).toEqual([
      [
        "deform-approximated",
        "Jumps between frames not shown: CycConst",
        "Sampling them would take more than 100000 frames, so the preview samples whole frames",
      ],
    ]);
    const longClip = long.clips.find((candidate) => candidate.name === "CycConst");
    const track = longClip?.tracks.find((candidate) => long.nodes[candidate.node]?.name === "CycConst");
    const frames = keyFrames(track, 24);
    expect(frames.at(-1)).toBeCloseTo(90_000, 3);
    expect(frames.filter((frame) => frame > 1.01 && frame < 1.99)).toEqual([]);
    const short = keyFrames(tracksOf("CycConst", "CycConst", "translation")[0], 24);
    expect(short.some((frame) => Math.abs(frame - 1.5) < 1e-4)).toBe(true);
  });

  /** The fixture with CycConst's keys, at frames 1, 2.5 and 4, moved to `frames`, and its range ending at `end`. */
  const cycConstAt = async (frames: readonly number[], end: number) => {
    const bytes = await decompressBlend(readFixture("clips", version));
    const file = readBlendFile(bytes);
    const view = new DataView(bytes.buffer, bytes.byteOffset);
    const action = datablocks(file, "AC").find((candidate) => idName(candidate) === "CycConst");
    const range = action?.field("frame_end");
    const keys = file
      .blocksWithCode("DATA")
      .filter((block) => block.struct?.type === "BezTriple")
      .map((block) => file.elements(block))
      .find((triples) => triples.map((triple) => triple.numbers("vec")[3]).join() === "1,2.5,4");
    if (!action || !range || !keys) throw new Error("No CycConst keys");
    view.setFloat32(action.offset + range.offset, end, file.little);
    keys.forEach((triple, index) => {
      const vec = triple.field("vec")?.offset ?? 0;
      view.setFloat32(triple.offset + vec + 12, frames[index] ?? 0, file.little);
    });
    const scene = await importBytes("cycled.blend", bytes);
    const warnings = scene.source.warnings.filter((warning) => warning.subject.name === "CycConst");
    const cycled = scene.clips.find((candidate) => candidate.name === "CycConst");
    const track = cycled?.tracks.find((candidate) => scene.nodes[candidate.node]?.name === "CycConst");
    return { warnings: warnings.map((warning) => warning.message), frames: keyFrames(track, 24) };
  };

  it("samples whole frames without a warning when every jump falls on one, however often a curve repeats it", async () => {
    const { warnings, frames } = await cycConstAt([1, 2, 3], 90_001);
    expect(warnings).toEqual([]);
    expect(frames).toHaveLength(90_001);
    expect(frames.at(-1)).toBeCloseTo(90_000, 3);
  });

  it("samples whole frames, and warns, when one curve alone jumps between frames past the limit", async () => {
    const { warnings, frames } = await cycConstAt([1, 1.5, 2], 60_001);
    expect(warnings).toEqual(["Jumps between frames not shown: CycConst"]);
    expect(frames.at(-1)).toBeCloseTo(60_000, 3);
    expect(frames.filter((frame) => frame > 1.01 && frame < 1.99)).toEqual([]);
  });

  it("samples the jumps between frames as long as they keep a clip to 100000 frames", async () => {
    const atLimit = await cycConstAt([1, 2.5, 4], 75_001);
    expect(atLimit.warnings).toEqual([]);
    expect(atLimit.frames).toHaveLength(100_001);
    const past = await cycConstAt([1, 2.5, 4], 75_002);
    expect(past.warnings).toEqual(["Jumps between frames not shown: CycConst"]);
  });

  it("poses only the armatures a clip animates, from the pose Blender shows at the scene's start frame", () => {
    expect(new Set(clip("MixedSteps").tracks.map((track) => scene.nodes[track.node]?.name))).toEqual(
      new Set(["Mixed"]),
    );
    expect(tracksOf("TweakOther", "Bone").map((track) => [track.property, track.times.length, track.held])).toEqual([
      ["translation", 1, true],
      ["rotation", 1, true],
      ["scale", 1, true],
    ]);
    expect(tracksOf("TweakOther", "Tip").map((track) => track.held)).toEqual([undefined, undefined, undefined]);
    expect(scene.nodes[scene.nodes.findIndex((node) => node.name === "Nudged")]?.translation[0]).toBeCloseTo(1, 6);
  });

  it("plays an armature set to its rest position from its rest pose, and warns that Blender keeps it at rest", () => {
    expect(tracksOf("RestKeyed", "Keyed", "rotation")).toHaveLength(1);
    expect(tracksOf("RestKeyed", "Posed")).toEqual([]);
    const resting = scene.source.warnings.filter((warning) => warning.subject.name === "RestRig");
    expect(resting.map((warning) => warning.message)).toEqual(["Rest position not followed: RestRig"]);
  });

  it("follows Blender's Bezier handles that reach past the other key, and constant keys a Cycles modifier mirrors", async () => {
    const actions = readActions(readBlendFile(await decompressBlend(readFixture("clips", version))));
    for (const [name, samples] of Object.entries(expected.curves)) {
      const curve = actions.find((action) => action.name === name)?.slots[0]?.curves[0];
      if (!curve) throw new Error(`No curve in ${name}`);
      for (const [frame, value] of samples) {
        expect(Math.abs(evaluateFCurve(curve, frame) - value), `${name} at ${frame}`).toBeLessThan(2e-5);
      }
    }
  });

  it("warns that keys on Disable in Viewports are left out", async () => {
    const bytes = await decompressBlend(readFixture("clips", version));
    const file = readBlendFile(bytes);
    const curves = file
      .blocksWithCode("DATA")
      .filter((block) => block.struct?.type === "FCurve")
      .flatMap((block) => file.elements(block));
    const hand = curves.find((curve) => curve.text("rna_path") === 'pose.bones["Hand"].rotation_euler');
    const path = hand?.target("rna_path");
    if (!path) throw new Error("No HingeSteps curve on Hand");
    bytes.set(new TextEncoder().encode("hide_viewport\0"), path.offset);
    const hidden = await importBytes("hidden.blend", bytes);
    const warnings = hidden.source.warnings.filter((warning) => warning.subject.name === "HingeSteps");
    expect(warnings.map((warning) => [warning.code, warning.message, warning.detail])).toEqual([
      [
        "deform-approximated",
        "Visibility changes not shown: HingeSteps",
        "Keys on Disable in Viewports are left out; each object stays as the file saves it",
      ],
    ]);
    expect(hidden.clips.map((candidate) => candidate.name)).toContain("HingeSteps");
  });

  /** The fixture's scene built without its clips, with the actions it holds. */
  const built = async () => {
    const file = readBlendFile(await decompressBlend(readFixture("clips", version)));
    const actions = readActions(file);
    return { file, actions, scene: buildScene(file) };
  };
  const sampled = (scene: BuiltScene, actions: readonly Action[], limits?: Partial<ClipLimits>) => {
    const warnings: BlendWarning[] = [];
    return { clips: buildClips(scene, actions, warnings, limits), warnings };
  };
  const sizeOf = (arrays: readonly Float32Array[]) => arrays.reduce((total, array) => total + array.length, 0);
  const actionNamed = (actions: readonly Action[], name: string): Action => {
    const found = actions.find((action) => action.name === name);
    if (!found) throw new RangeError(`No action ${name}.`);
    return found;
  };

  it("leaves out a clip whose samples would pass the limit, and warns", async () => {
    const { scene: builtScene, actions } = await built();
    const unlimited = sampled(builtScene, actions);
    const all = unlimited.clips.map((parsed) => parsed.name);
    const notSampled = (warnings: readonly BlendWarning[]) =>
      warnings.filter((warning) => warning.code === "clip-not-sampled");
    const lost = new Set(notSampled(unlimited.warnings).map((warning) => warning.subject.name));
    const limited = sampled(builtScene, actions, { clip: 500 });
    const names = limited.clips.map((parsed) => parsed.name);
    const left = all.filter((name) => !names.includes(name));
    expect(left.length).toBeGreaterThan(0);
    expect(names.length).toBeGreaterThan(0);
    const unsampled = notSampled(limited.warnings).filter((warning) => !lost.has(warning.subject.name));
    expect(unsampled.map((warning) => warning.subject.name)).toEqual(left);
    for (const warning of unsampled) expect(warning.detail).toMatch(/^Sampling it takes \d+ values, more than 500$/);
  });

  it("shares one budget of sampled values among all of a file's clips", async () => {
    const { scene: builtScene, actions } = await built();
    const mixed = actionNamed(actions, "MixedSteps");
    const needed = Number(
      /takes (\d+) values/.exec(sampled(builtScene, [mixed], { sampled: 0 }).warnings[0]?.detail ?? "")?.[1],
    );
    expect(needed).toBeGreaterThan(0);
    const budget = Math.floor(3.5 * needed);
    const many = sampled(
      builtScene,
      Array.from({ length: 40 }, () => mixed),
      { sampled: budget },
    );
    expect(many.clips).toHaveLength(3);
    const refused = many.warnings.filter((warning) => warning.code === "clip-not-sampled");
    expect(refused).toHaveLength(37);
    expect(new Set(refused.map((warning) => warning.detail))).toEqual(
      new Set([`Sampling it takes ${needed} values, more than the ${budget - 3 * needed} left for this file's clips`]),
    );
  });

  it("keeps the clips whose tracks and key times fit what the file's clips may keep, however much they sample", async () => {
    const { scene: builtScene, actions } = await built();
    const mixed = actionNamed(actions, "MixedSteps");
    const copies = Array.from({ length: 40 }, () => mixed);
    const [alone] = sampled(builtScene, [mixed]).clips;
    if (!alone) throw new Error("No MixedSteps clip");
    const times = new Set([...alone.tracks.map((track) => track.times), ...alone.curveTimes]);
    const kept = alone.tracks.reduce((total, track) => total + track.values.length, 0) + sizeOf([...times]);
    const needed = Number(
      /takes (\d+) values/.exec(sampled(builtScene, [mixed], { sampled: 0 }).warnings[0]?.detail ?? "")?.[1],
    );
    expect(needed).toBeGreaterThan(kept);
    const roomy = sampled(builtScene, copies, { sampled: 40 * needed, kept: 40 * kept });
    expect([roomy.clips.length, roomy.warnings]).toEqual([40, []]);
    const budget = Math.floor(3.5 * kept);
    const tight = sampled(builtScene, copies, { kept: budget });
    expect(tight.clips).toHaveLength(3);
    const refused = tight.warnings.filter((warning) => warning.code === "clip-not-sampled");
    expect(refused).toHaveLength(37);
    expect(new Set(refused.map((warning) => warning.detail))).toEqual(
      new Set([`It keeps more than the ${budget - 3 * kept} values left for this file's clips`]),
    );
  });

  it("gives every track keyed only at the clip's sample times the clip's one array of them", () => {
    const together = clip("Scene");
    const moving = together.tracks.filter((track) => track.times.length > 1);
    const fewest = Math.min(...moving.map((track) => track.times.length));
    const plain = moving.filter((track) => track.times.length === fewest);
    expect(plain.length).toBeGreaterThan(2);
    expect(new Set(plain.map((track) => track.times)).size).toBe(1);
    const still = together.tracks.filter((track) => track.times.length === 1);
    expect(new Set(still.map((track) => track.times)).size).toBe(1);
  });

  it("plays the actions the scene plays together over its frame range, as Blender does at each frame", async () => {
    const together = clip("Scene");
    expect([together.frameCount, together.sourceStartFrame]).toEqual([250, 1]);
    const { file, actions } = await built();
    const byOffset = new Map(actions.map((action) => [action.struct.offset, action]));
    const played = new Set<string>();
    for (const id of [...datablocks(file, "OB"), ...datablocks(file, "KE")]) {
      for (const use of usedActions(id)) {
        const action = byOffset.get(use.action.offset);
        if (use.played && action && slotFor(action, use.slot)) played.add(action.name);
      }
    }
    const compared: string[] = [];
    for (const [name, samples] of Object.entries(expected.clips)) {
      if (!played.has(name)) continue;
      const nodes = new Set(clip(name).tracks.flatMap((track) => (track.held ? [] : [track.node])));
      for (const sample of samples) {
        if (sample.frame < 1) continue;
        const worlds = worldMatrices(scene, together, (sample.frame - 1) / together.fps);
        for (const node of nodes) {
          const { name: nodeName, kind } = scene.nodes[node] ?? { name: "", kind: "empty" };
          const world = kind === "bone" ? sample.bones[nodeName] : sample.objects[nodeName]?.world;
          if (!world) continue;
          expect(matrixError(worlds[node] ?? [], world), `${name} ${nodeName} at ${sample.frame}`).toBeLessThan(1e-4);
        }
      }
      compared.push(name);
    }
    expect(compared.length).toBeGreaterThan(10);
  });

  it("makes no clip of the scene where it plays one action", async () => {
    const stacks = await importFixture("stacks", version);
    expect(stacks.clips.map((candidate) => [candidate.name, candidate.sourceStartFrame])).toEqual([["Bend", 1]]);
  });

  it("gives each clip the file's frame at its first frame: the action's first, or the scene's first", () => {
    expect(clip("CycBefore").sourceStartFrame).toBe(0);
    expect(clip("MixedSteps").sourceStartFrame).toBe(1);
    expect(clip("Scene").sourceStartFrame).toBe(1);
  });

  it("plays clips at the speed the scene's time remapping gives them, and leaves out their file frames", async () => {
    const bytes = await decompressBlend(readFixture("clips", version));
    const file = readBlendFile(bytes);
    const render = datablocks(file, "SC")
      .find((candidate) => idName(candidate) === "Scene")
      ?.struct("r");
    const field = render?.field("framelen");
    if (!render || !field) throw new Error("No framelen");
    new DataView(bytes.buffer, bytes.byteOffset).setFloat32(render.offset + field.offset, 0.5, file.little);
    const stretched = await importBytes("stretched.blend", bytes);
    const slow = stretched.clips.find((candidate) => candidate.name === "MixedSteps");
    const plain = clip("MixedSteps");
    if (!slow) throw new Error("No MixedSteps");
    expect([slow.frameCount, slow.sourceStartFrame]).toEqual([2 * plain.frameCount - 1, undefined]);
    expect(Array.from(slow.keyTimes)).toEqual(Array.from(plain.keyTimes, (time) => Math.fround(2 * time)));
    const mixed = scene.nodes.findIndex((node) => node.name === "Mixed");
    for (const frame of [0, 3, 7, 8]) {
      const want = worldMatrices(scene, plain, frame / plain.fps)[mixed] ?? [];
      expect(matrixError(worldMatrices(stretched, slow, (2 * frame) / slow.fps)[mixed] ?? [], want)).toBeLessThan(1e-5);
    }
    const together = stretched.clips.find((candidate) => candidate.name === "Scene");
    expect([together?.frameCount, together?.sourceStartFrame]).toEqual([250, 1]);
    for (const frame of [2, 6, 9, 16]) {
      const want = worldMatrices(scene, plain, (frame / 2 - 1) / plain.fps)[mixed] ?? [];
      const got = together ? worldMatrices(stretched, together, (frame - 1) / together.fps)[mixed] : [];
      expect(matrixError(got ?? [], want), `scene frame ${frame}`).toBeLessThan(1e-5);
    }
  });

  it("plays an unused action that keys only object transforms on the one object whose actions key them", async () => {
    const { file, actions, scene: builtScene } = await built();
    const mixed = actionNamed(actions, "MixedSteps");
    const curves = mixed.slots.flatMap((slot) => slot.curves);
    const unused = datablocks(file, "SC")[0];
    if (!unused) throw new Error("No scene");
    const copy = (name: string, identifier: string, idType: number, index?: number): Action => ({
      ...mixed,
      struct: unused,
      name,
      slots: [
        {
          handle: -1,
          identifier,
          idType,
          curves: curves.map((curve) => (index === undefined ? curve : { ...curve, index })),
        },
      ],
    });
    const { clips, warnings } = sampled(builtScene, [
      ...actions,
      copy("Legacy", "", 0),
      copy("Gone", "OBGone", IdCode.object),
      copy("Nowhere", "", 0, 2),
    ]);
    const moved = (name: string) =>
      new Set(clips.find((parsed) => parsed.name === name)?.tracks.map((track) => builtScene.nodes[track.node]?.name));
    expect([moved("Legacy"), moved("Gone")]).toEqual([new Set(["Mixed"]), new Set(["Mixed"])]);
    expect(clips.map((parsed) => parsed.name)).not.toContain("Nowhere");
    expect(warnings.filter((warning) => warning.subject.name === "Nowhere")).toEqual([
      {
        code: "clip-not-sampled",
        subject: { kind: "clip", name: "Nowhere" },
        message: "Clip not shown: Nowhere",
        detail: "Nothing in the scene plays this action, and its curves do not say which object they move",
      },
    ]);
  });

  it("leaves an unused action alone when its slot names an object outside the scene, or an object there plays it", async () => {
    const { actions, scene: builtScene } = await built();
    const inside = { ...builtScene, objects: builtScene.objects.filter((record) => record.object.name !== "Mixed") };
    const mixed = actionNamed(actions, "MixedSteps");
    const unused = datablocks(mixed.struct.file, "SC")[0];
    if (!unused) throw new Error("No scene");
    const slots = mixed.slots.map((slot) => ({ ...slot, identifier: "OBMixed", idType: IdCode.object }));
    const { clips, warnings } = sampled(inside, [mixed, { ...mixed, struct: unused, name: "Named", slots }]);
    expect([clips, warnings]).toEqual([[], []]);
  });

  it("plays an unused action on no object when no object's actions key what it keys", async () => {
    const { actions, scene: builtScene } = await built();
    const alone = { ...builtScene, objects: builtScene.objects.filter((record) => record.object.name === "Mixed") };
    const mixed = actionNamed(actions, "MixedSteps");
    const turning = mixed.slots.flatMap((slot) => slot.curves).map((curve) => ({ ...curve, path: "rotation_euler" }));
    const unused = datablocks(mixed.struct.file, "SC")[0];
    if (!unused) throw new Error("No scene");
    const turn: Action = {
      ...mixed,
      struct: unused,
      name: "Turn",
      slots: [{ handle: -1, identifier: "", idType: 0, curves: turning }],
    };
    const { clips, warnings } = sampled(alone, [mixed, turn]);
    expect(clips.map((parsed) => parsed.name)).toEqual(["MixedSteps"]);
    expect(warnings.map((warning) => [warning.code, warning.message])).toEqual([
      ["clip-not-sampled", "Clip not shown: Turn"],
    ]);
  });

  it("leaves out unused actions no object in the scene can play, and warns where nothing in the file plays them", () => {
    const names = scene.clips.map((candidate) => candidate.name);
    for (const name of ["Stray", "Drift", "SphereAction", "GhostAction"]) expect(names, name).not.toContain(name);
    const named = (name: string) =>
      scene.source.warnings
        .filter((warning) => warning.subject.name === name)
        .map((warning) => [warning.code, warning.message, warning.detail]);
    for (const name of ["Stray", "Drift"]) {
      expect(named(name)).toEqual([
        [
          "clip-not-sampled",
          `Clip not shown: ${name}`,
          "Nothing in the scene plays this action, and its curves do not say which object they move",
        ],
      ]);
    }
    expect([named("SphereAction"), named("GhostAction")]).toEqual([[], []]);
  });

  it("starts the clip of an action keyed from frame 10 at its first key", () => {
    const late = clip("LateKeysAct");
    expect([late.frameCount, late.sourceStartFrame, late.keyTimes[0]]).toEqual([11, 10, 0]);
    expect(late.duration).toBeCloseTo(10 / 24, 6);
  });

  it("jumps where a Cycles modifier mirrors constant keys, after them and before them, as Blender does", () => {
    const curve = (name: string) => new Map(expected.curves[name] ?? []);
    const mirrorAfter = curve("MirrorConstAct");
    expect([9, 9.125, 13, 13.125, 17].map((frame) => mirrorAfter.get(frame))).toEqual([2, 1, 1, 0, 0]);
    const mirrorBefore = curve("MirrorConstBeforeAct");
    expect([1, 1.125, 5, 5.125].map((frame) => mirrorBefore.get(frame))).toEqual([2, 1, 1, 0]);
    for (const [name, node] of [
      ["MirrorConstAct", "MirrorConst"],
      ["MirrorConstBeforeAct", "MirrorConstBefore"],
    ] as const) {
      const [track] = tracksOf(name, node, "translation");
      if (!track) throw new Error(`No translation track for ${node}`);
      const samples = expected.curves[name] ?? [];
      expect(samples).toHaveLength(8 * 16 + 1);
      for (const [frame, value] of samples) {
        const x = sampleTrack(track, (frame - 1) / clip(name).fps)[0] ?? Number.NaN;
        expect(Math.abs(x - value), `${node} at ${frame}`).toBeLessThan(1e-5);
      }
    }
  });

  it("warns about an object whose rotation shears under the scale it was parented with", async () => {
    const { actions, scene: builtScene } = await built();
    const flat = builtScene.objects.find((record) => record.object.name === "Flat");
    if (!flat) throw new Error("No Flat");
    const scale = actionNamed(actions, "FlatScale");
    expect(sampled(builtScene, [scale]).warnings).toEqual([]);
    flat.parentInverse = Float64Array.of(1, 0, 0, 0, 0, 3, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
    expect(sampled(builtScene, [scale]).warnings).toEqual([
      {
        code: "deform-approximated",
        subject: { kind: "clip", name: "FlatScale" },
        message: "Shear not shown: FlatScale",
        detail: "These objects shear under the scale they were parented with, which the preview drops: Flat",
      },
    ]);
  });

  if (version === "4.2") return;

  it("plays one slot of an unused action on an armature that two of its slots name bones of", () => {
    const tracks = tracksOf("Orphan", "Upper", "translation");
    expect(tracks).toHaveLength(1);
    expect(tracks[0]?.values.length).toBe((tracks[0]?.times.length ?? 0) * 3);
  });

  it("plays an unused shape key action only on the key its slot names", () => {
    expect(clip("BlinkB").tracks.map((track) => [scene.nodes[track.node]?.name, track.property])).toEqual([
      ["FaceB", "weights"],
    ]);
  });

  it("plays an unused shape key action on the keys its curves name when its slot names a key without them", () => {
    expect(clip("WinkOnly").tracks.map((track) => [scene.nodes[track.node]?.name, track.property])).toEqual([
      ["Winker", "weights"],
    ]);
  });

  it("leaves an object that has an action but no slot where it is", () => {
    expect(clip("OwnerMove").tracks.map((track) => scene.nodes[track.node]?.name)).not.toContain("NoSlot");
    expect(scene.clips.map((candidate) => candidate.name)).not.toContain("Lone");
  });

  it("plays every slot of an action that an armature plays, as its active action and through an NLA strip", () => {
    const keys = (bone: string) => tracksOf("Dual", bone, "translation").map((track) => track.times.length);
    expect([keys("Top"), keys("Low")]).toEqual([[9], [9]]);
  });

  it("plays an upper NLA track's slot over a lower one's only where Blender plays it", () => {
    for (const name of ["Stack", "TweakedFull", "StashedFull"]) {
      expect(tracksOf(name, `${name}Tip`), name).toHaveLength(3);
    }
    const left = ["MutedTrack", "MutedStrip", "Soloed", "NlaOff", "Tweaked", "TweakedSolo", "TweakedStrip", "Stashed"];
    for (const name of left) {
      expect(tracksOf(name, `${name}Base`, "translation"), name).toHaveLength(1);
      expect(tracksOf(name, `${name}Tip`), name).toEqual([]);
    }
  });

  it("plays an action that Blender plays nowhere on the object that has it on a muted track", () => {
    expect(new Set(clip("Reused").tracks.map((track) => scene.nodes[track.node]?.name))).toEqual(new Set(["Reuser"]));
  });

  it("warns that a layered action with more than one layer plays only its first", async () => {
    const bytes = await decompressBlend(readFixture("clips", version));
    const file = readBlendFile(bytes);
    const action = datablocks(file, "AC").find((candidate) => idName(candidate) === "MixedSteps");
    const field = action?.field("layer_array_num");
    if (!action || !field) throw new Error("No layered MixedSteps");
    new DataView(bytes.buffer, bytes.byteOffset).setInt32(action.offset + field.offset, 2, file.little);
    const layered = await importBytes("layers.blend", bytes);
    expect(
      layered.source.warnings
        .filter((warning) => warning.subject.name === "MixedSteps")
        .map((warning) => [warning.code, warning.message, warning.detail]),
    ).toEqual([["action-layer-not-played", "Only the first layer played: MixedSteps", "The action has 2 layers"]]);
    expect(layered.clips.find((candidate) => candidate.name === "MixedSteps")?.tracks).toEqual(
      clip("MixedSteps").tracks,
    );
  });
});

describe.each(VERSIONS)("the timeline fixture from Blender %s", async (version) => {
  const scene = await importFixture("timeline", version);
  const together = clipNamed(scene, "Scene");

  it("plays the actions and NLA strips of the scene together over its frame range", () => {
    expect([together.frameCount, together.sourceStartFrame]).toEqual([80, 1]);
    const blending = scene.source.warnings.filter((warning) => warning.message.startsWith("NLA blending not followed"));
    expect(blending).toEqual([]);
  });

  it("plays them as Blender does at each frame and between frames", () => {
    for (const sample of worldSamples("timeline", version)) {
      for (const [name, error] of worldErrors(scene, together, sample, (sample.frame - 1) / together.fps)) {
        expect(error, `${name} at ${sample.frame}`).toBeLessThan(1e-4);
      }
    }
  });

  it("keys the frames where a strip plays its keys, and not the keys of a strip that one above it covers", () => {
    const frames = new Set(Array.from(together.keyTimes, (time) => Math.round(time * together.fps) + 1));
    expect([20, 30].filter((frame) => frames.has(frame))).toEqual([20, 30]);
    expect([22, 24, 26, 28].filter((frame) => frames.has(frame))).toEqual([]);
  });

  it("starts each action's own clip at its first key", () => {
    const starts = ["BaseAction", "ArmAction", "HandAction"].map((name) => {
      const own = clipNamed(scene, name);
      return [name, own.sourceStartFrame, own.frameCount];
    });
    expect(starts).toEqual([
      ["BaseAction", 1, 60],
      ["ArmAction", 1, 60],
      ["HandAction", 10, 31],
    ]);
  });
});

describe.each(VERSIONS)("the stretch fixture from Blender %s", async (version) => {
  const scene = await importFixture("stretch", version);
  const samples = worldSamples("stretch", version);

  it("plays each action at the speed the scene's time remapping gives it, without its file frames", () => {
    for (const [name, node] of [
      ["SlowAct", "Slow"],
      ["OtherAct", "Other"],
    ] as const) {
      const own = clipNamed(scene, name);
      expect([own.frameCount, own.sourceStartFrame]).toEqual([21, undefined]);
      const played = samples.filter((sample) => sample.frame >= 2 && sample.frame <= 22);
      expect(played.length).toBeGreaterThan(3);
      for (const sample of played) {
        const error = worldErrors(scene, own, sample, (sample.frame - 2) / own.fps, [node]).get(node);
        expect(error, `${node} at ${sample.frame}`).toBeLessThan(1e-4);
      }
    }
  });

  it("plays the scene's actions together over its frame range as Blender does", () => {
    const together = clipNamed(scene, "Scene");
    expect([together.frameCount, together.sourceStartFrame]).toEqual([30, 1]);
    for (const sample of samples) {
      for (const [name, error] of worldErrors(scene, together, sample, (sample.frame - 1) / together.fps)) {
        expect(error, `${name} at ${sample.frame}`).toBeLessThan(1e-4);
      }
    }
  });
});

describe.each(VERSIONS)("the tweak fixture from Blender %s", async (version) => {
  const scene = await importFixture("tweak", version);

  const together = clipNamed(scene, "Scene");

  it("plays each strip in NLA tweak mode alone on its track, synced to its action or at the scene's frame", () => {
    expect([together.frameCount, together.sourceStartFrame]).toEqual([40, 1]);
    for (const sample of worldSamples("tweak", version)) {
      for (const [name, error] of worldErrors(scene, together, sample, (sample.frame - 1) / together.fps)) {
        expect(error, `${name} at ${sample.frame}`).toBeLessThan(1e-4);
      }
    }
  });

  it("does not warn that a tweaked strip timed by a curve is retimed, since it plays at the scene's frame", () => {
    expect(scene.source.warnings.filter((warning) => warning.subject.name === "Scene")).toEqual([]);
  });
});

describe.each(VERSIONS)("the nla-stress fixture from Blender %s", (version) => {
  it("plays a thousand strips on one track and a hundred stacked strips that repeat a thousand times", async () => {
    const scene = await importFixture("nla-stress", version);
    const together = clipNamed(scene, "Scene");
    expect([together.frameCount, together.sourceStartFrame]).toEqual([4001, 1]);
    expect(scene.source.warnings.filter((warning) => warning.subject.name === "Scene")).toEqual([]);
    expect(together.keyTimes.length).toBeLessThanOrEqual(4001);
    for (const sample of worldSamples("nla-stress", version)) {
      for (const [name, error] of worldErrors(scene, together, sample, (sample.frame - 1) / together.fps)) {
        expect(error, `${name} at ${sample.frame}`).toBeLessThan(1e-4);
      }
    }
  });
});

describe.each(VERSIONS)("the shear fixture from Blender %s", async (version) => {
  const scene = await importFixture("shear", version);
  const samples = worldSamples("shear", version);

  for (const [name, child] of [
    ["Spin", "Wheel"],
    ["Turn", "Prop"],
  ] as const) {
    it(`warns that ${child} shears in ${name} under the scale it was parented with`, () => {
      expect(scene.source.warnings.map((warning) => [warning.code, warning.message, warning.detail])).toContainEqual([
        "deform-approximated",
        `Shear not shown: ${name}`,
        `These objects shear under the scale they were parented with, which the preview drops: ${child}`,
      ]);
    });

    it(`plays ${name} as Blender does where nothing shears`, () => {
      const played = clipNamed(scene, name);
      for (const sample of samples) {
        const time = (sample.frame - 1) / played.fps;
        const names = sample.frame === 1 ? ["Body", "Rig", child] : ["Body", "Rig"];
        for (const [node, error] of worldErrors(scene, played, sample, time, names)) {
          expect(error, `${node} at ${sample.frame}`).toBeLessThan(1e-4);
        }
      }
    });
  }
});
