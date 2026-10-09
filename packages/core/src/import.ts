import type { ImportRunInput } from "@arcue/protocol";
import {
  ArcueError,
  createPeer,
  importFindFileInputSchema,
  importReadFileInputSchema,
  importRequests,
} from "@arcue/protocol";
import type { SceneDescription } from "@arcue/scene";
import { createFileSearch, isReadableImage } from "./file-search";
import { insideWithoutLinks } from "./links";
import { basename, dirname, joinPath, pathInside } from "./paths";
import type { Platform } from "./platform";

/**
 * Reads a file an asset references, answering an import worker's "import.readFile". The path is relative to the
 * asset's folder and may leave it, as Unity's "../Textures/" layout does, but it must stay inside `readRoot` and name
 * an image file. An absolute or drive path, a path that leaves the root, a path through a symbolic link, another kind
 * of file and a missing file all get null. `readRoot` is the workspace root, or the asset's folder when the asset is outside a git repository.
 */
export async function readReferencedFile(
  platform: Platform,
  assetPath: string,
  relativePath: string,
  readRoot: string = dirname(assetPath),
): Promise<Uint8Array | null> {
  const slashed = relativePath.replaceAll("\\", "/");
  if (slashed === "" || slashed.startsWith("/") || /^[A-Za-z]:/.test(slashed)) return null;
  const resolved = joinPath(dirname(assetPath), slashed);
  if (!pathInside(readRoot, resolved)) return null;
  if (!isReadableImage(basename(resolved))) return null;
  if (!(await insideWithoutLinks(platform, readRoot, resolved))) return null;
  const stat = await platform.stat(resolved);
  return stat?.kind === "file" ? platform.readFile(resolved) : null;
}

export interface ImportAssetOptions {
  /** Gives up with a "timeout" error when the worker has not finished within this many milliseconds. */
  timeoutMs?: number;
  /**
   * The folder the worker may read images from. Defaults to the git repository that contains the asset, or the
   * asset's folder when there is none.
   */
  readRoot?: string;
}

/**
 * Parses an asset's bytes in a fresh import worker. The caller reads the file once and passes the bytes, so the
 * version it hashes is the version that gets parsed. The bytes' buffer may move to the worker. The worker reaches
 * other files only through `readReferencedFile` and a `createFileSearch` that lives as long as the import.
 */
export async function importAsset(
  platform: Platform,
  assetPath: string,
  bytes: Uint8Array,
  options: ImportAssetOptions = {},
): Promise<SceneDescription> {
  const readRoot = options.readRoot ?? (await platform.findWorkspaceRoot(assetPath)) ?? dirname(assetPath);
  const search = createFileSearch(platform, assetPath, readRoot);
  const worker = platform.startImportWorker();
  const peer = createPeer(worker.endpoint, {
    requestTimeout:
      options.timeoutMs === undefined
        ? undefined
        : { ms: options.timeoutMs, setTimer: (delay, callback) => platform.clock.setTimer(delay, callback) },
    handleRequest: ({ name, input }) => {
      if (name === importRequests.readFile) {
        const { relativePath } = importReadFileInputSchema.parse(input);
        return readReferencedFile(platform, assetPath, relativePath, readRoot);
      }
      if (name === importRequests.findFile) return search.find(importFindFileInputSchema.parse(input).storedPath);
      throw new ArcueError("unknown-command", `The core has no "${name}".`);
    },
  });
  try {
    const input: ImportRunInput = { fileName: basename(assetPath), bytes };
    const ownsBuffer = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength;
    return (await peer.request(
      "command",
      importRequests.run,
      input,
      ownsBuffer ? [bytes.buffer] : [],
    )) as SceneDescription;
  } finally {
    peer.close();
    worker.terminate();
  }
}
