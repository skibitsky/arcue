import { describe, expect, it } from "vitest";
import { ManualClock } from "./manual-clock";

describe("ManualClock", () => {
  it("starts at the given time and moves only when advanced", () => {
    const clock = new ManualClock(1000);
    expect(clock.now()).toBe(1000);
    clock.advance(250);
    expect(clock.now()).toBe(1250);
  });

  it("runs due timers in order, at their due time", () => {
    const clock = new ManualClock(0);
    const calls: string[] = [];
    clock.setTimer(300, () => calls.push(`late at ${clock.now()}`));
    clock.setTimer(100, () => calls.push(`early at ${clock.now()}`));
    clock.setTimer(100, () => calls.push(`early second at ${clock.now()}`));
    clock.advance(200);
    expect(calls).toEqual(["early at 100", "early second at 100"]);
    expect(clock.pendingTimers).toBe(1);
    clock.advance(100);
    expect(calls).toHaveLength(3);
  });

  it("runs timers that other timers schedule within the same advance", () => {
    const clock = new ManualClock(0);
    const calls: number[] = [];
    clock.setTimer(10, () => clock.setTimer(10, () => calls.push(clock.now())));
    clock.advance(25);
    expect(calls).toEqual([20]);
  });

  it("skips cancelled timers", () => {
    const clock = new ManualClock(0);
    let fired = false;
    const cancel = clock.setTimer(10, () => {
      fired = true;
    });
    cancel();
    clock.advance(20);
    expect(fired).toBe(false);
  });
});
