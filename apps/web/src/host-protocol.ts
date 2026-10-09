/** Requests the page sends to the core worker over the worker itself, outside the core's command protocol. */
export const hostRequests = {
  /** Connects a window to the core over the given port. Input: `ConnectWindowInput`. */
  connectWindow: "host.connectWindow",
  /** Writes files into the core's in-memory platform. Input: `SeedFilesInput`. */
  seedFiles: "host.seedFiles",
} as const;

/** Events the page sends the core worker. */
export const pageEvents = {
  /** The import worker with this id could not start, so its import fails now. Payload: `ImportWorkerFailed`. */
  importWorkerFailed: "host.importWorkerFailed",
} as const;

/**
 * Events the core worker sends the page. The page starts each import worker, because some embedded browsers cannot
 * start a worker from inside a worker.
 */
export const hostEvents = {
  /** Start an import worker and hand it the port. Payload: `StartImportWorker`. */
  startImportWorker: "host.startImportWorker",
  /** Terminate the import worker with this id. Payload: `StopImportWorker`. */
  stopImportWorker: "host.stopImportWorker",
} as const;

export interface ConnectWindowInput {
  port: MessagePort;
}

export interface SeedFile {
  /** Absolute virtual path, such as "/samples/pebble-golem.fbx". */
  path: string;
  bytes: Uint8Array;
}

export interface SeedFilesInput {
  files: SeedFile[];
}

export interface StartImportWorker {
  id: number;
  port: MessagePort;
}

export interface StopImportWorker {
  id: number;
}

export interface ImportWorkerFailed {
  id: number;
}
