import { ArcueError } from "@arcue/protocol";

type SetTimer = (delayMs: number, callback: () => void) => () => void;

/**
 * Counts the windows connected to the core, so an open from the command line can wait for a window. On macOS the app
 * keeps running with every window closed; `requestWindow` then asks the main process to open one.
 */
export class WindowPresence {
  #count = 0;
  #waiters: (() => void)[] = [];
  readonly #requestWindow: () => void;
  readonly #setTimer: SetTimer;
  readonly #timeoutMs: number;

  constructor(options: { requestWindow: () => void; setTimer: SetTimer; timeoutMs?: number }) {
    this.#requestWindow = options.requestWindow;
    this.#setTimer = options.setTimer;
    this.#timeoutMs = options.timeoutMs ?? 15_000;
  }

  get count(): number {
    return this.#count;
  }

  added(): void {
    this.#count++;
    for (const resolve of this.#waiters.splice(0)) resolve();
  }

  removed(): void {
    this.#count = Math.max(0, this.#count - 1);
  }

  /** Resolves once a window is connected, asking for one when none is; rejects as "unavailable" after the timeout. */
  ensure(): Promise<void> {
    if (this.#count > 0) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const waiter = () => {
        cancel();
        resolve();
      };
      const cancel = this.#setTimer(this.#timeoutMs, () => {
        this.#waiters = this.#waiters.filter((entry) => entry !== waiter);
        reject(new ArcueError("unavailable", "No window opened in time to show the asset."));
      });
      this.#waiters.push(waiter);
      if (this.#waiters.length === 1) this.#requestWindow();
    });
  }
}
