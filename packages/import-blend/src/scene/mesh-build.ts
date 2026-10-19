import { mix, randomKey } from "../blend/file";
import type { Mat4 } from "../math";
import { transformDirection } from "../math";
import type { MaterialGroup, MorphTarget, SkinWeights, UvSet } from "../types";
import { MAX_UV_SETS, type MeshData } from "./mesh-data";
import { cornerNormals, freeCornerNormals } from "./normals";
import { shapeOffsets } from "./shape-keys";
import { applySmoothByAngle, type SmoothByAngle } from "./smooth-by-angle";
import { triangulate } from "./triangulate";

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
  /** The file's faces as runs of file vertex numbers. */
  faces: { offsets: Uint32Array; vertices: Uint32Array };
  /** The face each triangle comes from; a face's triangles are consecutive, in the order Blender splits it. */
  triangleFaces: Uint32Array;
  /** Groups with the material slot each uses, before slots become scene materials. */
  groups: MaterialGroup[];
  morphTargets: MorphTarget[];
  /** Morph target names in order, for weight tracks. */
  morphKeys: string[];
  /** The range Blender clamps each morph target's weight to: its shape key's slider range. */
  morphRanges: (readonly [number, number])[];
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

/** Influences per vertex that sort by insertion; a vertex with more sorts through an index array. */
const INSERTION_SORT_LIMIT = 16;

/** Whether an influence goes before another: the stronger first, and the lower joint among equal weights. */
function before(weight: number, otherWeight: number, joint: number, otherJoint: number): boolean {
  return weight > otherWeight || (weight === otherWeight && joint < otherJoint);
}

/** The influences of one vertex, joined by joint and sorted strongest first, in arrays reused for every vertex. */
class Influences {
  joints = new Int32Array(8);
  weights = new Float64Array(8);
  #count = 0;
  readonly #slotOfJoint: Int32Array;

  constructor(jointCount: number) {
    this.#slotOfJoint = new Int32Array(jointCount).fill(-1);
  }

  get count(): number {
    return this.#count;
  }

  /** Forgets the previous vertex's influences. */
  clear(): void {
    for (let k = 0; k < this.#count; k++) this.#slotOfJoint[this.joints[k] ?? 0] = -1;
    this.#count = 0;
  }

  add(joint: number, weight: number): void {
    const slot = this.#slotOfJoint[joint] ?? -1;
    if (slot >= 0) {
      this.weights[slot] = (this.weights[slot] ?? 0) + weight;
      return;
    }
    if (this.#count === this.joints.length) {
      const joints = new Int32Array(this.#count * 2);
      const weights = new Float64Array(this.#count * 2);
      joints.set(this.joints);
      weights.set(this.weights);
      this.joints = joints;
      this.weights = weights;
    }
    this.#slotOfJoint[joint] = this.#count;
    this.joints[this.#count] = joint;
    this.weights[this.#count] = weight;
    this.#count++;
  }

  /** Sorts by weight, strongest first, and by joint among equal weights. */
  sort(): void {
    if (this.#count <= INSERTION_SORT_LIMIT) {
      for (let i = 1; i < this.#count; i++) {
        const joint = this.joints[i] ?? 0;
        const weight = this.weights[i] ?? 0;
        let j = i - 1;
        while (j >= 0 && before(weight, this.weights[j] ?? 0, joint, this.joints[j] ?? 0)) {
          this.joints[j + 1] = this.joints[j] ?? 0;
          this.weights[j + 1] = this.weights[j] ?? 0;
          j--;
        }
        this.joints[j + 1] = joint;
        this.weights[j + 1] = weight;
      }
      return;
    }
    const order = Array.from({ length: this.#count }, (_, index) => index);
    order.sort(
      (a, b) => (this.weights[b] ?? 0) - (this.weights[a] ?? 0) || (this.joints[a] ?? 0) - (this.joints[b] ?? 0),
    );
    const joints = Int32Array.from(order, (index) => this.joints[index] ?? 0);
    const weights = Float64Array.from(order, (index) => this.weights[index] ?? 0);
    this.joints.set(joints);
    this.weights.set(weights);
  }
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
  const groupJoint = Int32Array.from(groupBone, (bone) => (bone ? (jointOf.get(bone) ?? -1) : -1));
  const extraJoint = ordered.length;
  const offsets = new Uint32Array(mesh.vertexCount + 1);
  const sourceJoints = new Uint16Array(weights?.groups.length ?? 0);
  const sourceWeights = new Float32Array(weights?.groups.length ?? 0);
  let written = 0;
  const strongestJoints = new Uint16Array(mesh.vertexCount * 4);
  const strongestWeights = new Float32Array(mesh.vertexCount * 4);
  let unweighted = false;
  const limited = { vertices: 0, largestDroppedShare: 0 };
  const influences = new Influences(ordered.length);
  for (let v = 0; v < mesh.vertexCount; v++) {
    offsets[v] = written;
    influences.clear();
    if (weights) {
      for (let i = weights.offsets[v] ?? 0; i < (weights.offsets[v + 1] ?? 0); i++) {
        const group = weights.groups[i] ?? -1;
        const joint = group >= 0 && group < groupJoint.length ? (groupJoint[group] ?? -1) : -1;
        const weight = weights.weights[i] ?? 0;
        if (joint >= 0 && weight > 0) influences.add(joint, weight);
      }
    }
    influences.sort();
    let total = 0;
    for (let k = 0; k < influences.count; k++) total += influences.weights[k] ?? 0;
    const count = total > MIN_DEFORM_WEIGHT ? influences.count : 0;
    let sum = 0;
    for (let k = 0; k < count; k++) {
      sourceJoints[written] = influences.joints[k] ?? 0;
      sourceWeights[written] = influences.weights[k] ?? 0;
      written++;
      if (k < 4) sum += influences.weights[k] ?? 0;
    }
    if (count > 4) {
      limited.vertices++;
      limited.largestDroppedShare = Math.max(limited.largestDroppedShare, (total - sum) / total);
    }
    if (sum > 0) {
      for (let k = 0; k < Math.min(4, count); k++) {
        strongestJoints[v * 4 + k] = influences.joints[k] ?? 0;
        strongestWeights[v * 4 + k] = (influences.weights[k] ?? 0) / sum;
      }
    } else {
      unweighted = true;
      strongestJoints[v * 4] = extraJoint;
      strongestWeights[v * 4] = 1;
    }
  }
  offsets[mesh.vertexCount] = written;
  const jointNodes = ordered.map((bone) => bone.node);
  if (unweighted) jointNodes.push(meshNode);
  return {
    joints: jointNodes,
    strongestJoints,
    strongestWeights,
    source: { offsets, joints: sourceJoints.slice(0, written), weights: sourceWeights.slice(0, written) },
    unweighted,
    droppedBones,
    limited,
  };
}

/** A Blender-space normal, rounded to 32 bits as a vertex stores it, in the scene's axes at unit length. */
function sceneNormal(conversion: Mat4, normal: ArrayLike<number>, at = 0): [number, number, number] {
  const [x, y, z] = transformDirection(
    conversion,
    Math.fround(normal[at] ?? 0),
    Math.fround(normal[at + 1] ?? 0),
    Math.fround(normal[at + 2] ?? 0),
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
 * The most groups a mesh draws its triangles in when they keep the file's face order. A mesh whose faces change slot
 * more often draws its triangles sorted by slot, in one group per slot.
 */
export const MAX_MATERIAL_GROUPS = 256;

/** The order a mesh draws its triangles in, as triangle numbers of the triangulation, and the face of each. */
interface DrawOrder {
  order: Uint32Array;
  faceAt: Uint32Array;
  groups: MaterialGroup[];
}

/**
 * The triangles in the file's face order, with a group for each run of faces in one slot, so that assigning a face
 * another material keeps every triangle's number and the fingerprint. A mesh with more runs than
 * `MAX_MATERIAL_GROUPS` gets its triangles sorted by slot instead.
 */
function drawOrder(mesh: MeshData, faceTriangles: Uint32Array, slotCount: number): DrawOrder {
  const slotOf = (face: number) => Math.min(Math.max(mesh.materialIndices?.[face] ?? 0, 0), slotCount - 1);
  const groups: MaterialGroup[] = [];
  for (let f = 0; f < mesh.faceCount; f++) {
    const start = faceTriangles[f] ?? 0;
    const triangleCount = (faceTriangles[f + 1] ?? 0) - start;
    if (triangleCount === 0) continue;
    const slot = slotOf(f);
    const last = groups[groups.length - 1];
    if (last?.material === slot) last.triangleCount += triangleCount;
    else if (groups.length === MAX_MATERIAL_GROUPS) return sortBySlot(mesh, faceTriangles, slotOf, slotCount);
    else groups.push({ start, triangleCount, material: slot });
  }
  const triangleCount = faceTriangles[mesh.faceCount] ?? 0;
  const order = new Uint32Array(triangleCount);
  for (let triangle = 0; triangle < triangleCount; triangle++) order[triangle] = triangle;
  const faceAt = new Uint32Array(triangleCount);
  for (let f = 0; f < mesh.faceCount; f++) faceAt.fill(f, faceTriangles[f] ?? 0, faceTriangles[f + 1] ?? 0);
  return { order, faceAt, groups };
}

/** The triangles in material slot order, each slot's in face order, and the group of each slot that has any. */
function sortBySlot(
  mesh: MeshData,
  faceTriangles: Uint32Array,
  slotOf: (face: number) => number,
  slotCount: number,
): DrawOrder {
  const counts = new Uint32Array(slotCount);
  for (let f = 0; f < mesh.faceCount; f++) {
    const slot = slotOf(f);
    counts[slot] = (counts[slot] ?? 0) + (faceTriangles[f + 1] ?? 0) - (faceTriangles[f] ?? 0);
  }
  const next = new Uint32Array(slotCount);
  const groups: MaterialGroup[] = [];
  let start = 0;
  for (let slot = 0; slot < slotCount; slot++) {
    next[slot] = start;
    const triangleCount = counts[slot] ?? 0;
    if (triangleCount > 0) groups.push({ start, triangleCount, material: slot });
    start += triangleCount;
  }
  const order = new Uint32Array(start);
  const faceAt = new Uint32Array(start);
  for (let f = 0; f < mesh.faceCount; f++) {
    const slot = slotOf(f);
    for (let triangle = faceTriangles[f] ?? 0; triangle < (faceTriangles[f + 1] ?? 0); triangle++) {
      const position = next[slot] ?? 0;
      order[position] = triangle;
      faceAt[position] = f;
      next[slot] = position + 1;
    }
  }
  return { order, faceAt, groups };
}

/** The bits of 32-bit floats, for hashing them. */
function floatBits(values: Float32Array): Uint32Array {
  return new Uint32Array(values.buffer, values.byteOffset, values.length);
}

/** Adds a 32-bit float's bits to a hash, zero and negative zero alike since they compare equal. */
function mixBits(hash: number, bits: number): number {
  return mix(hash ^ ((bits & 0x7fffffff) === 0 ? 0 : bits));
}

function isNaNBits(bits: number): boolean {
  return (bits & 0x7f800000) === 0x7f800000 && (bits & 0x7fffff) !== 0;
}

/**
 * The rendered vertices of a mesh's face corners: one for each corner whose vertex, normal, UVs and color no earlier
 * corner shares, found through a hash table over the vertex and the attribute values' bits, in typed arrays that grow
 * as vertices are added.
 */
class RenderedVertices {
  /** The source vertex of each rendered vertex. */
  sourceVertex: Uint32Array;
  /** The corner each rendered vertex takes its attributes from. */
  cornerOf: Int32Array;
  count = 0;
  readonly #mesh: MeshData;
  readonly #normals: Float32Array;
  readonly #uvMaps: readonly Float32Array[];
  readonly #colors: MeshData["colors"];
  readonly #normalBits: Uint32Array;
  readonly #uvBits: readonly Uint32Array[];
  readonly #colorBits: Uint32Array | null;
  readonly #seed = randomKey();
  #table: Int32Array;

  constructor(mesh: MeshData, normals: Float32Array, uvMaps: readonly Float32Array[]) {
    this.#mesh = mesh;
    this.#normals = normals;
    this.#uvMaps = uvMaps;
    this.#colors = mesh.colors;
    this.#normalBits = floatBits(normals);
    this.#uvBits = uvMaps.map(floatBits);
    this.#colorBits = mesh.colors ? floatBits(mesh.colors.values) : null;
    const capacity = Math.max(Math.min(mesh.vertexCount, mesh.cornerCount), 16);
    this.sourceVertex = new Uint32Array(capacity);
    this.cornerOf = new Int32Array(capacity);
    this.#table = new Int32Array(tableSize(capacity));
  }

  #colorElement(corner: number): number {
    return this.#colors?.domain === "corner" ? corner : (this.#mesh.cornerVerts[corner] ?? 0);
  }

  /** A hash of the corner's vertex and attributes, or null when one is NaN, which no other corner's equals. */
  #hash(corner: number): number | null {
    let hash = mix(this.#seed ^ (this.#mesh.cornerVerts[corner] ?? 0));
    let nan = false;
    for (let k = 0; k < 3; k++) {
      const bits = this.#normalBits[corner * 3 + k] ?? 0;
      nan ||= isNaNBits(bits);
      hash = mixBits(hash, bits);
    }
    for (const values of this.#uvBits) {
      for (let k = 0; k < 2; k++) {
        const bits = values[corner * 2 + k] ?? 0;
        nan ||= isNaNBits(bits);
        hash = mixBits(hash, bits);
      }
    }
    if (this.#colorBits) {
      const element = this.#colorElement(corner);
      for (let k = 0; k < 4; k++) {
        const bits = this.#colorBits[element * 4 + k] ?? 0;
        nan ||= isNaNBits(bits);
        hash = mixBits(hash, bits);
      }
    }
    return nan ? null : hash;
  }

  /** Whether two corners have the same normal, UVs and color, as 32-bit floats compare. */
  #alike(a: number, b: number): boolean {
    const normals = this.#normals;
    for (let k = 0; k < 3; k++) if ((normals[a * 3 + k] ?? 0) !== (normals[b * 3 + k] ?? 0)) return false;
    for (const values of this.#uvMaps) {
      for (let k = 0; k < 2; k++) if ((values[a * 2 + k] ?? 0) !== (values[b * 2 + k] ?? 0)) return false;
    }
    if (this.#colors) {
      const [first, second] = [this.#colorElement(a), this.#colorElement(b)];
      const colors = this.#colors.values;
      for (let k = 0; k < 4; k++) if ((colors[first * 4 + k] ?? 0) !== (colors[second * 4 + k] ?? 0)) return false;
    }
    return true;
  }

  /** The rendered vertex of a corner: an earlier one with the same vertex and attributes, or a new one. */
  of(corner: number): number {
    const vertex = this.#mesh.cornerVerts[corner] ?? 0;
    const hash = this.#hash(corner);
    if (hash === null) return this.add(vertex, corner);
    const mask = this.#table.length - 1;
    for (let slot = hash & mask; ; slot = (slot + 1) & mask) {
      const entry = this.#table[slot] ?? 0;
      if (entry === 0) {
        const index = this.add(vertex, corner);
        this.#table[slot] = index + 1;
        if (this.count * 3 > this.#table.length * 2) this.#rehash();
        return index;
      }
      const known = entry - 1;
      if (this.sourceVertex[known] === vertex && this.#alike(this.cornerOf[known] ?? 0, corner)) return known;
    }
  }

  /** Adds a rendered vertex of `vertex` with the attributes of `corner`, outside the table. */
  add(vertex: number, corner: number): number {
    if (this.count === this.sourceVertex.length) {
      const capacity = Math.max(this.count * 2, 16);
      const sourceVertex = new Uint32Array(capacity);
      const cornerOf = new Int32Array(capacity);
      sourceVertex.set(this.sourceVertex);
      cornerOf.set(this.cornerOf);
      this.sourceVertex = sourceVertex;
      this.cornerOf = cornerOf;
    }
    const index = this.count++;
    this.sourceVertex[index] = vertex;
    this.cornerOf[index] = corner;
    return index;
  }

  #rehash(): void {
    this.#table = new Int32Array(this.#table.length * 2);
    const mask = this.#table.length - 1;
    for (let index = 0; index < this.count; index++) {
      const hash = this.#hash(this.cornerOf[index] ?? 0);
      if (hash === null) continue;
      let slot = hash & mask;
      while ((this.#table[slot] ?? 0) !== 0) slot = (slot + 1) & mask;
      this.#table[slot] = index + 1;
    }
  }
}

/** Slots for an open-addressed table of `count` entries, a power of two at most two thirds full. */
function tableSize(count: number): number {
  let size = 16;
  while (size * 2 < count * 3) size *= 2;
  return size;
}

/**
 * Turns mesh data into Arcue's triangle mesh: corners become rendered vertices, shared where the vertex, normal, UVs
 * and color all match, and where every shape key shades them alike, and triangles keep the file's face order in a group
 * for each run of faces in one material slot. Positions and normals go through `conversion`.
 */
export function buildMesh(mesh: MeshData, options: BuildOptions): BuiltMesh {
  const normals = cornerNormalsOf(mesh, options.smoothing);
  const { corners, faceTriangles } = triangulate(mesh, options.blenderVersion);
  const drawn = drawOrder(mesh, faceTriangles, Math.max(options.slotCount, 1));
  const { order, groups } = drawn;
  const triangleCount = order.length;
  const uvMaps = mesh.uvMaps.slice(0, MAX_UV_SETS);
  const colorValues = mesh.colors;
  const rendered = new RenderedVertices(
    mesh,
    normals,
    uvMaps.map((map) => map.values),
  );
  const renderedOfCorner = new Int32Array(mesh.cornerCount).fill(-1);
  for (let position = 0; position < triangleCount; position++) {
    const triangle = order[position] ?? 0;
    for (let k = 0; k < 3; k++) {
      const corner = corners[triangle * 3 + k] ?? 0;
      if ((renderedOfCorner[corner] ?? -1) < 0) renderedOfCorner[corner] = rendered.of(corner);
    }
  }

  /** The vertex each split is made from, and the vertex of the basis whose attributes it copies. */
  const splitFrom = new Map<number, number>();
  const roots = new Map<number, number>();
  const rootOf = (index: number) => roots.get(index) ?? index;
  const split = (from: number, corner: number): number => {
    const index = rendered.add(rendered.sourceVertex[from] ?? 0, corner);
    splitFrom.set(index, from);
    roots.set(index, rootOf(from));
    return index;
  };
  const basisNormal = (index: number) =>
    sceneNormal(options.conversion, normals, (rendered.cornerOf[rootOf(index)] ?? 0) * 3);
  const splitWhereShadingDiffers = (shaded: Float32Array) => {
    const shadedAlike = (a: number, b: number) =>
      sameNumber(shaded[a * 3] ?? 0, shaded[b * 3]) &&
      sameNumber(shaded[a * 3 + 1] ?? 0, shaded[b * 3 + 1]) &&
      sameNumber(shaded[a * 3 + 2] ?? 0, shaded[b * 3 + 2]);
    const made = new Map<number, number[]>();
    for (let corner = 0; corner < mesh.cornerCount; corner++) {
      const from = renderedOfCorner[corner] ?? -1;
      const first = rendered.cornerOf[from] ?? corner;
      if (from < 0 || first === corner || shadedAlike(corner, first)) continue;
      const splits = made.get(from) ?? [];
      let index = splits.find((candidate) => shadedAlike(corner, rendered.cornerOf[candidate] ?? corner));
      if (index === undefined) {
        index = split(from, corner);
        splits.push(index);
        made.set(from, splits);
      }
      renderedOfCorner[corner] = index;
    }
  };

  const morphs = shapeOffsets(mesh);
  const shapedNormalOffsets = morphs.map((target) => {
    if (!target.offsets.some((value) => value !== 0)) return null;
    const shaped = new Float32Array(mesh.positions.length);
    for (let i = 0; i < shaped.length; i++) shaped[i] = (mesh.positions[i] ?? 0) + (target.offsets[i] ?? 0);
    const shaded = cornerNormalsOf({ ...mesh, positions: shaped }, options.smoothing);
    splitWhereShadingDiffers(shaded);
    const offsets = new Float32Array(rendered.count * 3);
    for (let r = 0; r < rendered.count; r++) {
      const normal = sceneNormal(options.conversion, shaded, (rendered.cornerOf[r] ?? 0) * 3);
      const basis = basisNormal(r);
      for (let k = 0; k < 3; k++) offsets[r * 3 + k] = (normal[k] ?? 0) - (basis[k] ?? 0);
    }
    return offsets;
  });

  const count = rendered.count;
  const source = rendered.sourceVertex.slice(0, count);
  const positions = new Float32Array(count * 3);
  const outNormals = new Float32Array(count * 3);
  const uvValues = uvMaps.map(() => new Float32Array(count * 2));
  const colors = colorValues ? new Float32Array(count * 4) : null;
  const conversion = options.conversion;
  for (let r = 0; r < count; r++) {
    const vertex = source[r] ?? 0;
    const corner = rendered.cornerOf[rootOf(r)] ?? 0;
    const x = mesh.positions[vertex * 3] ?? 0;
    const y = mesh.positions[vertex * 3 + 1] ?? 0;
    const z = mesh.positions[vertex * 3 + 2] ?? 0;
    for (let k = 0; k < 3; k++) {
      positions[r * 3 + k] = (conversion[k] ?? 0) * x + (conversion[4 + k] ?? 0) * y + (conversion[8 + k] ?? 0) * z;
    }
    outNormals.set(basisNormal(r), r * 3);
    for (let m = 0; m < uvMaps.length; m++) {
      const [from, to] = [uvMaps[m]?.values, uvValues[m]];
      if (!from || !to) continue;
      to[r * 2] = from[corner * 2] ?? 0;
      to[r * 2 + 1] = from[corner * 2 + 1] ?? 0;
    }
    if (colors && colorValues) {
      const element = colorValues.domain === "corner" ? corner : (mesh.cornerVerts[corner] ?? 0);
      for (let k = 0; k < 4; k++) colors[r * 4 + k] = colorValues.values[element * 4 + k] ?? 0;
    }
  }

  const indices = new Uint32Array(triangleCount * 3);
  for (let position = 0; position < triangleCount; position++) {
    const triangle = order[position] ?? 0;
    for (let k = 0; k < 3; k++) indices[position * 3 + k] = renderedOfCorner[corners[triangle * 3 + k] ?? 0] ?? 0;
  }

  const morphTargets = morphs.map((target, index): MorphTarget => {
    const values = new Float32Array(count * 3);
    const normalOffsets = new Float32Array(count * 3);
    const shading = shapedNormalOffsets[index];
    if (shading) normalOffsets.set(shading);
    const { offsets } = target;
    for (let r = 0; r < count; r++) {
      const v = (source[r] ?? 0) * 3;
      const moved = transformDirection(conversion, offsets[v] ?? 0, offsets[v + 1] ?? 0, offsets[v + 2] ?? 0);
      values.set(moved, r * 3);
      const from = shading && r * 3 >= shading.length ? splitFrom.get(r) : undefined;
      if (from !== undefined) normalOffsets.copyWithin(r * 3, from * 3, from * 3 + 3);
    }
    const [min, max] = target.range;
    return {
      name: target.name,
      defaultWeight: target.defaultWeight,
      range: [min, max],
      positions: values,
      normals: normalOffsets,
    };
  });

  let skin: BuiltMesh["skin"] = null;
  if (options.skinBones) {
    const built = buildSkin(mesh, options.skinBones, options.meshNode);
    const renderedJoints = new Uint16Array(count * 4);
    const renderedWeights = new Float32Array(count * 4);
    for (let r = 0; r < count; r++) {
      const v = source[r] ?? 0;
      for (let k = 0; k < 4; k++) {
        renderedJoints[r * 4 + k] = built.strongestJoints[v * 4 + k] ?? 0;
        renderedWeights[r * 4 + k] = built.strongestWeights[v * 4 + k] ?? 0;
      }
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
    positions,
    normals: outNormals,
    uvs: uvMaps.map((map, m) => ({ name: map.name, values: uvValues[m] ?? new Float32Array(0) })),
    colors,
    indices,
    sourceVertex: source,
    sourceVertexCount: mesh.vertexCount,
    faces: { offsets: Uint32Array.from(mesh.faceOffsets), vertices: Uint32Array.from(mesh.cornerVerts) },
    triangleFaces: drawn.faceAt,
    groups,
    morphTargets,
    morphKeys: morphs.map((target) => target.name),
    morphRanges: morphs.map((target) => target.range),
    skin,
    droppedUvSets: Math.max(mesh.uvMaps.length - MAX_UV_SETS, 0),
  };
}
