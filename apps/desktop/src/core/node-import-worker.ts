import { MessageChannel, Worker } from "node:worker_threads";
import type { ImportWorker } from "@arcue/core";
import type { ListenerErrorHandler } from "@arcue/protocol";
import { portEndpoint } from "@arcue/protocol";

/**
 * Starts the bundled import worker in a worker_threads Worker. A Node Worker is not a port, so the worker gets one
 * port of a MessageChannel and the core keeps the other.
 */
export function startNodeImportWorker(entry: string, onError: ListenerErrorHandler): ImportWorker {
  const worker = new Worker(entry, { name: "arcue-import" });
  const channel = new MessageChannel();
  worker.on("error", onError);
  worker.postMessage(channel.port2, [channel.port2]);
  return {
    endpoint: portEndpoint(channel.port1),
    terminate() {
      channel.port1.close();
      void worker.terminate();
    },
  };
}
