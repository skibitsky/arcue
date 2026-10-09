import { z } from "zod";

/** How copied prompts and `round.json` state positions: the scene's meters, right-handed, Y up, or Blender's Z up. */
export const coordinateConventionSchema = z.enum(["y-up", "z-up-blender"]);

/** App settings, kept by the core. */
export const settingsSchema = z.object({
  coordinates: coordinateConventionSchema,
});

export type CoordinateConvention = z.output<typeof coordinateConventionSchema>;
export type Settings = z.output<typeof settingsSchema>;
