import { afterEach, describe, expect, it } from "vitest";
import { armHardExit, exitAfterRun } from "./exit-after-run";

function fakeTimers() {
  const armed: { ms: number; run: () => void; unref: boolean }[] = [];
  return {
    armed,
    setTimer(ms: number, run: () => void) {
      const timer = { ms, run, unref: false };
      armed.push(timer);
      return {
        unref() {
          timer.unref = true;
        },
      };
    },
  };
}

const exitCode = process.exitCode;

afterEach(() => {
  process.exitCode = exitCode;
});

describe("exitAfterRun", () => {
  it("sets the exit code and arms an unref'd timer that ends the process after 5 seconds", () => {
    const timers = fakeTimers();
    const exits: (number | undefined)[] = [];

    exitAfterRun(3, { exit: (code) => exits.push(code), setTimer: timers.setTimer });

    expect(process.exitCode).toBe(3);
    expect(timers.armed).toMatchObject([{ ms: 5000, unref: true }]);
    expect(exits).toEqual([]);
    timers.armed[0]?.run();
    expect(exits).toEqual([3]);
  });
});

describe("armHardExit", () => {
  it("arms an unref'd timer that says so on stderr and exits with 1", () => {
    const timers = fakeTimers();
    const exits: (number | undefined)[] = [];
    let err = "";

    armHardExit(30_000, { exit: (code) => exits.push(code), setTimer: timers.setTimer, err: (text) => (err += text) });

    expect(timers.armed).toMatchObject([{ ms: 30_000, unref: true }]);
    expect(err).toBe("");
    timers.armed[0]?.run();
    expect(err).toBe("Arcue did not stop within 30 seconds, so it exits now.\n");
    expect(exits).toEqual([1]);
  });
});
