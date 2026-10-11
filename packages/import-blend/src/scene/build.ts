import type { ImportWarningCode, ImportWarningSubject, Mesh, NodeKind, Skeleton } from "@arcue/scene";
import type { BlendFile, BlendStruct } from "../blend/file";
import { idName, isLinked, linkedDatablocks } from "../blend/ids";
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
import { readBones } from "./armature";
import type { MaterialDraft } from "./materials";
import { defaultMaterial, imageUses, readMaterial } from "./materials";
import type { BuiltMesh, SkinBone } from "./mesh-build";
import { buildMesh, MAX_UV_SETS } from "./mesh-build";
import type { MeshData } from "./mesh-data";
import { MeshReadError, readMeshData } from "./mesh-data";
import { changesPreview, ModifierType, modifierName, modifierType, viewportModifiers } from "./modifiers";
import type { SceneContents, SceneObject } from "./objects";
import {
  ARMATURE_DEFORM_VERTEX_GROUPS,
  collectSceneObjects,
  deformingArmatures,
  instancedCollection,
  ObjectType,
  ParentType,
  UNSHOWN_GEOMETRY,
} from "./objects";
import type { SmoothByAngle } from "./smooth-by-angle";
import { applySmoothByAngle, smoothByAngle } from "./smooth-by-angle";
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
  /** Each bone's pose channel at rest, in the rotation mode the channel uses. */
  rest: TransformValues[];
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
  names: string[];
  defaultIndex: number;
}

export interface BuiltScene {
  nodes: NodeDraft[];
  meshes: Omit<Mesh, "topology">[];
  skeletons: Skeleton[];
  materials: MaterialDraft[];
  /** For each material, the UV maps of the meshes it is drawn on, which all resolve its textures' UV maps alike. */
  materialUvs: MaterialUvMaps[];
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
const ARMATURE_DEFORM_ENVELOPE = 1 << 1;
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

/** The rest matrix of the bone an object is parented to, moved to the bone's tail, in armature space. */
function boneParentMatrix(object: BlendStruct, armature: BlendStruct): Mat4 {
  const data = armature.deref("data");
  const name = object.string("parsubstr");
  const bone = data ? readBones(data).find((candidate) => candidate.name === name) : undefined;
  return bone ? multiply(bone.rest, translation(0, bone.length * headTailFactor(object), 0)) : identity();
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
): void {
  const { object, node } = record;
  const bones = readBones(data);
  const channels = new Map<string, BlendStruct>();
  for (const channel of object.struct.deref("pose")?.list("chanbase") ?? [])
    channels.set(channel.string("name"), channel);
  const boneNodes: number[] = [];
  const rest = bones.map((bone) => {
    const channel = channels.get(bone.name);
    boneNodes.push(nodes.length);
    nodes.push({
      name: bone.name,
      parent: boneNodes[bone.parent] ?? node,
      kind: "bone",
      rest: bone.offset,
      mesh: null,
    });
    return restChannel(channel ? channelValues(channel).rotationMode : "quaternion");
  });
  record.armature = { bones, nodes: boneNodes, rest };
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

/** A node for every object, each armature's bones under it, and an object parented to a bone under that bone. */
function objectNodes(contents: SceneContents, animated: ReadonlySet<string>, warn: Warn) {
  const worlds = new WorldMatrices();
  const nodes: NodeDraft[] = [];
  const objects: ObjectRecord[] = [];
  const byOffset = new Map<number, ObjectRecord>();
  for (const object of contents.objects) {
    const parentRecord = object.parent ? byOffset.get(object.parent.offset) : undefined;
    let parentNode = parentRecord?.node ?? -1;
    let parentPart: Mat4 = parentRecord ? identity() : worlds.parentOf(object.struct);
    const parentBones = parentRecord?.armature;
    if (parentBones && object.parentType === ParentType.bone) {
      const index = parentBones.bones.findIndex((bone) => bone.name === object.parentBone);
      const bone = parentBones.bones[index];
      if (bone) {
        parentNode = parentBones.nodes[index] ?? parentNode;
        parentPart = translation(0, bone.length * headTailFactor(object.struct), 0);
      }
    }
    const parentInverse = mat4From(object.struct.numbers("parentinv"));
    const values = objectValues(object.struct);
    const record: ObjectRecord = { object, node: nodes.length, parentPart, parentInverse, values, armature: null };
    const rest = multiplyAll(parentPart, parentInverse, objectBasis(values));
    nodes.push({ name: object.name, parent: parentNode, kind: "empty", rest, mesh: null });
    if (shearOf(rest) > SHEAR_TOLERANCE) {
      const detail = "Its parent's scale shears it, which the preview drops";
      warn("deform-approximated", object.name, `Shear not shown: ${object.name}`, detail);
    }
    if (object.type === ObjectType.armature && object.data) addArmature(record, object.data, nodes, animated, warn);
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
 * mesh whose UV maps put its textures on other UV sets, since Blender finds a texture's UV map by name in each mesh.
 */
class MaterialTable {
  readonly drafts: MaterialDraft[] = [];
  readonly uvMaps: MaterialUvMaps[] = [];
  /** Names of materials linked from other files, which show as the default material. */
  readonly linked = new Set<string>();
  readonly #read = new Map<number, MaterialDraft>();
  readonly #index = new Map<string, number>();
  readonly #version: number;

  constructor(version: number) {
    this.#version = version;
  }

  indexOf(material: BlendStruct | null, uvMaps: MaterialUvMaps): number {
    if (material && isLinked(material)) this.linked.add(idName(material));
    const usable = material && !isLinked(material) ? material : null;
    let draft = usable ? this.#read.get(usable.offset) : undefined;
    if (usable && !draft) {
      draft = readMaterial(usable, this.#version);
      this.#read.set(usable.offset, draft);
    }
    const sets = draft ? imageUses(draft).map((use) => uvSetFor(uvMaps, use.uvMap)) : [];
    const key = `${usable?.offset ?? "default"}:${sets.join(",")}`;
    const known = this.#index.get(key);
    if (known !== undefined) return known;
    this.#index.set(key, this.drafts.length);
    this.drafts.push(draft ?? defaultMaterial());
    this.uvMaps.push(uvMaps);
    return this.drafts.length - 1;
  }
}

/** The material in each slot: the object's own where the slot links to the object, else the mesh's. */
function slotMaterials(file: BlendFile, object: BlendStruct, data: MeshData): (slot: number) => BlendStruct | null {
  const objectSlots = Math.max(object.number("totcol"), 0);
  const objectMaterials = object.pointers("mat", objectSlots);
  const links = object.target("matbits");
  const linkBytes = links ? file.bytesOf(links) : new Uint8Array(0);
  return (slot) => {
    if ((linkBytes[slot] ?? 0) === 0) return data.materials[slot] ?? null;
    return file.first(object.resolve(objectMaterials[slot] ?? 0n));
  };
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
  if ((first.flags & ARMATURE_DEFORM_ENVELOPE) !== 0) {
    warn("deform-approximated", object.name, `Envelopes not used: ${object.name}`, "Only vertex groups deform it");
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
}

function sameValues(a: Float32Array, b: Float32Array): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/** Reads the active scene of a .blend file into nodes, meshes, skeletons and material drafts. */
export function buildScene(file: BlendFile, animated: ReadonlySet<string> = new Set()): BuiltScene {
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

  const materials = new MaterialTable(file.version);
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
    let data: MeshData;
    try {
      data = readMeshData(
        file,
        object.data,
        object.struct.list("defbase").map((group) => group.string("name")),
      );
    } catch (error) {
      if (!(error instanceof MeshReadError)) throw error;
      warn("invalid-data", object.name, `Mesh not read: ${object.name}`, error.message);
      continue;
    }
    const smoothing = smoothByAngle(object.struct);
    modifierWarnings(object, smoothing, warn);
    if (data.faceCount === 0) continue;
    if (data.absoluteKeys) {
      warn(
        "deform-approximated",
        object.name,
        `Absolute shape keys not shown: ${object.name}`,
        "Shown in its basis shape",
      );
    }
    if (smoothing) data = applySmoothByAngle(data, smoothing);
    const slotCount = Math.max(object.struct.number("totcol"), data.materials.length);
    const bones = skinBones(object, byOffset, warn);
    const built = buildMesh(data, { conversion, slotCount, skinBones: bones, meshNode: record.node });
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
    const restPositions = new Float32Array(data.vertexCount * 3);
    const placement = multiply(bind, conversion);
    for (let v = 0; v < data.vertexCount; v++) {
      const [x = 0, y = 0, z = 0] = data.positions.subarray(v * 3, v * 3 + 3);
      restPositions.set(transformPoint(placement, x, y, z), v * 3);
    }
    const slotMaterial = slotMaterials(file, object.struct, data);
    const uvMaps: MaterialUvMaps = {
      names: built.uvs.map((uv) => uv.name),
      defaultIndex: data.defaultUv < built.uvs.length ? data.defaultUv : 0,
    };
    const groups = built.groups.map((group) => ({
      ...group,
      material: materials.indexOf(slotMaterial(group.material), uvMaps),
    }));

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
      morphTargets: built.morphTargets,
      sourceVertex: built.sourceVertex,
      sourceVertexCount: built.sourceVertexCount,
      restPositions,
      skinWeights: built.skin?.source ?? null,
    });
    meshRecords.push({
      node: record.node,
      object,
      morphKeys: built.morphKeys,
      morphDefaults: built.morphTargets.map((target) => target.defaultWeight),
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

  const linkedActions = linkedDatablocks(file, "AC").map(idName);
  const linked = [
    contents.linkedObjects.length > 0 ? `objects ${contents.linkedObjects.join(", ")}` : "",
    materials.linked.size > 0 ? `materials ${[...materials.linked].join(", ")}` : "",
    linkedActions.length > 0 ? `actions ${linkedActions.join(", ")}` : "",
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
