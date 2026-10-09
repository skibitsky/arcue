import type { Comment, ReviewFile } from "@arcue/protocol";
import { describe, expect, it } from "vitest";
import { applySnapshot, editBetween, withDismissedWarnings } from "./history";
import { emptyReview } from "./review-store";

function draft(id: string, minute: number): Comment {
  const at = new Date(Date.UTC(2026, 9, 8, 14, minute)).toISOString();
  return {
    id,
    text: `Comment ${id}.`,
    status: "draft",
    createdAt: at,
    updatedAt: at,
    madeOnVersion: "v1",
    time: { kind: "none" },
    target: null,
    anchorVersion: "v1",
    anchorRestPositions: [],
    camera: { position: [0, 1, 3], target: [0, 1, 0], up: [0, 1, 0], fov: 30 },
    context: { vertexCount: 0, bones: [], centroid: null, joints: [], viewLabel: "", screenshot: null },
    anchorState: "exact",
    followUps: [],
    rounds: [],
    reopenedFrom: null,
  };
}

function withDrafts(review: ReviewFile, ...drafts: Comment[]): ReviewFile {
  return {
    ...review,
    comments: [...review.comments, ...drafts],
    queue: [...review.queue, ...drafts.map((comment) => comment.id)],
  };
}

function withoutDraft(review: ReviewFile, id: string): ReviewFile {
  return {
    ...review,
    comments: review.comments.filter((comment) => comment.id !== id),
    queue: review.queue.filter((queued) => queued !== id),
  };
}

const [a, b, c, d] = [draft("c1", 1), draft("c2", 2), draft("c3", 3), draft("c4", 4)];

describe("undo snapshots", () => {
  it("take back only what the edit touched, keeping comments, queue entries and dismissals made since", () => {
    const start = withDrafts(emptyReview("Hero.fbx"), a);
    const created = withDrafts(start, b);
    const edit = editBetween(start, created, { comments: ["c2"] });
    const later = withDismissedWarnings(withDrafts(created, c), ["texture-not-found:texture:Rock.png"]);

    const undone = applySnapshot(later, edit.before);
    expect(undone.queue).toEqual(["c1", "c3"]);
    expect(undone.comments.map((comment) => comment.id)).toEqual(["c1", "c3"]);
    expect(undone.dismissedWarnings).toEqual(["texture-not-found:texture:Rock.png"]);

    const redone = applySnapshot(undone, edit.after);
    expect(redone.queue).toEqual(["c1", "c3", "c2"]);
    expect(redone.comments.map((comment) => comment.id)).toEqual(["c1", "c2", "c3"]);
  });

  it("leave comments they did not touch where they are, even out of creation order", () => {
    const start = withDrafts(emptyReview("Hero.fbx"), c, a);
    const created = withDrafts(start, d);
    const edit = editBetween(start, created, { comments: ["c4"] });

    expect(applySnapshot(created, edit.before).comments.map((comment) => comment.id)).toEqual(["c3", "c1"]);
  });

  it("put a deleted draft back before the draft it stood before, or last when that one is gone", () => {
    const start = withDrafts(emptyReview("Hero.fbx"), a, b, c);
    const deleted = withoutDraft(start, "c2");
    const edit = editBetween(start, deleted, { comments: ["c2"] });

    expect(applySnapshot(withDrafts(deleted, d), edit.before).queue).toEqual(["c1", "c2", "c3", "c4"]);
    expect(applySnapshot(withoutDraft(deleted, "c3"), edit.before).queue).toEqual(["c1", "c2"]);
  });

  it("dismiss and restore only the warnings the edit touched", () => {
    const start = withDismissedWarnings(emptyReview("Hero.fbx"), ["first"]);
    const dismissed = withDismissedWarnings(start, ["first", "second"]);
    const edit = editBetween(start, dismissed, { warnings: ["second"] });
    const later = withDismissedWarnings(dismissed, ["first", "second", "third"]);

    const undone = applySnapshot(later, edit.before);
    expect(undone.dismissedWarnings).toEqual(["first", "third"]);
    expect(applySnapshot(undone, edit.after).dismissedWarnings).toEqual(["first", "third", "second"]);
    expect(applySnapshot(emptyReview("Hero.fbx"), edit.before)).not.toHaveProperty("dismissedWarnings");
  });
});
