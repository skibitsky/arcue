import type { ReviewFile } from "@arcue/protocol";
import { ArcueError } from "@arcue/protocol";
import { contentHash } from "./hash";
import type { ReviewEdit } from "./history";
import { ReviewHistory } from "./history";
import type { Platform } from "./platform";
import type { ReviewLocation } from "./review-store";
import { checkReviewPath, parseReview, prepareArcueFolder, reviewFilePath, serializeReview } from "./review-store";
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
}

export type ComputeChange<Result> = (review: ReviewFile) => ReviewChange<Result> | Promise<ReviewChange<Result>>;

const ATTEMPTS = 3;
const encoder = new TextEncoder();

/**
 * One asset's `review.json` while the asset is open. Changes run one at a time. Each starts from the file on disk:
 * when another program changed it, the session adopts that content, drops the undo history, and computes the change
 * from it. Just before saving it checks the file again and starts over if it moved. Each save adds one to the
 * review's `revision`. A change that would write the text the file already holds, and no other file, is not saved.
 */
export class ReviewSession {
  readonly history = new ReviewHistory();
  readonly #platform: Platform;
  #location: ReviewLocation;
  #path: string;
  readonly #changed: (review: ReviewFile) => void;
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
  ) {
    this.#platform = platform;
    this.#location = location;
    this.#path = reviewFilePath(location);
    this.#review = loaded.review;
    this.#diskHash = loaded.text === null ? null : textHash(loaded.text);
    this.#changed = changed;
  }

  get review(): ReviewFile {
    return this.#review;
  }

  run<Result>(compute: ComputeChange<Result>): Promise<Result> {
    return this.#edits.run(async () => {
      for (let attempt = 1; ; attempt++) {
        this.#checkUsable();
        await this.#sync();
        const current = this.#review;
        const change = await compute(current);
        if (
          change.next === null ||
          (!change.prepare && !change.clearHistory && this.#matchesDisk({ ...change.next, revision: current.revision }))
        ) {
          change.apply?.();
          if (change.edit) this.history.record(change.edit);
          return change.result;
        }
        const next: ReviewFile = { ...change.next, revision: current.revision + 1 };
        const text = serializeReview(next);
        if ((await this.#readDisk()).hash !== this.#diskHash) {
          if (attempt < ATTEMPTS) continue;
          throw new ArcueError("conflict", "review.json keeps changing on disk; try again.");
        }
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
        return change.result;
      }
    });
  }

  /** Takes in a change another program made to `review.json`, as a watcher reports it. */
  refresh(): Promise<void> {
    return this.#edits.run(async () => {
      if (!this.#closed) await this.#sync();
    });
  }

  /**
   * Runs `move`, which moves or replaces the review folder on disk, between two changes, then takes in the review at
   * `location`, where it lives from now on. The undo history ends, because its steps name files by their old paths.
   * When `move` fails and leaves the review at `location` rather than in its old place, the session stops saving, so
   * it never writes a second copy of the review into the old folder.
   */
  moveTo(location: ReviewLocation, move: () => Promise<void>): Promise<void> {
    return this.#edits.run(async () => {
      this.#checkUsable();
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
      await this.#sync();
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

  /** Whether saving the review would write the text the file already holds. */
  #matchesDisk(review: ReviewFile): boolean {
    return this.#diskHash !== null && textHash(serializeReview(review)) === this.#diskHash;
  }

  async #sync(): Promise<void> {
    const disk = await this.#readDisk();
    if (disk.hash === this.#diskHash) return;
    if (disk.text === null) {
      this.#diskHash = null;
      return;
    }
    const external = parseReview(disk.text, this.#path);
    this.#diskHash = disk.hash;
    this.#review = { ...external, asset: { ...external.asset, path: this.#location.assetPath } };
    this.history.clear();
    this.#changed(this.#review);
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
