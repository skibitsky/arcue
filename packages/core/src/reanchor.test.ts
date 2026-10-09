import type { AssetVersion, Comment } from "@arcue/protocol";
import type { SceneDescription, SpatialAnchor } from "@arcue/scene";
import { describe, expect, it } from "vitest";
import { Reanchorer } from "./reanchor";
import { anchorRestPositions, meshesOf } from "./scene-lookup";
import type { FakeMesh } from "./test-support";
import { fakeScene } from "./test-support";

function version(id: string, scene: SceneDescription): AssetVersion {
  return {
    id,
    fileModifiedAt: "2026-10-08T14:02:00.000Z",
    loadedAt: "2026-10-08T14:02:01.000Z",
    exporter: null,
    meshes: meshesOf(scene).map((entry) => ({ mesh: entry.path, topology: entry.mesh.topology })),
  };
}

function commentOn(scene: SceneDescription, versionId: string, target: SpatialAnchor | null): Comment {
  const mesh = target ? meshesOf(scene).find((entry) => entry.path === target.mesh)?.mesh : undefined;
  return {
    id: "c1",
    text: "Fix this.",
    status: "draft",
    createdAt: "2026-10-08T14:05:00.000Z",
    updatedAt: "2026-10-08T14:05:00.000Z",
    madeOnVersion: versionId,
    time: { kind: "none" },
    target,
    anchorVersion: versionId,
    anchorRestPositions: mesh ? anchorRestPositions(mesh, target) : [],
    camera: { position: [0, 1, 3], target: [0, 1, 0], up: [0, 1, 0], fov: 30 },
    context: { vertexCount: 0, bones: [], centroid: null, joints: [], viewLabel: "front", screenshot: null },
    anchorState: "exact",
    followUps: [],
    rounds: [],
    reopenedFrom: null,
  };
}

const body = (overrides: Partial<FakeMesh> = {}): FakeMesh => ({ name: "Body", grid: 3, size: 2, ...overrides });
const v1 = fakeScene({ meshes: [body()] });
const pin: SpatialAnchor = { kind: "surface", mesh: "Hero/Body", vertices: [4, 5, 7], weights: [0.5, 0.25, 0.25] };
const region: SpatialAnchor = {
  kind: "region",
  mesh: "Hero/Body",
  triangles: [[0, 1]],
  vertices: [
    [0, 1],
    [3, 4],
  ],
};

function reanchor(next: SceneDescription, comment: Comment): Comment {
  return new Reanchorer([version("v1", v1), version("v2", next)], "v2", next).reanchor(comment);
}

describe("Reanchorer", () => {
  it("keeps the anchor exactly when the topology matches, and takes the new rest positions", () => {
    const v2 = fakeScene({ meshes: [body({ offset: [0, 0, 0.5] })] });
    const moved = reanchor(v2, commentOn(v1, "v1", pin));
    expect(moved).toMatchObject({ target: pin, anchorVersion: "v2", anchorState: "exact" });
    expect(moved.anchorRestPositions).toEqual([
      [1, 1, 0.5],
      [2, 1, 0.5],
      [1, 2, 0.5],
    ]);
  });

  it("moves a pin to the closest point of a changed mesh", () => {
    const v2 = fakeScene({ meshes: [body({ grid: 5 })] });
    const moved = reanchor(v2, commentOn(v1, "v1", pin));
    expect(moved.anchorState).toBe("moved");
    expect(moved.anchorVersion).toBe("v2");
    const target = moved.target;
    if (target?.kind !== "surface") throw new Error("Expected a pin.");
    const point = [0, 1, 2].map((axis) =>
      target.vertices.reduce((sum, _vertex, corner) => {
        const position = moved.anchorRestPositions[corner]?.[axis] ?? 0;
        return sum + position * (target.weights[corner] ?? 0);
      }, 0),
    );
    expect(point[0]).toBeCloseTo(1.25);
    expect(point[1]).toBeCloseTo(1.25);
    expect(point[2]).toBeCloseTo(0);
  });

  it("maps a region vertex by vertex onto a re-triangulated mesh", () => {
    const v2 = fakeScene({ meshes: [body({ flip: true })] });
    const moved = reanchor(v2, commentOn(v1, "v1", region));
    expect(moved).toMatchObject({ anchorState: "moved", anchorVersion: "v2" });
    expect(moved.target).toEqual({ ...region, triangles: [[0, 1]] });
    expect(moved.anchorRestPositions).toEqual(commentOn(v1, "v1", region).anchorRestPositions);
  });

  it("maps a region onto a finer mesh through the nearest vertices, tinting the triangles that touch them", () => {
    const v2 = fakeScene({ meshes: [body({ grid: 5 })] });
    const moved = reanchor(v2, commentOn(v1, "v1", region));
    expect(moved.anchorState).toBe("moved");
    expect(moved.target).toMatchObject({
      kind: "region",
      vertices: [
        [0, 0],
        [2, 2],
        [10, 10],
        [12, 12],
      ],
    });
    expect(moved.anchorRestPositions).toEqual([
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 0],
      [1, 1, 0],
    ]);
  });

  it("detaches a target with no surface within 2% of the model's size, keeping its old anchor", () => {
    const v2 = fakeScene({ meshes: [body({ offset: [0, 0, 0.2], grid: 4 })] });
    const original = commentOn(v1, "v1", pin);
    const detached = reanchor(v2, original);
    expect(detached).toEqual({ ...original, anchorState: "detached" });
    expect(reanchor(v2, commentOn(v1, "v1", region)).anchorState).toBe("detached");
  });

  it("detaches at 2% of the model's size, the diagonal of its bounds", () => {
    const threshold = 0.02 * Math.hypot(2, 2);
    const near = fakeScene({ meshes: [body({ grid: 4, offset: [0, 0, threshold * 0.95] })] });
    const far = fakeScene({ meshes: [body({ grid: 4, offset: [0, 0, threshold * 1.05] })] });
    expect(reanchor(near, commentOn(v1, "v1", pin)).anchorState).toBe("moved");
    expect(reanchor(far, commentOn(v1, "v1", pin)).anchorState).toBe("detached");
  });

  it("finds a renamed mesh by searching every mesh", () => {
    const v2 = fakeScene({
      meshes: [{ name: "Rock", grid: 3, size: 0.5, offset: [5, 5, 0] }, body({ name: "Torso" })],
    });
    const moved = reanchor(v2, commentOn(v1, "v1", pin));
    expect(moved).toMatchObject({ anchorState: "moved", target: { kind: "surface", mesh: "Hero/Torso" } });
  });

  it("re-attaches a detached comment when a later version brings the surface back", () => {
    const far = fakeScene({ meshes: [body({ offset: [0, 0, 3], grid: 4 })] });
    const back = fakeScene({ meshes: [body({ grid: 4 })] });
    const detached = new Reanchorer([version("v1", v1), version("v2", far)], "v2", far).reanchor(
      commentOn(v1, "v1", pin),
    );
    expect(detached).toMatchObject({ anchorState: "detached", anchorVersion: "v1" });
    const versions = [version("v1", v1), version("v2", far), version("v3", back)];
    expect(new Reanchorer(versions, "v3", back).reanchor(detached)).toMatchObject({
      anchorState: "moved",
      anchorVersion: "v3",
    });
  });

  it("leaves comments without a target, and comments already on the version, unchanged", () => {
    const v2 = fakeScene({ meshes: [body({ grid: 5 })] });
    const loose = commentOn(v1, "v1", null);
    expect(reanchor(v2, loose)).toBe(loose);
    const current = { ...commentOn(v1, "v1", pin), anchorVersion: "v2" };
    expect(reanchor(v2, current)).toBe(current);
  });
});
