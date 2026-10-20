import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { CoreConnection } from "@arcue/platform-node";
import { connectToCore } from "@arcue/platform-node";
import type { LaunchInfo } from "@arcue/protocol";
import { LAUNCH_INFO_FILE, launchInfoSchema } from "@arcue/protocol";

/** The app's data folder: `ARCUE_USER_DATA` when set, otherwise where Electron keeps an app named "Arcue". */
export function userDataDir(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  home: string = homedir(),
): string {
  if (env.ARCUE_USER_DATA) return env.ARCUE_USER_DATA;
  if (platform === "darwin") return join(home, "Library", "Application Support", "Arcue");
  if (platform === "win32") return join(env.APPDATA ?? join(home, "AppData", "Roaming"), "Arcue");
  return join(env.XDG_CONFIG_HOME ?? join(home, ".config"), "Arcue");
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

/** Starts the app the way `launch.json` recorded, detached from this process. */
export async function launchApp(userData: string): Promise<boolean> {
  const launch = await readLaunchInfo(userData);
  if (!launch) return false;
  const child = spawn(launch.command, launch.args, { detached: true, stdio: "ignore" });
  child.on("error", () => undefined);
  child.unref();
  return true;
}

export interface ConnectOrLaunchOptions {
  timeoutMs?: number;
  pollMs?: number;
}

/**
 * Connects to the app, starting it first when nothing listens, and waits up to `timeoutMs` for its socket. A refused
 * handshake is retried too, since a starting core writes its new `bridge.json` only after it listens.
 */
export async function connectOrLaunch(
  userData: string,
  { timeoutMs = 30_000, pollMs = 200 }: ConnectOrLaunchOptions = {},
): Promise<CoreConnection> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown = null;
  const attempt = () =>
    connectToCore(userData).catch((error: unknown) => {
      lastError = error;
      return null;
    });
  const first = await attempt();
  if (first) return first;
  if (lastError === null && !(await launchApp(userData))) {
    throw new Error(
      'Arcue is not running, and it has not been started on this computer yet. Start it once first, or run "arcue serve" to use it in a browser.',
    );
  }
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, pollMs));
    const connection = await attempt();
    if (connection) return connection;
  }
  if (lastError instanceof Error) throw lastError;
  throw new Error(`Arcue did not start within ${Math.round(timeoutMs / 1000)} seconds.`);
}
