import type { Comment, CommentContext, ReviewFile } from "@arcue/protocol";
import type { CameraAnchor, Clip, SceneDescription, SceneNode, SpatialAnchor, Vec3 } from "@arcue/scene";
import { buildNodePaths, countInRanges, describeParts, frameCountFor, SCENE_SPACE } from "@arcue/scene";

export interface SceneSpec {
  root: string;
  mesh: string;
  fps: number;
  triangles: number;
  bones: number;
  height: number;
  /** Display name and length in seconds of each clip. */
  clips: readonly (readonly [name: string, seconds: number])[];
  /** Clips keyed only at a few frames, which the ruler shows as key ticks. */
  sparse?: readonly string[];
  exporter?: string;
}

export const STONE_RESONATOR: SceneSpec = {
  root: "StoneResonator",
  mesh: "StoneResonator",
  fps: 60,
  triangles: 10_720,
  bones: 62,
  height: 2.0,
  clips: [
    ["AttackSequence", 2.53],
    ["Charge", 0.75],
    ["Death", 0.9],
    ["Displaced", 0.55],
    ["Idle", 2.0],
    ["Locked", 0.45],
    ["LockedHold", 0.6],
    ["Reassess", 0.35],
    ["Recover", 0.55],
    ["Release", 0.1],
    ["Run", 0.6],
    ["Rush", 0.4],
    ["Stop", 0.15],
    ["Walk", 1.0],
  ],
  sparse: ["Idle", "LockedHold"],
};

export const STONE_RESONATOR_PATH = "/work/iza/Assets/Art/Characters/StoneResonator/Models/StoneResonator.fbx";
export const STONE_MESH_PATH = "StoneResonator";
export const STONE_VERSION = "3f9a2c1";

function sparseKeys(frameCount: number, fps: number): Float32Array {
  const step = Math.max(2, Math.round(frameCount / 6));
  const frames = new Set<number>([0, frameCount - 1]);
  for (let frame = step; frame < frameCount - 1; frame += step) frames.add(frame);
  return Float32Array.from([...frames].sort((a, b) => a - b).map((frame) => frame / fps));
}

function clipFor(name: string, seconds: number, spec: SceneSpec): Clip {
  const frameCount = frameCountFor(seconds, spec.fps);
  const sparse = spec.sparse?.includes(name) ?? false;
  return {
    name: `Armature|${name}`,
    displayName: name,
    fps: spec.fps,
    duration: seconds,
    frameCount,
    tracks: [],
    keyTimes: sparse
      ? sparseKeys(frameCount, spec.fps)
      : Float32Array.from({ length: frameCount }, (_, frame) => frame / spec.fps),
    keyedEveryFrame: !sparse,
  };
}

/** A scene with the counts of a real export and placeholder geometry, which the fake 3D view never reads. */
export function fakeScene(spec: SceneSpec): SceneDescription {
  const named = [
    { name: spec.root, parent: -1 },
    { name: "Armature", parent: 0 },
    ...Array.from({ length: spec.bones }, (_, index) => ({ name: `Bone_${index + 1}`, parent: index === 0 ? 1 : 2 })),
    { name: spec.mesh, parent: 0 },
  ];
  const paths = buildNodePaths(named);
  const meshNode = named.length - 1;
  const nodes: SceneNode[] = named.map((node, index) => ({
    name: node.name,
    path: paths[index] ?? node.name,
    parent: node.parent,
    kind: index === meshNode ? "mesh" : index >= 2 ? "bone" : "empty",
    translation: [0, 0, 0],
    rotation: [0, 0, 0, 1],
    scale: [1, 1, 1],
    mesh: index === meshNode ? 0 : null,
  }));
  const vertexCount = 3;
  return {
    source: {
      format: "fbx",
      exporter: { name: "Blender", version: spec.exporter ?? "5.2" },
      fps: spec.fps,
      originalSpace: SCENE_SPACE,
      conversion: { scale: 1, rotation: [0, 0, 0, 1] },
      warnings: [],
    },
    nodes,
    meshes: [
      {
        name: spec.mesh,
        geometryName: "",
        positions: new Float32Array(vertexCount * 3),
        normals: new Float32Array(vertexCount * 3),
        uvs: [],
        colors: null,
        skeleton: null,
        bindMatrix: null,
        joints: null,
        weights: null,
        indices: new Uint32Array(spec.triangles * 3),
        groups: [{ start: 0, triangleCount: spec.triangles, material: 0 }],
        morphTargets: [],
        sourceVertex: new Uint32Array(vertexCount),
        sourceVertexCount: vertexCount,
        restPositions: new Float32Array(vertexCount * 3),
        skinWeights: null,
        topology: { sourceVertexCount: 5_412, triangleCount: spec.triangles, hash: "8c1f2a9e4b7d3c60" },
      },
    ],
    skeletons: [],
    materials: [],
    textures: [],
    clips: spec.clips.map(([name, seconds]) => clipFor(name, seconds, spec)),
    parts: describeParts(nodes),
    bounds: { min: [-0.62, 0, -0.38], max: [0.62, spec.height, 0.38] },
  };
}

const camera = (position: Vec3, target: Vec3): CameraAnchor => ({ position, target, up: [0, 1, 0], fov: 30 });

const THUMB_REGION: SpatialAnchor = {
  kind: "region",
  mesh: STONE_MESH_PATH,
  triangles: [[4410, 4455]],
  vertices: [
    [2210, 2239],
    [2251, 2266],
  ],
};

const HEAD_SPIKE: SpatialAnchor = {
  kind: "surface",
  mesh: STONE_MESH_PATH,
  vertices: [5120, 5121, 5188],
  weights: [0.52, 0.31, 0.17],
};

function context(fields: Partial<CommentContext>): CommentContext {
  return { vertexCount: 0, bones: [], centroid: null, joints: [], viewLabel: "front", screenshot: null, ...fields };
}

function restPositions(target: SpatialAnchor | null): Vec3[] {
  if (!target) return [];
  const count = target.kind === "surface" ? 3 : countInRanges(target.vertices);
  return Array.from({ length: count }, (_, index): Vec3 => [-0.4 + index * 0.0001, 1.0, 0.06]);
}

interface CommentSeed {
  id: string;
  text: string;
  status: Comment["status"];
  createdAt: Date;
  time: Comment["time"];
  target: SpatialAnchor | null;
  camera: CameraAnchor;
  context: CommentContext;
  rounds?: number[];
}

function comment(seed: CommentSeed): Comment {
  const iso = seed.createdAt.toISOString();
  return {
    id: seed.id,
    text: seed.text,
    status: seed.status,
    createdAt: iso,
    updatedAt: iso,
    madeOnVersion: STONE_VERSION,
    time: seed.time,
    target: seed.target,
    anchorVersion: STONE_VERSION,
    anchorRestPositions: restPositions(seed.target),
    camera: seed.camera,
    context: seed.context,
    anchorState: "exact",
    followUps: [],
    rounds: seed.rounds ?? [],
    reopenedFrom: null,
  };
}

function at(daysAgo: number, hours: number, minutes: number, now: Date): Date {
  const date = new Date(now);
  date.setDate(date.getDate() - daysAgo);
  date.setHours(hours, minutes, 0, 0);
  return date;
}

/** The Stone Resonator's review as the mockup shows it: three drafts and two earlier rounds. */
export function stoneResonatorReview(now = new Date()): ReviewFile {
  const exported = at(0, 14, 2, now);
  const roundTwo = at(3, 11, 15, now);
  const roundThree = at(1, 18, 40, now);
  const clipTime = (clip: string, frame: number) =>
    ({ kind: "frame", clip: `Armature|${clip}`, clipDisplayName: clip, frame }) as const;
  const comments = [
    comment({
      id: "c3",
      text: "Arms clip through the chest in Idle",
      status: "resolved",
      createdAt: roundTwo,
      time: clipTime("Idle", 48),
      target: null,
      camera: camera([0, 1.3, 3.6], [0, 1.1, 0]),
      context: context({ viewLabel: "front" }),
      rounds: [2],
    }),
    comment({
      id: "c4",
      text: "Left foot slides during Walk, frames 20–28",
      status: "resolved",
      createdAt: roundThree,
      time: { kind: "range", clip: "Armature|Walk", clipDisplayName: "Walk", start: 20, end: 28 },
      target: null,
      camera: camera([3.2, 0.6, 1.2], [0, 0.4, 0]),
      context: context({ viewLabel: "left side" }),
      rounds: [3],
    }),
    comment({
      id: "c5",
      text: "Shoulder collapses in Rush, frame 9",
      status: "resolved",
      createdAt: roundThree,
      time: clipTime("Rush", 9),
      target: null,
      camera: camera([-1.8, 1.7, 2.2], [0, 1.4, 0]),
      context: context({ viewLabel: "front right, slightly above" }),
      rounds: [3],
    }),
    comment({
      id: "c7",
      text: "The thumb tip bends outward. Fold it back toward the palm.",
      status: "draft",
      createdAt: at(0, 14, 20, now),
      time: clipTime("Charge", 34),
      target: THUMB_REGION,
      camera: camera([-1.5, 1.05, 2.5], [-0.42, 1.02, 0.1]),
      context: context({
        vertexCount: 46,
        bones: [
          { name: "Right_ThumbDistal", share: 0.64 },
          { name: "Right_ThumbIntermediate", share: 0.31 },
        ],
        centroid: { rest: [-0.412, 1.018, 0.064], posed: [-0.371, 1.102, 0.118] },
        viewLabel: "palm side, slightly below",
        screenshot: "screenshots/c7.png",
      }),
    }),
    comment({
      id: "c8",
      text: "The torso bobs too much. Halve the vertical motion.",
      status: "draft",
      createdAt: at(0, 14, 24, now),
      time: { kind: "range", clip: "Armature|Run", clipDisplayName: "Run", start: 12, end: 24 },
      target: null,
      camera: camera([4.3, 1.4, 0.95], [0, 0.98, 0.05]),
      context: context({ viewLabel: "right side" }),
    }),
    comment({
      id: "c9",
      text: "This spike is cut off. It should come to a point like the others.",
      status: "draft",
      createdAt: at(0, 14, 31, now),
      time: { kind: "none" },
      target: HEAD_SPIKE,
      camera: camera([-0.04, 2.02, 1.6], [-0.04, 1.86, 0.08]),
      context: context({
        vertexCount: 3,
        bones: [{ name: "Head", share: 1 }],
        centroid: { rest: [-0.043, 1.972, 0.14], posed: [-0.043, 1.972, 0.14] },
        viewLabel: "front",
        screenshot: "screenshots/c9.png",
      }),
    }),
  ];
  const topology = { sourceVertexCount: 5_412, triangleCount: 10_720, hash: "8c1f2a9e4b7d3c60" };
  const version = (id: string, when: Date) => ({
    id,
    fileModifiedAt: when.toISOString(),
    loadedAt: when.toISOString(),
    exporter: "Blender 5.2 FBX",
    meshes: [{ mesh: STONE_MESH_PATH, topology }],
  });
  return {
    schemaVersion: 1,
    asset: { path: "Assets/Art/Characters/StoneResonator/Models/StoneResonator.fbx" },
    versions: [version("b71e04d", roundTwo), version("9d03a5e", roundThree), version(STONE_VERSION, exported)],
    comments,
    queue: ["c7", "c8", "c9"],
    rounds: [
      { number: 2, createdAt: roundTwo.toISOString(), version: "b71e04d", comments: ["c3"] },
      { number: 3, createdAt: roundThree.toISOString(), version: "9d03a5e", comments: ["c4", "c5"] },
    ],
    nextCommentNumber: 10,
  };
}

/** An asset with no comments yet. */
export function emptyReview(path: string, version: string, now = new Date()): ReviewFile {
  return {
    schemaVersion: 1,
    asset: { path },
    versions: [
      {
        id: version,
        fileModifiedAt: now.toISOString(),
        loadedAt: now.toISOString(),
        exporter: "Blender 5.2 FBX",
        meshes: [],
      },
    ],
    comments: [],
    queue: [],
    rounds: [],
    nextCommentNumber: 1,
  };
}

/** Where the fake 3D view draws the seeded anchors, in scene space, by their first source vertex. */
export const SEEDED_POINTS: ReadonlyMap<number, Vec3> = new Map<number, Vec3>([
  [2210, [-0.56, 0.98, 0.1]],
  [5120, [0.01, 1.98, 0.1]],
]);
