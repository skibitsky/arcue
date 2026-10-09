import type { RegionAnchor, SceneDescription, SurfaceAnchor } from "@arcue/scene";
import { describe, expect, it } from "vitest";
import { AnchorError, anchorContext, anchorVertices, boneShares, nearestAncestorBone, rankBones } from "./context";
import { poseAt, worldMatrices } from "./pose";
import { jointMatrices, meshSkinMatrices, posedVertex, representativeVertices } from "./skinning";
import { stripScene } from "./test-fixture";

const wholeStrip: RegionAnchor = { kind: "region", mesh: "Strip", triangles: [[0, 3]], vertices: [[0, 5]] };

function fixture(): { scene: SceneDescription; mesh: SceneDescription["meshes"][number]; reps: Int32Array } {
  const scene = stripScene();
  const mesh = scene.meshes[0];
  if (!mesh) throw new Error("fixture");
  return { scene, mesh, reps: representativeVertices(mesh.sourceVertex, mesh.sourceVertexCount) };
}

describe("anchorVertices", () => {
  it("merges repeated corners of a point", () => {
    const { mesh } = fixture();
    const anchor: SurfaceAnchor = { kind: "surface", mesh: "Strip", vertices: [2, 2, 3], weights: [0.25, 0.25, 0.5] };
    const target = anchorVertices(anchor, mesh);
    expect([...target.vertices]).toEqual([2, 3]);
    expect([...target.weights]).toEqual([0.5, 0.5]);
  });

  it("refuses vertices outside the mesh", () => {
    const { mesh } = fixture();
    const anchor: RegionAnchor = { ...wholeStrip, vertices: [[0, 9]] };
    expect(() => anchorVertices(anchor, mesh)).toThrow(AnchorError);
  });
});

describe("boneShares", () => {
  it("splits a region's weight by its vertices, each counted once", () => {
    const { scene, mesh, reps } = fixture();
    const shares = boneShares(scene, mesh, 4, anchorVertices(wholeStrip, mesh), reps);
    expect(shares.get(1)).toBeCloseTo(0.5, 9);
    expect(shares.get(2)).toBeCloseTo(0.5, 9);
  });

  it("weights a point's corners by its barycentric weights", () => {
    const { scene, mesh, reps } = fixture();
    const anchor: SurfaceAnchor = { kind: "surface", mesh: "Strip", vertices: [2, 3, 5], weights: [0.25, 0.25, 0.5] };
    const shares = boneShares(scene, mesh, 4, anchorVertices(anchor, mesh), reps);
    expect(shares.get(1)).toBeCloseTo(0.25, 9);
    expect(shares.get(2)).toBeCloseTo(0.75, 9);
  });

  it("falls back to the render influences without source weights", () => {
    const { scene, mesh, reps } = fixture();
    const anchor: SurfaceAnchor = { kind: "surface", mesh: "Strip", vertices: [0, 2, 4], weights: [0.5, 0.25, 0.25] };
    const shares = boneShares(scene, { ...mesh, skinWeights: null }, 4, anchorVertices(anchor, mesh), reps);
    expect(shares.get(1)).toBeCloseTo(0.625, 9);
    expect(shares.get(2)).toBeCloseTo(0.375, 9);
  });

  it("gives a rigid mesh its nearest ancestor bone", () => {
    const { scene, mesh, reps } = fixture();
    const strip = scene.nodes[4];
    if (!strip) throw new Error("fixture");
    scene.nodes.push({ ...strip, name: "Gem", path: "Armature/Root/Tip/Gem", parent: 2 });
    expect(nearestAncestorBone(scene.nodes, 5)).toBe(2);
    const shares = boneShares(scene, { ...mesh, skeleton: null }, 5, anchorVertices(wholeStrip, mesh), reps);
    expect([...shares]).toEqual([[2, 1]]);
  });
});

describe("rankBones", () => {
  it("orders by share, drops tiny shares and rounds", () => {
    const { scene } = fixture();
    const ranked = rankBones(
      new Map([
        [1, 0.3141592],
        [2, 0.6808408],
        [3, 0.005],
      ]),
      scene.nodes,
    );
    expect(ranked.map(({ bone }) => bone)).toEqual([
      { name: "Tip", share: 0.681 },
      { name: "Root", share: 0.314 },
    ]);
  });
});

describe("anchorContext", () => {
  it("gives the centroid at rest and posed, and the moving joints' positions at the time", () => {
    const { scene, mesh, reps } = fixture();
    const pose = poseAt(scene, scene.clips[0] ?? null, 1);
    const worlds = worldMatrices(scene.nodes, pose);
    const skeleton = scene.skeletons[0];
    if (!skeleton || !mesh.bindMatrix) throw new Error("fixture");
    const meshPose = {
      skin: meshSkinMatrices(jointMatrices(skeleton, worlds), mesh.bindMatrix),
      bindMatrix: mesh.bindMatrix,
      nodeWorld: worlds.subarray(64, 80),
      morphWeights: new Float32Array(1),
    };
    const anchor: RegionAnchor = { kind: "region", mesh: "Strip", triangles: [[2, 3]], vertices: [[4, 5]] };
    const context = anchorContext({
      scene,
      mesh,
      meshNode: 4,
      target: anchorVertices(anchor, mesh),
      representatives: reps,
      worlds,
      posedSource: (vertex, out) => posedVertex(mesh, reps[vertex] ?? 0, meshPose, out),
    });
    expect(context.vertexCount).toBe(2);
    expect(context.bones).toEqual([{ name: "Tip", share: 1 }]);
    expect(context.centroid?.rest).toEqual([0, 2, 0]);
    expect(context.centroid?.posed).toEqual([-1, 1, 0]);
    expect(context.joints).toEqual([{ name: "Tip", path: "Armature/Root/Tip", position: [0, 1, 0] }]);
  });
});
