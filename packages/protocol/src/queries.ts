import type { SceneDescription } from "@arcue/scene";
import { z } from "zod";
import { assetIdSchema, assetSummarySchema, bytesSchema, commentIdSchema } from "./assets";
import type { QueryDefinition } from "./definitions";
import { query } from "./definitions";
import { assetWarningSchema } from "./import-warning";
import { assetInspectionSchema } from "./inspect";
import { partSummarySchema } from "./parts";
import { reviewFileSchema } from "./review";
import { settingsSchema } from "./settings";
import { viewStateSchema } from "./view-state";

const assetRef = { assetId: assetIdSchema };

/** Not validated: a scene is large typed data that the core itself produced. */
export const sceneDescriptionSchema = z.custom<SceneDescription>();

export const queries = {
  "asset.list": query({
    description: "List the open assets.",
    input: z.object({}),
    output: z.object({ assets: z.array(assetSummarySchema) }),
  }),
  "review.get": query({
    description: "Get an asset's review data: comments, queue, rounds and versions.",
    input: z.object(assetRef),
    output: reviewFileSchema,
  }),
  "viewState.get": query({
    description: "Get the view state a window last reported for an asset, or null before the first report.",
    input: z.object(assetRef),
    output: viewStateSchema.nullable(),
  }),
  "comment.screenshot": query({
    description: "Get a comment's screenshot as PNG bytes, or null when it has none.",
    input: z.object({ ...assetRef, commentId: commentIdSchema }),
    output: bytesSchema.nullable(),
  }),
  "settings.get": query({
    description: "Get the app settings.",
    input: z.object({}),
    output: settingsSchema,
  }),
  "scene.get": query({
    description: "Get the parsed scene of the asset version on screen, with that version's id.",
    input: z.object(assetRef),
    output: z.object({ version: z.string().min(1), scene: sceneDescriptionSchema }),
  }),
  "scene.parts": query({
    description:
      'List the parts of the asset version on screen: meshes, LOD groups with their levels, collision helpers and sockets, with the triangles of each level. Parts from another file of a composition have ids like "Shells.fbx//Boulder1".',
    input: z.object(assetRef),
    output: z.object({ parts: z.array(partSummarySchema) }),
  }),
  "warning.list": query({
    description:
      "List the import warnings of the asset version on screen, errors first, each with its id, whether it was dismissed, the comment made from it and the command that fixes it.",
    input: z.object(assetRef),
    output: z.object({ warnings: z.array(assetWarningSchema) }),
  }),
  "warning.prompt": query({
    description:
      "Get a prompt that asks a coding agent to fix the asset's import warnings that are not dismissed: one instruction line, then one numbered entry per warning.",
    input: z.object(assetRef),
    output: z.object({ prompt: z.string() }),
  }),
  "asset.inspect": query({
    description:
      "Import a file without opening it and summarize it: format, exporter, axes, height, meshes, parts, bones, materials, textures, clips and warnings. A model is composed with its composition file as opening it would be; a .arcue path inspects the model it names.",
    input: z.object({ path: z.string().min(1) }),
    output: assetInspectionSchema,
  }),
} satisfies Record<string, QueryDefinition>;

export type Queries = typeof queries;
export type QueryName = keyof Queries;
export type QueryInput<Name extends QueryName> = z.input<Queries[Name]["input"]>;
export type QueryArgs<Name extends QueryName> = z.output<Queries[Name]["input"]>;
export type QueryOutput<Name extends QueryName> = z.output<Queries[Name]["output"]>;

export function isQueryName(name: string): name is QueryName {
  return Object.hasOwn(queries, name);
}
