const FRAME_EPSILON = 1e-6;

export function frameToSeconds(frame: number, fps: number): number {
  return frame / fps;
}

/** "nearest" suits stored times; "down" suits a playing clock, which shows a frame once its time is reached. */
export function secondsToFrame(seconds: number, fps: number, rounding: "nearest" | "down" = "nearest"): number {
  const frames = seconds * fps;
  return rounding === "nearest" ? Math.round(frames) : Math.floor(frames + FRAME_EPSILON);
}

/** Number of frames in a clip, counting both frame 0 and the frame at `duration`. */
export function frameCountFor(duration: number, fps: number): number {
  return Math.round(duration * fps) + 1;
}

export function lastFrame(clip: { frameCount: number }): number {
  return Math.max(0, clip.frameCount - 1);
}

/** Sorted unique key times across the file's curves; times closer than `tolerance` seconds count as one. */
export function mergeKeyTimes(curveKeyTimes: readonly Float32Array[], tolerance = 1e-5): Float32Array {
  const all: number[] = [];
  for (const times of curveKeyTimes) for (const time of times) all.push(time);
  all.sort((a, b) => a - b);
  const merged: number[] = [];
  for (const time of all) {
    const previous = merged[merged.length - 1];
    if (previous === undefined || time - previous > tolerance) merged.push(time);
  }
  return Float32Array.from(merged);
}

/**
 * True when every animated curve in the file has exactly one key on each frame from 0 to frameCount - 1, within a
 * quarter frame. Pass each curve's own key times, not the union: a clip whose curves are keyed on different frames
 * is not keyed on every frame.
 */
export function isKeyedEveryFrame(curveKeyTimes: readonly Float32Array[], fps: number, frameCount: number): boolean {
  if (curveKeyTimes.length === 0) return false;
  const tolerance = 0.25 / fps;
  return curveKeyTimes.every(
    (times) => times.length === frameCount && times.every((time, frame) => Math.abs(time - frame / fps) <= tolerance),
  );
}
