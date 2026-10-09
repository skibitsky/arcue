import { countInRanges } from "@arcue/scene";
import { z } from "zod";
import {
  cameraAnchorSchema,
  spatialAnchorSchema,
  timeAnchorSchema,
  topologyFingerprintSchema,
  vec3Schema,
} from "./anchors";
import { commentIdSchema } from "./assets";
import { commentContextSchema } from "./context";
import { partViewSchema } from "./view-state";

const timestampSchema = z.iso.datetime();
const roundNumberSchema = z.int().positive();

export const commentStatusSchema = z.enum(["draft", "sent", "resolved"]);

/** Whether the comment's surface target survived the latest export: kept exactly, moved to the nearest surface, or lost. */
export const anchorStateSchema = z.enum(["exact", "moved", "detached"]);

export const followUpSchema = z.object({
  text: z.string().min(1),
  createdAt: timestampSchema,
  /** The round whose fix did not work. */
  afterRound: roundNumberSchema,
});

export const commentSchema = z
  .object({
    id: commentIdSchema,
    text: z.string().min(1),
    status: commentStatusSchema,
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
    /** Id of the asset version the comment was made on. */
    madeOnVersion: z.string().min(1),
    time: timeAnchorSchema,
    target: spatialAnchorSchema.nullable(),
    /** Id of the version whose vertex and triangle numbers the target uses. Re-anchoring moves it forward. */
    anchorVersion: z.string().min(1),
    /**
     * Rest positions of the target's source vertices in that version, in the target's vertex order (decoded ranges for
     * a region), rounded to 0.00001 m. Re-anchoring maps from them, so it works after the old file is overwritten.
     * Empty without a target.
     */
    anchorRestPositions: z.array(vec3Schema),
    camera: cameraAnchorSchema,
    context: commentContextSchema,
    anchorState: anchorStateSchema,
    /** Messages added each time the comment was reopened, oldest first. */
    followUps: z.array(followUpSchema),
    /** Rounds the comment was sent in, oldest first. */
    rounds: z.array(roundNumberSchema),
    /**
     * The status a reopened comment had before it was reopened, while its follow-up waits in the queue. Deleting the
     * draft drops the follow-up and restores this status. Null otherwise.
     */
    reopenedFrom: z.enum(["sent", "resolved"]).nullable(),
    /** The parts the view showed when the comment was made, present only when that differs from the default view. */
    parts: partViewSchema.optional(),
  })
  .refine((comment) => comment.anchorRestPositions.length === anchoredVertexCount(comment.target), {
    message: "There must be one rest position per anchored vertex.",
    path: ["anchorRestPositions"],
  })
  .refine((comment) => comment.reopenedFrom === null || (comment.status === "draft" && comment.followUps.length > 0), {
    message: "Only a reopened draft with a follow-up records the status it was reopened from.",
    path: ["reopenedFrom"],
  })
  .refine(
    (comment) => comment.context.screenshot === null || screenshotOwner(comment.context.screenshot) === comment.id,
    {
      message: "A comment's screenshot must be named after the comment.",
      path: ["context", "screenshot"],
    },
  );

function screenshotOwner(path: string): string | undefined {
  return /(c\d+)(?:-\d+)?\.png$/.exec(path)?.[1];
}

function anchoredVertexCount(target: z.output<typeof spatialAnchorSchema> | null): number {
  if (target === null) return 0;
  if (target.kind === "surface") return 3;
  try {
    return countInRanges(target.vertices);
  } catch {
    return Number.NaN;
  }
}

export const meshTopologySchema = z.object({
  mesh: z.string().min(1),
  topology: topologyFingerprintSchema,
});

export const assetVersionSchema = z.object({
  /** Short hash of the file's bytes, such as "3f9a2c1". */
  id: z.string().min(1),
  fileModifiedAt: timestampSchema,
  loadedAt: timestampSchema,
  /** Exporter as the file names it, such as "Blender 5.2 FBX". */
  exporter: z.string().nullable(),
  meshes: z.array(meshTopologySchema),
});

export const roundSummarySchema = z.object({
  number: roundNumberSchema,
  createdAt: timestampSchema,
  version: z.string().min(1),
  /** Comment ids in prompt order. */
  comments: z.array(commentIdSchema),
});

/**
 * `review.json`: every comment, round and version of one asset. Only the core writes it.
 * The queue holds exactly the draft comments, each once, in the order the next prompt lists them.
 */
export const reviewFileSchema = z
  .object({
    schemaVersion: z.literal(1),
    asset: z.object({
      /** Relative to the workspace root, or absolute when the asset is outside a git repository. */
      path: z.string().min(1),
    }),
    versions: z.array(assetVersionSchema),
    comments: z.array(commentSchema),
    queue: z.array(commentIdSchema),
    rounds: z.array(roundSummarySchema),
    nextCommentNumber: z.int().positive(),
  })
  .superRefine((review, ctx) => {
    const issue = (message: string, path: (string | number)[]) => ctx.addIssue({ code: "custom", message, path });
    const statusById = new Map<string, string>();
    review.comments.forEach((comment, index) => {
      if (statusById.has(comment.id)) issue(`Comment id ${comment.id} is used twice.`, ["comments", index, "id"]);
      statusById.set(comment.id, comment.status);
    });
    const versionIds = new Set<string>();
    review.versions.forEach((version, index) => {
      if (versionIds.has(version.id)) issue(`Version id ${version.id} is used twice.`, ["versions", index, "id"]);
      versionIds.add(version.id);
    });
    const queued = new Set<string>();
    review.queue.forEach((id, index) => {
      if (queued.has(id)) issue(`Comment ${id} is queued twice.`, ["queue", index]);
      else if (statusById.get(id) !== "draft") issue(`Comment ${id} is queued but is not a draft.`, ["queue", index]);
      queued.add(id);
    });
    review.comments.forEach((comment, index) => {
      if (Number(comment.id.slice(1)) >= review.nextCommentNumber) {
        issue(`Comment ${comment.id} is not below nextCommentNumber ${review.nextCommentNumber}.`, [
          "nextCommentNumber",
        ]);
      }
      if (comment.status === "draft" && !queued.has(comment.id)) {
        issue(`Draft ${comment.id} is missing from the queue.`, ["comments", index, "status"]);
      }
    });
  });

export type CommentStatus = z.output<typeof commentStatusSchema>;
export type AnchorState = z.output<typeof anchorStateSchema>;
export type FollowUp = z.output<typeof followUpSchema>;
export type Comment = z.output<typeof commentSchema>;
export type MeshTopology = z.output<typeof meshTopologySchema>;
export type AssetVersion = z.output<typeof assetVersionSchema>;
export type RoundSummary = z.output<typeof roundSummarySchema>;
export type ReviewFile = z.output<typeof reviewFileSchema>;
