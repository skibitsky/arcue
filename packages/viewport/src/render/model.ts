import type { DisplayMode } from "@arcue/protocol";
import type { Clip, Mesh, SceneDescription } from "@arcue/scene";
import type { Material, MeshBasicMaterial, MeshStandardMaterial, Side } from "three";
import {
  Bone,
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  FrontSide,
  Group,
  Matrix4,
  Object3D,
  SkinnedMesh,
  Mesh as ThreeMesh,
  Skeleton as ThreeSkeleton,
} from "three";
import type { Pose } from "../math/pose";
import { createPose, poseAt, worldMatrices } from "../math/pose";
import type { TriangleAdjacency } from "../math/regions";
import { triangleAdjacency } from "../math/regions";
import type { MeshPose, PosedMesh } from "../math/skinning";
import { jointMatrices, meshSkinMatrices, PosedVertexCache, representativeVertices } from "../math/skinning";
import { clayMaterial, idMaterial, litMaterial, wireFillMaterial, wireLineMaterial, withRegionTint } from "./materials";
import type { Palette } from "./palette";
import { RegionTint } from "./region-tint";
import type { DecodedImage } from "./textures";
import { decodeTexture } from "./textures";

/** Objects on this layer are drawn only by the ID pass. */
export const PICK_LAYER = 1;

type DrawMesh = ThreeMesh | SkinnedMesh;

export interface MeshRuntime {
  index: number;
  node: number;
  path: string;
  data: Mesh;
  triangleCount: number;
  display: DrawMesh;
  pick: DrawMesh;
  /** The ID pass material under lit display: it cuts out the alpha-mask texels the lit materials cut out. */
  pickLit: Material | Material[];
  /** The ID pass material under clay and wireframe display, which draw every triangle solid. */
  pickSolid: Material;
  wire: DrawMesh;
  lit: Material[];
  clay: MeshStandardMaterial;
  wireFill: MeshStandardMaterial;
  wireLines: MeshBasicMaterial;
  tint: RegionTint;
  /** Some material of the mesh is double-sided, so either side of a triangle is visible surface. */
  doubleSided: boolean;
  /** The mesh's node has a negative determinant in the current pose, so the GPU flips which winding faces front. */
  mirrored: boolean;
  representatives: Int32Array;
  posed: PosedVertexCache;
  /** The mesh as the CPU poses it: without skin influences when it renders rigid. */
  posedMesh: PosedMesh;
  pose: MeshPose;
  adjacency(): TriangleAdjacency;
}

export class Model {
  readonly root = new Group();
  readonly meshes: MeshRuntime[] = [];
  readonly meshByPath = new Map<string, MeshRuntime>();
  readonly pose: Pose;
  readonly worlds: Float64Array;
  private readonly objects: Object3D[];
  private readonly skinMatrices: (Float64Array | null)[];
  private readonly jointScratch: Float64Array[];
  private readonly geometries: BufferGeometry[] = [];
  private readonly materials: Material[] = [];
  readonly scene: SceneDescription;
  private readonly images: (DecodedImage | null)[];

  private constructor(scene: SceneDescription, images: (DecodedImage | null)[], palette: Palette, anisotropy: number) {
    this.scene = scene;
    this.images = images;
    this.pose = createPose(scene);
    this.worlds = worldMatrices(scene.nodes, this.pose);
    const jointNodes = new Set(scene.skeletons.flatMap((skeleton) => skeleton.joints));
    this.objects = scene.nodes.map((node, index) => {
      const object = node.kind === "bone" || jointNodes.has(index) ? new Bone() : new Object3D();
      object.name = node.name;
      return object;
    });
    scene.nodes.forEach((node, index) => {
      const object = this.objects[index];
      if (!object) return;
      const parent = node.parent >= 0 ? this.objects[node.parent] : this.root;
      (parent ?? this.root).add(object);
    });
    this.jointScratch = scene.skeletons.map((skeleton) => new Float64Array(skeleton.joints.length * 16));
    const skeletons = scene.skeletons.map(
      (skeleton) =>
        new ThreeSkeleton(
          skeleton.joints.map((node) => this.objects[node]).filter((object): object is Bone => object instanceof Bone),
          skeleton.joints.map((_, joint) => new Matrix4().fromArray(skeleton.inverseBindMatrices, joint * 16)),
        ),
    );
    this.skinMatrices = scene.meshes.map(() => null);
    scene.nodes.forEach((node, nodeIndex) => {
      if (node.mesh === null) return;
      const mesh = scene.meshes[node.mesh];
      const parent = this.objects[nodeIndex];
      if (!mesh || !parent || this.meshByPath.has(node.path)) return;
      const runtime = this.buildMesh(node.mesh, nodeIndex, node.path, mesh, skeletons, palette, anisotropy);
      parent.add(runtime.display, runtime.pick, runtime.wire);
      this.meshes.push(runtime);
      this.meshByPath.set(node.path, runtime);
    });
    this.applyPose(null, 0);
  }

  static async build(scene: SceneDescription, palette: Palette, anisotropy: number): Promise<Model> {
    const images = await Promise.all(scene.textures.map((texture) => decodeTexture(texture)));
    return new Model(scene, images, palette, anisotropy);
  }

  private buildMesh(
    index: number,
    node: number,
    path: string,
    mesh: Mesh,
    skeletons: ThreeSkeleton[],
    palette: Palette,
    anisotropy: number,
  ): MeshRuntime {
    const triangleCount = Math.floor(mesh.indices.length / 3);
    const geometry = deindexedGeometry(mesh);
    this.geometries.push(geometry);
    const tint = new RegionTint(triangleCount);
    const slots = new Map<number, number>();
    const groups = mesh.groups.length > 0 ? mesh.groups : [{ start: 0, triangleCount, material: -1 }];
    for (const group of groups) {
      if (!slots.has(group.material)) slots.set(group.material, slots.size);
      geometry.addGroup(group.start * 3, group.triangleCount * 3, slots.get(group.material) ?? 0);
    }
    const lit = [...slots.keys()].map((material) =>
      withRegionTint(
        litMaterial({
          material: this.scene.materials[material],
          images: this.images,
          uvSetCount: mesh.uvs.length,
          anisotropy,
          fallbackColor: palette.textMuted,
        }),
        tint.uniforms,
      ),
    );
    const side: Side = lit.some((material) => material.side === DoubleSide) ? DoubleSide : FrontSide;
    const clay = withRegionTint(clayMaterial(palette, side), tint.uniforms);
    const wireFill = withRegionTint(wireFillMaterial(palette, side), tint.uniforms);
    const wireLines = wireLineMaterial(palette);
    const pickSolid = idMaterial(index, side);
    const pickCutouts = lit.some((material) => material.alphaTest > 0)
      ? lit.map((material) => idMaterial(index, side, material))
      : null;
    this.materials.push(...lit, clay, wireFill, wireLines, pickSolid, ...(pickCutouts ?? []));

    const skeleton = mesh.skeleton === null ? undefined : skeletons[mesh.skeleton];
    const skinned = skeleton !== undefined && mesh.bindMatrix !== null && mesh.joints !== null && mesh.weights !== null;
    const bindMatrix = new Matrix4();
    if (mesh.bindMatrix) bindMatrix.fromArray(mesh.bindMatrix);
    const create = (material: Material | Material[]): DrawMesh => {
      if (!skinned || !skeleton) return new ThreeMesh(geometry, material);
      const object = new SkinnedMesh(geometry, material);
      object.bind(skeleton, bindMatrix);
      object.frustumCulled = false;
      return object;
    };
    const display = create(lit);
    display.castShadow = true;
    const pickLit = pickCutouts ?? pickSolid;
    const pick = create(pickLit);
    pick.layers.set(PICK_LAYER);
    const wire = create(wireLines);
    wire.visible = false;
    wire.renderOrder = 1;
    display.name = mesh.name;

    const representatives = representativeVertices(mesh.sourceVertex, mesh.sourceVertexCount);
    const posedMesh: PosedMesh = skinned ? mesh : { ...mesh, joints: null, weights: null };
    let adjacency: TriangleAdjacency | null = null;
    const pose: MeshPose = {
      skin: null,
      bindMatrix: mesh.bindMatrix,
      nodeWorld: this.worlds.subarray(node * 16, node * 16 + 16),
      morphWeights: this.pose.morphWeights[index] ?? new Float32Array(),
    };
    return {
      index,
      node,
      path,
      data: mesh,
      triangleCount,
      display,
      pick,
      pickLit,
      pickSolid,
      wire,
      lit,
      clay,
      wireFill,
      wireLines,
      tint,
      doubleSided: side === DoubleSide,
      mirrored: false,
      representatives,
      posedMesh,
      posed: new PosedVertexCache(posedMesh),
      pose,
      adjacency: () => {
        adjacency ??= triangleAdjacency(mesh);
        return adjacency;
      },
    };
  }

  /** Poses every node and morph weight for the GPU, and refreshes the CPU pose that pins, picking and painting use. */
  applyPose(clip: Clip | null, seconds: number): void {
    poseAt(this.scene, clip, seconds, this.pose);
    worldMatrices(this.scene.nodes, this.pose, this.worlds);
    this.objects.forEach((object, index) => {
      object.position.fromArray(this.pose.translations, index * 3);
      object.quaternion.fromArray(this.pose.rotations, index * 4);
      object.scale.fromArray(this.pose.scales, index * 3);
    });
    const joints = this.scene.skeletons.map((skeleton, index) =>
      jointMatrices(skeleton, this.worlds, this.jointScratch[index]),
    );
    for (const runtime of this.meshes) {
      const skeletonIndex = runtime.data.skeleton;
      const jointMats = skeletonIndex === null ? undefined : joints[skeletonIndex];
      let skin: Float64Array | null = null;
      if (runtime.posedMesh.joints && jointMats && runtime.data.bindMatrix) {
        const previous = this.skinMatrices[runtime.index];
        skin = meshSkinMatrices(
          jointMats,
          runtime.data.bindMatrix,
          previous && previous.length === jointMats.length ? previous : undefined,
        );
        this.skinMatrices[runtime.index] = skin;
      }
      runtime.pose.skin = skin;
      runtime.mirrored = determinant3(this.worlds, runtime.node * 16) < 0;
      runtime.posed.setPose(runtime.pose);
      const weights = runtime.pose.morphWeights;
      for (const object of [runtime.display, runtime.pick, runtime.wire]) {
        const influences = object.morphTargetInfluences;
        if (!influences) continue;
        for (let i = 0; i < influences.length; i++) influences[i] = weights[i] ?? 0;
      }
    }
    this.root.updateMatrixWorld(true);
  }

  setDisplayMode(mode: DisplayMode): void {
    for (const runtime of this.meshes) {
      runtime.display.material = mode === "lit" ? runtime.lit : mode === "clay" ? runtime.clay : runtime.wireFill;
      runtime.pick.material = mode === "lit" ? runtime.pickLit : runtime.pickSolid;
      runtime.wire.visible = mode === "wireframe";
    }
  }

  dispose(): void {
    this.root.removeFromParent();
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) {
      if ("map" in material) {
        for (const key of ["map", "emissiveMap", "normalMap", "aoMap", "roughnessMap", "metalnessMap"] as const) {
          const value: unknown = (material as MeshStandardMaterial)[key];
          if (value && typeof value === "object" && "dispose" in value && typeof value.dispose === "function") {
            value.dispose();
          }
        }
      }
      material.dispose();
    }
    for (const runtime of this.meshes) {
      runtime.tint.dispose();
      if (runtime.display instanceof SkinnedMesh) runtime.display.skeleton.dispose();
    }
    for (const image of this.images) image?.close();
  }
}

/**
 * Three corners per triangle, none shared, so each triangle can carry its own number for the ID pass and the region
 * tint. Display, wireframe and ID pass all draw this one geometry.
 */
export function deindexedGeometry(mesh: Mesh): BufferGeometry {
  const indices = mesh.indices;
  const corners = Math.floor(indices.length / 3) * 3;
  const gather = <T extends Float32Array | Uint16Array>(source: T, size: number, create: (length: number) => T): T => {
    const out = create(corners * size);
    for (let corner = 0; corner < corners; corner++) {
      const vertex = indices[corner] ?? 0;
      for (let k = 0; k < size; k++) out[corner * size + k] = source[vertex * size + k] ?? 0;
    }
    return out;
  };
  const floats = (length: number) => new Float32Array(length);
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(gather(mesh.positions, 3, floats), 3));
  geometry.setAttribute("normal", new BufferAttribute(gather(mesh.normals, 3, floats), 3));
  const uvNames = ["uv", "uv1", "uv2", "uv3"];
  mesh.uvs.slice(0, uvNames.length).forEach((set, index) => {
    geometry.setAttribute(uvNames[index] ?? "uv", new BufferAttribute(gather(set.values, 2, floats), 2));
  });
  if (mesh.joints && mesh.weights) {
    geometry.setAttribute(
      "skinIndex",
      new BufferAttribute(
        gather(mesh.joints, 4, (n) => new Uint16Array(n)),
        4,
      ),
    );
    geometry.setAttribute("skinWeight", new BufferAttribute(gather(mesh.weights, 4, floats), 4));
  }
  const triangle = new Float32Array(corners);
  for (let corner = 0; corner < corners; corner++) triangle[corner] = Math.floor(corner / 3);
  geometry.setAttribute("triangle", new BufferAttribute(triangle, 1));
  if (mesh.morphTargets.length > 0) {
    geometry.morphTargetsRelative = true;
    geometry.morphAttributes.position = mesh.morphTargets.map(
      (target) => new BufferAttribute(gather(target.positions, 3, floats), 3),
    );
    const normals = mesh.morphTargets.map((target) => target.normals);
    if (normals.every((values) => values !== null)) {
      geometry.morphAttributes.normal = normals.map(
        (values) => new BufferAttribute(gather(values ?? new Float32Array(), 3, floats), 3),
      );
    }
  }
  return geometry;
}

function determinant3(m: Float64Array, offset: number): number {
  const at = (index: number) => m[offset + index] ?? 0;
  return (
    at(0) * (at(5) * at(10) - at(9) * at(6)) -
    at(4) * (at(1) * at(10) - at(9) * at(2)) +
    at(8) * (at(1) * at(6) - at(5) * at(2))
  );
}
