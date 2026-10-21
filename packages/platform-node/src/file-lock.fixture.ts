import { closeSync, openSync, readFileSync, readSync, watch, writeSync } from "node:fs";
import { open } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { ArcueCore, ManualClock, MemoryPlatform } from "@arcue/core";
import { BRIDGE_INFO_FILE, LOCKS_FOLDER, START_LOCK_FILE } from "@arcue/protocol";
import { startBridgeServer } from "./bridge-server";
import { runningCore } from "./core-connection";
import type { FileLockOptions } from "./file-lock";
import { acquireFileLock } from "./file-lock";
import { startFakeCore } from "./test-cores";

type LockSettings = Partial<Omit<FileLockOptions, "label" | "now">>;

/** What a test asks a child forked from this fixture to do, as its one argument in JSON. */
export type FixtureCommand =
  | {
      mode: "loop";
      lock: string;
      probe: string;
      counter: string;
      iterations: number;
      /** Waits for "go" before its first turn and for "release" after its last, so the children run side by side. */
      together?: boolean;
      options?: LockSettings;
    }
  | { mode: "hold"; lock: string; options?: LockSettings }
  | { mode: "stall"; lock: string; ms: number; options?: LockSettings }
  | { mode: "spam"; lock: string; ms: number; waiters: number; holdMs: number; options?: LockSettings }
  | { mode: "exit"; lock: string; options?: LockSettings }
  | { mode: "open-handle"; path: string }
  | { mode: "watch"; folder: string }
  /** Starts the bridge of Arcue in the browser on a core in memory once it gets "go". */
  | { mode: "serve-start"; userData: string; url: string }
  /**
   * Once it gets "go", starts as a desktop core of a future build would, one that takes other locks: under the start
   * lock every Arcue shares, it refuses beside any live core, waits a moment, and writes `bridge.json` with `locks: 2`.
   */
  | { mode: "future-desktop"; userData: string };

const command: FixtureCommand = JSON.parse(process.argv[2] ?? "{}");

/** Sends a message to the test, resolving once it is on its way, so the process may exit after it. */
function send(message: unknown): Promise<void> {
  return new Promise((resolve) => {
    if (!process.send) resolve();
    else process.send(message, () => resolve());
  });
}

/** Tells the test the child is ready and waits for its "go", so that children act at the same moment. */
async function ready(): Promise<void> {
  const go = received("go");
  void send("ready");
  await go;
}

function received(expected: string): Promise<void> {
  return new Promise((resolve) => {
    const listener = (message: unknown) => {
      if (message !== expected) return;
      process.off("message", listener);
      resolve();
    };
    process.on("message", listener);
  });
}

function lockOptions(settings: LockSettings = {}): FileLockOptions {
  return { timeoutMs: 15_000, label: "the test lock", ...settings };
}

function lastLine(path: string): string {
  return readFileSync(path, "utf8").trimEnd().split("\n").at(-1) ?? "";
}

/** Adds one to the number in the file without taking care that nobody else does at the same time. */
function increment(path: string): void {
  const descriptor = openSync(path, "r+");
  try {
    const bytes = Buffer.alloc(12);
    readSync(descriptor, bytes, 0, 12, 0);
    const next = String(Number(bytes.toString("utf8").trim() || "0") + 1).padStart(12, "0");
    writeSync(descriptor, next, 0, "utf8");
  } finally {
    closeSync(descriptor);
  }
}

async function main(): Promise<void> {
  switch (command.mode) {
    case "loop": {
      if (command.together) await ready();
      for (let index = 0; index < command.iterations; index++) {
        const release = await acquireFileLock(command.lock, lockOptions(command.options));
        const entered = `${process.pid}:${index}:enter`;
        writeSync(openAppend(command.probe), `${entered}\n`);
        if (lastLine(command.probe) !== entered) throw new Error(`Another holder wrote after ${entered}`);
        await sleep(1 + Math.random() * 2);
        if (lastLine(command.probe) !== entered) throw new Error(`Another holder wrote inside ${entered}`);
        writeSync(openAppend(command.probe), `${process.pid}:${index}:exit\n`);
        increment(command.counter);
        await release();
        void send({ done: index });
      }
      if (command.together) await received("release");
      return;
    }
    case "hold": {
      const release = await acquireFileLock(command.lock, lockOptions(command.options));
      const done = received("release");
      void send("held");
      await done;
      await release();
      return;
    }
    case "stall": {
      const release = await acquireFileLock(command.lock, lockOptions(command.options));
      await send("held");
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, command.ms);
      await release();
      return;
    }
    case "spam": {
      const end = Date.now() + command.ms;
      void send("spamming");
      await Promise.all(
        Array.from({ length: command.waiters }, async () => {
          while (Date.now() < end) {
            const release = await acquireFileLock(command.lock, lockOptions(command.options));
            await sleep(command.holdMs);
            await release();
          }
        }),
      );
      return;
    }
    case "open-handle": {
      const handle = await open(command.path, "r");
      const done = received("release");
      void send("opened");
      await done;
      await handle.close();
      return;
    }
    case "watch": {
      const watcher = watch(command.folder, { recursive: false }, () => undefined);
      watcher.on("error", () => undefined);
      const done = received("release");
      void send("watching");
      await done;
      watcher.close();
      return;
    }
    case "serve-start": {
      const core = await ArcueCore.start({ platform: new MemoryPlatform({ clock: new ManualClock() }) });
      await ready();
      const done = received("release");
      try {
        const server = await startBridgeServer({
          core,
          userData: command.userData,
          kind: "serve",
          url: command.url,
          ensureWindow: async () => undefined,
          onError: () => undefined,
        });
        void send({ started: server.info });
        await done;
        await server.close();
      } catch (error) {
        void send({ refused: error instanceof Error ? error.message : String(error) });
        await done;
      }
      core.dispose();
      return;
    }
    case "future-desktop": {
      await ready();
      const done = received("release");
      const release = await acquireFileLock(join(command.userData, LOCKS_FOLDER, START_LOCK_FILE), lockOptions());
      let started: { close(): Promise<void> } | null = null;
      try {
        const live = (await runningCore(command.userData, "serve")) ?? (await runningCore(command.userData, "desktop"));
        if (live) {
          void send({ refused: `Arcue runs (process ${live.pid})` });
        } else {
          await sleep(300);
          const fake = await startFakeCore(command.userData, { file: BRIDGE_INFO_FILE, kind: "desktop", locks: 2 });
          started = fake;
          void send({ started: fake.info });
        }
      } finally {
        await release();
      }
      await done;
      await started?.close();
      return;
    }
    case "exit": {
      await acquireFileLock(command.lock, lockOptions(command.options));
      await send("held");
      process.exit(0);
    }
  }
}

const appended = new Map<string, number>();

function openAppend(path: string): number {
  const known = appended.get(path);
  if (known !== undefined) return known;
  const descriptor = openSync(path, "a");
  appended.set(path, descriptor);
  return descriptor;
}

main().then(
  async () => {
    await send("finished");
    process.exit(0);
  },
  async (error: unknown) => {
    await send({ failed: error instanceof Error ? error.message : String(error) });
    process.exit(1);
  },
);
