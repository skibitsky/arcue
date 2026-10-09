import type { Clip } from "./clip";
import type { Material, Texture } from "./material";
import type { Bounds } from "./math";
import type { Mesh } from "./mesh";
import type { SceneNode } from "./node";
import type { ScenePart } from "./parts";
import type { Skeleton } from "./skeleton";
import type { SourceInfo } from "./source";

/**
 * One imported file as plain data. Large arrays are typed arrays, so the description
 * can be posted between processes and its buffers transferred. No typed array may view WebAssembly memory:
 * importers copy data out of the parser's memory, because that memory can grow or be freed, and it cannot be transferred.
 */
export interface SceneDescription {
  source: SourceInfo;
  nodes: SceneNode[];
  meshes: Mesh[];
  skeletons: Skeleton[];
  materials: Material[];
  textures: Texture[];
  clips: Clip[];
  /** The meshes grouped into parts by `describeParts`: LOD groups, collision helpers, sockets and plain meshes. */
  parts: ScenePart[];
  /** Rest-pose bounds in scene space of the meshes a default view draws, from `defaultViewBounds`. */
  bounds: Bounds;
}

/** The distinct buffers behind every typed array in the scene, for a transfer list. */
export function collectTransferables(scene: SceneDescription): ArrayBuffer[] {
  const buffers = new Set<ArrayBuffer>();
  const add = (view: ArrayBufferView | null) => {
    if (view && view.buffer instanceof ArrayBuffer) buffers.add(view.buffer);
  };
  for (const mesh of scene.meshes) {
    add(mesh.positions);
    add(mesh.normals);
    for (const uv of mesh.uvs) add(uv.values);
    add(mesh.colors);
    add(mesh.joints);
    add(mesh.weights);
    add(mesh.indices);
    for (const target of mesh.morphTargets) {
      add(target.positions);
      add(target.normals);
    }
    add(mesh.bindMatrix);
    add(mesh.sourceVertex);
    add(mesh.restPositions);
    if (mesh.skinWeights) {
      add(mesh.skinWeights.offsets);
      add(mesh.skinWeights.joints);
      add(mesh.skinWeights.weights);
    }
  }
  for (const skeleton of scene.skeletons) add(skeleton.inverseBindMatrices);
  for (const texture of scene.textures) add(texture.bytes);
  for (const clip of scene.clips) {
    add(clip.keyTimes);
    for (const track of clip.tracks) {
      add(track.times);
      add(track.values);
    }
  }
  return [...buffers];
}
