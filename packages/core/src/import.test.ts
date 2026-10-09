import type { Importer, SceneDescription } from "@arcue/scene";
import { referencedFileCandidates, SCENE_SPACE } from "@arcue/scene";
import { describe, expect, it } from "vitest";
import { importAsset, readReferencedFile } from "./import";
import { MemoryPlatform } from "./memory-platform";

const asset = "/work/game/Models/Rock.fbx";
const repoAsset = "/repo/Assets/Art/Models/Rock.fbx";

const files = {
  [asset]: "fbx bytes",
  "/work/game/Models/rock.png": "beside the asset",
  "/work/game/Models/textures/moss.png": "in a subfolder",
  "/work/game/Models/Rock.fbm/baked.png": "extracted media",
  "/work/game/Models/notes.txt": "not an image",
  "/work/game/sibling.png": "outside the asset folder",
  "/repo/.git/HEAD": "ref: refs/heads/main",
  [repoAsset]: "fbx bytes",
  "/repo/Assets/Art/Textures/Rock_Albedo.PNG": "unity textures folder",
  "/repo/Assets/Art/Textures/Rock_Normal.tga": "targa",
  "/repo/Assets/Art/Textures/Rock.mat": "unity material",
  "/repo/Assets/Art/Models/Rock.fbm/baked.png": "extracted media",
  "/repo/secrets/key.png": "inside the repository",
  "/repo/.env": "SECRET=1",
  "/outside/leak.png": "outside the repository",
};

function emptyScene(textureNames: string[]): SceneDescription {
  return {
    source: {
      format: "fbx",
      exporter: null,
      fps: 30,
      originalSpace: SCENE_SPACE,
      conversion: { scale: 1, rotation: [0, 0, 0, 1] },
      warnings: [],
    },
    nodes: [],
    meshes: [],
    skeletons: [],
    materials: [],
    textures: textureNames.map((name) => ({ name, mimeType: "image/png", bytes: new Uint8Array(4) })),
    clips: [],
    parts: [],
    bounds: { min: [0, 0, 0], max: [0, 0, 0] },
  };
}

const platform = new MemoryPlatform({ files });

function reader(assetPath: string, readRoot?: string) {
  return async (path: string) => {
    const bytes = await readReferencedFile(platform, assetPath, path, readRoot);
    return bytes && new TextDecoder().decode(bytes);
  };
}

describe("readReferencedFile outside a repository", () => {
  const read = reader(asset);

  it("reads images inside the asset's folder", async () => {
    await expect(read("rock.png")).resolves.toBe("beside the asset");
    await expect(read("textures\\moss.png")).resolves.toBe("in a subfolder");
    await expect(read("./textures/../rock.png")).resolves.toBe("beside the asset");
  });

  it("returns null for paths that leave the asset's folder", async () => {
    await expect(read("../sibling.png")).resolves.toBeNull();
    await expect(read("textures/../../sibling.png")).resolves.toBeNull();
  });

  it("returns null for absolute and drive paths", async () => {
    await expect(read("/work/game/Models/rock.png")).resolves.toBeNull();
    await expect(read("C:/work/game/Models/rock.png")).resolves.toBeNull();
    await expect(read("c:rock.png")).resolves.toBeNull();
    await expect(read("\\\\server\\share\\rock.png")).resolves.toBeNull();
  });

  it("returns null for files that are not images", async () => {
    await expect(read("notes.txt")).resolves.toBeNull();
  });

  it("returns null for missing files, folders and the empty path", async () => {
    await expect(read("missing.png")).resolves.toBeNull();
    await expect(read("textures")).resolves.toBeNull();
    await expect(read("")).resolves.toBeNull();
  });

  it("finds a texture stored with an absolute path through its fallback candidates", async () => {
    const found: string[] = [];
    for (const candidate of referencedFileCandidates("C:\\Users\\artist\\baked.png", "Rock.fbx")) {
      if (await readReferencedFile(platform, asset, candidate)) found.push(candidate);
    }
    expect(found).toEqual(["Rock.fbm/baked.png"]);
  });
});

describe("readReferencedFile inside a repository", () => {
  const read = reader(repoAsset, "/repo");

  it("reads images anywhere in the repository, such as Unity's ../Textures/ folder", async () => {
    await expect(read("../Textures/Rock_Albedo.PNG")).resolves.toBe("unity textures folder");
    await expect(read("..\\Textures\\Rock_Normal.tga")).resolves.toBe("targa");
    await expect(read("../../../secrets/key.png")).resolves.toBe("inside the repository");
  });

  it("returns null for traversal out of the repository", async () => {
    await expect(read("../../../../outside/leak.png")).resolves.toBeNull();
    await expect(read("../Textures/../../../../outside/leak.png")).resolves.toBeNull();
    await expect(read("../../../../../../../../outside/leak.png")).resolves.toBeNull();
  });

  it("returns null for absolute paths, even inside the repository", async () => {
    await expect(read("/repo/Assets/Art/Textures/Rock_Albedo.PNG")).resolves.toBeNull();
    await expect(read("C:\\repo\\Assets\\Art\\Textures\\Rock_Albedo.PNG")).resolves.toBeNull();
    await expect(read("//server/share/Rock_Albedo.png")).resolves.toBeNull();
  });

  it("returns null for files that are not images", async () => {
    await expect(read("../Textures/Rock.mat")).resolves.toBeNull();
    await expect(read("../../../.env")).resolves.toBeNull();
    await expect(read("../../../.git/HEAD")).resolves.toBeNull();
    await expect(read("Rock.fbx")).resolves.toBeNull();
  });

  it("returns null for paths through a symbolic link, at the file or in a folder", async () => {
    const linked = new MemoryPlatform({
      files,
      symlinks: {
        "/repo/Assets/Art/Textures/Linked.png": "/outside/leak.png",
        "/repo/Assets/Art/Escape": "/outside",
        "/repo/Assets/Art/Inner": "Textures",
      },
    });
    const readLinked = async (path: string) => readReferencedFile(linked, repoAsset, path, "/repo");
    await expect(readLinked("../Textures/Linked.png")).resolves.toBeNull();
    await expect(readLinked("../Escape/leak.png")).resolves.toBeNull();
    await expect(readLinked("../Inner/Rock_Normal.tga")).resolves.toBeNull();
    await expect(readLinked("../Textures/Rock_Normal.tga")).resolves.not.toBeNull();
  });

  it("keeps the file-name fallback for absolute paths stored in the file", async () => {
    const found: string[] = [];
    for (const candidate of referencedFileCandidates("C:\\Users\\artist\\baked.png", "Rock.fbx")) {
      if (await readReferencedFile(platform, repoAsset, candidate, "/repo")) found.push(candidate);
    }
    expect(found).toEqual(["Rock.fbm/baked.png"]);
  });
});

describe("importAsset", () => {
  const textureImporter = (paths: string[]): Importer => ({
    format: "fbx",
    extensions: [".fbx"],
    async import({ fileName, bytes, readFile }) {
      const names: string[] = [new TextDecoder().decode(bytes), fileName];
      for (const path of paths) {
        if (await readFile(path)) names.push(path);
      }
      return emptyScene(names);
    },
  });

  it("parses the asset in the platform's import worker, which reads only images inside the asset's folder", async () => {
    const importers = [textureImporter(["rock.png", "../sibling.png", "notes.txt"])];
    const platform = new MemoryPlatform({ files, importers });
    const scene = await importAsset(platform, asset, await platform.readFile(asset));
    expect(scene.textures.map((texture) => texture.name)).toEqual(["fbx bytes", "Rock.fbx", "rock.png"]);
  });

  it("lets the worker read images anywhere in the asset's repository", async () => {
    const importers = [textureImporter(["../Textures/Rock_Albedo.PNG", "../../../../outside/leak.png"])];
    const platform = new MemoryPlatform({ files, importers });
    const scene = await importAsset(platform, repoAsset, await platform.readFile(repoAsset));
    expect(scene.textures.map((texture) => texture.name)).toEqual([
      "fbx bytes",
      "Rock.fbx",
      "../Textures/Rock_Albedo.PNG",
    ]);
  });

  it("rejects a file no importer reads", async () => {
    const platform = new MemoryPlatform({ files: { "/work/model.obj": "o" }, importers: [textureImporter([])] });
    const bytes = await platform.readFile("/work/model.obj");
    await expect(importAsset(platform, "/work/model.obj", bytes)).rejects.toMatchObject({ code: "invalid-input" });
  });

  it("reports the importer's failure", async () => {
    const failing: Importer = { ...textureImporter([]), import: () => Promise.reject(new Error("Not an FBX file.")) };
    const platform = new MemoryPlatform({ files, importers: [failing] });
    await expect(importAsset(platform, asset, await platform.readFile(asset))).rejects.toMatchObject({
      code: "internal",
      message: "Not an FBX file.",
    });
  });

  it("uses the worker the platform's host provides", async () => {
    let started = 0;
    const host = new MemoryPlatform({ importers: [textureImporter([])] });
    const platform = new MemoryPlatform({
      files,
      startImportWorker: () => {
        started++;
        return host.startImportWorker();
      },
    });
    await importAsset(platform, asset, await platform.readFile(asset));
    expect(started).toBe(1);
  });
});
