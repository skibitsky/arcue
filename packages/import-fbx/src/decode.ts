import type {
  AlphaMode,
  Exporter,
  ImportWarningSubjectKind,
  Interpolation,
  MaterialGroup,
  Mesh,
  NodeKind,
  Quat,
  Skeleton,
  Space,
  SpaceConversion,
  Track,
  TrackProperty,
  UvTransform,
  Vec3,
  Vec4,
  WrapMode,
} from "@arcue/scene";

const RESULT_MAGIC = 0x55435241;
const RESULT_VERSION = 1;
const PREAMBLE_BYTES = 16;

type BlobRef = readonly [offset: number, count: number];

export interface WireNode {
  name: string;
  parent: number;
  kind: NodeKind;
  /** The node holds an FBX LOD group, whose children are its levels in order. */
  lodGroup: boolean;
  translation: Vec3;
  rotation: Quat;
  scale: Vec3;
  /** The node's rotation as the file stores it, before unit and axis conversion. */
  fileRotation: Quat;
  /** The node's scale as the file stores it, before unit and axis conversion. */
  fileScale: Vec3;
  mesh: number | null;
}

export type WireWarningCode =
  | "too-many-uv-sets"
  | "too-many-bones"
  | "extra-skins"
  | "unweighted-vertices"
  | "inbetween-shapes"
  | "bind-pose-mismatch"
  | "clip-not-sampled"
  | "left-handed-axes"
  | "invalid-data";

/** A problem the parser found. A "file" subject has no name; the importer adds the asset's. */
export interface WireWarning {
  code: WireWarningCode;
  subjectKind: ImportWarningSubjectKind;
  subject: string | null;
  /** The parser's own description, such as ufbx's reason. */
  detail: string | null;
}

interface WireMesh {
  name: string;
  geometryName: string;
  positions: BlobRef;
  normals: BlobRef;
  uvs: { name: string; values: BlobRef }[];
  colors: BlobRef | null;
  indices: BlobRef;
  sourceVertex: BlobRef;
  sourceVertexCount: number;
  groups: MaterialGroup[];
  skeleton: number | null;
  bindMatrix: number[] | null;
  joints: BlobRef | null;
  weights: BlobRef | null;
  skinWeights: { offsets: BlobRef; joints: BlobRef; weights: BlobRef } | null;
  restPositions: BlobRef;
  morphTargets: { name: string; defaultWeight: number; positions: BlobRef; normals: BlobRef | null }[];
}

export interface WireTextureRef {
  file: number;
  uvSet: string;
  wrapU: WrapMode;
  wrapV: WrapMode;
  transform: UvTransform | null;
}

export interface WireMaterial {
  name: string;
  baseColor: Vec4;
  baseColorTexture?: WireTextureRef | null;
  metallic: number;
  roughness: number;
  roughnessTexture?: WireTextureRef | null;
  metalnessTexture?: WireTextureRef | null;
  normalTexture?: WireTextureRef | null;
  occlusionTexture?: WireTextureRef | null;
  emissive: Vec3;
  emissiveTexture?: WireTextureRef | null;
  alphaMode: AlphaMode;
  doubleSided: boolean;
}

interface WireTextureFile {
  relative: string;
  absolute: string;
  content: BlobRef | null;
}

interface WireTrack {
  node: number;
  property: TrackProperty;
  interpolation: Interpolation;
  times: BlobRef;
  values: BlobRef;
}

interface WireClip {
  name: string;
  duration: number;
  curveTimes: BlobRef;
  curveOffsets: BlobRef;
  tracks: WireTrack[];
}

interface WireScene {
  nodes: WireNode[];
  meshes: WireMesh[];
  skeletons: { joints: number[]; inverseBindMatrices: BlobRef }[];
  materials: WireMaterial[];
  textureFiles: WireTextureFile[];
  clips: WireClip[];
  exporter: Exporter | null;
  fps: number;
  originalSpace: Space;
  conversion: SpaceConversion;
  warnings: WireWarning[];
}

/** A file path stored in the FBX, with the embedded image bytes when the file carries them. */
export interface TextureFile {
  relative: string;
  absolute: string;
  content: Uint8Array | null;
}

export interface ParsedClip {
  name: string;
  duration: number;
  /** Key times of each animated curve in seconds from the clip start; curves with identical times appear once. */
  curveTimes: Float32Array[];
  tracks: Track[];
}

/** Everything the parser produced, copied out of WebAssembly memory. */
export interface ParsedFbx {
  nodes: WireNode[];
  meshes: Omit<Mesh, "topology">[];
  skeletons: Skeleton[];
  materials: WireMaterial[];
  textureFiles: TextureFile[];
  clips: ParsedClip[];
  exporter: Exporter | null;
  fps: number;
  originalSpace: Space;
  conversion: SpaceConversion;
  warnings: WireWarning[];
}

/** The parser rejected the file; the message is ufbx's reason. */
export class FbxParseError extends Error {
  override readonly name = "FbxParseError";
}

class BlobReader {
  readonly #heap: Uint8Array;
  readonly #base: number;
  readonly #end: number;

  constructor(heap: Uint8Array, base: number, size: number) {
    this.#heap = heap;
    this.#base = base;
    this.#end = base + size;
  }

  #start(ref: BlobRef, elementBytes: number): number {
    const start = this.#base + ref[0];
    if (start % elementBytes !== 0 || start + ref[1] * elementBytes > this.#end) {
      throw new RangeError(`Blob [${ref[0]}, ${ref[1]}] lies outside the parser's result.`);
    }
    return start;
  }

  f32(ref: BlobRef): Float32Array<ArrayBuffer> {
    const copy = new Float32Array(ref[1]);
    copy.set(new Float32Array(this.#heap.buffer, this.#start(ref, 4), ref[1]));
    return copy;
  }

  u32(ref: BlobRef): Uint32Array<ArrayBuffer> {
    const copy = new Uint32Array(ref[1]);
    copy.set(new Uint32Array(this.#heap.buffer, this.#start(ref, 4), ref[1]));
    return copy;
  }

  u16(ref: BlobRef): Uint16Array<ArrayBuffer> {
    const copy = new Uint16Array(ref[1]);
    copy.set(new Uint16Array(this.#heap.buffer, this.#start(ref, 2), ref[1]));
    return copy;
  }

  u8(ref: BlobRef): Uint8Array<ArrayBuffer> {
    const copy = new Uint8Array(ref[1]);
    copy.set(this.#heap.subarray(this.#start(ref, 1), this.#start(ref, 1) + ref[1]));
    return copy;
  }
}

function readMesh(mesh: WireMesh, blobs: BlobReader): Omit<Mesh, "topology"> {
  return {
    name: mesh.name,
    geometryName: mesh.geometryName,
    positions: blobs.f32(mesh.positions),
    normals: blobs.f32(mesh.normals),
    uvs: mesh.uvs.map((uv) => ({ name: uv.name, values: blobs.f32(uv.values) })),
    colors: mesh.colors ? blobs.f32(mesh.colors) : null,
    skeleton: mesh.skeleton,
    bindMatrix: mesh.bindMatrix ? Float32Array.from(mesh.bindMatrix) : null,
    joints: mesh.joints ? blobs.u16(mesh.joints) : null,
    weights: mesh.weights ? blobs.f32(mesh.weights) : null,
    indices: blobs.u32(mesh.indices),
    groups: mesh.groups,
    morphTargets: mesh.morphTargets.map((target) => ({
      name: target.name,
      defaultWeight: target.defaultWeight,
      positions: blobs.f32(target.positions),
      normals: target.normals ? blobs.f32(target.normals) : null,
    })),
    sourceVertex: blobs.u32(mesh.sourceVertex),
    sourceVertexCount: mesh.sourceVertexCount,
    restPositions: blobs.f32(mesh.restPositions),
    skinWeights: mesh.skinWeights
      ? {
          offsets: blobs.u32(mesh.skinWeights.offsets),
          joints: blobs.u16(mesh.skinWeights.joints),
          weights: blobs.f32(mesh.skinWeights.weights),
        }
      : null,
  };
}

function readClip(clip: WireClip, blobs: BlobReader): ParsedClip {
  const times = blobs.f32(clip.curveTimes);
  const offsets = blobs.u32(clip.curveOffsets);
  const curveTimes: Float32Array[] = [];
  for (let i = 0; i + 1 < offsets.length; i++) curveTimes.push(times.subarray(offsets[i], offsets[i + 1]));
  return {
    name: clip.name,
    duration: clip.duration,
    curveTimes,
    tracks: clip.tracks.map((track) => ({
      node: track.node,
      property: track.property,
      interpolation: track.interpolation,
      times: blobs.f32(track.times),
      values: blobs.f32(track.values),
    })),
  };
}

/**
 * Reads the parser's result at `pointer` in `heap`: a 16-byte preamble (magic, version, JSON length, blob length),
 * the JSON header, padding to 8 bytes, then the blobs the header points into. Every array is copied out of `heap`.
 */
export function readResult(heap: Uint8Array, pointer: number): ParsedFbx {
  const view = new DataView(heap.buffer, heap.byteOffset + pointer, PREAMBLE_BYTES);
  if (view.getUint32(0, true) !== RESULT_MAGIC || view.getUint32(4, true) !== RESULT_VERSION) {
    throw new RangeError("The FBX parser returned a result in an unknown format.");
  }
  const jsonBytes = view.getUint32(8, true);
  const blobBytes = view.getUint32(12, true);
  const jsonStart = pointer + PREAMBLE_BYTES;
  const header: unknown = JSON.parse(new TextDecoder().decode(heap.subarray(jsonStart, jsonStart + jsonBytes)));
  if (typeof header === "object" && header !== null && "error" in header) {
    throw new FbxParseError(String(header.error));
  }
  const scene = header as WireScene;
  const blobStart = jsonStart + jsonBytes + ((8 - ((PREAMBLE_BYTES + jsonBytes) % 8)) % 8);
  const blobs = new BlobReader(heap, blobStart, blobBytes);

  return {
    nodes: scene.nodes,
    meshes: scene.meshes.map((mesh) => readMesh(mesh, blobs)),
    skeletons: scene.skeletons.map((skeleton) => ({
      joints: skeleton.joints,
      inverseBindMatrices: blobs.f32(skeleton.inverseBindMatrices),
    })),
    materials: scene.materials,
    textureFiles: scene.textureFiles.map((file) => ({
      relative: file.relative,
      absolute: file.absolute,
      content: file.content ? blobs.u8(file.content) : null,
    })),
    clips: scene.clips.map((clip) => readClip(clip, blobs)),
    exporter: scene.exporter,
    fps: scene.fps,
    originalSpace: scene.originalSpace,
    conversion: scene.conversion,
    warnings: scene.warnings,
  };
}
