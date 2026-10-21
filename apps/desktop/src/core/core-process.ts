import { fileURLToPath } from "node:url";
import { ArcueCore } from "@arcue/core";
import type { BridgeServer } from "@arcue/platform-node";
import {
  CoreRunningError,
  fromNativePath,
  NodePlatform,
  recordLastCore,
  startBridgeServer,
  startNodeImportWorker,
  systemClock,
  WindowPresence,
} from "@arcue/platform-node";
import { ArcueError, emitterEndpoint } from "@arcue/protocol";
import type { MessagePortMain } from "electron";
import type { FromCore, ToCore } from "../shared/core-messages";
import { toCoreSchema } from "../shared/core-messages";
import type { Log } from "../shared/log";
import { fileLog } from "../shared/log";

const CLIPBOARD_TIMEOUT_MS = 5000;

const parentPort = process.parentPort;
const importWorkerEntry = fileURLToPath(new URL("./import-worker.js", import.meta.url));

let log: Log = { info: () => undefined, error: (message, error) => console.error(message, error) };
let core: ArcueCore | null = null;
let servedFrom: string | null = null;
let bridge: BridgeServer | null = null;
let starting = false;
let stopping = false;
const waitingPorts: { connection: string; port: MessagePortMain }[] = [];
const clipboardRequests = new Map<number, (ok: boolean) => void>();
let nextClipboardRequest = 1;

const post = (message: FromCore) => parentPort.postMessage(message);
const onError = (error: unknown) => log.error("Background work failed", error);

const windows = new WindowPresence({
  requestWindow: () => post({ type: "need-window" }),
  setTimer: systemClock.setTimer,
});

process.on("uncaughtException", (error) => {
  log.error("The core crashed", error);
  process.exit(1);
});
process.on("unhandledRejection", (error) => log.error("Unhandled rejection in the core", error));

parentPort.on("message", (event) => {
  const parsed = toCoreSchema.safeParse(event.data);
  if (!parsed.success) {
    log.error("Ignored an invalid message from the main process", parsed.error);
    return;
  }
  handle(parsed.data, event.ports);
});

function handle(message: ToCore, ports: MessagePortMain[]): void {
  switch (message.type) {
    case "start":
      void start(message.userData, message.logFile);
      return;
    case "connect": {
      const [port] = ports;
      if (!port) {
        log.error(`The window connection ${message.connection} arrived without a port`);
        return;
      }
      if (core) connectWindow(core, message.connection, port);
      else waitingPorts.push({ connection: message.connection, port });
      return;
    }
    case "clipboard-done":
      clipboardRequests.get(message.id)?.(message.ok);
      clipboardRequests.delete(message.id);
      return;
    case "stop":
      void stop();
      return;
  }
}

async function start(userData: string, logFile: string): Promise<void> {
  if (starting) return;
  starting = true;
  log = fileLog(logFile);
  log.info(`The core starts (pid ${process.pid})`);
  try {
    const platform = new NodePlatform({
      appDataDir: fromNativePath(userData),
      startImportWorker: () => startNodeImportWorker(importWorkerEntry, onError),
      writeClipboard,
    });
    const started = await ArcueCore.start({ platform, onError });
    try {
      bridge = await startBridgeServer({
        core: started,
        userData,
        kind: "desktop",
        ensureWindow: (view) => windows.ensure(view),
        onError,
      });
      log.info(`The bridge listens on ${bridge.info.socket}`);
    } catch (error) {
      if (error instanceof CoreRunningError) {
        started.dispose();
        log.info(`${error.message} This core stops.`);
        post({
          type: "already-running",
          pid: error.running.pid,
          url: error.running.url ?? null,
          reason: error.reason,
        });
        return;
      }
      log.error("The bridge for the command line could not start; windows work without it", error);
    }
    started.client.subscribe("asset.updated", ({ asset }) => {
      if (asset.status === "failed")
        log.error(`${asset.path} could not be opened: ${asset.error ?? "no reason given"}`);
    });
    core = started;
    servedFrom = userData;
    for (const { connection, port } of waitingPorts.splice(0)) connectWindow(started, connection, port);
    post({ type: "started", socket: bridge?.info.socket ?? null });
  } catch (error) {
    log.error("The core could not start", error);
    post({ type: "failed", message: error instanceof Error ? error.message : String(error) });
    process.exit(1);
  }
}

function connectWindow(started: ArcueCore, connection: string, port: MessagePortMain): void {
  const peer = started.connect(emitterEndpoint(port), { connection, caller: "window", onListenerError: onError });
  windows.added();
  peer.onClose(() => {
    windows.removed();
    port.close();
  });
}

/** The utility process has no clipboard, so the main process writes it. */
function writeClipboard(text: string): Promise<void> {
  const id = nextClipboardRequest++;
  return new Promise((resolve, reject) => {
    const cancel = systemClock.setTimer(CLIPBOARD_TIMEOUT_MS, () => {
      clipboardRequests.delete(id);
      reject(new ArcueError("unavailable", "The main process did not write the clipboard in time."));
    });
    clipboardRequests.set(id, (ok) => {
      cancel();
      if (ok) resolve();
      else reject(new ArcueError("unavailable", "The main process could not write the clipboard."));
    });
    post({ type: "clipboard", id, text });
  });
}

/**
 * Lets no command line in, closes every asset once its changes in flight are saved, and exits. A core that served
 * windows records that the desktop app ran last; one that never started leaves last-core.json alone.
 */
async function stop(): Promise<void> {
  if (stopping) return;
  stopping = true;
  log.info("The core stops");
  await stopStep("close the bridge", () => bridge?.close());
  await stopStep("save the changes in flight", () => core?.shutdown());
  await stopStep("cancel the opens waiting for a window", () => windows.dispose());
  const folder = servedFrom;
  if (folder) await stopStep("record that the app ran last", () => recordLastCore(folder, "desktop"));
  process.exit(0);
}

/** Runs one step of a stop, logging a failure so that the next step still runs. */
async function stopStep(step: string, run: () => unknown): Promise<void> {
  try {
    await run();
  } catch (error) {
    log.error(`The core could not ${step} as it stopped`, error);
  }
}
