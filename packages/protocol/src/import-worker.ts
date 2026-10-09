import type { FoundFile, Importer, SceneDescription } from "@arcue/scene";
import { collectTransferables, findImporter } from "@arcue/scene";
import { z } from "zod";
import { bytesSchema } from "./assets";
import { ArcueError } from "./errors";
import type { MessageEndpoint } from "./transport/endpoint";
import type { Peer } from "./transport/peer";
import { createPeer, withTransfer } from "./transport/peer";

/**
 * Requests on the private channel between the core and an import worker; they are not core commands.
 * The core sends "import.run". While it runs, the worker may send "import.readFile" and "import.findFile" back to
 * the core for files the asset references, such as external textures. All are sent as kind "command".
 */
export const importRequests = {
  run: "import.run",
  readFile: "import.readFile",
  findFile: "import.findFile",
} as const;

const importRunInputSchema = z.object({ fileName: z.string().min(1), bytes: bytesSchema });

export type ImportRunInput = z.output<typeof importRunInputSchema>;

/** The worker transfers the scene's buffers to the core. */
export type ImportRunOutput = SceneDescription;

export const importReadFileInputSchema = z.object({
  /**
   * Relative to the asset's folder; it may leave the folder, as "../Textures/" does. The core answers null for absolute
   * and drive paths, paths outside the workspace root (the git repository, or the asset's folder outside one), files
   * that are not images, and paths through a symbolic link.
   */
  relativePath: z.string(),
});

export type ImportReadFileInput = z.output<typeof importReadFileInputSchema>;

/** Null when the file does not exist or may not be read. */
export type ImportReadFileOutput = Uint8Array | null;

export const importFindFileInputSchema = z.object({
  /** The path as the asset stores it. The core searches only inside the workspace root and reads only images. */
  storedPath: z.string(),
});

export type ImportFindFileInput = z.output<typeof importFindFileInputSchema>;

/** Null when no image was found. */
export type ImportFindFileOutput = FoundFile | null;

/** The import worker's side of the channel: runs the importer that matches the file name. */
export function serveImportWorker(endpoint: MessageEndpoint, importers: readonly Importer[]): Peer {
  const peer: Peer = createPeer(endpoint, {
    handleRequest: async ({ name, input }) => {
      if (name !== importRequests.run) throw new ArcueError("unknown-command", `The import worker has no "${name}".`);
      const { fileName, bytes } = importRunInputSchema.parse(input);
      const importer = findImporter(importers, fileName);
      if (!importer) throw new ArcueError("invalid-input", `No importer reads ${fileName}.`);
      const readFile = async (relativePath: string) => {
        const request: ImportReadFileInput = { relativePath };
        return (await peer.request("command", importRequests.readFile, request)) as ImportReadFileOutput;
      };
      const scene = await importer.import({ fileName, bytes, readFile });
      return withTransfer(scene, collectTransferables(scene));
    },
  });
  return peer;
}
