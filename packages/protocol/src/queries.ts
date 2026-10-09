import type { SceneDescription } from "@arcue/scene";
import { z } from "zod";
import { assetIdSchema, assetSummarySchema, bytesSchema, commentIdSchema } from "./assets";
import type { QueryDefinition } from "./definitions";
import { query } from "./definitions";
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
} satisfies Record<string, QueryDefinition>;

export type Queries = typeof queries;
export type QueryName = keyof Queries;
export type QueryInput<Name extends QueryName> = z.input<Queries[Name]["input"]>;
export type QueryArgs<Name extends QueryName> = z.output<Queries[Name]["input"]>;
export type QueryOutput<Name extends QueryName> = z.output<Queries[Name]["output"]>;

export function isQueryName(name: string): name is QueryName {
  return Object.hasOwn(queries, name);
}
