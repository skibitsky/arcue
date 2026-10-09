import { describe, expect, it } from "vitest";
import type { Material, Texture, TextureRef } from "./material";
import type { Mesh } from "./mesh";
import type { SceneNode } from "./node";
import type { ScenePart } from "./parts";
import type { SceneDescription } from "./scene";
import type { ImportWarning } from "./source";
import { importWarning } from "./source";
import { subjectMeshes } from "./subject";

function node(name: string, path: string, parent: number, mesh: number | null): SceneNode {
  return {
    name,
    path,
    parent,
    kind: mesh === null ? "empty" : "mesh",
    translation: [0, 0, 0],
    rotation: [0, 0, 0, 1],
    scale: [1, 1, 1],
    mesh,
  };
}

function meshWith(material: number): Mesh {
  return { groups: [{ start: 0, triangleCount: 1, material }] } as Mesh;
}

function material(name: string, baseColorTexture: TextureRef | null = null): Material {
  return { name, baseColorTexture } as Material;
}

function scene(warnings: ImportWarning[] = []): SceneDescription {
  const nodes = [
    node("Armature", "Armature", -1, null),
    node("Body", "Armature/Body", 0, 0),
    node("Eyes", "Armature/Eyes", 0, 1),
    node("Rock", "Rock", -1, 2),
    node("Shell", "Shells.fbx//Shell", -1, 3),
  ];
  const ref: TextureRef = { texture: 0, uvSet: 0, wrapU: "repeat", wrapV: "repeat", transform: null };
  const textures = [{ name: "Rock", storedPath: "Textures/Rock.png", foundPath: "Textures/Rock.png" } as Texture];
  const parts = [{ id: "Rock", levels: [{ level: 0, meshes: [2] }] } as ScenePart];
  return {
    nodes,
    meshes: [meshWith(0), meshWith(1), meshWith(2), meshWith(0)],
    materials: [material("Skin"), material("Eyes"), material("Stone", ref)],
    textures,
    parts,
    source: { warnings },
  } as SceneDescription;
}

describe("subjectMeshes", () => {
  it("finds a material's meshes in every file", () => {
    expect(subjectMeshes(scene(), { kind: "material", name: "Skin" })).toEqual(["Armature/Body", "Shells.fbx//Shell"]);
  });

  it("finds a texture's meshes through the materials that show it or that its warning lists", () => {
    expect(subjectMeshes(scene(), { kind: "texture", name: "Rock.png" })).toEqual(["Rock"]);
    const missing = importWarning(
      "texture-not-found",
      { kind: "texture", name: "Eyes.png" },
      "Texture not found",
      undefined,
      {
        materials: ["Eyes"],
      },
    );
    expect(subjectMeshes(scene([missing]), { kind: "texture", name: "Eyes.png" })).toEqual(["Armature/Eyes"]);
  });

  it("finds the meshes under a node by path or name, and a part's meshes by id", () => {
    expect(subjectMeshes(scene(), { kind: "node", name: "Armature" })).toEqual(["Armature/Body", "Armature/Eyes"]);
    expect(subjectMeshes(scene(), { kind: "node", name: "Eyes" })).toEqual(["Armature/Eyes"]);
    expect(subjectMeshes(scene(), { kind: "node", name: "Rock" })).toEqual(["Rock"]);
    expect(subjectMeshes(scene(), { kind: "node", name: "Shell", file: "Shells.fbx" })).toEqual(["Shells.fbx//Shell"]);
  });

  it("finds a composition file's meshes, or the model's own without a file", () => {
    expect(subjectMeshes(scene(), { kind: "file", name: "Shells.fbx", file: "Shells.fbx" })).toEqual([
      "Shells.fbx//Shell",
    ]);
    expect(subjectMeshes(scene(), { kind: "file", name: "Missing.fbx", file: "Missing.fbx" })).toEqual([]);
    expect(subjectMeshes(scene(), { kind: "file", name: "Hero.fbx" })).toEqual([
      "Armature/Body",
      "Armature/Eyes",
      "Rock",
    ]);
  });

  it("finds nothing for a clip", () => {
    expect(subjectMeshes(scene(), { kind: "clip", name: "Armature|Walk" })).toEqual([]);
  });
});
