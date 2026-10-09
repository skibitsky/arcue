import { portEndpoint } from "@arcue/protocol";
import { startFbxImportWorker } from "../../src/index.ts";

startFbxImportWorker(portEndpoint(self));
