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

  it("waits for the view's page or a window outside views, never a page of another view", async () => {
    const { windows, requests } = presence();
    windows.added("b");
    let shown = false;
    const waiting = windows.ensure("a").then(() => {
      shown = true;
    });
    windows.added("b");
    await Promise.resolve();
    expect(shown).toBe(false);
    windows.added("a");
    await waiting;
    expect(requests()).toBe(1);
    await windows.ensure("a");
  });

  it("takes a window outside views for a view, but no view's page for an open without one", async () => {
    const { windows } = presence();
    windows.added("a");
    let shown = false;
    const waiting = windows.ensure(null).then(() => {
      shown = true;
    });
    await Promise.resolve();
    expect(shown).toBe(false);
    windows.added(null);
    await waiting;
    await windows.ensure("b");
    windows.removed(null);
    expect(windows.count(null)).toBe(0);
    expect(windows.count("a")).toBe(1);
  });

  it("asks again after the last window is gone", async () => {
    const { windows, requests } = presence();
    windows.added();
    windows.removed();
    void windows.ensure();
    expect(requests()).toBe(1);
  });

  it("rejects its waiters as disconnected and cancels their timers once disposed", async () => {
    const { clock, windows, requests } = presence();
    const first = windows.ensure();
    const second = windows.ensure("a");
    expect(clock.pendingTimers).toBe(2);

    windows.dispose();

    await expect(first).rejects.toMatchObject({ code: "disconnected" });
    await expect(second).rejects.toMatchObject({ code: "disconnected" });
    expect(clock.pendingTimers).toBe(0);
    await expect(windows.ensure("b")).rejects.toMatchObject({ code: "disconnected" });
    expect(clock.pendingTimers).toBe(0);
    expect(requests()).toBe(1);
    windows.added();
    await expect(windows.ensure()).resolves.toBeUndefined();
  });
});
