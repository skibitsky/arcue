import { startFbxImportWorker } from "@arcue/import-fbx";
import { portEndpoint } from "@arcue/protocol";

startFbxImportWorker(portEndpoint(self));
