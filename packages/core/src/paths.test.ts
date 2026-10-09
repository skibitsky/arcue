import { describe, expect, it } from "vitest";
import { basename, dirname, findGitRoot, joinPath, normalizePath, pathInside, relativePath, stemOf } from "./paths";

describe("normalizePath", () => {
  it("resolves dots and repeated and trailing slashes", () => {
    expect(normalizePath("/work//game/./Assets/../Models/")).toBe("/work/game/Models");
    expect(normalizePath("/")).toBe("/");
    expect(normalizePath("/..")).toBe("/");
  });

  it("converts Windows separators, keeps the drive and uppercases its letter", () => {
    expect(normalizePath("C:\\work\\game\\Hero.fbx")).toBe("C:/work/game/Hero.fbx");
    expect(normalizePath("c:/work/../Hero.fbx")).toBe("C:/Hero.fbx");
    expect(normalizePath("C:/")).toBe("C:/");
  });

  it("keeps a network share as the root", () => {
    expect(normalizePath("\\\\studio\\assets\\Hero.fbx")).toBe("//studio/assets/Hero.fbx");
    expect(normalizePath("//studio/assets/../../Hero.fbx")).toBe("//studio/assets/Hero.fbx");
    expect(normalizePath("//studio/assets")).toBe("//studio/assets/");
    expect(() => normalizePath("//studio")).toThrow(/server and a share/);
  });

  it("rejects relative paths", () => {
    expect(() => normalizePath("Assets/Hero.fbx")).toThrow(/absolute/);
    expect(() => normalizePath("C:Hero.fbx")).toThrow(/absolute/);
  });
});

describe("path parts", () => {
  it("joins segments", () => {
    expect(joinPath("/work/game", ".arcue", "reviews")).toBe("/work/game/.arcue/reviews");
    expect(joinPath("/", ".git")).toBe("/.git");
    expect(joinPath("/", "/work")).toBe("/work");
    expect(joinPath("//studio/assets", "Hero.fbx")).toBe("//studio/assets/Hero.fbx");
  });

  it("finds the parent folder, with the root as its own parent", () => {
    expect(dirname("/work/game/Hero.fbx")).toBe("/work/game");
    expect(dirname("/work")).toBe("/");
    expect(dirname("/")).toBe("/");
    expect(dirname("C:/work")).toBe("C:/");
    expect(dirname("C:/")).toBe("C:/");
    expect(dirname("//studio/assets/Hero.fbx")).toBe("//studio/assets/");
    expect(dirname("//studio/assets/")).toBe("//studio/assets/");
  });

  it("finds the last segment", () => {
    expect(basename("/work/game/Hero.fbx")).toBe("Hero.fbx");
    expect(basename("/")).toBe("");
  });
});

describe("pathInside", () => {
  it("returns the relative path inside the root", () => {
    expect(pathInside("/work/game", "/work/game/Assets/Hero.fbx")).toBe("Assets/Hero.fbx");
    expect(pathInside("/work/game", "/work/game")).toBe("");
    expect(pathInside("/", "/work")).toBe("work");
  });

  it("returns null outside the root, including for a sibling with a shared prefix", () => {
    expect(pathInside("/work/game", "/work/gameplay/Hero.fbx")).toBeNull();
    expect(pathInside("/work/game", "/work")).toBeNull();
  });
});

describe("findGitRoot", () => {
  const existing = new Set(["/work/game/.git", "/work/game/Packages/tool/.git"]);
  const exists = async (path: string) => existing.has(path);

  it("finds the nearest repository above a file", async () => {
    await expect(findGitRoot("/work/game/Assets/Hero.fbx", exists)).resolves.toBe("/work/game");
    await expect(findGitRoot("/work/game/Packages/tool/model.fbx", exists)).resolves.toBe("/work/game/Packages/tool");
  });

  it("returns null outside any repository", async () => {
    await expect(findGitRoot("/downloads/Hero.fbx", exists)).resolves.toBeNull();
  });
});

describe("relativePath", () => {
  it("climbs out of the folder where the path leaves it", () => {
    expect(relativePath("/work/game/Models", "/work/game/Models/Shells.fbx")).toBe("Shells.fbx");
    expect(relativePath("/work/game/Models", "/work/game/Textures/Rock.png")).toBe("../Textures/Rock.png");
    expect(relativePath("/work/game/Models", "/work/game/Models")).toBe("");
    expect(relativePath("C:/work", "D:/work/Rock.png")).toBeNull();
  });

  it("names a file without its last extension", () => {
    expect(stemOf("/work/Hero.v2.fbx")).toBe("Hero.v2");
    expect(stemOf("/work/.fbx")).toBe(".fbx");
  });
});
