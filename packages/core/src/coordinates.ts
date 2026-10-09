import type { CoordinateConvention } from "@arcue/protocol";
import type { Vec3 } from "@arcue/scene";

/** Converts a scene-space position or direction, rounded to 0.00001. Z up keeps the handedness: (x, -z, y). */
export function toConvention(vector: readonly [number, number, number], convention: CoordinateConvention): Vec3 {
  const [x, y, z] = vector;
  return convention === "y-up" ? [round5(x), round5(y), round5(z)] : [round5(x), round5(-z), round5(y)];
}

export function upAxisOf(convention: CoordinateConvention): "+Y" | "+Z" {
  return convention === "y-up" ? "+Y" : "+Z";
}

export function round5(value: number): number {
  return Math.round(value * 1e5) / 1e5 || 0;
}
