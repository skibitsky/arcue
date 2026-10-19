import type { BlendFile, BlendStruct } from "../blend/file.js";
import { datablocks, idName, isInPackedLibrary, isLinked } from "../blend/ids.js";
import { ownedLists } from "../blend/lists.js";
import { ModifierType, modifierType, viewportModifiers } from "./modifiers.js";
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
} from "./shader-graph.js";
import { isSmoothByAngle } from "./smooth-by-angle.js";

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

/** Object types whose geometry the reader does not show; their objects come along as empty nodes. */
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

/** The flags of an Armature modifier's and an armature's `deformflag`. */
export const ArmatureDeformFlag = {
  vertexGroups: 1 << 0,
  envelope: 1 << 1,
  preserveVolume: 1 << 2,
  invertMask: 1 << 4,
} as const;

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
const VIEW_LAYER_RENDER = 1 << 0;

/** How an object follows its parent, one of `ParentType`. */
export function parentTypeOf(object: BlendStruct): number {
  return object.number("partype") & PARENT_TYPE_MASK;
}

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

/** Kinds of data a file links from other .blend files, in the order a warning lists them. */
export const LINKED_KINDS = ["scenes", "collections", "objects", "materials", "actions", "images"] as const;

export type LinkedKind = (typeof LINKED_KINDS)[number];

/** Data linked from another .blend file, which this file does not hold, by the name of what needs it. */
export interface LinkedName {
  kind: LinkedKind;
  name: string;
  /** Whether that file is packed into this one, which the reader does not read. */
  packed: boolean;
}

/** `name` for data linked from `datablock`'s file. */
export function linkedName(kind: LinkedKind, name: string, datablock: BlendStruct): LinkedName {
  return { kind, name, packed: isInPackedLibrary(datablock) };
}

export interface SceneContents {
  scene: BlendStruct | null;
  /** Shown objects, and the objects they need: their parents and the armatures that deform them. */
  objects: SceneObject[];
  /**
   * What the scene needs from other files: background set scenes, collections linked straight into its tree, and
   * objects that are linked or whose mesh or armature data is.
   */
  linked: LinkedName[];
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

/**
 * Whether the modifier holds baked data packed into the file, which Blender outputs in place of what it baked. Only
 * the bakes it counts are read, each where its block's struct lays out the pointer to the packed data.
 */
function holdsPackedBake(modifier: BlendStruct): boolean {
  const block = modifier.target("bakes");
  const type = block?.struct;
  const packed = type?.field("packed");
  if (!block || !type || !packed || packed.pointerDepth === 0) return false;
  const count = Math.min(Math.max(modifier.number("bakes_num"), 0), block.count, Math.floor(block.size / type.size));
  for (let bake = 0; bake < count; bake++) {
    if (modifier.file.pointedBlock(block.offset + bake * type.size + packed.offset, block.owner) >= 0) return true;
  }
  return false;
}

const outputsInstances = new WeakMap<BlendFile, Map<string, boolean>>();

/** The search of one node group for nodes that output instances, from its Group Output up. */
interface GroupSearch {
  key: string;
  graph: ShaderGraph;
  /** Nodes to look at, each with whether a Realize Instances node that realizes them all is below it. */
  pending: [BlendStruct, boolean][];
  reached: Set<string>;
}

/**
 * Whether a node group may output instances or grease pencil, through the nodes that feed its output. Below a Realize
 * Instances node that realizes them all, an instancing node counts as the geometry its instances hold: what it reads,
 * or an OBJ file's meshes. A group from another file may output them. Groups that Group nodes run are searched on a
 * stack of their own, however deep they nest, and a group that runs itself adds nothing.
 */
function mayOutputInstances(group: BlendStruct | null, realized: boolean, baked: boolean): boolean {
  if (!group) return false;
  let known = outputsInstances.get(group.file);
  if (!known) {
    known = new Map();
    outputsInstances.set(group.file, known);
  }
  const answers = known;
  const searching = new Set<string>();
  const searches: GroupSearch[] = [];
  const answer = (group: BlendStruct | null, realized: boolean): boolean | null => {
    if (!group) return false;
    if (isLinked(group)) return true;
    const key = `${group.offset} ${realized} ${baked}`;
    const found = answers.get(key);
    if (found !== undefined) return found;
    if (searching.has(key)) return false;
    searching.add(key);
    const graph = graphOf(group);
    const output = groupOutput(graph.nodes);
    searches.push({ key, graph, pending: output ? [[output, realized]] : [], reached: new Set() });
    return null;
  };
  const first = answer(group, realized);
  if (first !== null) return first;
  let last = false;
  const finish = (search: GroupSearch, result: boolean) => {
    answers.set(search.key, result);
    searches.pop();
    last = result;
  };
  for (let search = searches.at(-1); search; search = searches.at(-1)) {
    const next = search.pending.pop();
    if (!next) {
      finish(search, false);
      continue;
    }
    const [node, under] = next;
    const type = activeType(node);
    let found = INSTANCING_NODES.has(type) && !(under && REALIZED_TO_INPUTS.has(type));
    found ||= baked && BAKING_NODES.has(type);
    if (!found && type === "GeometryNodeGroup") {
      const inner = answer(node.deref("id"), under);
      if (inner === null) {
        search.pending.push(next);
        continue;
      }
      found = inner;
    }
    if (found) {
      finish(search, true);
      continue;
    }
    const realizing = under || (type === "GeometryNodeRealizeInstances" && realizesAll(search.graph, node));
    for (const source of feedingOutputs(search.graph, node)) {
      const reached = `${source.node.offset} ${realizing}`;
      if (!CARRIES_GEOMETRY.has(socketType(source.socket)) || search.reached.has(reached)) continue;
      search.reached.add(reached);
      search.pending.push([source.node, realizing]);
    }
  }
  return last;
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

/** Whether the object has a particle system, read from the first item of its list only. */
function hasParticles(object: BlendStruct): boolean {
  const list = object.struct("particlesystem");
  const first = list && list.pointer("first") !== 0n ? list.deref("first") : null;
  return first !== null && first.type.size >= object.file.pointerSize;
}

/** Whether Blender hides the object in viewports to draw only the instances or particles it makes. */
function hidesInstancer(object: BlendStruct): boolean {
  const instances = (object.number("transflag") & OBJECT_INSTANCES) !== 0 || hasParticles(object);
  const shown = object.number("duplicator_visibility_flag") & INSTANCER_SHOWN_IN_VIEWPORT;
  return instances && object.has("duplicator_visibility_flag") && shown === 0;
}

/** The object's mesh or armature data when it is linked from another file, or null. */
function linkedData(object: BlendStruct): BlendStruct | null {
  const type = object.number("type");
  if (type !== ObjectType.mesh && type !== ObjectType.armature) return null;
  const data = object.deref("data");
  return data !== null && isLinked(data) ? data : null;
}

function describe(struct: BlendStruct, shown: boolean, hidden: boolean): SceneObject {
  const data = struct.deref("data");
  return {
    struct,
    name: idName(struct),
    type: struct.number("type"),
    data: data && !isLinked(data) ? data : null,
    parent: struct.deref("parent"),
    parentType: parentTypeOf(struct),
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
  if (parent?.number("type") === ObjectType.armature && parentTypeOf(object) === ParentType.armatureDeform) {
    const flags = parent.deref("data")?.number("deformflag") ?? ArmatureDeformFlag.vertexGroups;
    result.push({ target: parent, flags, maskGroup: "" });
  }
  return result;
}

/** The view layer Blender draws a background set with: the first that renders, or else the first. */
function setViewLayer(scene: BlendStruct): BlendStruct | null {
  const layers = scene.list("view_layers");
  return layers.find((layer) => (layer.number("flag") & VIEW_LAYER_RENDER) !== 0) ?? layers[0] ?? null;
}

/** One place a collection has in a scene's tree, with the view layer's layer collection for that place. */
interface Place {
  collection: BlendStruct;
  layer: BlendStruct | null;
  parentHidden: boolean;
}

/**
 * The objects of the file's active scene and of its background sets, which Blender draws with it, in the order their
 * collections list them, with every object's parent before it. Collections the view layer excludes or that are
 * disabled in viewports are left out with their children, as are objects disabled in viewports. Objects the shown ones
 * need come along unshown. Objects hidden with the eye, a per-view-layer state that exporters keep, stay in and are
 * marked hidden.
 */
export function collectSceneObjects(file: BlendFile): SceneContents {
  const scene = activeScene(file);
  if (!scene) return { scene: null, objects: [], linked: [] };
  const ordered: BlendStruct[] = [];
  const shown = new Set<number>();
  const unhidden = new Set<number>();
  const linked = new Map<string, LinkedName>();
  const addLinked = (kind: LinkedKind, name: string, datablock: BlendStruct) => {
    const entry = linkedName(kind, name, datablock);
    linked.set(`${entry.kind} ${entry.packed} ${entry.name}`, entry);
  };

  const childEntries = ownedLists("children");
  const objectEntries = ownedLists("gobject");
  const layerCollections = ownedLists("layer_collections");
  const childCollections = new Map<number, BlendStruct[]>();
  const childrenOf = (collection: BlendStruct) => {
    let children = childCollections.get(collection.offset);
    if (!children) {
      children = childEntries(collection).flatMap((child) => child.deref("collection") ?? []);
      childCollections.set(collection.offset, children);
    }
    return children;
  };

  /**
   * Walks a scene's collection tree once per place a collection has in it, which a layer collection of the view layer
   * stands for. A place queued before adds nothing, and nor do a collection's objects listed before as hidden alike.
   */
  const walk = (master: BlendStruct, viewLayer: BlendStruct | null) => {
    const eyeHidden = eyeHiddenObjects(viewLayer);
    const queued = new Set<string>();
    const listed = new Set<string>();
    const pending: Place[] = [];
    const queue = (places: readonly Place[]) => {
      const unqueued = places.filter(({ collection, layer, parentHidden }) => {
        const key = `${collection.offset} ${layer?.offset ?? -1} ${parentHidden}`;
        if (queued.has(key)) return false;
        queued.add(key);
        return true;
      });
      pushReversed(pending, unqueued);
    };
    const masterLayer = viewLayer ? (layerCollections(viewLayer)[0] ?? null) : null;
    queue([{ collection: master, layer: masterLayer, parentHidden: false }]);
    for (let place = pending.pop(); place; place = pending.pop()) {
      const { collection, layer, parentHidden } = place;
      const flag = layer?.number("flag") ?? 0;
      if ((flag & LAYER_COLLECTION_EXCLUDE) !== 0 || (collection.number("flag") & COLLECTION_HIDE_VIEWPORT) !== 0) {
        continue;
      }
      const collectionHidden = parentHidden || (flag & LAYER_COLLECTION_HIDE) !== 0;
      const objects = `${collection.offset} ${collectionHidden}`;
      for (const entry of listed.has(objects) ? [] : objectEntries(collection)) {
        const object = entry.deref("ob");
        if (!object) continue;
        if (isLinked(object)) {
          addLinked("objects", idName(object), object);
          continue;
        }
        if ((object.number("restrictflag") & OBJECT_HIDE_VIEWPORT) !== 0) continue;
        if (!collectionHidden && !eyeHidden.has(object.offset)) unhidden.add(object.offset);
        if (shown.has(object.offset)) continue;
        shown.add(object.offset);
        ordered.push(object);
        const data = linkedData(object);
        if (data) addLinked("objects", idName(object), data);
      }
      listed.add(objects);
      const childLayers = new Map<number, BlendStruct>();
      for (const child of layer ? layerCollections(layer) : []) {
        const offset = child.deref("collection")?.offset;
        if (offset !== undefined && !childLayers.has(offset)) childLayers.set(offset, child);
      }
      const children: Place[] = [];
      for (const nested of childrenOf(collection)) {
        const nestedLayer = childLayers.get(nested.offset) ?? null;
        if (isLinked(nested)) {
          const excluded = ((nestedLayer?.number("flag") ?? 0) & LAYER_COLLECTION_EXCLUDE) !== 0;
          if (!excluded) addLinked("collections", idName(nested), nested);
          continue;
        }
        children.push({ collection: nested, layer: nestedLayer, parentHidden: collectionHidden });
      }
      queue(children);
    }
  };
  const master = scene.deref("master_collection");
  if (master) walk(master, activeViewLayer(file, scene));
  const sets = new Set<number>([scene.offset]);
  for (let set = scene.deref("set"); set && !sets.has(set.offset); set = set.deref("set")) {
    sets.add(set.offset);
    if (isLinked(set)) {
      addLinked("scenes", idName(set), set);
      break;
    }
    const setMaster = set.deref("master_collection");
    if (setMaster) walk(setMaster, setViewLayer(set));
  }

  const needed = new Map<number, BlendStruct>();
  const need = (first: BlendStruct | null) => {
    const pending = new ObjectStack();
    const queue = (objects: readonly (BlendStruct | null)[]) => {
      for (let index = objects.length - 1; index >= 0; index--) {
        const object = objects[index];
        if (object && !shown.has(object.offset) && !needed.has(object.offset)) pending.push(object);
      }
    };
    queue([first]);
    for (let object = pending.pop(); object; object = pending.pop()) {
      if (isLinked(object)) {
        addLinked("objects", idName(object), object);
        continue;
      }
      const data = linkedData(object);
      if (data) addLinked("objects", idName(object), data);
      needed.set(object.offset, object);
      queue([object.deref("parent"), ...deformingArmatures(object).map(({ target }) => target)]);
    }
  };
  for (const object of ordered) {
    need(object.deref("parent"));
    for (const { target } of deformingArmatures(object)) need(target);
  }

  const all = [
    ...ordered.map((object) => describe(object, true, !unhidden.has(object.offset))),
    ...[...needed.values()].map((object) => describe(object, false, false)),
  ];
  return { scene, objects: parentsFirst(all), linked: [...linked.values()] };
}

interface StackEntry {
  object: BlendStruct;
  live: boolean;
}

/**
 * A stack of objects that holds each object once: pushing an object it already holds moves it to the top. It pops
 * objects in the order a stack holding every push would first pop them, while holding no more entries than about
 * twice the objects it holds.
 */
class ObjectStack {
  #entries: StackEntry[] = [];
  readonly #held = new Map<number, StackEntry>();

  push(object: BlendStruct): void {
    const held = this.#held.get(object.offset);
    if (held) held.live = false;
    const entry = { object, live: true };
    this.#entries.push(entry);
    this.#held.set(object.offset, entry);
    if (this.#entries.length > 2 * this.#held.size + 16) this.#entries = this.#entries.filter((kept) => kept.live);
  }

  pop(): BlendStruct | undefined {
    for (let entry = this.#entries.pop(); entry; entry = this.#entries.pop()) {
      if (!entry.live) continue;
      this.#held.delete(entry.object.offset);
      return entry.object;
    }
    return undefined;
  }
}

/** Pushes items onto a stack last first, so that it pops them in order, without spreading them into arguments. */
function pushReversed<T>(stack: T[], items: readonly T[]): void {
  for (let index = items.length - 1; index >= 0; index--) {
    const item = items[index];
    if (item !== undefined) stack.push(item);
  }
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
  const place = (first: SceneObject) => {
    const pending = [first];
    for (let object = pending.pop(); object; object = pending.pop()) {
      if (placed.has(object.struct.offset)) continue;
      placed.add(object.struct.offset);
      result.push(object);
      pushReversed(pending, children.get(object.struct.offset) ?? []);
    }
  };
  for (const root of roots) place(root);
  for (const object of objects) place(object);
  return result;
}
