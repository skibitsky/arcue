import { randomBytes } from "node:crypto";
import { chmod, lstat, mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import type { Server, Socket } from "node:net";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ArcueCore } from "@arcue/core";
import type { BridgeInfo, ListenerErrorHandler, MessageEndpoint } from "@arcue/protocol";
import {
  acceptBridge,
  BRIDGE_INFO_FILE,
  framedChannel,
  HANDSHAKE_MAX_FRAME_BYTES,
  isEnvelope,
  jsonFrameCodec,
} from "@arcue/protocol";
import { socketStream } from "./node-socket";

export interface BridgeServerOptions {
  core: ArcueCore;
  userData: string;
  /** Resolves once a window is open, so an "asset.open" from the command line has a window to show it in. */
  ensureWindow: () => Promise<void>;
  onError: ListenerErrorHandler;
  handshakeTimeoutMs?: number;
}

export interface BridgeServer {
  readonly info: BridgeInfo;
  close(): Promise<void>;
}

/** macOS limits a Unix socket path to 104 bytes, Linux to 108. */
const MAX_SOCKET_PATH = 100;
const SOCKET_NAME = "arcue.sock";

export interface BridgeAddress {
  socket: string;
  /** Removes what listening on the address left behind. */
  remove(): Promise<void>;
}

/**
 * Where the core listens, reachable only by this user: a Unix domain socket in a folder only the user can enter, or a
 * named pipe with a new random name on each start, since any user can see pipe names. `bridge.json` names it.
 */
export async function bridgeAddress(
  userData: string,
  platform: NodeJS.Platform = process.platform,
): Promise<BridgeAddress> {
  if (platform === "win32") {
    return { socket: `\\\\.\\pipe\\arcue-${randomBytes(16).toString("hex")}`, remove: async () => undefined };
  }
  const inside = join(userData, "bridge");
  if (Buffer.byteLength(join(inside, SOCKET_NAME)) <= MAX_SOCKET_PATH) {
    await privateFolder(inside);
    const socket = join(inside, SOCKET_NAME);
    await rm(socket, { force: true });
    return { socket, remove: () => rm(socket, { force: true }) };
  }
  const folder = await mkdtemp(join(process.env.XDG_RUNTIME_DIR || tmpdir(), "arcue-"));
  return { socket: join(folder, SOCKET_NAME), remove: () => rm(folder, { recursive: true, force: true }) };
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
 */
export async function startBridgeServer(options: BridgeServerOptions): Promise<BridgeServer> {
  const infoPath = join(options.userData, BRIDGE_INFO_FILE);
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
  try {
    await listen(server, address.socket);
  } catch (error) {
    await address.remove();
    throw error;
  }
  const info: BridgeInfo = { version: 1, socket: address.socket, token, pid: process.pid };
  const temporary = `${infoPath}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(info)}\n`, { mode: 0o600 });
  await rename(temporary, infoPath);
  return {
    info,
    async close() {
      const closed = new Promise<void>((resolve) => server.close(() => resolve()));
      for (const connection of open) connection.destroy();
      await closed;
      await rm(infoPath, { force: true });
      await address.remove();
    },
  };
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

/** Holds back an "asset.open" request until a window is open, keeping every message in order. */
export function windowFirst(endpoint: MessageEndpoint, ensureWindow: () => Promise<void>): MessageEndpoint {
  return {
    post: (message, transfer) => endpoint.post(message, transfer),
    onClose: (listener) => endpoint.onClose(listener),
    listen(listener) {
      let queue = Promise.resolve();
      return endpoint.listen((message) => {
        queue = queue.then(async () => {
          if (isEnvelope(message) && message.type === "request" && message.name === "asset.open") {
            await ensureWindow().catch(() => undefined);
          }
          listener(message);
        });
      });
    },
  };
}
