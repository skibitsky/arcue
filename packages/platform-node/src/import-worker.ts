import type { MessagePort } from "node:worker_threads";
import { parentPort } from "node:worker_threads";
import { blendImporter } from "@arcue/import-blend";
import { fbxImporter } from "@arcue/import-fbx";
import { portEndpoint, serveImportWorker } from "@arcue/protocol";

parentPort?.once("message", (port: MessagePort) => {
  serveImportWorker(portEndpoint(port), [fbxImporter, blendImporter]);
});
