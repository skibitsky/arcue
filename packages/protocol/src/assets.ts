import { z } from "zod";

export const assetIdSchema = z.string().min(1);

/**
 * A comment id as a regular expression source: "c" and 26 lowercase ULID digits, such as
 * "c01m4gp93004tff59tdwh9edd1r", or "c" and a number for comments made before ids were random, such as "c7".
 */
export const COMMENT_ID_PATTERN = "c(?:[0-9a-hjkmnp-tv-z]{26}|\\d+)";

/** A comment id, never reused within the asset. */
export const commentIdSchema = z.string().regex(new RegExp(`^${COMMENT_ID_PATTERN}$`));

export const bytesSchema = z.custom<Uint8Array>((value) => value instanceof Uint8Array, "Expected bytes.");

export const assetStatusSchema = z.enum(["loading", "ready", "failed"]);

export const assetSummarySchema = z.object({
  assetId: assetIdSchema,
  /** Absolute path of the asset file. */
  path: z.string().min(1),
  name: z.string(),
  status: assetStatusSchema,
  /** Id of the version on screen, or null before the first successful load. */
  version: z.string().nullable(),
  /** Why the latest load failed; the previous version stays on screen. */
  error: z.string().nullable(),
  /** Absolute path of the model's composition file while the version on screen applies it. */
  composition: z.string().min(1).optional(),
});

export type AssetStatus = z.output<typeof assetStatusSchema>;
export type AssetSummary = z.output<typeof assetSummarySchema>;
