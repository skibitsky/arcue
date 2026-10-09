import type { AssetStatus, AssetSummary, Comment, ReviewFile, ViewState } from "@arcue/protocol";
import { ArcueError } from "@arcue/protocol";
import type { SceneDescription } from "@arcue/scene";
import { basename, dirname } from "./paths";
import type { ReviewSession } from "./review-session";
import type { ReviewLocation } from "./review-store";
import { Serial } from "./serial";

/** Everything the core holds for one open asset. */
export class OpenAsset {
  readonly id: string;
  /** Normalized absolute path of the asset file. */
  readonly path: string;
  /** The composition file the asset reads: the one it was opened through, or "<model stem>.arcue" beside it. */
  readonly compositionPath: string;
  readonly location: ReviewLocation;
  readonly session: ReviewSession;
  /** The composition file applied to the version on screen, or null for a plain model. */
  composition: string | null = null;
  status: AssetStatus = "loading";
  version: string | null = null;
  scene: SceneDescription | null = null;
  error: string | null = null;
  viewState: ViewState | null = null;
  /** The connection of the window that shows the asset. */
  window: string | null = null;
  closed = false;
  /** Set while `asset.close` waits for the edits in flight. */
  closing: Promise<void> | null = null;
  /** Serializes parses of the file. */
  readonly loads = new Serial();
  readonly stopWatching: (() => void)[] = [];
  /** Watchers of the composition file and the files it names, by path. */
  readonly compositionWatchers = new Map<string, () => void>();
  /** Parsed files by path with the id of the bytes they came from, so a reload parses only what changed. */
  readonly imported = new Map<string, { id: string; scene: SceneDescription }>();
  /** Serializes edits of the composition file. */
  readonly compositionEdits = new Serial();
  cancelStabilityCheck: () => void = () => undefined;
  stabilityCheck = 0;

  constructor(id: string, path: string, location: ReviewLocation, session: ReviewSession, compositionPath: string) {
    this.id = id;
    this.path = path;
    this.location = location;
    this.session = session;
    this.compositionPath = compositionPath;
  }

  /** The folder the asset's files may be read from: its git repository, or the model's folder outside one. */
  get readRoot(): string {
    return this.location.workspaceRoot ?? dirname(this.path);
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

export function findComment(review: ReviewFile, commentId: string): Comment {
  const comment = review.comments.find((entry) => entry.id === commentId);
  if (!comment) throw new ArcueError("not-found", `There is no comment ${commentId}.`);
  return comment;
}
