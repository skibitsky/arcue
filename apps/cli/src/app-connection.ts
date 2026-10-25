import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import type { CoreConnection } from "@arcue/platform-node";
import { connectToCore } from "@arcue/platform-node";
import type { LaunchInfo } from "@arcue/protocol";
import { LAUNCH_INFO_FILE, launchInfoSchema } from "@arcue/protocol";

/**
 * The app's data folder: `ARCUE_USER_DATA` when set, resolved against the working folder, otherwise where Electron
 * keeps an app named "Arcue".
 */
export function userDataDir(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  home: string = homedir(),
): string {
  if (env.ARCUE_USER_DATA) return resolve(env.ARCUE_USER_DATA);
  if (platform === "darwin") return join(home, "Library", "Application Support", "Arcue");
  if (platform === "win32") return join(env.APPDATA ?? join(home, "AppData", "Roaming"), "Arcue");
  return join(env.XDG_CONFIG_HOME ?? join(home, ".config"), "Arcue");
}

/** What `arcue open` says when nothing runs and the desktop app has never started on this computer. */
export const NOT_STARTED =
  "Arcue is not running, and the Arcue app has not been started on this computer yet. Start the app once, or run arcue serve --detach to use Arcue in a browser.";

/** Whether the app that `launch.json` names started: its process spawned, or why it did not. */
export type Launch = { launched: true } | { launched: false; command: string; reason: string };

/** What `arcue open` says when the app that `launch.json` names did not start. */
export function launchFailed({ command, reason }: { command: string; reason: string }): string {
  return `The Arcue app could not be started from ${command}: ${reason}. Start it from where it is installed, or run arcue serve --detach to use Arcue in a browser.`;
}

/** What `arcue open` says when the app it started did not answer in time. */
export function didNotStart(timeoutMs: number): string {
  return `Arcue did not start within ${Math.round(timeoutMs / 1000)} seconds. Start the app from where it is installed, or run arcue serve --detach to use Arcue in a browser.`;
}

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}

export async function readLaunchInfo(userData: string): Promise<LaunchInfo | null> {
  const parsed = launchInfoSchema.safeParse(await readJson(join(userData, LAUNCH_INFO_FILE)));
  return parsed.success ? parsed.data : null;
}

/**
 * Starts the app the way `launch.json` recorded, detached from this process, and settles once its process has spawned
 * or failed to. Null without `launch.json`.
 */
export async function launchApp(userData: string): Promise<Launch | null> {
  const launch = await readLaunchInfo(userData);
  if (!launch) return null;
  const failed = (error: unknown): Launch => ({
    launched: false,
    command: launch.command,
    reason: error instanceof Error ? error.message : String(error),
  });
  let child: ChildProcess;
  try {
    child = spawn(launch.command, launch.args, { detached: true, stdio: "ignore" });
  } catch (error) {
    return failed(error);
  }
  return new Promise((resolvePromise) => {
    child.on("error", (error) => resolvePromise(failed(error)));
    child.once("spawn", () => {
      child.unref();
      resolvePromise({ launched: true });
    });
  });
}

export interface ConnectOrLaunchOptions {
  timeoutMs?: number;
  pollMs?: number;
}

/**
 * Connects to the app at `bridge.json`, starting it first when nothing listens, and waits up to `timeoutMs` for its
 * socket. A refused handshake is retried too, since a starting core writes its new `bridge.json` only after it listens.
 * Throws at once when the app has never started on this computer, or when its process does not spawn.
 */
export async function connectOrLaunch(userData: string, options: ConnectOrLaunchOptions = {}): Promise<CoreConnection> {
  let refused: unknown = null;
  const first = await connectToCore(userData, "desktop").catch((error: unknown) => {
    refused = error;
    return null;
  });
  if (first) return first;
  if (refused === null) {
    const launch = await launchApp(userData);
    if (launch === null) throw new Error(NOT_STARTED);
    if (!launch.launched) throw new Error(launchFailed(launch));
  }
  return waitForApp(userData, options, refused);
}

/** Waits up to `timeoutMs` for the app that was just started to answer at `bridge.json`, retrying refused handshakes. */
export async function waitForApp(
  userData: string,
  { timeoutMs = 30_000, pollMs = 200 }: ConnectOrLaunchOptions = {},
  refused: unknown = null,
): Promise<CoreConnection> {
  const deadline = Date.now() + timeoutMs;
  let lastError = refused;
  while (Date.now() < deadline) {
    await sleep(pollMs);
    const connection = await connectToCore(userData, "desktop").catch((error: unknown) => {
      lastError = error;
      return null;
    });
    if (connection) return connection;
  }
  if (lastError instanceof Error) throw lastError;
  throw new Error(didNotStart(timeoutMs));
}
