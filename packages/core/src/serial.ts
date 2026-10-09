/** Runs tasks one at a time, in the order they were queued. A failed task does not stop the ones after it. */
export class Serial {
  #tail: Promise<unknown> = Promise.resolve();

  run<Result>(task: () => Promise<Result>): Promise<Result> {
    const result = this.#tail.then(task, task);
    this.#tail = result.catch(() => undefined);
    return result;
  }
}

/** Runs at most `limit` tasks at once; the rest wait their turn in the order they were queued. */
export class Limit {
  readonly #limit: number;
  readonly #waiting: (() => void)[] = [];
  #running = 0;

  constructor(limit: number) {
    this.#limit = Math.max(1, limit);
  }

  async run<Result>(task: () => Promise<Result>): Promise<Result> {
    if (this.#running >= this.#limit) await new Promise<void>((resolve) => this.#waiting.push(resolve));
    else this.#running++;
    try {
      return await task();
    } finally {
      const next = this.#waiting.shift();
      if (next) next();
      else this.#running--;
    }
  }
}
