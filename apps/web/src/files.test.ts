import { describe, expect, it } from "vitest";
import {
  besideAsset,
  numberedPath,
  openedFilePath,
  openedModelFolder,
  partitionFiles,
  planOpen,
  samplePath,
} from "./files";

describe("partitionFiles", () => {
  it("opens FBX files, keeps image files as textures, and ignores the rest", () => {
    const files = [
      { name: "Hero.FBX" },
      { name: "Hero.arcue" },
      { name: "Hero_BaseColor.png" },
      { name: "notes.txt" },
      { name: "rock.TGA" },
    ];
    expect(partitionFiles(files)).toEqual({
      models: [{ name: "Hero.FBX" }],
      textures: [{ name: "Hero_BaseColor.png" }, { name: "rock.TGA" }],
      ignored: [{ name: "Hero.arcue" }, { name: "notes.txt" }],
    });
  });
});

describe("planOpen", () => {
  const file = (name: string) => ({ name });
  const names = (plans: ReturnType<typeof planOpen<{ name: string }>>) =>
    plans.map((plan) => [plan.open.name, plan.files.map((entry) => entry.name)]);

  it("opens each model with the textures dropped with it", () => {
    const files = [file("Bug.fbx"), file("Shells.fbx"), file("Bug.arcue"), file("Shell.png")];
    expect(names(planOpen(files))).toEqual([
      ["Bug.fbx", ["Bug.fbx", "Shell.png"]],
      ["Shells.fbx", ["Shells.fbx", "Shell.png"]],
    ]);
  });

  it("puts a model's animation files beside it instead of opening them", () => {
    const files = [file("Bug.fbx"), file("Bug@Turn.fbx"), file("Rock@Idle.fbx"), file("Skin.png")];
    expect(names(planOpen(files))).toEqual([
      ["Bug.fbx", ["Bug.fbx", "Bug@Turn.fbx", "Skin.png"]],
      ["Rock@Idle.fbx", ["Rock@Idle.fbx", "Skin.png"]],
    ]);
  });

  it("joins animation files to their model as the core does, whatever the extension's case or the stem's '@'", () => {
    expect(names(planOpen([file("Hero.FBX"), file("Hero@Walk.FBX")]))).toEqual([
      ["Hero.FBX", ["Hero.FBX", "Hero@Walk.FBX"]],
    ]);
    expect(names(planOpen([file("Hero@v2.fbx"), file("Hero@v2@Walk.fbx")]))).toEqual([
      ["Hero@v2.fbx", ["Hero@v2.fbx", "Hero@v2@Walk.fbx"]],
    ]);
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
    expect(openedFilePath("Hero.FBX")).toBe("/files/Hero/Hero.FBX");
    expect(openedFilePath("Hero.blend", "BaseColor.png")).toBe("/files/Hero.blend/BaseColor.png");
  });
});

describe("numberedPath", () => {
  it("numbers a file before its extension, and a name without one at its end", () => {
    expect(numberedPath("/files/Hero/Sword.fbx", 2)).toBe("/files/Hero/Sword-2.fbx");
    expect(numberedPath("/files/Hero/Hero@Run.fbx", 3)).toBe("/files/Hero/Hero@Run-3.fbx");
    expect(numberedPath("/files/Hero.v2/notes", 2)).toBe("/files/Hero.v2/notes-2");
    expect(numberedPath("/files/Hero/.hidden", 2)).toBe("/files/Hero/.hidden-2");
  });
});

describe("besideAsset", () => {
  it("puts an added file in the model's folder, and refuses one with the model's name", () => {
    expect(besideAsset("/samples/beetle.fbx", "beetle-turn.fbx")).toBe("/samples/beetle-turn.fbx");
    expect(besideAsset("/files/Hero/Hero.fbx", "a/b.png")).toBe("/files/Hero/a_b.png");
    expect(() => besideAsset("/files/Hero/Hero.fbx", "Hero.fbx")).toThrow("Hero.fbx is the model itself.");
  });
});
