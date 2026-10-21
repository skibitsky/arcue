import { createHash, randomBytes } from "node:crypto";
import { readFileSync, readlinkSync, unlinkSync } from "node:fs";
import * as fs from "node:fs/promises";
import { hostname } from "node:os";
import { dirname } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import type { LockRecord, LockWaiting } from "@arcue/protocol";
import { ArcueError, lockRecordSchema, lockWaitingSchema } from "@arcue/protocol";

export interface FileLockOptions {
  /** How long one other holder may keep the lock before this waiter gives up; 0 tries once. */
  timeoutMs: number;
  /** What the lock protects, for its errors, such as "the reviews of /work/game". */
  label: string;
  /** How often the holder refreshes the lock file's modification time. Defaults to 5 seconds. */
  heartbeatMs?: number;
  /** How long a lock file may go without a refresh before a waiter suspects its holder is gone. Defaults to a minute. */
  staleAfterMs?: number;
  /** How much longer it must stay unchanged before the waiter breaks it; more than `heartbeatMs`. Defaults to 10 seconds. */
  confirmStaleMs?: number;
  /** The wall clock lock ages are measured with; tests move it. */
  now?: () => number;
}

/** Lets go of a lock that `acquireFileLock` took. It never rejects, and a second call does nothing. */
export type ReleaseLock = () => Promise<void>;

const HEARTBEAT_MS = 5_000;
const STALE_AFTER_MS = 60_000;
const CONFIRM_STALE_MS = 10_000;
const MARK_WAITING_AFTER_MS = 50;
const WAITING_FRESH_MS = 2_000;
const YIELD_MS = 200;
const UNLINK_ATTEMPTS = 5;
const REFUSALS_BEFORE_FORBIDDEN = 5;
const BUSY_CODES = new Set(["EPERM", "EBUSY", "EACCES"]);

interface Lease {
  heartbeatMs: number;
  staleAfterMs: number;
  confirmStaleMs: number;
  now: () => number;
}

/** One call of `acquireFileLock`: the lock file, and the record it writes there. */
interface Attempt {
  path: string;
  label: string;
  lease: Lease;
  token: string;
  record: string;
}

interface Snapshot {
  text: string;
  mtimeMs: number;
}

type Seen = Snapshot | "gone" | "busy";

/** Windows refused to create the file, which it does while a removed file is still open somewhere, and why. */
interface Refusal {
  refused: unknown;
}

/** This copy of the module, which a later process with the same pid does not share. */
const INSTANCE = randomHex();
const HOST = hostname().slice(0, 255);
let namespace: string | null | undefined;
/** The token of every acquire in progress and every lock held in this process, with its lock file. */
const liveTokens = new Map<string, string>();
/** The acquires waiting for their turn at each lock file, after the one that has it. */
const turns = new Map<string, (() => void)[]>();
/** The other holder this process waits on at each lock file, and since when, by `performance.now()`. */
const foreign = new Map<string, { identity: string; since: number }>();
let exitWatched = false;

/**
 * Holds the lock at `nativePath` against every other holder: acquires in this process, which take turns in order and
 * never time out on each other, and other processes that use the same file. It creates the file with a record of its
 * holder, refreshes its modification time while it holds the lock, and removes it on release.
 *
 * A lock file stays until its holder releases it, except that a waiter breaks it when its holder is gone: a record of
 * this process whose acquire has ended, a record of a process on this computer, in the same pid namespace and boot,
 * that no longer runs, or a file that went without a refresh for `staleAfterMs` and then `confirmStaleMs` more. Rejects
 * with "timeout" when one other holder keeps it longer than `timeoutMs`, and with "forbidden" when it cannot create the
 * file or read the file another holder left.
 */
export async function acquireFileLock(nativePath: string, options: FileLockOptions): Promise<ReleaseLock> {
  const lease: Lease = {
    heartbeatMs: options.heartbeatMs ?? HEARTBEAT_MS,
    staleAfterMs: options.staleAfterMs ?? STALE_AFTER_MS,
    confirmStaleMs: options.confirmStaleMs ?? CONFIRM_STALE_MS,
    now: options.now ?? Date.now,
  };
  if (lease.confirmStaleMs <= lease.heartbeatMs) {
    throw new RangeError("A lock's confirmStaleMs must be longer than its heartbeatMs.");
  }
  watchExit();
  await takeTurn(nativePath);
  const token = randomHex();
  liveTokens.set(token, nativePath);
  const record: LockRecord = {
    arcueLock: 1,
    token,
    instance: INSTANCE,
    pid: process.pid,
    host: HOST,
    ns: lockNamespace(),
    acquiredAt: lease.now(),
  };
  const attempt: Attempt = { path: nativePath, label: options.label, lease, token, record: JSON.stringify(record) };
  let marked = false;
  try {
    const started = performance.now();
    let vanished = 0;
    let refusals = 0;
    for (let tries = 0; ; tries++) {
      const created = await create(nativePath, attempt.record, attempt.label);
      if (created === "created") {
        foreign.delete(nativePath);
        if (marked) await clearWaiting(attempt);
        return holding(attempt);
      }
      const seen = await inspect(nativePath, attempt.label);
      const refusal = seen === "gone" && typeof created === "object" ? created : null;
      vanished = seen === "gone" ? vanished + 1 : 0;
      refusals = refusal ? refusals + 1 : 0;
      if (refusal && refusals >= REFUSALS_BEFORE_FORBIDDEN) {
        throw cannotLock(attempt.label, nativePath, refusal.refused);
      }
      if (vanished === 1) continue;
      let holder: LockRecord | null = null;
      if (typeof seen === "object") {
        const judged = judge(seen, lease);
        holder = judged.record;
        if (judged.verdict === "stale" && (await breakLock(attempt, seen, holder))) continue;
        if (judged.verdict === "maybe") {
          await sleep(lease.confirmStaleMs);
          const again = await inspect(nativePath, attempt.label);
          if (again === "gone") continue;
          if (typeof again === "object" && sameSnapshot(again, seen) && (await breakLock(attempt, seen, holder))) {
            continue;
          }
        }
      }
      const identity = typeof seen === "object" ? (holder?.token ?? `x${digest(seen.text)}`) : seen;
      let watched = foreign.get(nativePath);
      if (watched?.identity !== identity) {
        watched = { identity, since: performance.now() };
        foreign.set(nativePath, watched);
      }
      if (performance.now() - watched.since >= options.timeoutMs) {
        throw refusal ? cannotLock(attempt.label, nativePath, refusal.refused) : lockTimeout(options, holder);
      }
      if (performance.now() - started >= MARK_WAITING_AFTER_MS) {
        await markWaiting(attempt);
        marked = true;
      }
      await sleep(Math.min(100, 5 * 2 ** tries) * (0.8 + 0.4 * Math.random()));
    }
  } catch (error) {
    liveTokens.delete(token);
    if (marked) await clearWaiting(attempt);
    passTurn(nativePath, 0);
    throw error;
  }
}

/** Whether a process with this pid runs; one this user may not signal counts as running. */
export function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return codeOf(error) === "EPERM";
  }
}

/**
 * The pid namespace and boot this process runs in, which lock records name so that only a process that shares them
 * judges whether the holder still runs by its pid: on Linux the namespace link and the boot id, elsewhere the system's
 * name. Null when it cannot be read.
 */
export function lockNamespace(): string | null {
  namespace ??= readNamespace();
  return namespace;
}

function readNamespace(): string | null {
  if (process.platform !== "linux") return process.platform;
  try {
    const boot = readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim();
    const identity = `${readlinkSync("/proc/self/ns/pid")}/${boot}`;
    return identity.length <= 512 ? identity : null;
  } catch {
    return null;
  }
}

function takeTurn(path: string): Promise<void> {
  const waiting = turns.get(path);
  if (!waiting) {
    turns.set(path, []);
    return Promise.resolve();
  }
  return new Promise((resolve) => waiting.push(resolve));
}

function passTurn(path: string, delayMs: number): void {
  const next = turns.get(path)?.shift();
  if (!next) turns.delete(path);
  else if (delayMs > 0) setTimeout(next, delayMs);
  else next();
}

/** Creates the file with the record, unless it exists or Windows refuses it. */
async function create(path: string, record: string, label: string): Promise<"created" | "held" | Refusal> {
  for (let tries = 0; ; tries++) {
    let handle: fs.FileHandle;
    try {
      handle = await fs.open(path, "wx", 0o600);
    } catch (error) {
      const code = codeOf(error);
      if (code === "EEXIST") return "held";
      if (busyOnWindows(code)) return { refused: error };
      if (code === "ENOENT" && tries === 0) {
        await fs.mkdir(dirname(path), { recursive: true, mode: 0o700 }).catch((cause: unknown) => {
          throw cannotLock(label, path, cause);
        });
        continue;
      }
      throw cannotLock(label, path, error);
    }
    try {
      await handle.writeFile(record);
      await handle.close();
    } catch (error) {
      await handle.close().catch(() => undefined);
      await fs.unlink(path).catch(() => undefined);
      throw cannotLock(label, path, error);
    }
    return "created";
  }
}

/** Reads a lock file's text and modification time through one descriptor, so both come from the same file. */
async function inspect(path: string, label: string): Promise<Seen> {
  let handle: fs.FileHandle;
  try {
    handle = await fs.open(path, "r");
  } catch (error) {
    const code = codeOf(error);
    if (code === "ENOENT" || code === "ENOTDIR") return "gone";
    if (busyOnWindows(code)) return "busy";
    throw cannotLock(label, path, error);
  }
  try {
    const stats = await handle.stat();
    return { text: await handle.readFile("utf8"), mtimeMs: stats.mtimeMs };
  } catch (error) {
    throw cannotLock(label, path, error);
  } finally {
    await handle.close().catch(() => undefined);
  }
}

/** Whether the holder of a lock file is gone ("stale"), may be gone ("maybe"), or holds it. */
function judge(seen: Snapshot, lease: Lease): { verdict: "alive" | "stale" | "maybe"; record: LockRecord | null } {
  const record = parseRecord(seen.text);
  if (record?.instance === INSTANCE) return { verdict: liveTokens.has(record.token) ? "alive" : "stale", record };
  const ns = lockNamespace();
  if (record && record.host === HOST && ns !== null && record.ns === ns && !isRunning(record.pid)) {
    return { verdict: "stale", record };
  }
  if (lease.now() - seen.mtimeMs > lease.staleAfterMs) return { verdict: "maybe", record };
  return { verdict: "alive", record };
}

/**
 * Removes a lock file whose holder is gone, while it is still the file that was judged. A claim file named after the
 * record makes sure that only one waiter breaks it. Resolves with whether the lock is worth trying again at once.
 */
async function breakLock(attempt: Attempt, seen: Snapshot, record: LockRecord | null): Promise<boolean> {
  const id = record?.token ?? `x${digest(`${seen.text}${seen.mtimeMs}`)}`;
  const claim = `${attempt.path}.${id}.break`;
  if ((await create(claim, attempt.record, attempt.label)) !== "created") {
    await clearDeadClaim(claim, attempt);
    return false;
  }
  try {
    const again = await inspect(attempt.path, attempt.label);
    if (typeof again !== "object" || !sameSnapshot(again, seen)) return true;
    return await unlinkWithRetry(attempt.path);
  } finally {
    await unlinkWithRetry(claim);
  }
}

/** Removes the claim of a waiter that died while it broke a lock. */
async function clearDeadClaim(claim: string, attempt: Attempt): Promise<void> {
  const seen = await inspect(claim, attempt.label);
  if (typeof seen !== "object") return;
  const { verdict } = judge(seen, attempt.lease);
  if (verdict === "alive") return;
  if (verdict === "maybe") await sleep(attempt.lease.confirmStaleMs);
  const again = await inspect(claim, attempt.label);
  if (typeof again === "object" && sameSnapshot(again, seen)) await unlinkWithRetry(claim);
}

function holding(attempt: Attempt): ReleaseLock {
  const heartbeat = setInterval(() => {
    const at = new Date(attempt.lease.now());
    fs.utimes(attempt.path, at, at).catch(() => undefined);
  }, attempt.lease.heartbeatMs);
  heartbeat.unref();
  let released: Promise<void> | null = null;
  const release = async () => {
    clearInterval(heartbeat);
    liveTokens.delete(attempt.token);
    const seen = await inspect(attempt.path, attempt.label).catch(() => "gone" as const);
    if (typeof seen === "object" && parseRecord(seen.text)?.token === attempt.token) {
      await unlinkWithRetry(attempt.path);
    }
    const yieldToOthers = (turns.get(attempt.path)?.length ?? 0) > 0 && (await othersWait(attempt));
    passTurn(attempt.path, yieldToOthers ? YIELD_MS : 0);
  };
  return () => {
    released ??= release();
    return released;
  };
}

/** Whether a waiter in another process announced itself, so this process lets it take the lock before its next turn. */
async function othersWait(attempt: Attempt): Promise<boolean> {
  const seen = await inspect(waitingPath(attempt.path), attempt.label).catch(() => "gone" as const);
  if (typeof seen !== "object" || attempt.lease.now() - seen.mtimeMs >= WAITING_FRESH_MS) return false;
  const waiting = parseWaiting(seen.text);
  return waiting !== null && !liveTokens.has(waiting.token);
}

async function markWaiting(attempt: Attempt): Promise<void> {
  const file = waitingPath(attempt.path);
  const temporary = `${file}.${attempt.token}.tmp`;
  const waiting: LockWaiting = { arcueLockWaiting: 1, token: attempt.token, pid: process.pid };
  try {
    await fs.writeFile(temporary, JSON.stringify(waiting), { mode: 0o600 });
    await fs.rename(temporary, file);
  } catch {
    await fs.rm(temporary, { force: true }).catch(() => undefined);
  }
}

async function clearWaiting(attempt: Attempt): Promise<void> {
  const file = waitingPath(attempt.path);
  const seen = await inspect(file, attempt.label).catch(() => "gone" as const);
  if (typeof seen === "object" && parseWaiting(seen.text)?.token === attempt.token) {
    await fs.unlink(file).catch(() => undefined);
  }
}

function waitingPath(path: string): string {
  return `${path}.waiting`;
}

/** Windows refuses to remove a file while another program, such as a virus scanner, holds it open; it retries. */
async function unlinkWithRetry(path: string): Promise<boolean> {
  for (let tries = 1; ; tries++) {
    try {
      await fs.unlink(path);
      return true;
    } catch (error) {
      const code = codeOf(error);
      if (code === "ENOENT") return true;
      if (tries >= UNLINK_ATTEMPTS || code === undefined || !BUSY_CODES.has(code)) return false;
      await sleep(20 * tries);
    }
  }
}

/** Removes this process's lock files when it exits without releasing them. */
function watchExit(): void {
  if (exitWatched) return;
  exitWatched = true;
  process.once("exit", () => {
    for (const [token, path] of liveTokens) removeIfHeld(path, token);
  });
}

function removeIfHeld(path: string, token: string): void {
  try {
    if (parseRecord(readFileSync(path, "utf8"))?.token === token) unlinkSync(path);
  } catch {
    return;
  }
}

function parseRecord(text: string): LockRecord | null {
  try {
    const parsed = lockRecordSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function parseWaiting(text: string): LockWaiting | null {
  try {
    const parsed = lockWaitingSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function sameSnapshot(a: Snapshot, b: Snapshot): boolean {
  return a.text === b.text && a.mtimeMs === b.mtimeMs;
}

function lockTimeout(options: FileLockOptions, holder: LockRecord | null): ArcueError {
  const who = holder ? `Another Arcue (process ${holder.pid})` : "Another Arcue";
  const seconds = Math.round(options.timeoutMs / 100) / 10;
  return new ArcueError(
    "timeout",
    `${who} kept ${options.label} busy for ${seconds} seconds, so nothing was changed. Try again.`,
  );
}

function cannotLock(label: string, path: string, cause: unknown): ArcueError {
  return new ArcueError("forbidden", `Arcue cannot lock ${label}: ${dirname(path)} cannot be written.`, { cause });
}

/** Windows refuses to open a file that is being removed, or that another program holds, for a while. */
function busyOnWindows(code: string | undefined): boolean {
  return process.platform === "win32" && code !== undefined && BUSY_CODES.has(code);
}

function codeOf(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
    ? error.code
    : undefined;
}

function randomHex(): string {
  return randomBytes(16).toString("hex");
}

function digest(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}
