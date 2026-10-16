import type { Clip, SceneNode, ScenePart, TopologyFingerprint } from "@arcue/scene";
import { describe, expect, it } from "vitest";
import { commands } from "./commands";
import { animatesModel, compositionFileSchema, joinsByName, keysModelBones, memberRoles } from "./composition";
import { assetVersionSchema } from "./review";

const bug = {
  version: 1,
  animations: ["Animations/BoulderBugTurns.fbx"],
  attach: [
    { file: "BoulderBugShells.fbx", node: "Boulder1", bone: "Body" },
    { file: "BoulderBugShells.fbx", node: "Boulder2", bone: "Body" },
    { file: "../Props/Rock.fbx" },
  ],
  materials: {
    LegStone: { baseColor: "../Textures/LegStone_BaseColor.png", normal: "../Textures/LegStone_Normal.png" },
  },
  hidden: ["BoulderBugShells.fbx//Boulder2"],
};

describe("compositionFileSchema", () => {
  it("accepts a composition with every field, and one with only its version", () => {
    expect(compositionFileSchema.parse(bug)).toEqual(bug);
    expect(compositionFileSchema.parse({ version: 1 })).toEqual({ version: 1 });
  });

  it("rejects other versions and unknown fields, so a typo does not pass unnoticed", () => {
    expect(compositionFileSchema.safeParse({ ...bug, version: 2 }).success).toBe(false);
    expect(compositionFileSchema.safeParse({ ...bug, animation: [] }).success).toBe(false);
    expect(compositionFileSchema.safeParse({ ...bug, model: "BoulderBug.fbx" }).success).toBe(false);
    expect(compositionFileSchema.safeParse({ ...bug, attach: [{ file: "A.fbx", parent: "Body" }] }).success).toBe(
      false,
    );
    expect(compositionFileSchema.safeParse({ ...bug, materials: { LegStone: { albedo: "a.png" } } }).success).toBe(
      false,
    );
  });

  it("takes only relative paths with forward slashes and no empty segments", () => {
    for (const file of ["/work/Bug.fbx", "C:/work/Bug.fbx", "Models\\Bug.fbx", "Models//Bug.fbx", "Models/", ""]) {
      expect(compositionFileSchema.safeParse({ version: 1, animations: [file] }).success, file).toBe(false);
    }
    expect(compositionFileSchema.safeParse({ version: 1, animations: ["./Models/../Bug.fbx"] }).success).toBe(true);
  });

  it("rejects a file, node or hidden part listed twice", () => {
    const twice = (field: object) => compositionFileSchema.safeParse({ ...bug, ...field }).success;
    expect(twice({ animations: ["A.fbx", "A.fbx"] })).toBe(false);
    expect(
      twice({
        attach: [
          { file: "A.fbx", node: "N" },
          { file: "A.fbx", node: "N", bone: "Body" },
        ],
      }),
    ).toBe(false);
    expect(
      twice({
        attach: [
          { file: "A.fbx", node: "N" },
          { file: "A.fbx", node: "M" },
        ],
      }),
    ).toBe(true);
    expect(twice({ hidden: ["A.fbx//N", "A.fbx//N"] })).toBe(false);
  });
});

describe("composition commands", () => {
  it("require a bone exactly for an attached file, and no node for an animation file", () => {
    const add = (input: object) =>
      commands["composition.addFile"].input.safeParse({ assetId: "a1", file: "Shells.fbx", ...input }).success;
    expect(add({ role: "attach", bone: "Body", node: "Boulder1" })).toBe(true);
    expect(add({ role: "attach" })).toBe(false);
    expect(add({ role: "set", bone: "Body" })).toBe(false);
    expect(add({ role: "set", node: "Rock" })).toBe(true);
    expect(add({ role: "animation" })).toBe(true);
    expect(add({ role: "animation", node: "Armature" })).toBe(false);
  });

  it("take a texture slot by name, and null to remove an override", () => {
    const set = (input: object) =>
      commands["material.setTexture"].input.safeParse({ assetId: "a1", material: "Stone", ...input }).success;
    expect(set({ slot: "baseColor", file: "Stone.png" })).toBe(true);
    expect(set({ slot: "normal", file: null })).toBe(true);
    expect(set({ slot: "albedo", file: "Stone.png" })).toBe(false);
  });
});

describe("assetVersionSchema", () => {
  it("keeps each file of a composition with its own version", () => {
    const version = {
      id: "3f9a2c1",
      fileModifiedAt: "2026-10-08T14:02:00.000Z",
      loadedAt: "2026-10-08T14:02:00.000Z",
      exporter: null,
      meshes: [],
      files: [
        { file: "Bug.fbx", id: "1a2b3c4" },
        { file: "BugShells.fbx", id: "5d6e7f8" },
      ],
    };
    expect(assetVersionSchema.parse(version)).toEqual(version);
  });
});

function node(name: string, kind: SceneNode["kind"], path = `Rig/${name}`): SceneNode {
  return {
    name,
    path,
    parent: -1,
    kind,
    translation: [0, 0, 0],
    rotation: [0, 0, 0, 1],
    scale: [1, 1, 1],
    mesh: null,
  };
}

function clipKeying(nodes: readonly number[], held: readonly number[] = []): Clip {
  const track = (index: number, isHeld: boolean) => ({
    node: index,
    property: "rotation" as const,
    interpolation: "linear" as const,
    times: Float32Array.of(0),
    values: Float32Array.of(0, 0, 0, 1),
    ...(isHeld ? { held: true } : {}),
  });
  return {
    name: "Rig|Wave",
    displayName: "Wave",
    fps: 24,
    duration: 1,
    frameCount: 25,
    tracks: [...nodes.map((index) => track(index, false)), ...held.map((index) => track(index, true))],
    keyTimes: new Float32Array(),
    keyedEveryFrame: false,
  };
}

interface FakeScene {
  nodes: SceneNode[];
  meshes: { topology: TopologyFingerprint; skeleton: number | null }[];
  parts: ScenePart[];
  clips: Clip[];
}

function rig(names: readonly string[], clips: Clip[] = []): FakeScene {
  return { nodes: names.map((name) => node(name, "bone")), meshes: [], parts: [], clips };
}

interface MeshOptions {
  /** Hides the part by default, as Blender's eye does. */
  hidden?: boolean;
  skinned?: boolean;
  role?: ScenePart["role"];
}

/** Adds one part with a mesh for each of `hashes`, its LOD levels from 0, named `name` or "<name>_LOD<level>". */
function withMesh(scene: FakeScene, name: string, hashes: string | string[], options: MeshOptions = {}): FakeScene {
  const levels = typeof hashes === "string" ? [hashes] : hashes;
  const nodes = levels.map((_, level) => ({
    ...node(levels.length > 1 ? `${name}_LOD${level}` : name, "mesh"),
    mesh: scene.meshes.length + level,
  }));
  const part: ScenePart = {
    id: nodes[0]?.path ?? name,
    name,
    role: options.role ?? "model",
    node: scene.nodes.length,
    levels: nodes.map((entry, level) => ({ level, meshes: [entry.mesh] })),
    ...(options.hidden ? { hiddenByDefault: true } : {}),
  };
  const meshes = levels.map((hash) => ({
    topology: { sourceVertexCount: 8, triangleCount: 12, hash },
    skeleton: options.skinned ? 0 : null,
  }));
  return {
    ...scene,
    nodes: [...scene.nodes, ...nodes],
    meshes: [...scene.meshes, ...meshes],
    parts: [...scene.parts, part],
  };
}

describe("memberRoles", () => {
  const content = { keysModelBones: false, animatesModel: false };

  it("makes a file with clips and no meshes an animation file, and one with meshes and no clips a set file", () => {
    expect(memberRoles({ ...content, meshes: 0, clips: 2 })).toEqual({ role: "animation", roles: ["animation"] });
    expect(memberRoles({ ...content, meshes: 3, clips: 0 })).toEqual({ role: "set", roles: ["set"] });
    expect(memberRoles({ ...content, meshes: 0, clips: 0 })).toBeNull();
  });

  it("decides a file with meshes and clips by whether it animates the model, and offers the other role", () => {
    const both = { meshes: 1, clips: 1 };
    expect(memberRoles({ ...both, keysModelBones: true, animatesModel: true })).toEqual({
      role: "animation",
      roles: ["animation", "set"],
    });
    expect(memberRoles({ ...both, keysModelBones: true, animatesModel: false })).toEqual({
      role: "set",
      roles: ["set", "animation"],
    });
    expect(memberRoles({ ...both, keysModelBones: false, animatesModel: false })).toEqual({
      role: "set",
      roles: ["set"],
    });
  });
});

describe("keysModelBones", () => {
  const model = { nodes: [...rig(["Root", "Arm", "Hand"]).nodes, node("Strap", "bone", "Shield.fbx//Rig/Strap")] };

  it("is true when most bones the clips key are the model's own bones by name", () => {
    expect(keysModelBones(rig(["Root", "Arm"], [clipKeying([0, 1])]), model)).toBe(true);
    expect(keysModelBones(rig(["Root", "Arm", "Ctrl"], [clipKeying([0, 1, 2])]), model)).toBe(true);
  });

  it("is false for a prop whose rig shares a bone name, for bones of another file, and for clips that key no bone", () => {
    expect(keysModelBones(rig(["Root", "Lid"], [clipKeying([0, 1])]), model)).toBe(false);
    expect(keysModelBones(rig(["Strap"], [clipKeying([0])]), model)).toBe(false);
    const door = { nodes: [node("Door", "mesh")], clips: [clipKeying([0])] };
    expect(keysModelBones(door, { nodes: [node("Door", "bone")] })).toBe(false);
    expect(keysModelBones(rig(["Root", "Lid"], [clipKeying([1], [0])]), model)).toBe(false);
    expect(keysModelBones(rig(["Root"]), model)).toBe(false);
  });
});

describe("animatesModel", () => {
  const skinned = { skinned: true };
  const model = withMesh(rig(["Root", "Arm", "Hand"]), "Body", "body", skinned);
  const anims = rig(["Root", "Arm"], [clipKeying([0, 1])]);
  const body = withMesh(anims, "Body", "body", skinned);

  it("takes meshes that copy the model's by name or by topology, and refuses an outfit that brings its own", () => {
    expect(animatesModel(anims, model)).toBe(true);
    expect(animatesModel(body, model)).toBe(true);
    expect(animatesModel(withMesh(anims, "Body", "renamed", skinned), model)).toBe(true);
    expect(animatesModel(withMesh(anims, "Body.001", "body", skinned), model)).toBe(true);
    expect(animatesModel(withMesh(anims, "Jacket", "jacket", skinned), model)).toBe(false);
    expect(animatesModel(withMesh(rig(["Root", "Lid"], [clipKeying([0, 1])]), "Body", "body"), model)).toBe(false);
    const onlyMember = model.nodes.map((entry) =>
      entry.mesh === null ? entry : { ...entry, path: "Shield.fbx//Body" },
    );
    expect(animatesModel(body, { ...model, nodes: onlyMember })).toBe(false);
  });

  it("leaves out the meshes the file hides, such as a rig's bone shapes and collision helpers", () => {
    expect(animatesModel(withMesh(body, "WGT-Arm", "widget", { hidden: true }), model)).toBe(true);
    expect(animatesModel(withMesh(anims, "WGT-Arm", "widget", { hidden: true }), model)).toBe(true);
    expect(animatesModel(withMesh(anims, "WGT-Arm", "widget"), model)).toBe(false);
    expect(animatesModel(withMesh(anims, "UCX_Body", "hull", { role: "collision" }), model)).toBe(true);
  });

  it("takes a file that keeps a copy of every mesh the model shows beside rigid meshes, such as a floor", () => {
    const withFloor = withMesh(body, "Floor", "floor");
    expect(animatesModel(withFloor, model)).toBe(true);
    expect(animatesModel(withMesh(withMesh(anims, "Body", "body", { hidden: true }), "Floor", "floor"), model)).toBe(
      true,
    );
    const twoMeshes = withMesh(model, "Head", "head", skinned);
    expect(animatesModel(withFloor, twoMeshes)).toBe(false);
    expect(animatesModel(withMesh(withFloor, "Head.001", "head", skinned), twoMeshes)).toBe(true);
    expect(animatesModel(withFloor, withMesh(model, "Cape", "cape", { hidden: true, skinned: true }))).toBe(true);
    expect(animatesModel(withFloor, withMesh(model, "UCX_Body", "hull", { role: "collision" }))).toBe(true);
    expect(animatesModel(withMesh(anims, "Floor", "floor"), rig(["Root", "Arm"]))).toBe(false);
  });

  it("refuses a file that keeps the model beside a skinned mesh of its own, as an outfit file does", () => {
    expect(animatesModel(withMesh(body, "Jacket", "jacket", skinned), model)).toBe(false);
  });

  it("needs copies of the most detailed level of the model's LOD groups only", () => {
    const lods = withMesh(rig(["Root", "Arm"]), "Body", ["body", "body-lod1"], skinned);
    expect(animatesModel(withMesh(withMesh(anims, "Body_LOD0", "body", skinned), "Floor", "floor"), lods)).toBe(true);
    expect(animatesModel(withMesh(withMesh(anims, "Body_LOD1", "body-lod1"), "Floor", "floor"), lods)).toBe(false);
  });
});

describe("joinsByName", () => {
  it("joins model files named after the model with an @, whatever their model format", () => {
    expect(joinsByName("Hero.blend", "Hero@Walk.blend")).toBe(true);
    expect(joinsByName("Hero.blend", "Hero@Walk.FBX")).toBe(true);
    expect(joinsByName("Hero.fbx", "Hero@Walk.blend")).toBe(true);
    expect(joinsByName("Hero.fbx", "Hero@Walk.blend1")).toBe(false);
    expect(joinsByName("Hero.fbx", "Hero@Walk.png")).toBe(false);
    expect(joinsByName("Hero.fbx", "Heroine@Walk.fbx")).toBe(false);
    expect(joinsByName("Hero.fbx", "Hero@")).toBe(false);
  });
});
