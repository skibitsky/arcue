import { ArcueError, createMemoryChannel, serveImportWorker } from "@arcue/protocol";
import type { Importer } from "@arcue/scene";
import { ManualClock } from "./manual-clock";
import { basename, dirname, findGitRoot, joinPath, normalizePath, pathInside } from "./paths";
import type { Clock, DirectoryEntry, FileChange, FileStat, ImportWorker, Platform } from "./platform";

type Entry =
  | { kind: "file"; data: Uint8Array; modifiedMs: number }
  | { kind: "directory"; modifiedMs: number }
  | { kind: "symlink"; target: string; modifiedMs: number };

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
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const MAX_LINKS = 40;

/**
 * A `Platform` held in memory, for tests and for the web host. Watchers hear about changes made through it,
 * one microtask later. Symbolic links resolve as on a real file system, with the lstat semantics `Platform` describes.
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

  constructor(options: MemoryPlatformOptions = {}) {
    this.clock = options.clock ?? new ManualClock();
    this.appDataDir = normalizePath(options.appDataDir ?? "/app-data");
    this.#clipboardAvailable = options.clipboard === "available";
    this.#importers = options.importers ?? [];
    this.#startImportWorker = options.startImportWorker;
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
      if (entryPath !== folder && dirname(entryPath) === folder)
        entries.push({ name: basename(entryPath), kind: entry.kind });
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

function rootOf(path: string): string {
  return /^\/\/[^/]+\/[^/]+\//.exec(path)?.[0] ?? /^[A-Z]:\//.exec(path)?.[0] ?? "/";
}

function notFound(path: string): ArcueError {
  return new ArcueError("not-found", `${path} does not exist.`);
}
