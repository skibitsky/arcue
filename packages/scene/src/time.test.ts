import { describe, expect, it } from "vitest";
import { frameCountFor, frameToSeconds, isKeyedEveryFrame, lastFrame, mergeKeyTimes, secondsToFrame } from "./time";

describe("frame and seconds conversion", () => {
  it("converts frames to seconds", () => {
    expect(frameToSeconds(34, 60)).toBeCloseTo(0.5667, 4);
    expect(frameToSeconds(0, 60)).toBe(0);
  });

  it("rounds stored seconds to the nearest frame", () => {
    expect(secondsToFrame(0.567, 60)).toBe(34);
    expect(secondsToFrame(frameToSeconds(34, 60), 60)).toBe(34);
  });

  it("rounds a playing clock down, tolerating float error", () => {
    expect(secondsToFrame(0.5999, 60, "down")).toBe(35);
    expect(secondsToFrame((34 / 60) * (1 - 1e-12), 60, "down")).toBe(34);
  });

  it("counts frames including both ends", () => {
    expect(frameCountFor(0.75, 60)).toBe(46);
    expect(frameCountFor(0, 30)).toBe(1);
    expect(lastFrame({ frameCount: 46 })).toBe(45);
    expect(lastFrame({ frameCount: 0 })).toBe(0);
  });
});

describe("mergeKeyTimes", () => {
  it("sorts and removes duplicate times across tracks", () => {
    const merged = mergeKeyTimes([Float32Array.of(0, 0.5, 1), Float32Array.of(0.5, 0.25, 0.500001)]);
    expect([...merged]).toEqual([0, 0.25, 0.5, 1]);
  });

  it("returns no times for no tracks", () => {
    expect(mergeKeyTimes([]).length).toBe(0);
  });
});

describe("isKeyedEveryFrame", () => {
  const fps = 30;
  const everyFrame = Float32Array.from({ length: 4 }, (_, frame) => frame / fps);

  it("accepts curves that each have a key on every frame, within a tick of the frame time", () => {
    const tickEarly = everyFrame.map((time) => time - 1 / 46186158000);
    expect(isKeyedEveryFrame([everyFrame, tickEarly], fps, 4)).toBe(true);
  });

  it("rejects a curve that misses a frame, even when another curve has it", () => {
    expect(isKeyedEveryFrame([everyFrame, Float32Array.of(0, 1 / fps, 3 / fps)], fps, 4)).toBe(false);
  });

  it("rejects keys between frames and clips without curves", () => {
    expect(isKeyedEveryFrame([Float32Array.of(0, 0.5 / fps, 2.5 / fps, 3 / fps)], fps, 4)).toBe(false);
    expect(isKeyedEveryFrame([], fps, 4)).toBe(false);
  });
});
