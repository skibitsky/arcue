import type { MessageEndpoint } from "@arcue/protocol";

/** A "symlink" entry is a symbolic link, or on Windows a junction, reported as itself and never followed. */
export type EntryKind = "file" | "directory" | "symlink";

export interface FileStat {
  kind: EntryKind;
  size: number;
  modifiedMs: number;
}

export interface DirectoryEntry {
  name: string;
  kind: EntryKind;
}

export interface FileChange {
  kind: "created" | "changed" | "removed";
  path: string;
}

export interface Clock {
  /** Milliseconds since the Unix epoch. */
  now(): number;
  /** Calls `callback` once after `delayMs`; the returned function cancels it. */
  setTimer(delayMs: number, callback: () => void): () => void;
}

/** A started import worker. The core talks to it with the requests in `importRequests`. */
export interface ImportWorker {
  endpoint: MessageEndpoint;
  terminate(): void;
}

/**
 * Everything the core needs from its host, and the only way it reaches files, time, workers or the clipboard.
 * Paths are absolute and use "/" separators, such as "/work/game/Hero.fbx", "C:/work/Hero.fbx" or
 * "//server/share/Hero.fbx". Missing paths reject with an `ArcueError` whose code is "not-found".
 *
 * `stat`, `exists`, `list` and `remove` have lstat semantics: a symbolic link at the path itself is reported, checked
 * or removed as a link and never followed, as Node's `fs.lstat` does. Links in the folders above the path, and in
 * `readFile`, `readText`, `writeFile` and `mkdir`, are followed as the host's file system follows them. The core
 * checks every path it takes from an asset or a review file for links before reading it.
 */
export interface Platform {
  readFile(path: string): Promise<Uint8Array>;
  readText(path: string): Promise<string>;
  /** Creates missing parent folders. */
  writeFile(path: string, data: Uint8Array | string): Promise<void>;
  /** Writes a temporary file and renames it into place, so no reader sees a partial file. Creates missing parent folders. */
  writeFileAtomic(path: string, data: Uint8Array | string): Promise<void>;
  exists(path: string): Promise<boolean>;
  stat(path: string): Promise<FileStat | null>;
  /** Creates a folder and its missing parents. Does nothing when the folder exists. */
  mkdir(path: string): Promise<void>;
  /** Entries directly inside a folder, sorted by name. Links are listed with the kind "symlink". */
  list(path: string): Promise<DirectoryEntry[]>;
  /** Removes a file, or a folder with everything in it. Does nothing when the path does not exist. */
  remove(path: string): Promise<void>;
  /**
   * Moves a file, or a folder with everything in it, in one step, and creates the missing folders above `to`. It never
   * replaces anything: when `to` exists it rejects with "conflict" and moves nothing. A link at `from` moves as a link.
   */
  rename(from: string, to: string): Promise<void>;
  /**
   * Calls the listener when the file at `path` is created, changed or removed. The returned function stops watching.
   * Changes arrive asynchronously, possibly more than once for one write, and an atomic replace may arrive as a
   * removal followed by a creation, so the core treats every change as "check the file again".
   */
  watch(path: string, listener: (change: FileChange) => void): () => void;
  /** Root of the git repository that contains `path`, or null when there is none. */
  findWorkspaceRoot(path: string): Promise<string | null>;
  /** Where review data goes for assets outside any git repository. */
  readonly appDataDir: string;
  readonly clock: Clock;
  /** Starts a worker that runs importers, isolated from the core's state and files. */
  startImportWorker(): ImportWorker;
  /** Rejects when the host cannot reach the clipboard; the window then writes the text itself. */
  writeClipboard(text: string): Promise<void>;
}
