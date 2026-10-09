import type { BoneShare, RoundComment, RoundData } from "@arcue/protocol";

export interface PromptInput {
  data: RoundData;
  /** Absolute path of the asset file. */
  assetPath: string;
  /** Absolute path of the round's folder. */
  roundFolder: string;
  /** When the version's file was written, as the reader's clock shows it, such as "14:02". */
  exportedAt: string;
}

/** A region lists its bones down to this share of its skin weight. */
const LISTED_BONE_SHARE = 0.05;
const LISTED_BONES = 4;

/** Renders a round as the Markdown prompt for coding agents, in the format of the example in the spec. */
export function renderPrompt({ data, assetPath, roundFolder, exportedAt }: PromptInput): string {
  const count = data.comments.length;
  const up = data.asset.space.up === "+Z" ? "Z up as in Blender" : "Y up";
  const header = [
    `3D review · round ${data.round} · ${count} ${count === 1 ? "comment" : "comments"}`,
    `Asset: ${assetPath}`,
    `Version ${data.asset.version}, exported ${exportedAt}`,
    `Data and screenshots: ${roundFolder.endsWith("/") ? roundFolder : `${roundFolder}/`}`,
    `Meters, right-handed, ${up}. Frames count from each clip's first frame (0) at ${formatNumber(data.asset.fps)} fps.`,
    "Vertex numbers follow the file's vertex order, which is Blender's order for Blender exports.",
  ].join("\n");
  return [header, ...data.comments.map(renderComment)].join("\n\n");
}

function renderComment(comment: RoundComment): string {
  const headline = [timeLabel(comment), targetLabel(comment)];
  if (comment.anchorState === "detached" && comment.anchorVersion !== null) {
    headline.push(
      `detached: its vertex numbers refer to version ${comment.anchorVersion}, so match it by its rest positions`,
    );
  }
  const firstRound = comment.earlierMessages[0]?.round;
  if (firstRound !== undefined) headline.push(`follow-up, first sent in round ${firstRound}`);
  const lines = [`${comment.number}. ${headline.join(" · ")}`];
  const bones = comment.target?.kind === "region" ? listedBones(comment.target.bones) : [];
  if (bones.length > 0)
    lines.push(`   Bones: ${bones.map((bone) => `${bone.name} ${percent(bone.share)}`).join(", ")}`);
  const view = viewLine(comment);
  if (view) lines.push(`   ${view}`);
  for (const earlier of comment.earlierMessages) lines.push(`   Round ${earlier.round}: ${quote(earlier.text)}`);
  lines.push(`   ${quote(comment.text)}`);
  return lines.join("\n");
}

function timeLabel({ time }: RoundComment): string {
  if (time === null) return "Rest pose";
  if ("frame" in time) return `Clip "${time.clipDisplayName}", frame ${time.frame}`;
  return `Clip "${time.clipDisplayName}", frames ${time.frames[0]}–${time.frames[1]}`;
}

function targetLabel({ target }: RoundComment): string {
  if (target === null) return "no surface target";
  if (target.kind === "region") {
    return `region on "${target.mesh}", ${target.vertexCount} ${target.vertexCount === 1 ? "vertex" : "vertices"}`;
  }
  const bone = strongest(target.bones);
  return bone ? `point on "${target.mesh}", near bone "${bone.name}"` : `point on "${target.mesh}"`;
}

function viewLine(comment: RoundComment): string | null {
  if (comment.target === null && comment.screenshot === null) return null;
  const parts: string[] = [];
  if (comment.camera.label !== "") parts.push(`View: ${comment.camera.label}`);
  if (comment.screenshot !== null)
    parts.push(parts.length > 0 ? `screenshot: ${comment.screenshot}` : `Screenshot: ${comment.screenshot}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function strongest(bones: readonly BoneShare[]): BoneShare | null {
  return bones.reduce<BoneShare | null>((best, bone) => (best === null || bone.share > best.share ? bone : best), null);
}

function listedBones(bones: readonly BoneShare[]): BoneShare[] {
  return [...bones]
    .sort((a, b) => b.share - a.share)
    .filter((bone) => Math.round(bone.share * 100) >= LISTED_BONE_SHARE * 100)
    .slice(0, LISTED_BONES);
}

function percent(share: number): string {
  return `${Math.round(share * 100)}%`;
}

function quote(text: string): string {
  return `"${text.replaceAll("\n", "\n   ")}"`;
}

function formatNumber(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}
