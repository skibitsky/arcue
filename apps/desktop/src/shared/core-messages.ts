import { z } from "zod";

/** Messages from the main process to the core's utility process. */
export const toCoreSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("start"), userData: z.string().min(1), logFile: z.string().min(1) }),
  /** Carries one port of a channel to a window. */
  z.object({ type: z.literal("connect"), connection: z.string().min(1).max(200) }),
  z.object({ type: z.literal("clipboard-done"), id: z.int().positive(), ok: z.boolean() }),
  /** Closes the bridge, lets the changes in flight finish saving, and exits. */
  z.object({ type: z.literal("stop") }),
]);

/** Messages from the core's utility process to the main process. */
export const fromCoreSchema = z.discriminatedUnion("type", [
  /** `socket` is null when the bridge for the command line could not start. */
  z.object({ type: z.literal("started"), socket: z.string().min(1).nullable() }),
  z.object({ type: z.literal("failed"), message: z.string() }),
  /**
   * Another core that cannot run beside this one answers at `bridge.json` or `serve.json`, so this one stopped before
   * it served a window: another Arcue app ("same"), or a core that takes no review locks ("unshared").
   */
  z.object({
    type: z.literal("already-running"),
    pid: z.int().positive(),
    url: z.string().nullable(),
    reason: z.enum(["same", "unshared"]),
  }),
  /** A bridge opened an asset while no window was connected. */
  z.object({ type: z.literal("need-window") }),
  z.object({ type: z.literal("clipboard"), id: z.int().positive(), text: z.string().max(10_000_000) }),
]);

export type ToCore = z.output<typeof toCoreSchema>;
export type FromCore = z.output<typeof fromCoreSchema>;
