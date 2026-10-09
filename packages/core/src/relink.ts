import type { AssetVersion, MeshTopology, RelinkMatch, ReviewCandidate, ReviewFile } from "@arcue/protocol";
import { splitMemberPath } from "@arcue/scene";
import { contentHash } from "./hash";
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

/** What identifies a file: its size, its full hash, read only when needed, and the GUID in its Unity `.meta` file. */
export interface FileIdentity {
  size: number;
  hash: () => Promise<string>;
  guid: string | null;
}

/** A file's identity, reading and hashing it only when a size matches. */
export function fileIdentity(platform: Platform, path: string, size: number, guid: string | null): FileIdentity {
  let hash: Promise<string> | null = null;
  return {
    size,
    guid,
    hash: () => {
      hash ??= platform.readFile(path).then(contentHash);
      return hash;
    },
  };
}

/**
 * The reviews under the location's reviews root whose model file is gone. A review whose model still exists belongs to
 * that model, as with a copy, and is never listed. It lists at most `MAX_SCANNED_FOLDERS` folders breadth first, reads
 * at most `MAX_EARLIER_REVIEWS` reviews, never follows links, and skips the folders in `skip`, such as the reviews of
 * open assets, and files it cannot read.
 */
export async function findEarlierReviews(
  platform: Platform,
  location: ReviewLocation,
  skip: ReadonlySet<string>,
): Promise<EarlierReview[]> {
  const { root, workspaceRoot } = location;
  if (workspaceRoot !== null && !(await insideWithoutLinks(platform, workspaceRoot, root))) return [];
  const found: EarlierReview[] = [];
  const queue = [root];
  for (let listed = 0; listed < MAX_SCANNED_FOLDERS && found.length < MAX_EARLIER_REVIEWS; listed++) {
    const folder = queue.shift();
    if (folder === undefined) break;
    const entries = await platform.list(folder).catch(() => []);
    if (entries.some((entry) => entry.name === "review.json" && entry.kind === "file")) {
      const earlier = skip.has(folder) ? null : await readEarlierReview(platform, location, folder);
      if (earlier) found.push(earlier);
      continue;
    }
    for (const entry of entries) if (entry.kind === "directory") queue.push(joinPath(folder, entry.name));
  }
  return found;
}

async function readEarlierReview(
  platform: Platform,
  location: ReviewLocation,
  folder: string,
): Promise<EarlierReview | null> {
  const relative = pathInside(location.root, folder);
  if (!relative) return null;
  for (const model of modelPathsFor(location.workspaceRoot, relative)) {
    if ((await platform.stat(model).catch(() => null)) !== null) return null;
  }
  try {
    const path = joinPath(folder, "review.json");
    const review = parseReview(await platform.readText(path), path);
    const model =
      location.workspaceRoot === null ? normalizePath(review.asset.path) : joinPath(location.workspaceRoot, relative);
    const expected = reviewLocationIn(platform.appDataDir, location.workspaceRoot, model);
    return expected?.folder === folder ? { model, location: expected, review } : null;
  } catch {
    return null;
  }
}

/**
 * The model paths whose review folder is `relative` under the reviews root. In a repository there is one. In the app
 * data folder the root marks were dropped, so "C/Art/Hero.fbx" may come from "/C/Art/Hero.fbx", "C:/Art/Hero.fbx" or
 * the network share "//C/Art/Hero.fbx".
 */
function modelPathsFor(workspaceRoot: string | null, relative: string): string[] {
  if (workspaceRoot !== null) return [joinPath(workspaceRoot, relative)];
  const [first = "", ...rest] = relative.split("/");
  const paths = [`/${relative}`];
  if (/^[A-Za-z]$/.test(first) && rest.length > 0) paths.push(`${first.toUpperCase()}:/${rest.join("/")}`);
  if (rest.length > 1) paths.push(`//${relative}`);
  return paths;
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
    const sized = entry.review.versions.filter((version) => version.size === file.size && version.hash !== undefined);
    const hash = sized.length > 0 ? await file.hash() : null;
    if (sized.some((version) => version.hash === hash)) matches.push({ earlier: entry, match: "content" });
    else if (file.guid !== null && entry.review.asset.guid === file.guid)
      matches.push({ earlier: entry, match: "guid" });
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
