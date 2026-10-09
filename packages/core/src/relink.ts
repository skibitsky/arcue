import type { AssetVersion, MeshTopology, RelinkMatch, ReviewCandidate, ReviewFile } from "@arcue/protocol";
import { splitMemberPath } from "@arcue/scene";
import type { FileIdentity } from "./identity";
import { matchIdentity } from "./identity";
import { insideWithoutLinks } from "./links";
import { joinPath, normalizePath, pathInside } from "./paths";
import type { Platform } from "./platform";
import type { ReviewLocation } from "./review-store";
import { parseReview, reviewLocationIn } from "./review-store";

/** The most folders the search for earlier reviews lists under a reviews root. */
export const MAX_SCANNED_FOLDERS = 2048;

/** The most earlier reviews whose models are gone the search reads. */
export const MAX_EARLIER_REVIEWS = 64;

/**
 * Rule 3 offers an earlier review whose latest version has exactly the model's own mesh paths, and in which more than
 * this share of those meshes keep their topology hash or their source vertex count. A re-export that edits a few
 * meshes still matches; a different model that happens to use the same mesh names does not.
 */
export const STRUCTURE_MATCH_SHARE = 0.5;

/** A review whose model file is gone, as the search for earlier reviews found it. */
export interface EarlierReview {
  /** Absolute path of the model the review was made for. */
  model: string;
  location: ReviewLocation;
  review: ReviewFile;
}

/**
 * The reviews under the location's reviews root whose model file is gone. A review whose model still exists belongs to
 * that model, as with a copy, and is never listed. It lists at most `MAX_SCANNED_FOLDERS` folders breadth first, reads
 * at most `MAX_EARLIER_REVIEWS` reviews, never follows links, and skips the folders in `skip`, such as the reviews of
 * open assets, and files it cannot read. `complete` is false when a bound stopped it before it saw every folder.
 */
export async function findEarlierReviews(
  platform: Platform,
  location: ReviewLocation,
  skip: ReadonlySet<string>,
): Promise<{ reviews: EarlierReview[]; complete: boolean }> {
  const { root, workspaceRoot } = location;
  if (!(await insideWithoutLinks(platform, workspaceRoot ?? platform.appDataDir, root))) {
    return { reviews: [], complete: true };
  }
  const reviews: EarlierReview[] = [];
  const queue = [root];
  for (let listed = 0; listed < MAX_SCANNED_FOLDERS && reviews.length < MAX_EARLIER_REVIEWS; listed++) {
    const folder = queue.shift();
    if (folder === undefined) break;
    const entries = await platform.list(folder).catch(() => []);
    if (entries.some((entry) => entry.name === "review.json" && entry.kind === "file")) {
      const earlier = skip.has(folder) ? null : await readEarlierReview(platform, location, folder);
      if (earlier) reviews.push(earlier);
      continue;
    }
    for (const entry of entries) if (entry.kind === "directory") queue.push(joinPath(folder, entry.name));
  }
  return { reviews, complete: queue.length === 0 };
}

async function readEarlierReview(
  platform: Platform,
  location: ReviewLocation,
  folder: string,
): Promise<EarlierReview | null> {
  const relative = pathInside(location.root, folder);
  if (!relative || !(await modelPathsGone(platform, location.workspaceRoot, relative))) return null;
  try {
    const path = joinPath(folder, "review.json");
    const review = parseReview(await platform.readText(path), path);
    const model =
      location.workspaceRoot === null ? normalizePath(review.asset.path) : joinPath(location.workspaceRoot, relative);
    const expected = reviewLocationIn(platform.appDataDir, location.workspaceRoot, model);
    if (expected?.folder !== folder || !(await volumeThere(platform, expected, model))) return null;
    return { model, location: expected, review };
  } catch {
    return null;
  }
}

/**
 * Whether `model`, whose review is at `location`, is gone: each path its review folder stands for is definitely not
 * found, and outside a repository the drive, network share or mounted volume of `model` is there, so a review never
 * leaves a model on an ejected drive. Any other error means the model may exist.
 */
export async function reviewedModelGone(platform: Platform, location: ReviewLocation, model: string): Promise<boolean> {
  const relative = pathInside(location.root, location.folder);
  return (
    !!relative &&
    (await volumeThere(platform, location, model)) &&
    (await modelPathsGone(platform, location.workspaceRoot, relative))
  );
}

async function modelPathsGone(platform: Platform, workspaceRoot: string | null, relative: string): Promise<boolean> {
  try {
    for (const model of modelPathsFor(workspaceRoot, relative)) {
      if ((await platform.stat(model)) !== null) return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** Whether the drive, network share or mounted volume of `model` is there; always true inside a repository. */
export async function volumeThere(platform: Platform, location: ReviewLocation, model: string): Promise<boolean> {
  const volume = location.workspaceRoot === null ? volumeOf(model) : null;
  return volume === null || (await platform.stat(volume).catch(() => null))?.kind === "directory";
}

/**
 * The model paths whose review folder is `relative` under the reviews root. In a repository there is one. In the app
 * data folder the root marks were dropped, so "C/Art/Hero.fbx" may come from "/C/Art/Hero.fbx" or "C:/Art/Hero.fbx",
 * and "server/share/Hero.fbx" from "/server/share/Hero.fbx" or the network share "//server/share/Hero.fbx". A single
 * letter is taken for a drive, never a server, so no path makes the system look for a server named "C".
 */
function modelPathsFor(workspaceRoot: string | null, relative: string): string[] {
  if (workspaceRoot !== null) return [joinPath(workspaceRoot, relative)];
  const [first = "", ...rest] = relative.split("/");
  const paths = [`/${relative}`];
  const drive = /^[A-Za-z]$/.test(first);
  if (drive && rest.length > 0) paths.push(`${first.toUpperCase()}:/${rest.join("/")}`);
  if (!drive && rest.length > 1) paths.push(`//${relative}`);
  return paths;
}

/** The drive, network share or mounted volume an absolute path is on, or null for the system's own root. */
function volumeOf(path: string): string | null {
  return (
    /^\/\/[^/]+\/[^/]+/.exec(path)?.[0] ??
    /^[A-Z]:\//.exec(path)?.[0] ??
    /^\/Volumes\/[^/]+(?=\/)/.exec(path)?.[0] ??
    null
  );
}

/**
 * Rules 1 and 2: the earlier reviews with a version of the same size and full hash as the file, or with the file's
 * Unity GUID. The file is hashed only when a size matches.
 */
export async function matchByIdentity(
  earlier: readonly EarlierReview[],
  file: FileIdentity,
): Promise<{ earlier: EarlierReview; match: RelinkMatch }[]> {
  const matches: { earlier: EarlierReview; match: RelinkMatch }[] = [];
  for (const entry of earlier) {
    const match = await matchIdentity(file, entry.review.versions, entry.review.asset.guid);
    if (match !== null) matches.push({ earlier: entry, match });
  }
  return matches;
}

/** Rule 3: the earlier reviews whose latest version has the same meshes as the model's version; see `STRUCTURE_MATCH_SHARE`. */
export function matchByStructure(
  earlier: readonly EarlierReview[],
  meshes: readonly MeshTopology[],
): { earlier: EarlierReview; match: RelinkMatch }[] {
  return earlier.flatMap((entry) =>
    sameStructure(entry.review.versions.at(-1), meshes) ? [{ earlier: entry, match: "structure" as const }] : [],
  );
}

export function sameStructure(version: AssetVersion | undefined, meshes: readonly MeshTopology[]): boolean {
  const own = (list: readonly MeshTopology[]) => list.filter((entry) => splitMemberPath(entry.mesh).file === null);
  const current = own(meshes);
  const before = new Map(own(version?.meshes ?? []).map((entry) => [entry.mesh, entry.topology]));
  if (current.length === 0 || current.length !== before.size) return false;
  let kept = 0;
  for (const { mesh, topology } of current) {
    const earlier = before.get(mesh);
    if (!earlier) return false;
    if (earlier.hash === topology.hash || earlier.sourceVertexCount === topology.sourceVertexCount) kept++;
  }
  return kept > current.length * STRUCTURE_MATCH_SHARE;
}

const MATCH_ORDER: readonly RelinkMatch[] = ["content", "guid", "structure"];

/** The matches as candidates, best first: by how they match, then the review used last, then the most comments. */
export function rankCandidates(matches: readonly { earlier: EarlierReview; match: RelinkMatch }[]): ReviewCandidate[] {
  return matches
    .map(({ earlier, match }) => ({
      path: earlier.model,
      comments: earlier.review.comments.length,
      lastLoadedAt: lastLoadedAt(earlier.review),
      match,
    }))
    .sort(
      (a, b) =>
        MATCH_ORDER.indexOf(a.match) - MATCH_ORDER.indexOf(b.match) ||
        (b.lastLoadedAt ?? "").localeCompare(a.lastLoadedAt ?? "") ||
        b.comments - a.comments,
    );
}

function lastLoadedAt(review: ReviewFile): string | null {
  let latest: string | null = null;
  for (const version of review.versions) if (latest === null || version.loadedAt > latest) latest = version.loadedAt;
  return latest;
}
