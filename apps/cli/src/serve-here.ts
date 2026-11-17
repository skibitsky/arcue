import { blockingCore, CoreRunningError, connectToCore } from "@arcue/platform-node";
import { SERVE_STOPPED_CLOSE_CODE } from "@arcue/protocol";
import { IDLE_STOP_MS, servePort } from "./detach";
import type { ArcueServer, ServeOptions } from "./serve";
import { startServer } from "./serve";

/**
 * Whether this process can run `arcue serve --detach`, which starts its own program again as Node. An Electron utility
 * process, where the Claude desktop app runs its extensions' servers on its own Node, can't: its program is Electron's
 * helper, which may not run as Node.
 */
export function startsItself(proc: object = process): boolean {
  const type: unknown = Reflect.get(proc, "type");
  return type === undefined;
}

export type ServeHereOptions = Pick<ServeOptions, "userData" | "importWorkerEntry" | "webUi" | "build" | "onError"> & {
  platform?: NodeJS.Platform;
  /** Says why Arcue in the browser stopped. */
  onStopped?: (message: string) => void;
  /** How long it runs with no page open. Defaults to 30 minutes, as `arcue serve --detach` does. */
  idleStopMs?: number;
  /** Defaults to the port it ran on last, or the default port, or any free one when that is taken. */
  port?: number;
};

/**
 * Arcue in the browser in this process, for an `arcue mcp` that can't start it in the background. It runs until it stops
 * by itself or `arcue stop` asks it to, and `start` starts it again after that, until `close`.
 */
export class ServeHere {
  readonly #options: ServeHereOptions;
  #server: ArcueServer | null = null;
  #starting: Promise<void> | null = null;
  #closing: Promise<void> | null = null;
  #closed = false;

  constructor(options: ServeHereOptions) {
    this.#options = options;
  }

  /** Starts Arcue in the browser here, unless it runs already, here or in another process. */
  start(): Promise<void> {
    this.#starting ??= this.#start().finally(() => {
      this.#starting = null;
    });
    return this.#starting;
  }

  async close(): Promise<void> {
    this.#closed = true;
    await this.#starting?.catch(() => undefined);
    const server = this.#server;
    this.#server = null;
    await Promise.all([this.#closing, server?.close(SERVE_STOPPED_CLOSE_CODE)]);
  }

  async #start(): Promise<void> {
    await this.#closing;
    if (this.#closed) throw new Error("Arcue's MCP server is closing.");
    if (this.#server) return;
    const { userData } = this.#options;
    const blocking = await blockingCore(userData, "serve");
    if (blocking?.reason === "unshared") {
      throw new CoreRunningError(blocking.info, "unshared", "serve", this.#options.platform ?? process.platform);
    }
    if (blocking) {
      const connection = await connectToCore(userData, "serve");
      connection?.close();
      if (connection) return;
    }
    const { importWorkerEntry, webUi, build, onError } = this.#options;
    const serve = (port: number) =>
      startServer({
        userData,
        importWorkerEntry,
        webUi,
        port,
        idleStopMs: this.#options.idleStopMs ?? IDLE_STOP_MS,
        onError,
        hosted: true,
        ...(build === undefined ? {} : { build }),
      });
    const server = await serve(this.#options.port ?? (await servePort(userData)))
      .catch((error: unknown) => {
        if (error instanceof Error && error.message.includes(" is in use.")) return serve(0);
        throw error;
      })
      .catch((error: unknown) => {
        if (error instanceof CoreRunningError && error.reason === "same") return null;
        throw error;
      });
    if (!server) return;
    this.#server = server;
    void server.stopped.then((stop) => {
      if (this.#server !== server) return;
      this.#server = null;
      this.#options.onStopped?.(stop.message);
      this.#closing = server.close(SERVE_STOPPED_CLOSE_CODE).finally(() => {
        this.#closing = null;
      });
    });
  }
}
