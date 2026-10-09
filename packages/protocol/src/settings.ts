import { z } from "zod";
import { authorSchema } from "./author";

/** How copied prompts and `round.json` state positions: the scene's meters, right-handed, Y up, or Blender's Z up. */
export const coordinateConventionSchema = z.enum(["y-up", "z-up-blender"]);

/** App settings, kept by the core. */
export const settingsSchema = z.object({
  coordinates: coordinateConventionSchema,
  /** The name the core records as the author of what windows do. Without it, nothing names an author. */
  authorName: authorSchema.shape.name.optional(),
});

export type CoordinateConvention = z.output<typeof coordinateConventionSchema>;
export type Settings = z.output<typeof settingsSchema>;
