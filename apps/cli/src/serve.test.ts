import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import type { IncomingHttpHeaders } from "node:http";
import { request } from "node:http";
import type { Socket } from "node:net";
import { connect, createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { ManualClock } from "@arcue/core";
import { connectToCore, readBridgeInfo } from "@arcue/platform-node";
import type { FakeCore } from "@arcue/platform-node/test";
import { startFakeCore, writeLastCoreFile } from "@arcue/platform-node/test";
import type { CoreClient, IncomingRequest } from "@arcue/protocol";
import {
  BRIDGE_INFO_FILE,
  binaryFrameCodec,
  bridgeInfoSchema,
  createPeer,
  createRemoteClient,
  framedEndpoint,
  LAST_CORE_FILE,
  messageChannel,
  SERVE_CORE_PATH,
  SERVE_INFO_FILE,
} from "@arcue/protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClientOptions } from "ws";
import { WebSocket } from "ws";
import { run } from "./run";
import type { ArcueServer, ServeOptions, ServeStop } from "./serve";
import { localHosts, startServer } from "./serve";
import { heldLockFiles, holdLockElsewhere } from "./test-locks";

let temp: string;
let userData: string;
let webUi: string;
let server: ArcueServer | null;
let fakes: FakeCore[];
let errors: unknown[];

beforeEach(() => {
  temp = realpathSync(mkdtempSync(join(tmpdir(), "arcue-serve-")));
  userData = join(temp, "data");
  webUi = join(temp, "web");
  mkdirSync(join(webUi, "assets"), { recursive: true });
  writeFileSync(join(webUi, "index.html"), "<!doctype html><title>Arcue</title>");
  writeFileSync(join(webUi, "assets", "index-abc.js"), "export {};");
  writeFileSync(join(temp, "import-worker.js"), "");
  writeFileSync(join(temp, "secret.txt"), "secret");
  server = null;
  fakes = [];
  errors = [];
});

afterEach(async () => {
  await server?.close();
  await Promise.all(fakes.map((fake) => fake.close()));
  rmSync(temp, { recursive: true, force: true });
});

/** A server in the test's folders. Its errors go to this test's list, so a closed server's late ones reach no other. */
function options(overrides: Partial<ServeOptions> = {}): ServeOptions {
  const seen = errors;
  return {
    userData,
    importWorkerEntry: join(temp, "import-worker.js"),
    webUi,
    port: 0,
    onError: (error) => seen.push(error),
    ...overrides,
  };
}

async function serve(overrides: Partial<ServeOptions> = {}): Promise<ArcueServer> {
  server = await startServer(options(overrides));
  return server;
}

interface Answer {
  status: number;
  type: string | undefined;
  cache: string | undefined;
  headers: IncomingHttpHeaders;
  body: string;
}

/** Sends the path as it is, without the normalizing `fetch` does, with the Host header given. */
function get(url: string, path: string, init: { host?: string; method?: string } = {}): Promise<Answer> {
  const { port } = new URL(url);
  return new Promise((resolve, reject) => {
    const sent = request(
      {
        host: "127.0.0.1",
        port,
        path,
        method: init.method ?? "GET",
        headers: { host: init.host ?? `localhost:${port}` },
      },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk: string) => {
          body += chunk;
        });
        response.on("end", () =>
          resolve({
            status: response.statusCode ?? 0,
            type: response.headers["content-type"],
            cache: response.headers["cache-control"],
            headers: response.headers,
            body,
          }),
        );
      },
    );
    sent.on("error", reject);
    sent.end();
  });
}

function openSocket(
  url: string,
  origin: string,
  path = SERVE_CORE_PATH,
  options: ClientOptions = {},
): Promise<WebSocket> {
  const socket = new WebSocket(`${url.replace("http:", "ws:")}${path}`, { origin, ...options });
  return new Promise((resolve, reject) => {
    socket.once("open", () => resolve(socket));
    socket.once("error", reject);
  });
}

/** The headers of the answer that refuses a socket. */
function refusedSocket(url: string, origin: string): Promise<IncomingHttpHeaders> {
  const socket = new WebSocket(`${url.replace("http:", "ws:")}${SERVE_CORE_PATH}`, { origin });
  return new Promise((resolve, reject) => {
    socket.once("unexpected-response", (_request, response) => {
      resolve(response.headers);
      response.destroy();
    });
    socket.once("open", () => reject(new Error("The socket opened.")));
  });
}

const forbidsFraming = {
  "content-security-policy": "frame-ancestors 'none'",
  "x-frame-options": "DENY",
  "referrer-policy": "no-referrer",
};

/** A window's connection to the core over the page's socket, recording the core's requests to it. */
function windowClient(socket: WebSocket, requests: IncomingRequest[] = []): CoreClient {
  const channel = messageChannel(
    {
      write: (bytes) => socket.send(bytes),
      onData(listener) {
        const onMessage = (data: Uint8Array) => listener(data);
        socket.on("message", onMessage);
        return () => socket.off("message", onMessage);
      },
      onClose(listener) {
        socket.once("close", listener);
        return () => socket.off("close", listener);
      },
      close: () => socket.close(),
    },
    binaryFrameCodec,
  );
  return createRemoteClient(
    createPeer(framedEndpoint(channel), {
      handleRequest: (request) => {
        requests.push(request);
        return undefined;
      },
    }),
  );
}

describe("arcue serve", () => {
  it("serves the web UI, index.html for the root, with long caching only for hashed assets", async () => {
    const { url } = await serve();

    expect(await get(url, "/")).toMatchObject({ status: 200, type: "text/html; charset=utf-8", cache: "no-cache" });
    expect(await get(url, "/assets/index-abc.js")).toMatchObject({
      status: 200,
      type: "text/javascript; charset=utf-8",
      cache: "public, max-age=31536000, immutable",
      body: "export {};",
    });
    expect(await get(url, "/assets/missing.js")).toMatchObject({ status: 404 });
  });

  it("serves nothing outside the web UI's folder", async () => {
    const { url } = await serve();

    for (const path of ["/../secret.txt", "/%2e%2e/secret.txt", "/assets/%2e%2e/%2e%2e/secret.txt", "//etc/passwd"]) {
      const answer = await get(url, path);
      expect(answer.status, path).toBe(404);
      expect(answer.body, path).not.toContain("secret");
    }
    expect((await get(url, "/%E0%A4%A")).status).toBe(404);
    expect((await get(url, "/assets")).status).toBe(404);
  });

  it("answers only requests addressed to localhost, and only reads", async () => {
    const { url } = await serve();
    const { port } = new URL(url);

    expect((await get(url, "/", { host: `127.0.0.1:${port}` })).status).toBe(200);
    expect((await get(url, "/", { host: `evil.example:${port}` })).status).toBe(403);
    expect((await get(url, "/", { host: "localhost:1" })).status).toBe(403);
    expect((await get(url, "/", { method: "POST" })).status).toBe(405);
  });

  it("forbids other pages to frame it, and sends no referrer, in every answer", async () => {
    const { url } = await serve();
    const { port } = new URL(url);

    const answers = {
      page: await get(url, "/"),
      asset: await get(url, "/assets/index-abc.js"),
      head: await get(url, "/", { method: "HEAD" }),
      missing: await get(url, "/assets/missing.js"),
      outside: await get(url, "/%2e%2e/secret.txt"),
      malformed: await get(url, "/%E0%A4%A"),
      otherHost: await get(url, "/", { host: `evil.example:${port}` }),
      write: await get(url, "/", { method: "POST" }),
    };
    for (const [name, answer] of Object.entries(answers)) {
      expect(answer.headers, name).toMatchObject({ ...forbidsFraming, "x-content-type-options": "nosniff" });
    }
    expect(answers.page.status).toBe(200);
    expect(answers.otherHost.status).toBe(403);
    expect(answers.write.status).toBe(405);
    expect(await refusedSocket(url, "https://evil.example")).toMatchObject(forbidsFraming);
  });

  it("knows the Host headers of localhost addresses, without the port for port 80", () => {
    expect([...localHosts(4530)]).toEqual(["localhost:4530", "127.0.0.1:4530", "[::1]:4530"]);
    expect([...localHosts(80)]).toEqual(["localhost", "127.0.0.1", "[::1]"]);
  });

  it("connects a page from its own origin to the core as a window", async () => {
    const { url } = await serve();
    const socket = await openSocket(url, url);

    const client = windowClient(socket);
    await expect(client.query("asset.list", {})).resolves.toEqual({ assets: [] });
    await expect(client.execute("view.reportFocus", {})).resolves.toBeUndefined();
    socket.close();
  });

  it("connects a page whose address names a view as that view's page", async () => {
    const { url } = await serve();
    const model = join(temp, "Hero.fbx");
    writeFileSync(model, "fbx");
    const viewed: IncomingRequest[] = [];
    const outside: IncomingRequest[] = [];
    windowClient(await openSocket(url, url, `${SERVE_CORE_PATH}?view=3f9a0c1d2b4e`), viewed);
    windowClient(await openSocket(url, url), outside);
    const connection = await connectToCore(userData, "serve");

    await expect(
      connection?.client.execute("asset.openInView", { path: model, view: "3f9a0c1d2b4e" }),
    ).resolves.toMatchObject({ shown: "view" });

    expect(viewed.map((request) => request.name)).toEqual(["view.showAsset"]);
    expect(outside).toEqual([]);
    connection?.close();
  });

  it("asks for a browser at its address when the command line opens a model and no page is open", async () => {
    const asked: string[] = [];
    const { url } = await serve({ onWaitingForWindow: (address) => asked.push(address) });
    const connection = await connectToCore(userData, "serve");
    const opening = connection?.client.execute("asset.open", { path: model() });

    await vi.waitFor(() => expect(asked).toEqual([url]), { timeout: 2000 });
    const shown: IncomingRequest[] = [];
    windowClient(await openSocket(url, url), shown);

    await expect(opening).resolves.toMatchObject({ assetId: expect.any(String) });
    expect(shown.map((request) => request.name)).toEqual(["view.showAsset"]);
    connection?.close();
  });

  it("holds a model for its view's page without waiting for a browser", async () => {
    let waited = false;
    const { url } = await serve({ onWaitingForWindow: () => (waited = true) });
    const model = join(temp, "Hero.fbx");
    writeFileSync(model, "fbx");
    const other: IncomingRequest[] = [];
    windowClient(await openSocket(url, url, `${SERVE_CORE_PATH}?view=b`), other);
    const connection = await connectToCore(userData, "serve");

    await expect(connection?.client.execute("asset.openInView", { path: model, view: "a" })).resolves.toMatchObject({
      shown: "held",
    });

    expect(waited).toBe(false);
    expect(other).toEqual([]);
    connection?.close();
  });

  it("refuses a page socket whose address names a view that is not valid", async () => {
    const { url } = await serve();

    await expect(openSocket(url, url, `${SERVE_CORE_PATH}?view=..%2Fa`)).rejects.toThrow("400");
    await expect(openSocket(url, url, `${SERVE_CORE_PATH}?view=a&view=b`)).rejects.toThrow("400");
  });

  it("refuses sockets from other origins and on other paths", async () => {
    const { url } = await serve();

    await expect(openSocket(url, "https://evil.example")).rejects.toThrow("403");
    await expect(openSocket(url, "null")).rejects.toThrow("403");
    await expect(openSocket(url, url, "/other")).rejects.toThrow("403");
  });

  it("refuses a page from a release that sent JSON frames, which connects on the old path", async () => {
    const { url } = await serve();

    await expect(openSocket(url, url, "/core")).rejects.toThrow("403");
  });

  it("closes a page's socket when it sends a malformed frame", async () => {
    const { url } = await serve();
    const socket = await openSocket(url, url);

    const closed = new Promise((resolve) => socket.once("close", resolve));
    socket.send(Uint8Array.of(255, 255, 255, 255));
    await closed;
    expect(errors).toEqual([]);
  });

  it("survives a socket request it cannot parse", async () => {
    const { url } = await serve();
    const { port } = new URL(url);

    const answer = await new Promise<string>((resolve, reject) => {
      const socket = connect(Number(port), "127.0.0.1", () =>
        socket.write(
          `GET http://[ HTTP/1.1\r\nHost: localhost:${port}\r\nOrigin: ${url}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n`,
        ),
      );
      let text = "";
      socket.on("data", (chunk) => {
        text += chunk.toString();
      });
      socket.on("close", () => resolve(text));
      socket.on("error", reject);
    });
    expect(answer).toMatch(/^HTTP\/1\.1 40\d/);
    expect((await get(url, "/")).status).toBe(200);
  });

  it("takes the desktop app's place for the command line, and names its address", async () => {
    const { url } = await serve();

    const info = bridgeInfoSchema.parse(JSON.parse(readFileSync(join(userData, SERVE_INFO_FILE), "utf8")));
    expect(info.url).toBe(url);
    const connection = await connectToCore(userData, "serve");
    expect(connection?.info.url).toBe(url);
    await expect(connection?.client.query("asset.list", {})).resolves.toEqual({ assets: [] });
    connection?.close();
  });

  it("refuses to start while Arcue runs", async () => {
    const { url } = await serve();

    await expect(startServer(options())).rejects.toThrow(`Arcue is already running at ${url}`);
  });

  it("removes serve.json when it stops", async () => {
    await (await serve()).close();
    server = null;

    expect(existsSync(join(userData, SERVE_INFO_FILE))).toBe(false);
  });

  it("asks for another port when its port is taken", async () => {
    const taken = createServer();
    await new Promise<void>((resolve) => taken.listen(0, "127.0.0.1", resolve));
    const address = taken.address();
    const port = typeof address === "object" && address ? address.port : 0;

    await expect(serve({ port })).rejects.toThrow(`Port ${port} is in use. Choose another with --port.`);
    expect(existsSync(join(userData, SERVE_INFO_FILE))).toBe(false);
    taken.close();
  });

  it("needs its web UI", async () => {
    await expect(serve({ webUi: join(temp, "nowhere") })).rejects.toThrow("has no web UI");
  });
});

/** Settles what timers that a manual clock ran started. */
async function settle(): Promise<void> {
  await sleep(20);
}

/** A model file in the test folder, outside any repository, so its reviews live in the data folder. */
function model(name = "Hero.fbx"): string {
  const path = join(temp, name);
  writeFileSync(path, "fbx");
  return path;
}

/** Whether the server's stop reason has resolved, read without waiting. */
function watchStop(running: ArcueServer): { readonly stop: ServeStop | null } {
  const seen: { stop: ServeStop | null } = { stop: null };
  void running.stopped.then((stop) => {
    seen.stop = stop;
  });
  return seen;
}

/** A page that upgrades to a socket and then never answers, so a close waits for it. */
function silentPage(url: string): Promise<Socket> {
  const { port } = new URL(url);
  return new Promise((resolve, reject) => {
    const socket = connect(Number(port), "127.0.0.1", () =>
      socket.write(
        `GET ${SERVE_CORE_PATH} HTTP/1.1\r\nHost: localhost:${port}\r\nOrigin: ${url}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n`,
      ),
    );
    socket.once("data", (chunk) => {
      if (chunk.toString().startsWith("HTTP/1.1 101")) resolve(socket);
      else reject(new Error(chunk.toString()));
    });
    socket.on("error", () => undefined);
  });
}

function filesNamed(folder: string, name: string): string[] {
  return readdirSync(folder, { recursive: true, encoding: "utf8" })
    .filter((entry) => entry.endsWith(name))
    .map((entry) => join(folder, entry));
}

const MINUTE = 60_000;

describe("arcue serve beside other cores", () => {
  it("runs beside the desktop app of this build", async () => {
    fakes.push(await startFakeCore(userData, { file: BRIDGE_INFO_FILE, kind: "desktop", locks: 1 }));
    const running = await serve({ checkMs: 20 });
    const seen = watchStop(running);

    await sleep(300);
    expect(seen.stop).toBeNull();
    expect(await readBridgeInfo(userData, "serve")).toMatchObject({ kind: "serve", locks: 1, url: running.url });
  });

  it("refuses to start beside an Arcue app or an arcue serve that takes no review locks", async () => {
    const app = await startFakeCore(userData, { file: BRIDGE_INFO_FILE });
    await expect(serve()).rejects.toThrow(
      `An Arcue app runs (process ${process.pid}) that can't share reviews with Arcue in the browser. Quit it or update it, then try again.`,
    );
    await app.close();

    const older = await startFakeCore(userData, { file: BRIDGE_INFO_FILE, url: "http://localhost:4530" });
    await expect(serve()).rejects.toThrow(
      `An older arcue serve runs at http://localhost:4530 (process ${process.pid}) and can't share reviews with this one. Run arcue stop, then try again.`,
    );
    await older.close();
    expect(existsSync(join(userData, SERVE_INFO_FILE))).toBe(false);

    await expect(serve()).resolves.toMatchObject({ pid: process.pid });
  });

  it("stops when a core that takes no review locks starts beside it", async () => {
    const running = await serve({ checkMs: 20 });
    fakes.push(await startFakeCore(userData, { file: BRIDGE_INFO_FILE }));

    await expect(running.stopped).resolves.toEqual({
      reason: "unshared",
      message: `Arcue stops: an Arcue that can't share reviews started beside it (process ${process.pid}).`,
    });
  });

  it("keeps running beside a bridge.json that a core taking no locks left", async () => {
    const running = await serve({ checkMs: 20 });
    const left = await startFakeCore(userData, { file: BRIDGE_INFO_FILE });
    await left.close();
    writeFileSync(join(userData, BRIDGE_INFO_FILE), JSON.stringify(left.info));
    const seen = watchStop(running);

    await sleep(300);
    expect(seen.stop).toBeNull();
  });

  it("stops when another Arcue in the browser takes serve.json", async () => {
    const running = await serve({ checkMs: 20 });
    fakes.push(
      await startFakeCore(userData, { file: SERVE_INFO_FILE, kind: "serve", locks: 1, url: "http://localhost:4599" }),
    );

    await expect(running.stopped).resolves.toEqual({
      reason: "replaced",
      message: `Arcue stops: another Arcue in the browser took its place (process ${process.pid}).`,
    });
    await running.close();
    server = null;
    expect(await readBridgeInfo(userData, "serve")).toMatchObject({ url: "http://localhost:4599" });
  });

  it("writes serve.json again when it is deleted, and names its build there", async () => {
    const running = await serve({ checkMs: 20, build: "0123456789abcdef" });
    const info = await readBridgeInfo(userData, "serve");
    expect(info).toMatchObject({ build: "0123456789abcdef", pid: running.pid });

    rmSync(join(userData, SERVE_INFO_FILE));

    await vi.waitFor(async () => expect((await readBridgeInfo(userData, "serve"))?.token).toBe(info?.token), {
      timeout: 2000,
    });
  });

  it("stops when its data folder is removed, and leaves it removed", async () => {
    const running = await serve({ checkMs: 20 });

    rmSync(userData, { recursive: true, force: true });

    await expect(running.stopped).resolves.toEqual({
      reason: "data-gone",
      message: `Arcue stops: its data folder ${userData} was removed.`,
    });
    await running.close();
    server = null;
    expect(existsSync(userData)).toBe(false);
  });
});

describe("arcue serve stopping", () => {
  it("stops when the command line asks, and only the command line", async () => {
    const running = await serve();
    const page = windowClient(await openSocket(running.url, running.url));
    await expect(page.execute("serve.stop", {})).rejects.toMatchObject({
      code: "forbidden",
      message: "Only the arcue command can stop Arcue in the browser.",
    });
    const seen = watchStop(running);
    await settle();
    expect(seen.stop).toBeNull();

    const connection = await connectToCore(userData, "serve");
    await expect(connection?.client.execute("serve.stop", {})).resolves.toBeUndefined();
    connection?.close();
    await expect(running.stopped).resolves.toEqual({
      reason: "requested",
      message: "Arcue stops: arcue stop asked it to.",
    });
  });

  it("closes the pages with code 4000, records that it ran last, and frees its port", async () => {
    const running = await serve();
    const page = await openSocket(running.url, running.url);
    const code = new Promise((resolve) => page.once("close", (closed) => resolve(closed)));
    writeLastCoreFile(userData, "desktop");

    await running.close();
    server = null;

    expect(await code).toBe(4000);
    expect(JSON.parse(readFileSync(join(userData, LAST_CORE_FILE), "utf8"))).toEqual({
      version: 1,
      kind: "serve",
      serveUrl: running.url,
    });
    const again = await serve({ port: Number(new URL(running.url).port) });
    expect(again.url).toBe(running.url);
  });

  it("closes the command line's connections before the pages, and refuses pages meanwhile", async () => {
    const running = await serve();
    const held = await silentPage(running.url);
    const connection = await connectToCore(userData, "serve");
    const socket = connection?.info.socket ?? "";
    const opening = connection?.client.execute("asset.openInView", { path: model(), view: "a" }).then(
      () => "result",
      (error: { code?: string }) => error.code,
    );

    const closing = running.close();
    server = null;
    expect(["result", "disconnected"]).toContain(await opening);
    await vi.waitFor(() => expect(existsSync(join(userData, SERVE_INFO_FILE))).toBe(false), { timeout: 2000 });
    await expect(
      new Promise((resolve, reject) => connect(socket).once("connect", resolve).once("error", reject)),
    ).rejects.toThrow();
    await expect(openSocket(running.url, running.url)).rejects.toThrow("503");
    await closing;
    held.destroy();
    connection?.close();
  });

  it("finishes a save that waits for the reviews lock before it stops", async () => {
    const running = await serve();
    const lock = await holdLockElsewhere(userData, userData, "reviews");
    const connection = await connectToCore(userData, "serve");
    const opened = await connection?.client.execute("asset.openInView", { path: model(), view: "a" });
    model("Prop.fbx");
    const adding = connection?.client
      .execute("composition.addFile", { assetId: opened?.assetId ?? "", file: "Prop.fbx", role: "set" })
      .catch(() => undefined);
    await sleep(200);
    await connection?.client.execute("serve.stop", {});
    await running.stopped;

    const closing = running.close();
    server = null;
    await sleep(300);
    lock.release();
    await closing;

    const [composition] = filesNamed(join(userData, "reviews"), "composition.json");
    expect(JSON.parse(readFileSync(composition ?? "", "utf8"))).toMatchObject({
      attach: [{ file: "Prop.fbx" }],
    });
    expect(heldLockFiles(userData)).toEqual([]);
    connection?.close();
    void adding;
  });

  it("stops within the lock limit and a second when a save waits on a lock another Arcue keeps", async () => {
    const running = await serve({ lockTimeoutMs: 500 });
    const lock = await holdLockElsewhere(userData, userData, "reviews");
    const connection = await connectToCore(userData, "serve");
    const opened = await connection?.client.execute("asset.openInView", { path: model(), view: "a" });
    model("Prop.fbx");
    const adding = connection?.client
      .execute("composition.addFile", { assetId: opened?.assetId ?? "", file: "Prop.fbx", role: "set" })
      .catch((error: { code?: string }) => error.code);
    await connection?.client.execute("serve.stop", {});
    await running.stopped;
    const started = Date.now();

    await running.close();
    server = null;

    expect(Date.now() - started).toBeLessThan(1500);
    expect(["timeout", "disconnected"]).toContain(await adding);
    expect(heldLockFiles(userData)).toEqual([lock.file.split(/[\\/]/).at(-1)]);
    connection?.close();
  });

  it("prints why it stops when it runs in the foreground", async () => {
    const port = await new Promise<number>((resolve) => {
      const probe = createServer();
      probe.listen(0, "127.0.0.1", () => {
        const address = probe.address();
        probe.close(() => resolve(typeof address === "object" && address ? address.port : 0));
      });
    });
    let out = "";
    let stopping = 0;
    const running = run(
      ["serve", "--port", String(port)],
      { out: (text) => (out += text), err: () => undefined },
      { ARCUE_USER_DATA: userData, ARCUE_VIEW: "review" },
      temp,
      {
        webUi,
        importWorkerEntry: join(temp, "import-worker.js"),
        stop: new Promise(() => undefined),
        build: "0123456789abcdef",
        onStopping: () => stopping++,
      },
    );
    await vi.waitFor(() => expect(out).toContain("Arcue runs at"), { timeout: 5000 });
    expect(await readBridgeInfo(userData, "serve")).toMatchObject({ build: "0123456789abcdef" });
    const connection = await connectToCore(userData, "serve");
    await connection?.client.execute("serve.stop", {});
    connection?.close();

    await expect(running).resolves.toBe(0);
    expect(out).toMatch(
      new RegExp(
        `^Arcue runs at http://localhost:${port}\\. Open it in a browser; agents' "arcue open" shows their models there\\.\\nThis session's view: http://localhost:${port}/\\?view=[0-9a-f]{12}\\nArcue stops: arcue stop asked it to\\.\\n$`,
      ),
    );
    expect(stopping).toBe(1);
  });
});

describe("arcue serve on its own", () => {
  it("stops after the idle time with no page, never while one is connected, and counts again from the last", async () => {
    const clock = new ManualClock();
    const running = await serve({
      idleStopMs: 30 * MINUTE,
      setTimer: (ms, run) => clock.setTimer(ms, run),
      heartbeatMs: 1e9,
      checkMs: 1e9,
    });
    const seen = watchStop(running);
    const idleArmed = (armed: boolean) =>
      vi.waitFor(() => expect(clock.pendingTimers).toBe(armed ? 3 : 2), { timeout: 5000 });

    await idleArmed(true);
    clock.advance(29 * MINUTE);
    await settle();
    expect(seen.stop).toBeNull();
    const page = await openSocket(running.url, running.url);
    await idleArmed(false);
    clock.advance(120 * MINUTE);
    await settle();
    expect(seen.stop).toBeNull();

    page.close();
    const reloaded = await openSocket(running.url, running.url);
    await settle();
    clock.advance(120 * MINUTE);
    await settle();
    expect(seen.stop).toBeNull();

    reloaded.close();
    await idleArmed(true);
    clock.advance(30 * MINUTE - 1);
    await settle();
    expect(seen.stop).toBeNull();
    clock.advance(1);
    await expect(running.stopped).resolves.toEqual({
      reason: "idle",
      message: "Arcue stops: no page was open for 30 minutes.",
    });
  });

  it("counts the idle time again from each open while no page is connected", async () => {
    const clock = new ManualClock();
    const running = await serve({
      idleStopMs: 30 * MINUTE,
      setTimer: (ms, run) => clock.setTimer(ms, run),
      heartbeatMs: 1e9,
      checkMs: 1e9,
    });
    const seen = watchStop(running);
    const connection = await connectToCore(userData, "serve");

    clock.advance(29 * MINUTE);
    await expect(connection?.client.execute("asset.openInView", { path: model(), view: "a" })).resolves.toMatchObject({
      shown: "held",
    });
    clock.advance(2 * MINUTE);
    await settle();
    expect(seen.stop).toBeNull();
    clock.advance(28 * MINUTE - 1);
    await settle();
    expect(seen.stop).toBeNull();
    clock.advance(1);
    await expect(running.stopped).resolves.toMatchObject({ reason: "idle" });
    connection?.close();
  });

  it("starts no idle time for opens from the command line while a page is connected", async () => {
    const clock = new ManualClock();
    const running = await serve({
      idleStopMs: 30 * MINUTE,
      setTimer: (ms, run) => clock.setTimer(ms, run),
      heartbeatMs: 1e9,
      checkMs: 1e9,
    });
    const seen = watchStop(running);
    const page = await openSocket(running.url, running.url);
    windowClient(page);
    await vi.waitFor(() => expect(clock.pendingTimers).toBe(2), { timeout: 5000 });
    const connection = await connectToCore(userData, "serve");

    await expect(connection?.client.execute("asset.open", { path: model() })).resolves.toMatchObject({
      assetId: expect.any(String),
    });
    await expect(
      connection?.client.execute("asset.openInView", { path: model("Crate.fbx"), view: "a" }),
    ).resolves.toMatchObject({ shown: "held" });
    expect(clock.pendingTimers).toBe(2);
    clock.advance(31 * MINUTE);
    await settle();

    expect(seen.stop).toBeNull();
    connection?.close();
    page.close();
  });

  it("never stops by itself for want of a page in the foreground", async () => {
    const clock = new ManualClock();
    const running = await serve({ setTimer: (ms, run) => clock.setTimer(ms, run), heartbeatMs: 1e9, checkMs: 1e9 });
    const seen = watchStop(running);

    clock.advance(24 * 60 * MINUTE);
    await settle();

    expect(seen.stop).toBeNull();
  });

  it("drops a page that does not answer its pings, and keeps one that does", async () => {
    const running = await serve({ heartbeatMs: 50 });
    const silent = await openSocket(running.url, running.url, SERVE_CORE_PATH, { autoPong: false });
    const answering = await openSocket(running.url, running.url);
    const dropped = new Promise((resolve) => silent.once("close", resolve));

    await dropped;
    await sleep(200);

    expect(answering.readyState).toBe(WebSocket.OPEN);
    answering.close();
  });

  it("stops when its page is asked for and index.html is gone", async () => {
    const running = await serve();
    rmSync(join(webUi, "index.html"));

    expect((await get(running.url, "/")).status).toBe(404);

    await expect(running.stopped).resolves.toEqual({
      reason: "removed",
      message: `Arcue stops: its files in ${webUi} were removed. Run arcue serve --detach to start the current one.`,
    });
  });

  it("stops when its web UI or its import worker is removed, with no request", async () => {
    const first = await serve({ checkMs: 20 });
    rmSync(join(temp, "import-worker.js"));
    await expect(first.stopped).resolves.toMatchObject({
      reason: "removed",
      message: `Arcue stops: its files in ${temp} were removed. Run arcue serve --detach to start the current one.`,
    });
    await first.close();
    writeFileSync(join(temp, "import-worker.js"), "");

    const second = await serve({ checkMs: 20 });
    rmSync(join(webUi, "index.html"));
    await expect(second.stopped).resolves.toMatchObject({ reason: "removed" });
  });
});
