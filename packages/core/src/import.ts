import type { ImportRunInput } from "@arcue/protocol";
import {
  ArcueError,
  createPeer,
  importFindFileInputSchema,
  importReadFileInputSchema,
  importRequests,
} from "@arcue/protocol";
import type { SceneDescription } from "@arcue/scene";
import { ImportFiles } from "./import-files";
import { basename, dirname } from "./paths";
import type { Platform } from "./platform";

export { readReferencedFile } from "./import-files";

export interface ImportAssetOptions {
  files?: ImportFiles;
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
  const files = options.files ?? new ImportFiles(platform, assetPath, readRoot);
  const worker = platform.startImportWorker();
  const peer = createPeer(worker.endpoint, {
    requestTimeout:
      options.timeoutMs === undefined
        ? undefined
        : { ms: options.timeoutMs, setTimer: (delay, callback) => platform.clock.setTimer(delay, callback) },
    handleRequest: ({ name, input }) => {
      if (name === importRequests.readFile) {
        const { relativePath } = importReadFileInputSchema.parse(input);
        return files.read(relativePath);
      }
      if (name === importRequests.findFile) return files.find(importFindFileInputSchema.parse(input).storedPath);
      if (name === importRequests.locateFile) {
        return files.locate(importFindFileInputSchema.parse(input).storedPath);
      }
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
