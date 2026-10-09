import { describe, expect, it } from "vitest";
import { cleanClipName, clipNames, displayNames } from "./clip";

describe("cleanClipName", () => {
  it("removes an armature prefix", () => {
    expect(cleanClipName("Armature|Charge")).toBe("Charge");
    expect(cleanClipName("Rig|Layer|Walk")).toBe("Walk");
  });

  it("keeps names without a prefix and trims whitespace", () => {
    expect(cleanClipName("Charge")).toBe("Charge");
    expect(cleanClipName("  Idle ")).toBe("Idle");
  });

  it("keeps the full name when nothing follows the prefix", () => {
    expect(cleanClipName("Armature|")).toBe("Armature|");
    expect(cleanClipName("   ")).toBe("Untitled clip");
  });
});

describe("clipNames", () => {
  it("keeps the names in the file", () => {
    expect(clipNames(["Armature|Run", "Armature|Walk"])).toEqual(["Armature|Run", "Armature|Walk"]);
  });

  it("names empty clips and numbers repeated names without taking a name from the file", () => {
    expect(clipNames(["", "Run", "Run", "", "Run#2"])).toEqual(["(unnamed)", "Run", "Run#3", "(unnamed)#2", "Run#2"]);
    expect(clipNames(["", "(unnamed)"])).toEqual(["(unnamed)#2", "(unnamed)"]);
  });
});

describe("displayNames", () => {
  it("cleans every name", () => {
    expect(displayNames(["Armature|Run", "Armature|Walk"])).toEqual(["Run", "Walk"]);
  });

  it("keeps full names when cleaned names collide", () => {
    expect(displayNames(["Hero|Run", "Sidekick|Run", "Hero|Idle"])).toEqual(["Hero|Run", "Sidekick|Run", "Idle"]);
  });

  it("numbers names that are still equal", () => {
    expect(displayNames(["Run", "Run", "Run"])).toEqual(["Run", "Run (2)", "Run (3)"]);
  });
});
