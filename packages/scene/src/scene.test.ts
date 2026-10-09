import { describe, expect, it } from "vitest";
import type { Importer } from "./importer";
import { findImporter, referencedFileCandidates } from "./importer";
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
    textures: [{ name: "albedo.png", mimeType: "image/png", bytes: new Uint8Array(8) }],
    clips: [],
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

describe("referencedFileCandidates", () => {
  it("tries a relative path first, then the file name beside the asset and in its .fbm folder", () => {
    expect(referencedFileCandidates("textures\\rock.png", "Rock.fbx")).toEqual([
      "textures/rock.png",
      "rock.png",
      "Rock.fbm/rock.png",
    ]);
  });

  it("drops absolute paths from the exporting machine", () => {
    expect(referencedFileCandidates("C:\\Users\\artist\\rock.png", "Rock.fbx")).toEqual([
      "rock.png",
      "Rock.fbm/rock.png",
    ]);
    expect(referencedFileCandidates("/home/artist/rock.png", "Rock.fbx")).toEqual(["rock.png", "Rock.fbm/rock.png"]);
  });

  it("returns nothing for an empty path", () => {
    expect(referencedFileCandidates("", "Rock.fbx")).toEqual([]);
  });
});
