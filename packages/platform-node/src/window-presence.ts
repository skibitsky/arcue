import { ArcueError } from "@arcue/protocol";

type SetTimer = (delayMs: number, callback: () => void) => () => void;

/**
 * Counts the windows connected to the core by the agent session's view each shows, so an open from the command line can
 * wait for a window that may show its model: the view's page, or a window outside views. On macOS the app keeps running
 * with every window closed; `requestWindow` then asks the main process to open one.
 */
export class WindowPresence {
  readonly #counts = new Map<string | null, number>();
  #waiters: { view: string | null; resolve: () => void; reject: (error: ArcueError) => void }[] = [];
  #disposed = false;
  readonly #requestWindow: () => void;
  readonly #setTimer: SetTimer;
  readonly #timeoutMs: number;

  constructor(options: { requestWindow: () => void; setTimer: SetTimer; timeoutMs?: number }) {
    this.#requestWindow = options.requestWindow;
    this.#setTimer = options.setTimer;
    this.#timeoutMs = options.timeoutMs ?? 15_000;
  }

  /** The windows connected for a view, or with null the windows outside views. */
  count(view: string | null = null): number {
    return this.#counts.get(view) ?? 0;
  }

  added(view: string | null = null): void {
    this.#counts.set(view, this.count(view) + 1);
    const ready = this.#waiters.filter((waiter) => this.#canShow(waiter.view));
    this.#waiters = this.#waiters.filter((waiter) => !ready.includes(waiter));
    for (const waiter of ready) waiter.resolve();
  }

  removed(view: string | null = null): void {
    const count = this.count(view) - 1;
    if (count > 0) this.#counts.set(view, count);
    else this.#counts.delete(view);
  }

  /**
   * Resolves once a window that may show a model opened for the view is connected: the view's page or a window outside
   * views, or with a null view only a window outside views. Asks for a window when none is; rejects as "unavailable"
   * after the timeout.
   */
  ensure(view: string | null = null): Promise<void> {
    if (this.#canShow(view)) return Promise.resolve();
    if (this.#disposed) return Promise.reject(stopping());
    return new Promise((resolve, reject) => {
      const waiter = {
        view,
        resolve: () => {
          cancel();
          resolve();
        },
        reject: (error: ArcueError) => {
          cancel();
          reject(error);
        },
      };
      const cancel = this.#setTimer(this.#timeoutMs, () => {
        this.#waiters = this.#waiters.filter((entry) => entry !== waiter);
        reject(new ArcueError("unavailable", "No window opened in time to show the asset."));
      });
      this.#waiters.push(waiter);
      if (this.#waiters.length === 1) this.#requestWindow();
    });
  }

  /** Rejects every waiter as "disconnected" and cancels its timer, as the core stops; later waiters reject at once. */
  dispose(): void {
    this.#disposed = true;
    for (const waiter of this.#waiters.splice(0)) waiter.reject(stopping());
  }

  #canShow(view: string | null): boolean {
    return this.count(null) > 0 || (view !== null && this.count(view) > 0);
  }
}

function stopping(): ArcueError {
  return new ArcueError("disconnected", "Arcue is stopping.");
}
