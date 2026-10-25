import { z } from "zod";

/** The folder in the app's data folder that holds the lock files every Arcue on the computer honours. */
export const LOCKS_FOLDER = "locks";

/** The lock in `LOCKS_FOLDER` that an Arcue holds while it checks and writes the bridge files to start or stop a core. */
export const START_LOCK_FILE = "start.lock";

const lockTokenSchema = z.string().regex(/^[0-9a-f]{32}$/);

/** What a lock file holds: who took the lock, so another process can tell whether its holder still runs. */
export const lockRecordSchema = z.object({
  arcueLock: z.literal(1),
  token: lockTokenSchema,
  /** The process that took the lock, which a reused pid does not share. */
  instance: lockTokenSchema,
  pid: z.int().positive(),
  host: z.string().max(255),
  /** The pid namespace and boot the holder runs in, or null when unknown. */
  ns: z.string().max(512).nullable(),
  acquiredAt: z.number(),
});

export type LockRecord = z.output<typeof lockRecordSchema>;

/** What a lock's waiting file holds: a waiter in another process, so this process lets it take its turn. */
export const lockWaitingSchema = z.object({
  arcueLockWaiting: z.literal(1),
  token: lockTokenSchema,
  pid: z.int().positive(),
});

export type LockWaiting = z.output<typeof lockWaitingSchema>;
