import type { MessageEndpoint, Peer } from "@arcue/protocol";
import { serveImportWorker } from "@arcue/protocol";
import { fbxImporter } from "./importer";

/**
 * The import worker's entry: answers "import.run" for FBX files over `endpoint`. In a browser worker, pass
 * `portEndpoint(self)`. In Node, a worker_threads Worker is an EventEmitter whose "message" listener receives the
 * value itself rather than an event with `data`, so the host sends the worker one port of a MessageChannel, and both
 * sides wrap their port with `portEndpoint`.
 */
export function startFbxImportWorker(endpoint: MessageEndpoint): Peer {
  return serveImportWorker(endpoint, [fbxImporter]);
}
