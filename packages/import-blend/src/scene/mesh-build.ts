import type { MaterialGroup, MorphTarget, SkinWeights, UvSet } from "@arcue/scene";
import type { Mat4 } from "../math";
import { transformDirection } from "../math";
import type { MeshData } from "./mesh-data";
import { cornerNormals, freeCornerNormals } from "./normals";
import { applySmoothByAngle, type SmoothByAngle } from "./smooth-by-angle";
import { triangulate } from "./triangulate";

export const MAX_UV_SETS = 8;
const MAX_JOINTS = 65534;
/** Blender's armature deform leaves a vertex in place unless its weights add up to more than this. */
const MIN_DEFORM_WEIGHT = 0.0001;

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
  /** The range Blender clamps each morph target's weight to: its shape key's slider range. */
  morphRanges: [number, number][];
  /** Skinning, or null for a rigid mesh. */
  skin: {
    /** Node index of each joint; the mesh's own node is last when some vertices have no weights. */
    joints: number[];
    rendered: { joints: Uint16Array; weights: Float32Array };
    source: SkinWeights;
    unweighted: boolean;
    droppedBones: boolean;
    /** Vertices with more bones than rendering takes, and the largest share of a vertex's weight they lose. */
    limited: { vertices: number; largestDroppedShare: number };
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
  /** The object's Smooth by Angle modifier, applied to the basis shape and to each shape key on its own. */
  smoothing: SmoothByAngle | null;
  /** The version of Blender that saved the file, whose tessellation the triangles follow. */
  blenderVersion: number;
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
  const limited = { vertices: 0, largestDroppedShare: 0 };
  for (let v = 0; v < mesh.vertexCount; v++) {
    offsets[v] = joints.length;
    let influences: Influence[] = [];
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
    const total = influences.reduce((sum, influence) => sum + influence.weight, 0);
    if (!(total > MIN_DEFORM_WEIGHT)) influences = [];
    let sum = 0;
    for (const [index, influence] of influences.entries()) {
      joints.push(influence.joint);
      values.push(influence.weight);
      if (index < 4) sum += influence.weight;
    }
    if (influences.length > 4) {
      limited.vertices++;
      limited.largestDroppedShare = Math.max(limited.largestDroppedShare, (total - sum) / total);
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
    limited,
  };
}

/** Each shape key's offsets at full weight from the shape it is relative to, in Blender's space. */
function shapeKeyOffsets(mesh: MeshData) {
  const targets: { name: string; defaultWeight: number; range: [number, number]; offsets: Float32Array }[] = [];
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
      for (let k = 0; k < 3; k++) {
        offsets[v * 3 + k] = ((key.positions[v * 3 + k] ?? 0) - (base.positions[v * 3 + k] ?? 0)) * factor;
      }
    }
    const range: [number, number] = key.max > key.min ? [key.min, key.max] : [0, 1];
    targets.push({ name: key.name, defaultWeight: Math.min(Math.max(key.value, range[0]), range[1]), range, offsets });
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

/** A Blender-space normal, rounded to 32 bits as a vertex stores it, in the scene's axes at unit length. */
function sceneNormal(conversion: Mat4, normal: readonly number[]): [number, number, number] {
  const [x, y, z] = transformDirection(
    conversion,
    Math.fround(normal[0] ?? 0),
    Math.fround(normal[1] ?? 0),
    Math.fround(normal[2] ?? 0),
  );
  const length = Math.hypot(x, y, z) || 1;
  return [x / length, y / length, z / length];
}

function sameNumber(a: number, b: number | undefined): boolean {
  return a === b || (Number.isNaN(a) && Number.isNaN(b));
}

function cornerNormalsOf(source: MeshData, smoothing: SmoothByAngle | null): Float32Array {
  const mesh = smoothing ? applySmoothByAngle(source, smoothing) : source;
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
 * and color all match, and where every shape key shades them alike, and triangles sort by material slot. Positions and
 * normals go through `conversion`.
 */
export function buildMesh(mesh: MeshData, options: BuildOptions): BuiltMesh {
  const normals = cornerNormalsOf(mesh, options.smoothing);
  const { corners } = triangulate(mesh, options.blenderVersion);
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
  const cornerOf: number[] = [];
  const renderedOfCorner = new Int32Array(mesh.cornerCount).fill(-1);
  const renderedVertex = (corner: number): number => {
    const vertex = mesh.cornerVerts[corner] ?? 0;
    const attributes = attributesOf(corner);
    const candidates = rendered.get(vertex) ?? [];
    for (const candidate of candidates) {
      const known = vertexKeys[candidate];
      if (known?.every((value, k) => value === attributes[k])) {
        renderedOfCorner[corner] = candidate;
        return candidate;
      }
    }
    const index = sourceVertex.length;
    renderedOfCorner[corner] = index;
    candidates.push(index);
    rendered.set(vertex, candidates);
    vertexKeys.push(attributes);
    cornerOf.push(corner);
    sourceVertex.push(vertex);
    positions.push(
      ...transformDirection(
        options.conversion,
        mesh.positions[vertex * 3] ?? 0,
        mesh.positions[vertex * 3 + 1] ?? 0,
        mesh.positions[vertex * 3 + 2] ?? 0,
      ),
    );
    outNormals.push(...sceneNormal(options.conversion, attributes));
    uvMaps.forEach((_, m) => {
      uvValues[m]?.push(attributes[3 + m * 2] ?? 0, attributes[4 + m * 2] ?? 0);
    });
    if (colorValues) colors.push(...attributes.slice(3 + uvMaps.length * 2, 7 + uvMaps.length * 2));
    return index;
  };

  const groups: MaterialGroup[] = [];
  const indexCorners = new Uint32Array(triangleCount * 3);
  order.forEach((triangle, position) => {
    for (let k = 0; k < 3; k++) {
      const corner = corners[triangle * 3 + k] ?? 0;
      indexCorners[position * 3 + k] = corner;
      indices[position * 3 + k] = renderedVertex(corner);
    }
    const slot = slotOf(triangle);
    const last = groups.at(-1);
    if (last && last.material === slot) last.triangleCount++;
    else groups.push({ start: position, triangleCount: 1, material: slot });
  });

  const splitFrom = new Map<number, number>();
  const split = (from: number, corner: number): number => {
    const index = sourceVertex.length;
    splitFrom.set(index, from);
    cornerOf.push(corner);
    sourceVertex.push(sourceVertex[from] ?? 0);
    positions.push(...positions.slice(from * 3, from * 3 + 3));
    outNormals.push(...outNormals.slice(from * 3, from * 3 + 3));
    for (const values of uvValues) values.push(...values.slice(from * 2, from * 2 + 2));
    if (colorValues) colors.push(...colors.slice(from * 4, from * 4 + 4));
    return index;
  };
  const splitWhereShadingDiffers = (shaded: Float32Array) => {
    const made = new Map<string, number>();
    for (let corner = 0; corner < mesh.cornerCount; corner++) {
      const from = renderedOfCorner[corner] ?? -1;
      const first = cornerOf[from] ?? corner;
      if (from < 0 || first === corner) continue;
      const [x = 0, y = 0, z = 0] = [shaded[corner * 3], shaded[corner * 3 + 1], shaded[corner * 3 + 2]];
      const known = first * 3;
      if (sameNumber(x, shaded[known]) && sameNumber(y, shaded[known + 1]) && sameNumber(z, shaded[known + 2]))
        continue;
      const key = `${from} ${x} ${y} ${z}`;
      const index = made.get(key) ?? split(from, corner);
      made.set(key, index);
      renderedOfCorner[corner] = index;
    }
  };

  const morphs = shapeKeyOffsets(mesh);
  const shapedNormalOffsets = morphs.map((target) => {
    if (!target.offsets.some((value) => value !== 0)) return null;
    const shaped = new Float32Array(mesh.positions.length);
    for (let i = 0; i < shaped.length; i++) shaped[i] = (mesh.positions[i] ?? 0) + (target.offsets[i] ?? 0);
    const shaded = cornerNormalsOf({ ...mesh, positions: shaped }, options.smoothing);
    splitWhereShadingDiffers(shaded);
    const offsets = new Float32Array(sourceVertex.length * 3);
    for (let r = 0; r < sourceVertex.length; r++) {
      const corner = cornerOf[r] ?? 0;
      const normal = sceneNormal(options.conversion, Array.from(shaded.subarray(corner * 3, corner * 3 + 3)));
      for (let k = 0; k < 3; k++) offsets[r * 3 + k] = (normal[k] ?? 0) - (outNormals[r * 3 + k] ?? 0);
    }
    return offsets;
  });
  indexCorners.forEach((corner, slot) => {
    indices[slot] = renderedOfCorner[corner] ?? 0;
  });

  const source = Uint32Array.from(sourceVertex);
  const morphTargets = morphs.map((target, index) => {
    const values = new Float32Array(source.length * 3);
    const normalOffsets = new Float32Array(source.length * 3);
    const shading = shapedNormalOffsets[index];
    if (shading) normalOffsets.set(shading);
    for (let r = 0; r < source.length; r++) {
      const v = source[r] ?? 0;
      const offset = target.offsets.subarray(v * 3, v * 3 + 3);
      values.set(transformDirection(options.conversion, offset[0] ?? 0, offset[1] ?? 0, offset[2] ?? 0), r * 3);
      const from = splitFrom.get(r);
      if (shading && r * 3 >= shading.length && from !== undefined) {
        normalOffsets.copyWithin(r * 3, from * 3, from * 3 + 3);
      }
    }
    return { name: target.name, defaultWeight: target.defaultWeight, positions: values, normals: normalOffsets };
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
      limited: built.limited,
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
    morphRanges: morphs.map((target) => target.range),
    skin,
    droppedUvSets: Math.max(mesh.uvMaps.length - MAX_UV_SETS, 0),
  };
}
