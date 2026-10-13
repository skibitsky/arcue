import type { Comment, PartView } from "@arcue/protocol";
import type { SceneDescription, ScenePart } from "@arcue/scene";
import {
  defaultPartView,
  isolationAsVisibility,
  levelFor,
  partShown,
  visibleMeshes,
  withPartVisible,
} from "@arcue/scene";

/**
 * The parts view a comment opens with: the view it stores, or the default view when it stores none, with the part
 * that holds its target shown. A file can hide that part by default after the comment was made, as Blender's eye
 * does, and the comment still shows what it points at.
 */
export function commentPartView(scene: SceneDescription | null, comment: Pick<Comment, "parts" | "target">): PartView {
  const stored = comment.parts ?? defaultPartView();
  const target = comment.target;
  if (!scene || !target) return stored;
  const mesh = scene.nodes.find((node) => node.path === target.mesh)?.mesh ?? null;
  return mesh === null ? stored : withMeshShown(scene.parts, stored, mesh);
}

/**
 * The view with a mesh drawn: its part shown, an isolation of another part ended with what else it shows kept, and
 * the LOD of the mesh's level when the view's LOD draws another level of the part. Sockets draw no mesh.
 */
export function withMeshShown(parts: readonly ScenePart[], view: PartView, mesh: number): PartView {
  if (visibleMeshes(parts, view).has(mesh)) return view;
  const part = parts.find(
    (candidate) => candidate.role !== "socket" && candidate.levels.some((level) => level.meshes.includes(mesh)),
  );
  if (!part) return view;
  const shown = partShown(parts, view, part) ? view : withPartVisible(isolationAsVisibility(parts, view), part, true);
  if (levelFor(part, shown.lod)?.meshes.includes(mesh)) return shown;
  const level = part.levels.find((candidate) => candidate.meshes.includes(mesh));
  return level ? { ...shown, lod: level.level } : shown;
}
