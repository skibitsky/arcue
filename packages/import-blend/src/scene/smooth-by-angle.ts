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

/** The object's Smooth by Angle modifier when it is on in viewports, with its settings. */
export function smoothByAngle(object: BlendStruct): SmoothByAngle | null {
  for (const modifier of viewportModifiers(object)) {
    if (modifierType(modifier) !== ModifierType.nodes) continue;
    const group = modifier.deref("node_group");
    if (!group || !SMOOTHING_GROUPS.some((pattern) => pattern.test(idName(group)))) continue;
    const properties = modifier.struct("settings")?.deref("properties") ?? null;
    return {
      modifier,
      angle: propertyValue(properties, "Input_1") ?? DEFAULT_ANGLE,
      ignoreSharpness: (propertyValue(properties, "Socket_1") ?? 0) !== 0,
    };
  }
  return null;
}

/**
 * What the Smooth by Angle node group does: every face shades smooth, and an edge turns sharp where its faces meet
 * at more than the angle. Unless it ignores sharpness, sharp edges stay sharp and edges whose faces are all flat
 * turn sharp too.
 */
export function applySmoothByAngle(mesh: MeshData, settings: SmoothByAngle): MeshData {
  const normals = faceNormals(mesh);
  const edgeFaces: number[][] = Array.from({ length: mesh.edgeCount }, () => []);
  for (let face = 0; face < mesh.faceCount; face++) {
    for (let corner = mesh.faceOffsets[face] ?? 0; corner < (mesh.faceOffsets[face + 1] ?? 0); corner++) {
      edgeFaces[mesh.cornerEdges[corner] ?? -1]?.push(face);
    }
  }
  const sharpEdges = new Uint8Array(mesh.edgeCount);
  for (let edge = 0; edge < mesh.edgeCount; edge++) {
    const faces = edgeFaces[edge] ?? [];
    const wasSharp = (mesh.sharpEdges?.[edge] ?? 0) !== 0;
    if (wasSharp && !settings.ignoreSharpness) {
      sharpEdges[edge] = 1;
      continue;
    }
    const [a, b] = faces;
    let small = true;
    if (faces.length === 2 && a !== undefined && b !== undefined) {
      const dot =
        (normals[a * 3] ?? 0) * (normals[b * 3] ?? 0) +
        (normals[a * 3 + 1] ?? 0) * (normals[b * 3 + 1] ?? 0) +
        (normals[a * 3 + 2] ?? 0) * (normals[b * 3 + 2] ?? 0);
      small = Math.acos(Math.min(Math.max(dot, -1), 1)) <= settings.angle;
    }
    const smoothFace = settings.ignoreSharpness || faces.some((face) => (mesh.sharpFaces?.[face] ?? 0) === 0);
    sharpEdges[edge] = small && smoothFace ? 0 : 1;
  }
  return { ...mesh, sharpEdges, sharpFaces: null, autoSmoothAngle: null };
}
