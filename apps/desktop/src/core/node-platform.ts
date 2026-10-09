import { randomUUID } from "node:crypto";
import type { FSWatcher, Stats } from "node:fs";
import { unwatchFile, watchFile, watch as watchFolder } from "node:fs";
import { lstat, mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import type { Clock, DirectoryEntry, EntryKind, FileChange, FileStat, ImportWorker, Platform } from "@arcue/core";
import { basename, dirname, findGitRoot, joinPath, normalizePath } from "@arcue/core";
import { ArcueError } from "@arcue/protocol";
import type { PathStyle } from "./native-paths";
import { hostPathStyle, toNativePath } from "./native-paths";

export interface NodePlatformOptions {
  /** Where review data goes for assets outside a git repository; the desktop app passes a folder in its user data. */
  appDataDir: string;
  startImportWorker: () => ImportWorker;
  /** Writes text to the system clipboard. Without it, `writeClipboard` rejects and the window writes the text. */
  writeClipboard?: (text: string) => Promise<void>;
  clock?: Clock;
  /** Defaults to the host's. Tests use it to check Windows path handling. */
  pathStyle?: PathStyle;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  setTimer(delayMs, callback) {
    const handle = setTimeout(callback, delayMs);
    return () => clearTimeout(handle);
  },
};

const RENAME_ATTEMPTS = 5;
const POLL_INTERVAL_MS = 1000;

/** The `Platform` on Node's file system. Paths use "/" separators on every system and are converted at the edge. */
export class NodePlatform implements Platform {
  readonly appDataDir: string;
  readonly clock: Clock;
  readonly #startImportWorker: () => ImportWorker;
  readonly #writeClipboard: ((text: string) => Promise<void>) | null;
  readonly #style: PathStyle;

  constructor(options: NodePlatformOptions) {
    this.#style = options.pathStyle ?? hostPathStyle;
    this.appDataDir = normalizePath(options.appDataDir);
    this.clock = options.clock ?? systemClock;
    this.#startImportWorker = options.startImportWorker;
    this.#writeClipboard = options.writeClipboard ?? null;
  }

  async readFile(path: string): Promise<Uint8Array> {
    const bytes = await this.#call(path, (native) => readFile(native));
    return new Uint8Array(bytes);
  }

  readText(path: string): Promise<string> {
    return this.#call(path, (native) => readFile(native, "utf8"));
  }

  async writeFile(path: string, data: Uint8Array | string): Promise<void> {
    await this.mkdir(dirname(path));
    await this.#call(path, (native) => writeFile(native, data));
  }

  async writeFileAtomic(path: string, data: Uint8Array | string): Promise<void> {
    await this.mkdir(dirname(path));
    const temporary = joinPath(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
    try {
      await this.#call(temporary, (native) => writeFile(native, data, { flush: true }));
      await this.#call(path, (native) => renameWithRetry(this.#native(temporary), native));
    } catch (error) {
      await rm(this.#native(temporary), { force: true }).catch(() => undefined);
      throw error;
    }
  }

  async exists(path: string): Promise<boolean> {
    return (await this.stat(path)) !== null;
  }

  async stat(path: string): Promise<FileStat | null> {
    const stats = await this.#lstat(path);
    if (!stats) return null;
    const kind = kindOf(stats);
    return { kind, size: kind === "file" ? stats.size : 0, modifiedMs: stats.mtimeMs };
  }

  async mkdir(path: string): Promise<void> {
    await this.#call(path, (native) => mkdir(native, { recursive: true }));
  }

  async list(path: string): Promise<DirectoryEntry[]> {
    const entries = await this.#call(path, (native) => readdir(native, { withFileTypes: true }));
    return entries
      .map((entry): DirectoryEntry => ({ name: entry.name, kind: kindOf(entry) }))
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  }

  async remove(path: string): Promise<void> {
    const target = normalizePath(path);
    if (dirname(target) === target) throw new ArcueError("invalid-input", "The root folder cannot be removed.");
    await this.#call(target, (native) => rm(native, { recursive: true, force: true }));
  }

  watch(path: string, listener: (change: FileChange) => void): () => void {
    return watchPath(normalizePath(path), (native) => this.#native(native), listener);
  }

  findWorkspaceRoot(path: string): Promise<string | null> {
    return findGitRoot(path, (candidate) => this.exists(candidate));
  }

  startImportWorker(): ImportWorker {
    return this.#startImportWorker();
  }

  async writeClipboard(text: string): Promise<void> {
    if (!this.#writeClipboard) throw new ArcueError("unavailable", "This host has no clipboard; the window writes it.");
    await this.#writeClipboard(text);
  }

  #native(path: string): string {
    return toNativePath(path, this.#style);
  }

  async #lstat(path: string): Promise<Stats | null> {
    try {
      return await lstat(this.#native(path));
    } catch (error) {
      if (isMissing(error)) return null;
      throw toArcueError(error, path);
    }
  }

  async #call<Value>(path: string, action: (native: string) => Promise<Value>): Promise<Value> {
    try {
      return await action(this.#native(path));
    } catch (error) {
      throw toArcueError(error, path);
    }
  }
}

function kindOf(entry: { isSymbolicLink(): boolean; isDirectory(): boolean }): EntryKind {
  if (entry.isSymbolicLink()) return "symlink";
  return entry.isDirectory() ? "directory" : "file";
}

function codeOf(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
    ? error.code
    : undefined;
}

function isMissing(error: unknown): boolean {
  const code = codeOf(error);
  return code === "ENOENT" || code === "ENOTDIR";
}

function toArcueError(error: unknown, path: string): ArcueError {
  if (error instanceof ArcueError) return error;
  const code = codeOf(error);
  const message = error instanceof Error ? error.message : String(error);
  if (isMissing(error)) return new ArcueError("not-found", `${path} does not exist.`, { cause: error });
  if (code === "EISDIR" || code === "EEXIST" || code === "ENOTEMPTY") {
    return new ArcueError("conflict", `${path}: ${message}`, { cause: error });
  }
  if (code === "EACCES" || code === "EPERM")
    return new ArcueError("forbidden", `${path}: ${message}`, { cause: error });
  return new ArcueError("internal", `${path}: ${message}`, { cause: error });
}

/** Windows refuses a rename while another program, such as a virus scanner, holds the target open; it retries. */
async function renameWithRetry(from: string, to: string): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await rename(from, to);
      return;
    } catch (error) {
      const code = codeOf(error);
      if (attempt >= RENAME_ATTEMPTS || (code !== "EPERM" && code !== "EACCES" && code !== "EBUSY")) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 20));
    }
  }
}

/**
 * Watches the folder that holds `path`, which also sees an atomic replace, as a removal and creation or as a rename.
 * While that folder does not exist yet, it watches the nearest folder above it and moves down as folders appear.
 * When the system cannot watch at all, it polls.
 */
function watchPath(path: string, native: (path: string) => string, listener: (change: FileChange) => void): () => void {
  const name = basename(path);
  const parent = dirname(path);
  let watcher: FSWatcher | null = null;
  let watching: string | null = null;
  let polling = false;
  let stopped = false;
  let existed: boolean | null = null;
  let checking = Promise.resolve();

  const report = () => {
    checking = checking.then(async () => {
      const present = await lstat(native(path)).then(
        () => true,
        () => false,
      );
      if (stopped) return;
      if (!present) void arm();
      const before = existed;
      existed = present;
      if (!present && before === false) return;
      listener({ path, kind: !present ? "removed" : before ? "changed" : "created" });
    });
  };

  const poll = () => {
    if (polling) return;
    polling = true;
    watchFile(native(path), { interval: POLL_INTERVAL_MS }, report);
  };

  /** Linux ends the watch on a removed folder without an error, so watching moves up when the folder is gone. */
  const rearmIfGone = async (folder: string) => {
    if ((await isFolder(native(folder))) || stopped || watching !== folder) return;
    watcher?.close();
    watcher = null;
    watching = null;
    await arm();
    report();
  };

  const arm = async () => {
    let folder = parent;
    while (!(await isFolder(native(folder)))) {
      const up = dirname(folder);
      if (up === folder) return poll();
      folder = up;
    }
    if (stopped || folder === watching) return;
    watcher?.close();
    watching = folder;
    try {
      watcher = watchFolder(native(folder), { persistent: false }, (_event, changed) => {
        if (folder !== parent) {
          void arm().then(report);
          return;
        }
        if (changed === null || changed.toString() === name) report();
        else void rearmIfGone(folder);
      });
      watcher.on("error", () => {
        watcher?.close();
        watcher = null;
        watching = null;
        void arm();
      });
    } catch {
      watcher = null;
      watching = null;
      poll();
    }
  };

  void lstat(native(path)).then(
    () => {
      existed ??= true;
    },
    () => {
      existed ??= false;
    },
  );
  void arm();
  return () => {
    stopped = true;
    watcher?.close();
    if (polling) unwatchFile(native(path), report);
  };
}

async function isFolder(path: string): Promise<boolean> {
  try {
    return (await lstat(path)).isDirectory();
  } catch {
    return false;
  }
}
