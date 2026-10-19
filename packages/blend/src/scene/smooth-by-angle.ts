import type { BlendBlock, BlendFile, BlendStruct } from "../blend/file.js";
import { idName, isLinked } from "../blend/ids.js";
import type { MeshData } from "./mesh-data.js";
import { ModifierType, modifierType, viewportModifiers } from "./modifiers.js";
import { faceNormals } from "./normals.js";
import {
  graphOf,
  groupOutput,
  inputSocket,
  linkedOutput,
  nodeType,
  type ShaderGraph,
  SocketType,
  socketType,
  socketValue,
} from "./shader-graph.js";

const PROPERTY_INT = 1;
const PROPERTY_FLOAT = 2;
const PROPERTY_DOUBLE = 8;
const PROPERTY_BOOLEAN = 10;
const DEFAULT_ANGLE = Math.PI / 6;
const DOMAIN_EDGE = 1;
const DOMAIN_FACE = 2;
const BOOLEAN_AND = 0;
const BOOLEAN_OR = 1;
const COMPARE_LESS_EQUAL = 1;

/** The identifiers of a smoothing group's angle input and Ignore Sharpness switch, which only the Essentials has. */
interface SmoothingInputs {
  angle: string;
  ignoreSharpness: string | null;
}

/**
 * The node groups Blender adds for auto smooth, the Essentials asset and the one versioning makes, by name and with
 * their inputs. Only a group linked from a file this one does not hold is known by its name.
 */
const LINKED_GROUPS: readonly { name: RegExp; inputs: SmoothingInputs }[] = [
  { name: /^Smooth by Angle(\.\d+)?$/, inputs: { angle: "Input_1", ignoreSharpness: "Socket_1" } },
  { name: /^Auto Smooth(\.\d+)?$/, inputs: { angle: "Socket_2", ignoreSharpness: null } },
];

export interface SmoothByAngle {
  /** The modifier, so the importer knows it is applied. */
  modifier: BlendStruct;
  angle: number;
  ignoreSharpness: boolean;
}

/** A number in a modifier's ID property group, or null when it has no such property. */
function propertyValue(group: BlendStruct | null, name: string): number | null {
  for (const property of group?.struct("data")?.list("group") ?? []) {
    if (property.string("name") !== name) continue;
    const data = property.struct("data");
    const field = data?.field("val");
    if (!data || !field) return null;
    const offset = data.offset + field.offset;
    const { view, little } = property.file;
    switch (property.number("type")) {
      case PROPERTY_INT:
      case PROPERTY_BOOLEAN:
        return view.getInt32(offset, little);
      case PROPERTY_FLOAT:
        return view.getFloat32(offset, little);
      case PROPERTY_DOUBLE:
        return view.getFloat64(offset, little);
      default:
        return null;
    }
  }
  return null;
}

const SOCKET_INPUT = 1 << 0;

/** A panel of a node group's interface whose items are being read, and the index of the next. */
interface PanelItems {
  panel: BlendStruct;
  items: BlendBlock | null;
  count: number;
  next: number;
}

function panelItems(panel: BlendStruct): PanelItems {
  const items = panel.target("items_array");
  const held = items ? Math.floor(items.size / panel.file.pointerSize) : 0;
  return { panel, items, count: Math.min(Math.max(panel.number("items_num"), 0), held), next: 0 };
}

/**
 * The input sockets of a node group's interface in Blender's order, each panel's in its place. Panels are read on a
 * stack of their own, however deep they nest, and each once.
 */
function groupInputs(group: BlendStruct): BlendStruct[] {
  const root = group.struct("tree_interface")?.struct("root_panel");
  if (!root) return [];
  const inputs: BlendStruct[] = [];
  const seen = new Set<number>([root.offset]);
  const panels = [panelItems(root)];
  for (let top = panels.at(-1); top; top = panels.at(-1)) {
    if (!top.items || top.next >= top.count) {
      panels.pop();
      continue;
    }
    const { file } = top.panel;
    const address = file.pointerAt(top.items.offset + top.next * file.pointerSize);
    top.next++;
    const item = file.first(top.panel.resolve(address));
    if (item?.typeName === "bNodeTreeInterfacePanel" && !seen.has(item.offset)) {
      seen.add(item.offset);
      panels.push(panelItems(item));
    } else if (item?.typeName === "bNodeTreeInterfaceSocket" && (item.number("flag") & SOCKET_INPUT) !== 0) {
      inputs.push(item);
    }
  }
  return inputs;
}

/** The identifier of the group input of `type` that a socket reads, or null when it reads anything else. */
function groupInput(graph: ShaderGraph, socket: BlendStruct | null, type: number): string | null {
  const source = linkedOutput(graph, socket);
  if (!source || nodeType(source.node) !== "NodeGroupInput" || socketType(source.socket) !== type) return null;
  return source.name;
}

/** The two inputs of the Boolean Math node with `operation` that a socket reads, in both orders, or none. */
function operands(graph: ShaderGraph, socket: BlendStruct | null, operation: number): [BlendStruct, BlendStruct][] {
  const node = linkedOutput(graph, socket)?.node;
  if (!node || nodeType(node) !== "FunctionNodeBooleanMath" || node.number("custom1") !== operation) return [];
  const [a, b] = node.list("inputs");
  return a && b
    ? [
        [a, b],
        [b, a],
      ]
    : [];
}

/**
 * Whether a socket reads a smooth flag from a node of `type`, alone or ORed with a group input, as the auto smooth
 * groups' Ignore Sharpness switch does. Null when it reads anything else.
 */
function smoothFlag(
  graph: ShaderGraph,
  socket: BlendStruct | null,
  type: string,
): { ignoreSharpness: string | null } | null {
  const source = linkedOutput(graph, socket);
  if (source && nodeType(source.node) === type) return { ignoreSharpness: null };
  for (const [flag, other] of operands(graph, socket, BOOLEAN_OR)) {
    const read = linkedOutput(graph, flag);
    const input = groupInput(graph, other, SocketType.boolean);
    if (read && nodeType(read.node) === type && input) return { ignoreSharpness: input };
  }
  return null;
}

/** The group input that a socket compares each edge's angle with, as `angle <= input`, or null. */
function angleLimit(graph: ShaderGraph, socket: BlendStruct | null): string | null {
  const node = linkedOutput(graph, socket)?.node;
  if (!node || nodeType(node) !== "FunctionNodeCompare") return null;
  const settings = node.deref("storage");
  if (settings?.number("data_type") !== SocketType.float || settings.number("operation") !== COMPARE_LESS_EQUAL) {
    return null;
  }
  const angle = linkedOutput(graph, inputSocket(node, "A"));
  const edges = angle?.name === "Unsigned Angle" && nodeType(angle.node) === "GeometryNodeInputMeshEdgeAngle";
  return edges ? groupInput(graph, inputSocket(node, "B"), SocketType.float) : null;
}

function setsSmooth(node: BlendStruct | undefined, domain: number): node is BlendStruct {
  return node !== undefined && nodeType(node) === "GeometryNodeSetShadeSmooth" && node.number("custom1") === domain;
}

function alwaysOn(graph: ShaderGraph, node: BlendStruct, ...names: string[]): boolean {
  return names.every((name) => {
    const socket = inputSocket(node, name);
    return socket !== null && !linkedOutput(graph, socket) && socketValue(socket)[0] === 1;
  });
}

/**
 * The inputs of a node group wired as Blender's auto smooth groups are, or null for any other group. The Essentials'
 * Smooth by Angle and the "Auto Smooth" group that versioning makes are wired alike, the second without the Ignore
 * Sharpness switch, and do what `applySmoothByAngle` does. The modifier gives the object's mesh only to a group whose
 * first input is a geometry.
 */
function wiredInputs(group: BlendStruct): SmoothingInputs | null {
  const nodes = group.list("nodes");
  if (nodes.length === 0) {
    return isLinked(group) ? (LINKED_GROUPS.find(({ name }) => name.test(idName(group)))?.inputs ?? null) : null;
  }
  const graph = graphOf(group);
  const result = groupOutput(nodes)?.list("inputs")[0] ?? null;
  if (!result || socketType(result) !== SocketType.geometry) return null;
  const faces = linkedOutput(graph, result)?.node;
  if (!setsSmooth(faces, DOMAIN_FACE) || !alwaysOn(graph, faces, "Selection", "Shade Smooth")) return null;
  const edges = linkedOutput(graph, inputSocket(faces, "Geometry"))?.node;
  if (!setsSmooth(edges, DOMAIN_EDGE)) return null;
  const [mesh] = groupInputs(group);
  const read = groupInput(graph, inputSocket(edges, "Geometry"), SocketType.geometry);
  const selection = smoothFlag(graph, inputSocket(edges, "Selection"), "GeometryNodeInputEdgeSmooth");
  if (mesh?.text("socket_type") !== "NodeSocketGeometry" || read !== mesh.text("identifier") || !selection) return null;
  for (const [within, smooth] of operands(graph, inputSocket(edges, "Shade Smooth"), BOOLEAN_AND)) {
    const angle = angleLimit(graph, within);
    const faceFlag = smoothFlag(graph, smooth, "GeometryNodeInputShadeSmooth");
    if (angle && faceFlag?.ignoreSharpness === selection.ignoreSharpness) return { angle, ...selection };
  }
  return null;
}

const smoothingGroups = new WeakMap<BlendFile, Map<number, SmoothingInputs | null>>();

/** `wiredInputs` of a group, read once for all the objects that share it. */
function smoothingInputs(group: BlendStruct): SmoothingInputs | null {
  let known = smoothingGroups.get(group.file);
  if (!known) {
    known = new Map();
    smoothingGroups.set(group.file, known);
  }
  const found = known.get(group.offset);
  if (found !== undefined) return found;
  const inputs = wiredInputs(group);
  known.set(group.offset, inputs);
  return inputs;
}

/** Whether the modifier is Blender's Smooth by Angle, which changes only how the mesh shades. */
export function isSmoothByAngle(modifier: BlendStruct): boolean {
  const group = modifierType(modifier) === ModifierType.nodes ? modifier.deref("node_group") : null;
  return group !== null && smoothingInputs(group) !== null;
}

/** An input's value on the modifier, stored under the socket's identifier, or else the socket's default. */
function inputValue(properties: BlendStruct | null, group: BlendStruct, identifier: string | null): number | null {
  if (identifier === null) return null;
  const socket = groupInputs(group).find((input) => input.text("identifier") === identifier);
  return propertyValue(properties, identifier) ?? socket?.deref("socket_data")?.number("value") ?? null;
}

/**
 * The object's Smooth by Angle modifier when it is on in viewports, with its settings: the values of the group inputs
 * that its nodes compare edge angles with and that ignore sharpness.
 */
export function smoothByAngle(object: BlendStruct): SmoothByAngle | null {
  for (const modifier of viewportModifiers(object)) {
    const group = modifierType(modifier) === ModifierType.nodes ? modifier.deref("node_group") : null;
    const inputs = group ? smoothingInputs(group) : null;
    if (!group || !inputs) continue;
    const properties = modifier.struct("settings")?.deref("properties") ?? null;
    return {
      modifier,
      angle: inputValue(properties, group, inputs.angle) ?? DEFAULT_ANGLE,
      ignoreSharpness: (inputValue(properties, group, inputs.ignoreSharpness) ?? 0) !== 0,
    };
  }
  return null;
}

/**
 * What the Smooth by Angle node group does: every face shades smooth, and an edge turns sharp where its faces meet
 * at more than the angle. Unless it ignores sharpness, sharp edges stay sharp and edges next to a flat face turn sharp
 * too.
 */
export function applySmoothByAngle(mesh: MeshData, settings: SmoothByAngle): MeshData {
  const normals = faceNormals(mesh);
  const faceCounts = new Int32Array(mesh.edgeCount);
  const firstFaces = new Int32Array(mesh.edgeCount);
  const secondFaces = new Int32Array(mesh.edgeCount);
  const nextToFlatFace = new Uint8Array(mesh.edgeCount);
  for (let face = 0; face < mesh.faceCount; face++) {
    const flat = (mesh.sharpFaces?.[face] ?? 0) !== 0;
    for (let corner = mesh.faceOffsets[face] ?? 0; corner < (mesh.faceOffsets[face + 1] ?? 0); corner++) {
      const edge = mesh.cornerEdges[corner] ?? -1;
      if (edge < 0 || edge >= mesh.edgeCount) continue;
      const count = faceCounts[edge] ?? 0;
      if (count === 0) firstFaces[edge] = face;
      else if (count === 1) secondFaces[edge] = face;
      faceCounts[edge] = count + 1;
      if (flat) nextToFlatFace[edge] = 1;
    }
  }
  const sharpEdges = new Uint8Array(mesh.edgeCount);
  for (let edge = 0; edge < mesh.edgeCount; edge++) {
    const wasSharp = (mesh.sharpEdges?.[edge] ?? 0) !== 0;
    if (wasSharp && !settings.ignoreSharpness) {
      sharpEdges[edge] = 1;
      continue;
    }
    const small =
      faceCounts[edge] !== 2 || edgeAngle(normals, firstFaces[edge] ?? 0, secondFaces[edge] ?? 0) <= settings.angle;
    const smoothFaces = settings.ignoreSharpness || nextToFlatFace[edge] === 0;
    sharpEdges[edge] = small && smoothFaces ? 0 : 1;
  }
  return { ...mesh, sharpEdges, sharpFaces: null, autoSmoothAngle: null };
}

/** The angle between two faces' unit normals, as Blender's `angle_normalized_v3v3` measures it for Edge Angle. */
function edgeAngle(normals: Float32Array, a: number, b: number): number {
  const ax = normals[a * 3] ?? 0;
  const ay = normals[a * 3 + 1] ?? 0;
  const az = normals[a * 3 + 2] ?? 0;
  const bx = normals[b * 3] ?? 0;
  const by = normals[b * 3 + 1] ?? 0;
  const bz = normals[b * 3 + 2] ?? 0;
  const [dx, dy, dz] = ax * bx + ay * by + az * bz >= 0 ? [ax - bx, ay - by, az - bz] : [ax + bx, ay + by, az + bz];
  const half = 2 * Math.asin(Math.min(Math.sqrt(dx * dx + dy * dy + dz * dz) / 2, 1));
  return ax * bx + ay * by + az * bz >= 0 ? half : Math.PI - half;
}
