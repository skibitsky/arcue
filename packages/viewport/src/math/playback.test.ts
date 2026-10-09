import { describe, expect, it } from "vitest";
import {
  advancePlayback,
  clampRange,
  clampSpeed,
  frameStart,
  playbackStart,
  resolveTimeSelection,
  shownTime,
} from "./playback";
import { stripScene } from "./test-fixture";

const loop = { speed: 1, loop: true, range: null };

describe("advancePlayback", () => {
  const clip = { duration: 2, fps: 30 };
  const frame = 1 / 30;

  it("moves by wall time times speed", () => {
    expect(advancePlayback(0.5, 0.1, clip, { ...loop, speed: 2 })).toEqual({ time: 0.7, playing: true });
    expect(advancePlayback(0.5, 0.1, clip, { ...loop, speed: 9 }).time).toBeCloseTo(0.7, 9);
  });

  it("shows the last frame for a frame's time before wrapping, and stops on it without looping", () => {
    const held = advancePlayback(1.99, 0.02, clip, loop);
    expect(held.time).toBeCloseTo(2.01, 9);
    expect(shownTime(held.time, clip, null)).toBe(2);
    expect(advancePlayback(2.03, 0.01, clip, loop).time).toBeCloseTo(2.04 - 2 - frame, 9);
    expect(advancePlayback(1.9, 0.2, clip, { ...loop, loop: false })).toEqual({ time: 2, playing: false });
  });

  it("loops inside a range whether or not the clip loops, keeping the range's end frame", () => {
    const range = { start: 0.5, end: 1 };
    const held = advancePlayback(0.99, 0.02, clip, { ...loop, loop: false, range });
    expect(held.time).toBeCloseTo(1.01, 9);
    expect(shownTime(held.time, clip, range)).toBe(1);
    expect(advancePlayback(1.03, 0.01, clip, { ...loop, range }).time).toBeCloseTo(0.5 + 0.54 - (0.5 + frame), 9);
    expect(advancePlayback(1.5, 0.01, clip, { ...loop, range })).toEqual({ time: 0.5, playing: true });
    const single = advancePlayback(0.5, 0.2, clip, { ...loop, range: { start: 0.5, end: 0.5 } });
    expect(shownTime(single.time, clip, { start: 0.5, end: 0.5 })).toBe(0.5);
  });

  it("does not play a clip without length", () => {
    expect(advancePlayback(0, 0.1, { duration: 0, fps: 30 }, loop)).toEqual({ time: 0, playing: false });
  });
});

describe("shownTime and frameStart", () => {
  const clip = { duration: 2, fps: 30 };

  it("leaves a time outside the end frame's hold alone", () => {
    expect(shownTime(1.5, clip, { start: 0.5, end: 1 })).toBe(1.5);
    expect(shownTime(0.25, clip, null)).toBe(0.25);
  });

  it("snaps to the start of the frame a time falls in", () => {
    expect(frameStart(0.51, clip)).toBe(0.5);
    expect(frameStart(1 / 30, clip)).toBe(1 / 30);
    expect(frameStart(9, clip)).toBe(2);
  });
});

describe("clampRange", () => {
  it("orders and clamps the range to the clip, and drops one past the end", () => {
    expect(clampRange({ start: 1.5, end: -1 }, 2)).toEqual({ start: 0, end: 1.5 });
    expect(clampRange({ start: 1, end: 9 }, 2)).toEqual({ start: 1, end: 2 });
    expect(clampRange({ start: 3, end: 4 }, 2)).toBeNull();
  });
});

describe("playbackStart", () => {
  it("restarts from the beginning of what plays when the time sits at its end", () => {
    expect(playbackStart(2, 2, loop)).toBe(0);
    expect(playbackStart(1, 2, loop)).toBe(1);
    expect(playbackStart(1, 2, { ...loop, range: { start: 0.25, end: 1 } })).toBe(0.25);
    expect(playbackStart(0.5, 2, { ...loop, range: { start: 0.25, end: 1 } })).toBe(0.5);
  });
});

describe("clampSpeed", () => {
  it("keeps speed between 0.25 and 2", () => {
    expect(clampSpeed(0.1)).toBe(0.25);
    expect(clampSpeed(3)).toBe(2);
    expect(clampSpeed(Number.NaN)).toBe(1);
  });
});

describe("resolveTimeSelection", () => {
  it("turns frames into seconds of the named clip, a range into its start frame", () => {
    const { clips } = stripScene();
    expect(resolveTimeSelection(clips, { kind: "frame", clip: "Armature|Bend", frame: 15 })?.seconds).toBe(0.5);
    expect(resolveTimeSelection(clips, { kind: "range", clip: "Armature|Bend", start: 6, end: 30 })?.seconds).toBe(0.2);
    expect(resolveTimeSelection(clips, { kind: "frame", clip: "Armature|Bend", frame: 90 })?.seconds).toBe(1);
  });

  it("gives the rest pose for no time and nothing for an unknown clip", () => {
    const { clips } = stripScene();
    expect(resolveTimeSelection(clips, { kind: "none" })).toEqual({ clip: null, seconds: 0 });
    expect(resolveTimeSelection(clips, { kind: "frame", clip: "Bend", frame: 0 })).toBeNull();
  });
});
