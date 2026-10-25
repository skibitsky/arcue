import type { ReviewFile } from "@arcue/protocol";
import { ArcueError, COMPOSITION_FILE_NAME, REVIEW_FORMAT, reviewFileSchema, reviewFormat } from "@arcue/protocol";
import { insideWithoutLinks } from "./links";
import { basename, joinPath, normalizePath, pathInside } from "./paths";
import type { Platform, Unlock } from "./platform";

export const REVIEW_SCHEMA_VERSION = 1;

/** The name of the lock every write and move under a reviews root holds. */
export const REVIEWS_LOCK = "reviews";

/** The name of the lock a write of `settings.json` holds. */
export const SETTINGS_LOCK = "settings";

/** The folder at a repository's root that holds Arcue's review data. */
export const ARCUE_FOLDER = ".arcue";

/** Where one asset's review data lives. */
export interface ReviewLocation {
  /** The git repository root, or null when the asset is outside any repository. */
  workspaceRoot: string | null;
  /** The folder that holds every review folder: `.arcue/reviews` in the repository, or `reviews` in app data. */
  root: string;
  /** The asset's review folder. */
  folder: string;
  /** The asset path stored in `review.json`: relative to the workspace root, or absolute outside a repository. */
  assetPath: string;
}

/**
 * The review folder is `.arcue/reviews/<path relative to the repository root>/` at the repository root. Outside a
 * repository it is `reviews/<absolute path without its root marks>/` under the app data folder.
 */
export async function locateReview(platform: Platform, assetPath: string): Promise<ReviewLocation> {
  const path = normalizePath(assetPath);
  const workspaceRoot = await platform.findWorkspaceRoot(path);
  return (
    (workspaceRoot === null ? null : reviewLocationIn(platform.appDataDir, workspaceRoot, path)) ??
    reviewLocationIn(platform.appDataDir, null, path)
  );
}

/**
 * The review location of a model in a git repository, or in the app data folder for a null `workspaceRoot`. Null when
 * the model is not inside that repository.
 */
export function reviewLocationIn(appDataDir: string, workspaceRoot: null, modelPath: string): ReviewLocation;
export function reviewLocationIn(
  appDataDir: string,
  workspaceRoot: string | null,
  modelPath: string,
): ReviewLocation | null;
export function reviewLocationIn(
  appDataDir: string,
  workspaceRoot: string | null,
  modelPath: string,
): ReviewLocation | null {
  const path = normalizePath(modelPath);
  if (workspaceRoot === null) {
    const root = joinPath(appDataDir, "reviews");
    return { workspaceRoot: null, root, folder: joinPath(root, rootless(path)), assetPath: path };
  }
  const relative = pathInside(workspaceRoot, path);
  if (!relative) return null;
  const root = joinPath(workspaceRoot, ARCUE_FOLDER, "reviews");
  return { workspaceRoot, root, folder: joinPath(root, relative), assetPath: relative };
}

function rootless(path: string): string {
  if (path.startsWith("//")) return path.slice(2);
  const drive = /^([A-Z]):\//.exec(path);
  if (drive) return `${drive[1]}/${path.slice(3)}`;
  return path.slice(1);
}

/** Holds the lock of the reviews root the location is in. Every write and move under that root holds it. */
export function lockReviews(platform: Platform, location: ReviewLocation): Promise<Unlock> {
  return platform.lock(location.workspaceRoot ?? platform.appDataDir, REVIEWS_LOCK);
}

/** The model a review is for, as an absolute path. */
export function modelPathOf(location: ReviewLocation): string {
  return location.workspaceRoot === null ? location.assetPath : joinPath(location.workspaceRoot, location.assetPath);
}

export function reviewFilePath(location: ReviewLocation): string {
  return joinPath(location.folder, "review.json");
}

export async function checkReviewPath(platform: Platform, location: ReviewLocation, path: string): Promise<void> {
  const root = location.workspaceRoot ?? platform.appDataDir;
  if (pathInside(location.folder, path) === null || !(await insideWithoutLinks(platform, root, path))) {
    throw new ArcueError("conflict", `${path} is outside the review folder or reached through a symbolic link.`);
  }
}

export async function writeReviewFile(
  platform: Platform,
  location: ReviewLocation,
  path: string,
  data: string | Uint8Array,
): Promise<void> {
  await checkReviewPath(platform, location, path);
  await platform.writeFileAtomic(path, data);
}

export async function removeReviewFile(platform: Platform, location: ReviewLocation, path: string): Promise<void> {
  await checkReviewPath(platform, location, path);
  await platform.remove(path);
}

/**
 * Call before writing into a review folder. When the repository has no `.arcue/` folder yet, or only an empty one that
 * a failed first write left behind, it writes `.arcue/.gitignore` containing `*`, so git ignores the reviews until
 * someone deletes that file to share them. An `.arcue/` folder with anything in it, or a link, is left as it is, the
 * repository's own `.gitignore` is never touched, and outside a repository nothing happens.
 */
export async function prepareArcueFolder(platform: Platform, location: ReviewLocation): Promise<void> {
  if (location.workspaceRoot === null) return;
  const folder = joinPath(location.workspaceRoot, ARCUE_FOLDER);
  const stat = await platform.stat(folder);
  if (stat !== null && (stat.kind !== "directory" || (await platform.list(folder)).length > 0)) return;
  await platform.writeFileAtomic(joinPath(folder, ".gitignore"), "*\n");
}

/** The asset's composition file, which the review folder keeps beside `review.json`, so nothing lands beside the model. */
export function compositionFilePath(location: ReviewLocation): string {
  return joinPath(location.folder, COMPOSITION_FILE_NAME);
}

/** Where a model's composition file lives: `composition.json` in its review folder. */
export async function locateComposition(platform: Platform, modelPath: string): Promise<string> {
  return compositionFilePath(await locateReview(platform, modelPath));
}

export function emptyReview(assetPath: string): ReviewFile {
  return {
    schemaVersion: REVIEW_SCHEMA_VERSION,
    asset: { path: assetPath },
    versions: [],
    comments: [],
    queue: [],
    rounds: [],
    revision: 0,
  };
}

/**
 * Parses `review.json`. A file from a newer Arcue, broken JSON and content that breaks the schema reject as "conflict",
 * so the core never overwrites a file it cannot read.
 */
export function parseReview(text: string, path: string): ReviewFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    throw new ArcueError("conflict", `${path} is not valid JSON.`, { cause: error });
  }
  const version = typeof raw === "object" && raw !== null && "schemaVersion" in raw ? raw.schemaVersion : undefined;
  if (typeof version === "number" && version > REVIEW_SCHEMA_VERSION) {
    throw new ArcueError("conflict", `${path} has schema version ${version}, made by a newer Arcue.`);
  }
  const parsed = reviewFileSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => ({
      path: issue.path.map((key) => (typeof key === "number" ? key : String(key))),
      message: issue.message,
    }));
    const summary = issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    throw new ArcueError("conflict", `${path} does not match the review schema. ${summary}`, { issues });
  }
  return parsed.data;
}

/**
 * The asset's saved review and the file's text, or an empty review and null when there is no file. The asset path is
 * taken from the location. A file that cannot be read rejects as "conflict".
 */
export async function loadReview(
  platform: Platform,
  location: ReviewLocation,
): Promise<{ review: ReviewFile; text: string | null }> {
  const path = reviewFilePath(location);
  await checkReviewPath(platform, location, path);
  const stat = await platform.stat(path);
  if (stat === null) return { review: emptyReview(location.assetPath), text: null };
  if (stat.kind !== "file") throw new ArcueError("conflict", `${path} is not a plain file.`);
  const text = await platform.readText(path);
  const review = parseReview(text, path);
  return { review: { ...review, asset: { ...review.asset, path: location.assetPath } }, text };
}

/** Whether a newer Arcue saved the review, which may then hold fields that this build drops as it reads the file. */
export function isNewerFormat(review: ReviewFile): boolean {
  return reviewFormat(review) > REVIEW_FORMAT;
}

/** Refuses to save over a review a newer Arcue saved, since that would delete the fields this build does not know. */
export function checkSavable(review: ReviewFile, location: ReviewLocation): void {
  if (isNewerFormat(review)) {
    throw new ArcueError(
      "forbidden",
      `The review of ${basename(location.folder)} was saved by a newer version of Arcue. Update Arcue to change it.`,
    );
  }
}

/** The review as this build saves it: at `revision`, and in this build's format, recorded beside the schema version. */
export function savedReview(review: ReviewFile, revision: number): ReviewFile {
  const { schemaVersion, format: _format, ...rest } = review;
  return { schemaVersion, format: REVIEW_FORMAT, ...rest, revision };
}

/** The file text of a review, after checking it against the schema. */
export function serializeReview(review: ReviewFile): string {
  const checked = reviewFileSchema.safeParse(review);
  if (!checked.success) {
    const summary = checked.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    throw new ArcueError("internal", `The review change would break review.json. ${summary}`);
  }
  return `${JSON.stringify(review, null, 2)}\n`;
}
