import type { Comment, ReviewFile } from "@arcue/protocol";

/** The comments one edit touched, null where a comment did not exist, and the whole queue. */
export interface ReviewSnapshot {
  comments: ReadonlyMap<string, Comment | null>;
  queue: readonly string[];
}

export interface ReviewEdit {
  before: ReviewSnapshot;
  after: ReviewSnapshot;
}

/** Records the edit that turns `before` into `after` for the listed comments. */
export function editBetween(before: ReviewFile, after: ReviewFile, ids: readonly string[]): ReviewEdit {
  const snapshot = (review: ReviewFile): ReviewSnapshot => ({
    comments: new Map(ids.map((id) => [id, review.comments.find((comment) => comment.id === id) ?? null])),
    queue: [...review.queue],
  });
  return { before: snapshot(before), after: snapshot(after) };
}

/** Puts the snapshot's comments and queue into the review, keeping comments in the order of their numbers. */
export function applySnapshot(review: ReviewFile, snapshot: ReviewSnapshot): ReviewFile {
  const byId = new Map(review.comments.map((comment) => [comment.id, comment]));
  for (const [id, comment] of snapshot.comments) {
    if (comment) byId.set(id, comment);
    else byId.delete(id);
  }
  const comments = [...byId.values()].sort((a, b) => commentNumber(a.id) - commentNumber(b.id));
  return { ...review, comments, queue: [...snapshot.queue] };
}

function commentNumber(id: string): number {
  return Number(id.slice(1));
}

/** One asset's undo and redo stacks. They live in memory only. */
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

  clear(): void {
    this.#undo = [];
    this.#redo = [];
  }

  /** Screenshot paths that undo or redo could bring back. */
  screenshots(): Set<string> {
    const paths = new Set<string>();
    for (const edit of [...this.#undo, ...this.#redo]) {
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
      comments: new Map([...snapshot.comments].map(([id, comment]) => [id, comment && map(comment)])),
    });
    const mapEdit = (edit: ReviewEdit): ReviewEdit => ({
      before: mapSnapshot(edit.before),
      after: mapSnapshot(edit.after),
    });
    this.#undo = this.#undo.map(mapEdit);
    this.#redo = this.#redo.map(mapEdit);
  }
}
