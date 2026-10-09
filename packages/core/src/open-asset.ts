import type { AssetStatus, AssetSummary, Comment, ReviewFile, ViewState } from "@arcue/protocol";
import { ArcueError } from "@arcue/protocol";
import type { SceneDescription } from "@arcue/scene";
import { basename } from "./paths";
import type { ReviewSession } from "./review-session";
import type { ReviewLocation } from "./review-store";
import { Serial } from "./serial";

/** Everything the core holds for one open asset. */
export class OpenAsset {
  readonly id: string;
  /** Normalized absolute path of the asset file. */
  readonly path: string;
  readonly location: ReviewLocation;
  readonly session: ReviewSession;
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
  cancelStabilityCheck: () => void = () => undefined;
  stabilityCheck = 0;

  constructor(id: string, path: string, location: ReviewLocation, session: ReviewSession) {
    this.id = id;
    this.path = path;
    this.location = location;
    this.session = session;
  }

  get name(): string {
    return basename(this.path);
  }

  get summary(): AssetSummary {
    return {
      assetId: this.id,
      path: this.path,
      name: this.name,
      status: this.status,
      version: this.version,
      error: this.error,
    };
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
