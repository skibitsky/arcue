import type { CompositionFile, ReviewFile } from "@arcue/protocol";
import { ArcueError, COMPOSITION_VERSION, joinsByName } from "@arcue/protocol";
import { memberPath, splitMemberPath } from "@arcue/scene";
import { readComposition, serializeComposition, withRewrittenPaths, writtenPaths } from "./composition-file";
import { insideWithoutLinks } from "./links";
import { basename, dirname, joinPath, pathInside, relativePath, stemOf } from "./paths";
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
 * `replaceUntouched`, an untouched review. A `review.json` it cannot read refuses the move before anything changes, and
 * a failure after the rename moves the folder back. When the model moved to another folder or took another name, the
 * composition's paths are rewritten so they still find the same files, and the ids `review.json` keeps for those
 * files follow them.
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
  const review = parseReview(await platform.readText(source), source);
  const composition = await movedComposition(platform, move, review);
  await clearTarget(platform, move);
  await prepareArcueFolder(platform, to);
  await platform.rename(from.folder, to.folder);
  const compositionPath = compositionFilePath(to);
  try {
    if (composition.text !== null) await platform.writeFileAtomic(compositionPath, composition.text);
    const moved = relabelMembers({ ...review, asset: { ...review.asset, path: to.assetPath } }, composition.labels);
    await platform.writeFileAtomic(reviewFilePath(to), serializeReview({ ...moved, revision: review.revision + 1 }));
  } catch (error) {
    const undo = async () => {
      if (composition.text !== null) {
        if (composition.original === null) await platform.remove(compositionPath);
        else await platform.writeFileAtomic(compositionPath, composition.original);
      }
      await platform.rename(to.folder, from.folder);
    };
    await undo().catch(() => undefined);
    throw error;
  }
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
  if (entries.length > 0) {
    const hasReview = entries.some((entry) => entry.name === "review.json");
    const onlyReview = hasReview && entries.length === 1;
    const untouched = hasReview && (await untouchedReview(platform, move.to));
    if (!(move.replaceUntouched === true && onlyReview && untouched)) {
      throw new ArcueError(
        "conflict",
        hasReview && (onlyReview || !untouched)
          ? `${name} already has a review, so the review of ${basename(move.fromModel)} stays where it is.`
          : `${folder} already holds files, so the review of ${basename(move.fromModel)} stays where it is.`,
      );
    }
  }
  await platform.remove(folder);
}

async function untouchedReview(platform: Platform, location: ReviewLocation): Promise<boolean> {
  const file = reviewFilePath(location);
  try {
    return isUntouched(parseReview(await platform.readText(file), file));
  } catch {
    return false;
  }
}

/**
 * The composition file's text after a move, or null when it stays as it is, with its text before, null where there was
 * no file, and the old and new labels of the files whose paths changed. A broken composition file is left as it is.
 */
async function movedComposition(
  platform: Platform,
  move: ReviewMove,
  review: ReviewFile,
): Promise<{ text: string | null; original: string | null; labels: Map<string, string> }> {
  const fromFolder = dirname(move.fromModel);
  const toFolder = dirname(move.toModel);
  let found: { text: string; composition: CompositionFile } | null;
  try {
    found = await readComposition(platform, compositionFilePath(move.from), "conflict");
  } catch {
    return { text: null, original: null, labels: new Map() };
  }
  const before: CompositionFile = found?.composition ?? { version: COMPOSITION_VERSION };
  const rebased =
    fromFolder === toFolder
      ? { composition: before, labels: new Map<string, string>() }
      : await rebaseComposition(platform, before, fromFolder, toFolder);
  const joined = await joinedByName(platform, move, review, before);
  const animations = [...(rebased.composition.animations ?? []), ...joined.animations];
  const text = serializeComposition({ ...rebased.composition, animations });
  const labels = new Map([...rebased.labels, ...joined.labels]);
  if (text === serializeComposition(before)) return { text: null, original: null, labels };
  return { text, original: found?.text ?? null, labels };
}

/**
 * The composition for a model that moved from `fromFolder` to `toFolder`. A path that still finds a file from the old
 * folder is rewritten to point at that file, so a file of the same name beside the new folder never takes its place.
 * A path whose old file is gone stays as written, as when the files moved along with the model. `labels` maps each
 * rewritten file's label, its path relative to the model's folder, from the old to the new one.
 */
export async function rebaseComposition(
  platform: Platform,
  composition: CompositionFile,
  fromFolder: string,
  toFolder: string,
): Promise<{ composition: CompositionFile; labels: Map<string, string> }> {
  const labels = new Map<string, string>();
  const rewritten = new Map<string, string>();
  for (const written of new Set(writtenPaths(composition))) {
    const file = joinPath(fromFolder, written);
    const moved = relativePath(toFolder, file);
    const label = relativePath(fromFolder, file);
    if (moved === null || label === null || (await platform.stat(file))?.kind !== "file") continue;
    rewritten.set(written, moved);
    if (label !== moved) labels.set(label, moved);
  }
  const next = withRewrittenPaths(
    composition,
    (written) => rewritten.get(written) ?? written,
    (id) => relabelId(id, labels),
  );
  return { composition: next, labels };
}

/**
 * The old model's "<stem>@<clip>.fbx" files that the review names and that would no longer join the model by name.
 * Each maps to the new model's file of the same clip when there is one beside it. Otherwise, while it still exists, it
 * joins as an animation file written from the new model's folder, labelled as that path, as any member file is.
 */
async function joinedByName(
  platform: Platform,
  move: ReviewMove,
  review: ReviewFile,
  composition: CompositionFile,
): Promise<{ animations: string[]; labels: Map<string, string> }> {
  const fromFolder = dirname(move.fromModel);
  const toFolder = dirname(move.toModel);
  const listed = new Set(
    writtenPaths(composition).map((written) => relativePath(fromFolder, joinPath(fromFolder, written))),
  );
  const animations: string[] = [];
  const labels = new Map<string, string>();
  for (const label of namedFiles(review)) {
    if (!joinsByName(basename(move.fromModel), label) || listed.has(label)) continue;
    const renamed = `${stemOf(move.toModel)}${label.slice(stemOf(move.fromModel).length)}`;
    if ((await platform.stat(joinPath(toFolder, renamed)))?.kind === "file") {
      if (renamed !== label) labels.set(label, renamed);
      continue;
    }
    const old = joinPath(fromFolder, label);
    const written = relativePath(toFolder, old);
    if (written === null || (await platform.stat(old))?.kind !== "file") continue;
    animations.push(written);
    if (written !== label) labels.set(label, written);
  }
  return { animations, labels };
}

/**
 * The review with the ids it keeps for a composition's files renamed: node, mesh, part and clip ids written as
 * `<file>//<path>`, warning ids and files, and the files of each version. `labels` maps old file labels to new ones.
 */
export function relabelMembers(review: ReviewFile, labels: ReadonlyMap<string, string>): ReviewFile {
  if (labels.size === 0) return review;
  return renameFiles(review, (label) => labels.get(label) ?? label);
}

/** The file labels the review's ids name, such as "Hero@Run.fbx" for a comment on the clip "Hero@Run.fbx//Run". */
function namedFiles(review: ReviewFile): Set<string> {
  const named = new Set<string>();
  renameFiles(review, (label) => {
    named.add(label);
    return label;
  });
  return named;
}

function renameFiles(review: ReviewFile, rename: (label: string) => string): ReviewFile {
  const id = (value: string) => renameMember(value, rename);
  const dismissed = review.dismissedWarnings?.map((value) => renameWarningId(value, rename));
  return {
    ...review,
    ...(dismissed ? { dismissedWarnings: dismissed } : {}),
    versions: review.versions.map((version) => ({
      ...version,
      meshes: version.meshes.map((entry) => ({ ...entry, mesh: id(entry.mesh) })),
      ...(version.files ? { files: version.files.map((file) => ({ ...file, file: rename(file.file) })) } : {}),
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
              id: renameWarningId(comment.warning.id, rename),
              ...(comment.warning.file === undefined ? {} : { file: rename(comment.warning.file) }),
            },
          }
        : {}),
    })),
  };
}

/** A node, mesh, part or clip id with its file renamed, when it comes from a file in `labels`. */
export function relabelId(id: string, labels: ReadonlyMap<string, string>): string {
  return renameMember(id, (label) => labels.get(label) ?? label);
}

function renameMember(id: string, rename: (label: string) => string): string {
  const { file, path } = splitMemberPath(id);
  if (file === null) return id;
  const renamed = rename(file);
  return renamed === file ? id : memberPath(renamed, path);
}

/** A warning id is "<code>:<kind>:<name>", where the name of a composition file's subject starts with "<file>//". */
function renameWarningId(id: string, rename: (label: string) => string): string {
  const match = /^([^:]*:[^:]*:)(.*)$/s.exec(id);
  return match ? `${match[1]}${renameMember(match[2] ?? "", rename)}` : id;
}

/** Removes the folders above `folder` that the move left empty, up to the reviews root, one empty folder at a time. */
async function removeEmptyFolders(platform: Platform, folder: string, root: string): Promise<void> {
  try {
    for (let current = dirname(folder); pathInside(root, current); current = dirname(current)) {
      await platform.removeEmptyFolder(current);
    }
  } catch {
    return;
  }
}
