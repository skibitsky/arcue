import { ManualClock } from "@arcue/core";
import { describe, expect, it } from "vitest";
import { WindowPresence } from "./window-presence";

function presence() {
  const clock = new ManualClock();
  let requests = 0;
  const windows = new WindowPresence({
    requestWindow: () => requests++,
    setTimer: (delayMs, callback) => clock.setTimer(delayMs, callback),
    timeoutMs: 1000,
  });
  return { clock, windows, requests: () => requests };
}

describe("WindowPresence", () => {
  it("resolves at once while a window is connected", async () => {
    const { windows, requests } = presence();
    windows.added();
    await windows.ensure();
    expect(requests()).toBe(0);
  });

  it("asks for one window and resolves every waiter when it connects", async () => {
    const { windows, requests } = presence();
    const first = windows.ensure();
    const second = windows.ensure();
    expect(requests()).toBe(1);
    windows.added();
    await expect(Promise.all([first, second])).resolves.toEqual([undefined, undefined]);
  });

  it("gives up as unavailable when no window connects in time", async () => {
    const { clock, windows } = presence();
    const waiting = windows.ensure();
    clock.advance(1000);
    await expect(waiting).rejects.toMatchObject({ code: "unavailable" });
  });

  it("asks again after the last window is gone", async () => {
    const { windows, requests } = presence();
    windows.added();
    windows.removed();
    void windows.ensure();
    expect(requests()).toBe(1);
  });
});
