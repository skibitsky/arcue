import { fileURLToPath } from "node:url";
import { ArcueCore } from "@arcue/core";
import { fromNativePath, NodePlatform, startNodeImportWorker, systemClock } from "@arcue/platform-node";
import { ArcueError, emitterEndpoint } from "@arcue/protocol";
import type { MessagePortMain } from "electron";
import type { FromCore, ToCore } from "../shared/core-messages";
import { toCoreSchema } from "../shared/core-messages";
import type { Log } from "../shared/log";
import { fileLog } from "../shared/log";
import type { BridgeServer } from "./bridge-server";
import { startBridgeServer } from "./bridge-server";
import { WindowPresence } from "./window-presence";

const CLIPBOARD_TIMEOUT_MS = 5000;

const parentPort = process.parentPort;
const importWorkerEntry = fileURLToPath(new URL("./import-worker.js", import.meta.url));

let log: Log = { info: () => undefined, error: (message, error) => console.error(message, error) };
let core: ArcueCore | null = null;
let bridge: BridgeServer | null = null;
let starting = false;
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
    started.client.subscribe("asset.updated", ({ asset }) => {
      if (asset.status === "failed")
        log.error(`${asset.path} could not be opened: ${asset.error ?? "no reason given"}`);
    });
    core = started;
    for (const { connection, port } of waitingPorts.splice(0)) connectWindow(started, connection, port);
    bridge = await startBridgeServer({ core: started, userData, ensureWindow: () => windows.ensure(), onError }).catch(
      (error: unknown) => {
        log.error("The bridge for the command line could not start; windows work without it", error);
        return null;
      },
    );
    if (bridge) log.info(`The bridge listens on ${bridge.info.socket}`);
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

async function stop(): Promise<void> {
  log.info("The core stops");
  try {
    await core?.idle();
    await bridge?.close();
    core?.dispose();
  } catch (error) {
    log.error("The core did not stop cleanly", error);
  }
  process.exit(0);
}
