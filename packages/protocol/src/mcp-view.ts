import { z } from "zod";

/** The page of Arcue's view, which apps that show MCP Apps render for `open_model`. */
export const MCP_VIEW_URI = "ui://arcue/view.html";

/**
 * Where an `open_model` result names the model it showed, for the view: in its structured content, which apps keep with
 * the conversation and give the view again when they show it again, and in its `_meta`.
 */
export const MCP_VIEW_META_KEY = "arcue/view";

/** The app-only tool through which the view's window talks to the core. */
export const WINDOW_CHANNEL_TOOL = "window_channel";

/** Where a `window_channel` result carries its answer. */
export const WINDOW_CHANNEL_META_KEY = "arcue/channel";

/** The most pieces one `window_channel` call sends. */
export const MAX_CHANNEL_PIECES = 64;

/** The most bytes one piece of a message holds; a larger message travels as several pieces. */
export const MAX_PIECE_BYTES = 192 * 1024;

/** The most bytes of pieces one `window_channel` call sends. */
export const MAX_SEND_BYTES = 2 * MAX_PIECE_BYTES;

/** Where a `send_round` result names the round it sent. */
export const ROUND_META_KEY = "arcue/round";

export const roundMetaSchema = z.object({
  round: z.int().min(0),
  /** The round's comments, in the order of its prompt. */
  comments: z.array(z.string()),
});

export const shownModelSchema = z.object({
  /** The model's path as the core lists it, which names it also after the core restarts. */
  path: z.string().min(1),
  assetId: z.string().min(1),
  /** When the model was shown, so a view that a later `open_model` superseded can tell. */
  shownAt: z.int().min(0),
  /** The clip and frame it was shown at, which the view shows again when it opens the model again. */
  clip: z.string().min(1).optional(),
  frame: z.int().min(0).max(0xffffffff).optional(),
});

/** The model an `open_model` result shows. */
export type ShownModel = z.output<typeof shownModelSchema>;

export const channelPieceSchema = z.object({
  data: z
    .string()
    .max(Math.ceil(MAX_PIECE_BYTES / 3) * 4)
    .regex(/^[A-Za-z0-9+/]*={0,2}$/, "Expected base64."),
  /** More pieces of the same message follow. */
  more: z.boolean().optional(),
});

/** Part of one message between the window and the core, in base64. */
export type ChannelPiece = z.output<typeof channelPieceSchema>;

const channelIdSchema = z.string().regex(/^[A-Za-z0-9_-]{22}$/, "Expected a channel id.");

/**
 * A call of `window_channel`. `open` connects a window for the server's view, naming the path and `shownAt` of the
 * model the view shows. `send` passes pieces numbered from `seq`, and `receive` asks for the pieces from number `from`
 * on, which drops the ones before it; both may repeat a call whose answer was lost. `close` ends the channel.
 */
export const windowChannelInputSchema = z.object({
  op: z.enum(["open", "send", "receive", "close"]),
  channel: channelIdSchema.optional(),
  path: z.string().min(1).max(4096).optional(),
  shownAt: z.int().min(0).optional(),
  seq: z.int().min(0).optional(),
  from: z.int().min(0).optional(),
  pieces: z
    .array(channelPieceSchema)
    .max(MAX_CHANNEL_PIECES)
    .refine(
      (pieces) => pieces.reduce((length, piece) => length + piece.data.length, 0) <= (MAX_SEND_BYTES / 3) * 4,
      `Expected at most ${MAX_SEND_BYTES} bytes of pieces.`,
    )
    .optional(),
});

export type WindowChannelInput = z.output<typeof windowChannelInputSchema>;

/**
 * The answer of a `window_channel` call: for `open`, the channel and whether no later `open_model` superseded the
 * view's model; for `send`, the number of the next piece; for `receive`, the pieces from `from` on and whether the
 * channel closed after them.
 */
export const windowChannelOutputSchema = z.object({
  channel: channelIdSchema.optional(),
  latest: z.boolean().optional(),
  next: z.int().min(0).optional(),
  from: z.int().min(0).optional(),
  pieces: z.array(channelPieceSchema).optional(),
  closed: z.boolean().optional(),
});

export type WindowChannelOutput = z.output<typeof windowChannelOutputSchema>;
