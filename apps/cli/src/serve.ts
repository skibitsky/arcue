import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, realpath, stat } from "node:fs/promises";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { userInfo } from "node:os";
import { dirname, extname, resolve, sep } from "node:path";
import type { Duplex } from "node:stream";
import { fileURLToPath } from "node:url";
import { ArcueCore } from "@arcue/core";
import type { BridgeServer } from "@arcue/platform-node";
import {
  claimStart,
  fromNativePath,
  NodePlatform,
  readBridgeInfo,
  recordLastCore,
  runningCore,
  startBridgeServer,
  startNodeImportWorker,
  systemClock,
  WindowPresence,
} from "@arcue/platform-node";
import type { ByteStream, ListenerErrorHandler, SetTimer } from "@arcue/protocol";
import {
  ArcueError,
  binaryFrameCodec,
  framedEndpoint,
  LOCAL_PAGE_OWNER,
  MAX_FRAME_BYTES,
  messageChannel,
  SERVE_CORE_PATH,
  SERVE_STOPPED_CLOSE_CODE,
  sharesReviews,
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
  /** Called with the address when the command line opens a model without a view and no page outside views is open. */
  onWaitingForWindow?: (url: string) => void;
  /**
   * Stops the core after this long with no page connected. While none is, each connection from the command line, each
   * open it sends and each load of the page counts the time again. Without it, the core never stops by itself for that.
   */
  idleStopMs?: number;
  /** The timers of the idle stop, the pages' heartbeat and the checks. */
  setTimer?: SetTimer;
  /** How often pages are pinged. A page that has not answered by the next ping is dropped. Defaults to 30 seconds. */
  heartbeatMs?: number;
  /** How often the core checks its files, its data folder and the bridge files. Defaults to 5 seconds. */
  checkMs?: number;
  /** How long one other holder may keep a lock, for `NodePlatform`. */
  lockTimeoutMs?: number;
  /** Which arcue.js runs the core, for `serve.json`: the first 16 hex digits of its SHA-256. */
  build?: string;
}

/** Why Arcue in the browser stops by itself, or because `arcue stop` asked it to. */
export type ServeStopReason = "idle" | "requested" | "unshared" | "replaced" | "removed" | "data-gone";

export interface ServeStop {
  reason: ServeStopReason;
  /** The line that says why, for the log. */
  message: string;
}

export interface ArcueServer {
  /** The address to open, such as "http://localhost:4530". */
  readonly url: string;
  readonly pid: number;
  /** Resolves once the core should stop: it stops only once `close` is called. */
  readonly stopped: Promise<ServeStop>;
  /**
   * Stops the core: it records in `last-core.json` that Arcue in the browser ran last, so an open that finds no core
   * meanwhile never starts the desktop app, closes the command line's connections and removes `serve.json`, closes the
   * pages' sockets with `code`, frees the port, and shuts the core down once the changes in flight are saved. A second
   * call waits for the first.
   */
  close(code?: number): Promise<void>;
}

/** The addresses of the page itself, whose load counts the idle time again, as its socket connects only once it runs. */
const PAGE_PATHS: ReadonlySet<string> = new Set(["/", "/index.html"]);

const HEARTBEAT_MS = 30_000;
const CHECK_MS = 5_000;
const PAGE_CLOSE_MS = 1_000;

/**
 * Runs a core on this computer's files beside the desktop app's, on the same reviews, which both change only under
 * `Platform.lock`. It answers the command line at `serve.json`, refuses to start beside another `arcue serve` or a
 * core that takes no review locks, and stops itself when one starts or its files are removed. A detached one stops
 * after `idleStopMs` with no page connected. It serves its window to a browser on localhost, as the desktop app shows
 * it in its own window.
 *
 * A page whose address names an agent session's view, `/?view=<name>`, connects as that view's page and shows the
 * models that session opens. While that page is not open, the core holds them for the page rather than show them in a
 * page outside views, which may be another session's, so an open for a view never waits for a browser.
 *
 * Only pages from this server's own origin can connect to the core, and only through a localhost address, so other
 * websites and DNS rebinding cannot reach it. No website may show its pages in a frame, where the user could not see a
 * model the command line opens and clicks could be hijacked. Like any local web server, it is open to other programs on
 * this computer while it runs.
 */
export async function startServer(options: ServeOptions): Promise<ArcueServer> {
  const webUi = await realpath(options.webUi).catch(() => null);
  if (!webUi || !(await isFile(resolve(webUi, "index.html")))) {
    throw new Error(`This arcue has no web UI in ${options.webUi}.`);
  }
  const { userData } = options;
  const setTimer = options.setTimer ?? systemClock.setTimer;
  const claim = await claimStart(userData, "serve");
  const dataFolder = await folderIdentity(userData);
  const owner = await pageOwner(userData);

  let url = "";
  const windows = new WindowPresence({
    requestWindow: () => options.onWaitingForWindow?.(url),
    setTimer: systemClock.setTimer,
  });
  const stopped = Promise.withResolvers<ServeStop>();
  let stopping: ServeStop | null = null;
  let closing: Promise<void> | null = null;
  let pages = 0;
  let cancelIdle: () => void = () => undefined;
  const armIdle = () => {
    cancelIdle();
    const idleStopMs = options.idleStopMs;
    if (idleStopMs === undefined || closing) return;
    cancelIdle = setTimer(idleStopMs, () =>
      stop("idle", `Arcue stops: no page was open for ${Number((idleStopMs / 60_000).toFixed(2))} minutes.`),
    );
  };
  const stop = (reason: ServeStopReason, message: string) => {
    if (stopping || closing) return;
    stopping = { reason, message };
    stopped.resolve(stopping);
  };
  const removed = (folder: string) =>
    stop(
      "removed",
      `Arcue stops: its files in ${folder} were removed. Run arcue serve --detach to start the current one.`,
    );

  let http: Server[] = [];
  let core: ArcueCore | null = null;
  let port: number;
  let bridge: BridgeServer;
  let unregisterStop: () => void = () => undefined;
  try {
    const listening = await listenLocally(options.port);
    http = listening.servers;
    port = listening.port;
    url = `http://localhost:${port}`;
    const platform = new NodePlatform({
      appDataDir: fromNativePath(userData),
      startImportWorker: () => startNodeImportWorker(options.importWorkerEntry, options.onError),
      lockTimeoutMs: options.lockTimeoutMs,
    });
    core = await ArcueCore.start({ platform, onError: options.onError });
    unregisterStop = core.registry.handleCommand("serve.stop", (_input, context) => {
      if (context.caller !== "bridge") {
        throw new ArcueError("forbidden", "Only the arcue command can stop Arcue in the browser.");
      }
      setImmediate(() => stop("requested", "Arcue stops: arcue stop asked it to."));
    });
    bridge = await startBridgeServer({
      core,
      userData,
      kind: "serve",
      ensureWindow: (view) => {
        if (pages === 0) armIdle();
        return view === null ? windows.ensure(null) : Promise.resolve();
      },
      onConnection: () => {
        if (pages === 0) armIdle();
      },
      onError: options.onError,
      url,
      build: options.build,
      claim,
    });
  } catch (error) {
    await claim.release();
    core?.dispose();
    await Promise.all(http.map((server) => closeServer(server)));
    throw error;
  }
  const started = core;
  const hosts = localHosts(port);
  const allowed = (request: IncomingMessage) => hosts.has(request.headers.host?.toLowerCase() ?? "");

  const sockets = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME_BYTES });
  const answered = new WeakMap<WebSocket, boolean>();
  let next = 1;
  sockets.on("connection", (socket: WebSocket, request: IncomingMessage) => {
    pages++;
    cancelIdle();
    answered.set(socket, true);
    socket.on("pong", () => answered.set(socket, true));
    socket.once("close", () => {
      pages--;
      if (pages === 0) armIdle();
    });
    const view = socketView(URL.parse(request.url ?? "/", url)) ?? null;
    const channel = messageChannel(webSocketStream(socket), binaryFrameCodec);
    const peer = started.connect(framedEndpoint(channel), {
      connection: `browser-${next++}`,
      caller: "window",
      view: view ?? undefined,
      browser: true,
      onListenerError: options.onError,
    });
    windows.added(view);
    peer.onClose(() => {
      windows.removed(view);
      channel.close();
    });
  });

  for (const server of http) {
    server.removeAllListeners("request");
    server.removeAllListeners("upgrade");
    server.on("request", (request: IncomingMessage, response: ServerResponse) => {
      for (const [name, value] of Object.entries(PAGE_HEADERS)) response.setHeader(name, value);
      if (!allowed(request)) return refuse(response, 403);
      if (request.method !== "GET" && request.method !== "HEAD") return refuse(response, 405);
      if (pages === 0 && PAGE_PATHS.has(URL.parse(request.url ?? "/", url)?.pathname ?? "")) armIdle();
      sendFile(webUi, owner, request, response, () => removed(webUi)).catch((error: unknown) => {
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
      if (closing) {
        socket.end(`HTTP/1.1 503 Service Unavailable\r\n${rawHeaders(PAGE_HEADERS)}Connection: close\r\n\r\n`);
        return;
      }
      sockets.handleUpgrade(request, socket, head, (connected) => sockets.emit("connection", connected, request));
    });
  }

  let cancelHeartbeat: () => void = () => undefined;
  const heartbeat = () => {
    for (const client of sockets.clients) {
      if (answered.get(client) === false) {
        client.terminate();
        continue;
      }
      answered.set(client, false);
      client.ping();
    }
    cancelHeartbeat = setTimer(options.heartbeatMs ?? HEARTBEAT_MS, heartbeat);
  };
  cancelHeartbeat = setTimer(options.heartbeatMs ?? HEARTBEAT_MS, heartbeat);

  const check = async () => {
    const workerFolder = dirname(options.importWorkerEntry);
    if (!(await isFile(resolve(webUi, "index.html")))) return removed(webUi);
    if (!(await isFile(options.importWorkerEntry))) return removed(workerFolder);
    const folder = await folderIdentity(userData);
    if (folder === null || (dataFolder !== null && folder !== dataFolder)) {
      return stop("data-gone", `Arcue stops: its data folder ${userData} was removed.`);
    }
    const held = await bridge.holdsInfo();
    const other = held === "other-live" ? await readBridgeInfo(userData, "serve") : null;
    if (other) {
      return stop("replaced", `Arcue stops: another Arcue in the browser took its place (process ${other.pid}).`);
    }
    if (held === "missing") await bridge.rewriteInfo();
    const desktop = await readBridgeInfo(userData, "desktop");
    if (desktop && !sharesReviews(desktop)) {
      const live = await runningCore(userData, "desktop");
      if (live?.token === desktop.token) {
        stop("unshared", `Arcue stops: an Arcue that can't share reviews started beside it (process ${live.pid}).`);
      }
    }
  };
  let cancelChecks: () => void = () => undefined;
  const checkLater = () => {
    cancelChecks = setTimer(options.checkMs ?? CHECK_MS, () => {
      check()
        .catch((error: unknown) => options.onError(error))
        .finally(() => {
          if (!closing && !stopping) checkLater();
        });
    });
  };
  checkLater();
  armIdle();

  return {
    url,
    pid: process.pid,
    stopped: stopped.promise,
    close(code = SERVE_STOPPED_CLOSE_CODE) {
      closing ??= (async () => {
        cancelIdle();
        cancelHeartbeat();
        cancelChecks();
        unregisterStop();
        await recordLastCore(userData, "serve", url);
        await bridge.close().catch((error: unknown) => options.onError(error));
        await closePages(sockets, code);
        await Promise.all(http.map((server) => closeServer(server)));
        windows.dispose();
        await started.shutdown().catch((error: unknown) => options.onError(error));
      })();
      return closing;
    },
  };
}

/** Closes every page's socket with the code, and ends those still open a second later. */
async function closePages(sockets: WebSocketServer, code: number): Promise<void> {
  const open = [...sockets.clients];
  const closed = Promise.all(
    open.map(
      (client) =>
        new Promise<void>((resolvePromise) => {
          if (client.readyState === client.CLOSED) resolvePromise();
          else client.once("close", () => resolvePromise());
        }),
    ),
  );
  for (const client of open) client.close(code);
  let timer: NodeJS.Timeout | undefined;
  await Promise.race([closed, new Promise((resolvePromise) => (timer = setTimeout(resolvePromise, PAGE_CLOSE_MS)))]);
  clearTimeout(timer);
  for (const client of sockets.clients) client.terminate();
  sockets.close();
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

/**
 * Listens on the port on 127.0.0.1 and, where the computer has it, on ::1 too, since "localhost" may resolve to either.
 * Until the caller takes their requests over, the servers answer 503, since a request that arrives while a server has
 * no listener is never answered.
 */
async function listenLocally(port: number): Promise<{ servers: Server[]; port: number }> {
  const first = startingServer();
  try {
    await listen(first, port, "127.0.0.1");
  } catch (error) {
    if (isCode(error, "EADDRINUSE")) {
      throw new Error(`Port ${port} is in use. Choose another with --port.`);
    }
    throw error;
  }
  const bound = (first.address() as AddressInfo).port;
  const second = startingServer();
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

/**
 * The folder's device and inode, which a folder made again in its place does not share, as when a lock or a save in
 * flight makes a removed data folder again. Null when it is gone.
 */
async function folderIdentity(path: string): Promise<string | null> {
  const found = await stat(path, { bigint: true }).catch(() => null);
  return found ? `${found.dev}:${found.ino}` : null;
}

/** Names the data folder and user, the same on every start, so the page tells this Arcue in the browser from another. */
async function pageOwner(userData: string): Promise<string> {
  const folder = await realpath(userData).catch(() => resolve(userData));
  const user = process.getuid?.() ?? userInfo().username;
  return createHash("sha256").update(`${user}\0${folder}`).digest("hex").slice(0, 16);
}

/** The page with the meta tag that names its owner, first in its head. */
function withOwner(html: string, owner: string): string {
  const meta = `<meta name="${LOCAL_PAGE_OWNER}" content="${owner}" />`;
  const head = /<head(\s[^>]*)?>/i.exec(html);
  if (!head) return `${meta}${html}`;
  const at = head.index + head[0].length;
  return `${html.slice(0, at)}${meta}${html.slice(at)}`;
}

function startingServer(): Server {
  const server = createServer((_request, response) => {
    for (const [name, value] of Object.entries(PAGE_HEADERS)) response.setHeader(name, value);
    refuse(response, 503);
  });
  server.on("upgrade", (_request: IncomingMessage, socket: Duplex) => {
    socket.end(`HTTP/1.1 503 Service Unavailable\r\n${rawHeaders(PAGE_HEADERS)}Connection: close\r\n\r\n`);
  });
  return server;
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

async function isFile(path: string): Promise<boolean> {
  return (await stat(path).catch(() => null))?.isFile() ?? false;
}

function isCode(error: unknown, code: string): boolean {
  return error instanceof Error && (error as NodeJS.ErrnoException).code === code;
}

function refuse(response: ServerResponse, status: 403 | 404 | 405 | 500 | 503): void {
  response.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  response.end(`${status}\n`);
}

function rawHeaders(headers: Readonly<Record<string, string>>): string {
  return Object.entries(headers)
    .map(([name, value]) => `${name}: ${value}\r\n`)
    .join("");
}

/**
 * Sends a file from the web UI's folder, `index.html` for "/". Anything outside the folder is not found. Calls
 * `onPageMissing` when `index.html` is gone.
 */
async function sendFile(
  webUi: string,
  owner: string,
  request: IncomingMessage,
  response: ServerResponse,
  onPageMissing: () => void,
): Promise<void> {
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
  if (!found?.isFile()) {
    if (relative === "index.html") onPageMissing();
    return refuse(response, 404);
  }
  if (relative === "index.html") {
    const page = Buffer.from(withOwner(await readFile(file, "utf8"), owner));
    response.writeHead(200, {
      "Content-Type": CONTENT_TYPES[".html"],
      "Content-Length": page.length,
      "Cache-Control": "no-cache",
    });
    response.end(request.method === "HEAD" ? undefined : page);
    return;
  }
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
