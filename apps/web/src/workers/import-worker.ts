import { blendImporter } from "@arcue/import-blend";
import { fbxImporter } from "@arcue/import-fbx";
import { portEndpoint, serveImportWorker } from "@arcue/protocol";

self.addEventListener(
  "message",
  (event: MessageEvent<MessagePort>) => serveImportWorker(portEndpoint(event.data), [fbxImporter, blendImporter]),
  { once: true },
);
