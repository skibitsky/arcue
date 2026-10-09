import { describe, expect, it } from "vitest";
import type { Clip } from "./clip";
import { composeScene, findNode, memberPath, splitMemberPath } from "./composition";
import type { Material, Texture } from "./material";
import type { Quat, Vec3 } from "./math";
import type { Mesh } from "./mesh";
import type { NodeKind, SceneNode } from "./node";
import { buildNodePaths } from "./node";
import { describeParts, shownByDefault, visibleMeshes } from "./parts";
import type { SceneDescription } from "./scene";
import { SCENE_SPACE } from "./source";
import { restWorldMatrices } from "./transform";

interface NodeSpec {
  name: string;
  parent?: number;
  kind?: NodeKind;
  at?: Vec3;
  rotation?: Quat;
  /** A triangle around the node's rest position, skinned to these joint node indices when given. */
  mesh?: { skin?: number[]; material?: number };
}

interface SceneSpec {
  nodes: NodeSpec[];
  clips?: { name: string; animate: number[] }[];
  materials?: string[];
}

function triangle(center: Vec3, skeleton: number | null): Mesh {
  const [x, y, z] = center;
  const positions = Float32Array.of(x, y, z, x + 0.1, y, z, x, y + 0.1, z);
  return {
    name: "Mesh",
    geometryName: "",
    positions,
    normals: new Float32Array(9),
    uvs: [],
    colors: null,
    skeleton,
    bindMatrix: skeleton === null ? null : Float32Array.of(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1),
    joints: skeleton === null ? null : new Uint16Array(12),
    weights: skeleton === null ? null : Float32Array.of(1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0),
    indices: Uint32Array.of(0, 1, 2),
    groups: [{ start: 0, triangleCount: 1, material: 0 }],
    morphTargets: [],
    sourceVertex: Uint32Array.of(0, 1, 2),
    sourceVertexCount: 3,
    restPositions: positions.slice(),
    skinWeights: null,
    topology: { triangleCount: 1, sourceVertexCount: 3, hash: "t" },
  };
}

function material(name: string): Material {
  return {
    name,
    baseColor: [0.5, 0.5, 0.5, 1],
    baseColorTexture: null,
    metallic: 0,
    roughness: 0.5,
    metallicRoughnessTexture: null,
    roughnessTexture: null,
    metalnessTexture: null,
    normalTexture: null,
    normalScale: 1,
    occlusionTexture: null,
    emissive: [0, 0, 0],
    emissiveTexture: null,
    alphaMode: "opaque",
    alphaCutoff: 0.5,
    doubleSided: false,
  };
}

function scene({ nodes: specs, clips = [], materials = ["Stone"] }: SceneSpec): SceneDescription {
  const paths = buildNodePaths(specs.map((node) => ({ name: node.name, parent: node.parent ?? -1 })));
  const meshes: Mesh[] = [];
  const skeletons: SceneDescription["skeletons"] = [];
  const nodes: SceneNode[] = specs.map((spec, index) => ({
    name: spec.name,
    path: paths[index] ?? spec.name,
    parent: spec.parent ?? -1,
    kind: spec.kind ?? (spec.mesh ? "mesh" : "empty"),
    translation: spec.at ?? [0, 0, 0],
    rotation: spec.rotation ?? [0, 0, 0, 1],
    scale: [1, 1, 1],
    mesh: null,
  }));
  const worlds = restWorldMatrices(nodes);
  specs.forEach((spec, index) => {
    if (!spec.mesh) return;
    const world = worlds[index];
    const center: Vec3 = [world?.[12] ?? 0, world?.[13] ?? 0, world?.[14] ?? 0];
    let skeleton: number | null = null;
    if (spec.mesh.skin) {
      skeletons.push({ joints: spec.mesh.skin, inverseBindMatrices: new Float32Array(16 * spec.mesh.skin.length) });
      skeleton = skeletons.length - 1;
    }
    const mesh = triangle(center, skeleton);
    mesh.groups = [{ start: 0, triangleCount: 1, material: spec.mesh.material ?? 0 }];
    meshes.push(mesh);
    const node = nodes[index];
    if (node) node.mesh = meshes.length - 1;
  });
  const parts = describeParts(nodes);
  return {
    source: {
      format: "fbx",
      exporter: null,
      fps: 30,
      originalSpace: SCENE_SPACE,
      conversion: { scale: 1, rotation: [0, 0, 0, 1] },
      warnings: [],
    },
    nodes,
    meshes,
    skeletons,
    materials: materials.map(material),
    textures: [],
    clips: clips.map(
      (clip): Clip => ({
        name: clip.name,
        displayName: clip.name.slice(clip.name.lastIndexOf("|") + 1),
        fps: 30,
        duration: 1,
        frameCount: 31,
        tracks: clip.animate.map((node) => ({
          node,
          property: "rotation",
          interpolation: "linear",
          times: Float32Array.of(0, 1),
          values: Float32Array.of(0, 0, 0, 1, 0, Math.SQRT1_2, 0, Math.SQRT1_2),
        })),
        keyTimes: Float32Array.of(0, 1),
        keyedEveryFrame: false,
      }),
    ),
    parts,
    bounds: { min: [0, 0, 0], max: [0, 0, 0] },
  };
}

/** Root, Body bone 1 m up and turned a quarter around Y, Leg bone under Body, and a skinned Legs mesh. */
const legs = scene({
  nodes: [
    { name: "Armature" },
    { name: "Body", parent: 0, kind: "bone", at: [0, 1, 0], rotation: [0, Math.SQRT1_2, 0, Math.SQRT1_2] },
    { name: "Leg", parent: 1, kind: "bone", at: [0.2, -0.5, 0] },
    { name: "Legs", parent: 0, mesh: { skin: [1, 2] } },
  ],
  clips: [{ name: "Armature|Walk", animate: [1, 2] }],
});

const shells = scene({
  nodes: [
    { name: "ShellA", at: [0, 1.5, 0], mesh: {} },
    { name: "ShellB", at: [0, 1.4, 0.1], mesh: { material: 1 } },
  ],
  materials: ["Shell", "Spikes"],
});

function worldOf(scene: SceneDescription, path: string): number[] {
  const index = scene.nodes.findIndex((node) => node.path === path);
  return [...(restWorldMatrices(scene.nodes)[index] ?? [])].map((value) => Math.round(value * 1e5) / 1e5 + 0);
}

function noComposition() {
  return { animations: [], attach: [], materials: {}, hidden: [] };
}

describe("member paths", () => {
  it("prefixes a node path with its file and splits it again at the first unescaped double slash", () => {
    const path = memberPath("../Shared/Shells.fbx", "Shells/A\\/B");
    expect(path).toBe("../Shared/Shells.fbx//Shells/A\\/B");
    expect(splitMemberPath(path)).toEqual({ file: "../Shared/Shells.fbx", path: "Shells/A\\/B" });
  });

  it("finds no file in the model's own paths, even where an escaped slash ends a name", () => {
    expect(splitMemberPath("Root/A\\//B")).toEqual({ file: null, path: "Root/A\\//B" });
    expect(splitMemberPath("Root/A\\\\/B")).toEqual({ file: null, path: "Root/A\\\\/B" });
  });
});

describe("findNode", () => {
  it("finds a node by its path, else by its name, preferring a bone or another node as asked", () => {
    const twins = scene({
      nodes: [{ name: "Armature" }, { name: "Body", parent: 0, kind: "bone" }, { name: "Body", parent: 0, mesh: {} }],
    });
    expect(findNode(twins.nodes, "Armature/Body", false)).toBe(1);
    expect(findNode(twins.nodes, "Armature/Body#2", true)).toBe(2);
    expect(findNode(twins.nodes, "Body", true)).toBe(1);
    expect(findNode(twins.nodes, "Body", false)).toBe(2);
    expect(findNode(twins.nodes, "Wing", true)).toBeNull();
  });
});

describe("composeScene", () => {
  it("returns the model's scene when the composition adds nothing", () => {
    const composed = composeScene(legs, noComposition());
    expect(composed.nodes).toEqual(legs.nodes);
    expect(composed.clips.map((clip) => clip.name)).toEqual(["Armature|Walk"]);
    expect(composed.parts).toEqual(legs.parts);
  });

  it("binds another file's clips by bone name, keeps their file, and reports bones the model lacks", () => {
    const turns = scene({
      nodes: [
        { name: "Armature" },
        { name: "Body", parent: 0, kind: "bone" },
        { name: "Tail", parent: 1, kind: "bone" },
      ],
      clips: [
        { name: "Armature|Walk", animate: [1] },
        { name: "Armature|Turn", animate: [0, 1, 2] },
      ],
    });
    const composed = composeScene(legs, { ...noComposition(), animations: [{ file: "Legs@Turns.fbx", scene: turns }] });
    expect(composed.clips.map((clip) => [clip.name, clip.displayName, clip.file])).toEqual([
      ["Armature|Walk", "Walk", undefined],
      ["Legs@Turns.fbx//Armature|Walk", "Walk (2)", "Legs@Turns.fbx"],
      ["Legs@Turns.fbx//Armature|Turn", "Turn", "Legs@Turns.fbx"],
    ]);
    expect(composed.clips[2]?.tracks.map((track) => composed.nodes[track.node]?.path)).toEqual([
      "Armature",
      "Armature/Body",
    ]);
    expect(composed.source.warnings).toEqual([
      {
        code: "animation-bones-missing",
        severity: "warning",
        subject: { kind: "clip", name: "Armature|Turn" },
        message: "Missing bones: Turn",
        file: "Legs@Turns.fbx",
        detail: "Bones the model lacks: Tail",
      },
    ]);
    expect(legs.clips).toHaveLength(1);
  });

  it("names another file's clips within that file, so adding or removing other files never renames them", () => {
    const take = (name: string) => scene({ nodes: [{ name: "Body", kind: "bone" }], clips: [{ name, animate: [0] }] });
    const names = (files: string[]) =>
      composeScene(legs, {
        ...noComposition(),
        animations: files.map((file) => ({ file, scene: take("Take 001") })),
      }).clips.map((clip) => clip.name);
    expect(names(["Legs@Run.fbx", "Legs@Walk.fbx"])).toEqual([
      "Armature|Walk",
      "Legs@Run.fbx//Take 001",
      "Legs@Walk.fbx//Take 001",
    ]);
    expect(names(["Legs@Idle.fbx", "Legs@Run.fbx", "Legs@Walk.fbx"]).slice(2)).toEqual([
      "Legs@Run.fbx//Take 001",
      "Legs@Walk.fbx//Take 001",
    ]);
    expect(names(["Legs@Walk.fbx"])).toEqual(["Armature|Walk", "Legs@Walk.fbx//Take 001"]);
  });

  it("attaches a node under a bone, keeping its rest placement, with its file on its path and part", () => {
    const composed = composeScene(legs, {
      ...noComposition(),
      attach: [{ member: { file: "Shells.fbx", scene: shells }, node: "ShellA", bone: "Body" }],
    });
    const shell = composed.nodes.find((node) => node.path === "Shells.fbx//ShellA");
    expect(shell?.parent).toBe(1);
    expect(worldOf(composed, "Shells.fbx//ShellA")).toEqual(worldOf(shells, "ShellA"));
    expect(composed.nodes.some((node) => node.path === "Shells.fbx//ShellB")).toBe(false);
    expect(composed.parts.map((part) => part.id)).toEqual(["Armature/Legs", "Shells.fbx//ShellA"]);
    const mesh = shell?.mesh === null || !shell ? undefined : composed.meshes[shell.mesh];
    expect(mesh?.restPositions).toBe(shells.meshes[0]?.restPositions);
    expect(composed.materials[mesh?.groups[0]?.material ?? -1]?.name).toBe("Shell");
  });

  it("leaves a set piece in place at the root, and hides the parts the composition names", () => {
    const composed = composeScene(legs, {
      ...noComposition(),
      attach: [{ member: { file: "Shells.fbx", scene: shells }, node: null, bone: null }],
      hidden: ["Shells.fbx//ShellB", "Shells.fbx//Gone"],
    });
    expect(composed.nodes.filter((node) => node.path.startsWith("Shells.fbx//")).map((node) => node.parent)).toEqual([
      -1, -1,
    ]);
    expect(worldOf(composed, "Shells.fbx//ShellB")).toEqual(worldOf(shells, "ShellB"));
    const hidden = composed.parts.find((part) => part.id === "Shells.fbx//ShellB");
    expect(hidden && shownByDefault(hidden)).toBe(false);
    expect(visibleMeshes(composed.parts).size).toBe(2);
    expect(composed.bounds.max[1]).toBeCloseTo(1.6, 5);
    expect(composed.source.warnings.map((warning) => [warning.code, warning.subject.name, warning.file])).toEqual([
      ["node-not-found", "Shells.fbx//Gone", "Shells.fbx"],
    ]);
  });

  it("drives another file's skinned mesh with the model's bones of the same names, as a leader pose", () => {
    const cape = scene({
      nodes: [
        { name: "Armature" },
        { name: "Body", parent: 0, kind: "bone", at: [0, 1, 0] },
        { name: "Flap", parent: 1, kind: "bone", at: [0, -0.3, -0.2] },
        { name: "Spare", parent: 0, kind: "bone", at: [1, 0, 0] },
        { name: "Cape", parent: 0, mesh: { skin: [1, 2, 3] } },
      ],
    });
    const composed = composeScene(legs, {
      ...noComposition(),
      attach: [
        { member: { file: "Cape.fbx", scene: cape }, node: "Cape", bone: null },
        { member: { file: "Cape.fbx", scene: cape }, node: "Flap", bone: "Body" },
      ],
    });
    const skeleton = composed.skeletons.at(-1);
    expect(skeleton?.joints.map((joint) => composed.nodes[joint]?.path)).toEqual([
      "Armature/Body",
      "Cape.fbx//Armature/Body/Flap",
      "Cape.fbx//Armature/Spare",
    ]);
    expect(composed.nodes.find((node) => node.path === "Cape.fbx//Armature/Body/Flap")?.parent).toBe(-1);
  });

  it("merges an attached file's bones into the model's, so their children follow the model's skeleton", () => {
    const helmet = scene({
      nodes: [
        { name: "Armature" },
        { name: "Body", parent: 0, kind: "bone", at: [0, 1, 0], rotation: [0, Math.SQRT1_2, 0, Math.SQRT1_2] },
        { name: "Helmet", parent: 1, at: [0, 0.4, 0], mesh: {} },
      ],
    });
    const composed = composeScene(legs, {
      ...noComposition(),
      attach: [{ member: { file: "Helmet.fbx", scene: helmet }, node: null, bone: null }],
    });
    const node = composed.nodes.find((entry) => entry.path === "Helmet.fbx//Armature/Body/Helmet");
    expect(node?.parent).toBe(1);
    expect(node?.translation).toEqual([0, 0.4, 0]);
    expect(composed.nodes.some((entry) => entry.path === "Helmet.fbx//Armature/Body")).toBe(false);
  });

  it("reports a missing node and a missing bone, and keeps an attachment without its bone in place", () => {
    const composed = composeScene(legs, {
      ...noComposition(),
      attach: [
        { member: { file: "Shells.fbx", scene: shells }, node: "Nope", bone: "Body" },
        { member: { file: "Shells.fbx", scene: shells }, node: "ShellA", bone: "Tail" },
      ],
    });
    expect(composed.nodes.find((node) => node.path === "Shells.fbx//ShellA")?.parent).toBe(-1);
    expect(composed.source.warnings.map((warning) => [warning.code, warning.subject.name])).toEqual([
      ["node-not-found", "Nope"],
      ["node-not-found", "Tail"],
    ]);
  });

  it("puts a texture on every material with the slot's name, and reports a slot no mesh uses", () => {
    const texture: Texture = {
      name: "ShellPaint",
      mimeType: "image/png",
      bytes: Uint8Array.of(1, 2),
      storedPath: "ShellPaint.png",
      foundPath: "ShellPaint.png",
    };
    const composed = composeScene(legs, {
      ...noComposition(),
      attach: [{ member: { file: "Shells.fbx", scene: shells }, node: null, bone: "Body" }],
      materials: {
        Shell: { baseColor: { path: "ShellPaint.png", texture }, normal: { path: "Bumps.png", texture: null } },
        Missing: { baseColor: { path: "ShellPaint.png", texture } },
      },
    });
    const shell = composed.materials.find((entry) => entry.name === "Shell");
    expect(shell?.baseColorTexture?.texture).toBe(composed.textures.indexOf(texture));
    expect(shell?.baseColor).toEqual([1, 1, 1, 1]);
    expect(shell?.normalTexture).toBeNull();
    expect(shell?.textureOverrides).toEqual({
      baseColor: { path: "ShellPaint.png", found: true },
      normal: { path: "Bumps.png", found: false },
    });
    expect(shells.materials[0]?.baseColorTexture).toBeNull();
    expect(shells.materials[0]?.textureOverrides).toBeUndefined();
    expect(composed.source.warnings.map((warning) => [warning.code, warning.subject.name])).toEqual([
      ["material-not-found", "Missing"],
    ]);
  });
});
