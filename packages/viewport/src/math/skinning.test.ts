import type { SceneDescription } from "@arcue/scene";
import { describe, expect, it } from "vitest";
import { poseAt, worldMatrices } from "./pose";
import type { MeshPose } from "./skinning";
import { jointMatrices, meshSkinMatrices, PosedVertexCache, posedVertex, representativeVertices } from "./skinning";
import { stripScene } from "./test-fixture";

function meshPose(scene: SceneDescription, clipName: string | null, seconds: number): MeshPose {
  const clip = scene.clips.find((candidate) => candidate.name === clipName) ?? null;
  const pose = poseAt(scene, clip, seconds);
  const worlds = worldMatrices(scene.nodes, pose);
  const mesh = scene.meshes[0];
  const skeleton = scene.skeletons[0];
  if (!mesh?.bindMatrix || !skeleton) throw new Error("fixture");
  return {
    skin: meshSkinMatrices(jointMatrices(skeleton, worlds), mesh.bindMatrix),
    bindMatrix: mesh.bindMatrix,
    nodeWorld: worlds.subarray(4 * 16, 5 * 16),
    morphWeights: pose.morphWeights[0] ?? new Float32Array(),
  };
}

function posed(scene: SceneDescription, pose: MeshPose, vertex: number): number[] {
  const mesh = scene.meshes[0];
  if (!mesh) throw new Error("fixture");
  const out = [0, 0, 0];
  posedVertex(mesh, vertex, pose, out);
  return out;
}

describe("posedVertex", () => {
  it("reproduces the rest positions in the rest pose, through the bind matrix", () => {
    const scene = stripScene();
    const pose = meshPose(scene, null, 0);
    const mesh = scene.meshes[0];
    mesh?.sourceVertex.forEach((source, rendered) => {
      const expected = [...(mesh.restPositions.subarray(source * 3, source * 3 + 3) ?? [])];
      posed(scene, pose, rendered).forEach((value, axis) => {
        expect(value).toBeCloseTo(expected[axis] ?? Number.NaN, 6);
      });
    });
  });

  it("follows a single joint after its morph offset, and blends two joints by weight", () => {
    const scene = stripScene();
    const pose = meshPose(scene, "Armature|Bend", 1);
    const tip = posed(scene, pose, 5);
    expect(tip[0]).toBeCloseTo(-1, 6);
    expect(tip[1]).toBeCloseTo(1 + 0.1 + 0.1, 6);
    const middle = posed(scene, pose, 3);
    expect(middle[0]).toBeCloseTo(0.05, 6);
    expect(middle[1]).toBeCloseTo(1.05, 6);
    expect(posed(scene, pose, 0)).toEqual([expect.closeTo(-0.1, 6), expect.closeTo(0, 6), expect.closeTo(0, 6)]);
  });

  it("applies morph offsets in local space before skinning", () => {
    const scene = stripScene();
    const halfway = meshPose(scene, "Armature|Bend", 0);
    halfway.morphWeights[0] = 1;
    const bulged = posed(scene, halfway, 5);
    expect(bulged[0]).toBeCloseTo(0.2, 6);
    expect(bulged[1]).toBeCloseTo(2, 6);
  });

  it("places a rigid mesh with its node's world matrix", () => {
    const scene = stripScene();
    const mesh = scene.meshes[0];
    if (!mesh) throw new Error("fixture");
    const rigid = { ...mesh, joints: null, weights: null };
    const out = [0, 0, 0];
    const nodeWorld = [0.01, 0, 0, 0, 0, 0.01, 0, 0, 0, 0, 0.01, 0, 1, 2, 3, 1];
    posedVertex(rigid, 1, { skin: null, bindMatrix: null, nodeWorld, morphWeights: new Float32Array(1) }, out);
    expect(out).toEqual([expect.closeTo(1.1, 6), expect.closeTo(1.5, 6), expect.closeTo(3, 6)]);
  });
});

describe("PosedVertexCache", () => {
  it("recomputes vertices after the pose changes", () => {
    const scene = stripScene();
    const mesh = scene.meshes[0];
    if (!mesh) throw new Error("fixture");
    const cache = new PosedVertexCache(mesh);
    const out = [0, 0, 0];
    cache.setPose(meshPose(scene, null, 0));
    cache.get(5, out);
    expect(out[0]).toBeCloseTo(0.1, 6);
    cache.setPose(meshPose(scene, "Armature|Bend", 1));
    cache.get(5, out);
    expect(out[0]).toBeCloseTo(-1, 6);
  });
});

describe("representativeVertices", () => {
  it("maps each source vertex to its first rendered vertex", () => {
    const scene = stripScene();
    const mesh = scene.meshes[0];
    if (!mesh) throw new Error("fixture");
    expect([...representativeVertices(mesh.sourceVertex, 7)]).toEqual([0, 1, 2, 3, 4, 5, -1]);
  });
});
