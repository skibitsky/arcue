import { z } from "zod";
import { cameraAnchorSchema, frameRangeSchema, indexSchema, spatialAnchorSchema, timeSelectionSchema } from "./anchors";

export const displayModeSchema = z.enum(["lit", "clay", "wireframe"]);

/** A part's stable id: the node path of its mesh, LOD group or socket, as `ScenePart.id` gives it. */
export const partIdSchema = z.string().min(1);

/**
 * Which parts a view shows. `hidden` and `shown` list only parts whose visibility differs from their default: models
 * show and collision helpers hide by default. An isolated part is the only part shown. `lod` picks the LOD level; a
 * part without that level shows its nearest lower one.
 */
export const partViewSchema = z.object({
  hidden: z.array(partIdSchema),
  shown: z.array(partIdSchema),
  isolated: partIdSchema.nullable(),
  lod: indexSchema,
});

/**
 * A comment box that was open, with what it held, so the tab opens it again after a restart, a reload or a move. A
 * "new" box writes a new draft, an "edit" box changes the draft `commentId` names, and a "reopen" box returns that
 * sent or resolved comment to the queue. `anchorVersion` is the asset version the target was picked on, and
 * `timeEdited` and `targetEdited` say what an edit box changed.
 */
export const savedBoxSchema = z.object({
  mode: z.enum(["new", "edit", "reopen"]),
  commentId: z.string().min(1).nullable(),
  time: timeSelectionSchema,
  restPose: z.boolean(),
  target: spatialAnchorSchema.nullable(),
  targetBone: z.string().min(1).nullable(),
  followUpRound: indexSchema.nullable(),
  text: z.string().max(100_000),
  anchorVersion: z.string().min(1).nullable(),
  timeEdited: z.boolean(),
  targetEdited: z.boolean(),
  needsRepick: z.boolean(),
});

/** What a window shows for one asset. The core keeps the latest report so a window can be rebuilt after a crash. */
export const viewStateSchema = z.object({
  camera: cameraAnchorSchema,
  /** The clip's name in the file, or null for the rest pose. */
  clip: z.string().min(1).nullable(),
  frame: indexSchema,
  range: frameRangeSchema.nullable(),
  display: z.object({
    mode: displayModeSchema,
    skeleton: z.boolean(),
  }),
  parts: partViewSchema.default(() => ({ hidden: [], shown: [], isolated: null, lod: 0 })),
  /** The outline drawer is open. It shows only for models with parts or added files to list. */
  outlineOpen: z.boolean().default(false),
  /** The person dismissed the offer to continue an earlier review, so the tab never offers one again. */
  relinkOfferDismissed: z.boolean().optional(),
  /** The comment box open in the tab. */
  box: savedBoxSchema.optional(),
  /** Text typed in the tab's field for a comment without a pin, which is no comment yet. */
  note: z.string().max(100_000).optional(),
});

const pathSchema = z.string().min(1).max(4096);

export const savedTabSchema = z.object({
  /** The model's path, which opens the same asset again. */
  path: pathSchema,
  view: viewStateSchema.nullable(),
});

/** A window's asset tabs, in order, and the index of the active one. */
export const windowTabsSchema = z.object({
  tabs: z.array(savedTabSchema).max(500),
  active: z.int().min(0).nullable(),
});

export type DisplayMode = z.output<typeof displayModeSchema>;
export type SavedBox = z.output<typeof savedBoxSchema>;
export type PartView = z.output<typeof partViewSchema>;
export type ViewState = z.output<typeof viewStateSchema>;
export type SavedTab = z.output<typeof savedTabSchema>;
export type WindowTabs = z.output<typeof windowTabsSchema>;
