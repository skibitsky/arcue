import type { ImportFindFileInput, ImportRunInput } from "@arcue/protocol";
import { ArcueError, createMemoryChannel, createPeer, importRequests } from "@arcue/protocol";
import type { FoundFile, SceneDescription } from "@arcue/scene";
import { afterEach, describe, expect, it } from "vitest";
import { EXTERNAL_TEXTURE_FBX, PNG_SIGNATURE } from "../test/ascii-fbx";
import { readSample } from "../test/samples";
import { startFbxImportWorker } from "./worker";

const cleanups: (() => void)[] = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

function connect(files: Record<string, FoundFile> = {}) {
  const [coreSide, workerSide] = createMemoryChannel();
  const worker = startFbxImportWorker(workerSide);
  const requested: string[] = [];
  const core = createPeer(coreSide, {
    handleRequest: ({ name, input }) => {
      if (name !== importRequests.findFile) throw new ArcueError("unknown-command", name);
      const { storedPath } = input as ImportFindFileInput;
      requested.push(storedPath);
      return files[storedPath] ?? null;
    },
  });
  cleanups.push(() => {
    core.close();
    worker.close();
    coreSide.close();
  });
  const run = async (fileName: string, bytes: Uint8Array) => {
    const input: ImportRunInput = { fileName, bytes };
    return (await core.request("command", importRequests.run, input, [bytes.buffer])) as SceneDescription;
  };
  return { run, requested };
}

describe("startFbxImportWorker", () => {
  it("answers import.run with the scene, its buffers moved across the channel", async () => {
    const { run, requested } = connect();
    const scene = await run("pebble-golem.fbx", readSample("pebble-golem.fbx"));
    expect(scene.meshes[0]?.name).toBe("PebbleGolem");
    expect(scene.meshes[0]?.positions).toBeInstanceOf(Float32Array);
    expect(scene.clips.map((clip) => clip.displayName).sort()).toEqual(["Hit", "Idle", "Walk", "Wave"]);
    expect(scene.skeletons[0]?.joints).toHaveLength(27);
    expect(requested).toEqual([]);
  });

  it("asks the core to find an external texture by its stored path through import.findFile", async () => {
    const { run, requested } = connect({
      "textures/painted.png": { path: "tri.fbm/painted.png", bytes: PNG_SIGNATURE },
    });
    const scene = await run("tri.fbx", new TextEncoder().encode(EXTERNAL_TEXTURE_FBX));
    expect(requested).toEqual(["textures/painted.png"]);
    expect(scene.textures).toEqual([
      {
        name: "painted",
        mimeType: "image/png",
        bytes: PNG_SIGNATURE,
        storedPath: "textures/painted.png",
        foundPath: "tri.fbm/painted.png",
      },
    ]);
    expect(scene.materials[0]?.baseColorTexture?.texture).toBe(0);
    expect(scene.source.warnings).toEqual([]);
    expect(scene.meshes[0]?.indices).toHaveLength(3);
  });

  it("warns about a missing external texture and leaves the slot empty", async () => {
    const { run, requested } = connect();
    const scene = await run("tri.fbx", new TextEncoder().encode(EXTERNAL_TEXTURE_FBX));
    expect(requested).toEqual(["textures/painted.png", "C:/Users/artist/textures/painted.png"]);
    expect(scene.textures).toEqual([]);
    expect(scene.materials[0]?.baseColorTexture).toBeNull();
    expect(scene.source.warnings).toEqual([
      {
        code: "texture-not-found",
        severity: "error",
        subject: { kind: "texture", name: "painted.png" },
        message: "Texture not found: painted.png",
      },
    ]);
  });

  it("rejects a file that is not FBX with invalid-input", async () => {
    const { run } = connect();
    await expect(run("notes.fbx", new TextEncoder().encode("not an fbx"))).rejects.toMatchObject({
      code: "invalid-input",
    });
  });
});
