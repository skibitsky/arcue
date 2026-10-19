import type { BlendBlock, BlendFile } from "../blend/file.js";
import { BlendStruct, numberReader } from "../blend/file.js";
import { idName } from "../blend/ids.js";

export type AttributeType =
  | "bool"
  | "int8"
  | "int16_2d"
  | "int32"
  | "int32_2d"
  | "float"
  | "float2"
  | "float3"
  | "float4x4"
  | "byteColor"
  | "floatColor"
  | "quaternion"
  | "string";

export type Domain = "point" | "edge" | "face" | "corner";

/** Blender 5's attribute types, in the order of its `AttrType` enum. */
const STORAGE_TYPES: readonly AttributeType[] = [
  "bool",
  "int8",
  "int16_2d",
  "int32",
  "int32_2d",
  "float",
  "float2",
  "float3",
  "float4x4",
  "byteColor",
  "floatColor",
  "quaternion",
  "string",
];

export const CustomDataType = {
  vertex: 0,
  deformVertex: 2,
  edge: 3,
  loopUv: 16,
  byteColor: 17,
  face: 25,
  loop: 26,
  shapeKeyIndex: 27,
  customLoopNormal: 41,
  floatColor: 47,
  float2: 49,
} as const;

/** Generic CustomData layer types of Blender 4 and earlier. */
const CUSTOM_DATA_TYPES: ReadonlyMap<number, AttributeType> = new Map([
  [10, "float"],
  [11, "int32"],
  [CustomDataType.byteColor, "byteColor"],
  [20, "float4x4"],
  [45, "int8"],
  [46, "int32_2d"],
  [CustomDataType.floatColor, "floatColor"],
  [48, "float3"],
  [CustomDataType.float2, "float2"],
  [50, "bool"],
  [52, "quaternion"],
]);

const DOMAINS: readonly Domain[] = ["point", "edge", "face", "corner"];

const COMPONENTS: Readonly<Record<AttributeType, number>> = {
  bool: 1,
  int8: 1,
  int16_2d: 2,
  int32: 1,
  int32_2d: 2,
  float: 1,
  float2: 2,
  float3: 3,
  float4x4: 16,
  byteColor: 4,
  floatColor: 4,
  quaternion: 4,
  string: 1,
};

const BYTES: Readonly<Record<AttributeType, number>> = {
  bool: 1,
  int8: 1,
  int16_2d: 4,
  int32: 4,
  int32_2d: 8,
  float: 4,
  float2: 8,
  float3: 12,
  float4x4: 64,
  byteColor: 4,
  floatColor: 16,
  quaternion: 16,
  string: 1,
};

export interface MeshAttribute {
  name: string;
  type: AttributeType;
  domain: Domain;
  /** The block that holds the values, or null when there are none. */
  block: BlendBlock | null;
  /** One value for the whole domain rather than one per element. */
  single: boolean;
}

/** A shape key: absolute positions of every vertex, as Blender stores them. */
export interface ShapeKey {
  name: string;
  positions: Float32Array;
  /** Index of the key it is relative to. */
  relative: number;
  value: number;
  min: number;
  max: number;
  /**
   * Whether Blender leaves the key out of the shape it shows: a muted key, or one without positions of its own for
   * every vertex, whose positions here are the mesh's vertices.
   */
  muted: boolean;
  vertexGroup: string;
}

export interface DeformWeights {
  /** Influences of vertex v at offsets[v] up to offsets[v + 1]. */
  offsets: Uint32Array;
  groups: Int32Array;
  weights: Float32Array;
}

export type CustomNormals =
  | { kind: "encoded"; values: Int16Array }
  | { kind: "free"; domain: Domain; values: Float32Array };

/** The UV maps a mesh's preview shows: the first, in Blender's order. */
export const MAX_UV_SETS = 8;

export interface UvMap {
  name: string;
  /** Two values per face corner, or none for a map past the first `MAX_UV_SETS`, which the preview leaves out. */
  values: Float32Array;
}

/** A mesh's data in one shape for every Blender version this reader takes. */
export interface MeshData {
  name: string;
  vertexCount: number;
  edgeCount: number;
  faceCount: number;
  cornerCount: number;
  positions: Float32Array;
  edges: Int32Array;
  faceOffsets: Int32Array;
  cornerVerts: Int32Array;
  cornerEdges: Int32Array;
  materialIndices: Int32Array | null;
  /** Flat-shaded faces. */
  sharpFaces: Uint8Array | null;
  sharpEdges: Uint8Array | null;
  /** The auto smooth angle of meshes from Blender 4.0 and earlier that turn it on, in radians. */
  autoSmoothAngle: number | null;
  uvMaps: UvMap[];
  /** Index into `uvMaps` of the map rendering uses by default. */
  defaultUv: number;
  /**
   * Linear RGBA of one color attribute, four values per element of its domain: the first one asked for that the mesh
   * has, else the default.
   */
  colors: { name: string; domain: "point" | "corner"; values: Float32Array } | null;
  /** The names of the mesh's attributes, which a Color Attribute node can read whatever their type and domain. */
  attributeNames: string[];
  customNormals: CustomNormals | null;
  deformWeights: DeformWeights | null;
  vertexGroupNames: string[];
  shapeKeys: ShapeKey[];
  /** The key the others are relative to, by default, or -1. */
  referenceKey: number;
  /** Whether the shape keys are absolute: Blender blends them by an evaluation time instead of each key's value. */
  absoluteKeys: boolean;
  /**
   * Whether shape keys are left out because the mesh has more than `MAX_CORNERS_PER_KEYED_VERTEX` face corners for
   * each vertex.
   */
  shapeKeysLeftOut: boolean;
}

export class MeshReadError extends Error {
  override readonly name = "MeshReadError";
}

/**
 * Far more layers of data than Blender's own meshes have, each attribute or array of elements a layer. A mesh that
 * lists more is refused, and no more of them are read.
 */
const MAX_LAYERS = 2 ** 16;

/** A mesh's block of layers of data, how many it counts, and the struct Blender writes each as. */
interface LayerArray {
  block: BlendBlock | null;
  count: number;
  struct: "Attribute" | "CustomDataLayer";
}

/** How many layers the array's block holds, up to its count: none when the block holds another struct. */
function heldStructs({ block, count, struct }: LayerArray): number {
  const type = block?.struct;
  if (!block || type?.type !== struct || type.size === 0) return 0;
  return Math.max(0, Math.min(count, block.count, Math.floor(block.size / type.size)));
}

/** The layers of the array, as many as its block holds up to `MAX_LAYERS`, without making the others. */
function structsOf(file: BlendFile, array: LayerArray): BlendStruct[] {
  const { block } = array;
  const type = block?.struct;
  if (!block || !type) return [];
  const count = Math.min(heldStructs(array), MAX_LAYERS);
  return Array.from({ length: count }, (_, index) => new BlendStruct(file, type, block, index * type.size));
}

/** The attributes of a mesh from Blender 5 and on. */
function storageArray(mesh: BlendStruct): LayerArray {
  const storage = mesh.struct("attribute_storage");
  const block = storage?.target("dna_attributes") ?? null;
  return { block, count: storage?.number("dna_attributes_num") ?? 0, struct: "Attribute" };
}

/** The layers of one of a mesh's CustomData. */
function layerArray(mesh: BlendStruct, field: LayerField): LayerArray {
  const data = mesh.struct(field);
  return { block: data?.target("layers") ?? null, count: data?.number("totlayer") ?? 0, struct: "CustomDataLayer" };
}

/** Refuses a mesh that lists more layers of data than `MAX_LAYERS` in its attributes or in one CustomData. */
function checkLayerCounts(mesh: BlendStruct): void {
  const counts = [storageArray(mesh), ...LAYER_DOMAINS.map(([field]) => layerArray(mesh, field))].map(heldStructs);
  const most = Math.max(...counts);
  if (most > MAX_LAYERS) {
    throw new MeshReadError(`Mesh ${idName(mesh)} has ${most} layers of data, far more than Blender writes`);
  }
}

function storageAttributes(mesh: BlendStruct): MeshAttribute[] {
  return structsOf(mesh.file, storageArray(mesh)).flatMap((attribute) => {
    const type = STORAGE_TYPES[attribute.number("data_type")];
    const domain = DOMAINS[attribute.number("domain")];
    if (!type || !domain) return [];
    const holder = attribute.deref("data");
    const single = attribute.number("storage_type") === 1;
    return [{ name: attribute.text("name"), type, domain, block: holder?.target("data") ?? null, single }];
  });
}

type LayerField = "vdata" | "edata" | "pdata" | "ldata";

/** The layers of each of a mesh's CustomData, read once: Blender 4 and earlier keep most mesh data in them. */
type CustomDataLayers = Readonly<Record<LayerField, readonly BlendStruct[]>>;

const LAYER_DOMAINS: readonly [LayerField, Domain][] = [
  ["vdata", "point"],
  ["edata", "edge"],
  ["pdata", "face"],
  ["ldata", "corner"],
];

function layersOf(mesh: BlendStruct, field: LayerField): BlendStruct[] {
  return structsOf(mesh.file, layerArray(mesh, field));
}

function readLayers(mesh: BlendStruct): CustomDataLayers {
  return {
    vdata: layersOf(mesh, "vdata"),
    edata: layersOf(mesh, "edata"),
    pdata: layersOf(mesh, "pdata"),
    ldata: layersOf(mesh, "ldata"),
  };
}

function customDataAttributes(layers: CustomDataLayers): MeshAttribute[] {
  const result: MeshAttribute[] = [];
  for (const [field, domain] of LAYER_DOMAINS) {
    for (const layer of layers[field]) {
      const type = CUSTOM_DATA_TYPES.get(layer.number("type"));
      if (!type) continue;
      result.push({ name: layer.string("name"), type, domain, block: layer.target("data"), single: false });
    }
  }
  return result;
}

function ofType(layers: readonly BlendStruct[], type: number): BlendStruct[] {
  return layers.filter((layer) => layer.number("type") === type);
}

/** The layer that `member`, such as "active_rnd", picks among layers of one type: every one holds the same index. */
function pickedLayer(sameType: readonly BlendStruct[], member: string): BlendStruct | undefined {
  return sameType[sameType[0]?.number(member) ?? 0];
}

interface Sizes {
  point: number;
  edge: number;
  face: number;
  corner: number;
}

class AttributeReader {
  readonly #file: BlendFile;
  readonly #sizes: Sizes;
  readonly attributes: MeshAttribute[];

  constructor(file: BlendFile, attributes: MeshAttribute[], sizes: Sizes) {
    this.#file = file;
    this.#sizes = sizes;
    this.attributes = attributes;
  }

  find(name: string, types?: readonly AttributeType[], domain?: Domain): MeshAttribute | undefined {
    return this.attributes.find(
      (attribute) =>
        attribute.name === name &&
        (types === undefined || types.includes(attribute.type)) &&
        (domain === undefined || attribute.domain === domain),
    );
  }

  #elements(attribute: MeshAttribute): number {
    return this.#sizes[attribute.domain];
  }

  /** The values of an attribute as numbers, components per element by type; a single value repeats. */
  float32(attribute: MeshAttribute): Float32Array {
    const count = this.#elements(attribute) * COMPONENTS[attribute.type];
    if (!attribute.block) return new Float32Array(count);
    if (attribute.single) {
      const one = this.#file.float32(attribute.block, COMPONENTS[attribute.type]);
      const values = new Float32Array(count);
      for (let i = 0; i < count; i++) values[i] = one[i % one.length] ?? 0;
      return values;
    }
    return padded(this.#file.float32(attribute.block, count), count);
  }

  int32(attribute: MeshAttribute): Int32Array {
    const count = this.#elements(attribute) * COMPONENTS[attribute.type];
    if (!attribute.block) return new Int32Array(count);
    if (attribute.single) {
      const one = this.#file.int32(attribute.block, COMPONENTS[attribute.type]);
      const values = new Int32Array(count);
      for (let i = 0; i < count; i++) values[i] = one[i % one.length] ?? 0;
      return values;
    }
    return padded(this.#file.int32(attribute.block, count), count);
  }

  int16(attribute: MeshAttribute): Int16Array {
    const count = this.#elements(attribute) * COMPONENTS[attribute.type];
    if (!attribute.block) return new Int16Array(count);
    if (attribute.single) {
      const one = this.#file.int16(attribute.block, COMPONENTS[attribute.type]);
      const values = new Int16Array(count);
      for (let i = 0; i < count; i++) values[i] = one[i % one.length] ?? 0;
      return values;
    }
    return padded(this.#file.int16(attribute.block, count), count);
  }

  bytes(attribute: MeshAttribute): Uint8Array {
    const count = this.#elements(attribute) * BYTES[attribute.type];
    const values = new Uint8Array(count);
    if (!attribute.block) return values;
    const source = this.#file.bytesOf(attribute.block);
    if (attribute.single) {
      for (let i = 0; i < count; i++) values[i] = source[i % Math.max(BYTES[attribute.type], 1)] ?? 0;
      return values;
    }
    values.set(source.subarray(0, Math.min(count, source.byteLength)));
    return values;
  }
}

function padded<Values extends Float32Array | Int32Array | Int16Array>(values: Values, count: number): Values {
  if (values.length >= count) return values;
  const result = new (values.constructor as new (length: number) => Values)(count);
  result.set(values);
  return result;
}

function srgbToLinear(value: number): number {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function colorAttributes(reader: AttributeReader): MeshAttribute[] {
  const colorTypes: AttributeType[] = ["byteColor", "floatColor"];
  return reader.attributes.filter(
    (attribute) =>
      colorTypes.includes(attribute.type) &&
      (attribute.domain === "point" || attribute.domain === "corner") &&
      !attribute.name.startsWith("."),
  );
}

const LEGACY_COLOR_RENDER = 1 << 6;

/**
 * The color attribute that a Color Attribute node without a name reads: the mesh's default. Files from before Blender
 * 3.5 mark it as Blender converts them: a layer flag, else the render layer of float and then byte colors, points
 * first. Empty when the mesh names none, where Blender reads black.
 */
export function defaultColorAttribute(mesh: BlendStruct): string {
  if (mesh.has("default_color_attribute")) return mesh.text("default_color_attribute");
  const fields = [layersOf(mesh, "vdata"), layersOf(mesh, "ldata")];
  for (const layers of fields) {
    const flagged = layers.find((layer) => layer.has("flag") && (layer.number("flag") & LEGACY_COLOR_RENDER) !== 0);
    if (flagged) return flagged.string("name");
  }
  for (const layers of fields) {
    for (const type of [CustomDataType.floatColor, CustomDataType.byteColor]) {
      const render = pickedLayer(ofType(layers, type), "active_rnd");
      if (render) return render.string("name");
    }
  }
  return "";
}

function readColors(reader: AttributeReader, mesh: BlendStruct, wanted: readonly string[]): MeshData["colors"] {
  const candidates = colorAttributes(reader);
  const fallback = defaultColorAttribute(mesh) || mesh.text("active_color_attribute");
  const attribute =
    wanted.map((name) => candidates.find((candidate) => candidate.name === name)).find((found) => found) ??
    candidates.find((candidate) => candidate.name === fallback) ??
    candidates[0];
  if (!attribute || (attribute.domain !== "point" && attribute.domain !== "corner")) return null;
  const { name, domain } = attribute;
  if (attribute.type === "floatColor") return { name, domain, values: reader.float32(attribute) };
  const bytes = reader.bytes(attribute);
  const values = new Float32Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    const unit = (bytes[i] ?? 0) / 255;
    values[i] = i % 4 === 3 ? unit : srgbToLinear(unit);
  }
  return { name, domain, values };
}

/** The names each slot wants, those of the slots that faces use first, as Blender clamps a face's slot to the last. */
function usedFirst(wanted: readonly (readonly string[])[], materialIndices: Int32Array | null): string[] {
  const last = wanted.length - 1;
  const used = new Set<number>();
  for (const index of materialIndices ?? [0]) used.add(Math.min(Math.max(index, 0), last));
  return [...wanted.filter((_, slot) => used.has(slot)), ...wanted.filter((_, slot) => !used.has(slot))].flat();
}

/**
 * The structs of the arrays meshes before Blender 4.0 hold, each with the bytes of the members read from it, which the
 * struct holds in every version Blender writes.
 */
const LEGACY_SIZES = { MVert: 12, MEdge: 8, MPoly: 8, MLoop: 8, MLoopUV: 8, MDeformVert: 8 } as const;

type LegacyStruct = keyof typeof LEGACY_SIZES;

/**
 * An array of structs read member by member at the offsets its SDNA gives, without an object per element, as meshes
 * before Blender 4.0 store their vertices, edges, faces, corners and UV maps.
 */
class StructArray {
  readonly #file: BlendFile;
  readonly #block: BlendBlock | null;
  readonly #stride: number;
  /**
   * How many elements the block holds: none unless its struct is `struct`, the one Blender writes such arrays of, and
   * the file's SDNA makes it large enough for the members read from it, so that elements take no more memory than the
   * file's bytes.
   */
  readonly length: number;

  constructor(file: BlendFile, block: BlendBlock | null, struct: LegacyStruct) {
    this.#file = file;
    this.#block = block;
    const type = block?.struct;
    this.#stride = type?.size ?? 0;
    const held = block && type?.type === struct && type.size >= LEGACY_SIZES[struct];
    this.length = held ? Math.min(block.count, Math.floor(block.size / type.size)) : 0;
  }

  /**
   * Reads one number member of every element: `read(element, index)` is element's value at array index `index`. A
   * member the struct lacks, or holds in a type this reader does not take, reads as 0, as `BlendStruct.number` does.
   */
  member(name: string): (element: number, index?: number) => number {
    const field = this.#block?.struct?.field(name);
    const reader = field && field.pointerDepth === 0 ? numberReader(field.type) : undefined;
    if (!this.#block || !field || !reader) return () => 0;
    const { view, little } = this.#file;
    const base = this.#block.offset + field.offset;
    const stride = this.#stride;
    const elementSize = field.size / field.count;
    const count = field.count;
    return (element, index = 0) =>
      index < count ? reader(view, base + element * stride + index * elementSize, little) : 0;
  }

  /** The offset of a pointer member of every element, or -1 when the struct has none. */
  pointer(name: string): (element: number) => number {
    const field = this.#block?.struct?.field(name);
    if (!this.#block || !field || field.pointerDepth === 0) return () => -1;
    const base = this.#block.offset + field.offset;
    const stride = this.#stride;
    return (element) => base + element * stride;
  }

  get owner(): number {
    return this.#block?.owner ?? -1;
  }
}

/** The struct of each element of the legacy layers that hold a mesh's topology. */
const LEGACY_STRUCTS = {
  [CustomDataType.vertex]: "MVert",
  [CustomDataType.edge]: "MEdge",
  [CustomDataType.face]: "MPoly",
  [CustomDataType.loop]: "MLoop",
} as const;

type TopologyLayer = keyof typeof LEGACY_STRUCTS;

function legacyArray(file: BlendFile, layers: readonly BlendStruct[], type: TopologyLayer): StructArray {
  return new StructArray(file, ofType(layers, type)[0]?.target("data") ?? null, LEGACY_STRUCTS[type]);
}

const LEGACY_FACE_SMOOTH = 1 << 0;
const LEGACY_EDGE_SHARP = 1 << 9;
const LEGACY_AUTO_SMOOTH = 1 << 5;

function readTopology(
  file: BlendFile,
  mesh: BlendStruct,
  reader: AttributeReader,
  layers: CustomDataLayers,
  sizes: Sizes,
) {
  const position = reader.find("position", ["float3"], "point");
  let positions: Float32Array;
  if (position) positions = reader.float32(position);
  else {
    const vertices = legacyArray(file, layers.vdata, CustomDataType.vertex);
    const co = vertices.member("co");
    positions = new Float32Array(sizes.point * 3);
    for (let v = 0; v < Math.min(sizes.point, vertices.length); v++) {
      for (let k = 0; k < 3; k++) positions[v * 3 + k] = co(v, k);
    }
  }

  const edgeVerts = reader.find(".edge_verts", ["int32_2d"], "edge");
  let edges: Int32Array;
  let legacyEdges: StructArray | null = null;
  if (edgeVerts) edges = reader.int32(edgeVerts);
  else {
    legacyEdges = legacyArray(file, layers.edata, CustomDataType.edge);
    const [v1, v2] = [legacyEdges.member("v1"), legacyEdges.member("v2")];
    edges = new Int32Array(sizes.edge * 2);
    for (let e = 0; e < Math.min(sizes.edge, legacyEdges.length); e++) {
      edges[e * 2] = v1(e);
      edges[e * 2 + 1] = v2(e);
    }
  }

  let faceOffsets: Int32Array;
  let legacyFaces: StructArray | null = null;
  const offsetsBlock = mesh.target("poly_offset_indices");
  if (offsetsBlock) {
    faceOffsets = padded(file.int32(offsetsBlock, sizes.face + 1), sizes.face + 1);
  } else {
    legacyFaces = legacyArray(file, layers.pdata, CustomDataType.face);
    const loopStart = legacyFaces.member("loopstart");
    faceOffsets = new Int32Array(sizes.face + 1);
    for (let f = 0; f < Math.min(sizes.face, legacyFaces.length); f++) faceOffsets[f] = loopStart(f);
    faceOffsets[sizes.face] = sizes.corner;
  }
  if (sizes.face === 0) faceOffsets = Int32Array.of(0);

  const cornerVert = reader.find(".corner_vert", ["int32"], "corner");
  const cornerEdge = reader.find(".corner_edge", ["int32"], "corner");
  let cornerVerts: Int32Array;
  let cornerEdges: Int32Array;
  if (cornerVert) {
    cornerVerts = reader.int32(cornerVert);
    cornerEdges = cornerEdge ? reader.int32(cornerEdge) : new Int32Array(sizes.corner).fill(-1);
  } else {
    const loops = legacyArray(file, layers.ldata, CustomDataType.loop);
    const [vertex, edge] = [loops.member("v"), loops.member("e")];
    cornerVerts = new Int32Array(sizes.corner);
    cornerEdges = new Int32Array(sizes.corner);
    for (let c = 0; c < Math.min(sizes.corner, loops.length); c++) {
      cornerVerts[c] = vertex(c);
      cornerEdges[c] = edge(c);
    }
  }

  const faceCount = Math.min(sizes.face, legacyFaces?.length ?? 0);
  let materialIndices: Int32Array | null = null;
  const material = reader.find("material_index", ["int32"], "face");
  if (material) materialIndices = reader.int32(material);
  else if (legacyFaces && legacyFaces.length > 0) {
    const slot = legacyFaces.member("mat_nr");
    materialIndices = Int32Array.from({ length: faceCount }, (_, f) => slot(f));
  }

  let sharpFaces: Uint8Array | null = null;
  const sharpFace = reader.find("sharp_face", ["bool"], "face");
  if (sharpFace) sharpFaces = reader.bytes(sharpFace);
  else if (legacyFaces && legacyFaces.length > 0) {
    const flag = legacyFaces.member("flag");
    sharpFaces = Uint8Array.from({ length: faceCount }, (_, f) => ((flag(f) & LEGACY_FACE_SMOOTH) === 0 ? 1 : 0));
  }

  let sharpEdges: Uint8Array | null = null;
  const sharpEdge = reader.find("sharp_edge", ["bool"], "edge");
  const edgeCount = Math.min(sizes.edge, legacyEdges?.length ?? 0);
  if (sharpEdge) sharpEdges = reader.bytes(sharpEdge);
  else if (legacyEdges && legacyEdges.length > 0) {
    const flag = legacyEdges.member("flag");
    sharpEdges = Uint8Array.from({ length: edgeCount }, (_, e) => ((flag(e) & LEGACY_EDGE_SHARP) !== 0 ? 1 : 0));
  }

  return { positions, edges, faceOffsets, cornerVerts, cornerEdges, materialIndices, sharpFaces, sharpEdges };
}

const UNSHOWN_UVS = new Float32Array(0);

/**
 * The UV maps: the float vector corner attributes, then the MLoopUV layers of files from before Blender 4.0, as Blender
 * converts those after the attributes. The default is the render layer of the MLoopUV layers when there are any. Only
 * the maps the preview shows have values.
 */
function readUvMaps(
  file: BlendFile,
  mesh: BlendStruct,
  reader: AttributeReader,
  layers: CustomDataLayers,
  sizes: Sizes,
): { maps: UvMap[]; default: number } {
  const maps: UvMap[] = [];
  const add = (name: string, read: () => Float32Array) => {
    maps.push({ name, values: maps.length < MAX_UV_SETS ? read() : UNSHOWN_UVS });
  };
  for (const attribute of reader.attributes) {
    if (attribute.type !== "float2" || attribute.domain !== "corner" || attribute.name.startsWith(".")) continue;
    add(attribute.name, () => reader.float32(attribute));
  }
  const legacy = ofType(layers.ldata, CustomDataType.loopUv);
  for (const layer of legacy) {
    add(layer.string("name"), () => {
      const corners = new StructArray(file, layer.target("data"), "MLoopUV");
      const uv = corners.member("uv");
      const values = new Float32Array(sizes.corner * 2);
      for (let c = 0; c < Math.min(sizes.corner, corners.length); c++) {
        values[c * 2] = uv(c, 0);
        values[c * 2 + 1] = uv(c, 1);
      }
      return values;
    });
  }
  const render = pickedLayer(legacy.length > 0 ? legacy : ofType(layers.ldata, CustomDataType.float2), "active_rnd");
  const wanted =
    mesh.text("default_uv_map_attribute") || render?.string("name") || mesh.text("active_uv_map_attribute");
  const index = maps.findIndex((map) => map.name === wanted);
  return { maps, default: Math.max(index, 0) };
}

function readCustomNormals(reader: AttributeReader, file: BlendFile, layers: CustomDataLayers, sizes: Sizes) {
  const named = reader.find("custom_normal");
  if (named?.type === "int16_2d" && named.domain === "corner") {
    return { kind: "encoded", values: reader.int16(named) } satisfies CustomNormals;
  }
  if (named?.type === "float3" && file.version >= FREE_NORMALS_VERSION) {
    return { kind: "free", domain: named.domain, values: reader.float32(named) } satisfies CustomNormals;
  }
  const block = ofType(layers.ldata, CustomDataType.customLoopNormal)[0]?.target("data");
  if (block) {
    return {
      kind: "encoded",
      values: padded(file.int16(block, sizes.corner * 2), sizes.corner * 2),
    } satisfies CustomNormals;
  }
  return null;
}

/**
 * Reads each vertex's MDeformWeight array straight from its block, in two passes that size typed arrays first. Blender
 * writes one block per vertex, so the pointers resolve to block indices without making a block object for each. A
 * block that an earlier vertex points at gives a later one no weights, so that the weights read are at most those the
 * file holds.
 */
function readDeformWeights(
  file: BlendFile,
  mesh: BlendStruct,
  layers: CustomDataLayers,
  sizes: Sizes,
): DeformWeights | null {
  const layer = ofType(layers.vdata, CustomDataType.deformVertex)[0];
  const vertices = new StructArray(file, layer ? layer.target("data") : mesh.target("dvert"), "MDeformVert");
  if (vertices.length === 0) return null;
  const count = Math.min(sizes.point, vertices.length);
  const pointerAt = vertices.pointer("dw");
  const totalOf = vertices.member("totweight");
  const weightType = file.sdna.struct("MDeformWeight");
  const groupField = weightType?.field("def_nr");
  const weightField = weightType?.field("weight");
  const readGroup = groupField?.pointerDepth === 0 ? numberReader(groupField.type) : undefined;
  const readWeight = weightField?.pointerDepth === 0 ? numberReader(weightField.type) : undefined;
  const stride = weightType?.size ?? 0;

  const offsets = new Uint32Array(sizes.point + 1);
  const blocks = new Int32Array(count).fill(-1);
  const claimed = new Set<number>();
  let total = 0;
  for (let v = 0; v < count; v++) {
    offsets[v] = total;
    const at = pointerAt(v);
    const wanted = totalOf(v);
    if (at < 0 || wanted <= 0 || stride === 0) continue;
    const block = file.pointedBlock(at, vertices.owner);
    if (block < 0 || claimed.has(block)) continue;
    claimed.add(block);
    blocks[v] = block;
    total += Math.min(wanted, Math.floor(file.blockSize(block) / stride));
  }
  offsets.fill(total, count);

  const groups = new Int32Array(total);
  const weights = new Float32Array(total);
  const { view, little } = file;
  for (let v = 0; v < count; v++) {
    const block = blocks[v] ?? -1;
    if (block < 0) continue;
    const start = file.blockOffset(block);
    for (let i = offsets[v] ?? 0, element = 0; i < (offsets[v + 1] ?? 0); i++, element++) {
      const base = start + element * stride;
      if (groupField && readGroup) groups[i] = readGroup(view, base + groupField.offset, little);
      if (weightField && readWeight) weights[i] = readWeight(view, base + weightField.offset, little);
    }
  }
  return { offsets, groups, weights };
}

const KEY_BLOCK_MUTE = 1 << 0;
const KEY_RELATIVE = 1;
/** Blender 4.5 made a float vector "custom_normal" attribute on faces, points or corners the mesh's normals. */
const FREE_NORMALS_VERSION = 405;

interface ShapeKeys {
  keys: ShapeKey[];
  reference: number;
  absolute: boolean;
  /** The reference key's positions, which Blender shapes the mesh from instead of its vertices, when it has them all. */
  basis: Float32Array | null;
  leftOut: boolean;
}

/**
 * The most face corners for each vertex that a mesh may have and still show its shape keys, far more than meshes have.
 * Each shape key holds a position for every vertex, but the preview builds it for every face corner.
 */
export const MAX_CORNERS_PER_KEYED_VERTEX = 32;

/**
 * The mesh's shape keys. Each reads its positions from a data block that holds one for every vertex and that no earlier
 * key reads, as Blender writes them; a key without one shares `vertices` and is left out, so that the keys read take
 * memory only for the positions the file holds. A mesh with more than `MAX_CORNERS_PER_KEYED_VERTEX` face corners for
 * each vertex keeps only its basis, since the preview would build every key for every corner.
 */
function readShapeKeys(mesh: BlendStruct, file: BlendFile, sizes: Sizes, vertices: Float32Array): ShapeKeys {
  const key = mesh.deref("key");
  if (!key) return { keys: [], reference: -1, absolute: false, basis: null, leftOut: false };
  const blocks = key.list("block");
  const reference = blocks.findIndex((block) => block.offset === file.first(key.target("refkey"))?.offset);
  const claimed = new Set<number>();
  const owned = blocks.map((block) => {
    const data = block.target("data");
    if (!data || claimed.has(data.index) || Math.floor(data.size / 4) < sizes.point * 3) return null;
    claimed.add(data.index);
    return file.float32(data, sizes.point * 3);
  });
  const keys = blocks.map((block, index) => ({
    name: block.string("name"),
    positions: owned[index] ?? vertices,
    relative: block.number("relative"),
    value: block.number("curval"),
    min: block.number("slidermin"),
    max: block.number("slidermax"),
    muted: !owned[index] || (block.number("flag") & KEY_BLOCK_MUTE) !== 0,
    vertexGroup: block.string("vgroup"),
  }));
  const basisIndex = reference === -1 && keys.length > 0 ? 0 : reference;
  const basisBlock = blocks[basisIndex];
  const basis = basisBlock?.number("totelem") === sizes.point ? (owned[basisIndex] ?? null) : null;
  if (key.number("type") !== KEY_RELATIVE) return { keys: [], reference: -1, absolute: true, basis, leftOut: false };
  if (sizes.corner > MAX_CORNERS_PER_KEYED_VERTEX * sizes.point) {
    const shown = keys.some((shapeKey, index) => index !== basisIndex && !shapeKey.muted);
    return { keys: [], reference: -1, absolute: false, basis, leftOut: shown };
  }
  return { keys, reference: basisIndex, absolute: false, basis, leftOut: false };
}

/**
 * How many elements a topology attribute's values hold. One value for the whole domain counts as one element: Blender
 * writes positions, edges and face corners as arrays, and repeating one value would let a count take any memory.
 */
function heldElements(attribute: MeshAttribute): number {
  if (!attribute.block) return 0;
  return attribute.single ? 1 : Math.floor(attribute.block.size / BYTES[attribute.type]);
}

const DOMAIN_NAMES: Readonly<Record<keyof Sizes, string>> = {
  point: "vertices",
  edge: "edges",
  face: "faces",
  corner: "face corners",
};

/** Refuses a mesh that counts more elements than the data that defines them holds, as a damaged file can. */
function checkCounts(mesh: BlendStruct, reader: AttributeReader, layers: CustomDataLayers, sizes: Sizes): void {
  const position = reader.find("position", ["float3"], "point");
  const edgeVerts = reader.find(".edge_verts", ["int32_2d"], "edge");
  const cornerVert = reader.find(".corner_vert", ["int32"], "corner");
  const offsets = mesh.target("poly_offset_indices");
  const legacy = (field: LayerField, type: TopologyLayer) => legacyArray(mesh.file, layers[field], type).length;
  const held: Sizes = {
    point: position ? heldElements(position) : legacy("vdata", CustomDataType.vertex),
    edge: edgeVerts ? heldElements(edgeVerts) : legacy("edata", CustomDataType.edge),
    face: offsets ? Math.max(Math.floor(offsets.size / 4) - 1, 0) : legacy("pdata", CustomDataType.face),
    corner: cornerVert ? heldElements(cornerVert) : legacy("ldata", CustomDataType.loop),
  };
  for (const domain of ["point", "edge", "face", "corner"] as const) {
    if (sizes[domain] <= held[domain]) continue;
    const what = DOMAIN_NAMES[domain];
    throw new MeshReadError(`Mesh ${idName(mesh)} counts ${sizes[domain]} ${what} but holds ${held[domain]}`);
  }
}

/**
 * Reads a mesh datablock. `objectGroups` are the vertex group names an object stores in files before Blender 3.0, and
 * `wantedColors` name, for each material slot, the color attributes to read in place of the default one.
 */
export function readMeshData(
  file: BlendFile,
  mesh: BlendStruct,
  objectGroups: readonly string[] = [],
  wantedColors: readonly (readonly string[])[] = [],
): MeshData {
  const sizes: Sizes = {
    point: Math.max(mesh.number("totvert"), 0),
    edge: Math.max(mesh.number("totedge"), 0),
    face: Math.max(mesh.number("totpoly"), 0),
    corner: Math.max(mesh.number("totloop"), 0),
  };
  checkLayerCounts(mesh);
  const layers = readLayers(mesh);
  const attributes = [...storageAttributes(mesh), ...customDataAttributes(layers)];
  const reader = new AttributeReader(file, attributes, sizes);
  checkCounts(mesh, reader, layers, sizes);
  const topology = readTopology(file, mesh, reader, layers, sizes);
  validateTopology(topology, sizes, idName(mesh));
  const uvs = readUvMaps(file, mesh, reader, layers, sizes);
  const groupNames = mesh.has("vertex_group_names")
    ? mesh.list("vertex_group_names").map((group) => group.string("name"))
    : [...objectGroups];
  const shapeKeys = readShapeKeys(mesh, file, sizes, topology.positions);
  const autoSmooth = (mesh.number("flag") & LEGACY_AUTO_SMOOTH) !== 0 && mesh.has("smoothresh") && file.version < 401;
  return {
    name: idName(mesh),
    vertexCount: sizes.point,
    edgeCount: sizes.edge,
    faceCount: sizes.face,
    cornerCount: sizes.corner,
    ...topology,
    positions: shapeKeys.basis ?? topology.positions,
    autoSmoothAngle: autoSmooth ? mesh.number("smoothresh") : null,
    uvMaps: uvs.maps,
    defaultUv: uvs.default,
    colors: readColors(reader, mesh, usedFirst(wantedColors, topology.materialIndices)),
    attributeNames: reader.attributes.map((attribute) => attribute.name).filter((name) => !name.startsWith(".")),
    customNormals: readCustomNormals(reader, file, layers, sizes),
    deformWeights: readDeformWeights(file, mesh, layers, sizes),
    vertexGroupNames: groupNames,
    shapeKeys: shapeKeys.keys,
    referenceKey: shapeKeys.reference,
    absoluteKeys: shapeKeys.absolute,
    shapeKeysLeftOut: shapeKeys.leftOut,
  };
}

function validateTopology(
  topology: { faceOffsets: Int32Array; cornerVerts: Int32Array; cornerEdges: Int32Array; edges: Int32Array },
  sizes: Sizes,
  name: string,
): void {
  const { faceOffsets, cornerVerts, cornerEdges, edges } = topology;
  for (let f = 0; f < sizes.face; f++) {
    const start = faceOffsets[f] ?? 0;
    const end = faceOffsets[f + 1] ?? 0;
    if (start < 0 || end > sizes.corner || end - start < 0) {
      throw new MeshReadError(`Mesh ${name} has a face outside its corners`);
    }
  }
  for (let c = 0; c < sizes.corner; c++) {
    const vertex = cornerVerts[c] ?? -1;
    if (vertex < 0 || vertex >= sizes.point) throw new MeshReadError(`Mesh ${name} has a corner without a vertex`);
    const edge = cornerEdges[c] ?? -1;
    if (edge >= sizes.edge) cornerEdges[c] = -1;
  }
  for (let e = 0; e < sizes.edge * 2; e++) {
    const vertex = edges[e] ?? -1;
    if (vertex < 0 || vertex >= sizes.point) throw new MeshReadError(`Mesh ${name} has an edge without a vertex`);
  }
  if (cornerEdges.some((edge) => edge < 0)) linkCornerEdges(topology, sizes);
}

/** Finds the edge from each corner's vertex to the next corner's vertex, for corners that do not name one. */
function linkCornerEdges(
  topology: { faceOffsets: Int32Array; cornerVerts: Int32Array; cornerEdges: Int32Array; edges: Int32Array },
  sizes: Sizes,
): void {
  const { faceOffsets, cornerVerts, cornerEdges, edges } = topology;
  const key = (a: number, b: number) => (a < b ? a * sizes.point + b : b * sizes.point + a);
  const byVertices = new Map<number, number>();
  for (let e = 0; e < sizes.edge; e++) byVertices.set(key(edges[e * 2] ?? 0, edges[e * 2 + 1] ?? 0), e);
  for (let f = 0; f < sizes.face; f++) {
    const start = faceOffsets[f] ?? 0;
    const end = faceOffsets[f + 1] ?? start;
    for (let c = start; c < end; c++) {
      if ((cornerEdges[c] ?? -1) >= 0) continue;
      const next = c + 1 < end ? c + 1 : start;
      cornerEdges[c] = byVertices.get(key(cornerVerts[c] ?? 0, cornerVerts[next] ?? 0)) ?? -1;
    }
  }
}
