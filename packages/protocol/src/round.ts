import { z } from "zod";
import { indexRangesSchema, indexSchema, vec3Schema } from "./anchors";
import { commentIdSchema } from "./assets";
import { boneShareSchema, jointPositionSchema } from "./context";
import { commentWarningSchema } from "./import-warning";
import { anchorStateSchema, versionFileSchema } from "./review";
import { partViewSchema } from "./view-state";

/** `posed` is null when the 3D view did not compute the target's position at the comment's time. */
const restAndPosedSchema = z.object({ rest: vec3Schema, posed: vec3Schema.nullable() });

/**
 * `clip` is the clip's name in the file, which `arcue open --clip` takes; `clipDisplayName` is the name without the
 * "Armature|" prefix, as Blender shows the action.
 */
const clipRef = {
  clip: z.string().min(1),
  clipDisplayName: z.string().min(1),
};

/**
 * `sourceFrame` is the frame number the clip's file itself uses for `frame`, such as Blender's frame; it is absent where
 * Arcue does not know it, as in rounds written before it existed.
 */
const frameTimeSchema = z.object({
  ...clipRef,
  frame: indexSchema,
  seconds: z.number(),
  sourceFrame: z.number().optional(),
});

/** `sourceFrames` are the frame numbers the clip's file itself uses for `frames`, where Arcue knows them. */
const rangeTimeSchema = z.object({
  ...clipRef,
  frames: z.tuple([indexSchema, indexSchema]),
  seconds: z.tuple([z.number(), z.number()]),
  sourceFrames: z.tuple([z.number(), z.number()]).optional(),
});

/** `mesh` is the object's name as the exporting tool shows it; `meshPath` is its node path in the file. */
const meshRef = {
  mesh: z.string(),
  meshPath: z.string().min(1),
};

const pointTargetSchema = z.object({
  kind: z.literal("point"),
  ...meshRef,
  vertices: z.tuple([indexSchema, indexSchema, indexSchema]),
  weights: z.tuple([z.number(), z.number(), z.number()]),
  position: restAndPosedSchema,
  bones: z.array(boneShareSchema),
});

const regionTargetSchema = z.object({
  kind: z.literal("region"),
  ...meshRef,
  vertices: indexRangesSchema,
  vertexCount: indexSchema,
  centroid: restAndPosedSchema,
  bones: z.array(boneShareSchema),
});

export const roundCommentSchema = z.object({
  id: commentIdSchema,
  /** The comment's number in the copied prompt, starting at 1. */
  number: z.int().positive(),
  text: z.string(),
  /** Null when the comment applies to the model in every pose; positions are then given in the rest pose. */
  time: z.union([frameTimeSchema, rangeTimeSchema]).nullable(),
  target: z.discriminatedUnion("kind", [pointTargetSchema, regionTargetSchema]).nullable(),
  /** Joint positions at the comment's time; for a range, at its start frame. */
  pose: z.object({ joints: z.array(jointPositionSchema) }).nullable(),
  camera: z.object({
    position: vec3Schema,
    target: vec3Schema,
    up: vec3Schema,
    fov: z.number(),
    label: z.string(),
  }),
  /** File name inside the round's folder. */
  screenshot: z.string().nullable(),
  madeOnVersion: z.string(),
  /**
   * Whether the target survived the exports since it was made, and the version its vertex and triangle numbers refer
   * to. A detached target's numbers refer to an older version, so match it by its rest positions. Null without a
   * target.
   */
  anchorState: anchorStateSchema.nullable(),
  anchorVersion: z.string().min(1).nullable(),
  /** Earlier messages on a reopened comment, with the round each was sent in. */
  earlierMessages: z.array(z.object({ round: z.int().positive(), text: z.string() })).default([]),
  /** The parts the view showed, by part id. Absent for the default view: LOD0, collision helpers hidden. */
  parts: partViewSchema.optional(),
  /** The import warning the comment was made from: its code, subject, file and detail. */
  warning: commentWarningSchema.optional(),
});

/** `round.json`: the full data behind one copied prompt. Agents read it; it never changes once written. */
export const roundDataSchema = z.object({
  round: z.int().positive(),
  asset: z.object({
    path: z.string(),
    version: z.string(),
    exporter: z.string().nullable(),
    fps: z.number(),
    space: z.object({
      units: z.string(),
      up: z.enum(["+X", "-X", "+Y", "-Y", "+Z", "-Z"]),
      handedness: z.enum(["right", "left"]),
    }),
    /** For a composition, each file of the version with its own version. Mesh paths from other files start with one. */
    files: z.array(versionFileSchema).optional(),
  }),
  comments: z.array(roundCommentSchema),
});

export type RoundComment = z.output<typeof roundCommentSchema>;
export type RoundData = z.output<typeof roundDataSchema>;
