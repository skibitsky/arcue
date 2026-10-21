import type { ChildProcess } from "node:child_process";
import { fork, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import type { FixtureCommand } from "./file-lock.fixture";

/** The variables that tie a process to an agent session or its view, which no child of a test may inherit. */
const SESSION_VARIABLES = ["CLAUDE_CODE_SESSION_ID", "CODEX_SESSION_ID", "CODEX_THREAD_ID", "ARCUE_VIEW"];

/** This process's environment outside any agent session, with the test's own data folder. */
export function childEnv(userData: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, ARCUE_USER_DATA: userData };
  for (const name of SESSION_VARIABLES) delete env[name];
  return env;
}

/** The pid of a process that has ended. */
export function deadPid(): number {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const name of SESSION_VARIABLES) delete env[name];
  return spawnSync(process.execPath, ["-e", ""], { env }).pid;
}

export interface FixtureChild {
  readonly process: ChildProcess;
  readonly pid: number;
  /** Resolves with the first message the child sent or sends that passes the check. */
  message(check: (message: unknown) => boolean, timeoutMs?: number): Promise<unknown>;
  send(message: string): void;
  /** Resolves once the child has exited, with its exit code, or the signal that ended it. */
  readonly exited: Promise<number | NodeJS.Signals>;
}

export interface Fixture {
  start(command: FixtureCommand, userData: string): FixtureChild;
  /** Kills the children that still run. */
  stopAll(): Promise<void>;
  remove(): void;
}

/** Builds `file-lock.fixture.ts` into one script for Node, in a temporary folder, to fork children from. */
export async function buildFixture(): Promise<Fixture> {
  const outDir = mkdtempSync(join(tmpdir(), "arcue-lock-fixture-"));
  await build({
    configFile: false,
    logLevel: "silent",
    root: fileURLToPath(new URL(".", import.meta.url)),
    build: {
      ssr: fileURLToPath(new URL("./file-lock.fixture.ts", import.meta.url)),
      outDir,
      emptyOutDir: true,
      target: "node22",
      rolldownOptions: { output: { entryFileNames: "fixture.mjs" } },
    },
    ssr: { noExternal: true },
  });
  const script = join(outDir, "fixture.mjs");
  const children = new Set<FixtureChild>();
  return {
    start(command, userData) {
      const child = startChild(script, command, userData);
      children.add(child);
      void child.exited.then(() => children.delete(child));
      return child;
    },
    async stopAll() {
      const running = [...children];
      for (const child of running) child.process.kill("SIGKILL");
      await Promise.all(running.map((child) => child.exited));
    },
    remove() {
      rmSync(outDir, { recursive: true, force: true });
    },
  };
}

function startChild(script: string, command: FixtureCommand, userData: string): FixtureChild {
  const child = fork(script, [JSON.stringify(command)], {
    env: childEnv(userData),
    execArgv: [],
    stdio: ["ignore", "inherit", "inherit", "ipc"],
  });
  const received: unknown[] = [];
  const listeners = new Set<(message: unknown) => void>();
  child.on("message", (message: unknown) => {
    received.push(message);
    for (const listener of listeners) listener(message);
  });
  const exited = new Promise<number | NodeJS.Signals>((resolve) => {
    child.once("close", (code, signal) => resolve(code ?? signal ?? 1));
  });
  const pid = child.pid;
  if (pid === undefined) throw new Error("The fixture did not start.");
  return {
    process: child,
    pid,
    exited,
    send: (message) => {
      child.send(message);
    },
    message(check, timeoutMs = 20_000) {
      const found = received.find(check);
      if (found !== undefined) return Promise.resolve(found);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          listeners.delete(listener);
          reject(
            new Error(`The fixture child sent no such message within ${timeoutMs} ms: ${JSON.stringify(received)}`),
          );
        }, timeoutMs);
        const listener = (message: unknown) => {
          if (!check(message)) return;
          clearTimeout(timer);
          listeners.delete(listener);
          resolve(message);
        };
        listeners.add(listener);
        void exited.then(() => {
          if (!listeners.has(listener)) return;
          clearTimeout(timer);
          listeners.delete(listener);
          reject(new Error(`The fixture child exited before it sent the message: ${JSON.stringify(received)}`));
        });
      });
    },
  };
}
