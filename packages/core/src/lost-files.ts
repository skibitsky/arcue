import type { CompositionFile, ReviewFile, VersionFile } from "@arcue/protocol";
import { withRewrittenPaths, writtenPaths } from "./composition-file";
import type { AssetFiles } from "./composition-load";
import { MEMBER_NOT_FOUND } from "./composition-load";
import { findFilesByExtension } from "./file-search";
import { filesMatching } from "./identity";
import { basename, dirname, joinPath, relativePath } from "./paths";
import type { Platform } from "./platform";
import { relabelId } from "./review-move";

/** A member file or override texture that is not where the composition says, with what a version recorded of it. */
export interface LostFile {
  path: string;
  identity: VersionFile;
}

/**
 * The composition's member files and override textures that are gone, each with the identity the newest version that
 * read it recorded: its hash and size, or its Unity GUID. Files no version identified are left out.
 */
export function lostFiles(files: AssetFiles, review: ReviewFile): LostFile[] {
  const gone = [
    ...[...files.members.values()].filter((file) => file.problem === MEMBER_NOT_FOUND),
    ...files.textures.filter((texture) => texture.bytes === null),
  ];
  const lost = new Map<string, LostFile>();
  for (const file of gone) {
    const identity = recorded(review, file.label);
    if (identity && !lost.has(file.path)) lost.set(file.path, { path: file.path, identity });
  }
  return [...lost.values()];
}

function recorded(review: ReviewFile, label: string): VersionFile | undefined {
  for (const version of [...review.versions].reverse()) {
    const file = version.files?.find((entry) => entry.file === label);
    if (file && (file.hash !== undefined || file.guid !== undefined)) return file;
  }
  return undefined;
}

/**
 * Where each lost file went: the one file with its extension, in its own folder, the model's folder or a folder below
 * either, that has its size and full hash or its Unity GUID. The search is the file search's, bounded and link-free
 * inside `readRoot`; it compares sizes first and hashes only files of the same size. A file with no match or several
 * stays lost, and paths in `taken`, which the model and its composition already use, never match.
 */
export async function findLostFiles(
  platform: Platform,
  modelPath: string,
  readRoot: string,
  lost: readonly LostFile[],
  taken: ReadonlySet<string>,
): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  for (const file of lost) {
    const name = basename(file.path);
    const dot = name.lastIndexOf(".");
    if (dot <= 0) continue;
    const extension = name.slice(dot).toLowerCase();
    const candidates = await findFilesByExtension(
      platform,
      readRoot,
      [dirname(file.path), dirname(modelPath)],
      [extension],
    );
    const matches = await filesMatching(
      platform,
      candidates.filter((candidate) => !taken.has(candidate)),
      [file.identity],
      file.identity.guid,
    );
    const [only] = matches;
    if (only !== undefined && matches.length === 1) found.set(file.path, only);
  }
  return found;
}

/**
 * The composition with each file in `moved`, by absolute path, written at its new path relative to the model's
 * folder, and the old and new labels of those files, for the ids that name them.
 */
export function withMovedFiles(
  composition: CompositionFile,
  modelFolder: string,
  moved: ReadonlyMap<string, string>,
): { composition: CompositionFile; labels: Map<string, string> } {
  const labels = new Map<string, string>();
  const rewritten = new Map<string, string>();
  for (const written of writtenPaths(composition)) {
    const target = moved.get(joinPath(modelFolder, written));
    const label = relativePath(modelFolder, joinPath(modelFolder, written));
    const next = target === undefined ? null : relativePath(modelFolder, target);
    if (next === null || label === null) continue;
    rewritten.set(written, next);
    labels.set(label, next);
  }
  const next = withRewrittenPaths(
    composition,
    (written) => rewritten.get(written) ?? written,
    (id) => relabelId(id, labels),
  );
  return { composition: next, labels };
}
