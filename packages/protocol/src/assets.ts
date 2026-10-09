import { z } from "zod";

export const assetIdSchema = z.string().min(1);

/** "c" and a number that is never reused within the asset, such as "c7". */
export const commentIdSchema = z.string().regex(/^c\d+$/);

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
  /**
   * Absolute path of the composition file the asset reads: always for one it was opened through, and for the model's
   * own "<stem>.arcue" while that applies. The model with this file is the asset, so opening the pair again finds it.
   */
  composition: z.string().min(1).optional(),
});

export type AssetStatus = z.output<typeof assetStatusSchema>;
export type AssetSummary = z.output<typeof assetSummarySchema>;
