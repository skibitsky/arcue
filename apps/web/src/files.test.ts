import { describe, expect, it } from "vitest";
import { openedFilePath, openedModelFolder, partitionFiles, samplePath } from "./files";

describe("partitionFiles", () => {
  it("opens FBX files, keeps image files as textures, and ignores the rest", () => {
    const files = [{ name: "Hero.FBX" }, { name: "Hero_BaseColor.png" }, { name: "notes.txt" }, { name: "rock.TGA" }];
    expect(partitionFiles(files)).toEqual({
      models: [{ name: "Hero.FBX" }],
      textures: [{ name: "Hero_BaseColor.png" }, { name: "rock.TGA" }],
      ignored: [{ name: "notes.txt" }],
    });
  });
});

describe("virtual paths", () => {
  it("puts samples and opened files in their own folders", () => {
    expect(samplePath("crate.fbx")).toBe("/samples/crate.fbx");
    expect(openedFilePath("Hero.fbx")).toBe("/files/Hero/Hero.fbx");
    expect(openedFilePath("Hero.fbx", "BaseColor.png")).toBe("/files/Hero/BaseColor.png");
    expect(openedFilePath("Villain.fbx", "BaseColor.png")).toBe("/files/Villain/BaseColor.png");
    expect(openedFilePath("a/b\\c.fbx")).toBe("/files/a_b_c/a_b_c.fbx");
    expect(openedModelFolder(".fbx")).toBe("/files/.fbx");
  });
});
