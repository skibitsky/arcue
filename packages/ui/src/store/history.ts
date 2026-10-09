import type { Comment, FollowUp, ReviewFile } from "@arcue/protocol";

export type HistoryStatus = "sent" | "resolved" | "reopened";

export interface HistoryItem {
  comment: Comment;
  status: HistoryStatus;
  /** The message sent in this round: the comment's text, or the follow-up it was reopened with. */
  text: string;
  action: "resolve" | "reopen" | null;
}

export interface HistoryRound {
  number: number;
  createdAt: string;
  items: HistoryItem[];
  counts: Record<HistoryStatus, number>;
}

/** The follow-up a reopened draft waits to send, or null for a draft that was never sent. */
export function pendingFollowUp(comment: Comment): FollowUp | null {
  if (comment.reopenedFrom === null) return null;
  return comment.followUps[comment.followUps.length - 1] ?? null;
}

/** What the comment says now: its latest follow-up when reopened, otherwise its text. */
export function currentMessage(comment: Comment): string {
  const followUp = pendingFollowUp(comment);
  if (followUp) return followUp.text;
  return messageForRound(comment, comment.rounds[comment.rounds.length - 1] ?? 0);
}

export function messageForRound(comment: Comment, round: number): string {
  const index = comment.rounds.indexOf(round);
  if (index <= 0) return comment.text;
  return comment.followUps[index - 1]?.text ?? comment.text;
}

export function statusInRound(comment: Comment, round: number): HistoryStatus {
  const index = comment.rounds.indexOf(round);
  if (index < comment.rounds.length - 1 || comment.status === "draft") return "reopened";
  return comment.status === "resolved" ? "resolved" : "sent";
}

export function queuedComments(review: ReviewFile): Comment[] {
  const byId = new Map(review.comments.map((comment) => [comment.id, comment]));
  return review.queue.flatMap((id) => {
    const comment = byId.get(id);
    return comment ? [comment] : [];
  });
}

/** Rounds newest first, each with its comments in prompt order. */
export function historyRounds(review: ReviewFile): HistoryRound[] {
  const byId = new Map(review.comments.map((comment) => [comment.id, comment]));
  return [...review.rounds]
    .sort((a, b) => b.number - a.number)
    .map((round) => {
      const counts: Record<HistoryStatus, number> = { sent: 0, resolved: 0, reopened: 0 };
      const items = round.comments.flatMap((id): HistoryItem[] => {
        const comment = byId.get(id);
        if (!comment) return [];
        const status = statusInRound(comment, round.number);
        counts[status] += 1;
        const action = status === "sent" ? "resolve" : status === "resolved" ? "reopen" : null;
        return [{ comment, status, text: messageForRound(comment, round.number), action }];
      });
      return { number: round.number, createdAt: round.createdAt, items, counts };
    });
}

export function roundSummaryText(counts: Record<HistoryStatus, number>): string {
  return (["sent", "resolved", "reopened"] as const)
    .filter((status) => counts[status] > 0)
    .map((status) => `${counts[status]} ${status}`)
    .join(" · ");
}

export function lastRound(comment: Comment): number | null {
  return comment.rounds[comment.rounds.length - 1] ?? null;
}
