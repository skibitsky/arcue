import type { Track } from "@arcue/scene";
import { describe, expect, it } from "vitest";
import { createPose, keyIndexAt, poseAt, sampleTrack, worldMatrices } from "./pose";
import { stripScene } from "./test-fixture";

function track(property: Track["property"], interpolation: Track["interpolation"], values: number[]): Track {
  return { node: 0, property, interpolation, times: Float32Array.of(0, 1, 2), values: Float32Array.from(values) };
}

describe("sampleTrack", () => {
  it("interpolates linearly between keys and holds the ends", () => {
    const translation = track("translation", "linear", [0, 0, 0, 2, 4, 6, 2, 4, 6]);
    const out = new Float64Array(3);
    sampleTrack(translation, 0.25, out);
    expect([...out]).toEqual([0.5, 1, 1.5]);
    sampleTrack(translation, -1, out);
    expect([...out]).toEqual([0, 0, 0]);
    sampleTrack(translation, 5, out);
    expect([...out]).toEqual([2, 4, 6]);
  });

  it("holds the earlier key for step interpolation", () => {
    const scale = track("scale", "step", [1, 1, 1, 2, 2, 2, 3, 3, 3]);
    const out = new Float64Array(3);
    sampleTrack(scale, 1.99, out);
    expect([...out]).toEqual([2, 2, 2]);
  });

  it("blends rotations along the shorter arc", () => {
    const s = Math.SQRT1_2;
    const rotation = track("rotation", "linear", [0, 0, 0, 1, 0, 0, -s, -s, 0, 0, -s, -s]);
    const out = new Float64Array(4);
    sampleTrack(rotation, 0.5, out);
    const angle = 2 * Math.acos(out[3] ?? 0);
    expect(angle).toBeCloseTo(Math.PI / 4, 6);
    expect(out[2]).toBeGreaterThan(0);
  });
});

describe("sampleTrack at exact frame times", () => {
  it("reaches a step key stored as float32 at its frame and at the clip's end", () => {
    const step: Track = {
      node: 0,
      property: "scale",
      interpolation: "step",
      times: Float32Array.from([0, 1 / 30, 2 / 30]),
      values: Float32Array.of(0, 0, 0, 1, 1, 1, 2, 2, 2),
    };
    expect(Math.fround(1 / 30)).toBeGreaterThan(1 / 30);
    const out = new Float64Array(3);
    sampleTrack(step, 1 / 30, out);
    expect([...out]).toEqual([1, 1, 1]);
    sampleTrack(step, 2 / 30, out);
    expect([...out]).toEqual([2, 2, 2]);
  });

  it("reaches a step key stored as float32 at a frame past 32 seconds", () => {
    const frames = [963, 964, 965];
    const step: Track = {
      node: 0,
      property: "scale",
      interpolation: "step",
      times: Float32Array.from(frames.map((frame) => frame / 30)),
      values: Float32Array.of(0, 0, 0, 1, 1, 1, 2, 2, 2),
    };
    expect(Math.fround(964 / 30) - 964 / 30).toBeGreaterThan(1e-6);
    const out = new Float64Array(3);
    sampleTrack(step, 964 / 30, out);
    expect([...out]).toEqual([1, 1, 1]);
    expect(keyIndexAt(step.times, 965 / 30)).toBe(2);
  });

  it("does not overshoot a linear key it reaches early", () => {
    const linear = track("translation", "linear", [0, 0, 0, 1, 1, 1, 3, 3, 3]);
    const out = new Float64Array(3);
    sampleTrack({ ...linear, times: Float32Array.of(0, Math.fround(0.1), 1) }, 0.1, out);
    expect(out[0]).toBeCloseTo(1, 5);
  });
});

describe("keyIndexAt", () => {
  it("finds the last key at or before a time", () => {
    const times = Float32Array.of(0, 0.5, 1);
    expect(keyIndexAt(times, -0.1)).toBe(-1);
    expect(keyIndexAt(times, 0.5)).toBe(1);
    expect(keyIndexAt(times, 0.75)).toBe(1);
    expect(keyIndexAt(times, 3)).toBe(2);
  });
});

describe("poseAt and worldMatrices", () => {
  it("puts joints where the clip moves them, and back at rest without a clip", () => {
    const scene = stripScene();
    const bend = scene.clips[0] ?? null;
    const pose = poseAt(scene, bend, 1);
    const worlds = worldMatrices(scene.nodes, pose);
    expect(worlds[3 * 16 + 12]).toBeCloseTo(-1, 6);
    expect(worlds[3 * 16 + 13]).toBeCloseTo(1, 6);
    expect(pose.morphWeights[0]?.[0]).toBeCloseTo(1, 6);
    poseAt(scene, null, 0, pose);
    const rest = worldMatrices(scene.nodes, pose);
    expect(rest[3 * 16 + 12]).toBeCloseTo(0, 6);
    expect(rest[3 * 16 + 13]).toBeCloseTo(2, 6);
    expect(pose.morphWeights[0]?.[0]).toBe(0);
  });

  it("clamps the time to the clip", () => {
    const scene = stripScene();
    const bend = scene.clips[0] ?? null;
    const late = worldMatrices(scene.nodes, poseAt(scene, bend, 9));
    const end = worldMatrices(scene.nodes, poseAt(scene, bend, 1));
    expect([...late]).toEqual([...end]);
  });

  it("holds each morph target at its default weight in the rest pose and in clips that do not animate it", () => {
    const scene = stripScene();
    const bulge = scene.meshes[0]?.morphTargets[0];
    if (bulge) bulge.defaultWeight = 0.4;
    expect(createPose(scene).morphWeights[0]?.[0]).toBeCloseTo(0.4, 6);
    const bend = scene.clips[0];
    if (!bend) throw new Error("no clip");
    const still = { ...bend, tracks: bend.tracks.filter((track) => track.property !== "weights") };
    const pose = poseAt(scene, bend, 1);
    expect(pose.morphWeights[0]?.[0]).toBeCloseTo(1, 6);
    poseAt(scene, still, 1, pose);
    expect(pose.morphWeights[0]?.[0]).toBeCloseTo(0.4, 6);
    poseAt(scene, null, 0, pose);
    expect(pose.morphWeights[0]?.[0]).toBeCloseTo(0.4, 6);
  });

  it("starts from the rest transforms", () => {
    const scene = stripScene();
    const pose = createPose(scene);
    expect([...pose.scales.subarray(12, 15)]).toEqual([0.01, 0.01, 0.01]);
  });
});
