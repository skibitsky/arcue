import { describe, expect, it } from "vitest";
import type { ObjectValues } from "./transforms.js";
import { isTransformProperty, setTransformProperty } from "./transforms.js";

function values(): ObjectValues {
  return {
    location: [0, 0, 0],
    rotationMode: "XYZ",
    euler: [0, 0, 0],
    quaternion: [1, 0, 0, 0],
    axisAngle: [0, 0, 1, 0],
    scale: [1, 1, 1],
    deltaLocation: [0, 0, 0],
    deltaEuler: [0, 0, 0],
    deltaQuaternion: [1, 0, 0, 0],
    deltaAxisAngle: [0, 0, 1, 0],
    deltaScale: [1, 1, 1],
  };
}

describe("transform properties", () => {
  it("knows Blender's transform properties, and delta ones only on objects", () => {
    expect(isTransformProperty("rotation_euler", false)).toBe(true);
    expect(isTransformProperty("delta_scale", false)).toBe(false);
    expect(isTransformProperty("delta_scale", true)).toBe(true);
  });

  it.each(["constructor", "toString", "__proto__", "hasOwnProperty"])("takes %s for no property", (path) => {
    const object = values();
    expect(isTransformProperty(path, true)).toBe(false);
    expect(setTransformProperty(object, path, 0, 5)).toBe(false);
    expect(object).toEqual(values());
  });

  it("sets one component of a property it has", () => {
    const object = values();
    expect(setTransformProperty(object, "location", 2, 5)).toBe(true);
    expect(setTransformProperty(object, "delta_location", 3, 5)).toBe(false);
    expect(object.location).toEqual([0, 0, 5]);
  });
});
