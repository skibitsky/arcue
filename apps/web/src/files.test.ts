import type { CompositionFile } from "@arcue/protocol";
import { describe, expect, it } from "vitest";
import { besideAsset, openedFilePath, openedModelFolder, partitionFiles, planOpen, samplePath } from "./files";

describe("partitionFiles", () => {
  it("opens FBX and composition files, keeps image files as textures, and ignores the rest", () => {
    const files = [
      { name: "Hero.FBX" },
      { name: "Hero.arcue" },
      { name: "Hero_BaseColor.png" },
      { name: "notes.txt" },
      { name: "rock.TGA" },
    ];
    expect(partitionFiles(files)).toEqual({
      models: [{ name: "Hero.FBX" }],
      compositions: [{ name: "Hero.arcue" }],
      textures: [{ name: "Hero_BaseColor.png" }, { name: "rock.TGA" }],
      ignored: [{ name: "notes.txt" }],
    });
  });
});

describe("planOpen", () => {
  const file = (name: string) => ({ name });
  const names = (plans: ReturnType<typeof planOpen<{ name: string }>>) =>
    plans.map((plan) => [plan.open.name, plan.files.map((entry) => entry.name)]);

  it("opens a composition with the models and textures dropped with it, and not the models it names", () => {
    const bug = file("Bug.arcue");
    const files = [file("Bug.fbx"), file("Shells.fbx"), file("Turn.fbx"), bug, file("Shell.png"), file("Crate.fbx")];
    const content: CompositionFile = {
      version: 1,
      model: "Bug.fbx",
      animations: ["Anim/Turn.fbx"],
      attach: [{ file: "Shells.fbx", bone: "Body" }],
    };
    expect(names(planOpen(files, new Map([[bug, content]])))).toEqual([
      ["Bug.arcue", ["Bug.arcue", "Bug.fbx", "Shells.fbx", "Turn.fbx", "Crate.fbx", "Shell.png"]],
      ["Crate.fbx", ["Crate.fbx", "Shell.png"]],
    ]);
  });

  it("puts a model's animation files beside it instead of opening them", () => {
    const files = [file("Bug.fbx"), file("Bug@Turn.fbx"), file("Rock@Idle.fbx"), file("Skin.png")];
    expect(names(planOpen(files, new Map()))).toEqual([
      ["Bug.fbx", ["Bug.fbx", "Bug@Turn.fbx", "Skin.png"]],
      ["Rock@Idle.fbx", ["Rock@Idle.fbx", "Skin.png"]],
    ]);
  });

  it("still opens a composition that could not be read, and every model, so the core reports the problem", () => {
    const broken = file("Bug.arcue");
    expect(names(planOpen([file("Bug.fbx"), broken], new Map([[broken, null]])))).toEqual([
      ["Bug.arcue", ["Bug.arcue", "Bug.fbx"]],
      ["Bug.fbx", ["Bug.fbx"]],
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
  });
});

describe("besideAsset", () => {
  it("puts an added file in the model's folder, and refuses one with the model's name", () => {
    expect(besideAsset("/samples/beetle.fbx", "beetle-turn.fbx")).toBe("/samples/beetle-turn.fbx");
    expect(besideAsset("/files/Hero/Hero.fbx", "a/b.png")).toBe("/files/Hero/a_b.png");
    expect(() => besideAsset("/files/Hero/Hero.fbx", "Hero.fbx")).toThrow("Hero.fbx is the model itself.");
  });
});
