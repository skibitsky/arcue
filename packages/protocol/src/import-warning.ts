import type { ImportWarning, ImportWarningCode } from "@arcue/scene";
import { importWarningSeverity } from "@arcue/scene";
import { z } from "zod";

const codes = Object.keys(importWarningSeverity) as [ImportWarningCode, ...ImportWarningCode[]];

/** A problem the importer found in the file, as `SourceInfo.warnings` lists it. */
export const importWarningSchema: z.ZodType<ImportWarning> = z.object({
  code: z.enum(codes),
  severity: z.enum(["warning", "error"]),
  subject: z.object({
    kind: z.enum(["texture", "material", "node", "clip", "file"]),
    name: z.string(),
  }),
  message: z.string().min(1),
  file: z.string().min(1).optional(),
});
