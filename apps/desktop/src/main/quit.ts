/** An event whose default a handler can prevent, as Electron's before-quit and will-quit. */
export interface Preventable {
  preventDefault(): void;
}

export interface QuitSequenceOptions {
  /** What the app does before it quits: close the windows' assets, save the session, stop the core. */
  steps(): Promise<void>;
  /** Quits for real once the steps finished. */
  quit(): void;
  onError(error: unknown): void;
}

/**
 * The app's quit. The first quit request runs the steps, and every request that comes while they run, such as a second
 * Cmd+Q or a restart to update, waits for them, so no window closes before the session is saved.
 */
export class QuitSequence {
  readonly #options: QuitSequenceOptions;
  #phase: "running" | "quitting" | "done" = "running";

  constructor(options: QuitSequenceOptions) {
    this.#options = options;
  }

  /** Electron's before-quit. */
  beforeQuit(event: Preventable): void {
    if (this.#phase === "done") return;
    event.preventDefault();
    if (this.#phase === "quitting") return;
    this.#phase = "quitting";
    void this.#options
      .steps()
      .catch((error: unknown) => this.#options.onError(error))
      .then(() => {
        this.#phase = "done";
        this.#options.quit();
      });
  }

  /** Electron's will-quit. */
  willQuit(event: Preventable): void {
    if (this.#phase === "quitting") event.preventDefault();
  }
}
