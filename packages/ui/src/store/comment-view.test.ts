import type { PartView } from "@arcue/protocol";
import type { SceneDescription, ScenePart, SpatialAnchor } from "@arcue/scene";
import { describe, expect, it } from "vitest";
import { fakeScene, STONE_RESONATOR } from "../../dev/sample-data";
import { commentPartView, withMeshShown } from "./comment-view";

const defaultView: PartView = { hidden: [], shown: [], isolated: null, lod: 0 };

function part(id: string, levels: number[][], extra: Partial<ScenePart> = {}): ScenePart {
  return { id, name: id, role: "model", node: 0, levels: levels.map((meshes, level) => ({ level, meshes })), ...extra };
}

/** Body with LOD0 and LOD1 on meshes 0 and 1, Armor on mesh 2 hidden by default, and a socket on mesh 3. */
const parts = [
  part("Body", [[0], [1]]),
  part("Armor", [[2]], { hiddenByDefault: true }),
  part("SOCKET_Hand", [[3]], { role: "socket" }),
];

describe("withMeshShown", () => {
  it("returns the view itself when it draws the mesh already", () => {
    const view = { ...defaultView, shown: ["Armor"] };
    expect(withMeshShown(parts, view, 2)).toBe(view);
    expect(withMeshShown(parts, defaultView, 0)).toBe(defaultView);
  });

  it("shows a part hidden by default or hidden by the view", () => {
    expect(withMeshShown(parts, defaultView, 2)).toEqual({ ...defaultView, shown: ["Armor"] });
    expect(withMeshShown(parts, { ...defaultView, hidden: ["Body"] }, 0)).toEqual(defaultView);
  });

  it("ends an isolation of another part, keeping what it shows", () => {
    const both = { ...defaultView, shown: ["Armor"] };
    expect(withMeshShown(parts, { ...defaultView, isolated: "Armor" }, 0)).toEqual(both);
    expect(withMeshShown(parts, { ...defaultView, isolated: "Body" }, 2)).toEqual(both);
  });

  it("picks the level that holds the mesh, and leaves meshes no drawn part holds", () => {
    expect(withMeshShown(parts, defaultView, 1)).toEqual({ ...defaultView, lod: 1 });
    expect(withMeshShown(parts, { ...defaultView, lod: 1 }, 0)).toEqual(defaultView);
    expect(withMeshShown(parts, defaultView, 3)).toBe(defaultView);
    expect(withMeshShown(parts, defaultView, 9)).toBe(defaultView);
  });
});

describe("commentPartView", () => {
  const base = fakeScene(STONE_RESONATOR);
  const mesh = base.nodes.find((node) => node.mesh === 0);
  if (!mesh) throw new Error("The stone has a mesh.");
  const hidden: SceneDescription = {
    ...base,
    parts: base.parts.map((entry) => ({ ...entry, hiddenByDefault: true })),
  };
  const target: SpatialAnchor = { kind: "surface", mesh: mesh.path, vertices: [0, 1, 2], weights: [1, 0, 0] };
  const partId = base.parts[0]?.id ?? "";

  it("shows the part of the comment's target after the file hid it by default", () => {
    expect(commentPartView(hidden, { target })).toEqual({ ...defaultView, shown: [partId] });
    expect(commentPartView(base, { target })).toEqual(defaultView);
  });

  it("keeps the stored view for a comment without a target, or one whose mesh the scene lacks", () => {
    const stored = { ...defaultView, lod: 1 };
    expect(commentPartView(hidden, { target: null, parts: stored })).toBe(stored);
    expect(commentPartView(hidden, { target: { ...target, mesh: "Gone" }, parts: stored })).toBe(stored);
    expect(commentPartView(null, { target, parts: stored })).toBe(stored);
  });
});
