import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readBridgeInfo } from "@arcue/platform-node";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ServeHereOptions } from "./serve-here";
import { ServeHere, startsItself } from "./serve-here";
import { stopServe } from "./stop";

let temp: string;
let userData: string;
let servers: ServeHere[];

beforeEach(() => {
  temp = realpathSync(mkdtempSync(join(tmpdir(), "arcue-serve-here-")));
  userData = join(temp, "data");
  mkdirSync(join(temp, "web"), { recursive: true });
  writeFileSync(join(temp, "web", "index.html"), "<!doctype html><title>Arcue</title>");
  writeFileSync(join(temp, "import-worker.js"), "");
  servers = [];
});

afterEach(async () => {
  await Promise.all(servers.map((server) => server.close()));
  rmSync(temp, { recursive: true, force: true });
});

function serveHere(overrides: Partial<ServeHereOptions> = {}): ServeHere {
  const server = new ServeHere({
    userData,
    importWorkerEntry: join(temp, "import-worker.js"),
    webUi: join(temp, "web"),
    port: 0,
    onError: () => undefined,
    ...overrides,
  });
  servers.push(server);
  return server;
}

describe("Arcue in the browser in this process", () => {
  it("is what a Node in an Electron utility process runs, which can't start its program again as Node", () => {
    expect(startsItself({})).toBe(true);
    expect(startsItself({ type: "utility" })).toBe(false);
    expect(startsItself(process)).toBe(true);
  });

  it("starts once, answers at serve.json, and stops with the server", async () => {
    const here = serveHere();
    await Promise.all([here.start(), here.start()]);
    const info = await readBridgeInfo(userData, "serve");
    expect(info).toMatchObject({ pid: process.pid, hosted: true });

    await here.start();
    expect((await readBridgeInfo(userData, "serve"))?.url).toBe(info?.url);

    await here.close();
    expect(await readBridgeInfo(userData, "serve")).toBeNull();
  });

  it("leaves Arcue in the browser that runs already to run, and starts again once it stopped by itself", async () => {
    const stops: string[] = [];
    const first = serveHere({ idleStopMs: 50, onStopped: (message) => stops.push(message) });
    await first.start();
    const second = serveHere();
    await second.start();
    expect((await readBridgeInfo(userData, "serve"))?.pid).toBe(process.pid);

    await vi.waitFor(async () => expect(await readBridgeInfo(userData, "serve")).toBeNull());
    expect(stops).toEqual([expect.stringContaining("no page was open")]);
    await first.start();
    expect((await readBridgeInfo(userData, "serve"))?.pid).toBe(process.pid);
  });

  it("leaves it to the other when two start at once, and starts no more once closed", async () => {
    const first = serveHere();
    const second = serveHere();
    await expect(Promise.all([first.start(), second.start()])).resolves.toEqual([undefined, undefined]);
    expect((await readBridgeInfo(userData, "serve"))?.pid).toBe(process.pid);

    await Promise.all([first.close(), second.close()]);
    expect(await readBridgeInfo(userData, "serve")).toBeNull();
    await expect(first.start()).rejects.toThrow("Arcue's MCP server is closing.");
  });

  it("stops at once for arcue stop, though its process goes on", async () => {
    const stops: string[] = [];
    const here = serveHere({ onStopped: (message) => stops.push(message) });
    await here.start();
    const lines: string[] = [];
    const output = { out: (text: string) => lines.push(text), err: (text: string) => lines.push(text) };

    const started = performance.now();
    expect(await stopServe({ ARCUE_USER_DATA: userData }, output, {})).toBe(0);
    expect(performance.now() - started).toBeLessThan(5000);
    expect(lines.join("")).toContain("Stopped Arcue in the browser");
    expect(stops).toEqual([expect.stringContaining("arcue stop")]);
  });
});
