import { watch } from "node:fs";
import { lstat } from "node:fs/promises";

/** Starts watching a folder; throws when the system cannot watch it. */
export type WatchFolder = (
  folder: string,
  onChange: (name: string | null) => void,
  onError: () => void,
) => { close(): void };

export interface FolderListener {
  /** The file name to hear about, or null to hear about every change in the folder. */
  name: string | null;
  changed(): void;
  /** The folder's watch ended, as when the folder was removed, and the listener no longer hears anything. */
  ended(): void;
}

interface WatchedFolder {
  stop: () => void;
  named: Map<string, Set<FolderListener>>;
  everything: Set<FolderListener>;
}

export const watchWithNode: WatchFolder = (folder, onChange, onError) => {
  const watcher = watch(folder, { persistent: false }, (_event, changed) =>
    onChange(changed === null ? null : changed.toString()),
  );
  watcher.on("error", onError);
  return watcher;
};

export async function isFolder(path: string): Promise<boolean> {
  try {
    return (await lstat(path)).isDirectory();
  } catch {
    return false;
  }
}

/**
 * One system watch per folder, shared by every file watched in it. A change reaches only the listeners of that file
 * name and those that hear everything. Each change also checks once whether the folder is gone, since Linux ends the
 * watch of a removed folder without an error, and then ends every listener's watch.
 */
export class FolderWatchers {
  readonly #folders = new Map<string, WatchedFolder>();
  readonly #watch: WatchFolder;
  readonly #isFolder: (path: string) => Promise<boolean>;

  constructor(watchFolder: WatchFolder = watchWithNode, folderExists: (path: string) => Promise<boolean> = isFolder) {
    this.#watch = watchFolder;
    this.#isFolder = folderExists;
  }

  /** Starts hearing about a folder's changes; throws when the system cannot watch it. Returns the way to stop. */
  listen(folder: string, listener: FolderListener): () => void {
    const watched = this.#folders.get(folder) ?? this.#open(folder);
    if (listener.name === null) watched.everything.add(listener);
    else {
      const named = watched.named.get(listener.name) ?? new Set();
      named.add(listener);
      watched.named.set(listener.name, named);
    }
    return () => {
      if (listener.name === null) watched.everything.delete(listener);
      else {
        const named = watched.named.get(listener.name);
        named?.delete(listener);
        if (named?.size === 0) watched.named.delete(listener.name);
      }
      if (watched.everything.size === 0 && watched.named.size === 0) this.#close(folder, watched);
    };
  }

  #open(folder: string): WatchedFolder {
    const watched: WatchedFolder = { stop: () => undefined, named: new Map(), everything: new Set() };
    const handle = this.#watch(
      folder,
      (name) => this.#changed(folder, watched, name),
      () => this.#end(folder, watched),
    );
    watched.stop = () => handle.close();
    this.#folders.set(folder, watched);
    return watched;
  }

  #changed(folder: string, watched: WatchedFolder, name: string | null): void {
    if (this.#folders.get(folder) !== watched) return;
    for (const listener of [...watched.everything]) listener.changed();
    const named = name === null ? [...watched.named.values()].flatMap((set) => [...set]) : watched.named.get(name);
    for (const listener of [...(named ?? [])]) listener.changed();
    void this.#endIfGone(folder, watched);
  }

  async #endIfGone(folder: string, watched: WatchedFolder): Promise<void> {
    if (!(await this.#isFolder(folder))) this.#end(folder, watched);
  }

  #end(folder: string, watched: WatchedFolder): void {
    if (this.#folders.get(folder) !== watched) return;
    this.#close(folder, watched);
    const listeners = [...watched.everything, ...[...watched.named.values()].flatMap((set) => [...set])];
    watched.everything.clear();
    watched.named.clear();
    for (const listener of listeners) listener.ended();
  }

  #close(folder: string, watched: WatchedFolder): void {
    if (this.#folders.get(folder) === watched) this.#folders.delete(folder);
    watched.stop();
  }
}
