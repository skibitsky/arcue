import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import type { IncomingHttpHeaders } from "node:http";
import { request } from "node:http";
import { connect, createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CoreClient } from "@arcue/protocol";
import {
  BRIDGE_INFO_FILE,
  binaryFrameCodec,
  bridgeInfoSchema,
  createPeer,
  createRemoteClient,
  framedEndpoint,
  messageChannel,
  SERVE_CORE_PATH,
} from "@arcue/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { connectToApp } from "./app-connection";
import type { ArcueServer, ServeOptions } from "./serve";
import { localHosts, startServer } from "./serve";

let temp: string;
let userData: string;
let webUi: string;
let server: ArcueServer | null;
const errors: unknown[] = [];

beforeEach(() => {
  temp = realpathSync(mkdtempSync(join(tmpdir(), "arcue-serve-")));
  userData = join(temp, "data");
  webUi = join(temp, "web");
  mkdirSync(join(webUi, "assets"), { recursive: true });
  writeFileSync(join(webUi, "index.html"), "<!doctype html><title>Arcue</title>");
  writeFileSync(join(webUi, "assets", "index-abc.js"), "export {};");
  writeFileSync(join(temp, "secret.txt"), "secret");
  server = null;
});

afterEach(async () => {
  await server?.close();
  rmSync(temp, { recursive: true, force: true });
  errors.length = 0;
});

function options(overrides: Partial<ServeOptions> = {}): ServeOptions {
  return {
    userData,
    importWorkerEntry: join(temp, "import-worker.js"),
    webUi,
    port: 0,
    onError: (error) => errors.push(error),
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

function openSocket(url: string, origin: string, path = SERVE_CORE_PATH): Promise<WebSocket> {
  const socket = new WebSocket(`${url.replace("http:", "ws:")}${path}`, { origin });
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

/** A window's connection to the core over the page's socket. */
function windowClient(socket: WebSocket): CoreClient {
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
  return createRemoteClient(createPeer(framedEndpoint(channel)));
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

    const info = bridgeInfoSchema.parse(JSON.parse(readFileSync(join(userData, BRIDGE_INFO_FILE), "utf8")));
    expect(info.url).toBe(url);
    const connection = await connectToApp(userData);
    expect(connection?.info.url).toBe(url);
    await expect(connection?.client.query("asset.list", {})).resolves.toEqual({ assets: [] });
    connection?.close();
  });

  it("refuses to start while Arcue runs", async () => {
    const { url } = await serve();

    await expect(startServer(options())).rejects.toThrow(`Arcue is already running at ${url}`);
  });

  it("removes bridge.json when it stops", async () => {
    await (await serve()).close();
    server = null;

    expect(existsSync(join(userData, BRIDGE_INFO_FILE))).toBe(false);
  });

  it("asks for another port when its port is taken", async () => {
    const taken = createServer();
    await new Promise<void>((resolve) => taken.listen(0, "127.0.0.1", resolve));
    const address = taken.address();
    const port = typeof address === "object" && address ? address.port : 0;

    await expect(serve({ port })).rejects.toThrow(`Port ${port} is in use. Choose another with --port.`);
    expect(existsSync(join(userData, BRIDGE_INFO_FILE))).toBe(false);
    taken.close();
  });

  it("needs its web UI", async () => {
    await expect(serve({ webUi: join(temp, "nowhere") })).rejects.toThrow("has no web UI");
  });
});
