import { z } from "zod";
import { partIdSchema } from "./view-state";

/** One part of a scene as `scene.parts` and `asset.inspect` list it, with each level's meshes and triangles. */
export const partSummarySchema = z.object({
  id: partIdSchema,
  name: z.string(),
  role: z.enum(["model", "collision", "socket"]),
  /** False for collision helpers, sockets and parts a composition hides; view state lists changes from it. */
  shownByDefault: z.boolean(),
  levels: z.array(z.object({ level: z.int().nonnegative(), meshes: z.array(z.string()), triangles: z.int() })),
});

export type PartSummary = z.output<typeof partSummarySchema>;
