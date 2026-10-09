import { z } from "zod";
import { partIdSchema } from "./view-state";

/** The name of a model's composition file, which lives in the model's review folder. */
export const COMPOSITION_FILE_NAME = "composition.json";

export const COMPOSITION_VERSION = 1;

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

/**
 * How a file joins a model's view when nobody names its role: a file with clips and no meshes is an animation file;
 * any other file with meshes comes along in place, its bones merging into the model's bones of the same name, so a
 * skinned mesh binds to the model's rig. Null for a file with neither.
 */
export function memberRoleFor(content: { meshes: number; clips: number }): Exclude<MemberRole, "attach"> | null {
  if (content.meshes > 0) return "set";
  return content.clips > 0 ? "animation" : null;
}

/** Whether a file beside the model joins it by its name, "<model stem>@<anything>.fbx", rather than through the composition. */
export function joinsByName(modelName: string, fileName: string): boolean {
  const dot = modelName.lastIndexOf(".");
  const prefix = `${dot > 0 ? modelName.slice(0, dot) : modelName}@`;
  return fileName.startsWith(prefix) && fileName.length > prefix.length && fileName.toLowerCase().endsWith(".fbx");
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
