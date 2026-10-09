import { z } from "zod";
import { assetIdSchema, assetSummarySchema } from "./assets";
import type { EventDefinition } from "./definitions";
import { event } from "./definitions";
import { reviewCandidateSchema } from "./relink";
import { reviewFileSchema } from "./review";

export const events = {
  "asset.opened": event({
    description: "An asset was opened.",
    payload: z.object({ asset: assetSummarySchema }),
  }),
  "asset.updated": event({
    description: "An asset started loading, finished loading a new version, or failed to load.",
    payload: z.object({ asset: assetSummarySchema }),
  }),
  "asset.closed": event({
    description: "An asset was closed.",
    payload: z.object({ assetId: assetIdSchema }),
  }),
  "review.changed": event({
    description: "An asset's review data changed and is saved on disk.",
    payload: z.object({ assetId: assetIdSchema, review: reviewFileSchema }),
  }),
  "review.relinked": event({
    description:
      "An asset took over an earlier review because its file was renamed or moved, by itself or through review.relink or asset.relink. from is the earlier model's absolute path.",
    payload: z.object({ assetId: assetIdSchema, from: z.string().min(1), automatic: z.boolean() }),
  }),
  "review.offered": event({
    description:
      "Arcue found an earlier review that may belong to the asset and offers it instead of moving it, because several reviews match or only the meshes do. review.relink takes the offer.",
    payload: z.object({ assetId: assetIdSchema, candidate: reviewCandidateSchema }),
  }),
  "round.copied": event({
    description: "A round was saved and its prompt copied.",
    payload: z.object({ assetId: assetIdSchema, round: z.int().positive() }),
  }),
} satisfies Record<string, EventDefinition>;

export type Events = typeof events;
export type EventName = keyof Events;
export type EventPayload<Name extends EventName> = z.output<Events[Name]["payload"]>;

export function isEventName(name: string): name is EventName {
  return Object.hasOwn(events, name);
}
