import type { Comment, CoordinateConvention, ReviewFile, RoundComment, RoundData } from "@arcue/protocol";
import { roundDataSchema } from "@arcue/protocol";
import type { SceneDescription, Vec3 } from "@arcue/scene";
import { countInRanges } from "@arcue/scene";
import { toConvention, upAxisOf } from "./coordinates";
import { findClip, meshAtPath, nameInPath, weightedPoint } from "./scene-lookup";

export interface RoundInput {
  round: number;
  review: ReviewFile;
  /** The version on screen, which the round is made against. */
  version: string;
  scene: SceneDescription;
  /** The queued comments, in prompt order. */
  comments: readonly Comment[];
  convention: CoordinateConvention;
}

/** Builds `round.json` for the queued comments. Positions follow the coordinate convention. */
export function buildRoundData({ round, review, version, scene, comments, convention }: RoundInput): RoundData {
  const record = review.versions.find((entry) => entry.id === version);
  const data: RoundData = {
    round,
    asset: {
      path: review.asset.path,
      version,
      exporter: record?.exporter ?? null,
      fps: scene.source.fps,
      space: { units: "m", up: upAxisOf(convention), handedness: "right" },
      ...(record?.files ? { files: record.files } : {}),
    },
    comments: comments.map((comment, index) => roundComment(comment, index + 1, scene, convention)),
  };
  return roundDataSchema.parse(data);
}

/** The text a round sends: the newest follow-up of a reopened comment, otherwise the comment's text. */
export function currentMessage(comment: Comment): string {
  return comment.followUps.at(-1)?.text ?? comment.text;
}

function roundComment(comment: Comment, number: number, scene: SceneDescription, convention: CoordinateConvention) {
  const convert = (vector: Vec3): Vec3 => toConvention(vector, convention);
  const { context } = comment;
  const messages = [comment.text, ...comment.followUps.map((followUp) => followUp.text)];
  const earlierMessages = messages.slice(0, -1).map((text, index) => ({
    round: comment.rounds[index] ?? comment.followUps[index]?.afterRound ?? 1,
    text,
  }));
  const restAndPosed = (target: NonNullable<Comment["target"]>): { rest: Vec3; posed: Vec3 | null } => {
    if (context.centroid) return { rest: convert(context.centroid.rest), posed: convert(context.centroid.posed) };
    const rest =
      target.kind === "surface"
        ? weightedPoint(comment.anchorRestPositions, target.weights)
        : mean(comment.anchorRestPositions);
    return { rest: convert(rest), posed: null };
  };
  let target: RoundComment["target"] = null;
  if (comment.target) {
    const mesh = meshAtPath(scene, comment.target.mesh)?.name ?? nameInPath(comment.target.mesh);
    const meshRef = { mesh, meshPath: comment.target.mesh };
    target =
      comment.target.kind === "surface"
        ? {
            kind: "point",
            ...meshRef,
            vertices: comment.target.vertices,
            weights: comment.target.weights,
            position: restAndPosed(comment.target),
            bones: context.bones,
          }
        : {
            kind: "region",
            ...meshRef,
            vertices: comment.target.vertices,
            vertexCount: countInRanges(comment.target.vertices),
            centroid: restAndPosed(comment.target),
            bones: context.bones,
          };
  }
  return {
    id: comment.id,
    number,
    text: currentMessage(comment),
    time: roundTime(comment, scene),
    target,
    pose:
      context.joints.length === 0
        ? null
        : { joints: context.joints.map((joint) => ({ ...joint, position: convert(joint.position) })) },
    camera: {
      position: convert(comment.camera.position),
      target: convert(comment.camera.target),
      up: convert(comment.camera.up),
      fov: comment.camera.fov,
      label: context.viewLabel,
    },
    screenshot: context.screenshot === null ? null : `${comment.id}.png`,
    madeOnVersion: comment.madeOnVersion,
    anchorState: comment.target ? comment.anchorState : null,
    anchorVersion: comment.target ? comment.anchorVersion : null,
    earlierMessages,
    ...(comment.parts ? { parts: comment.parts } : {}),
    ...(comment.warning ? { warning: comment.warning } : {}),
  } satisfies RoundComment;
}

function roundTime(comment: Comment, scene: SceneDescription): RoundComment["time"] {
  const time = comment.time;
  if (time.kind === "none") return null;
  const fps = findClip(scene, time.clip)?.fps ?? scene.source.fps;
  const seconds = (frame: number) => Math.round((frame / fps) * 1000) / 1000;
  const clip = { clip: time.clip, clipDisplayName: time.clipDisplayName };
  if (time.kind === "frame") return { ...clip, frame: time.frame, seconds: seconds(time.frame) };
  return { ...clip, frames: [time.start, time.end], seconds: [seconds(time.start), seconds(time.end)] };
}

function mean(points: readonly Vec3[]): Vec3 {
  const sum: Vec3 = [0, 0, 0];
  for (const point of points) {
    sum[0] += point[0];
    sum[1] += point[1];
    sum[2] += point[2];
  }
  const count = Math.max(1, points.length);
  return [sum[0] / count, sum[1] / count, sum[2] / count];
}
