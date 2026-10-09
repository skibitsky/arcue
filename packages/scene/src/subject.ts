import { MEMBER_SEPARATOR } from "./composition";
import { fileNameOf } from "./image";
import type { Material, TextureRef } from "./material";
import type { SceneDescription } from "./scene";
import type { ImportWarningSubjectKind } from "./source";

/** What a warning is about: its subject, and the composition's file it comes from. */
export interface SubjectRef {
  kind: ImportWarningSubjectKind;
  name: string;
  file?: string | undefined;
}

const TEXTURE_REFS = [
  "baseColorTexture",
  "metallicRoughnessTexture",
  "roughnessTexture",
  "metalnessTexture",
  "normalTexture",
  "occlusionTexture",
  "emissiveTexture",
] as const satisfies readonly (keyof Material)[];

/**
 * The node paths of the meshes a warning's subject covers: a material's meshes, the meshes of the materials that use
 * a texture, the meshes at or under a node or part, or a file's meshes. A clip covers none.
 */
export function subjectMeshes(scene: SceneDescription, subject: SubjectRef): string[] {
  switch (subject.kind) {
    case "material":
      return meshesOfMaterials(scene, new Set([subject.name]));
    case "texture":
      return meshesOfMaterials(scene, materialsUsingTexture(scene, subject));
    case "node":
      return meshesOfNode(scene, subject);
    case "file":
      return meshesOfFile(scene, subject.file);
    case "clip":
      return [];
  }
}

function meshPaths(
  scene: SceneDescription,
  include: (meshIndex: number, path: string, nodeIndex: number) => boolean,
): string[] {
  const paths: string[] = [];
  scene.nodes.forEach((node, index) => {
    if (node.mesh !== null && include(node.mesh, node.path, index)) paths.push(node.path);
  });
  return paths;
}

function meshesOfMaterials(scene: SceneDescription, names: ReadonlySet<string>): string[] {
  const indices = new Set(scene.materials.flatMap((material, index) => (names.has(material.name) ? [index] : [])));
  return meshPaths(scene, (mesh) => scene.meshes[mesh]?.groups.some((group) => indices.has(group.material)) ?? false);
}

/** The materials that use a texture by its file name: those its warning lists, and those that show its image. */
function materialsUsingTexture(scene: SceneDescription, subject: SubjectRef): Set<string> {
  const names = new Set<string>();
  for (const warning of scene.source.warnings) {
    if (warning.subject.kind !== "texture" || warning.subject.name !== subject.name) continue;
    if (warning.file !== subject.file) continue;
    for (const material of warning.materials ?? []) names.add(material);
  }
  const shown = new Set(
    scene.textures.flatMap((texture, index) =>
      fileNameOf(texture.storedPath) === subject.name ||
      (texture.foundPath !== null && fileNameOf(texture.foundPath) === subject.name)
        ? [index]
        : [],
    ),
  );
  for (const material of scene.materials) {
    const refs = TEXTURE_REFS.map((key) => material[key] as TextureRef | null);
    if (refs.some((ref) => (ref ? shown.has(ref.texture) : false))) names.add(material.name);
  }
  return names;
}

function meshesOfNode(scene: SceneDescription, subject: SubjectRef): string[] {
  const prefixed = subject.file === undefined ? null : `${subject.file}${MEMBER_SEPARATOR}${subject.name}`;
  const roots = new Set<number>();
  scene.nodes.forEach((node, index) => {
    if (node.path === subject.name || node.path === prefixed) roots.add(index);
  });
  if (roots.size === 0) {
    const part = scene.parts.find((entry) => entry.id === subject.name || entry.id === prefixed);
    if (part) {
      const meshes = new Set(part.levels.flatMap((level) => level.meshes));
      return meshPaths(scene, (mesh) => meshes.has(mesh));
    }
    scene.nodes.forEach((node, index) => {
      const own =
        subject.file === undefined
          ? !node.path.includes(MEMBER_SEPARATOR)
          : node.path.startsWith(`${subject.file}${MEMBER_SEPARATOR}`);
      if (node.name === subject.name && own) roots.add(index);
    });
  }
  const inside = scene.nodes.map(() => false);
  scene.nodes.forEach((node, index) => {
    inside[index] = roots.has(index) || (node.parent >= 0 && (inside[node.parent] ?? false));
  });
  return meshPaths(scene, (_mesh, _path, index) => inside[index] ?? false);
}

/** A composition's file's meshes, by their "<file>//" prefix, or the model's own meshes without a file. */
function meshesOfFile(scene: SceneDescription, file: string | undefined): string[] {
  if (file === undefined) return meshPaths(scene, (_mesh, path) => !path.includes(MEMBER_SEPARATOR));
  return meshPaths(scene, (_mesh, path) => path.startsWith(`${file}${MEMBER_SEPARATOR}`));
}
