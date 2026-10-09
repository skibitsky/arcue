import type {
  CameraAnchor,
  IndexRange,
  RegionAnchor,
  SpatialAnchor,
  SurfaceAnchor,
  TimeAnchor,
  TopologyFingerprint,
} from "@arcue/scene";
import { describe, expect, expectTypeOf, it } from "vitest";
import type { z } from "zod";
import type { cameraAnchorSchema, regionAnchorSchema, topologyFingerprintSchema } from "./anchors";
import {
  indexRangeSchema,
  indexRangesSchema,
  indexSchema,
  spatialAnchorSchema,
  type surfaceAnchorSchema,
  timeAnchorSchema,
} from "./anchors";
import { commands, isCommandName } from "./commands";
import { isEventName } from "./events";
import { isQueryName } from "./queries";
import type { ReviewFile } from "./review";
import { reviewFileSchema } from "./review";
import { roundDataSchema } from "./round";

const specRoundExample = {
  round: 4,
  asset: {
    path: "Assets/Art/Characters/StoneResonator/Models/StoneResonator.fbx",
    version: "3f9a2c1",
    exporter: "Blender 5.2 FBX",
    fps: 60,
    space: { units: "m", up: "+Y", handedness: "right" },
  },
  comments: [
    {
      id: "c7",
      number: 1,
      text: "The thumb tip bends outward. Fold it back toward the palm.",
      time: { clip: "Armature|Charge", clipDisplayName: "Charge", frame: 34, seconds: 0.567 },
      target: {
        kind: "region",
        mesh: "StoneResonator",
        meshPath: "StoneResonator",
        vertices: [
          [2210, 2239],
          [2251, 2266],
        ],
        vertexCount: 46,
        centroid: { rest: [-0.412, 1.018, 0.064], posed: [-0.371, 1.102, 0.118] },
        bones: [
          { name: "Right_ThumbDistal", share: 0.64 },
          { name: "Right_ThumbIntermediate", share: 0.31 },
        ],
      },
      pose: {
        joints: [
          {
            name: "Right_ThumbIntermediate",
            path: "Armature/Right_Hand/Right_ThumbIntermediate",
            position: [-0.352, 1.087, 0.101],
          },
          {
            name: "Right_ThumbDistal",
            path: "Armature/Right_Hand/Right_ThumbIntermediate/Right_ThumbDistal",
            position: [-0.366, 1.096, 0.113],
          },
        ],
      },
      camera: {
        position: [-0.9, 0.95, 0.6],
        target: [-0.37, 1.1, 0.12],
        up: [0, 1, 0],
        fov: 30,
        label: "palm side, slightly below",
      },
      screenshot: "c7.png",
      madeOnVersion: "3f9a2c1",
      anchorState: "exact",
      anchorVersion: "3f9a2c1",
      earlierMessages: [],
    },
  ],
};

const camera: CameraAnchor = { position: [0, 1, 3], target: [0, 1, 0], up: [0, 1, 0], fov: 30 };

const surface: SurfaceAnchor = { kind: "surface", mesh: "Hero/Body", vertices: [0, 1, 2], weights: [0.2, 0.5, 0.3] };

const context = {
  vertexCount: 3,
  bones: [{ name: "Head", share: 1 }],
  centroid: { rest: [0, 1.9, 0.1], posed: [0, 1.9, 0.1] },
  joints: [{ name: "Head", path: "Armature/Head", position: [0, 1.8, 0] }],
  viewLabel: "front",
} satisfies z.input<(typeof commands)["comment.create"]["input"]>["context"];

function comment(id: string, status: "draft" | "sent" | "resolved"): ReviewFile["comments"][number] {
  return {
    id,
    text: "This spike is cut off.",
    status,
    createdAt: "2026-10-08T14:05:00.000Z",
    updatedAt: "2026-10-08T14:05:00.000Z",
    madeOnVersion: "3f9a2c1",
    time: { kind: "none" },
    target: surface,
    anchorVersion: "3f9a2c1",
    anchorRestPositions: [
      [0, 1.9, 0.1],
      [0.01, 1.9, 0.1],
      [0, 1.91, 0.1],
    ],
    camera,
    context: { ...context, screenshot: `screenshots/${id}.png` },
    anchorState: "exact",
    followUps: [],
    rounds: status === "draft" ? [] : [1],
    reopenedFrom: null,
  };
}

function review(overrides: Partial<ReviewFile> = {}): ReviewFile {
  return {
    schemaVersion: 1,
    asset: { path: "Assets/Hero.fbx" },
    versions: [
      {
        id: "3f9a2c1",
        fileModifiedAt: "2026-10-08T14:02:00.000Z",
        loadedAt: "2026-10-08T14:02:01.000Z",
        exporter: "Blender 5.2 FBX",
        meshes: [{ mesh: "Hero/Body", topology: { sourceVertexCount: 4, triangleCount: 2, hash: "0123456789abcdef" } }],
      },
    ],
    comments: [comment("c1", "draft"), comment("c2", "sent")],
    queue: ["c1"],
    rounds: [{ number: 1, createdAt: "2026-10-08T14:04:00.000Z", version: "3f9a2c1", comments: ["c2"] }],
    nextCommentNumber: 3,
    ...overrides,
  };
}

describe("anchor schemas", () => {
  it("infer the scene's anchor types", () => {
    expectTypeOf<z.output<typeof surfaceAnchorSchema>>().toEqualTypeOf<SurfaceAnchor>();
    expectTypeOf<z.output<typeof regionAnchorSchema>>().toEqualTypeOf<RegionAnchor>();
    expectTypeOf<z.output<typeof spatialAnchorSchema>>().toEqualTypeOf<SpatialAnchor>();
    expectTypeOf<z.output<typeof timeAnchorSchema>>().toEqualTypeOf<TimeAnchor>();
    expectTypeOf<z.output<typeof cameraAnchorSchema>>().toEqualTypeOf<CameraAnchor>();
    expectTypeOf<z.output<typeof indexRangeSchema>>().toEqualTypeOf<IndexRange>();
    expectTypeOf<z.output<typeof topologyFingerprintSchema>>().toEqualTypeOf<TopologyFingerprint>();
  });

  it("accept a painted region", () => {
    const region = {
      kind: "region",
      mesh: "Hero/Body",
      triangles: [[10, 12]],
      vertices: [
        [2210, 2239],
        [2251, 2266],
      ],
    };
    expect(spatialAnchorSchema.parse(region)).toEqual(region);
  });

  it("accept time anchors that carry the clip's name in the file and its display name", () => {
    const time = { kind: "frame", clip: "Armature|Charge", clipDisplayName: "Charge", frame: 34 };
    expect(timeAnchorSchema.parse(time)).toEqual(time);
    expect(timeAnchorSchema.safeParse({ kind: "frame", clip: "Armature|Charge", frame: 34 }).success).toBe(false);
  });

  it("take a time in commands without the display name, which the core adds", () => {
    const selection = { kind: "frame", clip: "Armature|Charge", frame: 34 };
    expect(commands["view.screenshot"].input.parse({ assetId: "a1", time: selection }).time).toEqual(selection);
  });

  it("reject ranges that end before they start", () => {
    expect(indexRangeSchema.safeParse([5, 4]).success).toBe(false);
    const range = { kind: "range", clip: "Armature|Run", clipDisplayName: "Run", start: 24, end: 12 };
    expect(timeAnchorSchema.safeParse(range).success).toBe(false);
  });

  it("reject range lists that are unsorted, overlapping or touching", () => {
    expect(
      indexRangesSchema.safeParse([
        [1, 2],
        [4, 6],
      ]).success,
    ).toBe(true);
    expect(
      indexRangesSchema.safeParse([
        [4, 6],
        [1, 2],
      ]).success,
    ).toBe(false);
    expect(
      indexRangesSchema.safeParse([
        [1, 4],
        [4, 6],
      ]).success,
    ).toBe(false);
    expect(
      indexRangesSchema.safeParse([
        [1, 3],
        [4, 6],
      ]).success,
    ).toBe(false);
  });

  it("reject negative, fractional and oversized indices", () => {
    expect(indexSchema.safeParse(-1).success).toBe(false);
    expect(indexSchema.safeParse(1.5).success).toBe(false);
    expect(indexSchema.safeParse(0xffffffff).success).toBe(true);
    expect(indexSchema.safeParse(0x100000000).success).toBe(false);
  });
});

describe("roundDataSchema", () => {
  it("accepts a full round example", () => {
    expect(roundDataSchema.parse(specRoundExample)).toEqual(specRoundExample);
  });

  it("requires the comment number, the region's vertex count and the camera's up vector", () => {
    const [example] = specRoundExample.comments;
    if (!example) throw new Error("The fixture has a comment.");
    const { number: _number, ...withoutNumber } = example;
    const { vertexCount: _vertexCount, ...targetWithoutCount } = example.target;
    const { up: _up, ...cameraWithoutUp } = example.camera;
    for (const changed of [
      withoutNumber,
      { ...example, target: targetWithoutCount },
      { ...example, camera: cameraWithoutUp },
    ]) {
      expect(roundDataSchema.safeParse({ ...specRoundExample, comments: [changed] }).success).toBe(false);
    }
  });

  it("defaults earlier messages to none and accepts a range without a surface target", () => {
    const round = {
      ...specRoundExample,
      comments: [
        {
          id: "c8",
          number: 2,
          text: "The torso bobs too much. Halve the vertical motion.",
          time: { clip: "Armature|Run", clipDisplayName: "Run", frames: [12, 24], seconds: [0.2, 0.4] },
          target: null,
          pose: null,
          camera: { position: [4.3, 1.4, 0.95], target: [0, 0.98, 0.05], up: [0, 1, 0], fov: 30, label: "right side" },
          screenshot: null,
          madeOnVersion: "3f9a2c1",
          anchorState: null,
          anchorVersion: null,
        },
      ],
    };
    expect(roundDataSchema.parse(round).comments[0]?.earlierMessages).toEqual([]);
  });
});

describe("reviewFileSchema", () => {
  it("accepts a review with a draft and a sent comment", () => {
    const valid = review();
    expect(reviewFileSchema.parse(valid)).toEqual(valid);
  });

  it("rejects other schema versions", () => {
    expect(reviewFileSchema.safeParse({ ...review(), schemaVersion: 2 }).success).toBe(false);
  });

  it("rejects ids that do not follow the c-number pattern, in comments, the queue and rounds", () => {
    expect(reviewFileSchema.safeParse(review({ comments: [comment("x1", "draft")], queue: ["x1"] })).success).toBe(
      false,
    );
    const round = { number: 1, createdAt: "2026-10-08T14:04:00.000Z", version: "3f9a2c1", comments: ["two"] };
    expect(reviewFileSchema.safeParse(review({ rounds: [round] })).success).toBe(false);
  });

  it("requires the queue to hold exactly the drafts, each once", () => {
    expect(reviewFileSchema.safeParse(review({ queue: ["c1", "c2"] })).success).toBe(false);
    expect(reviewFileSchema.safeParse(review({ queue: [] })).success).toBe(false);
    expect(reviewFileSchema.safeParse(review({ queue: ["c1", "c1"] })).success).toBe(false);
    expect(reviewFileSchema.safeParse(review({ queue: ["c9"] })).success).toBe(false);
  });

  it("requires one anchor rest position per anchored vertex", () => {
    const withTwo = { ...comment("c1", "draft"), anchorRestPositions: [[0, 0, 0] as [number, number, number]] };
    expect(reviewFileSchema.safeParse(review({ comments: [withTwo, comment("c2", "sent")] })).success).toBe(false);
    const untargeted = { ...comment("c1", "draft"), target: null, anchorRestPositions: [] };
    expect(reviewFileSchema.safeParse(review({ comments: [untargeted, comment("c2", "sent")] })).success).toBe(true);
  });

  it("requires nextCommentNumber to be above every comment's number", () => {
    expect(reviewFileSchema.safeParse(review({ nextCommentNumber: 2 })).success).toBe(false);
    expect(reviewFileSchema.safeParse(review({ nextCommentNumber: 30 })).success).toBe(true);
  });

  it("accepts only the screenshot layouts the core writes, named after the comment", () => {
    const withScreenshot = (screenshot: string | null) =>
      review({ comments: [{ ...comment("c1", "draft"), context: { ...context, screenshot } }, comment("c2", "sent")] });
    for (const screenshot of [null, "screenshots/c1.png", "screenshots/c1-3.png", "rounds/round-2/c1.png"]) {
      expect(reviewFileSchema.safeParse(withScreenshot(screenshot)).success, String(screenshot)).toBe(true);
    }
    for (const screenshot of [
      "../../../.ssh/id_rsa",
      "/etc/passwd",
      "screenshots/../c1.png",
      "screenshots/c2.png",
      "screenshots/c1.jpg",
      "screenshots/c1-0.png",
      "rounds/round-0/c1.png",
      "C:/c1.png",
    ]) {
      expect(reviewFileSchema.safeParse(withScreenshot(screenshot)).success, screenshot).toBe(false);
    }
  });

  it("records the status a comment was reopened from only on a draft with a follow-up", () => {
    const followUp = { text: "Still bent.", createdAt: "2026-10-08T14:06:00.000Z", afterRound: 1 };
    const reopened = { ...comment("c2", "draft"), rounds: [1], followUps: [followUp], reopenedFrom: "sent" as const };
    expect(
      reviewFileSchema.safeParse(review({ comments: [comment("c1", "draft"), reopened], queue: ["c1", "c2"] })).success,
    ).toBe(true);
    const sent = { ...comment("c2", "sent"), reopenedFrom: "resolved" as const };
    expect(reviewFileSchema.safeParse(review({ comments: [comment("c1", "draft"), sent] })).success).toBe(false);
  });

  it("rejects repeated comment and version ids", () => {
    const [version] = review().versions;
    if (!version) throw new Error("The fixture has a version.");
    expect(reviewFileSchema.safeParse(review({ versions: [version, version] })).success).toBe(false);
    expect(
      reviewFileSchema.safeParse(review({ comments: [comment("c1", "draft"), comment("c1", "sent")] })).success,
    ).toBe(false);
  });
});

describe("command definitions", () => {
  it("apply input defaults", () => {
    expect(commands["view.screenshot"].input.parse({ assetId: "a1" })).toEqual({
      assetId: "a1",
      width: 1280,
      height: 720,
      drawComments: false,
    });
  });

  it("trim comment text and reject blank text", () => {
    const reopen = commands["comment.reopen"].input;
    expect(reopen.parse({ assetId: "a1", commentId: "c3", text: "  Still bent. " }).text).toBe("Still bent.");
    expect(reopen.safeParse({ assetId: "a1", commentId: "c3", text: "   " }).success).toBe(false);
  });

  it("require a new context and screenshot when an update changes time or target", () => {
    const update = commands["comment.update"].input;
    const ref = { assetId: "a1", commentId: "c3" };
    expect(update.safeParse({ ...ref, text: "Sharper." }).success).toBe(true);
    expect(update.safeParse({ ...ref, target: null }).success).toBe(false);
    expect(update.safeParse({ ...ref, time: { kind: "none" }, context }).success).toBe(false);
    expect(update.safeParse({ ...ref, time: { kind: "none" }, context, screenshot: null }).success).toBe(false);
    expect(
      update.safeParse({ ...ref, time: { kind: "none" }, context, screenshot: null, version: "3f9a2c1" }).success,
    ).toBe(true);
  });

  it("require the version a new comment's target was picked on", () => {
    const create = commands["comment.create"].input;
    const input = { assetId: "a1", text: "Spike.", time: { kind: "none" }, target: surface, camera, context };
    expect(create.safeParse({ ...input, screenshot: null }).success).toBe(false);
    expect(create.safeParse({ ...input, screenshot: null, version: "3f9a2c1" }).success).toBe(true);
  });

  it("recognize defined names only", () => {
    expect(isCommandName("asset.open")).toBe(true);
    expect(isCommandName("asset.delete")).toBe(false);
    expect(isCommandName("toString")).toBe(false);
    expect(isQueryName("review.get")).toBe(true);
    expect(isQueryName("viewState.get")).toBe(true);
    expect(isEventName("review.changed")).toBe(true);
  });
});
