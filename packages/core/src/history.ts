import type { Comment, ReviewFile } from "@arcue/protocol";
import { byCreation } from "./comment-ids";

/** Where a queued comment stood: just before the comment `before`, or last when that is null. */
export interface QueueSpot {
  before: string | null;
}

/**
 * What one edit touched, as it was on one side of the edit: the touched comments with their queue entries, and the
 * touched dismissed warnings. Applying it leaves everything else as it is, so an undo never reverts other changes.
 */
export interface ReviewSnapshot {
  /** Each touched comment, or null where it did not exist. */
  comments: ReadonlyMap<string, Comment | null>;
  /** The queue entry of each touched comment, or null where it was not queued, last queued first. */
  queue: ReadonlyMap<string, QueueSpot | null>;
  /** Each touched warning id, and whether it was dismissed. */
  dismissedWarnings: ReadonlyMap<string, boolean>;
}

/** An edit of comments, queue entries and dismissed warnings in `review.json`. */
export interface CommentEdit {
  kind: "comments";
  before: ReviewSnapshot;
  after: ReviewSnapshot;
}

/** An edit of the asset's composition file: its text before and after, null where the file did not exist. */
export interface CompositionEdit {
  kind: "composition";
  path: string;
  before: string | null;
  after: string | null;
}

export type ReviewEdit = CommentEdit | CompositionEdit;

/** The comments, with their queue entries, and the warning ids one edit touched. */
export interface Touched {
  comments?: readonly string[];
  warnings?: readonly string[];
}

/** Records the edit that turns `before` into `after` for what it touched. */
export function editBetween(before: ReviewFile, after: ReviewFile, touched: Touched): CommentEdit {
  const comments = touched.comments ?? [];
  const warnings = touched.warnings ?? [];
  const snapshot = (review: ReviewFile): ReviewSnapshot => {
    const queue = new Map<string, QueueSpot | null>();
    for (let index = review.queue.length - 1; index >= 0; index--) {
      const id = review.queue[index];
      if (id !== undefined && comments.includes(id)) queue.set(id, { before: review.queue[index + 1] ?? null });
    }
    for (const id of comments) if (!queue.has(id)) queue.set(id, null);
    const dismissed = new Set(review.dismissedWarnings ?? []);
    return {
      comments: new Map(comments.map((id) => [id, review.comments.find((comment) => comment.id === id) ?? null])),
      queue,
      dismissedWarnings: new Map(warnings.map((id) => [id, dismissed.has(id)])),
    };
  };
  return { kind: "comments", before: snapshot(before), after: snapshot(after) };
}

/**
 * Puts the snapshot's comments, queue entries and dismissed warnings into the review and leaves the rest as it is.
 * A comment that comes back goes before the first comment made after it. A queue entry goes back before the comment
 * it stood before, or last when that comment is no longer queued.
 */
export function applySnapshot(review: ReviewFile, snapshot: ReviewSnapshot): ReviewFile {
  const comments = review.comments.flatMap((comment) => {
    const restored = snapshot.comments.get(comment.id);
    return restored === undefined ? [comment] : restored === null ? [] : [restored];
  });
  for (const [id, comment] of snapshot.comments) {
    if (comment === null || comments.some((entry) => entry.id === id)) continue;
    const at = comments.findIndex((entry) => byCreation(entry, comment) > 0);
    comments.splice(at < 0 ? comments.length : at, 0, comment);
  }
  const queue = review.queue.filter((id) => !snapshot.queue.has(id));
  for (const [id, spot] of snapshot.queue) {
    if (spot === null) continue;
    const at = spot.before === null ? -1 : queue.indexOf(spot.before);
    queue.splice(at < 0 ? queue.length : at, 0, id);
  }
  const dismissed = (review.dismissedWarnings ?? []).filter((id) => snapshot.dismissedWarnings.get(id) !== false);
  for (const [id, wasDismissed] of snapshot.dismissedWarnings) {
    if (wasDismissed && !dismissed.includes(id)) dismissed.push(id);
  }
  return withDismissedWarnings({ ...review, comments, queue }, dismissed);
}

/** The review with these dismissed warnings; none leaves the field out of `review.json`. */
export function withDismissedWarnings(review: ReviewFile, ids: readonly string[]): ReviewFile {
  const { dismissedWarnings: _previous, ...rest } = review;
  return ids.length === 0 ? rest : { ...rest, dismissedWarnings: [...ids] };
}

/** One asset's undo and redo stacks, for comment and composition edits alike. They live in memory only. */
export class ReviewHistory {
  #undo: ReviewEdit[] = [];
  #redo: ReviewEdit[] = [];

  record(edit: ReviewEdit): void {
    this.#undo.push(edit);
    this.#redo = [];
  }

  peekUndo(): ReviewEdit | null {
    return this.#undo.at(-1) ?? null;
  }

  peekRedo(): ReviewEdit | null {
    return this.#redo.at(-1) ?? null;
  }

  /** Moves the latest edit to the redo stack once its undo is saved. */
  undone(): void {
    const edit = this.#undo.pop();
    if (edit) this.#redo.push(edit);
  }

  redone(): void {
    const edit = this.#redo.pop();
    if (edit) this.#undo.push(edit);
  }

  /** Forgets the latest edit to undo or redo, which can no longer be applied, so the edits behind it stay reachable. */
  drop(direction: "undo" | "redo"): void {
    (direction === "undo" ? this.#undo : this.#redo).pop();
  }

  clear(): void {
    this.#undo = [];
    this.#redo = [];
  }

  /** Screenshot paths that undo or redo could bring back. */
  screenshots(): Set<string> {
    const paths = new Set<string>();
    for (const edit of [...this.#undo, ...this.#redo]) {
      if (edit.kind !== "comments") continue;
      for (const snapshot of [edit.before, edit.after]) {
        for (const comment of snapshot.comments.values()) {
          if (comment?.context.screenshot) paths.add(comment.context.screenshot);
        }
      }
    }
    return paths;
  }

  /** Rewrites every recorded comment, as re-anchoring does, so undo never restores an anchor of an older version. */
  mapComments(map: (comment: Comment) => Comment): void {
    const mapSnapshot = (snapshot: ReviewSnapshot): ReviewSnapshot => ({
      queue: snapshot.queue,
      dismissedWarnings: snapshot.dismissedWarnings,
      comments: new Map([...snapshot.comments].map(([id, comment]) => [id, comment && map(comment)])),
    });
    const mapEdit = (edit: ReviewEdit): ReviewEdit =>
      edit.kind === "comments" ? { ...edit, before: mapSnapshot(edit.before), after: mapSnapshot(edit.after) } : edit;
    this.#undo = this.#undo.map(mapEdit);
    this.#redo = this.#redo.map(mapEdit);
  }
}
