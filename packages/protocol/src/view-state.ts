import { z } from "zod";
import { cameraAnchorSchema, frameRangeSchema, indexSchema } from "./anchors";

export const displayModeSchema = z.enum(["lit", "clay", "wireframe"]);

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
});

export type DisplayMode = z.output<typeof displayModeSchema>;
export type ViewState = z.output<typeof viewStateSchema>;
