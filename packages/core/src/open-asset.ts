import type { AssetStatus, AssetSummary, Comment, ReviewCandidate, ReviewFile, ViewState } from "@arcue/protocol";
import { ArcueError } from "@arcue/protocol";
import type { SceneDescription } from "@arcue/scene";
import type { FileStats } from "./composition-load";
import type { ImportFiles } from "./import-files";
import { basename, dirname } from "./paths";
import type { EarlierReview } from "./relink";
import type { ReviewSession } from "./review-session";
import type { ReviewLocation } from "./review-store";
import { compositionFilePath } from "./review-store";
import { Serial } from "./serial";

/** How long background work that met a held reviews lock waits before its first retry. */
export const FIRST_RETRY_MS = 1000;

/** The longest wait between two retries. */
export const LAST_RETRY_MS = 30_000;

/** Where to show an asset in its tab, as `asset.open` asks. */
export interface ShowAt {
  clip?: string | undefined;
  frame?: number | undefined;
}

/** Everything the core holds for one open asset. */
export class OpenAsset {
  readonly id: string;
  /** Normalized absolute path of the asset file. It changes only when the asset follows its file to a new path. */
  path: string;
  /** The model's composition file, `composition.json` in its review folder. */
  compositionPath: string;
  location: ReviewLocation;
  readonly session: ReviewSession;
  /** Earlier reviews that may belong to the asset, best first, as `review.candidates` lists them. */
  candidates: ReviewCandidate[] = [];
  /** Earlier reviews to compare the meshes of the first version with, until it loads. */
  earlier: EarlierReview[] = [];
  /** The full hash and size of the model file the version on screen was read from. */
  identity: { hash: string; size: number } | null = null;
  /**
   * The names of the files with the model's extension in its folder when the model last loaded, so a rename shows as a
   * name not among them. Null before the first load, and when there were more than the core checks for a rename.
   */
  siblings: ReadonlySet<string> | null = null;
  /** The model file stayed missing after a change, and no file in its folder could be followed. */
  missing = false;
  /** Lost composition files already looked for under a new name, by path, until the next `asset.reload`. */
  readonly searched = new Set<string>();
  /** The composition file applied to the version on screen, or null for a plain model. */
  composition: string | null = null;
  status: AssetStatus = "loading";
  version: string | null = null;
  scene: SceneDescription | null = null;
  error: string | null = null;
  viewState: ViewState | null = null;
  /** The connection of the window that shows the asset. */
  window: string | null = null;
  /**
   * The agent session's view the asset belongs to, or null for none: the view of the window that shows it, or of the
   * page the core holds it for. It stays when that page closes, so the page takes the asset back when it reloads.
   */
  view: string | null = null;
  /** The clip and frame an open asked for while the core held the asset, for the page that shows it later. */
  waiting: ShowAt | null = null;
  closed = false;
  /** Set while `asset.close` waits for the edits in flight. */
  closing: Promise<void> | null = null;
  /** Serializes parses of the file. */
  readonly loads = new Serial();
  readonly stopWatching: (() => void)[] = [];
  /** Watchers of the composition file and the files it names, by path. */
  readonly compositionWatchers = new Map<string, () => void>();
  /** Parsed files by path with the id of the bytes they came from, so a reload parses only what changed. */
  readonly imported = new Map<string, { id: string; scene: SceneDescription; files: ImportFiles }>();
  /** The model and the files of its composition, by path, as the version on screen loaded them. */
  loadedFiles: ReadonlySet<string> = new Set();
  /** The sizes and modification times of the files the version on screen was read from, by path. */
  loadedStats: FileStats = new Map();
  /** Cancels the retry of background work that met a held reviews lock. */
  cancelRetry: () => void = () => undefined;
  /** How long until that work is tried again, doubling with each try. */
  retryDelayMs = FIRST_RETRY_MS;
  /**
   * Comments another Arcue saved wait to move onto the version on screen, because its files changed on disk; the next
   * load moves them, even when it reads the same version.
   */
  reanchorPending = false;
  /** The file `composition.fileRoles` read last, whose parse stays until the next question so adding it reads it once. */
  asked: string | null = null;
  /** Serializes edits of the composition file. */
  readonly compositionEdits = new Serial();
  cancelStabilityCheck: () => void = () => undefined;
  stabilityCheck = 0;

  constructor(id: string, path: string, location: ReviewLocation, session: ReviewSession) {
    this.id = id;
    this.path = path;
    this.location = location;
    this.session = session;
    this.compositionPath = compositionFilePath(location);
  }

  /** Points the asset at its model's new path and review folder, keeping its id and the model's parsed scene. */
  relocate(path: string, location: ReviewLocation): void {
    const parsed = this.imported.get(this.path);
    this.imported.delete(this.path);
    if (parsed) this.imported.set(path, parsed);
    this.path = path;
    this.location = location;
    this.compositionPath = compositionFilePath(location);
  }

  /** The folder the asset's files may be read from; see `readRootFor`. */
  get readRoot(): string {
    return readRootFor(this.location.workspaceRoot, this.path);
  }

  /** The scene parsed from these bytes of the file before, if any. */
  parsed(path: string, id: string): SceneDescription | null {
    const cached = this.imported.get(path);
    return cached?.id === id ? cached.scene : null;
  }

  get name(): string {
    return basename(this.path);
  }

  get summary(): AssetSummary {
    const summary: AssetSummary = {
      assetId: this.id,
      path: this.path,
      name: this.name,
      status: this.status,
      version: this.version,
      error: this.error,
    };
    if (this.composition !== null) summary.composition = this.composition;
    return summary;
  }

  loaded(): { scene: SceneDescription; version: string } {
    if (!this.scene || this.version === null) throw new ArcueError("unavailable", `${this.name} has not loaded yet.`);
    return { scene: this.scene, version: this.version };
  }

  /** The loaded scene, after checking that a target or time was picked on the version on screen. */
  pickedOn(version: string): { scene: SceneDescription; version: string } {
    const loaded = this.loaded();
    if (version !== loaded.version) {
      throw new ArcueError(
        "conflict",
        `The target was picked on version ${version}, but ${this.name} now shows ${loaded.version}. Pick it again.`,
      );
    }
    return loaded;
  }
}

/** The folder an asset's files may be read from: its git repository, or outside one the model's own folder. */
export function readRootFor(workspaceRoot: string | null, modelPath: string): string {
  return workspaceRoot ?? dirname(modelPath);
}

export function findComment(review: ReviewFile, commentId: string): Comment {
  const comment = review.comments.find((entry) => entry.id === commentId);
  if (!comment) throw new ArcueError("not-found", `There is no comment ${commentId}.`);
  return comment;
}
