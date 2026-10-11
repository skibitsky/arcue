import type { BlendFile, BlendStruct } from "../blend/file";
import { datablocks, idName, isLinked } from "../blend/ids";
import { ModifierType, modifierType, viewportModifiers } from "./modifiers";
import {
  feedingOutputs,
  graphOf,
  groupOutput,
  inputSocket,
  isMuted,
  linkedOutput,
  nodeType,
  type ShaderGraph,
  SocketType,
  socketType,
  socketValue,
} from "./shader-graph";
import { isSmoothByAngle } from "./smooth-by-angle";

export const ObjectType = {
  empty: 0,
  mesh: 1,
  curve: 2,
  surface: 3,
  text: 4,
  metaball: 5,
  light: 10,
  camera: 11,
  speaker: 12,
  lightProbe: 13,
  lattice: 22,
  armature: 25,
  greasePencilLegacy: 26,
  curves: 27,
  pointCloud: 28,
  volume: 29,
  greasePencil: 30,
} as const;

/** Object types whose geometry Arcue does not show; their objects come along as empty nodes. */
export const UNSHOWN_GEOMETRY: ReadonlyMap<number, string> = new Map([
  [ObjectType.curve, "curve"],
  [ObjectType.surface, "surface"],
  [ObjectType.text, "text"],
  [ObjectType.metaball, "metaball"],
  [ObjectType.greasePencilLegacy, "grease pencil"],
  [ObjectType.curves, "hair curves"],
  [ObjectType.pointCloud, "point cloud"],
  [ObjectType.volume, "volume"],
  [ObjectType.greasePencil, "grease pencil"],
]);

export const ParentType = {
  object: 0,
  armatureDeform: 4,
  vertex: 5,
  vertices: 6,
  bone: 7,
} as const;

const PARENT_TYPE_MASK = 15;
export const ARMATURE_DEFORM_VERTEX_GROUPS = 1 << 0;
const OBJECT_HIDE_VIEWPORT = 1 << 0;
const OBJECT_INSTANCES_VERTICES = 1 << 4;
const OBJECT_INSTANCES_COLLECTION = 1 << 8;
const OBJECT_INSTANCES_FACES = 1 << 9;
const OBJECT_INSTANCES_PARTICLES = 1 << 11;
const OBJECT_INSTANCES =
  OBJECT_INSTANCES_VERTICES | OBJECT_INSTANCES_COLLECTION | OBJECT_INSTANCES_FACES | OBJECT_INSTANCES_PARTICLES;
const INSTANCER_SHOWN_IN_VIEWPORT = 1 << 0;
const COLLECTION_HIDE_VIEWPORT = 1 << 0;
const LAYER_COLLECTION_EXCLUDE = 1 << 4;
const LAYER_COLLECTION_HIDE = 1 << 7;
const BASE_HIDDEN = 1 << 8;

export interface SceneObject {
  struct: BlendStruct;
  name: string;
  type: number;
  /** The object's data, such as its mesh or armature, or null for an empty or linked data. */
  data: BlendStruct | null;
  /** The object it is parented to, whether or not the scene shows that object. */
  parent: BlendStruct | null;
  parentType: number;
  /** The bone a bone-parented object follows. */
  parentBone: string;
  /** Whether the scene's collections show the object, rather than another shown object needing it. */
  shown: boolean;
  /** Whether the active view layer hides the shown object or all its collections with the eye. */
  hidden: boolean;
  /** Whether Blender draws only the instances or particles the shown object makes, and not the object itself. */
  instancerHidden: boolean;
}

export interface SceneContents {
  scene: BlendStruct | null;
  /** Shown objects, and the objects they need: their parents and the armatures that deform them. */
  objects: SceneObject[];
  /** Objects that are, or whose mesh or armature data is, linked from other files, which this file does not hold. */
  linkedObjects: string[];
  /** Collections the scene links straight from other files. */
  linkedCollections: string[];
}

function activeScene(file: BlendFile): BlendStruct | null {
  const global = datablocks(file, "GLOB")[0];
  const current = global?.deref("curscene");
  if (current && !isLinked(current)) return current;
  return datablocks(file, "SC").find((scene) => !isLinked(scene)) ?? null;
}

function activeViewLayer(file: BlendFile, scene: BlendStruct): BlendStruct | null {
  const layers = scene.list("view_layers");
  const global = datablocks(file, "GLOB")[0];
  const current = global?.pointer("cur_view_layer") ?? 0n;
  return layers.find((layer) => layer.offset === scene.resolve(current)?.offset) ?? layers[0] ?? null;
}

/** Objects the view layer hides with the eye, by struct offset in the file. */
function eyeHiddenObjects(viewLayer: BlendStruct | null): Set<number> {
  const hidden = new Set<number>();
  for (const base of viewLayer?.list("object_bases") ?? []) {
    const object = base.deref("object");
    if (object && (base.number("flag") & BASE_HIDDEN) !== 0) hidden.add(object.offset);
  }
  return hidden;
}

/** The collection an object instances, such as one linked in from an asset library, or null. */
export function instancedCollection(object: BlendStruct): BlendStruct | null {
  return (object.number("transflag") & OBJECT_INSTANCES_COLLECTION) !== 0 ? object.deref("dup_group") : null;
}

/** Modifiers that can give a mesh with no vertices some, such as an Array's caps or a Boolean's union. */
const MAKES_MESH: ReadonlySet<number> = new Set([
  ModifierType.array,
  ModifierType.boolean,
  ModifierType.ocean,
  ModifierType.meshSequenceCache,
  ModifierType.fluid,
  ModifierType.volumeToMesh,
]);

/** Modifiers that can give a mesh with vertices and no faces some faces. */
const MAKES_FACES: ReadonlySet<number> = new Set([ModifierType.screw, ModifierType.skin]);

/**
 * Geometry Nodes whose output Blender draws instead of an instancer's children: the nodes of Blender 4.2 to 5.2 that
 * make instances from geometry without any, and Curves to Grease Pencil. That is the one node that makes grease
 * pencil, which Blender also draws instead of the children, and whose layers other nodes output as instances.
 */
const INSTANCING_NODES: ReadonlySet<string> = new Set([
  "GeometryNodeCollectionInfo",
  "GeometryNodeGeometryToInstance",
  "GeometryNodeImportOBJ",
  "GeometryNodeInstanceOnPoints",
  "GeometryNodeObjectInfo",
  "GeometryNodeSplitToInstances",
  "GeometryNodeStringToCurves",
  "GeometryNodeCurvesToGreasePencil",
]);

/** Instancing nodes whose instances, once realized, hold the geometry the node reads, or the meshes of an OBJ file. */
const REALIZED_TO_INPUTS: ReadonlySet<string> = new Set([
  "GeometryNodeGeometryToInstance",
  "GeometryNodeImportOBJ",
  "GeometryNodeInstanceOnPoints",
  "GeometryNodeSplitToInstances",
]);

/** Nodes that output what the modifier baked, which may hold instances that no node makes any longer. */
const BAKING_NODES: ReadonlySet<string> = new Set(["GeometryNodeBake", "GeometryNodeSimulationOutput"]);

/** Socket types whose links can carry geometry, which bundles and closures can hold. */
const CARRIES_GEOMETRY: ReadonlySet<number> = new Set([SocketType.geometry, SocketType.bundle, SocketType.closure]);

/** A node's type, or none for a muted node, which only passes its inputs on. */
function activeType(node: BlendStruct): string {
  return isMuted(node) ? "" : nodeType(node);
}

/** Whether a Realize Instances node realizes every instance at every level. */
function realizesAll(graph: ShaderGraph, node: BlendStruct): boolean {
  return ["Selection", "Realize All"].every((name) => {
    const socket = inputSocket(node, name);
    return socket === null || (!linkedOutput(graph, socket) && socketValue(socket)[0] === 1);
  });
}

/** Whether the modifier holds baked data packed into the file, which Blender outputs in place of what it baked. */
function holdsPackedBake(modifier: BlendStruct): boolean {
  return modifier.derefAll("bakes").some((bake) => bake.pointer("packed") !== 0n);
}

const outputsInstances = new WeakMap<BlendFile, Map<string, boolean>>();

/**
 * Whether a node group may output instances or grease pencil, through the nodes that feed its output. Below a Realize
 * Instances node that realizes them all, an instancing node counts as the geometry its instances hold: what it reads,
 * or an OBJ file's meshes. A group from another file may output them.
 */
function mayOutputInstances(
  group: BlendStruct | null,
  realized: boolean,
  baked: boolean,
  walking = new Set<string>(),
): boolean {
  if (!group) return false;
  if (isLinked(group)) return true;
  const key = `${group.offset} ${realized} ${baked}`;
  let known = outputsInstances.get(group.file);
  if (!known) {
    known = new Map();
    outputsInstances.set(group.file, known);
  }
  const found = known.get(key);
  if (found !== undefined) return found;
  if (walking.has(key)) return false;
  walking.add(key);
  const result = reachesInstances(group, realized, baked, walking);
  known.set(key, result);
  return result;
}

function reachesInstances(group: BlendStruct, realized: boolean, baked: boolean, walking: Set<string>): boolean {
  const graph = graphOf(group);
  const output = groupOutput(graph.nodes);
  if (!output) return false;
  const reached = new Set<string>();
  const pending: [BlendStruct, boolean][] = [[output, realized]];
  for (let next = pending.pop(); next; next = pending.pop()) {
    const [node, under] = next;
    const type = activeType(node);
    if (INSTANCING_NODES.has(type) && !(under && REALIZED_TO_INPUTS.has(type))) return true;
    if (baked && BAKING_NODES.has(type)) return true;
    if (type === "GeometryNodeGroup" && mayOutputInstances(node.deref("id"), under, baked, walking)) return true;
    const realizing = under || (type === "GeometryNodeRealizeInstances" && realizesAll(graph, node));
    for (const source of feedingOutputs(graph, node)) {
      const key = `${source.node.offset} ${realizing}`;
      if (!CARRIES_GEOMETRY.has(socketType(source.socket)) || reached.has(key)) continue;
      reached.add(key);
      pending.push([source.node, realizing]);
    }
  }
  return false;
}

/**
 * Where a mesh object places a copy of each of its children, as Blender's instancing on vertices or faces does. A mesh
 * without such elements places none, unless a modifier may add them. Geometry Nodes may add them too, or output
 * instances or grease pencil that Blender draws instead of the children, so an object whose nodes may do that is left
 * out.
 */
export function childInstancing(object: BlendStruct): "vertex" | "face" | null {
  const mesh = object.number("type") === ObjectType.mesh ? object.deref("data") : null;
  if (!mesh) return null;
  const modifiers = viewportModifiers(object).filter((modifier) => !isSmoothByAngle(modifier));
  const groups = modifiers.flatMap((modifier) => {
    const group = modifierType(modifier) === ModifierType.nodes ? modifier.deref("node_group") : null;
    return group ? [{ group, baked: holdsPackedBake(modifier) }] : [];
  });
  if (groups.some(({ group, baked }) => mayOutputInstances(group, false, baked))) return null;
  const types = modifiers.map(modifierType);
  const flag = object.number("transflag");
  const hasVertices = mesh.number("totvert") > 0;
  const makesMesh = groups.length > 0 || types.some((type) => MAKES_MESH.has(type));
  const makesFaces = hasVertices && (groups.length > 0 || types.some((type) => MAKES_FACES.has(type)));
  if ((flag & OBJECT_INSTANCES_VERTICES) !== 0 && (hasVertices || makesMesh)) return "vertex";
  if ((flag & OBJECT_INSTANCES_FACES) !== 0 && (mesh.number("totpoly") > 0 || makesMesh || makesFaces)) return "face";
  return null;
}

/** Whether Blender hides the object in viewports to draw only the instances or particles it makes. */
function hidesInstancer(object: BlendStruct): boolean {
  const instances = (object.number("transflag") & OBJECT_INSTANCES) !== 0 || object.list("particlesystem").length > 0;
  const shown = object.number("duplicator_visibility_flag") & INSTANCER_SHOWN_IN_VIEWPORT;
  return instances && object.has("duplicator_visibility_flag") && shown === 0;
}

function usesLinkedData(object: BlendStruct): boolean {
  const type = object.number("type");
  if (type !== ObjectType.mesh && type !== ObjectType.armature) return false;
  const data = object.deref("data");
  return data !== null && isLinked(data);
}

function describe(struct: BlendStruct, shown: boolean, hidden: boolean): SceneObject {
  const data = struct.deref("data");
  return {
    struct,
    name: idName(struct),
    type: struct.number("type"),
    data: data && !isLinked(data) ? data : null,
    parent: struct.deref("parent"),
    parentType: struct.number("partype") & PARENT_TYPE_MASK,
    parentBone: struct.string("parsubstr"),
    shown,
    hidden,
    instancerHidden: shown && hidesInstancer(struct),
  };
}

export interface ArmatureDeform {
  target: BlendStruct;
  flags: number;
  /** The vertex group that limits how much the armature moves each vertex, or empty for none. */
  maskGroup: string;
}

/**
 * The armatures that deform an object through Armature modifiers on in viewports or an armature-deform parent. A
 * linked target, whose type this file does not hold, counts as one.
 */
export function deformingArmatures(object: BlendStruct): ArmatureDeform[] {
  const result: ArmatureDeform[] = [];
  for (const modifier of viewportModifiers(object)) {
    if (modifierType(modifier) !== ModifierType.armature) continue;
    const target = modifier.deref("object");
    const armature = target && (isLinked(target) || target.number("type") === ObjectType.armature);
    if (target && armature) {
      result.push({ target, flags: modifier.number("deformflag"), maskGroup: modifier.string("defgrp_name") });
    }
  }
  const parent = object.deref("parent");
  if (
    parent?.number("type") === ObjectType.armature &&
    (object.number("partype") & PARENT_TYPE_MASK) === ParentType.armatureDeform
  ) {
    const flags = parent.deref("data")?.number("deformflag") ?? ARMATURE_DEFORM_VERTEX_GROUPS;
    result.push({ target: parent, flags, maskGroup: "" });
  }
  return result;
}

/**
 * The objects of the file's active scene, in the order its collections list them, with every object's parent before
 * it. Collections the active view layer excludes or that are disabled in viewports are left out with their children,
 * as are objects disabled in viewports. Objects the shown ones need come along unshown. Objects hidden with the eye,
 * a per-view-layer state that exporters keep, stay in and are marked hidden.
 */
export function collectSceneObjects(file: BlendFile): SceneContents {
  const scene = activeScene(file);
  if (!scene) return { scene: null, objects: [], linkedObjects: [], linkedCollections: [] };
  const viewLayer = activeViewLayer(file, scene);
  const hiddenBases = eyeHiddenObjects(viewLayer);
  const ordered: BlendStruct[] = [];
  const shown = new Set<number>();
  const unhiddenByCollection = new Set<number>();
  const linked = new Set<string>();
  const linkedCollections = new Set<string>();

  /** Walks one place a collection has in the tree, with the view layer's layer collection for that place. */
  const visit = (
    collection: BlendStruct,
    layerCollection: BlendStruct | null,
    parentHidden: boolean,
    ancestors: ReadonlySet<number>,
  ) => {
    const flag = layerCollection?.number("flag") ?? 0;
    if (
      ancestors.has(collection.offset) ||
      (flag & LAYER_COLLECTION_EXCLUDE) !== 0 ||
      (collection.number("flag") & COLLECTION_HIDE_VIEWPORT) !== 0
    ) {
      return;
    }
    const collectionHidden = parentHidden || (flag & LAYER_COLLECTION_HIDE) !== 0;
    for (const entry of collection.list("gobject")) {
      const object = entry.deref("ob");
      if (!object) continue;
      if (isLinked(object)) {
        linked.add(idName(object));
        continue;
      }
      if ((object.number("restrictflag") & OBJECT_HIDE_VIEWPORT) !== 0) continue;
      if (!collectionHidden) unhiddenByCollection.add(object.offset);
      if (shown.has(object.offset)) continue;
      shown.add(object.offset);
      ordered.push(object);
      if (usesLinkedData(object)) linked.add(idName(object));
    }
    const childLayers = layerCollection?.list("layer_collections") ?? [];
    const path = new Set(ancestors).add(collection.offset);
    for (const child of collection.list("children")) {
      const nested = child.deref("collection");
      if (!nested) continue;
      const nestedLayer = childLayers.find((candidate) => candidate.deref("collection")?.offset === nested.offset);
      if (isLinked(nested)) {
        const excluded = ((nestedLayer?.number("flag") ?? 0) & LAYER_COLLECTION_EXCLUDE) !== 0;
        if (!excluded) linkedCollections.add(idName(nested));
        continue;
      }
      visit(nested, nestedLayer ?? null, collectionHidden, path);
    }
  };
  const master = scene.deref("master_collection");
  if (master) visit(master, viewLayer?.list("layer_collections")[0] ?? null, false, new Set());

  const needed = new Map<number, BlendStruct>();
  const need = (object: BlendStruct | null) => {
    if (!object || shown.has(object.offset) || needed.has(object.offset)) return;
    if (isLinked(object)) {
      linked.add(idName(object));
      return;
    }
    if (usesLinkedData(object)) linked.add(idName(object));
    needed.set(object.offset, object);
    need(object.deref("parent"));
    for (const { target } of deformingArmatures(object)) need(target);
  };
  for (const object of ordered) {
    need(object.deref("parent"));
    for (const { target } of deformingArmatures(object)) need(target);
  }

  const hidden = (object: BlendStruct) => hiddenBases.has(object.offset) || !unhiddenByCollection.has(object.offset);
  const all = [
    ...ordered.map((object) => describe(object, true, hidden(object))),
    ...[...needed.values()].map((object) => describe(object, false, false)),
  ];
  return { scene, objects: parentsFirst(all), linkedObjects: [...linked], linkedCollections: [...linkedCollections] };
}

/** Orders objects so each comes after its parent, keeping the given order among roots and among siblings. */
function parentsFirst(objects: readonly SceneObject[]): SceneObject[] {
  const byOffset = new Map(objects.map((object) => [object.struct.offset, object]));
  const children = new Map<number, SceneObject[]>();
  const roots: SceneObject[] = [];
  for (const object of objects) {
    const parent = object.parent ? byOffset.get(object.parent.offset) : undefined;
    if (parent && parent !== object) {
      const list = children.get(parent.struct.offset) ?? [];
      list.push(object);
      children.set(parent.struct.offset, list);
    } else {
      roots.push(object);
    }
  }
  const result: SceneObject[] = [];
  const placed = new Set<number>();
  const place = (object: SceneObject) => {
    if (placed.has(object.struct.offset)) return;
    placed.add(object.struct.offset);
    result.push(object);
    for (const child of children.get(object.struct.offset) ?? []) place(child);
  };
  for (const root of roots) place(root);
  for (const object of objects) place(object);
  return result;
}
