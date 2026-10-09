import type { AssetWarning, Comment, CommentWarning, ReviewFile, WarningFix } from "@arcue/protocol";
import { ArcueError, warningId } from "@arcue/protocol";
import type { CameraAnchor, ImportWarning, SceneDescription } from "@arcue/scene";
import { memberPath } from "@arcue/scene";
import { byCreation } from "./comment-ids";
import { dirname, joinPath } from "./paths";

/**
 * The scene's import warnings with their ids, errors first. Each says whether the review dismissed it, the newest
 * comment made from it, and the command that fixes it. A warning listed twice is listed once.
 */
export function listWarnings(scene: SceneDescription, review: ReviewFile, assetPath: string): AssetWarning[] {
  const dismissed = new Set(review.dismissedWarnings ?? []);
  const seen = new Set<string>();
  const warnings: AssetWarning[] = [];
  for (const warning of scene.source.warnings) {
    const id = warningId(warning);
    if (seen.has(id)) continue;
    seen.add(id);
    warnings.push({
      id,
      ...warning,
      dismissed: dismissed.has(id),
      commentId: newestComment(review, id)?.id ?? null,
      fix: fixFor(warning, scene, assetPath),
    });
  }
  return [...warnings.filter((entry) => entry.severity === "error"), ...warnings.filter((e) => e.severity !== "error")];
}

export function findWarning(warnings: readonly AssetWarning[], id: string): AssetWarning {
  const warning = warnings.find((entry) => entry.id === id);
  if (!warning) throw new ArcueError("not-found", `The asset has no import warning "${id}".`);
  return warning;
}

function newestComment(review: ReviewFile, id: string): Comment | null {
  let newest: Comment | null = null;
  for (const comment of review.comments) {
    if (comment.warning?.id !== id) continue;
    if (!newest || byCreation(comment, newest) > 0) newest = comment;
  }
  return newest;
}

/**
 * The name of the clip a clip warning is about: its name in the file, with the file as a prefix for a composition's
 * file, as the composed scene names that file's clips. Null for a warning about something else.
 */
export function warningClip(warning: Pick<ImportWarning, "subject" | "file">): string | null {
  if (warning.subject.kind !== "clip") return null;
  return warning.file === undefined ? warning.subject.name : memberPath(warning.file, warning.subject.name);
}

function fixFor(warning: ImportWarning, scene: SceneDescription, assetPath: string): WarningFix | null {
  const { subject } = warning;
  const clip = warningClip(warning);
  if (clip !== null && scene.clips.some((entry) => entry.name === clip)) return { kind: "show-clip", clip };
  if (
    subject.kind === "file" &&
    warning.file !== undefined &&
    (warning.code === "file-not-found" || warning.code === "invalid-data" || warning.code === "composition-not-loaded")
  ) {
    return { kind: "retry" };
  }
  const use = (warning.uses ?? []).find((candidate) =>
    scene.materials.some(
      (material) => material.name === candidate.material && material.textureOverrides?.[candidate.slot]?.found !== true,
    ),
  );
  if ((warning.code === "texture-not-found" || warning.code === "texture-path-absolute") && use) {
    return { kind: "choose-texture", material: use.material, slot: use.slot };
  }
  if (warning.code === "texture-not-used" && warning.foundPath !== undefined && warning.file === undefined) {
    const untextured = scene.materials.filter((material) => material.baseColorTexture === null);
    const [material] = untextured;
    if (untextured.length === 1 && material) {
      return {
        kind: "use-as-base-color",
        material: material.name,
        file: joinPath(dirname(assetPath), warning.foundPath),
      };
    }
  }
  return null;
}

/** What a comment keeps of the warning it was made from. */
export function commentWarning(warning: AssetWarning): CommentWarning {
  const kept: CommentWarning = {
    id: warning.id,
    code: warning.code,
    subject: { kind: warning.subject.kind, name: warning.subject.name },
  };
  if (warning.file !== undefined) kept.file = warning.file;
  if (warning.detail !== undefined) kept.detail = warning.detail;
  return kept;
}

/** The text the copy button puts on the clipboard: one instruction for an agent, then each warning not dismissed. */
export function warningPrompt(assetPath: string, warnings: readonly AssetWarning[]): string {
  const listed = warnings.filter((warning) => !warning.dismissed);
  if (listed.length === 0) return `${assetPath} has no import warnings.`;
  const lines = [`Fix these import warnings for ${assetPath}.`];
  listed.forEach((warning, index) => {
    const parts = [warning.message, subjectLabel(warning)];
    if (warning.detail !== undefined) parts.push(warning.detail);
    lines.push(`${index + 1}. ${parts.join(" · ")}`);
  });
  return lines.join("\n");
}

/** The warning's subject for a prompt, such as `texture "Rock.png"` or `clip "Turn" in beetle-turn.fbx`. */
export function subjectLabel(warning: Pick<ImportWarning, "subject" | "file">): string {
  const label = `${warning.subject.kind} "${warning.subject.name}"`;
  return warning.file === undefined || warning.file === warning.subject.name ? label : `${label} in ${warning.file}`;
}

const DEFAULT_FOV = 30;

/** A camera that frames the scene from the front, for a comment made without a view. */
export function frontCamera(scene: SceneDescription): CameraAnchor {
  const { min, max } = scene.bounds;
  const center: [number, number, number] = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  const radius = Math.max(0.01, Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2);
  const distance = radius / Math.sin((DEFAULT_FOV * Math.PI) / 360);
  return { position: [center[0], center[1], center[2] + distance], target: center, up: [0, 1, 0], fov: DEFAULT_FOV };
}
