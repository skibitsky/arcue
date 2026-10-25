import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { realpathSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, posix, resolve, win32 } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import type { CoreConnection } from "@arcue/platform-node";
import { connectToCore } from "@arcue/platform-node";
import type { LaunchInfo } from "@arcue/protocol";
import { ArcueError, LAUNCH_INFO_FILE, launchInfoSchema } from "@arcue/protocol";

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
export type Launch = ({ launched: true } & StartedApp) | { launched: false; command: string; reason: string };

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

/** What runs the command line: the Node, or the Electron running as Node, and the folder of the script. */
export interface Runtime {
  execPath: string;
  /** Electron's version, when an Electron app runs the command line as Node. */
  electron: string | undefined;
  scriptDir: string;
  platform: NodeJS.Platform;
}

const realPath = (path: string) => {
  try {
    return realpathSync.native(path);
  } catch {
    return path;
  }
};

const currentRuntime = (): Runtime => ({
  execPath: realPath(process.execPath),
  electron: process.versions.electron,
  scriptDir: realPath(dirname(fileURLToPath(import.meta.url))),
  platform: process.platform,
});

/**
 * The Arcue app this command line ships in, when that app's Electron runs it as Node, as the `arcue` command in the
 * app's `bin` folder does: from `resources/cli`, or from `Contents/Resources/cli` on macOS.
 */
export function bundledApp(runtime: Runtime = currentRuntime()): LaunchInfo | null {
  if (!runtime.electron) return null;
  const path = runtime.platform === "win32" ? win32 : posix;
  const executableDir = path.dirname(runtime.execPath);
  const cli =
    runtime.platform === "darwin"
      ? path.join(executableDir, "..", "Resources", "cli")
      : path.join(executableDir, "resources", "cli");
  if (path.relative(cli, runtime.scriptDir) !== "") return null;
  return { version: 1, command: runtime.execPath, args: [] };
}

/** The environment the app starts in: this one without `ELECTRON_RUN_AS_NODE`, which would start it as Node. */
export function appEnvironment(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(env).filter(([name]) => name.toUpperCase() !== "ELECTRON_RUN_AS_NODE"));
}

/** An app that `launchApp` started. */
export interface StartedApp {
  /**
   * Why the app could not start, or quit with an error before it answered. Null while it runs, and after it quit
   * with 0, as a second instance does once it hands its files to the running one.
   */
  failure(): Error | null;
}

/**
 * Starts the bundled app or the one `launch.json` recorded, detached from this process, and settles once its process
 * has spawned or failed to. Null when neither app is available.
 */
export async function launchApp(userData: string, app: LaunchInfo | null = bundledApp()): Promise<Launch | null> {
  const launch = app ?? (await readLaunchInfo(userData));
  if (!launch) return null;
  const failed = (error: unknown): Launch => ({
    launched: false,
    command: launch.command,
    reason: error instanceof Error ? error.message : String(error),
  });
  let failure: Error | null = null;
  let child: ChildProcess;
  try {
    child = spawn(launch.command, launch.args, { detached: true, stdio: "ignore", env: appEnvironment(process.env) });
  } catch (error) {
    return failed(error);
  }
  return new Promise((resolvePromise) => {
    child.on("error", (error) => {
      const result = failed(error);
      if (!result.launched) failure ??= new Error(launchFailed(result));
      resolvePromise(result);
    });
    child.once("exit", (code, signal) => {
      if (code === 0) return;
      const status = signal ? `signal ${signal}` : `exit code ${code}`;
      failure ??= new Error(
        `Arcue quit as it started (${status}). Run arcue serve --detach to use Arcue in a browser.`,
      );
    });
    child.once("spawn", () => {
      child.unref();
      resolvePromise({ launched: true, failure: () => failure });
    });
  });
}

export interface ConnectOrLaunchOptions {
  timeoutMs?: number;
  pollMs?: number;
  handshakeMs?: number;
  app?: LaunchInfo | null;
}

/**
 * Connects to the app at `bridge.json`, starting it first when nothing listens, and waits up to `timeoutMs` for its
 * socket. A refused handshake is retried too, since a starting core writes its new `bridge.json` only after it listens.
 * Throws at once when the app has never started on this computer, or when its process does not spawn.
 */
export async function connectOrLaunch(userData: string, options: ConnectOrLaunchOptions = {}): Promise<CoreConnection> {
  let refused: unknown = null;
  const first = await connectToCore(userData, "desktop", options.handshakeMs).catch((error: unknown) => {
    refused = error;
    return null;
  });
  if (first) return first;
  let started: StartedApp | null = null;
  if (refused === null) {
    const launch = await launchApp(userData, options.app);
    if (launch === null) throw new Error(NOT_STARTED);
    if (!launch.launched) throw new Error(launchFailed(launch));
    started = launch;
  }
  return waitForApp(userData, options, refused, started);
}

/** Waits up to `timeoutMs` for the app that was just started to answer at `bridge.json`, retrying refused handshakes. */
export async function waitForApp(
  userData: string,
  { timeoutMs = 30_000, pollMs = 200, handshakeMs = 5000 }: ConnectOrLaunchOptions = {},
  refused: unknown = null,
  started: StartedApp | null = null,
): Promise<CoreConnection> {
  const deadline = Date.now() + timeoutMs;
  let lastError = refused;
  while (Date.now() < deadline) {
    await sleep(pollMs);
    const failure = started?.failure();
    if (failure) throw failure;
    const connection = await connectToCore(userData, "desktop", handshakeMs).catch((error: unknown) => {
      lastError = error;
      return null;
    });
    if (connection) return connection;
  }
  if (lastError instanceof Error) {
    const message = `${lastError.message} Quit Arcue and open it again, or run arcue serve --detach to use Arcue in a browser.`;
    throw lastError instanceof ArcueError
      ? new ArcueError(lastError.code, message, { cause: lastError })
      : new Error(message, { cause: lastError });
  }
  throw new Error(didNotStart(timeoutMs));
}
