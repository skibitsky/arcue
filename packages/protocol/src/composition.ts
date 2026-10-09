import { z } from "zod";
import { partIdSchema } from "./view-state";

/** The extension of a composition file, which sits beside its model as "<model stem>.arcue". */
export const COMPOSITION_EXTENSION = ".arcue";

export const COMPOSITION_VERSION = 1;

function isRelativeFile(path: string): boolean {
  if (path.includes("\\") || path.startsWith("/") || /^[A-Za-z]:/.test(path)) return false;
  return path.split("/").every((segment) => segment !== "");
}

/** A path relative to the composition file with "/" separators, such as "Shells.fbx" or "../Textures/Rock.png". */
export const relativeFileSchema = z
  .string()
  .min(1)
  .refine(isRelativeFile, { message: 'Use a path relative to the composition file, with "/" separators.' });

export const textureSlotSchema = z.enum(["baseColor", "normal", "roughness", "metalness", "emissive"]);

export const compositionAttachSchema = z.strictObject({
  file: relativeFileSchema,
  /** A node's name or path in the file, which brings its children along. Without it the whole file comes along. */
  node: z.string().min(1).optional(),
  /** A bone's name in the model that the nodes follow. Without it they stay in place, as a set piece. */
  bone: z.string().min(1).optional(),
});

/** Textures by slot, relative to the composition file. They replace what the model's files say. */
export const materialTexturesSchema = z.strictObject({
  baseColor: relativeFileSchema.optional(),
  normal: relativeFileSchema.optional(),
  roughness: relativeFileSchema.optional(),
  metalness: relativeFileSchema.optional(),
  emissive: relativeFileSchema.optional(),
});

/**
 * A composition file: one view of a model and the other files that complete it, as game pipelines spread one asset
 * over several files. Opening the model applies it; opening the file opens its model with it. Parts and anchors from
 * the other files carry the file, relative to the model's folder, as a prefix on their node paths: "Shells.fbx//Boulder1".
 */
export const compositionFileSchema = z
  .strictObject({
    version: z.literal(COMPOSITION_VERSION),
    /** The model the view is about; its review keeps its comments. */
    model: relativeFileSchema,
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
