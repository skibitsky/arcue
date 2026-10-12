import type { ImportWarningCode, ImportWarningSubject, Mesh, NodeKind, Skeleton } from "@arcue/scene";
import { usedActions } from "../anim/actions";
import type { OpeningPose } from "../anim/opening";
import { currentFrame, openingPose, openingWeights } from "../anim/opening";
import type { BlendFile, BlendStruct } from "../blend/file";
import { idName, isLinked } from "../blend/ids";
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
import { BoneFlag, readBones } from "./armature";
import { envelopeUse, readEnvelopes } from "./envelopes";
import type { GrayCheck, MaterialDraft } from "./materials";
import { defaultMaterial, imageUses, readMaterial } from "./materials";
import type { BuiltMesh, SkinBone } from "./mesh-build";
import { buildMesh, MAX_UV_SETS } from "./mesh-build";
import type { MeshData } from "./mesh-data";
import { defaultColorAttribute, MeshReadError, meshMaterials, readMeshData } from "./mesh-data";
import { changesPreview, ModifierType, modifierName, modifierType, viewportModifiers } from "./modifiers";
import type { SceneContents, SceneObject } from "./objects";
import {
  ARMATURE_DEFORM_VERTEX_GROUPS,
  childInstancing,
  collectSceneObjects,
  deformingArmatures,
  instancedCollection,
  ObjectType,
  ParentType,
  UNSHOWN_GEOMETRY,
} from "./objects";
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
  /** Each bone's pose channel as Blender shows it when it opens the file; an action changes only the values it keys. */
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
  morphRanges: [number, number][];
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
  meshes: Omit<Mesh, "topology">[];
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
  warnings: BlendWarning[];
}

type Warn = (code: ImportWarningCode, name: string, message: string, detail?: string) => void;

const CONSTRAINT_DISABLE = 1 << 2;
const CONSTRAINT_OFF = 1 << 9;
const ARMATURE_DEFORM_QUATERNION = 1 << 2;

export function sceneSettings(scene: BlendStruct | null): { fps: number; unitScale: number } {
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
export function conversionMatrix(unitScale: number): Mat4 {
  const s = unitScale;
  return Float64Array.of(s, 0, 0, 0, 0, 0, -s, 0, 0, s, 0, 0, 0, 0, 0, 1);
}

/**
 * The constraints Blender evaluates: on, valid, and with some influence now or an animated influence. `path` is the
 * owner's path to its constraints, such as `pose.bones["Arm"].` for a bone or empty for an object.
 */
export function activeConstraints(
  owner: BlendStruct,
  path = "",
  animated: ReadonlySet<string> = new Set(),
): BlendStruct[] {
  return owner.list("constraints").filter((constraint) => {
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

function headTailFactor(object: BlendStruct): number {
  return object.has("parent_bone_head_tail_factor") ? object.number("parent_bone_head_tail_factor") : 1;
}

/** Whether a child of the bone follows only its channel transform, which is identity at rest, as Blender's option. */
function relativeParent(bone: Bone): boolean {
  return (bone.flag & BoneFlag.relativeParenting) !== 0;
}

/** The rest matrix of the bone an object is parented to, moved to the bone's tail, in armature space. */
function boneParentMatrix(object: BlendStruct, armature: BlendStruct): Mat4 {
  const data = armature.deref("data");
  const name = object.string("parsubstr");
  const bone = data ? readBones(data).find((candidate) => candidate.name === name) : undefined;
  if (!bone || relativeParent(bone)) return identity();
  return multiply(bone.rest, translation(0, bone.length * headTailFactor(object), 0));
}

/** Rest world matrices in Blender's space of any object, shown or not, with every bone at rest. */
class WorldMatrices {
  readonly #cache = new Map<number, Mat4>();
  readonly #visiting = new Set<number>();

  of(object: BlendStruct): Mat4 {
    const cached = this.#cache.get(object.offset);
    if (cached) return cached;
    if (this.#visiting.has(object.offset)) return identity();
    this.#visiting.add(object.offset);
    const world = multiplyAll(
      this.parentOf(object),
      mat4From(object.numbers("parentinv")),
      objectBasis(objectValues(object)),
    );
    this.#visiting.delete(object.offset);
    this.#cache.set(object.offset, world);
    return world;
  }

  /** The world matrix of what the object is parented to, a bone's tail for a bone parent. */
  parentOf(object: BlendStruct): Mat4 {
    const parent = object.deref("parent");
    if (!parent || isLinked(parent)) return identity();
    const world = this.of(parent);
    return (object.number("partype") & 15) === ParentType.bone
      ? multiply(world, boneParentMatrix(object, parent))
      : world;
  }
}

function addArmature(
  record: ObjectRecord,
  data: BlendStruct,
  nodes: NodeDraft[],
  animated: ReadonlySet<string>,
  warn: Warn,
  opening: OpeningPose,
): void {
  const { object, node } = record;
  const bones = readBones(data);
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
    return opening.channel(bone.name, channel ? channelValues(channel) : restChannel());
  });
  record.armature = { bones, nodes: boneNodes, pose };
  if (bones.some((bone) => bone.deform && bone.segments > 1)) {
    warn("deform-approximated", object.name, `B-Bones bend as straight bones: ${object.name}`);
  }
  const constrained = bones.filter((bone) => {
    const channel = channels.get(bone.name);
    return (
      channel !== undefined && activeConstraints(channel, `pose.bones["${quoted(bone.name)}"].`, animated).length > 0
    );
  });
  if (constrained.length > 0) {
    warn(
      "constraint-not-evaluated",
      object.name,
      `Bone constraints not evaluated: ${object.name}`,
      `Bones: ${constrained.map((bone) => bone.name).join(", ")}`,
    );
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
function objectNodes(contents: SceneContents, animated: ReadonlySet<string>, warn: Warn) {
  const worlds = new WorldMatrices();
  const nodes: NodeDraft[] = [];
  const objects: ObjectRecord[] = [];
  const byOffset = new Map<number, ObjectRecord>();
  const ancestors = geometryAncestors(contents.objects);
  for (const object of contents.objects) {
    const parentRecord = object.parent ? byOffset.get(object.parent.offset) : undefined;
    let parentNode = parentRecord?.node ?? -1;
    let parentPart: Mat4 = parentRecord ? identity() : worlds.parentOf(object.struct);
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
    const parentInverse = mat4From(object.struct.numbers("parentinv"));
    const opening = openingPose(object.struct, contents.scene);
    const values = opening.object(objectValues(object.struct));
    const record: ObjectRecord = { object, node: nodes.length, parentPart, parentInverse, values, armature: null };
    const rest = multiplyAll(parentPart, parentInverse, objectBasis(values));
    nodes.push({ name: object.name, parent: parentNode, kind: "empty", rest, mesh: null });
    if (shearOf(rest) > SHEAR_TOLERANCE) {
      const detail = "Its parent's scale shears it, which the preview drops";
      warn("deform-approximated", object.name, `Shear not shown: ${object.name}`, detail);
    }
    if (object.type === ObjectType.armature && object.data) {
      addArmature(record, object.data, nodes, animated, warn, opening);
    }
    if (activeConstraints(object.struct, "", animated).length > 0) {
      warn("constraint-not-evaluated", object.name, `Constraints not evaluated: ${object.name}`);
    }
    if (object.shown && UNSHOWN_GEOMETRY.has(object.type)) {
      const kind = UNSHOWN_GEOMETRY.get(object.type);
      warn("object-not-shown", object.name, `Not shown: ${object.name}`, `Arcue shows meshes; this is ${kind} data`);
    }
    const instanced = object.shown ? instancedCollection(object.struct) : null;
    if (instanced) {
      const detail = `Arcue does not expand instances of ${idName(instanced)}`;
      warn("object-not-shown", object.name, `Collection instance not shown: ${object.name}`, detail);
    }
    const drawsInstances = object.shown && !object.hidden && ancestors.has(object.struct.offset);
    const instancing = drawsInstances ? childInstancing(object.struct) : null;
    if (instancing) {
      const kind = instancing === "vertex" ? "Vertex" : "Face";
      const detail = `Arcue shows its children once instead of at each ${instancing}`;
      warn("object-not-shown", object.name, `${kind} instances not shown: ${object.name}`, detail);
    }
    if (object.parentType === ParentType.vertex || object.parentType === ParentType.vertices) {
      warn("invalid-data", object.name, `Vertex parent not followed: ${object.name}`);
    }
    objects.push(record);
    byOffset.set(object.struct.offset, record);
  }
  return { nodes, objects, byOffset };
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
  /** Names of materials linked from other files, which show as the default material. */
  readonly linked = new Set<string>();
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
    if (material && isLinked(material)) this.linked.add(idName(material));
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

/** The material in each slot: the object's own where the slot links to the object, else the mesh's. */
function slotMaterials(
  file: BlendFile,
  object: BlendStruct,
  meshSlots: readonly (BlendStruct | null)[],
): (slot: number) => BlendStruct | null {
  const objectSlots = Math.max(object.number("totcol"), 0);
  const objectMaterials = object.pointers("mat", objectSlots);
  const links = object.target("matbits");
  const linkBytes = links ? file.bytesOf(links) : new Uint8Array(0);
  return (slot) => {
    if ((linkBytes[slot] ?? 0) === 0) return meshSlots[slot] ?? null;
    return file.first(object.resolve(objectMaterials[slot] ?? 0n));
  };
}

/**
 * The images that the materials in the slots of the scene's shown meshes ask `buildScene`'s `isGray` about, so that
 * the caller can find which are gray before building the scene. It reads only the materials, not the meshes.
 */
export function grayCandidates(file: BlendFile): BlendStruct[] {
  const asked = new Map<number, BlendStruct>();
  const ask: GrayCheck = (image) => {
    asked.set(image.offset, image);
    return false;
  };
  const read = new Set<number>();
  const contents = collectSceneObjects(file);
  const frame = imageFrame(contents.scene);
  for (const object of contents.objects) {
    if (object.type !== ObjectType.mesh || !object.data || !object.shown) continue;
    const meshSlots = meshMaterials(file, object.data);
    const slotMaterial = slotMaterials(file, object.struct, meshSlots);
    const slots = Math.max(object.struct.number("totcol"), meshSlots.length);
    for (let slot = 0; slot < slots; slot++) {
      const material = slotMaterial(slot);
      if (!material || isLinked(material) || read.has(material.offset)) continue;
      read.add(material.offset);
      readMaterial(material, file.version, ask, frame);
    }
  }
  return [...asked.values()];
}

/** The scene frame at which Blender picks the frame an image sequence shows: the current one, whole. */
function imageFrame(scene: BlendStruct | null): number {
  return Math.trunc(currentFrame(scene));
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
  if ((first.flags & ARMATURE_DEFORM_QUATERNION) !== 0) {
    warn("deform-approximated", object.name, `Preserve volume shown as linear skinning: ${object.name}`);
  }
  if (first.maskGroup !== "") {
    const detail = `Vertex group ${first.maskGroup} limits the Armature modifier; the preview deforms vertices fully`;
    warn("deform-approximated", object.name, `Armature mask not applied: ${object.name}`, detail);
  }
  if ((first.flags & ARMATURE_DEFORM_VERTEX_GROUPS) === 0) return null;
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
  const armature = first.target.deref("data");
  const use = envelopeUse(data, first, target.armature.bones, armature && readEnvelopes(armature), toArmature);
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

/**
 * Reads the active scene of a .blend file into nodes, meshes, skeletons and material drafts. `isGray` says which images
 * are gray, where materials show one value of an image as a color.
 */
export function buildScene(
  file: BlendFile,
  animated: ReadonlySet<string> = new Set(),
  isGray: GrayCheck = () => false,
): BuiltScene {
  const warnings: BlendWarning[] = [];
  const warn: Warn = (code, name, message, detail) => {
    const subject: ImportWarningSubject = { kind: "node", name };
    warnings.push(detail === undefined ? { code, subject, message } : { code, subject, message, detail });
  };
  const contents = collectSceneObjects(file);
  const { fps, unitScale } = sceneSettings(contents.scene);
  const conversion = conversionMatrix(unitScale);
  const toScene = invert(conversion);
  const { nodes, objects, byOffset } = objectNodes(contents, animated, warn);

  const restWorld: Mat4[] = [];
  for (const node of nodes) {
    restWorld.push(node.parent >= 0 ? multiply(restWorld[node.parent] ?? identity(), node.rest) : node.rest);
  }
  const sceneWorld = (node: number) => multiplyAll(conversion, restWorld[node] ?? identity(), toScene);

  const materials = new MaterialTable(file.version, isGray, imageFrame(contents.scene));
  const meshes: Omit<Mesh, "topology">[] = [];
  const skeletons: Skeleton[] = [];
  const meshRecords: MeshRecord[] = [];
  const skeletonIndex = (joints: number[], inverseBind: Float32Array): number => {
    const found = skeletons.findIndex(
      (skeleton) =>
        skeleton.joints.length === joints.length &&
        skeleton.joints.every((joint, index) => joint === joints[index]) &&
        sameValues(skeleton.inverseBindMatrices, inverseBind),
    );
    if (found >= 0) return found;
    skeletons.push({ joints, inverseBindMatrices: inverseBind });
    return skeletons.length - 1;
  };

  for (const record of objects) {
    const { object } = record;
    if (object.type !== ObjectType.mesh || !object.data || !object.shown) continue;
    const meshSlots = meshMaterials(file, object.data);
    const slotMaterial = slotMaterials(file, object.struct, meshSlots);
    const defaultColor = defaultColorAttribute(object.data);
    const slots = Math.max(object.struct.number("totcol"), meshSlots.length);
    const wantedColors = Array.from({ length: slots }, (_, slot) =>
      materials
        .attributesOf(slotMaterial(slot))
        .map((name) => name || defaultColor)
        .filter((name) => name !== ""),
    );
    let data: MeshData;
    try {
      data = readMeshData(
        file,
        object.data,
        object.struct.list("defbase").map((group) => group.string("name")),
        wantedColors,
      );
    } catch (error) {
      if (!(error instanceof MeshReadError)) throw error;
      warn("invalid-data", object.name, `Mesh not read: ${object.name}`, error.message);
      continue;
    }
    const smoothing = smoothByAngle(object.struct);
    modifierWarnings(object, smoothing, warn);
    if (data.faceCount === 0) {
      if (data.edgeCount > 0)
        warn("object-not-shown", object.name, `Not shown: ${object.name}`, "Its mesh has no faces");
      continue;
    }
    if (data.absoluteKeys) {
      warn(
        "deform-approximated",
        object.name,
        `Absolute shape keys not shown: ${object.name}`,
        "Shown in its basis shape",
      );
    }
    const slotCount = Math.max(object.struct.number("totcol"), data.materials.length);
    const bones = skinBones(object, byOffset, warn);
    const built = buildMesh(data, {
      conversion,
      slotCount,
      skinBones: bones,
      meshNode: record.node,
      smoothing,
      blenderVersion: file.version,
    });
    meshWarnings(object, built, warn);

    const bind = sceneWorld(record.node);
    let skeleton: number | null = null;
    if (built.skin) {
      const inverseBind = new Float32Array(built.skin.joints.length * 16);
      built.skin.joints.forEach((joint, index) => {
        inverseBind.set(invert(sceneWorld(joint)), index * 16);
      });
      skeleton = skeletonIndex(built.skin.joints, inverseBind);
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
    const groups = built.groups.map((group) => ({
      ...group,
      material: materials.indexOf(slotMaterial(group.material), uvMaps, meshColors),
    }));

    const key = object.data.deref("key");
    const opened = key ? openingWeights(key, contents.scene) : new Map<string, number>();
    const morphTargets = built.morphTargets.map((target, index) => {
      const weight = opened.get(target.name);
      const [min, max] = built.morphRanges[index] ?? [0, 1];
      return weight === undefined ? target : { ...target, defaultWeight: Math.min(Math.max(weight, min), max) };
    });

    const node = nodes[record.node];
    if (node) {
      node.kind = "mesh";
      node.mesh = meshes.length;
    }
    meshes.push({
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
      morphTargets,
      sourceVertex: built.sourceVertex,
      sourceVertexCount: built.sourceVertexCount,
      restPositions,
      skinWeights: built.skin?.source ?? null,
    });
    meshRecords.push({
      node: record.node,
      object,
      morphKeys: built.morphKeys,
      morphDefaults: morphTargets.map((target) => target.defaultWeight),
      morphRanges: built.morphRanges,
    });
  }

  const reported = new Set<MaterialDraft>();
  for (const draft of materials.drafts) {
    if (draft.approximations.length === 0 || reported.has(draft)) continue;
    reported.add(draft);
    warnings.push({
      code: "material-approximated",
      subject: { kind: "material", name: draft.name },
      message: `Material approximated: ${draft.name}`,
      detail: draft.approximations.join("; "),
    });
  }

  const animationOwners = contents.objects.flatMap((object) => {
    const key = object.type === ObjectType.mesh ? object.data?.deref("key") : null;
    return key ? [object.struct, key] : [object.struct];
  });
  const linkedActions = [
    ...new Set(
      animationOwners.flatMap((id) =>
        usedActions(id).flatMap(({ action }) => (isLinked(action) ? [idName(action)] : [])),
      ),
    ),
  ];
  const linkedImages = [
    ...new Set(
      materials.drafts.flatMap((draft) =>
        imageUses(draft).flatMap((use) => (use.image.typeName === "Image" ? [] : [idName(use.image)])),
      ),
    ),
  ];
  const linked = [
    contents.linkedCollections.length > 0 ? `collections ${contents.linkedCollections.join(", ")}` : "",
    contents.linkedObjects.length > 0 ? `objects ${contents.linkedObjects.join(", ")}` : "",
    materials.linked.size > 0 ? `materials ${[...materials.linked].join(", ")}` : "",
    linkedActions.length > 0 ? `actions ${linkedActions.join(", ")}` : "",
    linkedImages.length > 0 ? `images ${linkedImages.join(", ")}` : "",
  ].filter((entry) => entry !== "");
  if (linked.length > 0) {
    warnings.push({
      code: "library-not-loaded",
      subject: { kind: "file", name: "" },
      message: "Linked data not shown",
      detail: `From other .blend files: ${linked.join("; ")}`,
    });
  }

  return {
    nodes,
    meshes,
    skeletons,
    materials: materials.drafts,
    materialUvs: materials.uvMaps,
    materialColors: materials.colors,
    objects,
    meshRecords,
    conversion,
    fps,
    unitScale,
    warnings,
  };
}

/** The UV set index a texture samples in a mesh: its UV Map node's map, or else the mesh's default map. */
export function uvSetFor(mesh: MaterialUvMaps | undefined, uvMap: string | null): number {
  if (!mesh) return 0;
  const found = uvMap === null ? mesh.defaultIndex : mesh.names.indexOf(uvMap);
  return found >= 0 ? found : 0;
}
