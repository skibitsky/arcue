import type { MessagePort } from "node:worker_threads";
import { parentPort } from "node:worker_threads";
import { startFbxImportWorker } from "@arcue/import-fbx";
import { portEndpoint } from "@arcue/protocol";

parentPort?.once("message", (port: MessagePort) => {
  startFbxImportWorker(portEndpoint(port));
});
