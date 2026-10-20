import { describe, expect, it } from "vitest";
import type { SceneNode } from "./node";
import { skeletonNodes } from "./skeleton";

function node(name: string, parent: number, kind: SceneNode["kind"]): SceneNode {
  return {
    name,
    path: name,
    parent,
    kind,
    translation: [0, 0, 0],
    rotation: [0, 0, 0, 1],
    scale: [1, 1, 1],
    mesh: kind === "mesh" ? 0 : null,
  };
}

describe("skeletonNodes", () => {
  it("lists bones and skin joints in node order", () => {
    const nodes = [
      node("Armature", -1, "empty"),
      node("Hips", 0, "bone"),
      node("Prop", 1, "empty"),
      node("Body", 0, "mesh"),
    ];
    const skeletons = [{ joints: [2, 1], inverseBindMatrices: new Float32Array(32) }];
    expect(skeletonNodes({ nodes, skeletons })).toEqual([1, 2]);
  });

  it("is empty for a model without bones or skins", () => {
    expect(skeletonNodes({ nodes: [node("Rock", -1, "mesh")], skeletons: [] })).toEqual([]);
  });
});
