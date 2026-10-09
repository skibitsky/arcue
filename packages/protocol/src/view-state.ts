import { z } from "zod";
import { cameraAnchorSchema, frameRangeSchema, indexSchema } from "./anchors";

export const displayModeSchema = z.enum(["lit", "clay", "wireframe"]);

/** A part's stable id: the node path of its mesh, LOD group or socket, as `ScenePart.id` gives it. */
export const partIdSchema = z.string().min(1);

/**
 * Which parts a view shows. `hidden` and `shown` list only parts whose visibility differs from their default: models
 * show and collision helpers hide by default. An isolated part is the only part shown. `lod` picks the LOD level; a
 * part without that level shows its nearest lower one.
 */
export const partViewSchema = z.object({
  hidden: z.array(partIdSchema),
  shown: z.array(partIdSchema),
  isolated: partIdSchema.nullable(),
  lod: indexSchema,
});

/** What a window shows for one asset. The core keeps the latest report so a window can be rebuilt after a crash. */
export const viewStateSchema = z.object({
  camera: cameraAnchorSchema,
  /** The clip's name in the file, or null for the rest pose. */
  clip: z.string().min(1).nullable(),
  frame: indexSchema,
  range: frameRangeSchema.nullable(),
  display: z.object({
    mode: displayModeSchema,
    skeleton: z.boolean(),
  }),
  parts: partViewSchema.default(() => ({ hidden: [], shown: [], isolated: null, lod: 0 })),
  /** The outline drawer is open. It shows only for models with parts or added files to list. */
  outlineOpen: z.boolean().default(false),
});

export type DisplayMode = z.output<typeof displayModeSchema>;
export type PartView = z.output<typeof partViewSchema>;
export type ViewState = z.output<typeof viewStateSchema>;
