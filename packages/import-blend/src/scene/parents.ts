import type { Quat, Vec3 } from "@arcue/scene";
import type { BlendStruct } from "../blend/file";
import { isLinked } from "../blend/ids";
import type { Mat4 } from "../math";
import {
  compose,
  identity,
  invert,
  mat4From,
  multiply,
  multiplyAll,
  quatMultiply,
  transformDirection,
  transformPoint,
  translation,
} from "../math";
import type { Bone } from "./armature";
import { ArmatureReadError, BoneFlag, readBones } from "./armature";
import { ObjectType, ParentType, parentTypeOf } from "./objects";
import { objectBasis, objectValues } from "./transforms";

/** A mesh object's vertices as Arcue shows them at rest: before modifiers, with its shape keys at their weights. */
export interface ShownVertices {
  count: number;
  /** The local position of a vertex below `count`. */
  at(index: number): Vec3;
}

/** The vertices of a mesh object, or null where Arcue does not know them. */
export type ParentVertices = (parent: BlendStruct) => ShownVertices | null;

export function headTailFactor(object: BlendStruct): number {
  return object.has("parent_bone_head_tail_factor") ? object.number("parent_bone_head_tail_factor") : 1;
}

/** Whether a child of the bone follows only its channel transform, which is identity at rest, as Blender's option. */
export function relativeParent(bone: Bone): boolean {
  return (bone.flag & BoneFlag.relativeParenting) !== 0;
}

/** The armature's bones, or none when its bone lists are damaged. */
function readableBones(data: BlendStruct): Bone[] {
  try {
    return readBones(data);
  } catch (error) {
    if (error instanceof ArmatureReadError) return [];
    throw error;
  }
}

/** The rest matrix of the bone an object is parented to, moved to the bone's tail, in armature space. */
function boneParentMatrix(object: BlendStruct, armature: BlendStruct): Mat4 {
  const data = armature.deref("data");
  const name = object.string("parsubstr");
  const bone = data ? readableBones(data).find((candidate) => candidate.name === name) : undefined;
  if (!bone || relativeParent(bone)) return identity();
  return multiply(bone.rest, translation(0, bone.length * headTailFactor(object), 0));
}

/** Whether the object follows one vertex or three of its parent. */
export function isVertexParented(object: BlendStruct): boolean {
  const type = parentTypeOf(object);
  return type === ParentType.vertex || type === ParentType.vertices;
}

/** Parent types whose points Blender's vertex parenting follows, of which Arcue reads only a mesh's. */
const HAS_POINTS: ReadonlySet<number> = new Set([
  ObjectType.mesh,
  ObjectType.curve,
  ObjectType.surface,
  ObjectType.lattice,
]);

/** Whether Blender places a vertex-parented child by points of the parent that Arcue does not read. */
export function readsNoParentPoints(parent: BlendStruct): boolean {
  const type = parent.number("type");
  return HAS_POINTS.has(type) && type !== ObjectType.mesh;
}

/**
 * The points a vertex-parented object follows, as Blender's `give_parvert` finds them in a mesh it shows: each vertex's
 * local position, or the origin for a vertex the mesh does not have. Null for a parent whose points Arcue does not know.
 */
export function parentPoints(object: BlendStruct, parent: BlendStruct, vertices: ParentVertices): Vec3[] | null {
  if (parent.number("type") !== ObjectType.mesh) return null;
  const shown = vertices(parent);
  if (!shown) return null;
  return ["par1", "par2", "par3"].map((field) => {
    const index = object.number(field);
    return index >= 0 && index < shown.count ? shown.at(index) : [0, 0, 0];
  });
}

function subtract(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

/** A unit vector, or zero for a vector too short to normalize, as Blender's `normalize_v3`. */
function unit(v: Vec3): Vec3 {
  const squared = v[0] * v[0] + v[1] * v[1] + v[2] * v[2];
  if (!(squared > 1e-35)) return [0, 0, 0];
  const length = Math.sqrt(squared);
  return [v[0] / length, v[1] / length, v[2] / length];
}

/**
 * Blender's `ob_parvert3`: the frame of three points, turned by `tri_to_quat` so Z is the triangle's normal and X runs
 * along its first edge, at the points' centroid.
 */
function triangleFrame(a: Vec3, b: Vec3, c: Vec3): Mat4 {
  const ab = subtract(a, b);
  const bc = subtract(b, c);
  const normal = unit([ab[1] * bc[2] - ab[2] * bc[1], ab[2] * bc[0] - ab[0] * bc[2], ab[0] * bc[1] - ab[1] * bc[0]]);
  const axis = unit([normal[1], -normal[0], 0]);
  if (axis[0] === 0 && axis[1] === 0) axis[0] = 1;
  const tilt = -0.5 * Math.acos(Math.min(Math.max(normal[2], -1), 1));
  const toNormal: Quat = [axis[0] * Math.sin(tilt), axis[1] * Math.sin(tilt), 0, Math.cos(tilt)];
  const tilted = compose({ translation: [0, 0, 0], rotation: toNormal, scale: [1, 1, 1] });
  const edge = transformDirection(invert(tilted), ...subtract(b, a));
  const along = unit([edge[0], edge[1], 0]);
  const turn = 0.5 * Math.atan2(along[1], along[0]);
  return compose({
    translation: [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3],
    rotation: quatMultiply(toNormal, [0, 0, Math.sin(turn), Math.cos(turn)]),
    scale: [1, 1, 1],
  });
}

/**
 * The matrix between a vertex-parented object's parent and its parent inverse, from Blender's
 * `BKE_object_get_parent_matrix`: a move to the vertex for one vertex, which drops the parent's rotation and scale,
 * or the frame of three. Without the points, the parent's origin and its frame.
 */
export function vertexParentPart(object: BlendStruct, points: readonly Vec3[] | null, parentWorld: Mat4): Mat4 {
  const [a = [0, 0, 0], b = [0, 0, 0], c = [0, 0, 0]] = points ?? [];
  if (parentTypeOf(object) === ParentType.vertex) {
    const [x, y, z] = transformPoint(parentWorld, ...a);
    return multiply(invert(parentWorld), translation(x, y, z));
  }
  return points ? triangleFrame(a, b, c) : identity();
}

/** Rest world matrices in Blender's space of any object, shown or not, with every bone at rest. */
export class WorldMatrices {
  readonly #cache = new Map<number, Mat4>();
  readonly #vertices: ParentVertices;

  constructor(vertices: ParentVertices) {
    this.#vertices = vertices;
  }

  /** The object's world matrix, worked out up its parent chain without recursion; a parent cycle stops at the start. */
  of(object: BlendStruct): Mat4 {
    const chain: BlendStruct[] = [];
    const onChain = new Set<number>();
    let above = identity();
    for (let next: BlendStruct | null = object; next; next = parentOf(next)) {
      const cached = this.#cache.get(next.offset);
      if (cached) {
        above = cached;
        break;
      }
      if (onChain.has(next.offset)) break;
      onChain.add(next.offset);
      chain.push(next);
    }
    for (const current of chain.reverse()) {
      const parent = parentOf(current);
      above = multiplyAll(
        parent ? this.#parentMatrix(current, parent, above) : identity(),
        mat4From(current.numbers("parentinv")),
        objectBasis(objectValues(current)),
      );
      this.#cache.set(current.offset, above);
    }
    return above;
  }

  /** The world matrix of what the object is parented to: a bone's tail for a bone parent, its vertices for a vertex one. */
  parentOf(object: BlendStruct): Mat4 {
    const parent = parentOf(object);
    return parent ? this.#parentMatrix(object, parent, this.of(parent)) : identity();
  }

  #parentMatrix(object: BlendStruct, parent: BlendStruct, parentWorld: Mat4): Mat4 {
    if (parentTypeOf(object) === ParentType.bone) return multiply(parentWorld, boneParentMatrix(object, parent));
    if (!isVertexParented(object)) return parentWorld;
    const points = parentPoints(object, parent, this.#vertices);
    if (parentTypeOf(object) === ParentType.vertex) {
      const [x, y, z] = transformPoint(parentWorld, ...(points?.[0] ?? [0, 0, 0]));
      return translation(x, y, z);
    }
    return multiply(parentWorld, vertexParentPart(object, points, parentWorld));
  }
}

/** The object's parent, or null for none or one that another file holds. */
function parentOf(object: BlendStruct): BlendStruct | null {
  const parent = object.deref("parent");
  return parent && !isLinked(parent) ? parent : null;
}
