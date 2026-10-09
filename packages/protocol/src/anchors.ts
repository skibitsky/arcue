import { z } from "zod";

export const vec3Schema = z.tuple([z.number(), z.number(), z.number()]);

export const indexSchema = z.int().nonnegative().max(0xffffffff);

export const indexRangeSchema = z
  .tuple([indexSchema, indexSchema])
  .refine(([start, end]) => start <= end, "A range must not end before it starts.");

/**
 * Inclusive ranges in `encodeRanges` form: sorted, neither overlapping nor touching. The schema cannot know the mesh,
 * so consumers check the ranges against the mesh's counts with `rangesWithin` before decoding them.
 */
export const indexRangesSchema = z.array(indexRangeSchema).superRefine((ranges, ctx) => {
  for (let index = 1; index < ranges.length; index++) {
    const previous = ranges[index - 1];
    const current = ranges[index];
    if (previous && current && current[0] <= previous[1] + 1) {
      ctx.addIssue({
        code: "custom",
        message: "Ranges must be sorted and must not overlap or touch.",
        path: [index],
      });
    }
  }
});

export const surfaceAnchorSchema = z.object({
  kind: z.literal("surface"),
  mesh: z.string().min(1),
  vertices: z.tuple([indexSchema, indexSchema, indexSchema]),
  weights: z.tuple([z.number(), z.number(), z.number()]),
});

export const regionAnchorSchema = z.object({
  kind: z.literal("region"),
  mesh: z.string().min(1),
  triangles: indexRangesSchema.min(1),
  vertices: indexRangesSchema.min(1),
});

export const spatialAnchorSchema = z.discriminatedUnion("kind", [surfaceAnchorSchema, regionAnchorSchema]);

const clipRef = {
  clip: z.string().min(1),
  clipDisplayName: z.string().min(1),
};

/** A time as stored with a comment: the clip's name in the file, and its display name for people. */
export const timeAnchorSchema = z
  .discriminatedUnion("kind", [
    z.object({ kind: z.literal("none") }),
    z.object({ kind: z.literal("frame"), ...clipRef, frame: indexSchema }),
    z.object({ kind: z.literal("range"), ...clipRef, start: indexSchema, end: indexSchema }),
  ])
  .refine((time) => time.kind !== "range" || time.start <= time.end, "A range must not end before it starts.");

/** A time as commands take it: the clip by its name in the file only. The core adds the display name. */
export const timeSelectionSchema = z
  .discriminatedUnion("kind", [
    z.object({ kind: z.literal("none") }),
    z.object({ kind: z.literal("frame"), clip: z.string().min(1), frame: indexSchema }),
    z.object({ kind: z.literal("range"), clip: z.string().min(1), start: indexSchema, end: indexSchema }),
  ])
  .refine((time) => time.kind !== "range" || time.start <= time.end, "A range must not end before it starts.");

export const cameraAnchorSchema = z.object({
  position: vec3Schema,
  target: vec3Schema,
  up: vec3Schema,
  fov: z.number().gt(0).lt(180),
});

export const frameRangeSchema = z
  .object({ start: indexSchema, end: indexSchema })
  .refine((range) => range.start <= range.end, "A range must not end before it starts.");

export const topologyFingerprintSchema = z.object({
  sourceVertexCount: indexSchema,
  triangleCount: indexSchema,
  hash: z.string().regex(/^[0-9a-f]{16}$/),
});

export type FrameRange = z.output<typeof frameRangeSchema>;
export type TimeSelection = z.output<typeof timeSelectionSchema>;
