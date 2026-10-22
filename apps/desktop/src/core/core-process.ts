import { fileURLToPath } from "node:url";
import { toCoreSchema } from "../shared/core-messages";
import { CoreService } from "./core-service";

const parentPort = process.parentPort;

const service = new CoreService({
  importWorkerEntry: fileURLToPath(new URL("./import-worker.js", import.meta.url)),
  post: (message) => parentPort.postMessage(message),
  exit: (code) => process.exit(code),
});

process.on("uncaughtException", (error) => {
  service.log.error("The core crashed", error);
  process.exit(1);
});
process.on("unhandledRejection", (error) => service.log.error("Unhandled rejection in the core", error));

parentPort.on("message", (event) => {
  const parsed = toCoreSchema.safeParse(event.data);
  if (!parsed.success) {
    service.log.error("Ignored an invalid message from the main process", parsed.error);
    return;
  }
  void service.handle(parsed.data, event.ports);
});
