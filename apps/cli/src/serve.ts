import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { extname, resolve, sep } from "node:path";
import type { Duplex } from "node:stream";
import { fileURLToPath } from "node:url";
import { ArcueCore } from "@arcue/core";
import type { BridgeServer } from "@arcue/platform-node";
import {
  fromNativePath,
  NodePlatform,
  startBridgeServer,
  startNodeImportWorker,
  systemClock,
  WindowPresence,
} from "@arcue/platform-node";
import type { ByteStream, ListenerErrorHandler } from "@arcue/protocol";
import { framedChannel, framedEndpoint, jsonFrameCodec, MAX_FRAME_BYTES, SERVE_CORE_PATH } from "@arcue/protocol";
import type { WebSocket } from "ws";
import { WebSocketServer } from "ws";
import { connectToApp } from "./app-connection";

/** The web UI the build writes beside `arcue.js`. */
export const bundledWebUi = fileURLToPath(new URL("./web/", import.meta.url));

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".wasm": "application/wasm",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

export interface ServeOptions {
  /** The app's data folder, shared with the desktop app. */
  userData: string;
  importWorkerEntry: string;
  /** The folder of the built web UI, with its `index.html`. */
  webUi: string;
  /** 0 picks a free port. */
  port: number;
  onError: ListenerErrorHandler;
  /** Called when the command line opens a model and no browser shows Arcue yet. */
  onWaitingForWindow?: () => void;
}

export interface ArcueServer {
  /** The address to open, such as "http://localhost:4530". */
  readonly url: string;
  close(): Promise<void>;
}

/**
 * Runs a core on this computer's files and serves its window to a browser on localhost, as the desktop app shows it in
 * its own window. The core takes the desktop app's place: it writes `bridge.json`, so `arcue open` and `arcue status`
 * reach it, and it refuses to start while another core runs.
 *
 * Only pages from this server's own origin can connect to the core, and only through a localhost address, so other
 * websites and DNS rebinding cannot reach it. Like any local web server, it is open to other programs on this computer
 * while it runs.
 */
export async function startServer(options: ServeOptions): Promise<ArcueServer> {
  const webUi = await realpath(options.webUi).catch(() => null);
  if (!webUi || !(await stat(resolve(webUi, "index.html")).catch(() => null))?.isFile()) {
    throw new Error(`This arcue has no web UI in ${options.webUi}.`);
  }
  const running = await connectToApp(options.userData).catch(() => null);
  if (running) {
    running.close();
    const where = running.info.url ? ` at ${running.info.url}` : "";
    throw new Error(`Arcue is already running${where} (process ${running.info.pid}). "arcue open" shows models there.`);
  }

  const { servers: http, port } = await listenLocally(options.port);
  const url = `http://localhost:${port}`;
  const hosts = localHosts(port);
  const allowed = (request: IncomingMessage) => hosts.has(request.headers.host?.toLowerCase() ?? "");

  const windows = new WindowPresence({
    requestWindow: () => options.onWaitingForWindow?.(),
    setTimer: systemClock.setTimer,
  });
  let core: ArcueCore | null = null;
  let bridge: BridgeServer;
  try {
    const platform = new NodePlatform({
      appDataDir: fromNativePath(options.userData),
      startImportWorker: () => startNodeImportWorker(options.importWorkerEntry, options.onError),
    });
    core = await ArcueCore.start({ platform, onError: options.onError });
    bridge = await startBridgeServer({
      core,
      userData: options.userData,
      ensureWindow: () => windows.ensure(),
      onError: options.onError,
      url,
    });
  } catch (error) {
    core?.dispose();
    await Promise.all(http.map((server) => closeServer(server)));
    throw error;
  }
  const started = core;

  const sockets = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME_BYTES + 4 });
  let next = 1;
  sockets.on("connection", (socket: WebSocket) => {
    const channel = framedChannel(webSocketStream(socket), jsonFrameCodec);
    const peer = started.connect(framedEndpoint(channel), {
      connection: `browser-${next++}`,
      caller: "window",
      onListenerError: options.onError,
    });
    windows.added();
    peer.onClose(() => {
      windows.removed();
      channel.close();
    });
  });

  for (const server of http) {
    server.on("request", (request: IncomingMessage, response: ServerResponse) => {
      if (!allowed(request)) return refuse(response, 403);
      if (request.method !== "GET" && request.method !== "HEAD") return refuse(response, 405);
      sendFile(webUi, request, response).catch((error: unknown) => {
        options.onError(error);
        if (!response.headersSent) refuse(response, 500);
        else response.destroy();
      });
    });
    server.on("upgrade", (request: IncomingMessage, socket: Duplex, head: Buffer) => {
      const path = URL.parse(request.url ?? "/", url)?.pathname;
      if (
        !allowed(request) ||
        path !== SERVE_CORE_PATH ||
        request.headers.origin !== `http://${request.headers.host}`
      ) {
        socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
        return;
      }
      sockets.handleUpgrade(request, socket, head, (connected) => sockets.emit("connection", connected, request));
    });
  }

  return {
    url,
    async close() {
      for (const client of sockets.clients) client.terminate();
      await Promise.all(http.map((server) => closeServer(server)));
      await bridge.close();
      await started.idle();
      started.dispose();
    },
  };
}

/** The Host headers a browser sends for this computer's own addresses, which leave out the default port 80. */
export function localHosts(port: number): Set<string> {
  const names = ["localhost", "127.0.0.1", "[::1]"];
  return new Set(port === 80 ? names : names.map((name) => `${name}:${port}`));
}

/** Listens on 127.0.0.1 and, where the computer has it, on ::1 too, since "localhost" may resolve to either. */
async function listenLocally(port: number): Promise<{ servers: Server[]; port: number }> {
  const first = createServer();
  try {
    await listen(first, port, "127.0.0.1");
  } catch (error) {
    if (isCode(error, "EADDRINUSE")) {
      throw new Error(`Port ${port} is in use. Choose another with --port.`);
    }
    throw error;
  }
  const bound = (first.address() as AddressInfo).port;
  const second = createServer();
  try {
    await listen(second, bound, "::1");
    return { servers: [first, second], port: bound };
  } catch (error) {
    if (isCode(error, "EADDRNOTAVAIL") || isCode(error, "EAFNOSUPPORT")) return { servers: [first], port: bound };
    first.close();
    if (isCode(error, "EADDRINUSE")) throw new Error(`Port ${bound} is in use. Choose another with --port.`);
    throw error;
  }
}

function listen(server: Server, port: number, host: string): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolvePromise();
    });
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolvePromise) => {
    server.close(() => resolvePromise());
    server.closeAllConnections();
  });
}

function isCode(error: unknown, code: string): boolean {
  return error instanceof Error && (error as NodeJS.ErrnoException).code === code;
}

function refuse(response: ServerResponse, status: 403 | 404 | 405 | 500): void {
  response.writeHead(status, { "Content-Type": "text/plain; charset=utf-8", "X-Content-Type-Options": "nosniff" });
  response.end(`${status}\n`);
}

/** Sends a file from the web UI's folder, `index.html` for "/". Anything outside the folder is not found. */
async function sendFile(webUi: string, request: IncomingMessage, response: ServerResponse): Promise<void> {
  let path: string;
  try {
    path = decodeURIComponent(URL.parse(request.url ?? "/", "http://localhost")?.pathname ?? "");
  } catch {
    return refuse(response, 404);
  }
  const relative = path === "/" ? "index.html" : path.slice(1);
  const file = resolve(webUi, relative);
  if (path.includes("\0") || !file.startsWith(`${webUi}${sep}`)) return refuse(response, 404);
  const found = await stat(file).catch(() => null);
  if (!found?.isFile()) return refuse(response, 404);
  response.writeHead(200, {
    "Content-Type": CONTENT_TYPES[extname(file).toLowerCase()] ?? "application/octet-stream",
    "Content-Length": found.size,
    "Cache-Control": relative.startsWith("assets/") ? "public, max-age=31536000, immutable" : "no-cache",
    "X-Content-Type-Options": "nosniff",
  });
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  await new Promise<void>((resolvePromise, reject) => {
    const stream = createReadStream(file);
    stream.once("error", reject);
    response.once("close", () => resolvePromise());
    stream.pipe(response);
  });
}

/** A WebSocket carries one frame per message; an error ends the stream, as its "close" event follows. */
function webSocketStream(socket: WebSocket): ByteStream {
  socket.on("error", () => socket.terminate());
  return {
    write: (bytes) => socket.send(bytes),
    onData(listener) {
      const onMessage = (data: unknown) => {
        if (data instanceof Uint8Array) listener(data);
        else socket.terminate();
      };
      socket.on("message", onMessage);
      return () => socket.off("message", onMessage);
    },
    onClose(listener) {
      const once = () => listener();
      socket.once("close", once);
      return () => socket.off("close", once);
    },
    close: () => socket.close(),
  };
}
