import { spawn } from "node:child_process";
import { realpathSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { connect } from "node:net";
import { homedir } from "node:os";
import { dirname, join, posix, win32 } from "node:path";
import { fileURLToPath } from "node:url";
import { socketStream } from "@arcue/platform-node";
import type { BridgeInfo, CoreClient, LaunchInfo, Peer } from "@arcue/protocol";
import {
  BRIDGE_INFO_FILE,
  bridgeInfoSchema,
  connectBridge,
  createPeer,
  createRemoteClient,
  framedChannel,
  HANDSHAKE_MAX_FRAME_BYTES,
  jsonFrameCodec,
  LAUNCH_INFO_FILE,
  launchInfoSchema,
} from "@arcue/protocol";

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

export interface AppConnection {
  client: CoreClient;
  info: BridgeInfo;
  close(): void;
}

const timer = (delayMs: number, callback: () => void) => {
  const handle = setTimeout(callback, delayMs);
  return () => clearTimeout(handle);
};

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}

export async function readBridgeInfo(userData: string): Promise<BridgeInfo | null> {
  const parsed = bridgeInfoSchema.safeParse(await readJson(join(userData, BRIDGE_INFO_FILE)));
  return parsed.success ? parsed.data : null;
}

export async function readLaunchInfo(userData: string): Promise<LaunchInfo | null> {
  const parsed = launchInfoSchema.safeParse(await readJson(join(userData, LAUNCH_INFO_FILE)));
  return parsed.success ? parsed.data : null;
}

/** Connects to the running app's core and presents the token; null when nothing listens on the socket. */
export async function connectToApp(userData: string, handshakeMs = 5000): Promise<AppConnection | null> {
  const info = await readBridgeInfo(userData);
  if (!info) return null;
  const socket = connect(info.socket);
  const opened = await new Promise<boolean>((resolve) => {
    socket.once("connect", () => resolve(true));
    socket.once("error", () => resolve(false));
  });
  if (!opened) {
    socket.destroy();
    return null;
  }
  const channel = framedChannel(socketStream(socket), jsonFrameCodec, {
    firstFrameMaxBytes: HANDSHAKE_MAX_FRAME_BYTES,
  });
  const endpoint = await connectBridge(channel, {
    token: info.token,
    timeout: { ms: handshakeMs, setTimer: timer },
  });
  const peer: Peer = createPeer(endpoint);
  return {
    client: createRemoteClient(peer),
    info,
    close: () => {
      peer.close();
      socket.destroy();
    },
  };
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

/** Starts the given app, or else the one `launch.json` recorded, detached from this process. */
export async function launchApp(userData: string, app: LaunchInfo | null): Promise<boolean> {
  const launch = app ?? (await readLaunchInfo(userData));
  if (!launch) return false;
  const child = spawn(launch.command, launch.args, {
    detached: true,
    stdio: "ignore",
    env: appEnvironment(process.env),
  });
  child.on("error", () => undefined);
  child.unref();
  return true;
}

export interface ConnectOrLaunchOptions {
  timeoutMs?: number;
  pollMs?: number;
  /** The app to start when none runs. Defaults to the app this command line ships in. */
  app?: LaunchInfo | null;
}

/**
 * Connects to the app, starting it first when nothing listens, and waits up to `timeoutMs` for its socket. A refused
 * handshake is retried too, since a starting core writes its new `bridge.json` only after it listens.
 */
export async function connectOrLaunch(
  userData: string,
  { timeoutMs = 30_000, pollMs = 200, app = bundledApp() }: ConnectOrLaunchOptions = {},
): Promise<AppConnection> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown = null;
  const attempt = () =>
    connectToApp(userData).catch((error: unknown) => {
      lastError = error;
      return null;
    });
  const first = await attempt();
  if (first) return first;
  if (lastError === null && !(await launchApp(userData, app))) {
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
