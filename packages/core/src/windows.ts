import type { Peer } from "@arcue/protocol";
import { ArcueError } from "@arcue/protocol";
import type { Clock } from "./platform";

interface WindowEntry {
  peer: Peer;
  /** The agent session's view the window shows, or null for a window outside views. */
  view: string | null;
  /** A page `arcue serve` serves to a browser, rather than a desktop window. */
  browser: boolean;
  /** When the window last gained focus, in focus reports since the core started; 0 before the first. */
  focused: number;
}

/** The windows connected to the core, the view each belongs to, and which gained focus last. */
export class WindowRegistry {
  readonly #windows = new Map<string, WindowEntry>();
  #focusCount = 0;

  add(connection: string, peer: Peer, { view, browser }: { view: string | null; browser: boolean }): void {
    this.#windows.set(connection, { peer, view, browser, focused: 0 });
  }

  remove(connection: string): void {
    this.#windows.delete(connection);
  }

  has(connection: string | null): connection is string {
    return connection !== null && this.#windows.has(connection);
  }

  /** The view a connected window belongs to, or null for a window outside views. */
  viewOf(connection: string): string | null {
    return this.#windows.get(connection)?.view ?? null;
  }

  focus(connection: string): void {
    const entry = this.#windows.get(connection);
    if (entry) entry.focused = ++this.#focusCount;
  }

  /**
   * The window to show a view's assets in, or with a null view a window outside views: of those, the one focused last,
   * otherwise the one that connected last. With `desktopOnly`, never a browser page. Null when none is connected.
   */
  inView(view: string | null, { desktopOnly = false }: { desktopOnly?: boolean } = {}): string | null {
    let chosen: { connection: string; focused: number } | null = null;
    for (const [connection, entry] of this.#windows) {
      if (entry.view !== view || (desktopOnly && entry.browser)) continue;
      if (chosen === null || entry.focused >= chosen.focused) chosen = { connection, focused: entry.focused };
    }
    return chosen?.connection ?? null;
  }

  /** Sends a command to a window. With a timeout, a window that does not answer in time rejects as "unavailable". */
  request(connection: string, name: string, input: unknown, timeout?: { ms: number; clock: Clock }): Promise<unknown> {
    const peer = this.#windows.get(connection)?.peer;
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
