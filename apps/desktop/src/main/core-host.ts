import type { MessagePortMain, UtilityProcess } from "electron";
import { clipboard, MessageChannelMain, utilityProcess } from "electron";
import type { FromCore, ToCore } from "../shared/core-messages";
import { fromCoreSchema } from "../shared/core-messages";
import type { Log } from "../shared/log";
import type { RunningCore } from "./already-running";

export interface CoreHostOptions {
  /** The bundled utility process entry. */
  entry: string;
  userData: string;
  logFile: string;
  log: Log;
  /** The command line opened an asset while no window was connected. */
  onNeedWindow(): void;
  /** The core stopped unexpectedly. Windows show "reconnecting" and ask for a new port. */
  onLost(): void;
  /** A core that this one cannot run beside answers for the data folder, so this one stopped for good. */
  onAlreadyRunning(running: RunningCore): void;
}

interface PortRequest {
  connection: string;
  deliver(port: MessagePortMain): void;
}

const STOP_TIMEOUT_MS = 20_000;
const MAX_RESTART_DELAY_MS = 10_000;
const CRASH_WINDOW_MS = 60_000;

/**
 * Runs the core in an Electron utility process and restarts it when it crashes. Each window gets its own channel to
 * the core: the main process creates a MessageChannelMain pair and hands one port to each side.
 */
export class CoreHost {
  readonly #options: CoreHostOptions;
  #child: UtilityProcess | null = null;
  #ready = false;
  #stopping = false;
  #queue: PortRequest[] = [];
  #crashes: number[] = [];
  #restartTimer: NodeJS.Timeout | null = null;

  constructor(options: CoreHostOptions) {
    this.#options = options;
  }

  get ready(): boolean {
    return this.#ready;
  }

  start(): void {
    if (this.#child || this.#stopping) return;
    const { log } = this.#options;
    const child = utilityProcess.fork(this.#options.entry, [], { serviceName: "Arcue Core", stdio: "inherit" });
    this.#child = child;
    child.on("message", (message: unknown) => this.#onMessage(child, message));
    child.on("exit", (code) => this.#onExit(child, code));
    this.#post(child, { type: "start", userData: this.#options.userData, logFile: this.#options.logFile });
    log.info(`Started the core process (pid ${child.pid ?? "unknown"})`);
  }

  /** Delivers a port to the core under a connection name, now or as soon as the core is running. */
  requestPort(connection: string, deliver: (port: MessagePortMain) => void): void {
    this.#queue = this.#queue.filter((request) => request.connection !== connection);
    this.#queue.push({ connection, deliver });
    this.#flush();
  }

  /**
   * Asks the core to finish its writes and exit, then kills it if it has not exited after 20 seconds, longer than a
   * save waits for a lock another Arcue holds.
   */
  async stop(): Promise<void> {
    this.#stopping = true;
    if (this.#restartTimer) clearTimeout(this.#restartTimer);
    const child = this.#child;
    if (!child) return;
    const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
    this.#post(child, { type: "stop" });
    const timer = setTimeout(() => child.kill(), STOP_TIMEOUT_MS);
    await exited;
    clearTimeout(timer);
  }

  #flush(): void {
    const child = this.#child;
    if (!child || !this.#ready) return;
    for (const { connection, deliver } of this.#queue.splice(0)) {
      const { port1, port2 } = new MessageChannelMain();
      child.postMessage({ type: "connect", connection } satisfies ToCore, [port2]);
      deliver(port1);
    }
  }

  #post(child: UtilityProcess, message: ToCore): void {
    child.postMessage(message);
  }

  #onMessage(child: UtilityProcess, raw: unknown): void {
    const parsed = fromCoreSchema.safeParse(raw);
    if (!parsed.success) {
      this.#options.log.error("Ignored an invalid message from the core", parsed.error);
      return;
    }
    const message: FromCore = parsed.data;
    switch (message.type) {
      case "started":
        this.#ready = true;
        this.#options.log.info(
          message.socket
            ? `The core is ready; the bridge listens on ${message.socket}`
            : "The core is ready without a bridge",
        );
        this.#flush();
        return;
      case "failed":
        this.#options.log.error(`The core could not start: ${message.message}`);
        return;
      case "already-running":
        void this.stop();
        this.#options.onAlreadyRunning({
          info: { pid: message.pid, url: message.url ?? undefined },
          reason: message.reason,
          older: message.older,
        });
        return;
      case "need-window":
        this.#options.onNeedWindow();
        return;
      case "clipboard": {
        let ok = true;
        try {
          clipboard.writeText(message.text);
        } catch (error) {
          ok = false;
          this.#options.log.error("Could not write the clipboard", error);
        }
        this.#post(child, { type: "clipboard-done", id: message.id, ok });
        return;
      }
    }
  }

  #onExit(child: UtilityProcess, code: number): void {
    if (this.#child !== child) return;
    this.#child = null;
    this.#ready = false;
    if (this.#stopping) {
      this.#options.log.info(`The core exited with code ${code}`);
      return;
    }
    const now = Date.now();
    this.#crashes = [...this.#crashes.filter((time) => now - time < CRASH_WINDOW_MS), now];
    const delay = Math.min(MAX_RESTART_DELAY_MS, 250 * 2 ** (this.#crashes.length - 1));
    this.#options.log.error(`The core exited with code ${code}; restarting it in ${delay} ms`);
    this.#options.onLost();
    this.#restartTimer = setTimeout(() => {
      this.#restartTimer = null;
      this.start();
    }, delay);
  }
}
