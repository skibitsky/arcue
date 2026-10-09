import { parentPort } from "node:worker_threads";
import { portEndpoint } from "@arcue/protocol";
import { startFbxImportWorker } from "../../src/index.ts";

parentPort.once("message", (port) => {
  startFbxImportWorker(portEndpoint(port));
});
