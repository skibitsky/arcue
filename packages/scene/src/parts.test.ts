import { describe, expect, it } from "vitest";
import { buildNodePaths } from "./node";
import type { PartNode, ScenePart } from "./parts";
import {
  defaultPartView,
  defaultViewBounds,
  describeParts,
  isDefaultPartView,
  isolationAsVisibility,
  levelFor,
  lodLevels,
  partRoleOf,
  viewBounds,
  visibleMeshes,
  withPartVisible,
} from "./parts";

function nodes(list: { name: string; parent: number; mesh?: number }[]): PartNode[] {
  const paths = buildNodePaths(list);
  return list.map((node, index) => ({
    name: node.name,
    parent: node.parent,
    path: paths[index] ?? node.name,
    mesh: node.mesh ?? null,
  }));
}

function part(parts: readonly ScenePart[], id: string): ScenePart {
  const found = parts.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`no part ${id}`);
  return found;
}

describe("partRoleOf", () => {
  it("reads collision and socket prefixes", () => {
    expect(partRoleOf("UCX_Body")).toBe("collision");
    expect(partRoleOf("UBX_Box_01")).toBe("collision");
    expect(partRoleOf("USP_Head")).toBe("collision");
    expect(partRoleOf("UCP_Tail")).toBe("collision");
    expect(partRoleOf("SOCKET_Hand_R")).toBe("socket");
    expect(partRoleOf("Body")).toBe("model");
    expect(partRoleOf("ucx_Body")).toBe("model");
  });
});

describe("describeParts", () => {
  it("makes one part per mesh when no rule applies", () => {
    const parts = describeParts(
      nodes([
        { name: "Root", parent: -1 },
        { name: "Body", parent: 0, mesh: 0 },
        { name: "Eyes", parent: 0, mesh: 1 },
      ]),
    );
    expect(parts).toEqual([
      { id: "Root/Body", name: "Body", role: "model", node: 1, levels: [{ level: 0, meshes: [0] }] },
      { id: "Root/Eyes", name: "Eyes", role: "model", node: 2, levels: [{ level: 0, meshes: [1] }] },
    ]);
  });

  it("groups siblings by a case-insensitive LOD suffix under the lowest level's path", () => {
    const parts = describeParts(
      nodes([
        { name: "Body_LOD1", parent: -1, mesh: 0 },
        { name: "Body_lod0", parent: -1, mesh: 1 },
        { name: "Body_LOD2", parent: -1, mesh: 2 },
        { name: "Cap_LOD0", parent: -1, mesh: 3 },
      ]),
    );
    expect(parts).toEqual([
      {
        id: "Body_lod0",
        name: "Body",
        role: "model",
        node: 1,
        levels: [
          { level: 0, meshes: [1] },
          { level: 1, meshes: [0] },
          { level: 2, meshes: [2] },
        ],
      },
      { id: "Cap_LOD0", name: "Cap", role: "model", node: 3, levels: [{ level: 0, meshes: [3] }] },
    ]);
  });

  it("keeps same-named LOD meshes under different parents apart", () => {
    const parts = describeParts(
      nodes([
        { name: "A", parent: -1 },
        { name: "B", parent: -1 },
        { name: "Rock_LOD0", parent: 0, mesh: 0 },
        { name: "Rock_LOD0", parent: 1, mesh: 1 },
      ]),
    );
    expect(parts.map((entry) => entry.id)).toEqual(["A/Rock_LOD0", "B/Rock_LOD0"]);
  });

  it("takes levels from a LOD group node's child order, including meshes nested below a child", () => {
    const parts = describeParts(
      nodes([
        { name: "Striker", parent: -1 },
        { name: "High", parent: 0 },
        { name: "Body", parent: 1, mesh: 0 },
        { name: "Armor", parent: 1, mesh: 1 },
        { name: "Low", parent: 0, mesh: 2 },
      ]),
      new Set([0]),
    );
    expect(parts).toEqual([
      {
        id: "Striker",
        name: "Striker",
        role: "model",
        node: 0,
        levels: [
          { level: 0, meshes: [0, 1] },
          { level: 1, meshes: [2] },
        ],
      },
    ]);
  });

  it("lets collision and socket prefixes win over LOD membership", () => {
    const parts = describeParts(
      nodes([
        { name: "Group", parent: -1 },
        { name: "Body_LOD0", parent: 0, mesh: 0 },
        { name: "UCX_Body_LOD0", parent: 0, mesh: 1 },
        { name: "SOCKET_Weapon", parent: 0 },
        { name: "SOCKET_Light", parent: 0, mesh: 2 },
      ]),
      new Set([0]),
    );
    expect(parts.map(({ id, role, levels }) => ({ id, role, levels }))).toEqual([
      { id: "Group", role: "model", levels: [{ level: 0, meshes: [0] }] },
      { id: "Group/UCX_Body_LOD0", role: "collision", levels: [{ level: 0, meshes: [1] }] },
      { id: "Group/SOCKET_Weapon", role: "socket", levels: [] },
      { id: "Group/SOCKET_Light", role: "socket", levels: [{ level: 0, meshes: [2] }] },
    ]);
  });

  it("puts every mesh in exactly one part", () => {
    const parts = describeParts(
      nodes([
        { name: "Body_LOD0", parent: -1, mesh: 0 },
        { name: "Body_LOD1", parent: -1, mesh: 1 },
        { name: "UCX_Body", parent: -1, mesh: 2 },
        { name: "Prop", parent: -1, mesh: 3 },
      ]),
    );
    const meshes = parts.flatMap((entry) => entry.levels.flatMap((level) => level.meshes)).sort();
    expect(meshes).toEqual([0, 1, 2, 3]);
  });
});

describe("part views", () => {
  const parts = describeParts(
    nodes([
      { name: "Body_LOD0", parent: -1, mesh: 0 },
      { name: "Body_LOD1", parent: -1, mesh: 1 },
      { name: "Body_LOD3", parent: -1, mesh: 2 },
      { name: "UCX_Body", parent: -1, mesh: 3 },
      { name: "Boulder2", parent: -1, mesh: 4 },
      { name: "SOCKET_Hand", parent: -1, mesh: 5 },
    ]),
  );
  const body = part(parts, "Body_LOD0");
  const collision = part(parts, "UCX_Body");
  const boulder = part(parts, "Boulder2");

  it("draws LOD0, no collision helpers and no socket meshes by default", () => {
    expect([...visibleMeshes(parts)].sort()).toEqual([0, 4]);
    expect(isDefaultPartView(defaultPartView())).toBe(true);
  });

  it("draws every mesh of a model without roles", () => {
    const plain = describeParts(
      nodes([
        { name: "A", parent: -1, mesh: 0 },
        { name: "B", parent: -1, mesh: 1 },
      ]),
    );
    expect([...visibleMeshes(plain)].sort()).toEqual([0, 1]);
  });

  it("shows the highest level not above the chosen LOD", () => {
    expect(levelFor(body, 2)?.level).toBe(1);
    expect(levelFor(body, 9)?.level).toBe(3);
    expect(levelFor(boulder, 2)?.level).toBe(0);
    expect([...visibleMeshes(parts, { ...defaultPartView(), lod: 2 })].sort()).toEqual([1, 4]);
    expect(lodLevels(parts)).toEqual([0, 1, 3]);
  });

  it("records only visibility that differs from a part's default", () => {
    let view = withPartVisible(defaultPartView(), boulder, false);
    view = withPartVisible(view, collision, true);
    expect(view).toEqual({ hidden: ["Boulder2"], shown: ["UCX_Body"], isolated: null, lod: 0 });
    expect([...visibleMeshes(parts, view)].sort()).toEqual([0, 3]);
    view = withPartVisible(withPartVisible(view, boulder, true), collision, false);
    expect(isDefaultPartView(view)).toBe(true);
  });

  it("draws only an isolated part, even one hidden by default", () => {
    const hiddenBody = withPartVisible(defaultPartView(), body, false);
    expect([...visibleMeshes(parts, { ...hiddenBody, isolated: "Body_LOD0", lod: 1 })]).toEqual([1]);
    expect([...visibleMeshes(parts, { ...defaultPartView(), isolated: "UCX_Body" })]).toEqual([3]);
  });

  it("ignores an isolated part the scene does not have", () => {
    expect([...visibleMeshes(parts, { ...defaultPartView(), isolated: "Gone" })].sort()).toEqual([0, 4]);
  });

  it("turns an isolated view into visibility overrides that draw the same meshes", () => {
    const isolated = { ...withPartVisible(defaultPartView(), boulder, false), isolated: "UCX_Body", lod: 1 };
    const kept = isolationAsVisibility(parts, isolated);
    expect(kept).toEqual({ hidden: ["Body_LOD0", "Boulder2"], shown: ["UCX_Body"], isolated: null, lod: 1 });
    expect(visibleMeshes(parts, kept)).toEqual(visibleMeshes(parts, isolated));
    expect(isolationAsVisibility(parts, { ...defaultPartView(), isolated: "Gone" })).toEqual(defaultPartView());
    expect(isolationAsVisibility(parts, kept)).toBe(kept);
  });

  it("bounds what a view draws, and nothing when it draws nothing", () => {
    const at = (x: number) => ({ restPositions: Float32Array.of(x, 0, 0, x, 2 + x, 0) });
    const meshes = [at(0), at(5), at(6), at(-9), at(1), at(20)];
    expect(viewBounds(meshes, parts, { ...defaultPartView(), lod: 1 })).toEqual({ min: [1, 0, 0], max: [5, 7, 0] });
    expect(viewBounds(meshes, parts, { ...defaultPartView(), hidden: ["Body_LOD0", "Boulder2"] })).toBeNull();
  });

  it("bounds what a default view draws", () => {
    const at = (x: number) => ({ restPositions: Float32Array.of(x, 0, 0, x, 1, 0) });
    const meshes = [at(0), at(5), at(6), at(-9), at(1), at(20)];
    expect(defaultViewBounds(meshes, parts)).toEqual({ min: [0, 0, 0], max: [1, 1, 0] });
    expect(defaultViewBounds([at(-9)], describeParts(nodes([{ name: "UCX_A", parent: -1, mesh: 0 }])))).toEqual({
      min: [-9, 0, 0],
      max: [-9, 1, 0],
    });
  });
});
