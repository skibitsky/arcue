import type { BlendStruct } from "../blend/file";
import { idName } from "../blend/ids";
import type { MeshData } from "./mesh-data";
import { ModifierType, modifierType, viewportModifiers } from "./modifiers";
import { faceNormals } from "./normals";

const PROPERTY_INT = 1;
const PROPERTY_FLOAT = 2;
const PROPERTY_DOUBLE = 8;
const PROPERTY_BOOLEAN = 10;
const DEFAULT_ANGLE = Math.PI / 6;

/** Names of the node groups Blender adds for auto smooth: the Essentials asset, and the one versioning makes. */
const SMOOTHING_GROUPS = [/^Smooth by Angle(\.\d+)?$/, /^Auto Smooth(\.\d+)?$/];

/** The nodes of those groups, which read edge angles and smooth flags and set the flags, and nothing else. */
const SHADING_NODES: ReadonlySet<string> = new Set([
  "NodeGroupInput",
  "NodeGroupOutput",
  "NodeReroute",
  "NodeFrame",
  "GeometryNodeSetShadeSmooth",
  "GeometryNodeInputMeshEdgeAngle",
  "GeometryNodeInputEdgeSmooth",
  "GeometryNodeInputShadeSmooth",
  "FunctionNodeBooleanMath",
  "FunctionNodeCompare",
]);

/**
 * Whether a node group is Blender's auto smooth group: by its name, or by its nodes, since Blender names the group
 * that versioning makes, and its sockets, in the interface language when it translates new data.
 */
function isSmoothingGroup(group: BlendStruct): boolean {
  if (SMOOTHING_GROUPS.some((pattern) => pattern.test(idName(group)))) return true;
  const types = group.list("nodes").map((node) => node.string("idname"));
  return (
    types.includes("GeometryNodeSetShadeSmooth") &&
    types.includes("GeometryNodeInputMeshEdgeAngle") &&
    types.every((type) => SHADING_NODES.has(type))
  );
}

/** Whether the modifier is Blender's Smooth by Angle, which changes only how the mesh shades. */
export function isSmoothByAngle(modifier: BlendStruct): boolean {
  const group = modifierType(modifier) === ModifierType.nodes ? modifier.deref("node_group") : null;
  return group !== null && isSmoothingGroup(group);
}

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

/** The input sockets of a node group's interface in order, panels included. */
function groupInputs(group: BlendStruct): BlendStruct[] {
  const inputs: BlendStruct[] = [];
  const seen = new Set<number>();
  const root = group.struct("tree_interface")?.struct("root_panel");
  const panels = root ? [root] : [];
  for (let panel = panels.shift(); panel; panel = panels.shift()) {
    if (seen.has(panel.offset)) continue;
    seen.add(panel.offset);
    const items = panel.pointers("items_array", Math.max(panel.number("items_num"), 0));
    for (const item of items.map((address) => panel.file.first(panel.resolve(address)))) {
      if (item?.typeName === "bNodeTreeInterfacePanel") panels.push(item);
      else if (item?.typeName === "bNodeTreeInterfaceSocket" && (item.number("flag") & SOCKET_INPUT) !== 0) {
        inputs.push(item);
      }
    }
  }
  return inputs;
}

/** The first input of a socket type, such as "NodeSocketFloat", which also matches its subtypes. */
function inputOfType(inputs: readonly BlendStruct[], type: string): BlendStruct | undefined {
  return inputs.find((socket) => socket.text("socket_type").startsWith(type));
}

/** An input's value on the modifier, stored under the socket's identifier, or else the socket's default. */
function inputValue(properties: BlendStruct | null, socket: BlendStruct | undefined): number | null {
  if (!socket) return null;
  return propertyValue(properties, socket.text("identifier")) ?? socket.deref("socket_data")?.number("value") ?? null;
}

/**
 * The object's Smooth by Angle modifier when it is on in viewports, with its settings. The group's one angle input
 * and one switch, Ignore Sharpness, are found by their types, as their names may be translated.
 */
export function smoothByAngle(object: BlendStruct): SmoothByAngle | null {
  for (const modifier of viewportModifiers(object)) {
    if (!isSmoothByAngle(modifier)) continue;
    const group = modifier.deref("node_group");
    const properties = modifier.struct("settings")?.deref("properties") ?? null;
    const inputs = group ? groupInputs(group) : [];
    return {
      modifier,
      angle: inputValue(properties, inputOfType(inputs, "NodeSocketFloat")) ?? DEFAULT_ANGLE,
      ignoreSharpness: (inputValue(properties, inputOfType(inputs, "NodeSocketBool")) ?? 0) !== 0,
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
