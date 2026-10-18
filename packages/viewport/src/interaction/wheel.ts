export type WheelIntent = "pan" | "zoom";

/** The parts of a wheel event that tell a trackpad from a mouse wheel. */
export interface WheelSample {
  deltaMode: number;
  deltaX: number;
  deltaY: number;
  /** The legacy `wheelDeltaX`, which Chromium, Safari and Firefox still fill in. */
  wheelDeltaX: number | undefined;
  wheelDeltaY: number | undefined;
  ctrlKey: boolean;
  metaKey: boolean;
  timeStamp: number;
}

const STREAM_GAP_MS = 200;
const MAC_NOTCH_STEP = 40 / 65536;

/** Reads `deltaMode` before the deltas, since Firefox reports a mouse wheel in pixels to pages that read them first. */
export function wheelSample(event: WheelEvent): WheelSample {
  const deltaMode = event.deltaMode;
  return {
    deltaMode,
    deltaX: event.deltaX,
    deltaY: event.deltaY,
    wheelDeltaX: legacyDelta(event, "wheelDeltaX"),
    wheelDeltaY: legacyDelta(event, "wheelDeltaY"),
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    timeStamp: event.timeStamp,
  };
}

function legacyDelta(event: WheelEvent, key: "wheelDeltaX" | "wheelDeltaY"): number | undefined {
  const value: unknown = Reflect.get(event, key);
  return typeof value === "number" ? value : undefined;
}

/**
 * Tells a two-finger scroll on a trackpad, which pans, from a mouse wheel, which zooms. Chromium, Safari and Firefox
 * report a trackpad's legacy `wheelDelta` as three times its pixel delta. A mouse wheel reports lines, a `wheelDelta`
 * of 120 a notch, or on macOS pixel deltas in steps of 40/65536. A pinch, and a scroll with Ctrl or Cmd held, zoom.
 * Events less than 200 ms apart form one stream that keeps the intent of its first moving event, so momentum and
 * accelerated notches never switch it midway.
 */
export class WheelIntentTracker {
  private intent: WheelIntent = "zoom";
  private last = Number.NEGATIVE_INFINITY;

  classify(sample: WheelSample): WheelIntent {
    if (sample.ctrlKey || sample.metaKey) {
      this.last = Number.NEGATIVE_INFINITY;
      return "zoom";
    }
    const continues = sample.timeStamp - this.last < STREAM_GAP_MS;
    const moving = sample.deltaX !== 0 || sample.deltaY !== 0;
    if (!continues && moving) this.intent = fromTrackpad(sample) ? "pan" : "zoom";
    if (continues || moving) this.last = sample.timeStamp;
    return this.intent;
  }
}

function fromTrackpad(sample: WheelSample): boolean {
  if (sample.deltaMode !== 0) return false;
  if (isMacNotch(sample.deltaX) || isMacNotch(sample.deltaY)) return false;
  return isPrecise(sample.wheelDeltaX, sample.deltaX) || isPrecise(sample.wheelDeltaY, sample.deltaY);
}

function isPrecise(wheelDelta: number | undefined, delta: number): boolean {
  return wheelDelta !== undefined && delta !== 0 && Math.abs(wheelDelta + 3 * delta) <= 1 + 1e-6;
}

function isMacNotch(delta: number): boolean {
  if (Number.isInteger(delta)) return false;
  const steps = delta / MAC_NOTCH_STEP;
  return Math.abs(steps - Math.round(steps)) < 1e-6;
}
