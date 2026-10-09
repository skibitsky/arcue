import { describe, expect, it } from "vitest";
import { viewLabel } from "./view-label";

describe("viewLabel", () => {
  it("names the eight sides around the model, which faces +Z with its left at +X", () => {
    const at = (x: number, z: number) => viewLabel([x, 1, z], [0, 1, 0]);
    expect(at(0, 3)).toBe("front");
    expect(at(2, 2)).toBe("front left");
    expect(at(3, 0)).toBe("left side");
    expect(at(2, -2)).toBe("back left");
    expect(at(0, -3)).toBe("back");
    expect(at(-2, -2)).toBe("back right");
    expect(at(-3, 0)).toBe("right side");
    expect(at(-2, 2)).toBe("front right");
  });

  it("adds how far above or below the camera is", () => {
    expect(viewLabel([0, 0.2, 3], [0, 0, 0])).toBe("front");
    expect(viewLabel([0, 1, 3], [0, 0, 0])).toBe("front, slightly above");
    expect(viewLabel([0, -3, 3], [0, 0, 0])).toBe("front, below");
    expect(viewLabel([0.1, 5, 0.3], [0, 0, 0])).toBe("top");
    expect(viewLabel([0, -5, 0.1], [0, 0, 0])).toBe("bottom");
  });

  it("falls back to front when the camera sits on its target", () => {
    expect(viewLabel([1, 1, 1], [1, 1, 1])).toBe("front");
  });
});
