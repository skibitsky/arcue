import type { ReviewFile } from "@arcue/protocol";
import { ArcueError } from "@arcue/protocol";
import { contentHash } from "./hash";
import type { ReviewEdit } from "./history";
import { ReviewHistory } from "./history";
import { basename } from "./paths";
import type { Platform } from "./platform";
import type { ReviewLocation } from "./review-store";
import {
  checkReviewPath,
  checkSavable,
  isNewerFormat,
  lockReviews,
  modelPathOf,
  parseReview,
  prepareArcueFolder,
  reviewFilePath,
  savedReview,
  serializeReview,
} from "./review-store";
import { Serial } from "./serial";

/** What one command does to the review. */
export interface ReviewChange<Result> {
  /** The review to save, or null when it does not change, as when only the composition file changed. */
  next: ReviewFile | null;
  result: Result;
  /** Makes the change undoable. */
  edit?: ReviewEdit;
  /** Ends the undo history, as copying a round does. */
  clearHistory?: boolean;
  /** Writes other files the change needs, after the review on disk was checked and before it is saved. */
  prepare?: () => Promise<void>;
  /** Removes what `prepare` wrote, when `prepare` or the save fails. */
  rollback?: () => Promise<void>;
  /** Runs once the change is saved and current. */
  apply?: () => void;
  /**
   * Runs once the change is saved, while the reviews lock is still held, for removals that are safe only while no other
   * core can write. It must not reject; it reports its own errors.
   */
  afterSave?: () => Promise<void>;
}

export interface ReviewSessionOptions {
  /**
   * Called when the session takes in a review another program saved, with the review it replaced; never for the
   * session's own saves and moves.
   */
  adopted?: (review: ReviewFile, before: ReviewFile) => void;
}

export type ComputeChange<Result> = (review: ReviewFile) => ReviewChange<Result> | Promise<ReviewChange<Result>>;

const ATTEMPTS = 3;
const encoder = new TextEncoder();

/**
 * One asset's `review.json` while the asset is open. Changes run one at a time. Each starts from the file on disk:
 * when another program changed it, the session adopts that content, drops the undo history, and computes the change
 * from it. Just before saving it checks the file again and starts over if it moved. Each save adds one to the
 * review's `revision` and records this build's format. A change that would write the text the file already holds,
 * and no other file, is not saved. A review a newer Arcue saved can be read but not changed: a change that would save
 * it is refused, so the fields this build does not know stay in the file. Each change and move holds the reviews lock
 * from its first read to its last write. A change that would create review.json while the model is gone is refused,
 * since another core moved the review.
 */
export class ReviewSession {
  readonly history = new ReviewHistory();
  readonly #platform: Platform;
  #location: ReviewLocation;
  #path: string;
  readonly #changed: (review: ReviewFile) => void;
  readonly #adopted: ((review: ReviewFile, before: ReviewFile) => void) | undefined;
  readonly #edits = new Serial();
  #review: ReviewFile;
  /** Hash of the file's text as this session last read or wrote it; null when there is no file. */
  #diskHash: string | null;
  #closed = false;
  /** Why the session no longer saves: its review folder moved away and could not be moved back. */
  #stranded: string | null = null;

  constructor(
    platform: Platform,
    location: ReviewLocation,
    loaded: { review: ReviewFile; text: string | null },
    changed: (review: ReviewFile) => void,
    options: ReviewSessionOptions = {},
  ) {
    this.#platform = platform;
    this.#location = location;
    this.#path = reviewFilePath(location);
    this.#review = loaded.review;
    this.#diskHash = loaded.text === null ? null : textHash(loaded.text);
    this.#changed = changed;
    this.#adopted = options.adopted;
  }

  get review(): ReviewFile {
    return this.#review;
  }

  run<Result>(compute: ComputeChange<Result>): Promise<Result> {
    return this.#edits.run(async () => {
      this.#checkUsable();
      const unlock = await lockReviews(this.#platform, this.#location);
      try {
        return await this.#runLocked(compute);
      } finally {
        await unlock();
      }
    });
  }

  async #runLocked<Result>(compute: ComputeChange<Result>): Promise<Result> {
    for (let attempt = 1; ; attempt++) {
      this.#checkUsable();
      await this.#sync();
      if (this.#diskHash === null) await this.#checkModelThere();
      const current = this.#review;
      const change = await compute(current);
      if (change.next === null || (!change.prepare && !change.clearHistory && this.#unchanged(change.next, current))) {
        change.apply?.();
        if (change.edit) this.history.record(change.edit);
        return change.result;
      }
      const next = savedReview(change.next, current.revision + 1);
      const text = serializeReview(next);
      if ((await this.#readDisk()).hash !== this.#diskHash) {
        if (attempt < ATTEMPTS) continue;
        throw new ArcueError("conflict", "review.json keeps changing on disk; try again.");
      }
      checkSavable(current, this.#location);
      await prepareArcueFolder(this.#platform, this.#location);
      try {
        await change.prepare?.();
        await checkReviewPath(this.#platform, this.#location, this.#path);
        await this.#platform.writeFileAtomic(this.#path, text);
      } catch (error) {
        await checkReviewPath(this.#platform, this.#location, this.#location.folder)
          .then(() => change.rollback?.())
          .catch(() => undefined);
        throw error;
      }
      this.#diskHash = textHash(text);
      this.#review = next;
      if (change.clearHistory) this.history.clear();
      change.apply?.();
      if (change.edit) this.history.record(change.edit);
      this.#changed(next);
      await change.afterSave?.().catch(() => undefined);
      return change.result;
    }
  }

  /**
   * Refuses a change while neither review.json nor the model is on disk: every move of a review needs its model gone,
   * so another core moved this one, and saving here would start a second copy of it.
   */
  async #checkModelThere(): Promise<void> {
    const model = modelPathOf(this.#location);
    if ((await this.#platform.stat(model)) !== null) return;
    throw new ArcueError(
      "conflict",
      `${basename(model)} and its review are gone from disk, so the change was not saved. If the model was renamed, Arcue follows it in a moment; otherwise open the model at its new path.`,
    );
  }

  /** Takes in a change another program made to `review.json`, as a watcher reports it. */
  refresh(): Promise<void> {
    return this.#edits.run(async () => {
      if (!this.#closed) await this.#sync();
    });
  }

  /**
   * Runs `move`, which moves or replaces the review folder on disk, between two changes, then takes in the review at
   * `location`, where it lives from now on, as this session's own change rather than another program's. The undo
   * history ends, because its steps name files by their old paths.
   * When `move` fails and leaves the review at `location` rather than in its old place, the session stops saving, so
   * it never writes a second copy of the review into the old folder.
   */
  moveTo(location: ReviewLocation, move: () => Promise<void>): Promise<void> {
    return this.#edits.run(async () => {
      this.#checkUsable();
      if (location.root !== this.#location.root) {
        throw new ArcueError("internal", "A review moves only inside its reviews root.");
      }
      const unlock = await lockReviews(this.#platform, this.#location);
      try {
        try {
          await move();
        } catch (error) {
          if (await this.#movedAway(reviewFilePath(location))) {
            this.#stranded = `The review moved to ${location.folder} but could not be finished, so this tab no longer saves it. Close it and open the model again.`;
          }
          throw error;
        }
        this.#location = location;
        this.#path = reviewFilePath(location);
        this.history.clear();
        await this.#sync({ adopt: false });
      } finally {
        await unlock();
      }
    });
  }

  /** Waits for the changes in flight, then refuses new ones. */
  close(): Promise<void> {
    return this.#edits.run(async () => {
      this.#closed = true;
    });
  }

  #checkUsable(): void {
    if (this.#closed) throw new ArcueError("not-found", "The asset was closed.");
    if (this.#stranded !== null) throw new ArcueError("conflict", this.#stranded);
  }

  /** Whether the review is at `path` now and no longer where the session keeps it. */
  async #movedAway(path: string): Promise<boolean> {
    if (path === this.#path) return false;
    try {
      return !(await this.#platform.exists(this.#path)) && (await this.#platform.exists(path));
    } catch {
      return true;
    }
  }

  /**
   * Whether saving the review would change nothing: it would write the text the file already holds, or, for a review a
   * newer Arcue saved, which reads without the fields this build does not know, the review as it was read.
   */
  #unchanged(review: ReviewFile, current: ReviewFile): boolean {
    const text = serializeReview({ ...review, revision: current.revision });
    if (isNewerFormat(current)) return text === serializeReview(current);
    return this.#diskHash !== null && textHash(text) === this.#diskHash;
  }

  async #sync({ adopt = true }: { adopt?: boolean } = {}): Promise<void> {
    const disk = await this.#readDisk();
    if (disk.hash === this.#diskHash) return;
    if (disk.text === null) {
      this.#diskHash = null;
      return;
    }
    const external = parseReview(disk.text, this.#path);
    const before = this.#review;
    this.#diskHash = disk.hash;
    this.#review = { ...external, asset: { ...external.asset, path: this.#location.assetPath } };
    this.history.clear();
    this.#changed(this.#review);
    if (adopt) this.#adopted?.(this.#review, before);
  }

  async #readDisk(): Promise<{ text: string | null; hash: string | null }> {
    await checkReviewPath(this.#platform, this.#location, this.#path);
    const stat = await this.#platform.stat(this.#path);
    if (stat === null) return { text: null, hash: null };
    if (stat.kind !== "file") throw new ArcueError("conflict", `${this.#path} is not a plain file.`);
    const text = await this.#platform.readText(this.#path);
    return { text, hash: textHash(text) };
  }
}

function textHash(text: string): string {
  return contentHash(encoder.encode(text));
}
