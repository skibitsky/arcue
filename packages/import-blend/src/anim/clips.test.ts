import { readFileSync } from "node:fs";
import type { Clip, Track } from "@arcue/scene";
import { describe, expect, it } from "vitest";
import type { Version } from "../../test/fixtures";
import { fixturesDir, importBytes, importFixture, readFixture, VERSIONS } from "../../test/fixtures";
import { matrixError, morphWeights, worldMatrices } from "../../test/geometry";
import { decompressBlend } from "../blend/decompress";
import { readBlendFile } from "../blend/file";
import { datablocks, idName } from "../blend/ids";
import type { BlendWarning } from "../scene/build";
import { buildScene } from "../scene/build";
import { animatedPaths, readActions } from "./actions";
import { buildClips } from "./clips";
import { evaluateFCurve } from "./fcurve";

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

  it("poses only the armatures a clip animates, from the pose Blender shows when it opens the file", () => {
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

  it("follows Blender's Bezier handles that reach past the other key", async () => {
    const actions = readActions(readBlendFile(await decompressBlend(readFixture("clips", version))));
    for (const [name, samples] of Object.entries(expected.curves)) {
      const curve = actions.find((action) => action.name === name)?.slots[0]?.curves[0];
      if (!curve) throw new Error(`No curve in ${name}`);
      for (const [frame, value] of samples) {
        expect(Math.abs(evaluateFCurve(curve, frame) - value), `${name} at ${frame}`).toBeLessThan(2e-5);
      }
    }
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

  it("leaves out a clip whose samples would pass the limit, and warns", async () => {
    const file = readBlendFile(await decompressBlend(readFixture("clips", version)));
    const actions = readActions(file);
    const built = buildScene(file, animatedPaths(file, actions));
    const sampled = (limit?: number) => {
      const warnings: BlendWarning[] = [];
      return { clips: buildClips(built, actions, warnings, limit).map((parsed) => parsed.name), warnings };
    };
    const all = sampled().clips;
    const limited = sampled(500);
    const left = all.filter((name) => !limited.clips.includes(name));
    expect(left.length).toBeGreaterThan(0);
    expect(limited.clips.length).toBeGreaterThan(0);
    const unsampled = limited.warnings.filter((warning) => warning.code === "clip-not-sampled");
    expect(unsampled.map((warning) => warning.subject.name)).toEqual(left);
    expect(unsampled[0]?.detail).toMatch(/^Sampling it takes \d+ values, more than 500$/);
  });
});
