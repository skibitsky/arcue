import { describe, expect, it } from "vitest";
import { separateComposition } from "./assets";

describe("separateComposition", () => {
  it("names a composition file other than the model's own", () => {
    expect(separateComposition({ path: "/art/Bug.fbx", composition: "/art/Armored.arcue" })).toBe("/art/Armored.arcue");
  });

  it("is null for the model's own composition file, and for a plain model", () => {
    expect(separateComposition({ path: "/art/Bug.fbx", composition: "/art/Bug.arcue" })).toBeNull();
    expect(separateComposition({ path: "/art/Bug.fbx" })).toBeNull();
  });
});
