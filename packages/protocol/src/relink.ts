import { z } from "zod";

/** How an earlier review was matched to a model: the same bytes, the same Unity GUID, or the same meshes. */
export const relinkMatchSchema = z.enum(["content", "guid", "structure"]);

/** An earlier review whose model file is gone, which may belong to an asset whose file was renamed or moved. */
export const reviewCandidateSchema = z.object({
  /** Absolute path of the model the review was made for, as `review.relink` takes it. */
  path: z.string().min(1),
  /** How many comments the review holds. */
  comments: z.int().nonnegative(),
  /** When the review last loaded a version of its model, or null when it never did. */
  lastLoadedAt: z.iso.datetime().nullable(),
  match: relinkMatchSchema,
});

export type RelinkMatch = z.output<typeof relinkMatchSchema>;
export type ReviewCandidate = z.output<typeof reviewCandidateSchema>;
