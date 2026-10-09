import { describe, expect, it } from "vitest";
import type { Importer } from "./importer";
import { findImporter, parseStoredPath } from "./importer";
import { boundsOfPoints } from "./math";
import type { SceneDescription } from "./scene";
import { collectTransferables } from "./scene";
import { SCENE_SPACE } from "./source";

function sceneWithSharedBuffer(): { scene: SceneDescription; shared: ArrayBuffer } {
  const shared = new ArrayBuffer(48);
  const scene: SceneDescription = {
    source: {
      format: "fbx",
      exporter: null,
      fps: 30,
      originalSpace: SCENE_SPACE,
      conversion: { scale: 1, rotation: [0, 0, 0, 1] },
      warnings: [],
    },
    nodes: [],
    meshes: [
      {
        name: "Mesh",
        geometryName: "Mesh",
        positions: new Float32Array(shared, 0, 6),
        normals: new Float32Array(shared, 24, 6),
        uvs: [],
        colors: null,
        skeleton: null,
        bindMatrix: null,
        joints: null,
        weights: null,
        indices: Uint32Array.of(0, 1, 1),
        groups: [],
        morphTargets: [],
        sourceVertex: Uint32Array.of(0, 1),
        sourceVertexCount: 2,
        restPositions: new Float32Array(6),
        skinWeights: null,
        topology: { sourceVertexCount: 2, triangleCount: 1, hash: "0000000000000000" },
      },
    ],
    skeletons: [],
    materials: [],
    textures: [
      {
        name: "albedo",
        mimeType: "image/png",
        bytes: new Uint8Array(8),
        storedPath: "albedo.png",
        foundPath: "albedo.png",
      },
    ],
    clips: [],
    parts: [],
    bounds: { min: [0, 0, 0], max: [0, 0, 0] },
  };
  return { scene, shared };
}

describe("collectTransferables", () => {
  it("lists each buffer once", () => {
    const { scene, shared } = sceneWithSharedBuffer();
    const buffers = collectTransferables(scene);
    expect(buffers.filter((buffer) => buffer === shared)).toHaveLength(1);
    expect(buffers).toHaveLength(5);
  });
});

describe("boundsOfPoints", () => {
  it("covers every point of every array", () => {
    expect(boundsOfPoints([Float32Array.of(1, 2, 3, -1, 0, 5), Float32Array.of(0, -4, 0)])).toEqual({
      min: [-1, -4, 0],
      max: [1, 2, 5],
    });
  });

  it("returns a zero box for no points", () => {
    expect(boundsOfPoints([])).toEqual({ min: [0, 0, 0], max: [0, 0, 0] });
  });
});

describe("findImporter", () => {
  const fbx: Importer = {
    format: "fbx",
    extensions: [".fbx"],
    import: () => Promise.reject(new Error("unused")),
  };

  it("matches extensions without regard to case", () => {
    expect(findImporter([fbx], "StoneResonator.FBX")).toBe(fbx);
  });

  it("returns null for unknown formats", () => {
    expect(findImporter([fbx], "model.obj")).toBeNull();
  });
});

describe("parseStoredPath", () => {
  it("keeps a relative path with forward slashes", () => {
    expect(parseStoredPath("textures\\rock.png")).toEqual({
      name: "rock.png",
      relative: "textures/rock.png",
      absolute: false,
    });
  });

  it("marks paths from the exporting machine as absolute", () => {
    expect(parseStoredPath("C:\\Users\\artist\\rock.png")).toEqual({
      name: "rock.png",
      relative: null,
      absolute: true,
    });
    expect(parseStoredPath("/home/artist/rock.png")).toEqual({ name: "rock.png", relative: null, absolute: true });
    expect(parseStoredPath("\\\\server\\share\\rock.png").absolute).toBe(true);
  });

  it("returns no name and no relative path for an empty path", () => {
    expect(parseStoredPath("")).toEqual({ name: "", relative: null, absolute: false });
  });
});
