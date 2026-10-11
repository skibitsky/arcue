import type { BlendBlock, BlendFile, BlendStruct } from "../blend/file";
import { idName } from "../blend/ids";

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

/** Generic CustomData layer types of Blender 4 and earlier. */
const CUSTOM_DATA_TYPES: ReadonlyMap<number, AttributeType> = new Map([
  [10, "float"],
  [11, "int32"],
  [17, "byteColor"],
  [20, "float4x4"],
  [45, "int8"],
  [46, "int32_2d"],
  [47, "floatColor"],
  [48, "float3"],
  [49, "float2"],
  [50, "bool"],
  [52, "quaternion"],
]);

const DOMAINS: readonly Domain[] = ["point", "edge", "face", "corner"];

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
} as const;

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

export interface UvMap {
  name: string;
  /** Two values per face corner. */
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
  /** Linear RGBA of the default color attribute, four values per element of its domain. */
  colors: { domain: "point" | "corner"; values: Float32Array } | null;
  customNormals: CustomNormals | null;
  deformWeights: DeformWeights | null;
  vertexGroupNames: string[];
  shapeKeys: ShapeKey[];
  /** The key the others are relative to, by default, or -1. */
  referenceKey: number;
  /** Material slots of the mesh data, as datablock structs or null for empty slots. */
  materials: (BlendStruct | null)[];
}

export class MeshReadError extends Error {
  override readonly name = "MeshReadError";
}

function storageAttributes(mesh: BlendStruct): MeshAttribute[] {
  const storage = mesh.struct("attribute_storage");
  if (!storage) return [];
  const count = storage.number("dna_attributes_num");
  return storage
    .derefAll("dna_attributes")
    .slice(0, count)
    .flatMap((attribute) => {
      const type = STORAGE_TYPES[attribute.number("data_type")];
      const domain = DOMAINS[attribute.number("domain")];
      if (!type || !domain) return [];
      const holder = attribute.deref("data");
      const single = attribute.number("storage_type") === 1;
      return [{ name: attribute.text("name"), type, domain, block: holder?.target("data") ?? null, single }];
    });
}

function customDataAttributes(mesh: BlendStruct): MeshAttribute[] {
  const result: MeshAttribute[] = [];
  const fields: [string, Domain][] = [
    ["vdata", "point"],
    ["edata", "edge"],
    ["pdata", "face"],
    ["ldata", "corner"],
  ];
  for (const [field, domain] of fields) {
    const data = mesh.struct(field);
    if (!data) continue;
    const layers = data.derefAll("layers").slice(0, data.number("totlayer"));
    for (const layer of layers) {
      const type = CUSTOM_DATA_TYPES.get(layer.number("type"));
      if (!type) continue;
      result.push({ name: layer.string("name"), type, domain, block: layer.target("data"), single: false });
    }
  }
  return result;
}

function customDataLayers(mesh: BlendStruct, field: string, type: number): BlendStruct[] {
  const data = mesh.struct(field);
  if (!data) return [];
  return data
    .derefAll("layers")
    .slice(0, data.number("totlayer"))
    .filter((layer) => layer.number("type") === type);
}

function isActiveLayer(mesh: BlendStruct, field: string, type: number, layer: BlendStruct, member: string): boolean {
  const layers = customDataLayers(mesh, field, type);
  const active = layers[0]?.number(member) ?? 0;
  return layers[active]?.offset === layer.offset;
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

function readColors(reader: AttributeReader, mesh: BlendStruct): MeshData["colors"] {
  const colorTypes: AttributeType[] = ["byteColor", "floatColor"];
  const candidates = reader.attributes.filter(
    (attribute) =>
      colorTypes.includes(attribute.type) &&
      (attribute.domain === "point" || attribute.domain === "corner") &&
      !attribute.name.startsWith("."),
  );
  const wanted = mesh.text("default_color_attribute") || mesh.text("active_color_attribute");
  const attribute = candidates.find((candidate) => candidate.name === wanted) ?? candidates[0];
  if (!attribute || (attribute.domain !== "point" && attribute.domain !== "corner")) return null;
  if (attribute.type === "floatColor") return { domain: attribute.domain, values: reader.float32(attribute) };
  const bytes = reader.bytes(attribute);
  const values = new Float32Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    const unit = (bytes[i] ?? 0) / 255;
    values[i] = i % 4 === 3 ? unit : srgbToLinear(unit);
  }
  return { domain: attribute.domain, values };
}

function legacyStructs(mesh: BlendStruct, field: string, type: number): BlendStruct[] {
  const layer = customDataLayers(mesh, field, type)[0];
  return layer?.derefAll("data") ?? [];
}

const LEGACY_FACE_SMOOTH = 1 << 0;
const LEGACY_EDGE_SHARP = 1 << 9;
const LEGACY_AUTO_SMOOTH = 1 << 5;

function readTopology(file: BlendFile, mesh: BlendStruct, reader: AttributeReader, sizes: Sizes) {
  const position = reader.find("position", ["float3"], "point");
  let positions: Float32Array;
  if (position) positions = reader.float32(position);
  else {
    const vertices = legacyStructs(mesh, "vdata", CustomDataType.vertex);
    positions = new Float32Array(sizes.point * 3);
    vertices.slice(0, sizes.point).forEach((vertex, index) => {
      positions.set(vertex.numbers("co").slice(0, 3), index * 3);
    });
  }

  const edgeVerts = reader.find(".edge_verts", ["int32_2d"], "edge");
  let edges: Int32Array;
  let legacyEdges: BlendStruct[] = [];
  if (edgeVerts) edges = reader.int32(edgeVerts);
  else {
    legacyEdges = legacyStructs(mesh, "edata", CustomDataType.edge);
    edges = new Int32Array(sizes.edge * 2);
    legacyEdges.slice(0, sizes.edge).forEach((edge, index) => {
      edges[index * 2] = edge.number("v1");
      edges[index * 2 + 1] = edge.number("v2");
    });
  }

  let faceOffsets: Int32Array;
  let legacyFaces: BlendStruct[] = [];
  const offsetsBlock = mesh.target("poly_offset_indices");
  if (offsetsBlock) {
    faceOffsets = padded(file.int32(offsetsBlock, sizes.face + 1), sizes.face + 1);
  } else {
    legacyFaces = legacyStructs(mesh, "pdata", CustomDataType.face);
    faceOffsets = new Int32Array(sizes.face + 1);
    legacyFaces.slice(0, sizes.face).forEach((face, index) => {
      faceOffsets[index] = face.number("loopstart");
    });
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
    const loops = legacyStructs(mesh, "ldata", CustomDataType.loop);
    cornerVerts = new Int32Array(sizes.corner);
    cornerEdges = new Int32Array(sizes.corner);
    loops.slice(0, sizes.corner).forEach((loop, index) => {
      cornerVerts[index] = loop.number("v");
      cornerEdges[index] = loop.number("e");
    });
  }

  let materialIndices: Int32Array | null = null;
  const material = reader.find("material_index", ["int32"], "face");
  if (material) materialIndices = reader.int32(material);
  else if (legacyFaces.length > 0) {
    materialIndices = Int32Array.from(legacyFaces.slice(0, sizes.face), (face) => face.number("mat_nr"));
  }

  let sharpFaces: Uint8Array | null = null;
  const sharpFace = reader.find("sharp_face", ["bool"], "face");
  if (sharpFace) sharpFaces = reader.bytes(sharpFace);
  else if (legacyFaces.length > 0) {
    sharpFaces = Uint8Array.from(legacyFaces.slice(0, sizes.face), (face) =>
      (face.number("flag") & LEGACY_FACE_SMOOTH) === 0 ? 1 : 0,
    );
  }

  let sharpEdges: Uint8Array | null = null;
  const sharpEdge = reader.find("sharp_edge", ["bool"], "edge");
  if (sharpEdge) sharpEdges = reader.bytes(sharpEdge);
  else if (legacyEdges.length > 0) {
    sharpEdges = Uint8Array.from(legacyEdges.slice(0, sizes.edge), (edge) =>
      (edge.number("flag") & LEGACY_EDGE_SHARP) !== 0 ? 1 : 0,
    );
  }

  return { positions, edges, faceOffsets, cornerVerts, cornerEdges, materialIndices, sharpFaces, sharpEdges };
}

function readUvMaps(mesh: BlendStruct, reader: AttributeReader, sizes: Sizes): { maps: UvMap[]; default: number } {
  const maps: UvMap[] = [];
  for (const attribute of reader.attributes) {
    if (attribute.type !== "float2" || attribute.domain !== "corner" || attribute.name.startsWith(".")) continue;
    maps.push({ name: attribute.name, values: reader.float32(attribute) });
  }
  let renderLayer: string | null = null;
  if (maps.length === 0) {
    const layers = customDataLayers(mesh, "ldata", CustomDataType.loopUv);
    for (const layer of layers) {
      const values = new Float32Array(sizes.corner * 2);
      layer
        .derefAll("data")
        .slice(0, sizes.corner)
        .forEach((uv, index) => {
          values.set(uv.numbers("uv").slice(0, 2), index * 2);
        });
      maps.push({ name: layer.string("name"), values });
      if (isActiveLayer(mesh, "ldata", CustomDataType.loopUv, layer, "active_rnd")) renderLayer = layer.string("name");
    }
  } else {
    const float2Layers = customDataLayers(mesh, "ldata", 49);
    for (const layer of float2Layers) {
      if (isActiveLayer(mesh, "ldata", 49, layer, "active_rnd")) renderLayer = layer.string("name");
    }
  }
  const wanted = mesh.text("default_uv_map_attribute") || renderLayer || mesh.text("active_uv_map_attribute");
  const index = maps.findIndex((map) => map.name === wanted);
  return { maps, default: Math.max(index, 0) };
}

function readCustomNormals(mesh: BlendStruct, reader: AttributeReader, file: BlendFile, sizes: Sizes) {
  const named = reader.find("custom_normal");
  if (named?.type === "int16_2d" && named.domain === "corner") {
    return { kind: "encoded", values: reader.int16(named) } satisfies CustomNormals;
  }
  if (named?.type === "float3" && file.version >= FREE_NORMALS_VERSION) {
    return { kind: "free", domain: named.domain, values: reader.float32(named) } satisfies CustomNormals;
  }
  const layer = customDataLayers(mesh, "ldata", CustomDataType.customLoopNormal)[0];
  const block = layer?.target("data");
  if (block) {
    return {
      kind: "encoded",
      values: padded(file.int16(block, sizes.corner * 2), sizes.corner * 2),
    } satisfies CustomNormals;
  }
  return null;
}

function readDeformWeights(mesh: BlendStruct, sizes: Sizes): DeformWeights | null {
  const layer = customDataLayers(mesh, "vdata", CustomDataType.deformVertex)[0];
  const vertices = layer?.derefAll("data") ?? mesh.derefAll("dvert");
  if (vertices.length === 0) return null;
  const offsets = new Uint32Array(sizes.point + 1);
  const groups: number[] = [];
  const weights: number[] = [];
  for (let v = 0; v < sizes.point; v++) {
    offsets[v] = groups.length;
    const vertex = vertices[v];
    if (!vertex) continue;
    const total = vertex.number("totweight");
    const entries = vertex.derefAll("dw").slice(0, Math.max(total, 0));
    for (const entry of entries) {
      groups.push(entry.number("def_nr"));
      weights.push(entry.number("weight"));
    }
  }
  offsets[sizes.point] = groups.length;
  return { offsets, groups: Int32Array.from(groups), weights: Float32Array.from(weights) };
}

const KEY_BLOCK_MUTE = 1 << 0;
/** Blender 4.5 made a float vector "custom_normal" attribute on faces, points or corners the mesh's normals. */
const FREE_NORMALS_VERSION = 405;

function readShapeKeys(mesh: BlendStruct, file: BlendFile, sizes: Sizes): { keys: ShapeKey[]; reference: number } {
  const key = mesh.deref("key");
  if (!key) return { keys: [], reference: -1 };
  const blocks = key.list("block");
  const reference = blocks.findIndex((block) => block.offset === file.first(key.target("refkey"))?.offset);
  const keys = blocks.map((block) => {
    const data = block.target("data");
    const positions = data
      ? padded(file.float32(data, sizes.point * 3), sizes.point * 3)
      : new Float32Array(sizes.point * 3);
    return {
      name: block.string("name"),
      positions,
      relative: block.number("relative"),
      value: block.number("curval"),
      min: block.number("slidermin"),
      max: block.number("slidermax"),
      muted: (block.number("flag") & KEY_BLOCK_MUTE) !== 0,
      vertexGroup: block.string("vgroup"),
    };
  });
  return { keys, reference: reference === -1 && keys.length > 0 ? 0 : reference };
}

/** Reads a mesh datablock. `objectGroups` are the vertex group names an object stores in files before Blender 3.0. */
export function readMeshData(file: BlendFile, mesh: BlendStruct, objectGroups: readonly string[] = []): MeshData {
  const sizes: Sizes = {
    point: Math.max(mesh.number("totvert"), 0),
    edge: Math.max(mesh.number("totedge"), 0),
    face: Math.max(mesh.number("totpoly"), 0),
    corner: Math.max(mesh.number("totloop"), 0),
  };
  const attributes = [...storageAttributes(mesh), ...customDataAttributes(mesh)];
  const reader = new AttributeReader(file, attributes, sizes);
  const topology = readTopology(file, mesh, reader, sizes);
  validateTopology(topology, sizes, idName(mesh));
  const uvs = readUvMaps(mesh, reader, sizes);
  const groupNames = mesh.has("vertex_group_names")
    ? mesh.list("vertex_group_names").map((group) => group.string("name"))
    : [...objectGroups];
  const shapeKeys = readShapeKeys(mesh, file, sizes);
  const autoSmooth = (mesh.number("flag") & LEGACY_AUTO_SMOOTH) !== 0 && mesh.has("smoothresh") && file.version < 401;
  const materials = mesh.pointers("mat", Math.max(mesh.number("totcol"), 0)).map((address) => {
    return file.first(mesh.resolve(address));
  });
  return {
    name: idName(mesh),
    vertexCount: sizes.point,
    edgeCount: sizes.edge,
    faceCount: sizes.face,
    cornerCount: sizes.corner,
    ...topology,
    autoSmoothAngle: autoSmooth ? mesh.number("smoothresh") : null,
    uvMaps: uvs.maps,
    defaultUv: uvs.default,
    colors: readColors(reader, mesh),
    customNormals: readCustomNormals(mesh, reader, file, sizes),
    deformWeights: readDeformWeights(mesh, sizes),
    vertexGroupNames: groupNames,
    shapeKeys: shapeKeys.keys,
    referenceKey: shapeKeys.reference,
    materials,
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
