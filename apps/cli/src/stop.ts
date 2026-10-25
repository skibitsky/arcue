import { connect } from "node:net";
import { setTimeout as sleep } from "node:timers/promises";
import type { CoreConnection } from "@arcue/platform-node";
import { connectToCore, isRunning, readBridgeInfo, waitForStarts } from "@arcue/platform-node";
import type { BridgeInfo, CoreKind } from "@arcue/protocol";
import { ArcueError } from "@arcue/protocol";
import { userDataDir } from "./app-connection";
import type { Output, RunOptions } from "./run";

const STOP_TIMEOUT_MS = 30_000;
const POLL_MS = 100;
/** How long a process may linger once its bridge file and socket are gone, as a zombie or a reused pid. */
const LINGER_MS = 10_000;
const NOTHING_LISTENS = new Set(["ENOENT", "ECONNREFUSED", "ENOTSOCK"]);

/**
 * Stops Arcue in the browser: asks the core at `serve.json` to stop and waits until it has, or stops an older
 * `arcue serve` at `bridge.json` with SIGTERM where the system allows it. It never stops the desktop app.
 */
export async function stopServe(env: NodeJS.ProcessEnv, output: Output, options: RunOptions): Promise<number> {
  const userData = userDataDir(env);
  const stopped = await stopRunning(userData, output, options);
  if (stopped !== null) return stopped;
  await waitForStarts(userData);
  const afterStart = await stopRunning(userData, output, options);
  if (afterStart !== null) return afterStart;
  output.out("Arcue is not running in a browser.\n");
  return 0;
}

/** Stops the Arcue in the browser that runs and returns the exit code, or null when none runs. */
async function stopRunning(userData: string, output: Output, options: RunOptions): Promise<number | null> {
  const timeoutMs = options.stopTimeoutMs ?? STOP_TIMEOUT_MS;
  const connection = await connectOrRefuse(userData, "serve", output);
  if (connection === "refused") return 1;
  if (connection) {
    const { info } = connection;
    try {
      await connection.client.execute("serve.stop", {});
    } catch (error) {
      if (!(error instanceof ArcueError && error.code === "disconnected")) throw error;
    } finally {
      connection.close();
    }
    if (await waitStopped(userData, "serve", info, timeoutMs)) {
      output.out(`Stopped Arcue in the browser at ${info.url} (process ${info.pid}).\n`);
      return 0;
    }
    output.out(`Arcue in the browser (process ${info.pid}) did not stop within ${seconds(timeoutMs)} seconds.\n`);
    return 1;
  }

  const older = await readBridgeInfo(userData, "desktop");
  if (!older || !isOlderServe(older)) return null;
  const olderConnection = await connectOrRefuse(userData, "desktop", output);
  if (olderConnection === "refused") return 1;
  if (!olderConnection) return null;
  olderConnection.close();
  const { info } = olderConnection;
  if (!isOlderServe(info)) return null;
  if ((options.platform ?? process.platform) === "win32") {
    output.out(
      `The arcue serve at ${info.url} (process ${info.pid}) is older than this arcue command and cannot be stopped by it. Stop it where it runs.\n`,
    );
    return 1;
  }
  const signal = options.signal ?? ((pid, name) => process.kill(pid, name));
  try {
    signal(info.pid, "SIGTERM");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
  }
  if (await waitStopped(userData, "desktop", info, timeoutMs)) {
    output.out(`Stopped the older arcue serve at ${info.url} (process ${info.pid}).\n`);
    return 0;
  }
  output.out(`Arcue in the browser (process ${info.pid}) did not stop within ${seconds(timeoutMs)} seconds.\n`);
  return 1;
}

/** An `arcue serve` from before cores ran side by side, which wrote `bridge.json` with its address and no kind. */
function isOlderServe(info: BridgeInfo): boolean {
  return info.url !== undefined && info.kind === undefined;
}

/** Connects to the core in the bridge file of `kind`, or says that it does not answer. */
async function connectOrRefuse(
  userData: string,
  kind: CoreKind,
  output: Output,
): Promise<CoreConnection | null | "refused"> {
  try {
    return await connectToCore(userData, kind);
  } catch (error) {
    const info = await readBridgeInfo(userData, kind);
    const where = info ? ` at ${info.url} (process ${info.pid})` : "";
    const message = error instanceof Error ? error.message : String(error);
    output.out(`Arcue in the browser${where} does not answer, so it was not stopped: ${message}\n`);
    return "refused";
  }
}

/**
 * Waits until the core's process has ended. Once its bridge file no longer names it and nothing listens on its socket,
 * a process that lingers with its pid, as a zombie or a pid used again, counts as stopped after a while.
 */
async function waitStopped(userData: string, kind: CoreKind, info: BridgeInfo, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  let goneSince: number | null = null;
  for (;;) {
    if (!isRunning(info.pid)) return true;
    if (goneSince === null) {
      const current = await readBridgeInfo(userData, kind);
      if (current?.token !== info.token && !(await listens(info.socket))) goneSince = Date.now();
    } else if (Date.now() - goneSince >= LINGER_MS) {
      return true;
    }
    if (Date.now() >= deadline) return false;
    await sleep(POLL_MS);
  }
}

/** Whether something accepts connections on the socket. */
function listens(socket: string): Promise<boolean> {
  return new Promise((resolve) => {
    const connection = connect(socket);
    connection.once("connect", () => {
      connection.destroy();
      resolve(true);
    });
    connection.once("error", (error: NodeJS.ErrnoException) => {
      connection.destroy();
      resolve(!NOTHING_LISTENS.has(error.code ?? ""));
    });
  });
}

function seconds(ms: number): number {
  return Math.round(ms / 1000);
}
