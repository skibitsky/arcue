import type { ImportWarningCode, ImportWarningSubject, Mesh, MorphTarget, NodeKind, Skeleton } from "@arcue/scene";
import { MAX_NODE_DEPTH, nestsTooDeep } from "@arcue/scene";
import type { Action } from "../anim/actions";
import { readActions, usedActions } from "../anim/actions";
import type { StartPose, StartPoses } from "../anim/opening";
import { startFrame, startPoses } from "../anim/opening";
import type { SceneTimeline } from "../anim/timeline";
import { sceneTimeline } from "../anim/timeline";
import { BlendLimitError } from "../blend/errors";
import type { BlendBlock, BlendFile, BlendStruct } from "../blend/file";
import { idName, isLinked } from "../blend/ids";
import { ownedList } from "../blend/lists";
import type { Mat4 } from "../math";
import {
  identity,
  invert,
  mat4From,
  multiply,
  multiplyAll,
  SHEAR_TOLERANCE,
  shearOf,
  transformPoint,
  translation,
} from "../math";
import type { Bone } from "./armature";
import { ArmatureReadError, readBones } from "./armature";
import { envelopeUse } from "./envelopes";
import type { GrayCheck, GrayRead, MaterialDraft } from "./materials";
import { defaultMaterial, imageUses, readMaterial } from "./materials";
import type { BuildOptions, BuiltMesh, SkinBone } from "./mesh-build";
import { buildMesh } from "./mesh-build";
import type { MeshData } from "./mesh-data";
import { defaultColorAttribute, MAX_UV_SETS, MeshReadError, readMeshData } from "./mesh-data";
import { changesPreview, ModifierType, modifierName, modifierType, viewportModifiers } from "./modifiers";
import type { LinkedName, SceneContents, SceneObject } from "./objects";
import {
  ArmatureDeformFlag,
  childInstancing,
  collectSceneObjects,
  deformingArmatures,
  instancedCollection,
  LINKED_KINDS,
  linkedName,
  ObjectType,
  ParentType,
  UNSHOWN_GEOMETRY,
} from "./objects";
import type { ParentVertices, ShownVertices } from "./parents";
import {
  headTailFactor,
  isVertexParented,
  parentPoints,
  readsNoParentPoints,
  relativeParent,
  vertexParentPart,
  WorldMatrices,
} from "./parents";
import type { PinnedShape, ShapeSource } from "./shape-keys";
import { lockedShapeKey, pinnedShape, shapedVertex, shapeTargets, shapeWeights } from "./shape-keys";
import type { SmoothByAngle } from "./smooth-by-angle";
import { smoothByAngle } from "./smooth-by-angle";
import type { ObjectValues, TransformValues } from "./transforms";
import { channelValues, objectBasis, objectValues, restChannel } from "./transforms";

export interface BlendWarning {
  code: ImportWarningCode;
  subject: ImportWarningSubject;
  message: string;
  detail?: string;
}

export interface NodeDraft {
  name: string;
  parent: number;
  kind: NodeKind;
  /** The rest transform relative to the parent, in Blender's space. */
  rest: Mat4;
  mesh: number | null;
}

/** An object's node and what animation needs to move it. */
export interface ObjectRecord {
  object: SceneObject;
  node: number;
  /** The matrix between the parent node and the object's parent inverse. */
  parentPart: Mat4;
  parentInverse: Mat4;
  values: ObjectValues;
  armature: ArmatureRecord | null;
}

export interface ArmatureRecord {
  bones: Bone[];
  /** Node index of each bone. */
  nodes: number[];
  /** Each bone's pose channel at the scene's start frame; an action changes only the values it keys. */
  pose: TransformValues[];
}

export interface MeshRecord {
  node: number;
  object: SceneObject;
  /** Names of the mesh's morph targets, in order. */
  morphKeys: string[];
  /** Default weight of each morph target. */
  morphDefaults: number[];
  /** The range Blender clamps each morph target's weight to. */
  morphRanges: (readonly [number, number])[];
  /** Whether the object pins its active shape key with Shape Key Lock, so key values and their animation change nothing. */
  shapeKeyLock: boolean;
}

/** The UV maps of a mesh that uses a material, by name, with the one rendering uses by default. */
export interface MaterialUvMaps {
  /** The mesh's object, for people. */
  mesh: string;
  names: string[];
  defaultIndex: number;
}

/** The color attributes of a mesh that uses a material. */
interface MeshColors {
  /** The attribute the mesh's colors hold, or null for none. */
  read: string | null;
  names: string[];
  /** The attribute a Color Attribute node without a name reads, or "" for none. */
  defaultName: string;
}

/**
 * How a material shows the color attribute an input reads on one mesh: from the mesh's colors, or black, as Blender
 * shows an attribute the mesh does not have. Null where the input reads none, or one the preview leaves out.
 */
export type AttributeShown = "colors" | "black" | null;

export interface MaterialColors {
  baseColor: AttributeShown;
  emissive: AttributeShown;
}

export interface BuiltScene {
  nodes: NodeDraft[];
  meshes: Mesh[];
  skeletons: Skeleton[];
  materials: MaterialDraft[];
  /** For each material, the UV maps of the meshes it is drawn on, which all resolve its textures' UV maps alike. */
  materialUvs: MaterialUvMaps[];
  /** For each material, how it shows the color attributes it reads on the meshes it is drawn on. */
  materialColors: MaterialColors[];
  objects: ObjectRecord[];
  meshRecords: MeshRecord[];
  /** Takes Blender's space into the scene's: −90° about X and the unit scale. */
  conversion: Mat4;
  fps: number;
  unitScale: number;
  timeline: SceneTimeline;
  warnings: BlendWarning[];
}

type Warn = (code: ImportWarningCode, name: string, message: string, detail?: string) => void;

const CONSTRAINT_DISABLE = 1 << 2;
const CONSTRAINT_OFF = 1 << 9;

function sceneSettings(scene: BlendStruct | null): { fps: number; unitScale: number } {
  const render = scene?.struct("r");
  const base = render?.number("frs_sec_base") || 1;
  const fps = (render?.number("frs_sec") ?? 0) / base;
  const unitScale = scene?.struct("unit")?.number("scale_length") ?? 1;
  return {
    fps: Number.isFinite(fps) && fps > 0 ? fps : 24,
    unitScale: Number.isFinite(unitScale) && unitScale > 0 ? unitScale : 1,
  };
}

/** Blender's Z-up axes into the scene's Y-up axes: (x, y, z) becomes (x, z, −y), times the unit scale. */
function conversionMatrix(unitScale: number): Mat4 {
  const s = unitScale;
  return Float64Array.of(s, 0, 0, 0, 0, 0, -s, 0, 0, s, 0, 0, 0, 0, 0, 1);
}

/**
 * The constraints Blender evaluates: on, valid, and with some influence now or an influence among `animated`, the paths
 * that animation plays on the object. `path` is the object's path to the owner's constraints, such as
 * `pose.bones["Arm"].` for a bone or empty for the object itself.
 */
function activeConstraints(owner: BlendStruct, path: string, animated: ReadonlySet<string>): BlendStruct[] {
  return ownedList(owner, "constraints").filter((constraint) => {
    const flag = constraint.number("flag");
    if ((flag & CONSTRAINT_OFF) !== 0 || (flag & CONSTRAINT_DISABLE) !== 0) return false;
    const influence = `${path}constraints["${quoted(constraint.string("name"))}"].influence`;
    return constraint.number("enforce") > 0 || animated.has(influence);
  });
}

/** A name as Blender quotes it inside a property path. */
function quoted(name: string): string {
  return name.replace(/["\\]/g, "\\$&");
}

/**
 * Warnings about the constraints Blender evaluates on each object and its bones, which the preview does not, given the
 * property paths that animation plays on each object.
 */
export function constraintWarnings(
  objects: readonly ObjectRecord[],
  animated: ReadonlyMap<ObjectRecord, ReadonlySet<string>>,
): BlendWarning[] {
  const warnings: BlendWarning[] = [];
  for (const record of objects) {
    const { object } = record;
    const paths = animated.get(record) ?? new Set<string>();
    const subject: ImportWarningSubject = { kind: "node", name: object.name };
    const channels = new Map(
      object.struct
        .deref("pose")
        ?.list("chanbase")
        .map((channel) => [channel.string("name"), channel]),
    );
    const constrained = (record.armature?.bones ?? []).filter((bone) => {
      const channel = channels.get(bone.name);
      return (
        channel !== undefined && activeConstraints(channel, `pose.bones["${quoted(bone.name)}"].`, paths).length > 0
      );
    });
    if (constrained.length > 0) {
      const message = `Bone constraints not evaluated: ${object.name}`;
      const detail = `Bones: ${constrained.map((bone) => bone.name).join(", ")}`;
      warnings.push({ code: "constraint-not-evaluated", subject, message, detail });
    }
    if (activeConstraints(object.struct, "", paths).length > 0) {
      warnings.push({
        code: "constraint-not-evaluated",
        subject,
        message: `Constraints not evaluated: ${object.name}`,
      });
    }
  }
  return warnings;
}

/** Rest world matrices of nodes in Blender's space, each worked out once. */
class NodeWorlds {
  readonly #nodes: readonly NodeDraft[];
  readonly #worlds: Mat4[] = [];

  constructor(nodes: readonly NodeDraft[]) {
    this.#nodes = nodes;
  }

  /** The world matrix of a node whose ancestors, which come before it, keep their rest matrices from now on. */
  of(index: number): Mat4 {
    const chain: number[] = [];
    for (let at = index; at >= 0 && this.#worlds[at] === undefined; ) {
      chain.push(at);
      const parent = this.#nodes[at]?.parent ?? -1;
      at = parent < at ? parent : -1;
    }
    for (const at of chain.reverse()) {
      const node = this.#nodes[at];
      if (!node) continue;
      const parent = node.parent >= 0 && node.parent < at ? this.#worlds[node.parent] : undefined;
      this.#worlds[at] = parent ? multiply(parent, node.rest) : node.rest;
    }
    return this.#worlds[index] ?? identity();
  }
}

function addArmature(
  record: ObjectRecord,
  data: BlendStruct,
  nodes: NodeDraft[],
  warn: Warn,
  startPose: StartPose,
): void {
  const { object, node } = record;
  let bones: Bone[];
  try {
    bones = readBones(data);
  } catch (error) {
    if (!(error instanceof ArmatureReadError)) throw error;
    warn("invalid-data", object.name, `Armature not read: ${object.name}`, error.message);
    return;
  }
  const channels = new Map<string, BlendStruct>();
  for (const channel of object.struct.deref("pose")?.list("chanbase") ?? [])
    channels.set(channel.string("name"), channel);
  const boneNodes: number[] = [];
  const pose = bones.map((bone) => {
    const channel = channels.get(bone.name);
    boneNodes.push(nodes.length);
    nodes.push({
      name: bone.name,
      parent: boneNodes[bone.parent] ?? node,
      kind: "bone",
      rest: bone.offset,
      mesh: null,
    });
    return startPose.channel(bone.name, channel ? channelValues(channel) : restChannel());
  });
  record.armature = { bones, nodes: boneNodes, pose };
  if (bones.some((bone) => bone.deform && bone.segments > 1)) {
    warn("deform-approximated", object.name, `B-Bones bend as straight bones: ${object.name}`);
  }
}

/** Whether Blender draws geometry for the object, which instancing on vertices or faces would copy. */
function drawsGeometry(object: SceneObject): boolean {
  if (object.type === ObjectType.mesh || UNSHOWN_GEOMETRY.has(object.type)) return true;
  return instancedCollection(object.struct) !== null;
}

/** Offsets of the objects that a shown object with geometry descends from. */
function geometryAncestors(objects: readonly SceneObject[]): Set<number> {
  const ancestors = new Set<number>();
  for (const object of objects) {
    if (!object.shown || !drawsGeometry(object)) continue;
    for (let parent = object.parent; parent && !ancestors.has(parent.offset); parent = parent.deref("parent")) {
      ancestors.add(parent.offset);
    }
  }
  return ancestors;
}

/** A node for every object, each armature's bones under it, and an object parented to a bone under that bone. */
function objectNodes(contents: SceneContents, poses: StartPoses, warn: Warn, vertices: ParentVertices) {
  const worlds = new WorldMatrices(vertices);
  const nodes: NodeDraft[] = [];
  const nodeWorlds = new NodeWorlds(nodes);
  const objects: ObjectRecord[] = [];
  const byOffset = new Map<number, ObjectRecord>();
  const ancestors = geometryAncestors(contents.objects);
  for (const object of contents.objects) {
    const parentRecord = object.parent ? byOffset.get(object.parent.offset) : undefined;
    let parentNode = parentRecord?.node ?? -1;
    let parentPart: Mat4 = parentRecord ? identity() : worlds.parentOf(object.struct);
    const parentInverse = mat4From(object.struct.numbers("parentinv"));
    const startPose = poses.of(object.struct);
    const values = startPose.object(objectValues(object.struct));
    const below = multiply(parentInverse, objectBasis(values));
    const parentBones = parentRecord?.armature;
    if (parentBones && object.parentType === ParentType.bone) {
      const index = parentBones.bones.findIndex((bone) => bone.name === object.parentBone);
      const bone = parentBones.bones[index];
      if (bone && relativeParent(bone)) {
        const detail = `It stays with ${parentRecord?.object.name} at rest instead of following bone ${bone.name}`;
        warn("deform-approximated", object.name, `Relative bone parent not followed: ${object.name}`, detail);
      } else if (bone) {
        parentNode = parentBones.nodes[index] ?? parentNode;
        parentPart = translation(0, bone.length * headTailFactor(object.struct), 0);
      }
    }
    if (parentRecord && isVertexParented(object.struct)) {
      ({ node: parentNode, parentPart } = vertexParentPlace(object, parentRecord, below, nodeWorlds, vertices));
    }
    const record: ObjectRecord = { object, node: nodes.length, parentPart, parentInverse, values, armature: null };
    const rest = multiply(parentPart, below);
    nodes.push({ name: object.name, parent: parentNode, kind: "empty", rest, mesh: null });
    if (shearOf(rest) > SHEAR_TOLERANCE) {
      const detail = "Its parent's scale shears it, which the preview drops";
      warn("deform-approximated", object.name, `Shear not shown: ${object.name}`, detail);
    }
    if (object.type === ObjectType.armature && object.data) {
      addArmature(record, object.data, nodes, warn, startPose);
    }
    if (object.shown && UNSHOWN_GEOMETRY.has(object.type)) {
      const kind = UNSHOWN_GEOMETRY.get(object.type);
      warn("object-not-shown", object.name, `Not shown: ${object.name}`, `Only meshes are read; this is ${kind} data`);
    }
    const instanced = object.shown ? instancedCollection(object.struct) : null;
    if (instanced) {
      const detail = `Instances of ${idName(instanced)} are not expanded`;
      warn("object-not-shown", object.name, `Collection instance not shown: ${object.name}`, detail);
    }
    const drawsInstances = object.shown && !object.hidden && ancestors.has(object.struct.offset);
    const instancing = drawsInstances ? childInstancing(object.struct) : null;
    if (instancing) {
      const kind = instancing === "vertex" ? "Vertex" : "Face";
      const detail = `Its children are shown once instead of at each ${instancing}`;
      warn("object-not-shown", object.name, `${kind} instances not shown: ${object.name}`, detail);
    }
    if (object.parent && isVertexParented(object.struct)) {
      vertexParentWarning(object, object.parent, parentNode >= 0 && parentNode === parentRecord?.node, warn);
    }
    objects.push(record);
    byOffset.set(object.struct.offset, record);
  }
  return { nodes, nodeWorlds, objects, byOffset };
}

/**
 * The node a vertex-parented object hangs from, and the matrix between that node and the object's parent inverse: its
 * parent's node, or the scene's root where the parent node's scale would shear it. Blender's vertex parent leaves out
 * the parent's scale, so the object itself has none of that shear. `below` is the object's matrix under its parent
 * inverse.
 */
function vertexParentPlace(
  object: SceneObject,
  parent: ObjectRecord,
  below: Mat4,
  nodeWorlds: NodeWorlds,
  vertices: ParentVertices,
): { node: number; parentPart: Mat4 } {
  const parentWorld = nodeWorlds.of(parent.node);
  const points = parentPoints(object.struct, parent.object.struct, vertices);
  const parentPart = vertexParentPart(object.struct, points, parentWorld);
  const placed = multiply(parentWorld, parentPart);
  const shears = (above: Mat4) => shearOf(multiply(above, below)) > SHEAR_TOLERANCE;
  return shears(parentPart) && !shears(placed) ? { node: -1, parentPart: placed } : { node: parent.node, parentPart };
}

/** What the preview leaves out of a vertex parent, which places the object at its parent's vertices only at rest. */
function vertexParentWarning(object: SceneObject, parent: BlendStruct, underParent: boolean, warn: Warn): void {
  const name = idName(parent);
  let detail: string;
  if (readsNoParentPoints(parent)) {
    const follows = underParent ? "follows it as a whole" : "does not follow it";
    detail = `The points of ${name} are not read, so it is placed by the origin of ${name} and ${follows}`;
  } else {
    detail = underParent
      ? `It keeps its rest offset from ${name} instead of following its vertices`
      : `It stays where it is at rest instead of following the vertices of ${name}`;
  }
  warn("deform-approximated", object.name, `Vertex parent not followed: ${object.name}`, detail);
}

/**
 * The scene's materials, read once each, with the default material for empty slots. A material gets a copy for each
 * mesh whose UV maps put its textures on other UV sets, since Blender finds a texture's UV map by name in each mesh,
 * and for each mesh that shows the color attributes it reads differently.
 */
class MaterialTable {
  readonly drafts: MaterialDraft[] = [];
  readonly uvMaps: MaterialUvMaps[] = [];
  readonly colors: MaterialColors[] = [];
  /** Materials linked from other files, which show as the default material. */
  readonly linked: LinkedName[] = [];
  readonly #read = new Map<number, MaterialDraft>();
  readonly #index = new Map<string, number>();
  readonly #version: number;
  readonly #isGray: GrayCheck;
  readonly #frame: number;

  constructor(version: number, isGray: GrayCheck, frame: number) {
    this.#version = version;
    this.#isGray = isGray;
    this.#frame = frame;
  }

  #draftOf(material: BlendStruct | null): MaterialDraft | null {
    if (!material || isLinked(material)) return null;
    let draft = this.#read.get(material.offset);
    if (!draft) {
      draft = readMaterial(material, this.#version, this.#isGray, this.#frame);
      this.#read.set(material.offset, draft);
    }
    return draft;
  }

  /** The color attributes the material's inputs read, as its Color Attribute nodes name them. */
  attributesOf(material: BlendStruct | null): string[] {
    const draft = this.#draftOf(material);
    return [draft?.baseColorAttribute ?? null, draft?.emissiveAttribute ?? null].filter((name) => name !== null);
  }

  indexOf(material: BlendStruct | null, uvMaps: MaterialUvMaps, meshColors: MeshColors): number {
    if (material && isLinked(material)) this.linked.push(linkedName("materials", idName(material), material));
    const draft = this.#draftOf(material);
    const note = (text: string) => {
      if (!draft?.approximations.includes(text)) draft?.approximations.push(text);
    };
    for (const use of draft ? imageUses(draft) : []) {
      if (use.uvMap === null || uvMaps.names.includes(use.uvMap)) continue;
      note(`${uvMaps.mesh} has no UV map ${use.uvMap}, shown with its first`);
    }
    if (draft?.normalImage) {
      const tangents = uvSetFor(uvMaps, draft.normalTangentUv);
      const sampled = uvSetFor(uvMaps, draft.normalImage.uvMap);
      const [from, shown] = [uvMaps.names[tangents], uvMaps.names[sampled]];
      if (tangents !== sampled && from && shown) {
        note(`Its normal map takes tangents from UV map ${from}, shown with those of ${shown}`);
      }
    }
    const shown = (input: string, attribute: string | null): AttributeShown => {
      if (attribute === null) return null;
      const name = attribute || meshColors.defaultName;
      if (name !== "" && name === meshColors.read) return "colors";
      if (!meshColors.names.includes(name)) return "black";
      note(`${input} comes from color attribute ${name} of ${uvMaps.mesh}, which the preview leaves out`);
      return null;
    };
    const colors: MaterialColors = {
      baseColor: shown("Base color", draft?.baseColorAttribute ?? null),
      emissive: shown("Emission", draft?.emissiveAttribute ?? null),
    };
    const sets = draft ? imageUses(draft).map((use) => uvSetFor(uvMaps, use.uvMap)) : [];
    const key = `${material && draft ? material.offset : "default"}:${sets.join(",")}:${colors.baseColor}:${colors.emissive}`;
    const known = this.#index.get(key);
    if (known !== undefined) return known;
    this.#index.set(key, this.drafts.length);
    this.drafts.push(draft ?? defaultMaterial());
    this.uvMaps.push(uvMaps);
    this.colors.push(colors);
    return this.drafts.length - 1;
  }
}

/** Blender's `MAXMAT`: the most material slots it gives an object or a mesh. */
const MAX_MATERIAL_SLOTS = 32_767;

type Slots = readonly (BlendStruct | null)[];

/**
 * Reads the material in each slot of the scene's meshes and objects. A mesh's slots are read once and shared by the
 * objects that link none of their own. An array of materials or links serves only the first mesh or object that points
 * at it, as Blender writes one for each, so an object's or mesh's slots are bounded by the bytes of its own arrays.
 */
class SlotReader {
  readonly #file: BlendFile;
  readonly #claimed = new Set<number>();
  readonly #meshes = new Map<number, Slots>();
  readonly #materials = new Map<number, BlendStruct | null>();

  constructor(file: BlendFile) {
    this.#file = file;
  }

  /** The material in each of the mesh's own slots, as many as its count and its array of materials both hold. */
  mesh(mesh: BlendStruct): Slots {
    let slots = this.#meshes.get(mesh.offset);
    if (!slots) {
      slots = this.#pointers(mesh, "mat").map((address) => this.#material(mesh, address));
      this.#meshes.set(mesh.offset, slots);
    }
    return slots;
  }

  /**
   * The material in each of the object's slots: its own where the slot links to the object, else the mesh's. The
   * object has as many slots as its count and its arrays of materials and links hold, and at least the mesh's.
   */
  object(object: BlendStruct, meshSlots: Slots): Slots {
    const materials = this.#pointers(object, "mat");
    const linksBlock = this.#own(object, "matbits");
    const links = linksBlock ? this.#file.bytesOf(linksBlock).subarray(0, this.#counted(object)) : new Uint8Array(0);
    const count = Math.max(materials.length, links.length, meshSlots.length);
    if (count === meshSlots.length && links.every((link) => link === 0)) return meshSlots;
    return Array.from({ length: count }, (_, slot) =>
      (links[slot] ?? 0) === 0 ? (meshSlots[slot] ?? null) : this.#material(object, materials[slot] ?? 0n),
    );
  }

  #counted(owner: BlendStruct): number {
    return Math.min(Math.max(owner.number("totcol"), 0), MAX_MATERIAL_SLOTS);
  }

  /** The block a pointer member points at, unless a mesh or object read before points at it too. */
  #own(owner: BlendStruct, name: string): BlendBlock | null {
    const block = owner.target(name);
    if (!block || this.#claimed.has(block.index)) return null;
    this.#claimed.add(block.index);
    return block;
  }

  /** The material pointers in the owner's own array, as many as its count and the array both hold. */
  #pointers(owner: BlendStruct, name: string): bigint[] {
    return this.#own(owner, name) ? owner.pointers(name, this.#counted(owner)) : [];
  }

  #material(owner: BlendStruct, address: bigint): BlendStruct | null {
    const block = owner.resolve(address);
    if (!block) return null;
    let material = this.#materials.get(block.index);
    if (material === undefined) {
      material = this.#file.first(block);
      this.#materials.set(block.index, material);
    }
    return material;
  }
}

/** A shown mesh object, its mesh, and the material in each of its slots. */
export interface ShownMesh {
  object: SceneObject;
  mesh: BlendStruct;
  slots: Slots;
}

/**
 * The scene's shown mesh objects with the materials in their slots, which both the gray check and the build read.
 * Objects that link no slot of their own share their mesh's slots.
 */
export function* shownMeshSlots(file: BlendFile, contents: SceneContents): Generator<ShownMesh> {
  const reader = new SlotReader(file);
  const read = new Map<number, Slots>();
  for (const object of contents.objects) {
    if (object.type !== ObjectType.mesh || !object.data || !object.shown) continue;
    let slots = read.get(object.struct.offset);
    if (!slots) {
      slots = reader.object(object.struct, reader.mesh(object.data));
      read.set(object.struct.offset, slots);
    }
    yield { object, mesh: object.data, slots };
  }
}

/** An image a material asks the gray check about, and how much of it the check reads. */
export interface GrayCandidate {
  image: BlendStruct;
  read: GrayRead;
}

/**
 * The images that the materials in the slots of the scene's shown meshes ask `buildScene`'s `isGray` about, so that
 * the caller can find which are gray before building the scene, each read whole where any material asks so. It reads
 * only the materials, not the meshes.
 */
export function grayCandidates(file: BlendFile, contents: SceneContents): GrayCandidate[] {
  const asked = new Map<number, GrayCandidate>();
  const ask: GrayCheck = (image, read) => {
    const whole = read === "whole" || asked.get(image.offset)?.read === "whole";
    asked.set(image.offset, { image, read: whole ? "whole" : "sample" });
    return null;
  };
  const read = new Set<number>();
  const frame = imageFrame(contents.scene);
  const scanned = new Set<Slots>();
  for (const { slots } of shownMeshSlots(file, contents)) {
    if (scanned.has(slots)) continue;
    scanned.add(slots);
    for (const material of slots) {
      if (!material || isLinked(material) || read.has(material.offset)) continue;
      read.add(material.offset);
      readMaterial(material, file.version, ask, frame);
    }
  }
  return [...asked.values()];
}

/** The scene frame at which an image sequence shows its frame: the start frame, whole, as for poses and shape keys. */
function imageFrame(scene: BlendStruct | null): number {
  return Math.trunc(startFrame(scene));
}

/** The deform bones that skin the object, from its first Armature modifier, with warnings about what is left out. */
function skinBones(object: SceneObject, byOffset: Map<number, ObjectRecord>, warn: Warn): SkinBone[] | null {
  const deforms = deformingArmatures(object.struct);
  const [first] = deforms;
  const armature = first ? byOffset.get(first.target.offset)?.armature : undefined;
  if (!first || !armature) return null;
  if (deforms.length > 1) {
    warn("extra-skins", object.name, `Several skins: ${object.name}`, "Only the first Armature modifier deforms it");
  }
  if ((first.flags & ArmatureDeformFlag.preserveVolume) !== 0) {
    warn("deform-approximated", object.name, `Preserve volume shown as linear skinning: ${object.name}`);
  }
  if (first.maskGroup !== "") {
    const detail = `Vertex group ${first.maskGroup} limits the Armature modifier; the preview deforms vertices fully`;
    warn("deform-approximated", object.name, `Armature mask not applied: ${object.name}`, detail);
  }
  if ((first.flags & ArmatureDeformFlag.vertexGroups) === 0) return null;
  return armature.bones.flatMap((bone, index) =>
    bone.deform ? [{ name: bone.name, node: armature.nodes[index] ?? -1 }] : [],
  );
}

/** Warnings about the envelopes of the armature that skins the mesh object at `node`, which the preview leaves out. */
function envelopeWarnings(
  object: SceneObject,
  node: number,
  data: MeshData,
  byOffset: Map<number, ObjectRecord>,
  restWorld: readonly Mat4[],
  warn: Warn,
): void {
  const [first] = deformingArmatures(object.struct);
  const target = first ? byOffset.get(first.target.offset) : undefined;
  if (!first || !target?.armature) return;
  const toArmature = multiply(invert(restWorld[target.node] ?? identity()), restWorld[node] ?? identity());
  const use = envelopeUse(data, first, target.armature.bones, toArmature);
  if (use.enveloped) {
    warn("deform-approximated", object.name, `Envelopes not used: ${object.name}`, "Only vertex groups deform it");
  }
  if (use.multiplying.length > 0) {
    const detail = `Bones that multiply vertex group weights by their envelopes: ${use.multiplying.join(", ")}`;
    warn("deform-approximated", object.name, `Envelope multiply not applied: ${object.name}`, detail);
  }
}

function modifierWarnings(object: SceneObject, smoothing: SmoothByAngle | null, warn: Warn): void {
  const ignored = viewportModifiers(object.struct).filter(
    (modifier) =>
      changesPreview(modifier) &&
      modifierType(modifier) !== ModifierType.armature &&
      modifier.offset !== smoothing?.modifier.offset,
  );
  if (ignored.length > 0) {
    warn(
      "modifier-not-applied",
      object.name,
      `Modifiers not applied: ${object.name}`,
      `Shown without ${ignored.map(modifierName).join(", ")}`,
    );
  }
}

function meshWarnings(object: SceneObject, built: BuiltMesh, warn: Warn): void {
  if (built.droppedUvSets > 0) {
    warn("too-many-uv-sets", object.name, `Too many UV sets: ${object.name}`, `Only the first ${MAX_UV_SETS} are kept`);
  }
  if (built.skin?.unweighted) {
    warn(
      "unweighted-vertices",
      object.name,
      `Unweighted vertices: ${object.name}`,
      "Some vertices have no skin weights",
    );
  }
  if (built.skin?.droppedBones) {
    warn("too-many-bones", object.name, `Too many bones: ${object.name}`, "Bones past the first 65534 are dropped");
  }
  const limited = built.skin?.limited;
  if (limited && limited.vertices > 0) {
    const percent = Math.round(limited.largestDroppedShare * 100);
    const loss = percent < 1 ? "less than 1%" : `up to ${percent}%`;
    warn(
      "deform-approximated",
      object.name,
      `Skin weights limited to four bones: ${object.name}`,
      limited.vertices === 1
        ? `1 vertex keeps its four strongest bones and loses ${loss} of its weight`
        : `${limited.vertices} vertices keep their four strongest bones and lose ${loss} of their weight`,
    );
  }
}

function sameValues(a: Float32Array, b: Float32Array): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/** Mesh data read with the vertex groups and color attributes an object asks for. */
interface ReadMesh {
  mesh: number;
  key: string;
  data: MeshData;
}

/** What one mesh was read and built into, by the settings of the objects that use it. */
interface MeshEntries {
  read: Map<string, ReadMesh | MeshReadError>;
  built: Map<string, BuiltMesh>;
}

/**
 * Mesh data and built meshes, read and built once for all the shown objects that share a mesh with the same settings.
 * A mesh's entries go once its last shown object is built.
 */
class MeshCache {
  readonly #file: BlendFile;
  readonly #users = new Map<number, number>();
  readonly #entries = new Map<number, MeshEntries>();
  readonly #vertices = new Map<number, ShownVertices | null>();
  readonly #shapes = new Map<string, ShapeSource | null>();

  constructor(file: BlendFile, shown: Iterable<ShownMesh>) {
    this.#file = file;
    for (const { mesh } of shown) this.#users.set(mesh.offset, (this.#users.get(mesh.offset) ?? 0) + 1);
  }

  /** The mesh's data with an object's vertex group names and the color attributes each of its slots wants. */
  read(mesh: BlendStruct, groups: readonly string[], colors: readonly (readonly string[])[]): ReadMesh | MeshReadError {
    const wanted = colors.some((names) => names.length > 0) ? colors : [];
    const key = JSON.stringify([groups, wanted]);
    const entries = this.#entriesOf(mesh.offset);
    let found = entries.read.get(key);
    if (!found) {
      try {
        found = { mesh: mesh.offset, key, data: readMeshData(this.#file, mesh, groups, wanted) };
      } catch (error) {
        if (!(error instanceof MeshReadError)) throw error;
        found = error;
      }
      entries.read.set(key, found);
    }
    return found;
  }

  /** The mesh built from read data with an object's options, which name the object's node only for a skinned mesh. */
  build(read: ReadMesh, options: BuildOptions): BuiltMesh {
    const smoothing = options.smoothing && [options.smoothing.angle, options.smoothing.ignoreSharpness];
    const skin = options.skinBones && [options.skinBones, options.meshNode];
    const key = JSON.stringify([read.key, options.slotCount, smoothing, skin]);
    const entries = this.#entriesOf(read.mesh);
    let built = entries.built.get(key);
    if (!built) {
      built = buildMesh(read.data, options);
      entries.built.set(key, built);
    }
    return built;
  }

  /** A mesh object's vertices as Arcue shows them at rest, or null for a mesh Arcue cannot read. */
  vertices(object: BlendStruct, poses: StartPoses): ShownVertices | null {
    const known = this.#vertices.get(object.offset);
    if (known !== undefined) return known;
    const mesh = object.deref("data");
    const source = mesh && !isLinked(mesh) ? this.#shapeOf(mesh, vertexGroupNames(object)) : null;
    let shown: ShownVertices | null = null;
    if (mesh && source) {
      const weights = restShapeWeights(object, mesh, source, poses);
      shown = { count: source.vertexCount, at: (index) => shapedVertex(source, index, weights) };
    }
    this.#vertices.set(object.offset, shown);
    return shown;
  }

  /** What the mesh's shape keys move its vertices by, keeping only that of a mesh that no shown object builds. */
  #shapeOf(mesh: BlendStruct, groups: readonly string[]): ShapeSource | null {
    const key = JSON.stringify([mesh.offset, groups]);
    let found = this.#shapes.get(key);
    if (found === undefined) {
      const read = this.read(mesh, groups, []);
      if (read instanceof MeshReadError) {
        found = null;
      } else {
        const { vertexCount, positions, shapeKeys, referenceKey, vertexGroupNames, deformWeights } = read.data;
        found = { vertexCount, positions, shapeKeys, referenceKey, vertexGroupNames, deformWeights };
      }
      this.#shapes.set(key, found);
      if (!this.#users.has(mesh.offset)) this.#entries.delete(mesh.offset);
    }
    return found;
  }

  /** Marks one shown object of the mesh built, which lets the mesh's entries go after the last. */
  done(mesh: BlendStruct): void {
    const left = (this.#users.get(mesh.offset) ?? 0) - 1;
    this.#users.set(mesh.offset, left);
    if (left <= 0) this.#entries.delete(mesh.offset);
  }

  #entriesOf(mesh: number): MeshEntries {
    let entries = this.#entries.get(mesh);
    if (!entries) {
      entries = { read: new Map(), built: new Map() };
      this.#entries.set(mesh, entries);
    }
    return entries;
  }
}

/** The vertex group names an object stores, which files before Blender 3.0 keep on the object. */
function vertexGroupNames(object: BlendStruct): string[] {
  return ownedList(object, "defbase").map((group) => group.string("name"));
}

/** Each shape key's weight by name, as the object shows its mesh at the scene's start frame. */
function restShapeWeights(
  object: BlendStruct,
  mesh: BlendStruct,
  data: ShapeSource,
  poses: StartPoses,
): Map<string, number> {
  const pinned = pinnedShape(data, lockedShapeKey(object));
  const key = mesh.deref("key");
  return shapeWeights(shapeTargets(data), !pinned && key ? poses.weights(key) : new Map(), pinned);
}

function pinnedDetail(pinned: PinnedShape): string {
  const unchanged = "key values and their animation change nothing";
  if (pinned.name === null) return `Shows its basis shape, as Blender does, so ${unchanged}`;
  if (pinned.rough === null) return `Shows ${pinned.name} alone, as Blender does, so ${unchanged}`;
  return `Shows ${pinned.name} alone, roughly, since ${pinned.rough}; ${unchanged}`;
}

/** Each morph target's weight as Blender shows the object at the scene's start frame, and whether Shape Key Lock pins it. */
function startMorphTargets(
  object: SceneObject,
  mesh: BlendStruct,
  data: MeshData,
  built: BuiltMesh,
  poses: StartPoses,
  warn: Warn,
): { targets: MorphTarget[]; locked: boolean } {
  const pinned = pinnedShape(data, lockedShapeKey(object.struct));
  if (pinned && built.morphTargets.length > 0) {
    warn("deform-approximated", object.name, `Shape key pinned: ${object.name}`, pinnedDetail(pinned));
  }
  const key = mesh.deref("key");
  const weights = shapeWeights(shapeTargets(data), !pinned && key ? poses.weights(key) : new Map(), pinned);
  return {
    targets: built.morphTargets.map((target) => {
      const weight = weights.get(target.name) ?? target.defaultWeight;
      return weight === target.defaultWeight ? target : { ...target, defaultWeight: weight };
    }),
    locked: pinned !== null,
  };
}

/** What the scene's shown meshes need from the rest of the build. */
interface MeshContext {
  file: BlendFile;
  poses: StartPoses;
  conversion: Mat4;
  nodes: NodeDraft[];
  restWorld: readonly Mat4[];
  byOffset: Map<number, ObjectRecord>;
  materials: MaterialTable;
  cache: MeshCache;
  warn: Warn;
}

/** The meshes of the scene's shown mesh objects, with their skeletons and what animation needs to move them. */
class SceneMeshes {
  readonly meshes: Mesh[] = [];
  readonly skeletons: Skeleton[] = [];
  readonly records: MeshRecord[] = [];
  readonly #context: MeshContext;

  constructor(context: MeshContext) {
    this.#context = context;
  }

  add(record: ObjectRecord, shown: ShownMesh): void {
    try {
      this.#add(record, shown);
    } finally {
      this.#context.cache.done(shown.mesh);
    }
  }

  #add(record: ObjectRecord, { object, mesh, slots }: ShownMesh): void {
    const { file, poses, conversion, nodes, restWorld, byOffset, materials, cache, warn } = this.#context;
    const defaultColor = defaultColorAttribute(mesh);
    const wantedColors = slots.map((material) =>
      materials
        .attributesOf(material)
        .map((name) => name || defaultColor)
        .filter((name) => name !== ""),
    );
    const read = cache.read(mesh, vertexGroupNames(object.struct), wantedColors);
    if (read instanceof MeshReadError) {
      warn("invalid-data", object.name, `Mesh not read: ${object.name}`, read.message);
      return;
    }
    const { data } = read;
    const smoothing = smoothByAngle(object.struct);
    modifierWarnings(object, smoothing, warn);
    if (data.faceCount === 0) {
      if (data.edgeCount > 0)
        warn("object-not-shown", object.name, `Not shown: ${object.name}`, "Its mesh has no faces");
      return;
    }
    if (data.absoluteKeys) {
      warn(
        "deform-approximated",
        object.name,
        `Absolute shape keys not shown: ${object.name}`,
        "Shown in its basis shape",
      );
    }
    if (data.shapeKeysLeftOut) {
      const detail = `Its mesh has ${data.cornerCount} face corners for ${data.vertexCount} vertices; shown in its basis shape`;
      warn("deform-approximated", object.name, `Shape keys not shown: ${object.name}`, detail);
    }
    const built = cache.build(read, {
      conversion,
      slotCount: slots.length,
      skinBones: skinBones(object, byOffset, warn),
      meshNode: record.node,
      smoothing,
      blenderVersion: file.version,
    });
    meshWarnings(object, built, warn);

    const toScene = invert(conversion);
    const sceneWorld = (node: number) => multiplyAll(conversion, restWorld[node] ?? identity(), toScene);
    const bind = sceneWorld(record.node);
    let skeleton: number | null = null;
    if (built.skin) {
      const inverseBind = new Float32Array(built.skin.joints.length * 16);
      built.skin.joints.forEach((joint, index) => {
        inverseBind.set(invert(sceneWorld(joint)), index * 16);
      });
      skeleton = this.#skeletonIndex(built.skin.joints, inverseBind);
    }
    envelopeWarnings(object, record.node, data, byOffset, restWorld, warn);
    const restPositions = new Float32Array(data.vertexCount * 3);
    const placement = multiply(bind, conversion);
    for (let v = 0; v < data.vertexCount; v++) {
      const [x = 0, y = 0, z = 0] = data.positions.subarray(v * 3, v * 3 + 3);
      restPositions.set(transformPoint(placement, x, y, z), v * 3);
    }
    const uvMaps: MaterialUvMaps = {
      mesh: object.name,
      names: built.uvs.map((uv) => uv.name),
      defaultIndex: data.defaultUv < built.uvs.length ? data.defaultUv : 0,
    };
    const meshColors: MeshColors = {
      read: data.colors?.name ?? null,
      names: data.attributeNames,
      defaultName: defaultColor,
    };
    const usedSlots = [...new Set(built.groups.map((group) => group.material))].sort((a, b) => a - b);
    const materialOfSlot = new Map(
      usedSlots.map((slot) => [slot, materials.indexOf(slots[slot] ?? null, uvMaps, meshColors)]),
    );
    const groups = built.groups.map((group) => ({ ...group, material: materialOfSlot.get(group.material) ?? 0 }));
    const morphs = startMorphTargets(object, mesh, data, built, poses, warn);

    const node = nodes[record.node];
    if (node) {
      node.kind = "mesh";
      node.mesh = this.meshes.length;
    }
    this.meshes.push({
      name: object.name,
      geometryName: data.name,
      positions: built.positions,
      normals: built.normals,
      uvs: built.uvs,
      colors: built.colors,
      skeleton,
      bindMatrix: built.skin ? Float32Array.from(bind) : null,
      joints: built.skin?.rendered.joints ?? null,
      weights: built.skin?.rendered.weights ?? null,
      indices: built.indices,
      groups,
      morphTargets: morphs.targets,
      sourceVertex: built.sourceVertex,
      sourceVertexCount: built.sourceVertexCount,
      topology: built.topology,
      restPositions,
      skinWeights: built.skin?.source ?? null,
    });
    this.records.push({
      node: record.node,
      object,
      morphKeys: built.morphKeys,
      morphDefaults: morphs.targets.map((target) => target.defaultWeight),
      morphRanges: built.morphRanges,
      shapeKeyLock: morphs.locked,
    });
  }

  #skeletonIndex(joints: number[], inverseBind: Float32Array): number {
    const found = this.skeletons.findIndex(
      (skeleton) =>
        skeleton.joints.length === joints.length &&
        skeleton.joints.every((joint, index) => joint === joints[index]) &&
        sameValues(skeleton.inverseBindMatrices, inverseBind),
    );
    if (found >= 0) return found;
    this.skeletons.push({ joints, inverseBindMatrices: inverseBind });
    return this.skeletons.length - 1;
  }
}

/** One warning for each material the preview approximates. */
function materialWarnings(drafts: readonly MaterialDraft[]): BlendWarning[] {
  return [...new Set(drafts)]
    .filter((draft) => draft.approximations.length > 0)
    .map((draft) => ({
      code: "material-approximated",
      subject: { kind: "material", name: draft.name },
      message: `Material approximated: ${draft.name}`,
      detail: draft.approximations.join("; "),
    }));
}

/** Data the scene needs from other files: the scene's own, and the materials, actions and images its objects use. */
function linkedNames(contents: SceneContents, materials: MaterialTable): LinkedName[] {
  const animationOwners = contents.objects.flatMap((object) => {
    const key = object.type === ObjectType.mesh ? object.data?.deref("key") : null;
    return key ? [object.struct, key] : [object.struct];
  });
  const actions = animationOwners.flatMap((id) =>
    usedActions(id).flatMap(({ action }) => (isLinked(action) ? [linkedName("actions", idName(action), action)] : [])),
  );
  const images = materials.drafts.flatMap((draft) =>
    imageUses(draft).flatMap((use) =>
      use.image.typeName === "Image" ? [] : [linkedName("images", idName(use.image), use.image)],
    ),
  );
  return [...contents.linked, ...materials.linked, ...actions, ...images];
}

/**
 * The warning about data that the scene links from other .blend files, which Arcue does not load, or null for none.
 * Files that Pack Linked Libraries packed into this one are named apart: the data is in the file, unread.
 */
export function linkedDataWarning(linked: readonly LinkedName[]): BlendWarning | null {
  const listed = (packed: boolean) =>
    LINKED_KINDS.flatMap((kind) => {
      const names = new Set(
        linked.flatMap((entry) => (entry.kind === kind && entry.packed === packed ? [entry.name] : [])),
      );
      return names.size > 0 ? [`${kind} ${[...names].join(", ")}`] : [];
    }).join("; ");
  const external = listed(false);
  const packed = listed(true);
  const detail = [
    external === "" ? "" : `From other .blend files: ${external}`,
    packed === "" ? "" : `From .blend files packed in this one, which are not read: ${packed}`,
  ]
    .filter((part) => part !== "")
    .join(". ");
  if (detail === "") return null;
  return { code: "library-not-loaded", subject: { kind: "file", name: "" }, message: "Linked data not shown", detail };
}

/**
 * Reads the active scene of a .blend file into nodes, meshes, skeletons and material drafts. `isGray` says which images
 * are gray, where materials show one value of an image as a color. `contents` are the scene's objects and `actions` the
 * file's actions, when the caller has read them already.
 */
export function buildScene(
  file: BlendFile,
  isGray: GrayCheck = () => null,
  contents: SceneContents = collectSceneObjects(file),
  actions: readonly Action[] = readActions(file),
): BuiltScene {
  const warnings: BlendWarning[] = [];
  const warn: Warn = (code, name, message, detail) => {
    const subject: ImportWarningSubject = { kind: "node", name };
    warnings.push(detail === undefined ? { code, subject, message } : { code, subject, message, detail });
  };
  const { fps, unitScale } = sceneSettings(contents.scene);
  const conversion = conversionMatrix(unitScale);
  const shown = [...shownMeshSlots(file, contents)];
  const cache = new MeshCache(file, shown);
  const poses = startPoses(contents.scene, actions);
  const { nodes, nodeWorlds, objects, byOffset } = objectNodes(contents, poses, warn, (parent) =>
    cache.vertices(parent, poses),
  );
  if (nestsTooDeep(nodes)) {
    throw new BlendLimitError(
      `nests objects and bones more than ${MAX_NODE_DEPTH} levels deep`,
    );
  }
  const restWorld = nodes.map((_, index) => nodeWorlds.of(index));
  const materials = new MaterialTable(file.version, isGray, imageFrame(contents.scene));
  const meshes = new SceneMeshes({
    file,
    poses,
    conversion,
    nodes,
    restWorld,
    byOffset,
    materials,
    cache,
    warn,
  });
  for (const mesh of shown) {
    const record = byOffset.get(mesh.object.struct.offset);
    if (record) meshes.add(record, mesh);
  }
  for (const warning of materialWarnings(materials.drafts)) warnings.push(warning);
  const linked = linkedDataWarning(linkedNames(contents, materials));
  if (linked) warnings.push(linked);

  return {
    nodes,
    meshes: meshes.meshes,
    skeletons: meshes.skeletons,
    materials: materials.drafts,
    materialUvs: materials.uvMaps,
    materialColors: materials.colors,
    objects,
    meshRecords: meshes.records,
    conversion,
    fps,
    unitScale,
    timeline: sceneTimeline(contents.scene),
    warnings,
  };
}

/** The UV set index a texture samples in a mesh: its UV Map node's map, or else the mesh's default map. */
export function uvSetFor(mesh: MaterialUvMaps | undefined, uvMap: string | null): number {
  if (!mesh) return 0;
  const found = uvMap === null ? mesh.defaultIndex : mesh.names.indexOf(uvMap);
  return found >= 0 ? found : 0;
}
