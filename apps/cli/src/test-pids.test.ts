import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { isRunning } from "@arcue/platform-node";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { outsideSessions } from "./session-view";
import { killRegistered, killStarted, registerPid } from "./test-pids";

let folder: string;
let children: ChildProcess[];

/** A process that runs until it is killed, with `marker` on its command line. */
function sleeper(marker: string): ChildProcess {
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1 << 30)", marker], {
    stdio: "ignore",
    env: outsideSessions(process.env),
  });
  children.push(child);
  return child;
}

function exited(child: ChildProcess, withinMs = 3000): Promise<void> {
  return new Promise((resolve, reject) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve();
      return;
    }
    const timer = setTimeout(() => reject(new Error(`process ${child.pid} still runs after ${withinMs} ms`)), withinMs);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

beforeEach(() => {
  folder = realpathSync(mkdtempSync(join(tmpdir(), "arcue-pids-")));
  children = [];
});

afterEach(() => {
  vi.unstubAllEnvs();
  for (const child of children) child.kill("SIGKILL");
  rmSync(folder, { recursive: true, force: true });
});

describe("the processes a test run started", () => {
  it("kills a process whose command line names the marker, and leaves one whose command line does not", async () => {
    const ours = sleeper(join(folder, "arcue.js"));
    const other = sleeper(join(tmpdir(), "elsewhere.js"));

    killStarted(other.pid ?? 0, folder);
    killStarted(ours.pid ?? 0, folder);

    await exited(ours);
    expect(isRunning(other.pid ?? 0)).toBe(true);
  });

  it("kills only the recorded processes that still run from the run's folder", async () => {
    const ours = sleeper(join(folder, "arcue.js"));
    const unrecorded = sleeper(join(folder, "arcue.js"));
    const other = sleeper(join(tmpdir(), "elsewhere.js"));
    registerPid(folder, ours.pid ?? 0);
    registerPid(folder, other.pid ?? 0);

    killRegistered(folder);

    await exited(ours);
    expect(isRunning(other.pid ?? 0)).toBe(true);
    expect(isRunning(unrecorded.pid ?? 0)).toBe(true);
  });

  it.skipIf(process.platform === "win32")(
    "reads the whole command line from ps where there is no /proc, and kills nothing when it cannot read it",
    async () => {
      const platform = Object.getOwnPropertyDescriptor(process, "platform");
      Object.defineProperty(process, "platform", { value: "darwin" });
      try {
        const ours = sleeper(join(folder, "arcue.js"));
        const other = sleeper(join(tmpdir(), "elsewhere.js"));
        const unread = sleeper(join(folder, "arcue.js"));
        vi.stubEnv("COLUMNS", "20");
        killStarted(other.pid ?? 0, folder);
        killStarted(ours.pid ?? 0, folder);
        await exited(ours);
        expect(isRunning(other.pid ?? 0)).toBe(true);

        vi.stubEnv("PATH", "");
        killStarted(unread.pid ?? 0, folder);
        await sleep(300);
        expect({ code: unread.exitCode, signal: unread.signalCode }).toEqual({ code: null, signal: null });
      } finally {
        if (platform) Object.defineProperty(process, "platform", platform);
      }
    },
  );
});
