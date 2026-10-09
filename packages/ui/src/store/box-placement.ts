export interface Size {
  width: number;
  height: number;
}

export interface BoxPlacement {
  x: number;
  y: number;
  side: "right" | "below" | "left" | "above" | "none";
}

const MARGIN = 12;

/**
 * Where the comment box goes: beside its pin on the right, else below, left, then above. Without a visible pin it sits
 * at the bottom center of the view.
 */
export function placeBox(pin: { x: number; y: number } | null, box: Size, bounds: Size): BoxPlacement {
  const clampX = (x: number) => Math.max(MARGIN, Math.min(bounds.width - box.width - MARGIN, x));
  const clampY = (y: number) => Math.max(MARGIN, Math.min(bounds.height - box.height - MARGIN, y));
  if (!pin) {
    return { x: clampX(bounds.width / 2 - box.width / 2), y: clampY(bounds.height - 16 - box.height), side: "none" };
  }
  const fits = (x: number, y: number) =>
    x >= MARGIN && x + box.width <= bounds.width - MARGIN && y >= MARGIN && y + box.height <= bounds.height - MARGIN;
  const belowX = clampX(pin.x - 40);
  const options: BoxPlacement[] = [
    { side: "right", x: pin.x + 24, y: clampY(pin.y - 26) },
    { side: "below", x: belowX, y: pin.y + 30 },
    { side: "left", x: pin.x - 24 - box.width, y: clampY(pin.y - 26) },
    { side: "above", x: belowX, y: pin.y - 30 - box.height },
  ];
  const pick = options.find((option) => fits(option.x, option.y)) ?? options[0];
  if (!pick) return { x: MARGIN, y: MARGIN, side: "none" };
  return { side: pick.side, x: clampX(pick.x), y: clampY(pick.y) };
}
