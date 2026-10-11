import type { MeshData } from "./mesh-data";

type Vec = [number, number, number];

const PI2 = Math.PI * 2;
/** Blender's `LNOR_SPACE_TRIGO_THRESHOLD`. */
const TRIGO_THRESHOLD = 1 - 1e-4;
const UNSET = -2_147_483_648;
const INVALID = -1;

function at(values: ArrayLike<number>, index: number): number {
  return values[index] ?? 0;
}

function vertex(positions: Float32Array, index: number): Vec {
  return [at(positions, index * 3), at(positions, index * 3 + 1), at(positions, index * 3 + 2)];
}

function sub(a: Vec, b: Vec): Vec {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function dot(a: Vec, b: Vec): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: Vec, b: Vec): Vec {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function scaled(a: Vec, factor: number): Vec {
  return [a[0] * factor, a[1] * factor, a[2] * factor];
}

function lengthOf(a: Vec): number {
  return Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
}

function normalize(a: Vec): Vec {
  const length = lengthOf(a);
  return length > 0 ? [a[0] / length, a[1] / length, a[2] / length] : [0, 0, 0];
}

/** Blender's `safe_acos_approx`, which its normal code uses to weigh faces by corner angle. */
export function acosApprox(x: number): number {
  const f = Math.abs(x);
  const m = f < 1 ? 1 - (1 - f) : 1;
  const a = Math.sqrt(1 - m) * (1.5707963267 + m * (-0.213300989 + m * (0.077980478 + m * -0.02164095)));
  return x < 0 ? Math.PI - a : a;
}

function store(target: Float32Array, index: number, value: Vec): void {
  target[index * 3] = value[0];
  target[index * 3 + 1] = value[1];
  target[index * 3 + 2] = value[2];
}

function read(source: Float32Array, index: number): Vec {
  return [at(source, index * 3), at(source, index * 3 + 1), at(source, index * 3 + 2)];
}

/** Face normals as Blender computes them: a cross product for triangles and quads, Newell's method otherwise. */
export function faceNormals(
  mesh: Pick<MeshData, "positions" | "faceOffsets" | "cornerVerts" | "faceCount">,
): Float32Array {
  const { positions, faceOffsets, cornerVerts } = mesh;
  const normals = new Float32Array(mesh.faceCount * 3);
  for (let f = 0; f < mesh.faceCount; f++) {
    const start = at(faceOffsets, f);
    const size = at(faceOffsets, f + 1) - start;
    const v = (k: number) => vertex(positions, at(cornerVerts, start + k));
    let normal: Vec;
    if (size === 3) normal = cross(sub(v(0), v(1)), sub(v(1), v(2)));
    else if (size === 4) normal = cross(sub(v(0), v(2)), sub(v(1), v(3)));
    else {
      normal = [0, 0, 0];
      let previous = v(size - 1);
      for (let k = 0; k < size; k++) {
        const current = v(k);
        normal[0] += (previous[1] - current[1]) * (previous[2] + current[2]);
        normal[1] += (previous[2] - current[2]) * (previous[0] + current[0]);
        normal[2] += (previous[0] - current[0]) * (previous[1] + current[1]);
        previous = current;
      }
    }
    const unit = normalize(normal);
    store(normals, f, lengthOf(unit) === 0 ? [0, 0, 1] : unit);
  }
  return normals;
}

/**
 * Vertex normals: face normals weighted by the angle of each face's corner at the vertex. As in Blender, a vertex
 * without faces points away from the origin, and one whose corner angles are all zero has no normal.
 */
export function vertexNormals(
  mesh: Pick<MeshData, "positions" | "faceOffsets" | "cornerVerts" | "faceCount" | "vertexCount">,
  faces: Float32Array,
): Float32Array {
  const { positions, faceOffsets, cornerVerts } = mesh;
  const sums = new Float64Array(mesh.vertexCount * 3);
  const inFace = new Uint8Array(mesh.vertexCount);
  for (let f = 0; f < mesh.faceCount; f++) {
    const start = at(faceOffsets, f);
    const end = at(faceOffsets, f + 1);
    const size = end - start;
    if (size < 3) continue;
    const normal = read(faces, f);
    for (let c = start; c < end; c++) {
      const current = at(cornerVerts, c);
      inFace[current] = 1;
      const previous = at(cornerVerts, c === start ? end - 1 : c - 1);
      const next = at(cornerVerts, c + 1 === end ? start : c + 1);
      const here = vertex(positions, current);
      const toPrevious = normalize(sub(vertex(positions, previous), here));
      const toNext = normalize(sub(vertex(positions, next), here));
      const weight = acosApprox(dot(toPrevious, toNext));
      sums[current * 3] = at(sums, current * 3) + normal[0] * weight;
      sums[current * 3 + 1] = at(sums, current * 3 + 1) + normal[1] * weight;
      sums[current * 3 + 2] = at(sums, current * 3 + 2) + normal[2] * weight;
    }
  }
  const normals = new Float32Array(mesh.vertexCount * 3);
  for (let v = 0; v < mesh.vertexCount; v++) {
    let normal = normalize([at(sums, v * 3), at(sums, v * 3 + 1), at(sums, v * 3 + 2)]);
    if (!inFace[v]) normal = normalize(vertex(positions, v));
    store(normals, v, normal);
  }
  return normals;
}

interface CornerSpace {
  lnor: Vec;
  ref: Vec;
  ortho: Vec;
  alpha: number;
  beta: number;
}

/** Blender's `corner_fan_space_define`: the frame custom normal data is relative to. */
function defineSpace(lnor: Vec, vecRef: Vec, vecOther: Vec, edgeVectors: readonly Vec[]): CornerSpace {
  const dotRef = dot(vecRef, lnor);
  const dotOther = dot(vecOther, lnor);
  if (Math.abs(dotRef) >= TRIGO_THRESHOLD || Math.abs(dotOther) >= TRIGO_THRESHOLD) {
    return { lnor, ref: [0, 0, 0], ortho: [0, 0, 0], alpha: 0, beta: 0 };
  }
  let alpha: number;
  if (edgeVectors.length > 0) {
    let sum = 0;
    for (const edge of edgeVectors) sum += acosApprox(dot(edge, lnor));
    alpha = sum / edgeVectors.length;
  } else {
    alpha = (acosApprox(dotRef) + acosApprox(dotOther)) / 2;
  }
  const ref = normalize(sub(vecRef, scaled(lnor, dotRef)));
  const ortho = normalize(cross(lnor, ref));
  const other = normalize(sub(vecOther, scaled(lnor, dotOther)));
  const cosine = dot(ref, other);
  let beta = PI2;
  if (cosine < TRIGO_THRESHOLD) {
    const angle = acosApprox(cosine);
    beta = dot(ortho, other) < 0 ? PI2 - angle : angle;
  }
  return { lnor, ref, ortho, alpha, beta };
}

/** Blender's `corner_space_custom_data_to_normal`. */
function customNormal(space: CornerSpace, alphaData: number, betaData: number): Vec {
  if (alphaData === 0 || space.alpha === 0 || space.beta === 0) return space.lnor;
  const alphaFactor = alphaData / 32767;
  const alpha = (alphaFactor > 0 ? space.alpha : PI2 - space.alpha) * alphaFactor;
  const betaFactor = betaData / 32767;
  const result = scaled(space.lnor, Math.cos(alpha));
  const sinAlpha = Math.sin(alpha);
  if (betaFactor === 0) {
    return [
      result[0] + space.ref[0] * sinAlpha,
      result[1] + space.ref[1] * sinAlpha,
      result[2] + space.ref[2] * sinAlpha,
    ];
  }
  const beta = (betaFactor > 0 ? space.beta : PI2 - space.beta) * betaFactor;
  const a = sinAlpha * Math.cos(beta);
  const b = sinAlpha * Math.sin(beta);
  return [
    result[0] + space.ref[0] * a + space.ortho[0] * b,
    result[1] + space.ref[1] * a + space.ortho[1] * b,
    result[2] + space.ref[2] * a + space.ortho[2] * b,
  ];
}

type Topology = Pick<
  MeshData,
  "positions" | "edges" | "faceOffsets" | "cornerVerts" | "cornerEdges" | "faceCount" | "cornerCount" | "edgeCount"
>;

function isSharp(edgeToCorners: Int32Array, edge: number): boolean {
  if (edge < 0) return true;
  const second = at(edgeToCorners, edge * 2 + 1);
  return second === UNSET || second === INVALID;
}

/**
 * Blender's `build_edge_to_corner_map_with_flip_and_sharp`: the first two corners of each edge, with the second set to
 * INVALID for a sharp edge, an edge of a flat face, an edge with more than two faces or between faces that wind
 * opposite ways, and left UNSET for a boundary edge.
 */
function edgeToCorners(
  mesh: Topology,
  faceOf: Int32Array,
  sharpFace: (face: number) => boolean,
  sharpEdge: (edge: number, firstCorner: number, face: number) => boolean,
): Int32Array {
  const map = new Int32Array(mesh.edgeCount * 2);
  const touched = new Uint8Array(mesh.edgeCount);
  for (let corner = 0; corner < mesh.cornerCount; corner++) {
    const edge = at(mesh.cornerEdges, corner);
    if (edge < 0) continue;
    const face = at(faceOf, corner);
    const vert = at(mesh.cornerVerts, corner);
    if (!touched[edge]) {
      touched[edge] = 1;
      map[edge * 2] = corner;
      map[edge * 2 + 1] = sharpFace(face) ? INVALID : UNSET;
    } else if (at(map, edge * 2 + 1) === UNSET) {
      const first = at(map, edge * 2);
      if (sharpFace(face) || sharpEdge(edge, first, face) || vert === at(mesh.cornerVerts, first)) {
        map[edge * 2 + 1] = INVALID;
      } else {
        map[edge * 2 + 1] = corner;
      }
    } else if (!isSharp(map, edge)) {
      map[edge * 2 + 1] = INVALID;
    }
  }
  return map;
}

function facePrevious(mesh: Topology, faceOf: Int32Array, corner: number): number {
  const face = at(faceOf, corner);
  const start = at(mesh.faceOffsets, face);
  return corner === start ? at(mesh.faceOffsets, face + 1) - 1 : corner - 1;
}

function faceNext(mesh: Topology, faceOf: Int32Array, corner: number): number {
  const face = at(faceOf, corner);
  const end = at(mesh.faceOffsets, face + 1);
  return corner + 1 === end ? at(mesh.faceOffsets, face) : corner + 1;
}

/** Blender's `loop_manifold_fan_around_vert_next`: steps across `edge` to the next corner of the fan. */
function fanNext(
  mesh: Topology,
  faceOf: Int32Array,
  map: Int32Array,
  edge: number,
  pivot: number,
  state: { curr: number; vert: number },
): void {
  const origVert = at(mesh.cornerVerts, state.curr);
  const first = at(map, edge * 2);
  const second = at(map, edge * 2 + 1);
  const next = first === state.curr ? second : first;
  const nextVert = at(mesh.cornerVerts, next);
  if ((origVert === nextVert && origVert === pivot) || (origVert !== nextVert && origVert !== pivot)) {
    state.vert = next;
    state.curr = facePrevious(mesh, faceOf, next);
  } else {
    state.curr = faceNext(mesh, faceOf, next);
    state.vert = state.curr;
  }
}

function otherVertex(mesh: Topology, edge: number, vert: number): number {
  const a = at(mesh.edges, edge * 2);
  return a === vert ? at(mesh.edges, edge * 2 + 1) : a;
}

/** Blender's `corner_split_generator_check_cyclic_smooth_fan`. */
function startsCyclicFan(
  mesh: Topology,
  faceOf: Int32Array,
  map: Int32Array,
  skip: Uint8Array,
  corner: number,
  previous: number,
): boolean {
  const pivot = at(mesh.cornerVerts, corner);
  const state = { curr: previous, vert: corner };
  let edge = at(mesh.cornerEdges, previous);
  if (isSharp(map, edge)) return false;
  skip[corner] = 1;
  for (;;) {
    fanNext(mesh, faceOf, map, edge, pivot, state);
    edge = at(mesh.cornerEdges, state.curr);
    if (isSharp(map, edge)) return false;
    if (skip[state.vert]) return state.vert === corner;
    skip[state.vert] = 1;
  }
}

export interface NormalOptions {
  sharpFaces: Uint8Array | null;
  sharpEdges: Uint8Array | null;
  /** Blender 4.0 and earlier: edges sharper than this angle split normals. */
  autoSmoothAngle: number | null;
  /** Short pairs in Blender's corner space encoding, two per corner. */
  customNormals: Int16Array | null;
}

/** Normals of each face corner, the way Blender shades the mesh. */
export function cornerNormals(mesh: Topology & Pick<MeshData, "vertexCount">, options: NormalOptions): Float32Array {
  const faces = faceNormals(mesh);
  const verts = vertexNormals(mesh, faces);
  const result = new Float32Array(mesh.cornerCount * 3);
  const faceOf = new Int32Array(mesh.cornerCount);
  for (let f = 0; f < mesh.faceCount; f++) {
    faceOf.fill(f, at(mesh.faceOffsets, f), at(mesh.faceOffsets, f + 1));
  }
  const sharpFace = (face: number) => (options.sharpFaces ? at(options.sharpFaces, face) !== 0 : false);
  const anySharpFace = options.sharpFaces?.some((value) => value !== 0) ?? false;
  const allSharpFaces = mesh.faceCount > 0 && (options.sharpFaces?.every((value) => value !== 0) ?? false);
  const anySharpEdge = options.sharpEdges?.some((value) => value !== 0) ?? false;
  const legacy = options.autoSmoothAngle !== null;

  if (!options.customNormals && !legacy && !anySharpEdge && !anySharpFace) {
    for (let c = 0; c < mesh.cornerCount; c++) store(result, c, read(verts, at(mesh.cornerVerts, c)));
    return result;
  }
  if (!options.customNormals && allSharpFaces) {
    for (let c = 0; c < mesh.cornerCount; c++) store(result, c, read(faces, at(faceOf, c)));
    return result;
  }

  const splitCosine = options.autoSmoothAngle === null ? -1 : Math.cos(options.autoSmoothAngle);
  const map = edgeToCorners(mesh, faceOf, sharpFace, (edge, firstCorner, face) => {
    if (options.sharpEdges && at(options.sharpEdges, edge) !== 0) return true;
    if (options.autoSmoothAngle === null) return false;
    return dot(read(faces, at(faceOf, firstCorner)), read(faces, face)) < splitCosine;
  });

  for (let c = 0; c < mesh.cornerCount; c++) store(result, c, read(verts, at(mesh.cornerVerts, c)));
  const custom = options.customNormals;
  const skip = new Uint8Array(mesh.cornerCount);
  for (let face = 0; face < mesh.faceCount; face++) {
    const start = at(mesh.faceOffsets, face);
    const end = at(mesh.faceOffsets, face + 1);
    for (let corner = start; corner < end; corner++) {
      const previous = corner === start ? end - 1 : corner - 1;
      const edge = at(mesh.cornerEdges, corner);
      const previousEdge = at(mesh.cornerEdges, previous);
      if (!isSharp(map, edge) && (skip[corner] || !startsCyclicFan(mesh, faceOf, map, skip, corner, previous)))
        continue;
      if (isSharp(map, edge) && isSharp(map, previousEdge)) {
        singleCorner(mesh, faces, face, corner, previous, custom, result);
      } else {
        fanCorners(mesh, faceOf, map, faces, corner, previous, custom, result);
      }
    }
  }
  return result;
}

function singleCorner(
  mesh: Topology,
  faces: Float32Array,
  face: number,
  corner: number,
  previous: number,
  custom: Int16Array | null,
  result: Float32Array,
): void {
  const normal = read(faces, face);
  if (!custom) {
    store(result, corner, normal);
    return;
  }
  const pivot = at(mesh.cornerVerts, corner);
  const here = vertex(mesh.positions, pivot);
  const nextVert = otherVertex(mesh, at(mesh.cornerEdges, corner), pivot);
  const previousVert = otherVertex(mesh, at(mesh.cornerEdges, previous), pivot);
  const vecCurr = normalize(sub(vertex(mesh.positions, nextVert), here));
  const vecPrev = normalize(sub(vertex(mesh.positions, previousVert), here));
  const space = defineSpace(normal, vecCurr, vecPrev, []);
  store(result, corner, normalize(customNormal(space, at(custom, corner * 2), at(custom, corner * 2 + 1))));
}

/** Blender's `split_corner_normal_fan_do`: walks the smooth fan that starts at `corner`. */
function fanCorners(
  mesh: Topology,
  faceOf: Int32Array,
  map: Int32Array,
  faces: Float32Array,
  corner: number,
  previous: number,
  custom: Int16Array | null,
  result: Float32Array,
): void {
  const pivot = at(mesh.cornerVerts, corner);
  const here = vertex(mesh.positions, pivot);
  const edgeOrig = at(mesh.cornerEdges, corner);
  const vecOrg = normalize(sub(vertex(mesh.positions, otherVertex(mesh, edgeOrig, pivot)), here));
  let vecPrev = vecOrg;
  let vecCurr: Vec = vecOrg;
  const edgeVectors: Vec[] = [vecOrg];
  const processed: number[] = [];
  let sum: Vec = [0, 0, 0];
  const state = { curr: previous, vert: corner };
  for (let guard = 0; guard <= mesh.cornerCount; guard++) {
    const edge = at(mesh.cornerEdges, state.curr);
    vecCurr = normalize(sub(vertex(mesh.positions, otherVertex(mesh, edge, pivot)), here));
    const weight = acosApprox(dot(vecCurr, vecPrev));
    const normal = read(faces, at(faceOf, state.curr));
    sum = [sum[0] + normal[0] * weight, sum[1] + normal[1] * weight, sum[2] + normal[2] * weight];
    processed.push(state.vert);
    if (edge !== edgeOrig) edgeVectors.push(vecCurr);
    if (isSharp(map, edge) || edge === edgeOrig) break;
    vecPrev = vecCurr;
    fanNext(mesh, faceOf, map, edge, pivot, state);
  }
  let lnor = normalize(sum);
  const valid = lengthOf(lnor) > 0;
  if (!custom) {
    if (valid) for (const member of processed) store(result, member, lnor);
    return;
  }
  if (!valid) lnor = read(result, state.vert);
  const space = defineSpace(lnor, vecOrg, vecCurr, edgeVectors);
  let alpha = at(custom, (processed[0] ?? corner) * 2);
  let beta = at(custom, (processed[0] ?? corner) * 2 + 1);
  if (processed.some((member) => at(custom, member * 2) !== alpha || at(custom, member * 2 + 1) !== beta)) {
    let alphaSum = 0;
    let betaSum = 0;
    for (const member of processed) {
      alphaSum += at(custom, member * 2);
      betaSum += at(custom, member * 2 + 1);
    }
    alpha = Math.trunc(alphaSum / processed.length);
    beta = Math.trunc(betaSum / processed.length);
  }
  const normal = normalize(customNormal(space, alpha, beta));
  for (const member of processed) store(result, member, normal);
}

/** Normals for each corner from free custom normals stored on any domain. */
export function freeCornerNormals(
  mesh: Pick<MeshData, "faceOffsets" | "cornerVerts" | "faceCount" | "cornerCount">,
  domain: "point" | "edge" | "face" | "corner",
  values: Float32Array,
): Float32Array | null {
  if (domain === "edge") return null;
  const result = new Float32Array(mesh.cornerCount * 3);
  for (let f = 0; f < mesh.faceCount; f++) {
    for (let c = at(mesh.faceOffsets, f); c < at(mesh.faceOffsets, f + 1); c++) {
      const index = domain === "corner" ? c : domain === "point" ? at(mesh.cornerVerts, c) : f;
      store(result, c, normalize(read(values, index)));
    }
  }
  return result;
}
