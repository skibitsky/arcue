import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { assetPathsFromArgv, isAssetPath } from "./args";

describe("assetPathsFromArgv", () => {
  const cwd = resolve("/work/game");

  it("takes asset files after the executable of a packaged app, resolving relative paths", () => {
    expect(assetPathsFromArgv(["Arcue", "Hero.fbx", resolve("/tmp/Golem.FBX")], cwd, false)).toEqual([
      join(cwd, "Hero.fbx"),
      resolve("/tmp/Golem.FBX"),
    ]);
  });

  it("skips the app folder of an unpackaged app, switches and other files", () => {
    expect(
      assetPathsFromArgv(
        ["electron", ".", "--inspect=9229", "--user-data-dir=/x.fbx", "notes.txt", "Hero.fbx"],
        cwd,
        true,
      ),
    ).toEqual([join(cwd, "Hero.fbx")]);
  });
});

describe("isAssetPath", () => {
  it("accepts FBX files in any case", () => {
    expect(isAssetPath("a/B.Fbx")).toBe(true);
    expect(isAssetPath("a/B.fbx.txt")).toBe(false);
  });
});
