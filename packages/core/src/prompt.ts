import type { BoneShare, PartView, RoundComment, RoundData } from "@arcue/protocol";
import { COMPOSITION_FILE_NAME } from "@arcue/protocol";
import { nameInPath } from "./scene-lookup";
import { subjectLabel } from "./warnings";

export interface PromptInput {
  data: RoundData;
  /** Absolute path of the asset file. */
  assetPath: string;
  /** Absolute path of the round's folder. */
  roundFolder: string;
  /** When the version's file was written, as the reader's clock shows it, such as "14:02". */
  exportedAt: string;
  /** People's names of the parts by id; a part missing here is named after the last node in its id. */
  partNames?: ReadonlyMap<string, string>;
}

/** A region lists its bones down to this share of its skin weight. */
const LISTED_BONE_SHARE = 0.05;
const LISTED_BONES = 4;
const LISTED_PARTS = 3;

/** Renders a round as the Markdown prompt for coding agents, in the format of the example in the spec. */
export function renderPrompt({ data, assetPath, roundFolder, exportedAt, partNames = new Map() }: PromptInput): string {
  const count = data.comments.length;
  const up = data.asset.space.up === "+Z" ? "Z up as in Blender" : "Y up";
  const header = [
    `3D review · round ${data.round} · ${count} ${count === 1 ? "comment" : "comments"}`,
    `Asset: ${assetPath}`,
    `Version ${data.asset.version.slice(0, 7)}, exported ${exportedAt}`,
    ...compositionLine(data),
    `Data and screenshots: ${roundFolder.endsWith("/") ? roundFolder : `${roundFolder}/`}`,
    `Meters, right-handed, ${up}. Frames count from each clip's first frame (0) at ${formatNumber(data.asset.fps)} fps.`,
    "Vertex numbers follow the file's vertex order, which is Blender's order for Blender exports.",
  ].join("\n");
  return [header, ...data.comments.map((comment) => renderComment(comment, partNames))].join("\n\n");
}

/**
 * The other files of a composition, which the prompt names once so their prefixed mesh paths make sense. The
 * composition file itself lives in the review folder, not the model's, so it is left out.
 */
function compositionLine(data: RoundData): string[] {
  const others = (data.asset.files ?? [])
    .slice(1)
    .map((file) => file.file)
    .filter((file) => file !== COMPOSITION_FILE_NAME);
  if (others.length === 0) return [];
  return [
    `Also loaded, relative to the model's folder: ${others.join(", ")}. Meshes from those files are named "<file>//<node path>".`,
  ];
}

function renderComment(comment: RoundComment, partNames: ReadonlyMap<string, string>): string {
  if (comment.warning) return renderWarningComment(comment, comment.warning);
  const headline = [timeLabel(comment), targetLabel(comment)];
  const parts = comment.parts ? partsLabel(comment.parts, partNames) : null;
  if (parts) headline.push(parts);
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

/** A comment made from an import warning: the warning's code and subject, its detail, then the comment's text. */
function renderWarningComment(comment: RoundComment, warning: NonNullable<RoundComment["warning"]>): string {
  const lines = [`${comment.number}. Import warning "${warning.code}" · ${subjectLabel(warning)}`];
  if (warning.detail !== undefined) lines.push(`   ${warning.detail}`);
  for (const earlier of comment.earlierMessages) lines.push(`   Round ${earlier.round}: ${quote(earlier.text)}`);
  lines.push(`   ${quote(comment.text)}`);
  return lines.join("\n");
}

function timeLabel({ time }: RoundComment): string {
  if (time === null) return "Rest pose";
  if ("frame" in time) {
    const { sourceFrame } = time;
    const source =
      sourceFrame === undefined || sourceFrame === time.frame ? "" : ` (file frame ${formatNumber(sourceFrame)})`;
    return `Clip "${time.clipDisplayName}", frame ${time.frame}${source}`;
  }
  const [first, last] = time.sourceFrames ?? [];
  const same = first === time.frames[0] && last === time.frames[1];
  const source =
    first === undefined || last === undefined || same
      ? ""
      : ` (file frames ${formatNumber(first)}–${formatNumber(last)})`;
  return `Clip "${time.clipDisplayName}", frames ${time.frames[0]}–${time.frames[1]}${source}`;
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

/** One short clause for a view that differs from the default, such as "LOD1, Boulder2 hidden". */
function partsLabel(view: PartView, names: ReadonlyMap<string, string>): string | null {
  const name = (id: string) => names.get(id) ?? nameInPath(id);
  const list = (ids: readonly string[]) => {
    const listed = ids.slice(0, LISTED_PARTS).map(name).join(", ");
    return ids.length > LISTED_PARTS ? `${listed} and ${ids.length - LISTED_PARTS} more` : listed;
  };
  const clauses: string[] = [];
  if (view.lod > 0) clauses.push(`LOD${view.lod}`);
  if (view.isolated !== null) {
    clauses.push(`${name(view.isolated)} isolated`);
  } else {
    if (view.hidden.length > 0) clauses.push(`${list(view.hidden)} hidden`);
    if (view.shown.length > 0) clauses.push(`${list(view.shown)} shown`);
  }
  return clauses.length > 0 ? clauses.join(", ") : null;
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
