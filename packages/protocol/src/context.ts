import { z } from "zod";
import { indexSchema, vec3Schema } from "./anchors";

/** The layouts of a comment's stored screenshot. The comment schema also checks that `c<n>` is the comment's id. */
export const SCREENSHOT_PATH = /^(?:screenshots\/c\d+(?:-[1-9]\d*)?|rounds\/round-[1-9]\d*\/c\d+)\.png$/;

export const boneShareSchema = z.object({
  name: z.string(),
  /** Share of the target's skin weight, from 0 to 1. */
  share: z.number().min(0).max(1),
});

/** A joint's world position. `path` is its node path, which stays unique when joint names repeat. */
export const jointPositionSchema = z.object({
  name: z.string(),
  path: z.string().min(1),
  position: vec3Schema,
});

/**
 * Facts computed when a comment is made and stored with it, so history stays accurate after the file changes.
 * Positions are in scene space. Comments without a surface target have no bones, centroid or vertices.
 * A range comment's posed positions and joints are taken at the range's start frame.
 */
export const commentContextSchema = z.object({
  vertexCount: indexSchema,
  bones: z.array(boneShareSchema),
  centroid: z.object({ rest: vec3Schema, posed: vec3Schema }).nullable(),
  /** The joints that move the target, at the comment's time. */
  joints: z.array(jointPositionSchema),
  /** Plain words for the camera direction, such as "palm side, slightly below". */
  viewLabel: z.string(),
  /**
   * Screenshot path relative to the asset's review folder, in one of the layouts the core writes:
   * `screenshots/c<n>.png`, `screenshots/c<n>-<k>.png` for a replaced screenshot, or `rounds/round-<r>/c<n>.png`.
   */
  screenshot: z.string().regex(SCREENSHOT_PATH).nullable(),
});

/** What the 3D view computes; the core adds the screenshot path when it saves the image. */
export const computedContextSchema = commentContextSchema.omit({ screenshot: true });

export type BoneShare = z.output<typeof boneShareSchema>;
export type JointPosition = z.output<typeof jointPositionSchema>;
export type CommentContext = z.output<typeof commentContextSchema>;
export type ComputedContext = z.output<typeof computedContextSchema>;
