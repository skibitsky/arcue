import { z } from "zod";
import { assetIdSchema, assetSummarySchema } from "./assets";
import type { EventDefinition } from "./definitions";
import { event } from "./definitions";
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
