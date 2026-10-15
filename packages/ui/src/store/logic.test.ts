import type { Comment, ReviewFile } from "@arcue/protocol";
import { describe, expect, it } from "vitest";
import { fakeScene, STONE_RESONATOR, stoneResonatorReview } from "../../dev/sample-data";
import { formatWhen, targetLabel, timeLabel } from "../format";
import { NOW, POINT } from "../test-helpers";
import { placeBox } from "./box-placement";
import { currentMessage, historyRounds, pendingFollowUp, roundSummaryText } from "./history";
import {
  adjacentKey,
  draftCountsByClip,
  isPlayable,
  keyFrames,
  rulerTicks,
  stepFrame,
  timelineMarkers,
} from "./timeline";

function withComments(review: ReviewFile, update: (comment: Comment) => Comment): ReviewFile {
  return { ...review, comments: review.comments.map(update) };
}

describe("history", () => {
  it("lists rounds newest first with their counts", () => {
    const rounds = historyRounds(stoneResonatorReview(NOW));
    expect(rounds.map((round) => round.number)).toEqual([3, 2]);
    expect(rounds[0]?.items.map((item) => [item.comment.id, item.status, item.action])).toEqual([
      ["c4", "resolved", "reopen"],
      ["c5", "resolved", "reopen"],
    ]);
    expect(roundSummaryText(rounds[0]?.counts ?? { sent: 0, resolved: 0, reopened: 0 })).toBe("2 resolved");
  });

  it("marks a comment reopened in the round it failed in, and shows the follow-up as its message", () => {
    const base = stoneResonatorReview(NOW);
    const review = withComments(base, (comment) =>
      comment.id === "c4"
        ? {
            ...comment,
            status: "draft",
            reopenedFrom: "resolved",
            followUps: [{ text: "Still slides at frame 26.", createdAt: NOW.toISOString(), afterRound: 3 }],
          }
        : comment,
    );
    const roundThree = historyRounds({ ...review, queue: [...review.queue, "c4"] })[0];
    expect(roundThree?.items[0]).toMatchObject({ status: "reopened", action: null });
    const reopened = review.comments.find((comment) => comment.id === "c4");
    if (!reopened) throw new Error("c4 is missing");
    expect(pendingFollowUp(reopened)?.afterRound).toBe(3);
    expect(currentMessage(reopened)).toBe("Still slides at frame 26.");
  });

  it("offers Mark resolved on a sent comment", () => {
    const review = withComments(stoneResonatorReview(NOW), (comment) =>
      comment.id === "c5" ? { ...comment, status: "sent" } : comment,
    );
    expect(historyRounds(review)[0]?.items[1]).toMatchObject({ status: "sent", action: "resolve" });
  });
});

describe("timeline", () => {
  const scene = fakeScene(STONE_RESONATOR);
  const clip = (name: string) => {
    const found = scene.clips.find((candidate) => candidate.displayName === name);
    if (!found) throw new Error(`No clip ${name}`);
    return found;
  };

  it("uses the frame-count rule for clip lengths", () => {
    expect(clip("Charge").frameCount).toBe(46);
    expect(clip("Walk").frameCount).toBe(61);
  });

  it("draws frame ticks for clips keyed on every frame and key ticks for sparse ones", () => {
    expect(keyFrames(clip("Charge"))).toBeNull();
    const frames = rulerTicks(45, 1000, null);
    expect(frames.mode).toBe("frames");
    expect(frames.ticks).toHaveLength(46);
    expect(frames.labels[0]).toBe(0);
    expect(frames.labels.at(-1)).toBe(45);

    const keys = keyFrames(clip("Idle"));
    expect(keys).toEqual([0, 20, 40, 60, 80, 100, 120]);
    const sparse = rulerTicks(120, 1000, keys);
    expect(sparse.mode).toBe("keys");
    expect(sparse.ticks.map((tick) => tick.frame)).toEqual(keys);
  });

  it("plays clips and ranges of three frames or more, and treats shorter ones as poses", () => {
    const poses = fakeScene({
      ...STONE_RESONATOR,
      clips: [
        ["Pose", 1 / 60],
        ["Still", 0],
        ["Blink", 2 / 60],
      ],
    });
    expect(poses.clips.map((candidate) => [candidate.frameCount, isPlayable(candidate)])).toEqual([
      [2, false],
      [1, false],
      [3, true],
    ]);
    expect(isPlayable(clip("Release"))).toBe(true);
    expect(isPlayable(clip("Walk"), { start: 10, end: 11 })).toBe(false);
    expect(isPlayable(clip("Walk"), { start: 10, end: 12 })).toBe(true);
  });

  it("steps frames with and without looping, and jumps between keys", () => {
    expect(stepFrame(45, 1, 45, true)).toBe(0);
    expect(stepFrame(45, 1, 45, false)).toBe(45);
    expect(stepFrame(0, -1, 45, true)).toBe(45);
    expect(adjacentKey(clip("Idle"), 41, 1)).toBe(60);
    expect(adjacentKey(clip("Idle"), 41, -1)).toBe(40);
    expect(adjacentKey(clip("Charge"), 34, 1)).toBe(35);
  });

  it("places a dot for a frame comment, a bar for a selected range, and numbers drafts by queue order", () => {
    const review = stoneResonatorReview(NOW);
    const charge = timelineMarkers(review, "Armature|Charge", "c7");
    expect(charge.dots).toEqual([
      { frame: 34, markers: [expect.objectContaining({ id: "c7", number: 1, status: "draft", selected: true })] },
    ]);
    const run = timelineMarkers(review, "Armature|Run", "c8");
    expect(run).toEqual({
      bars: [expect.objectContaining({ id: "c8", number: 2, start: 12, end: 24, selected: true })],
      dots: [],
    });
    const walk = timelineMarkers(review, "Armature|Walk", "c4");
    expect(walk.bars[0]).toMatchObject({ id: "c4", number: null, status: "resolved", round: 3 });
    expect(timelineMarkers(review, null, null)).toEqual({ bars: [], dots: [] });
  });

  it("shows a range that is not selected as a dot at its start", () => {
    const review = stoneResonatorReview(NOW);
    expect(timelineMarkers(review, "Armature|Run", null)).toEqual({
      bars: [],
      dots: [{ frame: 12, markers: [expect.objectContaining({ id: "c8", number: 2, selected: false })] }],
    });
    expect(timelineMarkers(review, "Armature|Run", "c7").bars).toEqual([]);
  });

  it("groups dots on the same frame", () => {
    const base = stoneResonatorReview(NOW);
    const review = withComments(base, (comment) =>
      comment.id === "c5"
        ? { ...comment, time: { kind: "frame", clip: "Armature|Charge", clipDisplayName: "Charge", frame: 34 } }
        : comment,
    );
    const { dots } = timelineMarkers(review, "Armature|Charge", null);
    expect(dots[0]?.markers.map((marker) => marker.id)).toEqual(["c5", "c7"]);
  });

  it("counts drafts per clip for the clip menu, with rest pose under null", () => {
    const counts = draftCountsByClip(stoneResonatorReview(NOW));
    expect(counts.get("Armature|Charge")).toBe(1);
    expect(counts.get("Armature|Run")).toBe(1);
    expect(counts.get(null)).toBe(1);
  });
});

describe("comment box placement", () => {
  const box = { width: 320, height: 120 };
  const bounds = { width: 1000, height: 600 };

  it("opens right of the pin, then below, left and above", () => {
    expect(placeBox({ x: 100, y: 200 }, box, bounds)).toMatchObject({ side: "right", x: 124 });
    expect(placeBox({ x: 900, y: 200 }, box, bounds).side).toBe("below");
    expect(placeBox({ x: 900, y: 550 }, box, bounds).side).toBe("left");
  });

  it("sits at the bottom center without a pin", () => {
    expect(placeBox(null, box, bounds)).toEqual({ x: 340, y: 464, side: "none" });
  });
});

describe("format", () => {
  it("describes times and targets", () => {
    expect(timeLabel({ kind: "frame", clip: "Armature|Charge", frame: 34 }, () => "Charge")).toBe("Charge · f34");
    expect(timeLabel({ kind: "range", clip: "Armature|Run", start: 12, end: 24 }, () => "Run")).toBe("Run · f12–24");
    expect(timeLabel({ kind: "none" }, () => "")).toBeNull();
    expect(targetLabel(POINT, "Head")).toBe("Point · Head");
    expect(
      targetLabel(
        {
          kind: "region",
          mesh: "M",
          triangles: [[0, 3]],
          vertices: [
            [2210, 2239],
            [2251, 2266],
          ],
        },
        null,
      ),
    ).toBe("Region · 46 vertices");
  });

  it("says when a round happened in relative words", () => {
    expect(formatWhen(new Date(NOW.getTime() - 20_000).toISOString(), NOW)).toBe("Just now");
    expect(formatWhen(new Date(2026, 9, 8, 14, 2).toISOString(), NOW)).toBe("14:02");
    expect(formatWhen(new Date(2026, 9, 7, 18, 40).toISOString(), NOW)).toBe("Yesterday 18:40");
    expect(formatWhen(new Date(2026, 9, 5, 9, 0).toISOString(), NOW)).toBe("Monday");
    expect(formatWhen(new Date(2026, 8, 20, 9, 0).toISOString(), NOW)).toBe("Sep 20");
  });
});
