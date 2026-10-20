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
  runningCore,
  startBridgeServer,
  startNodeImportWorker,
  systemClock,
  WindowPresence,
} from "@arcue/platform-node";
import type { ByteStream, ListenerErrorHandler } from "@arcue/protocol";
import {
  binaryFrameCodec,
  framedEndpoint,
  MAX_FRAME_BYTES,
  messageChannel,
  SERVE_CORE_PATH,
  VIEW_PARAMETER,
  viewNameSchema,
} from "@arcue/protocol";
import type { WebSocket } from "ws";
import { WebSocketServer } from "ws";

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

/** Sent with every response: no website may show these pages in a frame, and links from them reveal no address. */
const PAGE_HEADERS: Readonly<Record<string, string>> = {
  "Content-Security-Policy": "frame-ancestors 'none'",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
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
  /** Called when the command line opens a model without a view and no page outside views is open. */
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
 * A page whose address names an agent session's view, `/?view=<name>`, connects as that view's page and shows the
 * models that session opens. While that page is not open, a page outside views shows them, or with none the core holds
 * them for the page, so an open for a view never waits for a browser.
 *
 * Only pages from this server's own origin can connect to the core, and only through a localhost address, so other
 * websites and DNS rebinding cannot reach it. No website may show its pages in a frame, where the user could not see a
 * model the command line opens and clicks could be hijacked. Like any local web server, it is open to other programs on
 * this computer while it runs.
 */
export async function startServer(options: ServeOptions): Promise<ArcueServer> {
  const webUi = await realpath(options.webUi).catch(() => null);
  if (!webUi || !(await stat(resolve(webUi, "index.html")).catch(() => null))?.isFile()) {
    throw new Error(`This arcue has no web UI in ${options.webUi}.`);
  }
  const running = await runningCore(options.userData);
  if (running) {
    const where = running.url ? ` at ${running.url}` : "";
    throw new Error(`Arcue is already running${where} (process ${running.pid}). "arcue open" shows models there.`);
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
      ensureWindow: (view) => (view === null ? windows.ensure(null) : Promise.resolve()),
      onError: options.onError,
      url,
    });
  } catch (error) {
    core?.dispose();
    await Promise.all(http.map((server) => closeServer(server)));
    throw error;
  }
  const started = core;

  const sockets = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME_BYTES });
  let next = 1;
  sockets.on("connection", (socket: WebSocket, request: IncomingMessage) => {
    const view = socketView(URL.parse(request.url ?? "/", url)) ?? null;
    const channel = messageChannel(webSocketStream(socket), binaryFrameCodec);
    const peer = started.connect(framedEndpoint(channel), {
      connection: `browser-${next++}`,
      caller: "window",
      view: view ?? undefined,
      onListenerError: options.onError,
    });
    windows.added(view);
    peer.onClose(() => {
      windows.removed(view);
      channel.close();
    });
  });

  for (const server of http) {
    server.on("request", (request: IncomingMessage, response: ServerResponse) => {
      for (const [name, value] of Object.entries(PAGE_HEADERS)) response.setHeader(name, value);
      if (!allowed(request)) return refuse(response, 403);
      if (request.method !== "GET" && request.method !== "HEAD") return refuse(response, 405);
      sendFile(webUi, request, response).catch((error: unknown) => {
        options.onError(error);
        if (!response.headersSent) refuse(response, 500);
        else response.destroy();
      });
    });
    server.on("upgrade", (request: IncomingMessage, socket: Duplex, head: Buffer) => {
      const address = URL.parse(request.url ?? "/", url);
      if (
        !allowed(request) ||
        address?.pathname !== SERVE_CORE_PATH ||
        request.headers.origin !== `http://${request.headers.host}`
      ) {
        socket.end(`HTTP/1.1 403 Forbidden\r\n${rawHeaders(PAGE_HEADERS)}Connection: close\r\n\r\n`);
        return;
      }
      if (socketView(address) === undefined) {
        socket.end(`HTTP/1.1 400 Bad Request\r\n${rawHeaders(PAGE_HEADERS)}Connection: close\r\n\r\n`);
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

/** The agent session's view a page's socket address names, null for none, or undefined for a name that is not one. */
function socketView(address: URL | null): string | null | undefined {
  const given = address?.searchParams.getAll(VIEW_PARAMETER) ?? [];
  if (given.length === 0) return null;
  const view = viewNameSchema.safeParse(given[0]);
  return given.length === 1 && view.success ? view.data : undefined;
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
  response.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  response.end(`${status}\n`);
}

function rawHeaders(headers: Readonly<Record<string, string>>): string {
  return Object.entries(headers)
    .map(([name, value]) => `${name}: ${value}\r\n`)
    .join("");
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

/** A WebSocket carries one frame per message, so it keeps message boundaries; an error ends the stream, as its "close" event follows. */
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
