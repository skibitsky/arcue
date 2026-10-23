import { ArcueError, createMemoryChannel, serveImportWorker } from "@arcue/protocol";
import type { Importer } from "@arcue/scene";
import { ManualClock } from "./manual-clock";
import { dirname, findGitRoot, joinPath, normalizePath, pathInside } from "./paths";
import type { Clock, DirectoryEntry, FileChange, FileStat, ImportWorker, Platform, Unlock } from "./platform";

type Entry =
  | { kind: "file"; data: Uint8Array; modifiedMs: number }
  | { kind: "directory"; modifiedMs: number }
  | { kind: "symlink"; target: string; modifiedMs: number };

interface LockWaiter {
  grant(): void;
  timeOut(): void;
  cancelTimer?: () => void;
}

interface LockQueue {
  held: boolean;
  waiters: LockWaiter[];
}

export interface MemoryPlatformOptions {
  /** Initial files by absolute path. */
  files?: Record<string, Uint8Array | string>;
  /** Initial symbolic links, from the link's absolute path to its target, absolute or relative to the link's folder. */
  symlinks?: Record<string, string>;
  appDataDir?: string;
  /** Defaults to a `ManualClock`. */
  clock?: Clock;
  /**
   * Defaults to "unavailable", where `writeClipboard` rejects, as it does in the web host's worker.
   * "available" keeps the text in `clipboardText`.
   */
  clipboard?: "available" | "unavailable";
  /** Importers that `startImportWorker` runs in-process, behind a memory channel. */
  importers?: readonly Importer[];
  /**
   * Starts a real worker instead, such as the web host's Web Worker, so parsing does not block the core.
   * When given, `importers` is ignored.
   */
  startImportWorker?: () => ImportWorker;
  /**
   * How long the first waiter for a lock waits for its holder before it rejects as "timeout". Each waiter's wait starts
   * when it becomes first in line. Unset, a waiter waits forever and no timer is set.
   */
  lockTimeoutMs?: number;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const MAX_LINKS = 40;

/**
 * A `Platform` held in memory, for tests and for the web host. Watchers hear about changes made through it,
 * one microtask later. Symbolic links resolve as on a real file system, with the lstat semantics `Platform` describes.
 * Locks are kept in memory too: they create no files and notify no watcher.
 */
export class MemoryPlatform implements Platform {
  readonly appDataDir: string;
  readonly clock: Clock;
  clipboardText: string | null = null;
  readonly #entries = new Map<string, Entry>();
  readonly #watchers = new Map<string, Set<(change: FileChange) => void>>();
  readonly #clipboardAvailable: boolean;
  readonly #importers: readonly Importer[];
  readonly #startImportWorker: (() => ImportWorker) | undefined;
  readonly #locks = new Map<string, LockQueue>();
  readonly #lockTimeoutMs: number | undefined;

  constructor(options: MemoryPlatformOptions = {}) {
    this.clock = options.clock ?? new ManualClock();
    this.appDataDir = normalizePath(options.appDataDir ?? "/app-data");
    this.#clipboardAvailable = options.clipboard === "available";
    this.#importers = options.importers ?? [];
    this.#startImportWorker = options.startImportWorker;
    this.#lockTimeoutMs = options.lockTimeoutMs;
    for (const [path, data] of Object.entries(options.files ?? {})) this.#write(this.#resolve(path, true), data);
    for (const [path, target] of Object.entries(options.symlinks ?? {})) this.#link(path, target);
  }

  async readFile(path: string): Promise<Uint8Array> {
    return this.#file(path).data.slice();
  }

  async readText(path: string): Promise<string> {
    return decoder.decode(this.#file(path).data);
  }

  async writeFile(path: string, data: Uint8Array | string): Promise<void> {
    this.#write(this.#resolve(path, true), data);
  }

  /** Replaces a link at the path itself, as renaming a temporary file over it does. */
  async writeFileAtomic(path: string, data: Uint8Array | string): Promise<void> {
    this.#write(this.#resolve(path, false), data);
  }

  async exists(path: string): Promise<boolean> {
    return this.#entries.has(this.#resolve(path, false));
  }

  async stat(path: string): Promise<FileStat | null> {
    const entry = this.#entries.get(this.#resolve(path, false));
    if (!entry) return null;
    const size = entry.kind === "file" ? entry.data.byteLength : 0;
    return { kind: entry.kind, size, modifiedMs: entry.modifiedMs };
  }

  async mkdir(path: string): Promise<void> {
    this.#ensureDirectory(this.#resolve(path, true));
  }

  async list(path: string): Promise<DirectoryEntry[]> {
    const folder = this.#resolve(path, true);
    if (this.#entries.get(folder)?.kind !== "directory") throw notFound(folder);
    const entries: DirectoryEntry[] = [];
    for (const [entryPath, entry] of this.#entries) {
      const name = childName(folder, entryPath);
      if (name !== null) entries.push({ name, kind: entry.kind });
    }
    return entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  }

  async remove(path: string): Promise<void> {
    const target = this.#resolve(path, false);
    if (dirname(target) === target) throw new ArcueError("invalid-input", "The root folder cannot be removed.");
    for (const [entryPath, entry] of [...this.#entries]) {
      if (pathInside(target, entryPath) === null) continue;
      this.#entries.delete(entryPath);
      if (entry.kind === "file") this.#notify(entryPath, "removed");
    }
  }

  async removeEmptyFolder(path: string): Promise<void> {
    const folder = this.#resolve(path, false);
    if (this.#entries.get(folder)?.kind !== "directory") throw notFound(folder);
    if ([...this.#entries.keys()].some((entry) => childName(folder, entry) !== null)) {
      throw new ArcueError("conflict", `${folder} is not empty.`);
    }
    this.#entries.delete(folder);
  }

  async rename(from: string, to: string): Promise<void> {
    const source = this.#resolve(from, false);
    const target = this.#resolve(to, false);
    if (!this.#entries.has(source)) throw notFound(source);
    if (this.#entries.has(target)) throw new ArcueError("conflict", `${target} already exists.`);
    if (pathInside(source, target) !== null) throw new ArcueError("invalid-input", `${target} is inside ${source}.`);
    this.#ensureDirectory(dirname(target));
    const moved = [...this.#entries].flatMap(([path, entry]) => {
      const relative = pathInside(source, path);
      return relative === null ? [] : [{ path, entry, next: joinPath(target, relative) }];
    });
    for (const { path } of moved) this.#entries.delete(path);
    for (const { next, entry } of moved) this.#entries.set(next, entry);
    for (const { path, next, entry } of moved) {
      if (entry.kind !== "file") continue;
      this.#notify(path, "removed");
      this.#notify(next, "created");
    }
  }

  /** Creates a symbolic link at `path` to `target`, which is absolute or relative to the link's folder. */
  async symlink(path: string, target: string): Promise<void> {
    this.#link(path, target);
  }

  watch(path: string, listener: (change: FileChange) => void): () => void {
    const target = normalizePath(path);
    const listeners = this.#watchers.get(target) ?? new Set();
    this.#watchers.set(target, listeners);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  findWorkspaceRoot(path: string): Promise<string | null> {
    return findGitRoot(path, (candidate) => this.exists(candidate));
  }

  async lock(folder: string, name: string): Promise<Unlock> {
    const key = this.lockKey(folder, name);
    const queue = this.#locks.get(key) ?? { held: false, waiters: [] };
    this.#locks.set(key, queue);
    if (!queue.held) {
      queue.held = true;
      return this.#unlocker(key, queue);
    }
    return new Promise<Unlock>((resolve, reject) => {
      const waiter: LockWaiter = {
        grant: () => {
          waiter.cancelTimer?.();
          resolve(this.#unlocker(key, queue));
        },
        timeOut: () => {
          reject(
            new ArcueError(
              "timeout",
              `Another change kept the ${name} of ${folder} busy, so nothing was changed. Try again.`,
            ),
          );
        },
      };
      queue.waiters.push(waiter);
      if (queue.waiters.length === 1) this.#startWaiting(queue);
    });
  }

  /**
   * What tells one lock from another: the folder with the links in it resolved, in Unicode NFC and lower case, and the
   * lock's name. A folder that does not exist yet resolves as far as its existing parents do.
   */
  lockKey(folder: string, name: string): string {
    return `${this.#resolve(folder, true).normalize("NFC").toLowerCase()}\n${name}`;
  }

  /** The keys of the locks someone holds, for tests. */
  heldLocks(): string[] {
    return [...this.#locks].flatMap(([key, queue]) => (queue.held ? [key] : []));
  }

  /** How many wait for the lock with this key, for tests. */
  lockWaiters(key: string): number {
    return this.#locks.get(key)?.waiters.length ?? 0;
  }

  startImportWorker(): ImportWorker {
    if (this.#startImportWorker) return this.#startImportWorker();
    const [coreSide, workerSide] = createMemoryChannel();
    serveImportWorker(workerSide, this.#importers);
    return { endpoint: coreSide, terminate: () => coreSide.close() };
  }

  async writeClipboard(text: string): Promise<void> {
    if (!this.#clipboardAvailable) throw new ArcueError("unavailable", "This platform has no clipboard.");
    this.clipboardText = text;
  }

  /** Hands the lock to its first waiter, or frees it when none waits. A second call does nothing. */
  #unlocker(key: string, queue: LockQueue): Unlock {
    let released = false;
    return async () => {
      if (released) return;
      released = true;
      const next = queue.waiters.shift();
      if (next) {
        next.grant();
        this.#startWaiting(queue);
        return;
      }
      queue.held = false;
      if (this.#locks.get(key) === queue) this.#locks.delete(key);
    };
  }

  /** Starts the timeout of the lock's first waiter, which has just become first in line. */
  #startWaiting(queue: LockQueue): void {
    const first = queue.waiters[0];
    if (!first || this.#lockTimeoutMs === undefined) return;
    first.cancelTimer = this.clock.setTimer(this.#lockTimeoutMs, () => {
      if (queue.waiters[0] !== first) return;
      queue.waiters.shift();
      first.timeOut();
      this.#startWaiting(queue);
    });
  }

  /** The path with each link in its folders replaced by the link's target, and a link at the end too when asked. */
  #resolve(path: string, followLast: boolean): string {
    let pending = normalizePath(path);
    for (let hops = 0; hops <= MAX_LINKS; hops++) {
      const root = rootOf(pending);
      const parts = pending.slice(root.length).split("/").filter(Boolean);
      let current = root;
      let replaced: string | null = null;
      for (const [index, part] of parts.entries()) {
        current = current.endsWith("/") ? current + part : `${current}/${part}`;
        const entry = this.#entries.get(current);
        if (entry?.kind === "symlink" && (index < parts.length - 1 || followLast)) {
          replaced = joinPath(entry.target, ...parts.slice(index + 1));
          break;
        }
      }
      if (replaced === null) return pending;
      pending = replaced;
    }
    throw new ArcueError("invalid-input", `Too many symbolic links in ${path}.`);
  }

  #link(path: string, target: string): void {
    const link = this.#resolve(path, false);
    if (this.#entries.has(link)) throw new ArcueError("conflict", `${link} already exists.`);
    this.#ensureDirectory(dirname(link));
    const absolute = /^(?:[A-Za-z]:)?[/\\]/.test(target) ? normalizePath(target) : joinPath(dirname(link), target);
    this.#entries.set(link, { kind: "symlink", target: absolute, modifiedMs: this.clock.now() });
  }

  #file(path: string): { data: Uint8Array } {
    const entry = this.#entries.get(this.#resolve(path, true));
    if (entry?.kind !== "file") throw notFound(normalizePath(path));
    return entry;
  }

  #write(target: string, data: Uint8Array | string): void {
    const existing = this.#entries.get(target);
    if (existing?.kind === "directory") throw new ArcueError("conflict", `${target} is a folder.`);
    this.#ensureDirectory(dirname(target));
    const bytes = typeof data === "string" ? encoder.encode(data) : data.slice();
    this.#entries.set(target, { kind: "file", data: bytes, modifiedMs: this.clock.now() });
    this.#notify(target, existing ? "changed" : "created");
  }

  #ensureDirectory(path: string): void {
    const existing = this.#entries.get(path);
    if (existing?.kind === "directory") return;
    if (existing) throw new ArcueError("conflict", `${path} is a file, not a folder.`);
    const parent = dirname(path);
    if (parent !== path) this.#ensureDirectory(parent);
    this.#entries.set(path, { kind: "directory", modifiedMs: this.clock.now() });
  }

  #notify(path: string, kind: FileChange["kind"]): void {
    void Promise.resolve().then(() => {
      for (const listener of [...(this.#watchers.get(path) ?? [])]) listener({ kind, path });
    });
  }
}

function childName(folder: string, path: string): string | null {
  const prefix = folder.endsWith("/") ? folder : `${folder}/`;
  if (path.length <= prefix.length || !path.startsWith(prefix) || path.includes("/", prefix.length)) return null;
  return path.slice(prefix.length);
}

function rootOf(path: string): string {
  return /^\/\/[^/]+\/[^/]+\//.exec(path)?.[0] ?? /^[A-Z]:\//.exec(path)?.[0] ?? "/";
}

function notFound(path: string): ArcueError {
  return new ArcueError("not-found", `${path} does not exist.`);
}
