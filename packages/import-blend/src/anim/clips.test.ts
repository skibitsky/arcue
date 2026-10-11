import { readFileSync } from "node:fs";
import type { Clip, Track } from "@arcue/scene";
import { describe, expect, it } from "vitest";
import type { Version } from "../../test/fixtures";
import { fixturesDir, importBytes, importFixture, readFixture, VERSIONS } from "../../test/fixtures";
import { matrixError, morphWeights, worldMatrices } from "../../test/geometry";
import { decompressBlend } from "../blend/decompress";
import { readBlendFile } from "../blend/file";
import { datablocks, idName } from "../blend/ids";
import { readActions } from "./actions";
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

  it("plays an armature set to its rest position from its rest pose", () => {
    expect(tracksOf("RestKeyed", "Keyed", "rotation")).toHaveLength(1);
    expect(tracksOf("RestKeyed", "Posed")).toEqual([]);
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
