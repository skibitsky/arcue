import type { CompositionFile, ReviewFile } from "@arcue/protocol";
import { ArcueError } from "@arcue/protocol";
import { memberPath, splitMemberPath } from "@arcue/scene";
import { parseComposition, serializeComposition } from "./composition-file";
import { insideWithoutLinks } from "./links";
import { basename, dirname, joinPath, pathInside, relativePath } from "./paths";
import type { Platform } from "./platform";
import type { ReviewLocation } from "./review-store";
import { compositionFilePath, parseReview, prepareArcueFolder, reviewFilePath, serializeReview } from "./review-store";

/** A review folder to move from one model's path to another's. */
export interface ReviewMove {
  from: ReviewLocation;
  /** The model the review was made for. */
  fromModel: string;
  to: ReviewLocation;
  toModel: string;
  /**
   * Lets the move replace a review at the new place that holds nothing but the versions opening the model recorded, as
   * when someone continues an earlier review on a model they have just opened.
   */
  replaceUntouched?: boolean;
}

/**
 * Moves a model's review folder, with its `review.json`, `composition.json`, screenshots and rounds, to the review
 * folder of the model's new path in one rename, then writes the new path into `review.json`. It never overwrites or
 * merges: a review or anything else at the new place refuses the move with "conflict", except an empty folder or, with
 * `replaceUntouched`, an untouched review. When the model moved to another folder, the composition's paths are
 * rewritten so they still find the same files, and the ids `review.json` keeps for those files follow them.
 */
export async function moveReview(platform: Platform, move: ReviewMove): Promise<void> {
  const { from, to } = move;
  const source = reviewFilePath(from);
  if (
    !(await insideWithoutLinks(platform, from.root, source)) ||
    !(await insideWithoutLinks(platform, to.root, to.folder))
  ) {
    throw new ArcueError("conflict", `The review of ${basename(move.fromModel)} is reached through a symbolic link.`);
  }
  if ((await platform.stat(source))?.kind !== "file") {
    throw new ArcueError("not-found", `${basename(move.fromModel)} has no review to move.`);
  }
  await clearTarget(platform, move);
  await prepareArcueFolder(platform, to);
  await platform.rename(from.folder, to.folder);

  const labels =
    dirname(move.fromModel) === dirname(move.toModel)
      ? new Map<string, string>()
      : await rebaseCompositionFile(platform, compositionFilePath(to), dirname(move.fromModel), dirname(move.toModel));
  const target = reviewFilePath(to);
  const review = parseReview(await platform.readText(target), target);
  const moved = relabelMembers({ ...review, asset: { ...review.asset, path: to.assetPath } }, labels);
  await platform.writeFileAtomic(target, serializeReview({ ...moved, revision: review.revision + 1 }));
  await removeEmptyFolders(platform, from.folder, from.root);
}

/** Whether a review holds nothing but versions: no comments, rounds or dismissed warnings. */
export function isUntouched(review: ReviewFile): boolean {
  return review.comments.length === 0 && review.rounds.length === 0 && (review.dismissedWarnings ?? []).length === 0;
}

async function clearTarget(platform: Platform, move: ReviewMove): Promise<void> {
  const { folder } = move.to;
  const stat = await platform.stat(folder);
  if (stat === null) return;
  const name = basename(move.toModel);
  if (stat.kind !== "directory") throw new ArcueError("conflict", `${folder} is in the way of ${name}'s review.`);
  const entries = await platform.list(folder);
  const hasReview = entries.some((entry) => entry.name === "review.json");
  if (entries.length > 0) {
    const replaceable =
      move.replaceUntouched === true &&
      hasReview &&
      entries.length === 1 &&
      isUntouched(parseReview(await platform.readText(reviewFilePath(move.to)), reviewFilePath(move.to)));
    if (!replaceable) {
      throw new ArcueError(
        "conflict",
        hasReview
          ? `${name} already has a review, so the review of ${basename(move.fromModel)} stays where it is.`
          : `${folder} already holds files, so the review of ${basename(move.fromModel)} stays where it is.`,
      );
    }
  }
  await platform.remove(folder);
}

/**
 * Rewrites the paths of a composition file for a model that moved from one folder to another, and returns the old and
 * new labels of the files whose paths changed. A broken composition file is left as it is.
 */
async function rebaseCompositionFile(
  platform: Platform,
  path: string,
  fromFolder: string,
  toFolder: string,
): Promise<Map<string, string>> {
  if ((await platform.stat(path))?.kind !== "file") return new Map();
  let composition: CompositionFile;
  try {
    composition = parseComposition(await platform.readText(path), path, "conflict");
  } catch {
    return new Map();
  }
  const rebased = await rebaseComposition(platform, composition, fromFolder, toFolder);
  if (rebased.labels.size > 0) await platform.writeFileAtomic(path, serializeComposition(rebased.composition));
  return rebased.labels;
}

/**
 * The composition for a model that moved from `fromFolder` to `toFolder`. A path that finds a file from the new folder
 * stays as written, as when the files moved along with the model; one that finds a file only from the old folder is
 * rewritten to point at that file. `labels` maps each rewritten file's label, its path relative to the model's folder,
 * from the old to the new one.
 */
export async function rebaseComposition(
  platform: Platform,
  composition: CompositionFile,
  fromFolder: string,
  toFolder: string,
): Promise<{ composition: CompositionFile; labels: Map<string, string> }> {
  const labels = new Map<string, string>();
  const rebase = async (written: string): Promise<string> => {
    if ((await platform.stat(joinPath(toFolder, written)))?.kind === "file") return written;
    const file = joinPath(fromFolder, written);
    const moved = relativePath(toFolder, file);
    const label = relativePath(fromFolder, file);
    if (moved === null || label === null || (await platform.stat(file))?.kind !== "file") return written;
    labels.set(label, moved);
    return moved;
  };
  const next: CompositionFile = { ...composition };
  if (composition.animations) {
    next.animations = [];
    for (const file of composition.animations) next.animations.push(await rebase(file));
  }
  if (composition.attach) {
    next.attach = [];
    for (const entry of composition.attach) next.attach.push({ ...entry, file: await rebase(entry.file) });
  }
  if (composition.materials) {
    const materials: NonNullable<CompositionFile["materials"]> = {};
    for (const [material, slots] of Object.entries(composition.materials)) {
      const rebased: typeof slots = {};
      for (const [slot, file] of Object.entries(slots) as [keyof typeof slots, string | undefined][]) {
        if (file !== undefined) rebased[slot] = await rebase(file);
      }
      materials[material] = rebased;
    }
    next.materials = materials;
  }
  if (composition.hidden) next.hidden = composition.hidden.map((id) => relabelId(id, labels));
  return { composition: next, labels };
}

/**
 * The review with the ids it keeps for a composition's files renamed: node, mesh, part and clip ids written as
 * `<file>//<path>`, warning ids and files, and the files of each version. `labels` maps old file labels to new ones.
 */
export function relabelMembers(review: ReviewFile, labels: ReadonlyMap<string, string>): ReviewFile {
  if (labels.size === 0) return review;
  const id = (value: string) => relabelId(value, labels);
  const label = (value: string) => labels.get(value) ?? value;
  const dismissed = review.dismissedWarnings?.map((value) => relabelWarningId(value, labels));
  return {
    ...review,
    ...(dismissed ? { dismissedWarnings: dismissed } : {}),
    versions: review.versions.map((version) => ({
      ...version,
      meshes: version.meshes.map((entry) => ({ ...entry, mesh: id(entry.mesh) })),
      ...(version.files ? { files: version.files.map((file) => ({ ...file, file: label(file.file) })) } : {}),
    })),
    comments: review.comments.map((comment) => ({
      ...comment,
      time: comment.time.kind === "none" ? comment.time : { ...comment.time, clip: id(comment.time.clip) },
      target: comment.target && { ...comment.target, mesh: id(comment.target.mesh) },
      context: {
        ...comment.context,
        joints: comment.context.joints.map((joint) => ({ ...joint, path: id(joint.path) })),
      },
      ...(comment.parts
        ? {
            parts: {
              ...comment.parts,
              hidden: comment.parts.hidden.map(id),
              shown: comment.parts.shown.map(id),
              isolated: comment.parts.isolated && id(comment.parts.isolated),
            },
          }
        : {}),
      ...(comment.warning
        ? {
            warning: {
              ...comment.warning,
              id: relabelWarningId(comment.warning.id, labels),
              ...(comment.warning.file === undefined ? {} : { file: label(comment.warning.file) }),
            },
          }
        : {}),
    })),
  };
}

function relabelId(id: string, labels: ReadonlyMap<string, string>): string {
  const { file, path } = splitMemberPath(id);
  const renamed = file === null ? undefined : labels.get(file);
  return renamed === undefined ? id : memberPath(renamed, path);
}

/** A warning id is "<code>:<kind>:<name>", where the name of a composition file's subject starts with "<file>//". */
function relabelWarningId(id: string, labels: ReadonlyMap<string, string>): string {
  const match = /^([^:]*:[^:]*:)(.*)$/s.exec(id);
  return match ? `${match[1]}${relabelId(match[2] ?? "", labels)}` : id;
}

/** Removes the folders above `folder` that the move left empty, up to the reviews root. Best effort. */
async function removeEmptyFolders(platform: Platform, folder: string, root: string): Promise<void> {
  try {
    for (let current = dirname(folder); pathInside(root, current); current = dirname(current)) {
      if ((await platform.stat(current))?.kind !== "directory" || (await platform.list(current)).length > 0) return;
      await platform.remove(current);
    }
  } catch {
    return;
  }
}
