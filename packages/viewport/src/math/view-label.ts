import type { Vec3 } from "@arcue/scene";

const SIDES = ["front", "front left", "left side", "back left", "back", "back right", "right side", "front right"];

/**
 * Plain words for where the camera looks from, relative to the model in scene space: the model faces +Z with +Y up,
 * so its left side is +X. Examples: "front", "back right, slightly above", "top".
 */
export function viewLabel(position: Vec3, target: Vec3): string {
  const dx = position[0] - target[0];
  const dy = position[1] - target[1];
  const dz = position[2] - target[2];
  const length = Math.hypot(dx, dy, dz);
  if (length === 0) return "front";
  const elevation = (Math.asin(Math.min(1, Math.max(-1, dy / length))) * 180) / Math.PI;
  if (elevation > 65) return "top";
  if (elevation < -65) return "bottom";
  const azimuth = (Math.atan2(dx, dz) * 180) / Math.PI;
  const sector = ((Math.round(azimuth / 45) % 8) + 8) % 8;
  const side = SIDES[sector] ?? "front";
  const height = elevationWords(elevation);
  return height ? `${side}, ${height}` : side;
}

function elevationWords(elevation: number): string | null {
  const magnitude = Math.abs(elevation);
  if (magnitude < 12) return null;
  const direction = elevation > 0 ? "above" : "below";
  return magnitude < 35 ? `slightly ${direction}` : direction;
}
