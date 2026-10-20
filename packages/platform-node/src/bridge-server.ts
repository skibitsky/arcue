import { randomBytes } from "node:crypto";
import { chmod, lstat, mkdir, mkdtemp, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import type { Server, Socket } from "node:net";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ArcueCore } from "@arcue/core";
import type { BridgeInfo, ListenerErrorHandler, MessageEndpoint } from "@arcue/protocol";
import {
  ArcueError,
  acceptBridge,
  BRIDGE_INFO_FILE,
  bridgeInfoSchema,
  framedChannel,
  HANDSHAKE_MAX_FRAME_BYTES,
  isEnvelope,
  jsonFrameCodec,
  viewNameSchema,
} from "@arcue/protocol";
import { runningCore } from "./core-connection";
import { socketStream } from "./node-socket";

export interface BridgeServerOptions {
  core: ArcueCore;
  userData: string;
  /**
   * Resolves once a window is open that may show a model the command line opens for an agent session's view, or with
   * null for none, so the core has a window to show it in. A host whose views' pages only the agent can open resolves
   * at once for a view, and the core holds the model for the page.
   */
  ensureWindow: (view: string | null) => Promise<void>;
  onError: ListenerErrorHandler;
  handshakeTimeoutMs?: number;
  /** Where a browser shows this core's window, for `bridge.json`. */
  url?: string;
}

export interface BridgeServer {
  readonly info: BridgeInfo;
  close(): Promise<void>;
}

/** Another core answers at `bridge.json`. */
export class CoreRunningError extends ArcueError {
  readonly running: BridgeInfo;

  constructor(running: BridgeInfo) {
    const where = running.url ? ` at ${running.url}` : "";
    super("conflict", `Arcue is already running${where} (process ${running.pid}).`);
    this.running = running;
  }
}

/** macOS limits a Unix socket path to 104 bytes, Linux to 108. */
const MAX_SOCKET_PATH = 100;
const SOCKET_NAME = /^arcue-(\d+)-[0-9a-f]+\.sock$/;

export interface BridgeAddress {
  socket: string;
  /** Removes what listening on the address left behind. */
  remove(): Promise<void>;
}

/**
 * Where the core listens, reachable only by this user: a Unix domain socket in a folder only the user can enter, or a
 * named pipe with a new random name on each start, since any user can see pipe names. `bridge.json` names it.
 *
 * Each server gets its own socket, named after its process, so a closing server removes only its own. Sockets of
 * processes that have ended are removed.
 */
export async function bridgeAddress(
  userData: string,
  platform: NodeJS.Platform = process.platform,
  pid: number = process.pid,
): Promise<BridgeAddress> {
  if (platform === "win32") {
    return { socket: `\\\\.\\pipe\\arcue-${randomBytes(16).toString("hex")}`, remove: async () => undefined };
  }
  const name = `arcue-${pid}-${randomBytes(3).toString("hex")}.sock`;
  const inside = join(userData, "bridge");
  if (Buffer.byteLength(join(inside, name)) <= MAX_SOCKET_PATH) {
    await privateFolder(inside);
    await removeEndedSockets(inside);
    const socket = join(inside, name);
    await rm(socket, { force: true });
    return { socket, remove: () => rm(socket, { force: true }) };
  }
  const folder = await mkdtemp(join(process.env.XDG_RUNTIME_DIR || tmpdir(), "arcue-"));
  return { socket: join(folder, name), remove: () => rm(folder, { recursive: true, force: true }) };
}

async function removeEndedSockets(folder: string): Promise<void> {
  for (const entry of await readdir(folder)) {
    const pid = Number(SOCKET_NAME.exec(entry)?.[1]);
    if (pid > 0 && !isRunning(pid)) await rm(join(folder, entry), { force: true });
  }
}

function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

async function privateFolder(path: string): Promise<void> {
  await mkdir(path, { recursive: true, mode: 0o700 });
  const stats = await lstat(path);
  if (!stats.isDirectory() || stats.uid !== process.getuid?.()) {
    throw new Error(`${path} is not a folder this user owns.`);
  }
  await chmod(path, 0o700);
}

/**
 * Listens for the command line on a local socket. Each connection must present the token from `bridge.json`, which
 * only the user can read, and is then served with the caller "bridge", so internal commands are refused. A hello
 * that names a user makes that user the author of what the connection does.
 *
 * Only one core may run for a data folder, since two would overwrite each other's review files. While another core
 * answers at `bridge.json`, this throws a `CoreRunningError` and leaves that core's file alone.
 */
export async function startBridgeServer(options: BridgeServerOptions): Promise<BridgeServer> {
  const infoPath = join(options.userData, BRIDGE_INFO_FILE);
  await mkdir(options.userData, { recursive: true, mode: 0o700 });
  const running = await runningCore(options.userData);
  if (running) throw new CoreRunningError(running);
  await rm(infoPath, { force: true });
  const address = await bridgeAddress(options.userData);
  const token = randomBytes(32).toString("base64url");
  let next = 1;
  const open = new Set<Socket>();
  const server = createServer((connection) => {
    open.add(connection);
    connection.once("close", () => open.delete(connection));
    const channel = framedChannel(socketStream(connection), jsonFrameCodec, {
      firstFrameMaxBytes: HANDSHAKE_MAX_FRAME_BYTES,
    });
    acceptBridge(channel, {
      token,
      timeout: { ms: options.handshakeTimeoutMs ?? 5000, setTimer: unrefTimer },
    }).then(
      ({ endpoint, user }) => {
        options.core.connect(windowFirst(endpoint, options.ensureWindow), {
          connection: `bridge-${next++}`,
          caller: "bridge",
          user: () => user,
          onListenerError: options.onError,
        });
      },
      (error: unknown) => options.onError(error),
    );
  });
  server.on("error", options.onError);
  const stopListening = async () => {
    const closed = new Promise<void>((resolve) => server.close(() => resolve()));
    for (const connection of open) connection.destroy();
    await closed;
  };
  try {
    await listen(server, address.socket);
  } catch (error) {
    await address.remove();
    throw error;
  }
  const info: BridgeInfo = {
    version: 1,
    socket: address.socket,
    token,
    pid: process.pid,
    ...(options.url !== undefined ? { url: options.url } : {}),
  };
  const temporary = `${infoPath}.${process.pid}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(info)}\n`, { mode: 0o600 });
    await rename(temporary, infoPath);
  } catch (error) {
    await stopListening();
    await address.remove();
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
  return {
    info,
    async close() {
      await stopListening();
      if ((await readBridgeFile(infoPath))?.token === token) await rm(infoPath, { force: true });
      await address.remove();
    },
  };
}

/** What `bridge.json` holds now. Another core may have written it since. */
async function readBridgeFile(path: string): Promise<BridgeInfo | null> {
  try {
    const parsed = bridgeInfoSchema.safeParse(JSON.parse(await readFile(path, "utf8")));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function listen(server: Server, path: string): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(path, () => {
      server.off("error", reject);
      resolve();
    });
  });
}

function unrefTimer(delayMs: number, callback: () => void): () => void {
  const handle = setTimeout(callback, delayMs);
  handle.unref();
  return () => clearTimeout(handle);
}

/**
 * Holds back a request that opens a model until a window that may show it is open, for the view the request names or
 * for none, keeping every message in order.
 */
export function windowFirst(
  endpoint: MessageEndpoint,
  ensureWindow: (view: string | null) => Promise<void>,
): MessageEndpoint {
  return {
    post: (message, transfer) => endpoint.post(message, transfer),
    onClose: (listener) => endpoint.onClose(listener),
    listen(listener) {
      let queue = Promise.resolve();
      return endpoint.listen((message) => {
        queue = queue.then(async () => {
          const view = openedView(message);
          if (view !== undefined) await ensureWindow(view).catch(() => undefined);
          listener(message);
        });
      });
    },
  };
}

/** The view a request that opens a model names: null for "asset.open", and undefined for any other message. */
function openedView(message: unknown): string | null | undefined {
  if (!isEnvelope(message) || message.type !== "request" || message.kind !== "command") return undefined;
  if (message.name === "asset.open") return null;
  if (message.name !== "asset.openInView" || typeof message.input !== "object" || message.input === null) {
    return undefined;
  }
  const view = viewNameSchema.safeParse((message.input as { view?: unknown }).view);
  return view.success ? view.data : undefined;
}
