import { describe, expect, it } from "vitest";
import { commands } from "./commands";
import { compositionFileSchema } from "./composition";
import { assetVersionSchema } from "./review";

const bug = {
  version: 1,
  animations: ["Animations/BoulderBugTurns.fbx"],
  attach: [
    { file: "BoulderBugShells.fbx", node: "Boulder1", bone: "Body" },
    { file: "BoulderBugShells.fbx", node: "Boulder2", bone: "Body" },
    { file: "../Props/Rock.fbx" },
  ],
  materials: {
    LegStone: { baseColor: "../Textures/LegStone_BaseColor.png", normal: "../Textures/LegStone_Normal.png" },
  },
  hidden: ["BoulderBugShells.fbx//Boulder2"],
};

describe("compositionFileSchema", () => {
  it("accepts a composition with every field, and one with only its version", () => {
    expect(compositionFileSchema.parse(bug)).toEqual(bug);
    expect(compositionFileSchema.parse({ version: 1 })).toEqual({ version: 1 });
  });

  it("rejects other versions and unknown fields, so a typo does not pass unnoticed", () => {
    expect(compositionFileSchema.safeParse({ ...bug, version: 2 }).success).toBe(false);
    expect(compositionFileSchema.safeParse({ ...bug, animation: [] }).success).toBe(false);
    expect(compositionFileSchema.safeParse({ ...bug, model: "BoulderBug.fbx" }).success).toBe(false);
    expect(compositionFileSchema.safeParse({ ...bug, attach: [{ file: "A.fbx", parent: "Body" }] }).success).toBe(
      false,
    );
    expect(compositionFileSchema.safeParse({ ...bug, materials: { LegStone: { albedo: "a.png" } } }).success).toBe(
      false,
    );
  });

  it("takes only relative paths with forward slashes and no empty segments", () => {
    for (const file of ["/work/Bug.fbx", "C:/work/Bug.fbx", "Models\\Bug.fbx", "Models//Bug.fbx", "Models/", ""]) {
      expect(compositionFileSchema.safeParse({ version: 1, animations: [file] }).success, file).toBe(false);
    }
    expect(compositionFileSchema.safeParse({ version: 1, animations: ["./Models/../Bug.fbx"] }).success).toBe(true);
  });

  it("rejects a file, node or hidden part listed twice", () => {
    const twice = (field: object) => compositionFileSchema.safeParse({ ...bug, ...field }).success;
    expect(twice({ animations: ["A.fbx", "A.fbx"] })).toBe(false);
    expect(
      twice({
        attach: [
          { file: "A.fbx", node: "N" },
          { file: "A.fbx", node: "N", bone: "Body" },
        ],
      }),
    ).toBe(false);
    expect(
      twice({
        attach: [
          { file: "A.fbx", node: "N" },
          { file: "A.fbx", node: "M" },
        ],
      }),
    ).toBe(true);
    expect(twice({ hidden: ["A.fbx//N", "A.fbx//N"] })).toBe(false);
  });
});

describe("composition commands", () => {
  it("require a bone exactly for an attached file, and no node for an animation file", () => {
    const add = (input: object) =>
      commands["composition.addFile"].input.safeParse({ assetId: "a1", file: "Shells.fbx", ...input }).success;
    expect(add({ role: "attach", bone: "Body", node: "Boulder1" })).toBe(true);
    expect(add({ role: "attach" })).toBe(false);
    expect(add({ role: "set", bone: "Body" })).toBe(false);
    expect(add({ role: "set", node: "Rock" })).toBe(true);
    expect(add({ role: "animation" })).toBe(true);
    expect(add({ role: "animation", node: "Armature" })).toBe(false);
  });

  it("take a texture slot by name, and null to remove an override", () => {
    const set = (input: object) =>
      commands["material.setTexture"].input.safeParse({ assetId: "a1", material: "Stone", ...input }).success;
    expect(set({ slot: "baseColor", file: "Stone.png" })).toBe(true);
    expect(set({ slot: "normal", file: null })).toBe(true);
    expect(set({ slot: "albedo", file: "Stone.png" })).toBe(false);
  });
});

describe("assetVersionSchema", () => {
  it("keeps each file of a composition with its own version", () => {
    const version = {
      id: "3f9a2c1",
      fileModifiedAt: "2026-10-08T14:02:00.000Z",
      loadedAt: "2026-10-08T14:02:00.000Z",
      exporter: null,
      meshes: [],
      files: [
        { file: "Bug.fbx", id: "1a2b3c4" },
        { file: "BugShells.fbx", id: "5d6e7f8" },
      ],
    };
    expect(assetVersionSchema.parse(version)).toEqual(version);
  });
});
