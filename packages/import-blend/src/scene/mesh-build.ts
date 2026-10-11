import type { MaterialGroup, MorphTarget, SkinWeights, UvSet } from "@arcue/scene";
import type { Mat4 } from "../math";
import { transformDirection } from "../math";
import type { MeshData } from "./mesh-data";
import { cornerNormals, faceNormals, freeCornerNormals } from "./normals";
import { triangulate } from "./triangulate";

export const MAX_UV_SETS = 8;
const MAX_JOINTS = 65534;

/** A deform bone a mesh's vertex groups may name. */
export interface SkinBone {
  name: string;
  /** Index of the bone's node. */
  node: number;
}

export interface BuiltMesh {
  positions: Float32Array;
  normals: Float32Array;
  uvs: UvSet[];
  colors: Float32Array | null;
  indices: Uint32Array;
  sourceVertex: Uint32Array;
  sourceVertexCount: number;
  /** Groups with the material slot each uses, before slots become scene materials. */
  groups: MaterialGroup[];
  morphTargets: MorphTarget[];
  /** Morph target names in order, for weight tracks. */
  morphKeys: string[];
  /** Skinning, or null for a rigid mesh. */
  skin: {
    /** Node index of each joint; the mesh's own node is last when some vertices have no weights. */
    joints: number[];
    rendered: { joints: Uint16Array; weights: Float32Array };
    source: SkinWeights;
    unweighted: boolean;
    droppedBones: boolean;
  } | null;
  /** UV sets the mesh had beyond `MAX_UV_SETS`. */
  droppedUvSets: number;
}

export interface BuildOptions {
  /** Takes mesh-local Blender coordinates into the scene's axes and units, without translation. */
  conversion: Mat4;
  slotCount: number;
  /** Deform bones of the armature that deforms the mesh, or null for a rigid mesh. */
  skinBones: SkinBone[] | null;
  /** The node of the mesh's object, the joint that unweighted vertices follow. */
  meshNode: number;
}

interface Influence {
  joint: number;
  weight: number;
}

function buildSkin(mesh: MeshData, bones: SkinBone[], meshNode: number) {
  const byName = new Map(bones.map((bone) => [bone.name, bone]));
  const groupBone = mesh.vertexGroupNames.map((name) => byName.get(name) ?? null);
  const used = new Set<SkinBone>();
  const weights = mesh.deformWeights;
  if (weights) {
    for (let i = 0; i < weights.groups.length; i++) {
      const bone = groupBone[weights.groups[i] ?? -1];
      if (bone && (weights.weights[i] ?? 0) > 0) used.add(bone);
    }
  }
  let ordered = bones.filter((bone) => used.has(bone));
  const droppedBones = ordered.length > MAX_JOINTS;
  if (droppedBones) ordered = ordered.slice(0, MAX_JOINTS);
  const jointOf = new Map(ordered.map((bone, index) => [bone, index]));
  const extraJoint = ordered.length;
  const offsets = new Uint32Array(mesh.vertexCount + 1);
  const joints: number[] = [];
  const values: number[] = [];
  const strongestJoints = new Uint16Array(mesh.vertexCount * 4);
  const strongestWeights = new Float32Array(mesh.vertexCount * 4);
  let unweighted = false;
  for (let v = 0; v < mesh.vertexCount; v++) {
    offsets[v] = joints.length;
    const influences: Influence[] = [];
    if (weights) {
      for (let i = weights.offsets[v] ?? 0; i < (weights.offsets[v + 1] ?? 0); i++) {
        const bone = groupBone[weights.groups[i] ?? -1];
        const joint = bone ? jointOf.get(bone) : undefined;
        const weight = weights.weights[i] ?? 0;
        if (joint === undefined || !(weight > 0)) continue;
        const existing = influences.find((influence) => influence.joint === joint);
        if (existing) existing.weight += weight;
        else influences.push({ joint, weight });
      }
    }
    influences.sort((a, b) => b.weight - a.weight || a.joint - b.joint);
    let sum = 0;
    for (const [index, influence] of influences.entries()) {
      joints.push(influence.joint);
      values.push(influence.weight);
      if (index < 4) sum += influence.weight;
    }
    if (sum > 0) {
      for (let k = 0; k < Math.min(4, influences.length); k++) {
        const influence = influences[k];
        if (!influence) continue;
        strongestJoints[v * 4 + k] = influence.joint;
        strongestWeights[v * 4 + k] = influence.weight / sum;
      }
    } else {
      unweighted = true;
      strongestJoints[v * 4] = extraJoint;
      strongestWeights[v * 4] = 1;
    }
  }
  offsets[mesh.vertexCount] = joints.length;
  const jointNodes = ordered.map((bone) => bone.node);
  if (unweighted) jointNodes.push(meshNode);
  return {
    joints: jointNodes,
    strongestJoints,
    strongestWeights,
    source: { offsets, joints: Uint16Array.from(joints), weights: Float32Array.from(values) },
    unweighted,
    droppedBones,
  };
}

function shapeKeyOffsets(mesh: MeshData, conversion: Mat4) {
  const targets: { name: string; defaultWeight: number; offsets: Float32Array }[] = [];
  const groupIndex = new Map(mesh.vertexGroupNames.map((name, index) => [name, index]));
  mesh.shapeKeys.forEach((key, index) => {
    if (index === mesh.referenceKey || key.muted) return;
    const base = mesh.shapeKeys[key.relative] ?? mesh.shapeKeys[mesh.referenceKey];
    if (!base) return;
    const group = key.vertexGroup === "" ? undefined : groupIndex.get(key.vertexGroup);
    const factors = group === undefined ? null : vertexGroupFactors(mesh, group);
    const offsets = new Float32Array(mesh.vertexCount * 3);
    for (let v = 0; v < mesh.vertexCount; v++) {
      const factor = factors ? (factors[v] ?? 0) : 1;
      const d = transformDirection(
        conversion,
        ((key.positions[v * 3] ?? 0) - (base.positions[v * 3] ?? 0)) * factor,
        ((key.positions[v * 3 + 1] ?? 0) - (base.positions[v * 3 + 1] ?? 0)) * factor,
        ((key.positions[v * 3 + 2] ?? 0) - (base.positions[v * 3 + 2] ?? 0)) * factor,
      );
      offsets.set(d, v * 3);
    }
    targets.push({ name: key.name, defaultWeight: Math.min(Math.max(key.value, 0), 1), offsets });
  });
  return targets;
}

function vertexGroupFactors(mesh: MeshData, group: number): Float32Array {
  const factors = new Float32Array(mesh.vertexCount);
  const weights = mesh.deformWeights;
  if (!weights) return factors;
  for (let v = 0; v < mesh.vertexCount; v++) {
    for (let i = weights.offsets[v] ?? 0; i < (weights.offsets[v + 1] ?? 0); i++) {
      if (weights.groups[i] === group) factors[v] = weights.weights[i] ?? 0;
    }
  }
  return factors;
}

function cornerNormalsOf(mesh: MeshData): Float32Array {
  const custom = mesh.customNormals;
  if (custom?.kind === "free") {
    const free = freeCornerNormals(mesh, custom.domain, custom.values);
    if (free) return free;
  }
  return cornerNormals(mesh, {
    sharpFaces: mesh.sharpFaces,
    sharpEdges: mesh.sharpEdges,
    autoSmoothAngle: mesh.autoSmoothAngle,
    customNormals: custom?.kind === "encoded" ? custom.values : null,
  });
}

/**
 * Turns mesh data into Arcue's triangle mesh: corners become rendered vertices, shared where the vertex, normal, UVs
 * and color all match, and triangles sort by material slot. Positions and normals go through `conversion`.
 */
export function buildMesh(mesh: MeshData, options: BuildOptions): BuiltMesh {
  const faces = faceNormals(mesh);
  const normals = cornerNormalsOf(mesh);
  const { corners } = triangulate(mesh, faces);
  const triangleCount = corners.length / 3;
  const slotCount = Math.max(options.slotCount, 1);
  const faceOfTriangle = new Uint32Array(triangleCount);
  {
    let triangle = 0;
    for (let f = 0; f < mesh.faceCount; f++) {
      const size = (mesh.faceOffsets[f + 1] ?? 0) - (mesh.faceOffsets[f] ?? 0);
      for (let k = 0; k < size - 2; k++) faceOfTriangle[triangle++] = f;
    }
  }
  const slotOf = (triangle: number) => {
    const face = faceOfTriangle[triangle] ?? 0;
    const slot = mesh.materialIndices ? (mesh.materialIndices[face] ?? 0) : 0;
    return Math.min(Math.max(slot, 0), slotCount - 1);
  };
  const order = Array.from({ length: triangleCount }, (_, index) => index);
  order.sort((a, b) => slotOf(a) - slotOf(b) || a - b);

  const uvMaps = mesh.uvMaps.slice(0, MAX_UV_SETS);
  const colorValues = mesh.colors;
  const rendered = new Map<number, number[]>();
  const positions: number[] = [];
  const outNormals: number[] = [];
  const uvValues: number[][] = uvMaps.map(() => []);
  const colors: number[] = [];
  const sourceVertex: number[] = [];
  const indices = new Uint32Array(triangleCount * 3);

  const attributesOf = (corner: number): number[] => {
    const values = [normals[corner * 3] ?? 0, normals[corner * 3 + 1] ?? 0, normals[corner * 3 + 2] ?? 0];
    for (const map of uvMaps) values.push(map.values[corner * 2] ?? 0, map.values[corner * 2 + 1] ?? 0);
    if (colorValues) {
      const element = colorValues.domain === "corner" ? corner : (mesh.cornerVerts[corner] ?? 0);
      for (let k = 0; k < 4; k++) values.push(colorValues.values[element * 4 + k] ?? 0);
    }
    return values.map(Math.fround);
  };
  const vertexKeys: number[][] = [];
  const renderedVertex = (corner: number): number => {
    const vertex = mesh.cornerVerts[corner] ?? 0;
    const attributes = attributesOf(corner);
    const candidates = rendered.get(vertex) ?? [];
    for (const candidate of candidates) {
      const known = vertexKeys[candidate];
      if (known?.every((value, k) => value === attributes[k])) return candidate;
    }
    const index = sourceVertex.length;
    candidates.push(index);
    rendered.set(vertex, candidates);
    vertexKeys.push(attributes);
    sourceVertex.push(vertex);
    positions.push(
      ...transformDirection(
        options.conversion,
        mesh.positions[vertex * 3] ?? 0,
        mesh.positions[vertex * 3 + 1] ?? 0,
        mesh.positions[vertex * 3 + 2] ?? 0,
      ),
    );
    const [nx, ny, nz] = transformDirection(
      options.conversion,
      attributes[0] ?? 0,
      attributes[1] ?? 0,
      attributes[2] ?? 0,
    );
    const length = Math.hypot(nx, ny, nz) || 1;
    outNormals.push(nx / length, ny / length, nz / length);
    uvMaps.forEach((_, m) => {
      uvValues[m]?.push(attributes[3 + m * 2] ?? 0, attributes[4 + m * 2] ?? 0);
    });
    if (colorValues) colors.push(...attributes.slice(3 + uvMaps.length * 2, 7 + uvMaps.length * 2));
    return index;
  };

  const groups: MaterialGroup[] = [];
  order.forEach((triangle, position) => {
    for (let k = 0; k < 3; k++) indices[position * 3 + k] = renderedVertex(corners[triangle * 3 + k] ?? 0);
    const slot = slotOf(triangle);
    const last = groups.at(-1);
    if (last && last.material === slot) last.triangleCount++;
    else groups.push({ start: position, triangleCount: 1, material: slot });
  });

  const source = Uint32Array.from(sourceVertex);
  const morphs = shapeKeyOffsets(mesh, options.conversion);
  const morphTargets = morphs.map((target) => {
    const values = new Float32Array(source.length * 3);
    for (let r = 0; r < source.length; r++) {
      const v = source[r] ?? 0;
      values[r * 3] = target.offsets[v * 3] ?? 0;
      values[r * 3 + 1] = target.offsets[v * 3 + 1] ?? 0;
      values[r * 3 + 2] = target.offsets[v * 3 + 2] ?? 0;
    }
    return { name: target.name, defaultWeight: target.defaultWeight, positions: values, normals: null };
  });

  let skin: BuiltMesh["skin"] = null;
  if (options.skinBones) {
    const built = buildSkin(mesh, options.skinBones, options.meshNode);
    const renderedJoints = new Uint16Array(source.length * 4);
    const renderedWeights = new Float32Array(source.length * 4);
    for (let r = 0; r < source.length; r++) {
      const v = source[r] ?? 0;
      renderedJoints.set(built.strongestJoints.subarray(v * 4, v * 4 + 4), r * 4);
      renderedWeights.set(built.strongestWeights.subarray(v * 4, v * 4 + 4), r * 4);
    }
    skin = {
      joints: built.joints,
      rendered: { joints: renderedJoints, weights: renderedWeights },
      source: built.source,
      unweighted: built.unweighted,
      droppedBones: built.droppedBones,
    };
  }

  return {
    positions: Float32Array.from(positions),
    normals: Float32Array.from(outNormals),
    uvs: uvMaps.map((map, m) => ({ name: map.name, values: Float32Array.from(uvValues[m] ?? []) })),
    colors: colorValues ? Float32Array.from(colors) : null,
    indices,
    sourceVertex: source,
    sourceVertexCount: mesh.vertexCount,
    groups,
    morphTargets,
    morphKeys: morphs.map((target) => target.name),
    skin,
    droppedUvSets: Math.max(mesh.uvMaps.length - MAX_UV_SETS, 0),
  };
}
