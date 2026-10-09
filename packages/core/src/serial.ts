/** Runs tasks one at a time, in the order they were queued. A failed task does not stop the ones after it. */
export class Serial {
  #tail: Promise<unknown> = Promise.resolve();

  run<Result>(task: () => Promise<Result>): Promise<Result> {
    const result = this.#tail.then(task, task);
    this.#tail = result.catch(() => undefined);
    return result;
  }
}
