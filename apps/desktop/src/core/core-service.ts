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
import type { Log } from "../shared/log";
import { fileLog } from "../shared/log";

const CLIPBOARD_TIMEOUT_MS = 5000;

export interface CoreServiceOptions {
  /** The bundled import worker entry. */
  importWorkerEntry: string;
  post(message: FromCore): void;
  exit(code: number): void;
}

/** The desktop app's core as its utility process runs it, started, given windows and stopped by the main process. */
export class CoreService {
  readonly #options: CoreServiceOptions;
  readonly #windows: WindowPresence;
  readonly #waitingPorts: { connection: string; port: MessagePortMain }[] = [];
  readonly #clipboardRequests = new Map<number, (ok: boolean) => void>();
  #log: Log = { info: () => undefined, error: (message, error) => console.error(message, error) };
  #core: ArcueCore | null = null;
  #servedFrom: string | null = null;
  #bridge: BridgeServer | null = null;
  #starting = false;
  #stopping = false;
  #nextClipboardRequest = 1;
  readonly #onError = (error: unknown) => this.#log.error("Background work failed", error);

  constructor(options: CoreServiceOptions) {
    this.#options = options;
    this.#windows = new WindowPresence({
      requestWindow: () => options.post({ type: "need-window" }),
      setTimer: systemClock.setTimer,
    });
  }

  /** The core's log, which writes to its file once the main process has started the core. */
  get log(): Log {
    return this.#log;
  }

  /** Handles a message from the main process, resolving once a start or stop has finished. */
  handle(message: ToCore, ports: readonly MessagePortMain[]): Promise<void> {
    switch (message.type) {
      case "start":
        return this.#start(message.userData, message.logFile);
      case "connect": {
        const [port] = ports;
        if (!port) this.#log.error(`The window connection ${message.connection} arrived without a port`);
        else if (this.#core) this.#connectWindow(this.#core, message.connection, port);
        else this.#waitingPorts.push({ connection: message.connection, port });
        return Promise.resolve();
      }
      case "clipboard-done":
        this.#clipboardRequests.get(message.id)?.(message.ok);
        this.#clipboardRequests.delete(message.id);
        return Promise.resolve();
      case "stop":
        return this.#stop();
    }
  }

  async #start(userData: string, logFile: string): Promise<void> {
    if (this.#starting) return;
    this.#starting = true;
    this.#log = fileLog(logFile);
    this.#log.info(`The core starts (pid ${process.pid})`);
    try {
      const platform = new NodePlatform({
        appDataDir: fromNativePath(userData),
        startImportWorker: () => startNodeImportWorker(this.#options.importWorkerEntry, this.#onError),
        writeClipboard: (text) => this.#writeClipboard(text),
      });
      const started = await ArcueCore.start({ platform, onError: this.#onError });
      try {
        this.#bridge = await startBridgeServer({
          core: started,
          userData,
          kind: "desktop",
          ensureWindow: (view) => this.#windows.ensure(view),
          onError: this.#onError,
        });
        this.#log.info(`The bridge listens on ${this.#bridge.info.socket}`);
      } catch (error) {
        if (error instanceof CoreRunningError) {
          started.dispose();
          this.#log.info(`${error.message} This core stops.`);
          this.#options.post({
            type: "already-running",
            pid: error.running.pid,
            url: error.running.url ?? null,
            reason: error.reason,
            older: error.running.kind === undefined,
          });
          return;
        }
        this.#log.error("The bridge for the command line could not start; windows work without it", error);
      }
      started.client.subscribe("asset.updated", ({ asset }) => {
        if (asset.status === "failed")
          this.#log.error(`${asset.path} could not be opened: ${asset.error ?? "no reason given"}`);
      });
      this.#core = started;
      this.#servedFrom = userData;
      for (const { connection, port } of this.#waitingPorts.splice(0)) this.#connectWindow(started, connection, port);
      this.#options.post({ type: "started", socket: this.#bridge?.info.socket ?? null });
    } catch (error) {
      this.#log.error("The core could not start", error);
      this.#options.post({ type: "failed", message: error instanceof Error ? error.message : String(error) });
      this.#options.exit(1);
    }
  }

  #connectWindow(started: ArcueCore, connection: string, port: MessagePortMain): void {
    const peer = started.connect(emitterEndpoint(port), {
      connection,
      caller: "window",
      onListenerError: this.#onError,
    });
    this.#windows.added();
    peer.onClose(() => {
      this.#windows.removed();
      port.close();
    });
  }

  /** The utility process has no clipboard, so the main process writes it. */
  #writeClipboard(text: string): Promise<void> {
    const id = this.#nextClipboardRequest++;
    return new Promise((resolve, reject) => {
      const cancel = systemClock.setTimer(CLIPBOARD_TIMEOUT_MS, () => {
        this.#clipboardRequests.delete(id);
        reject(new ArcueError("unavailable", "The main process did not write the clipboard in time."));
      });
      this.#clipboardRequests.set(id, (ok) => {
        cancel();
        if (ok) resolve();
        else reject(new ArcueError("unavailable", "The main process could not write the clipboard."));
      });
      this.#options.post({ type: "clipboard", id, text });
    });
  }

  /**
   * Lets no command line in, closes every asset once its changes in flight are saved, and exits. A core that served
   * windows records that the desktop app ran last; one that never started leaves last-core.json alone.
   */
  async #stop(): Promise<void> {
    if (this.#stopping) return;
    this.#stopping = true;
    this.#log.info("The core stops");
    await this.#stopStep("close the bridge", () => this.#bridge?.close());
    await this.#stopStep("save the changes in flight", () => this.#core?.shutdown());
    await this.#stopStep("cancel the opens waiting for a window", () => this.#windows.dispose());
    const folder = this.#servedFrom;
    if (folder) await this.#stopStep("record that the app ran last", () => recordLastCore(folder, "desktop"));
    this.#options.exit(0);
  }

  /** Runs one step of a stop, logging a failure so that the next step still runs. */
  async #stopStep(step: string, run: () => unknown): Promise<void> {
    try {
      await run();
    } catch (error) {
      this.#log.error(`The core could not ${step} as it stopped`, error);
    }
  }
}
