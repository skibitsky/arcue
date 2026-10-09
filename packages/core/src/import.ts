import type { ImportRunInput } from "@arcue/protocol";
import { ArcueError, createPeer, importReadFileInputSchema, importRequests } from "@arcue/protocol";
import type { SceneDescription } from "@arcue/scene";
import { insideWithoutLinks } from "./links";
import { basename, dirname, joinPath, pathInside } from "./paths";
import type { Platform } from "./platform";

/** Extensions of the files an import worker may read, such as external textures. */
export const readableImageExtensions: readonly string[] = [
  ".png",
  ".jpg",
  ".jpeg",
  ".tga",
  ".tif",
  ".tiff",
  ".bmp",
  ".dds",
  ".exr",
  ".hdr",
  ".webp",
];

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
  const name = basename(resolved).toLowerCase();
  if (!readableImageExtensions.some((extension) => name.endsWith(extension))) return null;
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
 * other files only through `readReferencedFile`.
 */
export async function importAsset(
  platform: Platform,
  assetPath: string,
  bytes: Uint8Array,
  options: ImportAssetOptions = {},
): Promise<SceneDescription> {
  const readRoot = options.readRoot ?? (await platform.findWorkspaceRoot(assetPath)) ?? dirname(assetPath);
  const worker = platform.startImportWorker();
  const peer = createPeer(worker.endpoint, {
    requestTimeout:
      options.timeoutMs === undefined
        ? undefined
        : { ms: options.timeoutMs, setTimer: (delay, callback) => platform.clock.setTimer(delay, callback) },
    handleRequest: ({ name, input }) => {
      if (name !== importRequests.readFile) throw new ArcueError("unknown-command", `The core has no "${name}".`);
      const { relativePath } = importReadFileInputSchema.parse(input);
      return readReferencedFile(platform, assetPath, relativePath, readRoot);
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
