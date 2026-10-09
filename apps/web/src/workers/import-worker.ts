import { startFbxImportWorker } from "@arcue/import-fbx";
import { portEndpoint } from "@arcue/protocol";

self.addEventListener("message", (event: MessageEvent<MessagePort>) => startFbxImportWorker(portEndpoint(event.data)), {
  once: true,
});
