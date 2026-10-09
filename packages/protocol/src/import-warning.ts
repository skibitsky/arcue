import type { ImportWarning, ImportWarningCode } from "@arcue/scene";
import { importWarningSeverity } from "@arcue/scene";
import { z } from "zod";
import { commentIdSchema } from "./assets";
import { textureSlotSchema } from "./composition";

const codes = Object.keys(importWarningSeverity) as [ImportWarningCode, ...ImportWarningCode[]];

export const importWarningCodeSchema = z.enum(codes);

/** What a warning is about. `file` names the composition's file it comes from, absent for the model's own file. */
export const warningSubjectSchema = z.object({
  kind: z.enum(["texture", "material", "node", "clip", "file"]),
  name: z.string(),
  file: z.string().min(1).optional(),
});

const importWarningShape = {
  code: importWarningCodeSchema,
  severity: z.enum(["warning", "error"]),
  subject: warningSubjectSchema.omit({ file: true }),
  message: z.string().min(1),
  file: z.string().min(1).optional(),
  detail: z.string().min(1).optional(),
  materials: z.array(z.string()).optional(),
  foundPath: z.string().min(1).optional(),
  uses: z.array(z.object({ material: z.string(), slot: textureSlotSchema })).optional(),
};

/** A problem the importer found in the file, as `SourceInfo.warnings` lists it. */
export const importWarningSchema: z.ZodType<ImportWarning> = z.object(importWarningShape);

/** A warning's id: its code, subject and file, so it stays the same across versions and a dismissal sticks. */
export const warningIdSchema = z.string().min(1);

/**
 * The command that fixes a warning: `view.setClip`, `asset.reload`, `material.setTexture` on the base color,
 * `material.setTexture` on the slot with an image the person chooses, or `asset.relink` to a model file the person
 * chooses.
 */
export const warningFixSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("show-clip"), clip: z.string().min(1) }),
  z.object({ kind: z.literal("retry") }),
  z.object({
    kind: z.literal("use-as-base-color"),
    material: z.string().min(1),
    /** Absolute path of the image, as material.setTexture takes it. */
    file: z.string().min(1),
  }),
  z.object({ kind: z.literal("choose-texture"), material: z.string().min(1), slot: textureSlotSchema }),
  z.object({ kind: z.literal("choose-model") }),
]);

/** An import warning of the version on screen, with its id and what the review recorded about it. */
export const assetWarningSchema = z.object({
  id: warningIdSchema,
  ...importWarningShape,
  dismissed: z.boolean(),
  /** The newest comment made from the warning, of any status, or null. */
  commentId: commentIdSchema.nullable(),
  fix: warningFixSchema.nullable(),
});

/** The warning a comment was made from, as the comment and `round.json` keep it. */
export const commentWarningSchema = z.object({
  id: warningIdSchema,
  code: importWarningCodeSchema,
  subject: warningSubjectSchema.omit({ file: true }),
  file: z.string().min(1).optional(),
  detail: z.string().min(1).optional(),
});

export type WarningSubject = z.output<typeof warningSubjectSchema>;
export type WarningFix = z.output<typeof warningFixSchema>;
export type AssetWarning = z.output<typeof assetWarningSchema>;
export type CommentWarning = z.output<typeof commentWarningSchema>;

/** The stable id of a warning: "<code>:<kind>:<name>", with "<file>//" before the name for a composition's file. */
export function warningId(warning: Pick<ImportWarning, "code" | "subject" | "file">): string {
  const file = warning.file === undefined ? "" : `${warning.file}//`;
  return `${warning.code}:${warning.subject.kind}:${file}${warning.subject.name}`;
}
