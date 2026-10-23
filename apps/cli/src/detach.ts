import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { closeSync, fstatSync, openSync } from "node:fs";
import { mkdir, readFile, rename, stat } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, join, parse } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import type { CoreConnection } from "@arcue/platform-node";
import { blockingCore, CoreRunningError, connectToCore, readLastCore, recordLastCore } from "@arcue/platform-node";
import type { BridgeInfo } from "@arcue/protocol";
import { viewAddress } from "@arcue/protocol";
import { userDataDir } from "./app-connection";
import type { Command } from "./args";
import { DEFAULT_SERVE_PORT } from "./args";
import { buildId } from "./build-id";
import type { Output, RunOptions } from "./run";
import { outsideSessions, sessionView } from "./session-view";

/** The arcue.js the build writes, which `arcue serve --detach` runs in the background. */
export const bundledEntry = fileURLToPath(new URL("./arcue.js", import.meta.url));

/** How long Arcue in the browser that `--detach` starts runs with no page open. */
export const IDLE_STOP_MS = 30 * 60_000;

const DETACH_TIMEOUT_MS = 30_000;
const LOG_LIMIT_BYTES = 1024 * 1024;
const POLL_MS = 100;
const PROBE_MS = 1000;
const AFTER_EXIT_MS = 2000;
const LOSER_EXIT_MS = 5000;

/** What `status` and `serve --detach` say about Arcue in the browser that runs from another arcue.js. */
export const OTHER_BUILD =
  "It runs from another arcue build: run arcue stop, then arcue serve --detach to use this one.";

/** The Node and the arcue.js this command runs on, which `--detach` starts again in the background. */
function selfOf(options: RunOptions): { execPath: string; script: string } {
  return options.self ?? { execPath: process.execPath, script: bundledEntry };
}

/** Which arcue.js this command is, or null when it cannot tell. */
export async function buildOf(options: RunOptions): Promise<string | null> {
  return options.build !== undefined ? options.build : buildId(selfOf(options).script);
}

/** Whether Arcue in the browser that the bridge file names runs from another arcue.js than `build`, when both are known. */
export function otherBuild(info: BridgeInfo, build: string | null): boolean {
  return build !== null && info.build !== undefined && info.build !== build;
}

/** The port of an address, as a browser takes it. */
function portOf(url: string | undefined): number | undefined {
  return url === undefined ? undefined : Number(new URL(url).port || 80);
}

/**
 * Runs `arcue serve` in the background and returns once it answers, printing its address and this session's view. When
 * Arcue in the browser already runs and shares reviews, it prints that one's address instead, and never stops it. The
 * child belongs to no agent session, so it gets none of their variables, and runs in the root of the data folder's
 * drive, so on Windows it keeps no folder someone may remove, such as the
 * data folder, whose removal stops it. It records Arcue in the browser as the last core before the child starts, so an
 * open meanwhile never starts the desktop app, and puts the earlier record back when the child fails to start.
 */
export async function detachServe(
  command: Extract<Command, { command: "serve" }>,
  env: NodeJS.ProcessEnv,
  output: Output,
  options: RunOptions,
): Promise<number> {
  const userData = userDataDir(env);
  const view = sessionView(env);
  const self = selfOf(options);
  const build = await buildOf(options);
  const viewLine = (url: string | undefined) =>
    view !== null && url !== undefined ? [`This session's view: ${viewAddress(url, view)}`] : [];
  const already = (info: BridgeInfo) => {
    const lines = [`Arcue already runs in a browser at ${info.url} (process ${info.pid}).`];
    if (otherBuild(info, build)) lines.push(OTHER_BUILD);
    output.out(`${[...lines, ...viewLine(info.url)].join("\n")}\n`);
    return 0;
  };

  const blocking = await blockingCore(userData, "serve");
  if (blocking?.reason === "unshared") {
    const platform = options.platform ?? process.platform;
    output.err(`${new CoreRunningError(blocking.info, "unshared", "serve", platform).message}\n`);
    return 1;
  }
  if (blocking) {
    let connection: CoreConnection | null;
    try {
      connection = await connectToCore(userData, "serve");
    } catch (error) {
      const { url, pid } = blocking.info;
      output.err(`Arcue in the browser at ${url} (process ${pid}) does not answer: ${messageOf(error)}\n`);
      return 1;
    }
    connection?.close();
    if (connection) {
      const { info } = connection;
      if (command.port !== undefined && command.port !== portOf(info.url)) {
        output.out(
          `Arcue already runs in a browser at ${info.url} (process ${info.pid}). Run arcue stop first to run it on port ${command.port}.\n`,
        );
        return 1;
      }
      return already(info);
    }
  }

  const port = command.port ?? (await freePort(portOf((await readLastCore(userData))?.serveUrl))) ?? DEFAULT_SERVE_PORT;
  if (!(await stat(self.script).catch(() => null))?.isFile()) {
    output.out(`This arcue has no arcue.js in ${dirname(self.script)}.\n`);
    return 1;
  }
  const logs = join(userData, "logs");
  await mkdir(logs, { recursive: true, mode: 0o700 });
  const log = join(logs, "serve.log");
  if (((await stat(log).catch(() => null))?.size ?? 0) > LOG_LIMIT_BYTES) {
    await rename(log, join(logs, "serve.old.log")).catch(() => undefined);
  }
  let descriptor: number | null = null;
  let offset: number;
  try {
    descriptor = openSync(log, "a", 0o600);
    offset = fstatSync(descriptor).size;
  } catch (error) {
    if (descriptor !== null) closeSync(descriptor);
    output.out(`Could not write Arcue's log at ${log}: ${messageOf(error)}\n`);
    return 1;
  }
  const putBackLastCore = await recordLastCore(userData, "serve");
  let child: ChildProcess;
  try {
    child = spawn(
      self.execPath,
      [self.script, "serve", "--port", String(port), "--idle-stop-ms", String(IDLE_STOP_MS)],
      {
        detached: true,
        stdio: ["ignore", descriptor, descriptor],
        windowsHide: true,
        cwd: parse(userData).root,
        env: { ...outsideSessions(env), ARCUE_USER_DATA: userData },
      },
    );
  } catch (error) {
    await putBackLastCore();
    output.out(`Could not start Arcue in the browser: ${messageOf(error)}\n`);
    return 1;
  } finally {
    closeSync(descriptor);
  }

  const timeoutMs = options.detachTimeoutMs ?? DETACH_TIMEOUT_MS;
  const outcome = await watchStart(child, userData, timeoutMs);
  if (outcome.kind !== "started" && outcome.kind !== "other") await putBackLastCore();
  switch (outcome.kind) {
    case "started":
      output.out(
        `${[
          `Arcue runs in a browser at ${outcome.info.url} (process ${outcome.info.pid}). It stops by itself after 30 minutes with no page open.`,
          ...viewLine(outcome.info.url),
        ].join("\n")}\n`,
      );
      return 0;
    case "other":
      return already(outcome.info);
    case "error":
      output.out(`Could not start Arcue in the browser: ${outcome.error.message}\n`);
      return 1;
    case "exited": {
      const said = (await readFile(log).catch(() => Buffer.alloc(0))).subarray(offset).toString("utf8").trim();
      output.err(`${said || `arcue serve exited with code ${outcome.code} before it answered. Its log is ${log}.`}\n`);
      return 1;
    }
    case "timeout":
      output.out(
        `Arcue in the browser did not answer within ${Math.round(timeoutMs / 1000)} seconds, so it was stopped. Its log is ${log}.\n`,
      );
      return 1;
  }
}

type StartOutcome =
  | { kind: "started"; info: BridgeInfo }
  | { kind: "other"; info: BridgeInfo }
  | { kind: "error"; error: Error }
  | { kind: "exited"; code: number | NodeJS.Signals }
  | { kind: "timeout" };

/**
 * Waits until the child answers at `serve.json`, another start wins, the child fails to spawn or exits, or the time is
 * up, which kills it. Lets go of the child once it runs, so this process can exit.
 */
async function watchStart(child: ChildProcess, userData: string, timeoutMs: number): Promise<StartOutcome> {
  let failed: Error | null = null;
  let exitCode: number | NodeJS.Signals | null = null;
  const { promise: changed, resolve: change } = Promise.withResolvers<void>();
  const onError = (error: Error) => {
    failed ??= error;
    change();
  };
  const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
    exitCode = code ?? signal ?? 1;
    change();
  };
  child.on("error", onError);
  child.once("exit", onExit);
  const exited = new Promise<void>((resolvePromise) => {
    if (child.exitCode !== null || child.signalCode !== null) resolvePromise();
    else child.once("exit", () => resolvePromise());
  });
  const deadline = Date.now() + timeoutMs;
  try {
    for (;;) {
      if (failed) return { kind: "error", error: failed };
      if (exitCode !== null) {
        const winner = await answeringWithin(userData, AFTER_EXIT_MS);
        return winner ? { kind: "other", info: winner } : { kind: "exited", code: exitCode };
      }
      const info = await answering(userData);
      if (info && info.pid === child.pid) {
        child.unref();
        return { kind: "started", info };
      }
      if (info) {
        await Promise.race([exited, sleep(LOSER_EXIT_MS, undefined, { ref: false })]);
        if (child.exitCode === null && child.signalCode === null) child.kill();
        return { kind: "other", info };
      }
      if (Date.now() >= deadline) {
        child.kill();
        return { kind: "timeout" };
      }
      await Promise.race([
        changed,
        sleep(Math.min(POLL_MS, Math.max(0, deadline - Date.now())), undefined, { ref: false }),
      ]);
    }
  } finally {
    child.off("error", onError);
    child.off("exit", onExit);
    child.on("error", () => undefined);
  }
}

/** What the core at `serve.json` says of itself when it answers. */
async function answering(userData: string): Promise<BridgeInfo | null> {
  const connection = await connectToCore(userData, "serve", PROBE_MS).catch(() => null);
  connection?.close();
  return connection?.info ?? null;
}

async function answeringWithin(userData: string, ms: number): Promise<BridgeInfo | null> {
  const deadline = Date.now() + ms;
  for (;;) {
    const info = await answering(userData);
    if (info || Date.now() >= deadline) return info;
    await sleep(POLL_MS);
  }
}

/** The port when nothing listens on it on 127.0.0.1 or ::1, the addresses `arcue serve` takes it on, or undefined. */
async function freePort(port: number | undefined): Promise<number | undefined> {
  if (port === undefined || !(await listensOn(port, "127.0.0.1"))) return undefined;
  return (await listensOn(port, "::1", { lacking: true })) ? port : undefined;
}

/** Whether a server can listen on the port at the address, or, with `lacking`, the computer has no such address. */
function listensOn(port: number, host: string, { lacking = false } = {}): Promise<boolean> {
  return new Promise((resolvePromise) => {
    const server = createServer();
    server.once("error", (error: NodeJS.ErrnoException) =>
      resolvePromise(lacking && (error.code === "EADDRNOTAVAIL" || error.code === "EAFNOSUPPORT")),
    );
    server.listen(port, host, () => server.close(() => resolvePromise(true)));
  });
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
