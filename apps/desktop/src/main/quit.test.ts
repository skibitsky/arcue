import { describe, expect, it } from "vitest";
import { QuitSequence } from "./quit";

function request() {
  const event = { prevented: false, preventDefault: () => (event.prevented = true) };
  return event;
}

function sequence(steps: () => Promise<void>) {
  const quits: number[] = [];
  const errors: unknown[] = [];
  const quit = new QuitSequence({
    steps,
    quit: () => quits.push(quits.length),
    onError: (error) => errors.push(error),
  });
  return { quit, quits, errors };
}

describe("QuitSequence", () => {
  it("holds back every quit request until its steps finished, then quits once", async () => {
    const finish = Promise.withResolvers<void>();
    let runs = 0;
    const { quit, quits } = sequence(() => {
      runs++;
      return finish.promise;
    });

    const first = request();
    quit.beforeQuit(first);
    const second = request();
    quit.beforeQuit(second);
    const closing = request();
    quit.willQuit(closing);

    expect([first.prevented, second.prevented, closing.prevented]).toEqual([true, true, true]);
    expect(runs).toBe(1);
    await Promise.resolve();
    expect(quits).toEqual([]);

    finish.resolve();
    await expect.poll(() => quits).toEqual([0]);
    const last = request();
    quit.beforeQuit(last);
    const lastWill = request();
    quit.willQuit(lastWill);
    expect([last.prevented, lastWill.prevented]).toEqual([false, false]);
    expect(runs).toBe(1);
  });

  it("quits when a step fails, and reports it", async () => {
    const failure = new Error("The disk is gone.");
    const { quit, quits, errors } = sequence(() => Promise.reject(failure));
    quit.beforeQuit(request());
    await expect.poll(() => quits).toEqual([0]);
    expect(errors).toEqual([failure]);
  });
});
