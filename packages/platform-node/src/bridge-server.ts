import { randomBytes } from "node:crypto";
import { chmod, lstat, mkdir, mkdtemp, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import type { Server, Socket } from "node:net";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ArcueCore } from "@arcue/core";
import type { BridgeInfo, ListenerErrorHandler, MessageEndpoint } from "@arcue/protocol";
import {
  acceptBridge,
  bridgeInfoFile,
  framedChannel,
  HANDSHAKE_MAX_FRAME_BYTES,
  isEnvelope,
  jsonFrameCodec,
  LOCK_PROTOCOL,
  viewNameSchema,
} from "@arcue/protocol";
import { listens, readBridgeFile } from "./core-connection";
import { isRunning } from "./file-lock";
import { writeLastCore } from "./last-core";
import { socketStream } from "./node-socket";
import type { StartClaim } from "./start-claim";
import { claimStart, takeStartLock } from "./start-claim";

interface CommonBridgeOptions {
  core: ArcueCore;
  userData: string;
  /**
   * Resolves once a window is open that may show a model the command line opens for an agent session's view, or with
   * null for none, so the core has a window to show it in. A host whose views' pages only the agent can open resolves
   * at once for a view, and the core holds the model for the page.
   */
  ensureWindow: (view: string | null) => Promise<void>;
  /** Called for each connection that presents the token, before it is served. */
  onConnection?: () => void;
  onError: ListenerErrorHandler;
  handshakeTimeoutMs?: number;
  /** The start lock the host already holds, which the server lets go once its bridge file is written. */
  claim?: StartClaim;
}

export type BridgeServerOptions = CommonBridgeOptions &
  (
    | {
        kind: "desktop";
        /** Where a browser shows this core's window, when one does. */
        url?: string;
      }
    | {
        kind: "serve";
        /** Where a browser shows this core's pages, for `serve.json`. */
        url: string;
        /** Which arcue.js runs the core: the first 16 hex digits of its SHA-256. */
        build?: string;
      }
  );

export interface BridgeServer {
  readonly info: BridgeInfo;
  /**
   * Writes the bridge file again, under the start lock, when it is gone or names a core that no longer listens. It
   * leaves the file of another core that listens, and never rejects.
   */
  rewriteInfo(): Promise<void>;
  /** Whether the bridge file names this server, another core that listens, or neither. */
  holdsInfo(): Promise<"own" | "other-live" | "missing">;
  /**
   * Stops listening and ends the open connections, then removes the bridge file while it still names this server. A
   * rewrite that runs meanwhile leaves no file behind.
   */
  close(): Promise<void>;
}

const REWRITE_TIMEOUT_MS = 2_000;

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
 * named pipe with a new random name on each start, since any user can see pipe names. Its core's bridge file names it:
 * `bridge.json` for the desktop app, `serve.json` for Arcue in the browser.
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

async function privateFolder(path: string): Promise<void> {
  await mkdir(path, { recursive: true, mode: 0o700 });
  const stats = await lstat(path);
  if (!stats.isDirectory() || stats.uid !== process.getuid?.()) {
    throw new Error(`${path} is not a folder this user owns.`);
  }
  await chmod(path, 0o700);
}

/**
 * Listens for the command line on a local socket. Each connection must present the token from the core's bridge file,
 * `bridge.json` for the desktop app and `serve.json` for Arcue in the browser, which only the user can read, and is
 * then served with the caller "bridge", so internal commands are refused. A hello that names a user makes that user
 * the author of what the connection does.
 *
 * Cores of both kinds run side by side on one data folder, since both take the review locks. Each kind refuses only a
 * second core of its own kind, or a core that takes no review locks: it checks under the start lock, which it holds
 * until its bridge file is written, and throws a `CoreRunningError` that leaves the other core's file alone.
 */
export async function startBridgeServer(options: BridgeServerOptions): Promise<BridgeServer> {
  const claim = options.claim ?? (await claimStart(options.userData, options.kind));
  try {
    return await listenForBridges(options);
  } finally {
    await claim.release();
  }
}

async function listenForBridges(options: BridgeServerOptions): Promise<BridgeServer> {
  const { userData, kind } = options;
  const infoPath = join(userData, bridgeInfoFile(kind));
  await rm(infoPath, { force: true });
  const address = await bridgeAddress(userData);
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
        options.onConnection?.();
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
    kind,
    locks: LOCK_PROTOCOL,
    ...(options.kind === "serve" && options.build !== undefined ? { build: options.build } : {}),
  };
  try {
    await writeBridgeFile(infoPath, info);
  } catch (error) {
    await stopListening();
    await address.remove();
    throw error;
  }
  await writeLastCore(userData, kind, options.url);

  const holdsInfo = async (): Promise<"own" | "other-live" | "missing"> => {
    const current = await readBridgeFile(infoPath);
    if (current?.token === token) return "own";
    return current && (await listens(current, options.handshakeTimeoutMs)) ? "other-live" : "missing";
  };
  let closing: Promise<void> | null = null;
  let writing: Promise<void> | null = null;
  return {
    info,
    holdsInfo,
    async rewriteInfo() {
      if (closing || !(await stat(userData).catch(() => null))) return;
      const release = await takeStartLock(userData, REWRITE_TIMEOUT_MS).catch(() => null);
      if (!release) return;
      try {
        if (!closing && (await holdsInfo()) === "missing" && !closing) {
          writing = writeBridgeFile(infoPath, info);
          await writing;
        }
      } catch (error) {
        options.onError(error);
      } finally {
        writing = null;
        await release();
      }
    },
    close() {
      closing ??= (async () => {
        await stopListening();
        await writing?.catch(() => undefined);
        if ((await readBridgeFile(infoPath))?.token === token) await rm(infoPath, { force: true });
        await address.remove();
      })();
      return closing;
    },
  };
}

/** Writes a bridge file that only the user can read, through a temporary file so that no reader sees half of it. */
async function writeBridgeFile(path: string, info: BridgeInfo): Promise<void> {
  const temporary = `${path}.${process.pid}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(info)}\n`, { mode: 0o600 });
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
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
