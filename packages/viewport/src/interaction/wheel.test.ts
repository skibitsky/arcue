import { describe, expect, it } from "vitest";
import { WheelIntentTracker, type WheelSample } from "./wheel";

function sample(overrides: Partial<WheelSample>): WheelSample {
  return {
    deltaMode: 0,
    deltaX: 0,
    deltaY: 0,
    wheelDeltaX: 0,
    wheelDeltaY: 0,
    ctrlKey: false,
    metaKey: false,
    timeStamp: 0,
    ...overrides,
  };
}

function classifyOne(overrides: Partial<WheelSample>) {
  return new WheelIntentTracker().classify(sample(overrides));
}

describe("WheelIntentTracker", () => {
  it("pans for a two-finger scroll on a Mac trackpad in Chromium and Safari", () => {
    expect(classifyOne({ deltaY: 5, wheelDeltaY: -15 })).toBe("pan");
    expect(classifyOne({ deltaY: -2, wheelDeltaY: 6 })).toBe("pan");
    expect(classifyOne({ deltaX: 4, wheelDeltaX: -12 })).toBe("pan");
  });

  it("pans when Chromium truncates the legacy delta or the page is zoomed", () => {
    expect(classifyOne({ deltaY: 21, wheelDeltaY: -62 })).toBe("pan");
    expect(classifyOne({ deltaY: 7 / 1.25, wheelDeltaY: Math.trunc((-3 * 7) / 1.25) })).toBe("pan");
  });

  it("pans for a trackpad in Firefox, which rounds the legacy delta", () => {
    expect(classifyOne({ deltaY: 1.5, wheelDeltaY: -5 })).toBe("pan");
  });

  it("zooms for a mouse wheel", () => {
    expect(classifyOne({ deltaY: 4.000244140625, wheelDeltaY: -120 })).toBe("zoom");
    expect(classifyOne({ deltaY: 4.000244140625, wheelDeltaY: -12 })).toBe("zoom");
    expect(classifyOne({ deltaY: -12.000732421875, wheelDeltaY: 36 })).toBe("zoom");
    expect(classifyOne({ deltaY: 100, wheelDeltaY: -120 })).toBe("zoom");
    expect(classifyOne({ deltaY: 53, wheelDeltaY: -120 })).toBe("zoom");
    expect(classifyOne({ deltaMode: 1, deltaY: 3, wheelDeltaY: -120 })).toBe("zoom");
  });

  it("zooms when the browser has no legacy delta", () => {
    expect(classifyOne({ deltaY: 5, wheelDeltaY: undefined })).toBe("zoom");
  });

  it("zooms for a pinch and for a scroll with Ctrl or Cmd held", () => {
    const tracker = new WheelIntentTracker();
    expect(tracker.classify(sample({ deltaY: 5, wheelDeltaY: -15, timeStamp: 0 }))).toBe("pan");
    expect(tracker.classify(sample({ deltaY: 2, wheelDeltaY: -6, ctrlKey: true, timeStamp: 16 }))).toBe("zoom");
    expect(tracker.classify(sample({ deltaY: 2, wheelDeltaY: -6, metaKey: true, timeStamp: 32 }))).toBe("zoom");
    expect(tracker.classify(sample({ deltaY: 2, wheelDeltaY: -6, timeStamp: 48 }))).toBe("pan");
  });

  it("keeps a stream's intent through momentum and accelerated notches", () => {
    const pan = new WheelIntentTracker();
    expect(pan.classify(sample({ deltaY: 9, wheelDeltaY: -27, timeStamp: 0 }))).toBe("pan");
    expect(pan.classify(sample({ deltaY: 4.000244140625, wheelDeltaY: -120, timeStamp: 16 }))).toBe("pan");
    expect(pan.classify(sample({ deltaY: 1, wheelDeltaY: -3, timeStamp: 32 }))).toBe("pan");

    const zoom = new WheelIntentTracker();
    expect(zoom.classify(sample({ deltaY: 4.000244140625, wheelDeltaY: -12, timeStamp: 0 }))).toBe("zoom");
    expect(zoom.classify(sample({ deltaY: 20, wheelDeltaY: -60, timeStamp: 40 }))).toBe("zoom");
    expect(zoom.classify(sample({ deltaY: 20, wheelDeltaY: -60, timeStamp: 400 }))).toBe("pan");
  });

  it("decides a stream on its first moving event", () => {
    const tracker = new WheelIntentTracker();
    tracker.classify(sample({ timeStamp: 0 }));
    expect(tracker.classify(sample({ deltaY: 3, wheelDeltaY: -9, timeStamp: 8 }))).toBe("pan");
  });
});
