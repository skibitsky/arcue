import { describe, expect, it } from "vitest";
import { createFileSearch, MAX_SEARCHED_FOLDERS } from "./file-search";
import { MemoryPlatform } from "./memory-platform";
import type { DirectoryEntry } from "./platform";

const asset = "/repo/Assets/Art/Characters/Striker/Models/Striker.fbx";

class CountingPlatform extends MemoryPlatform {
  listed: string[] = [];

  override async list(path: string): Promise<DirectoryEntry[]> {
    this.listed.push(path);
    return super.list(path);
  }
}

function search(files: Record<string, string>, symlinks: Record<string, string> = {}, root = "/repo") {
  const platform = new CountingPlatform({ files: { [asset]: "fbx", ...files }, symlinks });
  const fileSearch = createFileSearch(platform, asset, root);
  const find = async (storedPath: string) => {
    const found = await fileSearch.find(storedPath);
    return found && { path: found.path, text: new TextDecoder().decode(found.bytes) };
  };
  return { find, platform };
}

describe("createFileSearch", () => {
  it("reads the stored relative path first", async () => {
    const { find } = search({
      "/repo/Assets/Art/Characters/Striker/Models/maps/Stone.png": "stored",
      "/repo/Assets/Art/Characters/Striker/Models/Stone.png": "beside",
    });
    await expect(find("maps\\Stone.png")).resolves.toEqual({ path: "maps/Stone.png", text: "stored" });
  });

  it("then looks beside the asset, in its .fbm folder and in a sibling Textures folder, in that order", async () => {
    const models = "/repo/Assets/Art/Characters/Striker/Models";
    const fbm = { [`${models}/Striker.fbm/Stone.png`]: "fbm", [`${models}/Textures/Stone.png`]: "textures" };
    await expect(search({ ...fbm, [`${models}/Stone.png`]: "beside" }).find("C:/Users/a/Stone.png")).resolves.toEqual({
      path: "Stone.png",
      text: "beside",
    });
    await expect(search(fbm).find("C:/Users/a/Stone.png")).resolves.toEqual({
      path: "Striker.fbm/Stone.png",
      text: "fbm",
    });
    await expect(search({ [`${models}/textures/Stone.png`]: "lowercase" }).find("/tmp/Stone.png")).resolves.toEqual({
      path: "textures/Stone.png",
      text: "lowercase",
    });
  });

  it("walks up to the workspace root, trying each parent and its Textures folder", async () => {
    const { find } = search({
      "/repo/Assets/Art/Characters/Striker/Textures/StoneBaseColor.png": "character textures",
      "/repo/Assets/Shared.png": "parent",
      "/repo/Textures/Root.png": "root textures",
    });
    await expect(find("/tmp/staging/StoneBaseColor.png")).resolves.toEqual({
      path: "../Textures/StoneBaseColor.png",
      text: "character textures",
    });
    await expect(find("Shared.png")).resolves.toEqual({ path: "../../../../Shared.png", text: "parent" });
    await expect(find("Root.png")).resolves.toEqual({
      path: "../../../../../Textures/Root.png",
      text: "root textures",
    });
  });

  it("matches names regardless of case, preferring an exact match", async () => {
    const { find } = search({
      "/repo/Assets/Art/Characters/Striker/TEXTURES/stone_basecolor.PNG": "upper folder",
      "/repo/Assets/Art/Characters/Striker/Models/Rock.png": "exact",
      "/repo/Assets/Art/Characters/Striker/Models/rock.png": "lower",
    });
    await expect(find("Stone_BaseColor.png")).resolves.toEqual({
      path: "../TEXTURES/stone_basecolor.PNG",
      text: "upper folder",
    });
    await expect(find("Rock.png")).resolves.toMatchObject({ text: "exact" });
    await expect(find("ROCK.png")).resolves.toMatchObject({ path: expect.stringMatching(/rock\.png$/i) });
  });

  it("never leaves the workspace root", async () => {
    const { find, platform } = search({ "/Outside.png": "outside" });
    await expect(find("Outside.png")).resolves.toBeNull();
    await expect(find("../../../../../../../Outside.png")).resolves.toBeNull();
    expect(platform.listed.every((folder) => folder.startsWith("/repo"))).toBe(true);
  });

  it("stops at the asset's folder when that is the root", async () => {
    const models = "/repo/Assets/Art/Characters/Striker/Models";
    const { find } = search({ "/repo/Assets/Art/Characters/Striker/Textures/Stone.png": "parent" }, {}, models);
    await expect(find("Stone.png")).resolves.toBeNull();
  });

  it("skips files that are links and folders reached through links", async () => {
    const { find } = search(
      { "/repo/secret/Leak.png": "linked file", "/repo/secret/Inner.png": "linked folder" },
      {
        "/repo/Assets/Art/Characters/Striker/Models/Leak.png": "/repo/secret/Leak.png",
        "/repo/Assets/Art/Characters/Striker/Textures": "/repo/secret",
      },
    );
    await expect(find("Leak.png")).resolves.toBeNull();
    await expect(find("Inner.png")).resolves.toBeNull();
    await expect(find("../Textures/Inner.png")).resolves.toBeNull();
  });

  it("reads images only", async () => {
    const { find } = search({
      "/repo/Assets/Art/Characters/Striker/Models/Stone.mat": "material",
      "/repo/.env.png/x": "folder named like an image",
    });
    await expect(find("Stone.mat")).resolves.toBeNull();
    await expect(find("../../../../../.env")).resolves.toBeNull();
    await expect(find(".env.png")).resolves.toBeNull();
    await expect(find("")).resolves.toBeNull();
    await expect(find("textures/")).resolves.toBeNull();
  });

  it("lists each folder once per import", async () => {
    const { find, platform } = search({ "/repo/Textures/Last.png": "root textures" });
    await find("/tmp/A.png");
    const first = platform.listed.length;
    await find("/tmp/B.png");
    await find("/tmp/Last.png");
    expect(platform.listed.length).toBe(first);
    expect(new Set(platform.listed).size).toBe(platform.listed.length);
  });

  it("lists at most MAX_SEARCHED_FOLDERS folders", async () => {
    const deep = `/repo/${Array.from({ length: MAX_SEARCHED_FOLDERS }, (_, index) => `d${index}`).join("/")}`;
    const platform = new CountingPlatform({ files: { [`${deep}/Deep.fbx`]: "fbx", "/repo/Top.png": "top" } });
    const found = await createFileSearch(platform, `${deep}/Deep.fbx`, "/repo").find("Top.png");
    expect(found).toBeNull();
    expect(platform.listed.length).toBeLessThanOrEqual(MAX_SEARCHED_FOLDERS);
  });
});
