import { mkdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type { BridgeInfo, CoreKind } from "@arcue/protocol";
import { ArcueError, coreKindOf, LOCKS_FOLDER, START_LOCK_FILE } from "@arcue/protocol";
import type { BlockingCore } from "./core-connection";
import { blockingCore } from "./core-connection";
import type { ReleaseLock } from "./file-lock";
import { acquireFileLock } from "./file-lock";
import { writeLastCore } from "./last-core";

const CLAIM_TIMEOUT_MS = 30_000;
const RECORD_TIMEOUT_MS = 2_000;
const START_LABEL = "the start of Arcue";

/** A core runs that keeps a core of the kind `starting` from starting beside it. */
export class CoreRunningError extends ArcueError {
  readonly running: BridgeInfo;
  readonly reason: BlockingCore["reason"];
  readonly starting: CoreKind;

  constructor(running: BridgeInfo, reason: BlockingCore["reason"], starting: CoreKind) {
    super("conflict", runningMessage(running, reason, starting));
    this.running = running;
    this.reason = reason;
    this.starting = starting;
  }
}

function runningMessage(running: BridgeInfo, reason: BlockingCore["reason"], starting: CoreKind): string {
  const { pid, url } = running;
  if (reason === "same") {
    return url ? `Arcue is already running at ${url} (process ${pid}).` : `Arcue is already running (process ${pid}).`;
  }
  if (starting === "serve" && running.kind === undefined) {
    return coreKindOf(running) === "serve"
      ? `An older arcue serve runs at ${url} (process ${pid}) and can't share reviews with this one. Run arcue stop, then try again.`
      : `An Arcue app runs (process ${pid}) that can't share reviews with Arcue in the browser. Quit it or update it, then try again.`;
  }
  return `Another version of Arcue runs (process ${pid}${url ? ` at ${url}` : ""}) and can't share reviews with this one.`;
}

export interface StartClaim {
  readonly kind: CoreKind;
  /** Lets other Arcues start or stop a core again. A second call does nothing. */
  release(): Promise<void>;
}

/** The lock every Arcue holds while it checks and writes the bridge files of a data folder. */
export function startLockPath(userData: string): string {
  return join(userData, LOCKS_FOLDER, START_LOCK_FILE);
}

/**
 * Takes the start lock of the data folder, which every Arcue that starts or stops a core holds while it checks and
 * writes the bridge files, and refuses with a CoreRunningError when a core that keeps one of `kind` from starting runs.
 * Hold the claim until the core's bridge file is written.
 */
export async function claimStart(
  userData: string,
  kind: CoreKind,
  options: { timeoutMs?: number } = {},
): Promise<StartClaim> {
  await mkdir(userData, { recursive: true, mode: 0o700 });
  const release = await takeStartLock(userData, options.timeoutMs ?? CLAIM_TIMEOUT_MS);
  try {
    const blocking = await blockingCore(userData, kind);
    if (blocking) throw new CoreRunningError(blocking.info, blocking.reason, kind);
  } catch (error) {
    await release();
    throw error;
  }
  return { kind, release };
}

/** Waits until no Arcue is starting a core for the data folder, at most `timeoutMs`. Never rejects. */
export async function waitForStarts(userData: string, timeoutMs = CLAIM_TIMEOUT_MS): Promise<void> {
  if (!(await exists(startLockPath(userData)))) return;
  const release = await takeStartLock(userData, timeoutMs).catch(() => null);
  await release?.();
}

/**
 * Writes last-core.json under the start lock, waiting at most `timeoutMs` for it and skipping the write after that.
 * Never rejects, and writes nothing once the data folder is gone.
 */
export async function recordLastCore(
  userData: string,
  kind: CoreKind,
  url?: string,
  timeoutMs = RECORD_TIMEOUT_MS,
): Promise<void> {
  if (!(await exists(userData))) return;
  const release = await takeStartLock(userData, timeoutMs).catch(() => null);
  if (!release) return;
  try {
    await writeLastCore(userData, kind, url);
  } finally {
    await release();
  }
}

/** Takes the start lock for a change to the bridge files of a core that already runs. */
export function takeStartLock(userData: string, timeoutMs: number): Promise<ReleaseLock> {
  return acquireFileLock(startLockPath(userData), { timeoutMs, label: START_LABEL });
}

async function exists(path: string): Promise<boolean> {
  return (await stat(path).catch(() => null)) !== null;
}
