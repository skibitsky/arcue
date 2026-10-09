import type { Clip, Material, Mesh, Quat, SceneDescription, SceneNode, Track, Vec3 } from "@arcue/scene";
import {
  buildNodePaths,
  clipNames,
  defaultViewBounds,
  describeParts,
  displayNames,
  frameCountFor,
  isKeyedEveryFrame,
  mergeKeyTimes,
  SCENE_SPACE,
  topologyFingerprint,
} from "@arcue/scene";

/**
 * A segmented creature for the dev harness and its checks, built the way an importer would: a skinned body in
 * centimeters under a mesh node scaled by 0.01 (so the bind matrix is not the identity), a UV seam whose rendered
 * vertices share source vertices, a "Puff" morph target on the head, five spine bones, rigid eyes and antennae
 * parented to the head bone, and two clips.
 */

const HEIGHT = 1.55;
const BONE_HEIGHTS = [0, 0.35, 0.7, 1.02, 1.22];
const BONE_NAMES = ["Root", "Spine1", "Spine2", "Neck", "Head"];
const FPS = 30;

interface NodeInput {
  name: string;
  parent: number;
  kind: SceneNode["kind"];
  translation: Vec3;
  mesh: number | null;
  scale?: Vec3;
}

function profile(y: number): number {
  const t = y / HEIGHT;
  const body = 0.2 - 0.06 * t + 0.03 * Math.sin(t * Math.PI * 1.4);
  const ridges = 0.018 * Math.max(0, Math.sin(t * Math.PI * 12)) * (t < 0.72 ? 1 : 0);
  const neck = -0.07 * Math.exp(-(((y - 1.05) / 0.07) ** 2));
  const head = 0.05 * Math.exp(-(((y - 1.33) / 0.12) ** 2));
  const cap = Math.sqrt(Math.max(0, 1 - ((y - 1.33) / 0.23) ** 2));
  const top = y > 1.33 ? cap : 1;
  return Math.max(0.015, (body + ridges + neck + head) * top);
}

function smooth(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

/** Up to two bones per height, blended across each joint. */
function spineWeights(y: number): [number, number][] {
  const last = BONE_HEIGHTS.length - 1;
  if (y >= (BONE_HEIGHTS[last] ?? 0)) return [[last, 1]];
  for (let bone = 0; bone < last; bone++) {
    const low = BONE_HEIGHTS[bone] ?? 0;
    const high = BONE_HEIGHTS[bone + 1] ?? 0;
    if (y > high) continue;
    const blend = smooth((y - (low + (high - low) * 0.55)) / ((high - low) * 0.9));
    if (blend <= 0) return [[bone, 1]];
    if (blend >= 1) return [[bone + 1, 1]];
    return [
      [bone, 1 - blend],
      [bone + 1, blend],
    ];
  }
  return [[0, 1]];
}

function bodyMesh(detail: number): Mesh {
  const rings = Math.round(72 * detail);
  const segments = Math.round(40 * detail);
  const meshOffset: Vec3 = [0, 0.02, 0];
  const toLocal = (p: Vec3): Vec3 => [
    (p[0] - meshOffset[0]) * 100,
    (p[1] - meshOffset[1]) * 100,
    (p[2] - meshOffset[2]) * 100,
  ];
  const restPositions: number[] = [];
  const sourceWeights: [number, number][][] = [];
  for (let ring = 0; ring < rings; ring++) {
    const y = 0.02 + ((HEIGHT - 0.02) * ring) / (rings - 1);
    const radius = profile(y);
    for (let segment = 0; segment < segments; segment++) {
      const angle = (segment / segments) * Math.PI * 2;
      restPositions.push(Math.sin(angle) * radius, y, Math.cos(angle) * radius * 0.9);
      sourceWeights.push(spineWeights(y));
    }
  }
  const bottom = restPositions.length / 3;
  restPositions.push(0, 0.02, 0);
  sourceWeights.push([[0, 1]]);
  const top = restPositions.length / 3;
  restPositions.push(0, HEIGHT + 0.004, 0);
  sourceWeights.push([[BONE_HEIGHTS.length - 1, 1]]);
  const sourceVertexCount = restPositions.length / 3;

  const sourceVertex: number[] = [];
  const uvs: number[] = [];
  const renderedIndex = new Map<string, number>();
  const rendered = (source: number, u: number, v: number) => {
    const key = `${source}:${u}`;
    const existing = renderedIndex.get(key);
    if (existing !== undefined) return existing;
    const index = sourceVertex.length;
    sourceVertex.push(source);
    uvs.push(u, v);
    renderedIndex.set(key, index);
    return index;
  };
  const indices: number[] = [];
  const at = (ring: number, segment: number) => ring * segments + (segment % segments);
  for (let ring = 0; ring < rings - 1; ring++) {
    for (let segment = 0; segment < segments; segment++) {
      const u0 = segment / segments;
      const u1 = (segment + 1) / segments;
      const v0 = ring / (rings - 1);
      const v1 = (ring + 1) / (rings - 1);
      const a = rendered(at(ring, segment), u0, v0);
      const b = rendered(at(ring, segment + 1), u1, v0);
      const c = rendered(at(ring + 1, segment + 1), u1, v1);
      const d = rendered(at(ring + 1, segment), u0, v1);
      indices.push(a, b, c, a, c, d);
    }
  }
  for (let segment = 0; segment < segments; segment++) {
    const u0 = segment / segments;
    const u1 = (segment + 1) / segments;
    indices.push(rendered(bottom, 0.5, 0), rendered(at(0, segment + 1), u1, 0), rendered(at(0, segment), u0, 0));
    indices.push(
      rendered(top, 0.5, 1),
      rendered(at(rings - 1, segment), u0, 1),
      rendered(at(rings - 1, segment + 1), u1, 1),
    );
  }

  const sourceNormals = new Float32Array(sourceVertexCount * 3);
  for (let corner = 0; corner < indices.length; corner += 3) {
    const [a, b, c] = [0, 1, 2].map((k) => sourceVertex[indices[corner + k] ?? 0] ?? 0) as [number, number, number];
    const p = (v: number, axis: number) => restPositions[v * 3 + axis] ?? 0;
    const e1 = [p(b, 0) - p(a, 0), p(b, 1) - p(a, 1), p(b, 2) - p(a, 2)];
    const e2 = [p(c, 0) - p(a, 0), p(c, 1) - p(a, 1), p(c, 2) - p(a, 2)];
    const n = [
      (e1[1] ?? 0) * (e2[2] ?? 0) - (e1[2] ?? 0) * (e2[1] ?? 0),
      (e1[2] ?? 0) * (e2[0] ?? 0) - (e1[0] ?? 0) * (e2[2] ?? 0),
      (e1[0] ?? 0) * (e2[1] ?? 0) - (e1[1] ?? 0) * (e2[0] ?? 0),
    ];
    for (const v of [a, b, c])
      for (let axis = 0; axis < 3; axis++)
        sourceNormals[v * 3 + axis] = (sourceNormals[v * 3 + axis] ?? 0) + (n[axis] ?? 0);
  }

  const count = sourceVertex.length;
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const joints = new Uint16Array(count * 4);
  const weights = new Float32Array(count * 4);
  const puff = new Float32Array(count * 3);
  sourceVertex.forEach((source, index) => {
    const world: Vec3 = [
      restPositions[source * 3] ?? 0,
      restPositions[source * 3 + 1] ?? 0,
      restPositions[source * 3 + 2] ?? 0,
    ];
    positions.set(toLocal(world), index * 3);
    const n = [sourceNormals[source * 3] ?? 0, sourceNormals[source * 3 + 1] ?? 0, sourceNormals[source * 3 + 2] ?? 0];
    const length = Math.hypot(n[0] ?? 0, n[1] ?? 0, n[2] ?? 0) || 1;
    normals.set(
      n.map((value) => value / length),
      index * 3,
    );
    (sourceWeights[source] ?? []).forEach(([joint, weight], k) => {
      joints[index * 4 + k] = joint;
      weights[index * 4 + k] = weight;
    });
    const headness = smooth((world[1] - 1.12) / 0.12);
    puff.set([world[0] * 45 * headness, 1.5 * headness, world[2] * 45 * headness], index * 3);
  });

  const offsets = new Uint32Array(sourceVertexCount + 1);
  const csrJoints: number[] = [];
  const csrWeights: number[] = [];
  sourceWeights.forEach((influences, source) => {
    for (const [joint, weight] of influences) {
      csrJoints.push(joint);
      csrWeights.push(weight);
    }
    offsets[source + 1] = csrJoints.length;
  });

  const indexArray = Uint32Array.from(indices);
  const sourceArray = Uint32Array.from(sourceVertex);
  const triangleCount = indices.length / 3;
  const bodyTriangles = (rings - 1) * segments * 2;
  return {
    name: "CreatureBody",
    geometryName: "CreatureBodyMesh",
    positions,
    normals,
    uvs: [{ name: "UVMap", values: Float32Array.from(uvs) }],
    colors: null,
    skeleton: 0,
    bindMatrix: Float32Array.of(0.01, 0, 0, 0, 0, 0.01, 0, 0, 0, 0, 0.01, 0, ...meshOffset, 1),
    joints,
    weights,
    indices: indexArray,
    groups: [
      { start: 0, triangleCount: bodyTriangles, material: 0 },
      { start: bodyTriangles, triangleCount: triangleCount - bodyTriangles, material: 1 },
    ],
    morphTargets: [{ name: "Puff", defaultWeight: 0, positions: puff, normals: null }],
    sourceVertex: sourceArray,
    sourceVertexCount,
    restPositions: Float32Array.from(restPositions),
    skinWeights: { offsets, joints: Uint16Array.from(csrJoints), weights: Float32Array.from(csrWeights) },
    topology: topologyFingerprint({ indices: indexArray, sourceVertex: sourceArray, sourceVertexCount }),
  };
}

/**
 * A rigid mesh around its node's origin, in meters, named after its node; `place` gives the node's rest position in
 * scene space. `mirrorX` places the mesh under a node scaled by -1 along x, as an exporter mirrors one side of a model.
 */
function rigidMesh(
  name: string,
  geometryName: string,
  shape: "sphere" | "stalk",
  size: number,
  place: Vec3,
  material: number,
  mirrorX = false,
): Mesh {
  const rings = shape === "sphere" ? 10 : 6;
  const segments = 14;
  const positions: number[] = [];
  const normals: number[] = [];
  for (let ring = 0; ring <= rings; ring++) {
    const v = ring / rings;
    for (let segment = 0; segment <= segments; segment++) {
      const angle = (segment / segments) * Math.PI * 2;
      if (shape === "sphere") {
        const phi = v * Math.PI;
        const n: Vec3 = [Math.sin(phi) * Math.sin(angle), Math.cos(phi), Math.sin(phi) * Math.cos(angle)];
        positions.push(n[0] * size, n[1] * size, n[2] * size);
        normals.push(...n);
      } else {
        const radius = size * 0.12 * (1 - v * 0.5);
        positions.push(Math.sin(angle) * radius, v * size, Math.cos(angle) * radius);
        normals.push(Math.sin(angle), 0, Math.cos(angle));
      }
    }
  }
  const indices: number[] = [];
  for (let ring = 0; ring < rings; ring++) {
    for (let segment = 0; segment < segments; segment++) {
      const a = ring * (segments + 1) + segment;
      const b = a + 1;
      const c = a + segments + 2;
      const d = a + segments + 1;
      if (shape === "sphere") indices.push(a, d, c, a, c, b);
      else indices.push(a, b, c, a, c, d);
    }
  }
  const count = positions.length / 3;
  const indexArray = Uint32Array.from(indices);
  const sourceVertex = Uint32Array.from({ length: count }, (_, index) => index);
  const restPositions = Float32Array.from(
    positions.map((value, index) => (mirrorX && index % 3 === 0 ? -value : value) + (place[index % 3] ?? 0)),
  );
  return {
    name,
    geometryName,
    positions: Float32Array.from(positions),
    normals: Float32Array.from(normals),
    uvs: [],
    colors: null,
    skeleton: null,
    bindMatrix: null,
    joints: null,
    weights: null,
    indices: indexArray,
    groups: [{ start: 0, triangleCount: indices.length / 3, material }],
    morphTargets: [],
    sourceVertex,
    sourceVertexCount: count,
    restPositions,
    skinWeights: null,
    topology: topologyFingerprint({ indices: indexArray, sourceVertex, sourceVertexCount: count }),
  };
}

/** A double-sided square facing +Z whose texture cuts it out to a disc. */
function badgeMesh(size: number, place: Vec3, material: number): Mesh {
  const half = size / 2;
  const positions = Float32Array.of(-half, -half, 0, half, -half, 0, half, half, 0, -half, half, 0);
  const indices = Uint32Array.of(0, 1, 2, 0, 2, 3);
  const sourceVertex = Uint32Array.of(0, 1, 2, 3);
  return {
    name: "Badge",
    geometryName: "BadgeMesh",
    positions,
    normals: Float32Array.of(0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1),
    uvs: [{ name: "UVMap", values: Float32Array.of(0, 0, 1, 0, 1, 1, 0, 1) }],
    colors: null,
    skeleton: null,
    bindMatrix: null,
    joints: null,
    weights: null,
    indices,
    groups: [{ start: 0, triangleCount: 2, material }],
    morphTargets: [],
    sourceVertex,
    sourceVertexCount: 4,
    restPositions: positions.map((value, index) => value + (place[index % 3] ?? 0)),
    skinWeights: null,
    topology: topologyFingerprint({ indices, sourceVertex, sourceVertexCount: 4 }),
  };
}

function quatAxisAngle(axis: Vec3, angle: number): Quat {
  const s = Math.sin(angle / 2);
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(angle / 2)];
}

function sampled(node: number, duration: number, value: (t: number) => number[], property: Track["property"]): Track {
  const frames = frameCountFor(duration, FPS);
  const times = Float32Array.from({ length: frames }, (_, frame) => frame / FPS);
  return { node, property, interpolation: "linear", times, values: Float32Array.from([...times].flatMap(value)) };
}

function material(
  name: string,
  baseColor: [number, number, number],
  roughness: number,
  texture: number | null,
): Material {
  return {
    name,
    baseColor: [...baseColor, 1],
    baseColorTexture:
      texture === null ? null : { texture, uvSet: 0, wrapU: "repeat", wrapV: "repeat", transform: null },
    metallic: 0,
    roughness,
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

export interface CreatureTextures {
  skin: Uint8Array | null;
  /** An image whose alpha cuts the badge out to a disc; no badge without it. */
  badge: Uint8Array | null;
}

/** `detail` multiplies the body's rings and segments; 1 gives about 5,800 triangles. */
export function buildCreature(textures: CreatureTextures, detail = 1): SceneDescription {
  const skinTexture = textures.skin;
  const badgeTexture = skinTexture ? 1 : 0;
  const nodes: NodeInput[] = [{ name: "Creature", parent: -1, kind: "empty", translation: [0, 0, 0], mesh: null }];
  BONE_NAMES.forEach((name, bone) => {
    const height = BONE_HEIGHTS[bone] ?? 0;
    const parentHeight = bone === 0 ? 0 : (BONE_HEIGHTS[bone - 1] ?? 0);
    nodes.push({ name, parent: bone, kind: "bone", translation: [0, height - parentHeight, 0], mesh: null });
  });
  const head = BONE_NAMES.length;
  const headHeight = BONE_HEIGHTS[BONE_HEIGHTS.length - 1] ?? 0;
  nodes.push({ name: "HeadEnd", parent: head, kind: "bone", translation: [0, HEIGHT - headHeight, 0], mesh: null });
  const meshes: Mesh[] = [bodyMesh(detail)];
  nodes.push({
    name: "CreatureBody",
    parent: -1,
    kind: "mesh",
    translation: [0, 0.02, 0],
    scale: [0.01, 0.01, 0.01],
    mesh: 0,
  });
  const attach = (name: string, offset: Vec3, mesh: Mesh, scale?: Vec3, parent = head) => {
    meshes.push(mesh);
    nodes.push({
      name,
      parent,
      kind: "mesh",
      translation: offset,
      mesh: meshes.length - 1,
      ...(scale ? { scale } : {}),
    });
  };
  for (const side of [-1, 1]) {
    const eye: Vec3 = [0.075 * side, 0.12, 0.15];
    const eyeName = side < 0 ? "EyeRight" : "EyeLeft";
    attach(
      eyeName,
      eye,
      rigidMesh(eyeName, "Eye", "sphere", 0.045, [eye[0], headHeight + eye[1], eye[2]], 2, side > 0),
      side > 0 ? [-1, 1, 1] : undefined,
    );
    const stalk: Vec3 = [0.06 * side, 0.27, -0.02];
    const antennaName = side < 0 ? "AntennaRight" : "AntennaLeft";
    attach(
      antennaName,
      stalk,
      rigidMesh(antennaName, "Antenna", "stalk", 0.22, [stalk[0], headHeight + stalk[1], stalk[2]], 3),
    );
  }

  if (textures.badge) {
    const badge: Vec3 = [0, 0.16, 0.27];
    attach("Badge", badge, badgeMesh(0.16, badge, 4), undefined, 1);
  }

  const paths = buildNodePaths(nodes);
  const sceneNodes: SceneNode[] = nodes.map((node, index) => ({
    name: node.name,
    path: paths[index] ?? node.name,
    parent: node.parent,
    kind: node.kind,
    translation: node.translation,
    rotation: [0, 0, 0, 1],
    scale: node.scale ?? [1, 1, 1],
    mesh: node.mesh,
  }));
  const joints = BONE_NAMES.map((_, bone) => bone + 1);
  const inverseBindMatrices = new Float32Array(joints.length * 16);
  joints.forEach((_, joint) => {
    inverseBindMatrices.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, -(BONE_HEIGHTS[joint] ?? 0), 0, 1], joint * 16);
  });

  const bodyNode = sceneNodes.findIndex((node) => node.name === "CreatureBody");
  const swayDuration = 2;
  const sway = (t: number) => Math.sin((t / swayDuration) * Math.PI * 2);
  const swayTracks: Track[] = [
    sampled(1, swayDuration, (t) => [0, 0.02 * Math.abs(sway(t)), 0], "translation"),
    sampled(2, swayDuration, (t) => quatAxisAngle([0, 0, 1], 0.32 * sway(t)), "rotation"),
    sampled(3, swayDuration, (t) => quatAxisAngle([0, 0, 1], 0.38 * sway(t - 0.25)), "rotation"),
    sampled(4, swayDuration, (t) => quatAxisAngle([1, 0, 0], 0.3 * sway(t - 0.4)), "rotation"),
    sampled(5, swayDuration, (t) => quatAxisAngle([0, 1, 0], 0.6 * sway(t - 0.5)), "rotation"),
    sampled(bodyNode, swayDuration, (t) => [0.5 + 0.5 * Math.sin((t / swayDuration) * Math.PI * 4)], "weights"),
  ];
  const nodDuration = 1;
  const nodTracks: Track[] = [
    sampled(4, nodDuration, (t) => quatAxisAngle([1, 0, 0], 0.45 * Math.sin(t * Math.PI * 2)), "rotation"),
    sampled(5, nodDuration, (t) => quatAxisAngle([1, 0, 0], 0.35 * Math.sin(t * Math.PI * 2 - 0.5)), "rotation"),
  ];
  const rawClips = [
    { name: "Creature|Sway", duration: swayDuration, tracks: swayTracks },
    { name: "Creature|Nod", duration: nodDuration, tracks: nodTracks },
  ];
  const names = clipNames(rawClips.map((clip) => clip.name));
  const display = displayNames(names);
  const clips: Clip[] = rawClips.map((clip, index) => {
    const frameCount = frameCountFor(clip.duration, FPS);
    const curveTimes = clip.tracks.map((track) => track.times);
    return {
      name: names[index] ?? clip.name,
      displayName: display[index] ?? clip.name,
      fps: FPS,
      duration: clip.duration,
      frameCount,
      tracks: clip.tracks,
      keyTimes: mergeKeyTimes(curveTimes),
      keyedEveryFrame: isKeyedEveryFrame(curveTimes, FPS, frameCount),
    };
  });

  const parts = describeParts(sceneNodes);
  return {
    source: {
      format: "fbx",
      exporter: { name: "Arcue dev harness", version: null },
      fps: FPS,
      originalSpace: SCENE_SPACE,
      conversion: { scale: 1, rotation: [0, 0, 0, 1] },
      warnings: [],
    },
    nodes: sceneNodes,
    meshes,
    skeletons: [{ joints, inverseBindMatrices }],
    materials: [
      material("Skin", [0.8, 0.74, 0.66], 0.62, skinTexture ? 0 : null),
      material("SkinCaps", [0.42, 0.36, 0.3], 0.7, null),
      material("Eye", [0.02, 0.02, 0.025], 0.15, null),
      material("Antenna", [0.55, 0.32, 0.18], 0.5, null),
      {
        ...material("Badge", [1, 1, 1], 0.45, textures.badge ? badgeTexture : null),
        alphaMode: "mask",
        doubleSided: true,
      },
    ],
    textures: [
      ...(skinTexture ? [{ name: "creature_skin.png", mimeType: "image/png", bytes: skinTexture }] : []),
      ...(textures.badge ? [{ name: "badge.png", mimeType: "image/png", bytes: textures.badge }] : []),
    ],
    clips,
    parts,
    bounds: defaultViewBounds(meshes, parts),
  };
}
