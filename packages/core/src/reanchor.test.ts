import type { AssetVersion, Comment } from "@arcue/protocol";
import type { SceneDescription, SpatialAnchor } from "@arcue/scene";
import { describeParts } from "@arcue/scene";
import { describe, expect, it } from "vitest";
import { Reanchorer } from "./reanchor";
import { anchorRestPositions, meshesOf } from "./scene-lookup";
import type { FakeBone, FakeMesh } from "./test-support";
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

  it("keeps lowest source indices on equal-distance region matches across repeated comments", () => {
    const next = fakeScene({ meshes: [body({ grid: 32, size: 2 })] });
    const mesh = next.meshes[0];
    if (!mesh) throw new Error("Body has a mesh");
    mesh.restPositions.set([0, 0, 0], 100 * 3);
    mesh.restPositions.set([0, 0, 0], 900 * 3);
    const index = new Reanchorer([version("v1", v1), version("v2", next)], "v2", next);
    const original = commentOn(v1, "v1", region);
    original.anchorRestPositions = [[0, 0, 0]];
    for (let number = 1; number <= 3; number++) {
      const moved = index.reanchor({ ...original, id: `c${number}` });
      expect(moved).toMatchObject({
        anchorState: "moved",
        anchorVersion: "v2",
        target: { kind: "region", vertices: [[0, 0]] },
      });
      expect(moved.anchorRestPositions).toEqual([[0, 0, 0]]);
    }
  });

  it("reanchors a tiny region without paying the coordinate work of building a spatial index", () => {
    const next = fakeScene({ meshes: [body({ grid: 64, size: 2 })] });
    const mesh = next.meshes[0];
    if (!mesh) throw new Error("Body has a mesh");
    let coordinateReads = 0;
    mesh.restPositions = new Proxy(mesh.restPositions, {
      get(target, key) {
        if (typeof key === "string" && /^\d+$/.test(key)) coordinateReads++;
        return Reflect.get(target, key, target);
      },
    });
    const original = commentOn(v1, "v1", region);
    original.anchorRestPositions = [[0, 0, 0]];
    const moved = reanchor(next, original);
    expect(moved).toMatchObject({ anchorState: "moved", target: { kind: "region", vertices: [[0, 0]] } });
    expect(coordinateReads).toBeLessThan(mesh.restPositions.length * 2);
  });

  it("reuses an existing spatial index when a large region is followed by a tiny one", () => {
    const previous = fakeScene({ meshes: [body({ grid: 65, size: 2 })] });
    const next = fakeScene({ meshes: [body({ grid: 64, size: 2 })] });
    const mesh = next.meshes[0];
    if (!mesh) throw new Error("Body has a mesh");
    let coordinateReads = 0;
    mesh.restPositions = new Proxy(mesh.restPositions, {
      get(target, key) {
        if (typeof key === "string" && /^\d+$/.test(key)) coordinateReads++;
        return Reflect.get(target, key, target);
      },
    });
    const index = new Reanchorer([version("v1", previous), version("v2", next)], "v2", next);
    const large = commentOn(previous, "v1", {
      kind: "region",
      mesh: "Hero/Body",
      triangles: [[0, 255]],
      vertices: [[0, 255]],
    });
    expect(index.reanchor(large).anchorState).toBe("moved");
    coordinateReads = 0;
    const tiny = commentOn(previous, "v1", {
      kind: "region",
      mesh: "Hero/Body",
      triangles: [[0, 0]],
      vertices: [[0, 0]],
    });
    expect(index.reanchor(tiny)).toMatchObject({ anchorState: "moved", target: { vertices: [[0, 0]] } });
    expect(coordinateReads).toBeLessThan(mesh.restPositions.length / 20);
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

  describe("after a parent of the mesh was renamed", () => {
    const under = (parent: string, ...meshes: FakeMesh[]) =>
      fakeScene({ bones: [{ name: parent }], meshes: meshes.map((mesh) => ({ ...mesh, parent })) });
    const before = under("Armature", body());
    const onBody = (target: SpatialAnchor): SpatialAnchor => ({ ...target, mesh: "Hero/Armature/Body" });
    const reanchorOnto = (next: SceneDescription, comment: Comment) =>
      new Reanchorer([version("v1", before), version("v2", next)], "v2", next).reanchor(comment);

    it("keeps a pin and a region exactly on the one mesh with the same name and topology at a new path", () => {
      const after = under("Rig", body({ offset: [0, 0, 0.5] }));
      for (const target of [onBody(pin), onBody(region)]) {
        const moved = reanchorOnto(after, commentOn(before, "v1", target));
        expect(moved).toMatchObject({
          target: { ...target, mesh: "Hero/Rig/Body" },
          anchorVersion: "v2",
          anchorState: "exact",
        });
        expect(moved.anchorRestPositions[0]?.[2]).toBe(0.5);
      }
    });

    it("maps a pin by its rest position when the name, the topology or the match is not unique", () => {
      const renamed = under("Rig", body({ name: "Torso" }));
      const changed = under("Rig", body({ flip: true }));
      const twice = fakeScene({
        bones: [{ name: "Rig" }, { name: "Spare" }],
        meshes: [body({ parent: "Rig" }), body({ parent: "Spare" })],
      });
      for (const next of [renamed, changed, twice]) {
        expect(reanchorOnto(next, commentOn(before, "v1", onBody(pin))).anchorState).toBe("moved");
      }
    });

    it("does not take a mesh that the anchor version already had at its own path", () => {
      const both = fakeScene({
        bones: [{ name: "Armature" }, { name: "Rig" }],
        meshes: [body({ parent: "Armature" }), body({ parent: "Rig" })],
      });
      const next = under("Rig", body());
      const moved = new Reanchorer([version("v1", both), version("v2", next)], "v2", next).reanchor(
        commentOn(both, "v1", onBody(pin)),
      );
      expect(moved.anchorState).toBe("moved");
    });

    it("moves the part ids a comment's parts view stores, and leaves the ids it cannot follow", () => {
      const after = under("Rig", body(), body({ name: "Armor", offset: [3, 0, 0] }));
      const original = {
        ...commentOn(before, "v1", null),
        parts: { hidden: ["Hero/Armature/Body", "Hero/Gone"], shown: [], isolated: "Hero/Armature/Body", lod: 0 },
      };
      expect(reanchorOnto(after, original).parts).toEqual({
        hidden: ["Hero/Gone", "Hero/Rig/Body"],
        shown: [],
        isolated: "Hero/Rig/Body",
        lod: 0,
      });
      const kept = { ...original, parts: { hidden: ["Hero/Gone"], shown: [], isolated: null, lod: 0 } };
      expect(reanchorOnto(after, kept)).toBe(kept);
    });

    it("follows a part id renamed twice through the newest version that had it", () => {
      const middle = under("Rig", body());
      const latest = under("Skeleton", body());
      const original = {
        ...commentOn(before, "v1", null),
        parts: { hidden: ["Hero/Rig/Body"], shown: [], isolated: null, lod: 0 },
      };
      const versions = [version("v1", before), version("v2", middle), version("v3", latest)];
      expect(new Reanchorer(versions, "v3", latest).reanchor(original).parts?.hidden).toEqual(["Hero/Skeleton/Body"]);
    });

    it("moves the ids of LOD group nodes and sockets under an ancestor that was renamed with its meshes", () => {
      const lodScene = (bones: FakeBone[], meshes: FakeMesh[]) => {
        const scene = fakeScene({ bones, meshes });
        const group = scene.nodes.findIndex((node) => node.name === "BodyLOD");
        return { ...scene, parts: describeParts(scene.nodes, new Set([group])) };
      };
      const rigged = (parent: string): FakeBone[] => [
        { name: parent },
        { name: "BodyLOD", parent },
        { name: "SOCKET_Hand", parent },
      ];
      const levels = [
        body({ name: "Body_A", parent: "BodyLOD" }),
        body({ name: "Body_B", parent: "BodyLOD", grid: 2 }),
      ];
      const parts = {
        hidden: ["Hero/Armature/BodyLOD", "Hero/Armature/SOCKET_Hand"],
        shown: [],
        isolated: null,
        lod: 1,
      };
      const onto = (before: SceneDescription, next: SceneDescription) => {
        const original = { ...commentOn(before, "v1", null), parts };
        return new Reanchorer([version("v1", before), version("v2", next)], "v2", next).reanchor(original).parts;
      };
      const before = lodScene(rigged("Armature"), levels);
      const after = lodScene(rigged("Rig"), levels);
      expect(after.parts.map((part) => part.id)).toEqual(["Hero/Rig/SOCKET_Hand", "Hero/Rig/BodyLOD"]);
      expect(onto(before, after)).toEqual({ ...parts, hidden: ["Hero/Rig/BodyLOD", "Hero/Rig/SOCKET_Hand"] });

      const armor = body({ name: "Armor", offset: [3, 0, 0] });
      const left = lodScene([...rigged("Rig"), { name: "Armature" }], [...levels, { ...armor, parent: "Armature" }]);
      expect(onto(before, left)).toBe(parts);
      const taken = lodScene([...rigged("Armature"), { name: "Rig" }], [...levels, { ...armor, parent: "Rig" }]);
      expect(onto(taken, lodScene(rigged("Rig"), [...levels, { ...armor, parent: "Rig" }]))).toBe(parts);
      const flat = lodScene(rigged("Armature"), [
        body({ name: "Body_A", parent: "Armature" }),
        body({ name: "Body_B", parent: "Armature", grid: 2 }),
      ]);
      const split = lodScene(
        [...rigged("Rig"), { name: "Skel" }],
        [body({ name: "Body_A", parent: "Rig" }), body({ name: "Body_B", parent: "Skel", grid: 2 })],
      );
      expect(onto(flat, split)).toBe(parts);
    });
  });
});
