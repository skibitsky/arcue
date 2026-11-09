import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FromCore, ToCore } from "../shared/core-messages";
import { CoreHost, MAX_START_FAILURES } from "./core-host";

const { children } = vi.hoisted(() => {
  /** A utility process that the test answers for: it records what the host posts and emits what the core would. */
  class FakeChild {
    readonly pid = 4242;
    readonly posted: ToCore[] = [];
    readonly #listeners = new Map<string, ((value: unknown) => void)[]>();

    on(event: string, listener: (value: unknown) => void): this {
      this.#listeners.set(event, [...(this.#listeners.get(event) ?? []), listener]);
      return this;
    }

    once(event: string, listener: (value: unknown) => void): this {
      const once = (value: unknown) => {
        this.#listeners.set(
          event,
          (this.#listeners.get(event) ?? []).filter((entry) => entry !== once),
        );
        listener(value);
      };
      return this.on(event, once);
    }

    postMessage(message: ToCore): void {
      this.posted.push(message);
    }

    kill(): void {
      this.exit(1);
    }

    send(message: FromCore): void {
      for (const listener of this.#listeners.get("message") ?? []) listener(message);
    }

    exit(code: number): void {
      for (const listener of [...(this.#listeners.get("exit") ?? [])]) listener(code);
    }
  }
  return { children: { list: [] as FakeChild[], create: () => new FakeChild() } };
});

vi.mock("electron", () => ({
  utilityProcess: {
    fork: () => {
      const child = children.create();
      children.list.push(child);
      return child;
    },
  },
  MessageChannelMain: class {
    readonly port1 = { side: 1 };
    readonly port2 = { side: 2 };
  },
  clipboard: { writeText: () => undefined },
}));

function host() {
  const lost: number[] = [];
  const failed: string[] = [];
  const core = new CoreHost({
    entry: "core.js",
    userData: "/data",
    logFile: "/data/logs/core.log",
    log: { info: () => undefined, error: () => undefined },
    onNeedWindow: () => undefined,
    onLost: () => lost.push(children.list.length),
    onAlreadyRunning: () => undefined,
    onFailed: (reason) => failed.push(reason),
  });
  return { core, lost, failed };
}

function last() {
  const child = children.list.at(-1);
  if (!child) throw new Error("No core process started.");
  return child;
}

beforeEach(() => {
  vi.useFakeTimers();
  children.list.length = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("CoreHost", () => {
  it("stops starting a core that cannot start, and says why", () => {
    const { core, lost, failed } = host();
    core.start();
    for (let attempt = 1; attempt <= MAX_START_FAILURES; attempt++) {
      expect(children.list).toHaveLength(attempt);
      last().send({ type: "failed", message: "The disk is full." });
      last().exit(1);
      vi.advanceTimersByTime(60_000);
    }

    expect(children.list).toHaveLength(MAX_START_FAILURES);
    expect(failed).toEqual(["The disk is full."]);
    expect(lost).toEqual([]);
    core.start();
    expect(children.list).toHaveLength(MAX_START_FAILURES);
  });

  it("says why when a core exits before it is ready without saying why", () => {
    const { core, failed } = host();
    core.start();
    for (let attempt = 1; attempt <= MAX_START_FAILURES; attempt++) {
      last().exit(9);
      vi.advanceTimersByTime(60_000);
    }
    expect(failed).toEqual(["Its process exited with code 9 as it started."]);
  });

  it("keeps restarting a core that crashes once it started, and starts counting failed starts again", () => {
    const { core, lost, failed } = host();
    core.start();
    for (let crash = 1; crash <= 2 * MAX_START_FAILURES; crash++) {
      last().send({ type: "started", socket: null });
      last().exit(1);
      expect(lost).toHaveLength(crash);
      vi.advanceTimersByTime(60_000);
    }
    const failStarts = () => {
      for (let attempt = 1; attempt < MAX_START_FAILURES; attempt++) {
        last().send({ type: "failed", message: "The disk is full." });
        last().exit(1);
        vi.advanceTimersByTime(60_000);
      }
    };
    failStarts();
    last().send({ type: "started", socket: null });
    last().exit(1);
    vi.advanceTimersByTime(60_000);
    failStarts();

    expect(failed).toEqual([]);
    expect(lost).toHaveLength(2 * MAX_START_FAILURES + 1);
    expect(children.list).toHaveLength(2 + 2 * MAX_START_FAILURES + 2 * (MAX_START_FAILURES - 1));
  });

  it("gives a window that asked again while the core was down only its newest port", () => {
    const { core } = host();
    core.start();
    const delivered: string[] = [];
    core.requestPort("window-1", "window-1-1", () => delivered.push("window-1-1"));
    core.requestPort("window-2", "window-2-1", () => delivered.push("window-2-1"));
    core.requestPort("window-1", "window-1-2", () => delivered.push("window-1-2"));
    last().send({ type: "started", socket: null });

    expect(delivered).toEqual(["window-2-1", "window-1-2"]);
    expect(last().posted.filter((message) => message.type === "connect")).toEqual([
      { type: "connect", connection: "window-2-1" },
      { type: "connect", connection: "window-1-2" },
    ]);
  });
});
