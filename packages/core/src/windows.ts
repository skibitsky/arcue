import type { Peer } from "@arcue/protocol";
import { ArcueError } from "@arcue/protocol";
import type { Clock } from "./platform";
import type { CallContext } from "./registry";

/** The windows connected to the core, and which one gained focus last. */
export class WindowRegistry {
  readonly #peers = new Map<string, Peer>();
  #lastFocused: string | null = null;

  add(connection: string, peer: Peer): void {
    this.#peers.set(connection, peer);
  }

  remove(connection: string): void {
    this.#peers.delete(connection);
    if (this.#lastFocused === connection) this.#lastFocused = null;
  }

  has(connection: string | null): connection is string {
    return connection !== null && this.#peers.has(connection);
  }

  focus(connection: string): void {
    if (this.#peers.has(connection)) this.#lastFocused = connection;
  }

  /**
   * The window for a newly shown asset: the caller's own window when a window asked, otherwise the window focused
   * last, otherwise the window that connected last. Null when no window is connected.
   */
  choose(context: CallContext): string | null {
    if (context.caller === "window" && this.has(context.connection)) return context.connection;
    if (this.has(this.#lastFocused)) return this.#lastFocused;
    return [...this.#peers.keys()].at(-1) ?? null;
  }

  /** Sends a command to a window. With a timeout, a window that does not answer in time rejects as "unavailable". */
  request(connection: string, name: string, input: unknown, timeout?: { ms: number; clock: Clock }): Promise<unknown> {
    const peer = this.#peers.get(connection);
    if (!peer) return Promise.reject(new ArcueError("unavailable", "The window that shows this asset is closed."));
    const answer = peer.request("command", name, input);
    if (!timeout) return answer;
    return new Promise((resolve, reject) => {
      const cancel = timeout.clock.setTimer(timeout.ms, () =>
        reject(new ArcueError("unavailable", `The window did not answer "${name}" within ${timeout.ms} ms.`)),
      );
      answer.then(
        (output) => {
          cancel();
          resolve(output);
        },
        (error: unknown) => {
          cancel();
          reject(error);
        },
      );
    });
  }
}
