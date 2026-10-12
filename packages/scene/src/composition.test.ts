import { describe, expect, it } from "vitest";
import type { Clip } from "./clip";
import { composeScene, findNode, memberPath, splitMemberPath } from "./composition";
import type { Material, Texture, TextureRef, TextureSampling } from "./material";
import { TEXTURE_REF_KEYS } from "./material";
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

function morphScene(targets: { name: string; offset: Vec3; weight?: number }[], keys?: number[][]): SceneDescription {
  const result = scene({
    nodes: [{ name: "Face", mesh: {} }],
    clips: keys ? [{ name: "Expression", animate: [] }] : [],
  });
  const mesh = result.meshes[0];
  if (!mesh) throw new Error("Face has a mesh");
  mesh.morphTargets = targets.map(({ name, offset, weight = 0 }) => ({
    name,
    defaultWeight: weight,
    positions: Float32Array.from([...offset, ...offset, ...offset]),
    normals: null,
  }));
  const clip = result.clips[0];
  if (clip && keys) {
    clip.tracks = [
      {
        node: 0,
        property: "weights",
        interpolation: "linear",
        times: Float32Array.of(0, 1),
        values: Float32Array.from(keys.flat()),
      },
    ];
  }
  return result;
}

function lastMorphPosition(scene: SceneDescription): Vec3 {
  const mesh = scene.meshes[0];
  const track = scene.clips.at(-1)?.tracks.find((track) => track.property === "weights");
  if (!mesh || !track) throw new Error("Face has a morph track");
  const weights = track.values.subarray(track.values.length - mesh.morphTargets.length);
  const position: Vec3 = [mesh.positions[0] ?? 0, mesh.positions[1] ?? 0, mesh.positions[2] ?? 0];
  mesh.morphTargets.forEach((target, index) => {
    for (let axis = 0; axis < 3; axis++)
      position[axis] = (position[axis] ?? 0) + (target.positions[axis] ?? 0) * (weights[index] ?? 0);
  });
  return position;
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
  it("animates the named morph when an animation file orders the targets differently", () => {
    const smile = { name: "Smile", offset: [1, 0, 0] as Vec3 };
    const blink = { name: "Blink", offset: [0, 1, 0] as Vec3 };
    const model = morphScene([smile, blink]);
    const animation = morphScene(
      [blink, smile],
      [
        [0, 0],
        [1, 0],
      ],
    );
    const composed = composeScene(model, {
      ...noComposition(),
      animations: [{ file: "Face@Blink.fbx", scene: animation }],
    });
    expect(lastMorphPosition(composed)).toEqual([0, 1, 0]);
    expect(composed.clips[0]?.tracks[0]?.values).toEqual(Float32Array.of(0, 0, 0, 1));
    expect(animation.clips[0]?.tracks[0]?.values).toEqual(Float32Array.of(0, 0, 1, 0));
  });

  it("keeps defaults for unmatched or ambiguous morphs and warns about animation it cannot bind", () => {
    const model = morphScene([
      { name: "Smile", offset: [1, 0, 0] },
      { name: "Blink", offset: [0, 4, 0], weight: 0.25 },
      { name: "Extra", offset: [0, 0, 2], weight: 0.5 },
      { name: "Duplicate", offset: [1, 0, 0], weight: 0.125 },
      { name: "Duplicate", offset: [1, 0, 0], weight: 0.375 },
    ]);
    const animation = morphScene(
      ["Smile", "Blink", "Blink", "Missing", "Duplicate"].map((name) => ({ name, offset: [1, 0, 0] })),
      [
        [0, 0, 0, 0, 0],
        [1, 1, 0, 1, 1],
      ],
    );
    const composed = composeScene(model, {
      ...noComposition(),
      animations: [{ file: "Face@Expression.fbx", scene: animation }],
    });
    expect(lastMorphPosition(composed)).toEqual([1.5, 1, 1]);
    expect(composed.source.warnings).toEqual([
      expect.objectContaining({
        code: "invalid-data",
        subject: { kind: "clip", name: "Expression" },
        file: "Face@Expression.fbx",
      }),
    ]);
    const detail = composed.source.warnings[0]?.detail;
    for (const name of ["Blink", "Missing", "Duplicate"]) expect(detail).toContain(name);
  });

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

  it("leaves out the tracks that only hold an animation file's pose, and does not miss their bones", () => {
    const wave = scene({
      nodes: [
        { name: "Armature" },
        { name: "Body", parent: 0, kind: "bone" },
        { name: "Leg", parent: 1, kind: "bone" },
        { name: "Control", parent: 0, kind: "bone" },
      ],
      clips: [{ name: "Armature|Wave", animate: [1, 2, 3] }],
    });
    for (const track of wave.clips[0]?.tracks ?? []) track.held = track.node !== 1;
    const composed = composeScene(legs, { ...noComposition(), animations: [{ file: "Legs@Wave.blend", scene: wave }] });
    expect(composed.clips.at(-1)?.tracks.map((track) => composed.nodes[track.node]?.path)).toEqual(["Armature/Body"]);
    expect(composed.source.warnings).toEqual([]);
  });

  it("keeps the frame number another file gives its clip's first frame", () => {
    const take = scene({ nodes: [{ name: "Body", kind: "bone" }], clips: [{ name: "Walk", animate: [0] }] });
    const walk = take.clips[0];
    if (walk) walk.sourceStartFrame = 101;
    const composed = composeScene(legs, { ...noComposition(), animations: [{ file: "Legs@Walk.blend", scene: take }] });
    expect(composed.clips.map((clip) => [clip.name, clip.sourceStartFrame])).toEqual([
      ["Armature|Walk", undefined],
      ["Legs@Walk.blend//Walk", 101],
    ]);
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
    const flap = composed.nodes.findIndex((node) => node.path === "Cape.fbx//Armature/Body/Flap");
    expect(composed.nodes[flap]?.parent).toBe(1);
    expect(worldOf(composed, "Cape.fbx//Armature/Body/Flap")).toEqual(worldOf(cape, "Armature/Body/Flap"));
    const before = restWorldMatrices(composed.nodes)[flap];
    const moved = restWorldMatrices(
      composed.nodes.map((node, index) => (index === 1 ? { ...node, translation: [0, 2, 0] } : node)),
    )[flap];
    expect((moved?.[13] ?? 0) - (before?.[13] ?? 0)).toBeCloseTo(1);
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

  it.each([
    ["mesh", "joint"],
    ["joint", "mesh"],
    ["mesh", "whole", "joint"],
    ["whole", "mesh", "joint", "competing"],
  ] as const)("keeps explicit joint placement and node ordering for %j", (...order) => {
    const cape = scene({
      nodes: [
        { name: "Armature" },
        { name: "Flap", parent: 0, kind: "bone", at: [0, 0.5, 0] },
        { name: "End", parent: 1, kind: "bone", at: [0, 0.25, 0] },
        { name: "Cape", parent: 0, mesh: { skin: [1, 2] } },
      ],
    });
    const entries = {
      mesh: { node: "Cape", bone: null },
      joint: { node: "Flap", bone: "Body" },
      whole: { node: null, bone: null },
      competing: { node: "Flap", bone: "Leg" },
    };
    const composed = composeScene(legs, {
      ...noComposition(),
      attach: order.map((entry) => ({ member: { file: "Cape.fbx", scene: cape }, ...entries[entry] })),
    });
    const flap = composed.nodes.findIndex((node) => node.path === "Cape.fbx//Armature/Flap");
    const end = composed.nodes.findIndex((node) => node.path === "Cape.fbx//Armature/Flap/End");
    expect(composed.nodes[flap]?.parent).toBe(1);
    expect(composed.nodes[end]?.parent).toBe(flap);
    expect(composed.nodes.every((node, index) => node.parent < index)).toBe(true);
    expect(composed.skeletons.at(-1)?.joints).toEqual([flap, end]);
    expect(composed.parts.filter((part) => part.id === "Cape.fbx//Armature/Cape")).toHaveLength(1);
  });

  it("keeps meshes outside an attachment excluded when their nodes are skin dependencies", () => {
    const member = scene({
      nodes: [
        { name: "Accessory", mesh: { skin: [1] } },
        { name: "Unrelated", mesh: {} },
      ],
    });
    const composed = composeScene(legs, {
      ...noComposition(),
      attach: [{ member: { file: "Accessory.fbx", scene: member }, node: "Accessory", bone: null }],
    });
    expect(composed.meshes).toHaveLength(legs.meshes.length + 1);
    expect(composed.nodes.find((node) => node.path === "Accessory.fbx//Unrelated")?.mesh).toBeNull();
  });

  it("places a file's node entry before its whole-file entry, whichever the composition lists first", () => {
    const composed = composeScene(legs, {
      ...noComposition(),
      attach: [
        { member: { file: "Shells.fbx", scene: shells }, node: null, bone: null },
        { member: { file: "Shells.fbx", scene: shells }, node: "ShellA", bone: "Body" },
      ],
    });
    const parentOf = (path: string) => composed.nodes.find((node) => node.path === path)?.parent;
    expect(parentOf("Shells.fbx//ShellA")).toBe(1);
    expect(parentOf("Shells.fbx//ShellB")).toBe(-1);
    expect(worldOf(composed, "Shells.fbx//ShellA")).toEqual(worldOf(shells, "ShellA"));
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

  it("samples a composition's texture as the slot's own texture did, or as its missing image would have", () => {
    const own: Texture = {
      name: "ShellPaint",
      mimeType: "image/png",
      bytes: Uint8Array.of(1),
      storedPath: "ShellPaint.png",
      foundPath: "ShellPaint.png",
    };
    const chosen: Texture = { ...own, name: "Repainted", storedPath: "Repainted.png", foundPath: "Repainted.png" };
    const ownSampling: TextureSampling = {
      uvSet: 1,
      wrapU: "mirror",
      wrapV: "clamp",
      transform: { offset: [0.5, 0], scale: [2, 2], rotation: 0.25 },
      alpha: "premultiply",
      colorSpace: "linear",
    };
    const tiled: TextureSampling = {
      uvSet: 1,
      wrapU: "repeat",
      wrapV: "repeat",
      transform: { offset: [0, 0], scale: [4, 4], rotation: 0 },
      colorSpace: "srgb",
    };
    const painted = scene({ nodes: [{ name: "ShellA", mesh: {} }], materials: ["Shell"] });
    painted.textures = [own];
    painted.materials = painted.materials.map((entry) => ({
      ...entry,
      baseColorTexture: { ...ownSampling, texture: 0 },
      missingTextures: { normal: "C:/elsewhere/Bumps.png" },
      missingTextureSampling: { normal: tiled },
    }));
    const composed = composeScene(painted, {
      ...noComposition(),
      materials: {
        Shell: {
          baseColor: { path: "Repainted.png", texture: chosen },
          normal: { path: "Bumps.png", texture: chosen },
          roughness: { path: "Rough.png", texture: chosen },
        },
      },
    });
    const index = composed.textures.indexOf(chosen);
    const shell = composed.materials[0];
    expect(index).toBe(1);
    expect(shell?.baseColorTexture).toEqual({ ...ownSampling, texture: index });
    expect(shell?.normalTexture).toEqual({ ...tiled, texture: index });
    expect(shell?.roughnessTexture).toEqual({
      texture: index,
      uvSet: 0,
      wrapU: "repeat",
      wrapV: "repeat",
      transform: null,
    });
    expect(painted.materials[0]?.baseColorTexture).toEqual({ ...ownSampling, texture: 0 });
  });

  it("moves every texture reference of another file's materials past the model's textures", () => {
    const image = (name: string): Texture => ({
      name,
      mimeType: "image/png",
      bytes: Uint8Array.of(1),
      storedPath: `${name}.png`,
      foundPath: `${name}.png`,
    });
    const model = scene({ nodes: [{ name: "Body", mesh: {} }] });
    model.textures = [image("Skin"), image("Eyes")];
    const member = scene({ nodes: [{ name: "Helmet", mesh: {} }], materials: ["Metal"] });
    member.textures = [image("Metal")];
    const ref: TextureRef = { texture: 0, uvSet: 0, wrapU: "repeat", wrapV: "repeat", transform: null };
    const metal = member.materials[0];
    if (!metal) throw new Error("the helmet has a material");
    for (const key of TEXTURE_REF_KEYS) metal[key] = ref;
    const composed = composeScene(model, {
      ...noComposition(),
      attach: [{ member: { file: "Helmet.fbx", scene: member }, node: null, bone: null }],
    });
    const moved = composed.materials.find((entry) => entry.name === "Metal");
    expect(TEXTURE_REF_KEYS.map((key) => moved?.[key]?.texture)).toEqual(TEXTURE_REF_KEYS.map(() => 2));
    expect(composed.textures[2]?.name).toBe("Metal");
    expect(metal.baseColorTexture?.texture).toBe(0);
  });

  it("adds a texture that several slots share once, and points every slot at it", () => {
    const texture: Texture = {
      name: "Atlas",
      mimeType: "image/png",
      bytes: Uint8Array.of(1, 2),
      storedPath: "Atlas.png",
      foundPath: "Atlas.png",
    };
    const slot = { path: "Atlas.png", texture };
    const composed = composeScene(legs, {
      ...noComposition(),
      attach: [{ member: { file: "Shells.fbx", scene: shells }, node: null, bone: null }],
      materials: { Shell: { baseColor: slot, emissive: slot }, Spikes: { roughness: slot } },
    });
    expect(composed.textures.filter((entry) => entry === texture)).toHaveLength(1);
    const index = composed.textures.indexOf(texture);
    const shell = composed.materials.find((entry) => entry.name === "Shell");
    const spikes = composed.materials.find((entry) => entry.name === "Spikes");
    expect([
      shell?.baseColorTexture?.texture,
      shell?.emissiveTexture?.texture,
      spikes?.roughnessTexture?.texture,
    ]).toEqual([index, index, index]);
  });
});
