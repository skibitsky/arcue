import type { Mesh, SceneDescription, TopologyFingerprint } from "@arcue/scene";
import { sameTopology, splitMemberPath, visibleMeshes } from "@arcue/scene";
import { z } from "zod";
import { partIdSchema } from "./view-state";

/** The name of a model's composition file, which lives in the model's review folder. */
export const COMPOSITION_FILE_NAME = "composition.json";

export const COMPOSITION_VERSION = 1;

/** Extensions of the model files Arcue opens: FBX files, and Blender's own .blend files. */
export const MODEL_FILE_EXTENSIONS: readonly string[] = [".fbx", ".blend"];

/** Extensions of the images a composition may name and an importer may read beside a model. */
export const IMAGE_FILE_EXTENSIONS: readonly string[] = [
  ".png",
  ".jpg",
  ".jpeg",
  ".tga",
  ".tif",
  ".tiff",
  ".bmp",
  ".dds",
  ".exr",
  ".hdr",
  ".webp",
];

/** How a file joins a model's view: its clips, its nodes on a bone, or its nodes in place. */
export const memberRoleSchema = z.enum(["animation", "attach", "set"]);

export type MemberRole = z.output<typeof memberRoleSchema>;

/** The roles a file takes without a bone: its clips bind to the model's bones, or its nodes come along in place. */
export const fileRoleSchema = memberRoleSchema.exclude(["attach"]);

export type FileRole = z.output<typeof fileRoleSchema>;

/** What a file holds that decides how it joins a model's view. */
export interface MemberContent {
  meshes: number;
  clips: number;
  /** Whether most bones its clips key are the model's bones, as `keysModelBones` tells. */
  keysModelBones: boolean;
  /** Whether it animates the model, as `animatesModel` tells. */
  animatesModel: boolean;
}

/**
 * How a file joins a model's view when nobody names its role, and every role it can take, that one first; null for a
 * file with neither meshes nor clips. A file with clips is an animation file when it has no meshes, or when it
 * animates the model, as a Blender animation file that keeps a copy of the character does. Any other file with meshes
 * comes along in place, its bones merging into the model's bones of the same name, so a skinned mesh binds to the
 * model's rig. A file with meshes can always come along in place, and one whose clips key the model's bones can always
 * be an animation file.
 */
export function memberRoles(content: MemberContent): { role: FileRole; roles: FileRole[] } | null {
  const set = content.meshes > 0;
  const animation = content.clips > 0 && (!set || content.keysModelBones || content.animatesModel);
  if (!set && !animation) return null;
  const role: FileRole = animation && (!set || content.animatesModel) ? "animation" : "set";
  const roles: FileRole[] = [role];
  if (animation && role !== "animation") roles.push("animation");
  if (set && role !== "set") roles.push("set");
  return { role, roles };
}

type FileMeshes = Pick<SceneDescription, "nodes" | "parts"> & {
  meshes: readonly Pick<Mesh, "topology" | "skeleton">[];
};

interface OwnMesh {
  name: string;
  topology: TopologyFingerprint;
  skinned: boolean;
  /**
   * Whether the file shows the mesh when it opens, at the most detailed level: Blender's eye and its Wire and Bounds
   * displays hide a mesh, and so do collision helpers.
   */
  shown: boolean;
}

/** The meshes on a file's own nodes, leaving out those that another file of its composition brings. */
function ownMeshes(scene: FileMeshes): OwnMesh[] {
  const shown = visibleMeshes(scene.parts);
  const meshes: OwnMesh[] = [];
  for (const node of scene.nodes) {
    if (node.mesh === null || splitMemberPath(node.path).file !== null) continue;
    const mesh = scene.meshes[node.mesh];
    if (!mesh) continue;
    meshes.push({
      name: node.name,
      topology: mesh.topology,
      skinned: mesh.skeleton !== null,
      shown: shown.has(node.mesh),
    });
  }
  return meshes;
}

function hasCopy(mesh: OwnMesh, among: readonly OwnMesh[]): boolean {
  return among.some((other) => other.name === mesh.name || sameTopology(other.topology, mesh.topology));
}

/**
 * Whether most bones a file's clips key are the model's own bones by name, which is how a composition binds them.
 * Tracks that only hold the file's pose do not count.
 */
export function keysModelBones(
  member: Pick<SceneDescription, "nodes" | "clips">,
  model: Pick<SceneDescription, "nodes">,
): boolean {
  const bones = new Set<string>();
  for (const node of model.nodes) {
    if (node.kind === "bone" && splitMemberPath(node.path).file === null) bones.add(node.name);
  }
  const keyed = new Set<string>();
  for (const clip of member.clips) {
    for (const track of clip.tracks) {
      const node = member.nodes[track.node];
      if (node?.kind === "bone" && track.held !== true) keyed.add(node.name);
    }
  }
  let matched = 0;
  for (const name of keyed) if (bones.has(name)) matched++;
  return matched * 2 > keyed.size;
}

/**
 * Whether a file with clips holds animation for a model rather than more to show with it. Its clips key the model's
 * bones, and its meshes copy the model's, each by name or topology: every mesh it shows is a copy of one of the
 * model's, or it holds a copy of every mesh the model shows and its other meshes are rigid, such as a floor or a prop.
 * Meshes it hides, such as a rig's bone shapes, do not count. An outfit made on the model's rig brings a skinned mesh
 * of its own, so it comes along in place even when the file keeps a copy of the model.
 */
export function animatesModel(member: FileMeshes & Pick<SceneDescription, "clips">, model: FileMeshes): boolean {
  if (!keysModelBones(member, model)) return false;
  const theirs = ownMeshes(member);
  const ours = ownMeshes(model);
  const extra = theirs.filter((mesh) => mesh.shown && !hasCopy(mesh, ours));
  if (extra.length === 0) return true;
  const shown = ours.filter((mesh) => mesh.shown);
  return shown.length > 0 && shown.every((mesh) => hasCopy(mesh, theirs)) && extra.every((mesh) => !mesh.skinned);
}

/**
 * Whether a file beside the model joins it by its name, "<model stem>@<anything>" with a model file's extension, such
 * as "Hero@Walk.fbx" or "Hero@Walk.blend", rather than through the composition.
 */
export function joinsByName(modelName: string, fileName: string): boolean {
  const dot = modelName.lastIndexOf(".");
  const prefix = `${dot > 0 ? modelName.slice(0, dot) : modelName}@`;
  const lower = fileName.toLowerCase();
  return (
    fileName.startsWith(prefix) &&
    fileName.length > prefix.length &&
    MODEL_FILE_EXTENSIONS.some((extension) => lower.endsWith(extension))
  );
}

function isRelativeFile(path: string): boolean {
  if (path.includes("\\") || path.startsWith("/") || /^[A-Za-z]:/.test(path)) return false;
  return path.split("/").every((segment) => segment !== "");
}

/** A path relative to the model's folder with "/" separators, such as "Shells.fbx" or "../Textures/Rock.png". */
export const relativeFileSchema = z
  .string()
  .min(1)
  .refine(isRelativeFile, { message: 'Use a path relative to the model\'s folder, with "/" separators.' });

export const textureSlotSchema = z.enum(["baseColor", "normal", "roughness", "metalness", "emissive"]);

export const compositionAttachSchema = z.strictObject({
  file: relativeFileSchema,
  /** A node's name or path in the file, which brings its children along. Without it the whole file comes along. */
  node: z.string().min(1).optional(),
  /** A bone's name in the model that the nodes follow. Without it they stay in place, as a set piece. */
  bone: z.string().min(1).optional(),
});

/** Textures by slot, relative to the model's folder. They replace what the model's files say. */
export const materialTexturesSchema = z.strictObject({
  baseColor: relativeFileSchema.optional(),
  normal: relativeFileSchema.optional(),
  roughness: relativeFileSchema.optional(),
  metalness: relativeFileSchema.optional(),
  emissive: relativeFileSchema.optional(),
});

/**
 * A model's composition file: the other files that complete its view, as game pipelines spread one asset over several
 * files. It is `composition.json` in the model's review folder, so its place names the model, and opening the model
 * applies it. Every path is relative to the model's folder. Parts and anchors from the other files carry the file as a
 * prefix on their node paths: "Shells.fbx//Boulder1".
 */
export const compositionFileSchema = z
  .strictObject({
    version: z.literal(COMPOSITION_VERSION),
    /** Files whose clips bind to the model's bones by name. */
    animations: z.array(relativeFileSchema).optional(),
    /** Files, or nodes in them, that follow a bone of the model or stay in place. */
    attach: z.array(compositionAttachSchema).optional(),
    /** Textures by material slot name. */
    materials: z.record(z.string().min(1), materialTexturesSchema).optional(),
    /** Part ids hidden until someone shows them, such as the second of two alternative bodies. */
    hidden: z.array(partIdSchema).optional(),
  })
  .superRefine((composition, ctx) => {
    const issue = (message: string, path: (string | number)[]) => ctx.addIssue({ code: "custom", message, path });
    const seen = (list: readonly string[], what: string, key: string) => {
      const found = new Set<string>();
      list.forEach((entry, index) => {
        if (found.has(entry)) issue(`${what} ${entry} is listed twice.`, [key, index]);
        found.add(entry);
      });
    };
    seen(composition.animations ?? [], "Animation file", "animations");
    seen(
      (composition.attach ?? []).map((entry) =>
        entry.node === undefined ? entry.file : `${entry.file}, node ${entry.node},`,
      ),
      "Attached",
      "attach",
    );
    seen(composition.hidden ?? [], "Part", "hidden");
  });

export type TextureSlotName = z.output<typeof textureSlotSchema>;
export type CompositionAttach = z.output<typeof compositionAttachSchema>;
export type MaterialTextures = z.output<typeof materialTexturesSchema>;
export type CompositionFile = z.output<typeof compositionFileSchema>;
