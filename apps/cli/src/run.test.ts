import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import type { Server } from "node:net";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { connectToCore, isRunning } from "@arcue/platform-node";
import type { FakeCore, FakeCoreOptions } from "@arcue/platform-node/test";
import { holdStartLock, sleeper, startFakeCore, writeLastCoreFile } from "@arcue/platform-node/test";
import { BRIDGE_INFO_FILE, LAST_CORE_FILE, SERVE_INFO_FILE, viewAddress } from "@arcue/protocol";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { RunOptions } from "./run";
import { run } from "./run";
import { startServer } from "./serve";
import { sessionView } from "./session-view";
import { buildFixture } from "./test-build";
import { killStarted } from "./test-pids";

vi.mock("./serve", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./serve")>();
  return { ...actual, startServer: vi.fn(actual.startServer) };
});

const SERVE_URL = "http://localhost:4530";
const OTHER_BUILD = "It runs from another arcue build: run arcue stop, then arcue serve --detach to use this one.";
const session = { ARCUE_VIEW: "review" };
const view = sessionView(session) ?? "";

let userData: string;
let fakes: FakeCore[];
let owned: { pid: number; kill(): void }[];

function capture() {
  const lines = { out: "", err: "" };
  return {
    lines,
    output: { out: (text: string) => (lines.out += text), err: (text: string) => (lines.err += text) },
  };
}

/** The environment of a person at a terminal, with the test's data folder. */
function env(more: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return { ARCUE_USER_DATA: userData, ...more };
}

async function arcue(
  args: string[],
  options: RunOptions = {},
  more: NodeJS.ProcessEnv = {},
): Promise<{ code: number; out: string; err: string }> {
  const { lines, output } = capture();
  const code = await run(args, output, env(more), userData, options);
  return { code, ...lines };
}

const asset = { assetId: "a1", path: "/work/Hero.fbx", name: "Hero.fbx", status: "ready", version: "v1", error: null };

async function fake(options: Partial<FakeCoreOptions> & Pick<FakeCoreOptions, "file">): Promise<FakeCore> {
  const core = await startFakeCore(userData, { answers: { "asset.list": () => ({ assets: [] }) }, ...options });
  fakes.push(core);
  return core;
}

const serve = (options: Partial<FakeCoreOptions> = {}) =>
  fake({ file: SERVE_INFO_FILE, kind: "serve", locks: 1, url: SERVE_URL, ...options });
const desktop = (options: Partial<FakeCoreOptions> = {}) =>
  fake({ file: BRIDGE_INFO_FILE, kind: "desktop", locks: 1, ...options });

/** A process this test owns, for a fake core's pid that a stop can end. */
function ownedProcess(): { pid: number; kill(): void } {
  const child = sleeper();
  owned.push(child);
  return child;
}

interface ChildRecord {
  argv: string[];
  cwd: string;
  pid: number;
  userData: string | undefined;
  lastCore: unknown;
}

/** What the fixture that stands in for a detached `arcue serve` recorded last. */
function readRecord(): ChildRecord | null {
  try {
    return JSON.parse(readFileSync(join(userData, "detach-child.json"), "utf8")) as ChildRecord;
  } catch {
    return null;
  }
}

beforeEach(() => {
  userData = realpathSync(mkdtempSync(join(tmpdir(), "arcue-run-")));
  fakes = [];
  owned = [];
});

afterEach(async () => {
  const record = readRecord();
  const script = record?.argv[0];
  if (record && script !== undefined) killStarted(record.pid, script);
  for (const child of owned) child.kill();
  await Promise.all(fakes.map((core) => core.close()));
  rmSync(userData, { recursive: true, force: true });
});

describe("arcue setup", () => {
  it("says there is nothing to set up when arcue runs on Node 24 or later", async () => {
    const { lines, output } = capture();

    const code = await run(["setup"], output, {}, process.cwd(), {
      node: { version: "24.9.0", execPath: "/usr/local/bin/node" },
    });

    expect(code).toBe(0);
    expect(lines.out).toBe("Arcue runs on Node 24.9.0 at /usr/local/bin/node, so there is nothing to set up.\n");
  });

  it("exits with 3 from setup on an older Node", async () => {
    const { lines, output } = capture();

    const code = await run(["setup"], output, {}, process.cwd(), {
      node: { version: "22.12.0", execPath: "/usr/bin/node" },
    });

    expect(code).toBe(3);
    expect(lines.err.startsWith("Arcue needs Node 24 or later, and runs on Node 22.12.0 at /usr/bin/node.")).toBe(true);
  });
});

describe("arcue status", () => {
  const pid = process.pid;
  const servedBlock = `Arcue is running in a browser at ${SERVE_URL} (process ${pid}).\nNo assets are open.`;
  const appBlock = `The Arcue app is running (process ${pid}).\nOpen assets:\n  a1  ready    /work/Hero.fbx`;

  it("reports Arcue in the browser with this session's view", async () => {
    await serve();

    expect(await arcue(["status"])).toEqual({ code: 0, out: `${servedBlock}\n`, err: "" });
    expect(await arcue(["status"], {}, session)).toEqual({
      code: 0,
      out: `Arcue is running in a browser at ${SERVE_URL} (process ${pid}).\nThis session's view: ${viewAddress(SERVE_URL, view)}\nNo assets are open.\n`,
      err: "",
    });
  });

  it("reports the desktop app, an older one, and both cores, Arcue in the browser first", async () => {
    const app = await desktop({ answers: { "asset.list": () => ({ assets: [asset] }) } });
    expect(await arcue(["status"])).toEqual({ code: 0, out: `${appBlock}\n`, err: "" });

    await serve();
    expect(await arcue(["status"])).toEqual({ code: 0, out: `${servedBlock}\n\n${appBlock}\n`, err: "" });

    await app.close();
    await desktop({ kind: undefined, locks: undefined });
    expect(await arcue(["status"])).toEqual({
      code: 0,
      out: `${servedBlock}\n\nAn older Arcue app is running (process ${pid}).\nNo assets are open.\n`,
      err: "",
    });
  });

  it("reports an older arcue serve at bridge.json as Arcue in the browser", async () => {
    await desktop({ kind: undefined, locks: undefined, url: SERVE_URL });

    expect(await arcue(["status"], {}, session)).toEqual({
      code: 0,
      out: `Arcue is running in a browser at ${SERVE_URL} (process ${pid}).\nIt is older than this arcue command: run arcue stop, then arcue serve --detach.\nThis session's view: ${viewAddress(SERVE_URL, view)}\nNo assets are open.\n`,
      err: "",
    });
  });

  it("never calls a core with another lock protocol older, nor says to stop it", async () => {
    const other = "It runs another version of Arcue, which can't share reviews with this arcue command.";
    const browser = await serve({ locks: 2 });
    expect(await arcue(["status"])).toEqual({
      code: 0,
      out: `Arcue is running in a browser at ${SERVE_URL} (process ${pid}).\n${other}\nNo assets are open.\n`,
      err: "",
    });

    await browser.close();
    await desktop({ locks: 2 });
    expect(await arcue(["status"])).toEqual({
      code: 0,
      out: `The Arcue app is running (process ${pid}).\n${other}\nNo assets are open.\n`,
      err: "",
    });
  });

  it("says on stderr which core does not answer", async () => {
    await serve({ refuse: true });
    const refusal = `Arcue in the browser at ${SERVE_URL} (process ${pid}) does not answer: Arcue refused the connection. The token does not match the running app.\n`;
    expect(await arcue(["status"])).toEqual({ code: 1, out: "", err: refusal });

    await desktop({ answers: { "asset.list": () => ({ assets: [asset] }) } });
    expect(await arcue(["status"])).toEqual({ code: 0, out: `${appBlock}\n`, err: refusal });
  });

  it("says Arcue in the browser runs from another build when both builds are known", async () => {
    await serve({ build: "b".repeat(16) });

    expect((await arcue(["status"], { build: "a".repeat(16) })).out).toBe(
      `Arcue is running in a browser at ${SERVE_URL} (process ${pid}).\n${OTHER_BUILD}\nNo assets are open.\n`,
    );
    expect((await arcue(["status"], { build: "b".repeat(16) })).out).toBe(`${servedBlock}\n`);
    expect((await arcue(["status"], { build: null })).out).toBe(`${servedBlock}\n`);
  });

  it("exits with 1 when nothing runs", async () => {
    expect(await arcue(["status"])).toEqual({ code: 1, out: "Arcue is not running.\n", err: "" });
  });
});

describe("arcue open with Arcue in the browser", () => {
  it("says Arcue in the browser stopped while it opened the model", async () => {
    writeFileSync(join(userData, "Hero.fbx"), "fbx");
    await serve({
      answers: {
        "asset.openInView": (_input, core) => {
          core.disconnect();
          return new Promise(() => undefined);
        },
      },
    });

    expect(await arcue(["open", "Hero.fbx"], {}, session)).toEqual({
      code: 1,
      out: "",
      err: `Arcue in the browser stopped while opening ${join(userData, "Hero.fbx")}. Run arcue serve --detach, then arcue open again.\n`,
    });
  });

  it("names the view's address when a session's open waits there for its page", async () => {
    writeFileSync(join(userData, "Hero.fbx"), "fbx");
    await serve({ answers: { "asset.openInView": () => ({ assetId: "a3", shown: "held" }) } });
    const terminal = { CLAUDE_CODE_SESSION_ID: "c3a1d6f0-8e2b-4b1c-9d7e-2f5a6b8c0e14" };

    const { code, out } = await arcue(["open", "Hero.fbx"], {}, terminal);

    expect(code).toBe(0);
    expect(out).toBe(
      `Arcue holds ${join(userData, "Hero.fbx")} as a3 until this session's page opens. Open ${viewAddress(SERVE_URL, sessionView(terminal) ?? "")} in the built-in browser and keep it open.\n`,
    );
  });
});

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  await new Promise((resolve) => server.close(resolve));
  if (typeof address !== "object" || !address) throw new Error("No port was free.");
  return address.port;
}

describe("arcue serve", () => {
  it("says it waits for a browser when an open outside views arrives before it has started", async () => {
    const webUi = join(userData, "web");
    mkdirSync(webUi);
    writeFileSync(join(webUi, "index.html"), "<!doctype html>");
    writeFileSync(join(userData, "import-worker.js"), "");
    const port = await freePort();
    const { startServer: startActual } = await vi.importActual<typeof import("./serve")>("./serve");
    const stop = Promise.withResolvers<void>();
    vi.mocked(startServer).mockImplementationOnce(async (serveOptions) => {
      const asked = Promise.withResolvers<void>();
      const started = await startActual({
        ...serveOptions,
        onWaitingForWindow: (url) => {
          try {
            serveOptions.onWaitingForWindow?.(url);
          } finally {
            asked.resolve();
          }
        },
      });
      const connection = await connectToCore(serveOptions.userData, "serve");
      connection?.client.execute("asset.open", { path: join(userData, "Hero.fbx") }).catch(() => undefined);
      await asked.promise;
      connection?.close();
      stop.resolve();
      return started;
    });

    const result = await arcue(["serve", "--port", String(port)], {
      webUi,
      importWorkerEntry: join(userData, "import-worker.js"),
      build: null,
      stop: stop.promise,
    });

    expect(result).toEqual({
      code: 0,
      out: `Arcue runs at http://localhost:${port}. Open it in a browser; agents' "arcue open" shows their models there.\n`,
      err: `Waiting for a browser to open http://localhost:${port}.\n`,
    });
  });
});

describe("arcue serve --detach", { timeout: 20_000 }, () => {
  let fixtures: string;
  let script: string;

  beforeAll(async () => {
    fixtures = realpathSync(mkdtempSync(join(tmpdir(), "arcue-run-fixture-")));
    script = await buildFixture("detach-child", fixtures);
  }, 60_000);

  afterAll(() => {
    rmSync(fixtures, { recursive: true, force: true });
  });

  /** Runs `serve --detach` with the fixture, in the given mode, standing in for the `arcue serve` it starts. */
  function detach(args: string[], mode: string, options: RunOptions = {}, more: NodeJS.ProcessEnv = {}) {
    return arcue(
      ["serve", "--detach", ...args],
      { self: { execPath: process.execPath, script }, build: null, detachTimeoutMs: 10_000, ...options },
      { ARCUE_FIXTURE: mode, ...more },
    );
  }

  it("starts arcue serve in the background with an absolute data folder, and prints its address and view", async () => {
    const { code, out, err } = await detach(
      ["--port", "4531"],
      "serve",
      {},
      { ...session, ARCUE_USER_DATA: relative(process.cwd(), userData) },
    );

    const record = readRecord();
    expect(err).toBe("");
    expect(code).toBe(0);
    expect(record).toMatchObject({
      argv: [script, "serve", "--port", "4531", "--idle-stop-ms", "1800000"],
      cwd: userData,
      userData,
      lastCore: { version: 1, kind: "serve" },
    });
    expect(out).toBe(
      `Arcue runs in a browser at http://localhost:4531 (process ${record?.pid}). It stops by itself after 30 minutes with no page open.\nThis session's view: ${viewAddress("http://localhost:4531", view)}\n`,
    );
    expect(isRunning(record?.pid ?? 0)).toBe(true);
    expect(await arcue(["stop"])).toMatchObject({
      code: 0,
      out: `Stopped Arcue in the browser at http://localhost:4531 (process ${record?.pid}).\n`,
    });
  });

  it("lets go of the arcue serve it started, so the command can exit while that one runs", async () => {
    const children = () => process.getActiveResourcesInfo().filter((name) => name === "ProcessWrap").length;
    const before = children();

    expect(await detach(["--port", "4532"], "serve")).toMatchObject({ code: 0, err: "" });

    expect(isRunning(readRecord()?.pid ?? 0)).toBe(true);
    expect(children()).toBe(before);
  });

  it("prints the address of Arcue in the browser that runs, unless --port names another", async () => {
    const running = await serve({ url: "http://localhost:80" });
    const already = `Arcue already runs in a browser at http://localhost:80 (process ${process.pid}).`;

    expect(await detach([], "serve")).toEqual({ code: 0, out: `${already}\n`, err: "" });
    expect(await detach(["--port", "80"], "serve", {}, session)).toEqual({
      code: 0,
      out: `${already}\nThis session's view: ${viewAddress("http://localhost:80", view)}\n`,
      err: "",
    });
    expect(await detach(["--port", "81"], "serve")).toEqual({
      code: 1,
      out: `${already} Run arcue stop first to run it on port 81.\n`,
      err: "",
    });
    expect(readRecord()).toBeNull();
    expect(running.requests.map((request) => request.name)).not.toContain("serve.stop");
  });

  it("leaves Arcue in the browser of another build running, and says so", async () => {
    const running = await serve({ build: "b".repeat(16) });

    expect(await detach([], "serve", { build: "a".repeat(16) })).toEqual({
      code: 0,
      out: `Arcue already runs in a browser at ${SERVE_URL} (process ${process.pid}).\n${OTHER_BUILD}\n`,
      err: "",
    });
    expect(readRecord()).toBeNull();
    expect(running.requests.map((request) => request.name)).not.toContain("serve.stop");
    expect((await arcue(["status"])).code).toBe(0);
  });

  it("refuses beside a core that does not answer or takes no review locks", async () => {
    const refusing = await serve({ refuse: true });
    expect(await detach([], "serve")).toEqual({
      code: 1,
      out: "",
      err: `Arcue in the browser at ${SERVE_URL} (process ${process.pid}) does not answer: Arcue refused the connection. The token does not match the running app.\n`,
    });
    await refusing.close();

    await desktop({ kind: undefined, locks: undefined, url: SERVE_URL });
    expect(await detach([], "serve")).toEqual({
      code: 1,
      out: "",
      err: `An older arcue serve runs at ${SERVE_URL} (process ${process.pid}) and can't share reviews with this one. Run arcue stop, then try again.\n`,
    });
    expect(readRecord()).toBeNull();
  });

  it("prints what arcue serve said when it exits before it answers", async () => {
    expect(await detach(["--port", "4531"], "port-taken")).toEqual({
      code: 1,
      out: "",
      err: "Port 4531 is in use. Choose another with --port.\n",
    });

    const log = join(userData, "logs", "serve.log");
    expect(await detach(["--port", "4531"], "quiet-exit")).toEqual({
      code: 1,
      out: "",
      err: `arcue serve exited with code 3 before it answered. Its log is ${log}.\n`,
    });
  });

  it("starts the log again past 1 MiB and prints only what the new arcue serve said", async () => {
    const logs = join(userData, "logs");
    mkdirSync(logs, { recursive: true });
    writeFileSync(join(logs, "serve.log"), "An older line.\n".repeat(80_000));

    expect(await detach(["--port", "4531"], "port-taken")).toMatchObject({
      code: 1,
      err: "Port 4531 is in use. Choose another with --port.\n",
    });
    expect(readFileSync(join(logs, "serve.old.log"), "utf8")).toContain("An older line.");
    expect(readFileSync(join(logs, "serve.log"), "utf8")).toBe("Port 4531 is in use. Choose another with --port.\n");
  });

  it("stops arcue serve when it does not answer in time", async () => {
    const { code, out } = await detach(["--port", "4531"], "sleep", { detachTimeoutMs: 2000 });

    expect(code).toBe(1);
    expect(out).toBe(
      `Arcue in the browser did not answer within 2 seconds, so it was stopped. Its log is ${join(userData, "logs", "serve.log")}.\n`,
    );
    const pid = readRecord()?.pid ?? 0;
    await vi.waitFor(() => expect(isRunning(pid)).toBe(false), { timeout: 5000 });
  });

  it("says why it could not start arcue serve", async () => {
    const node = join(userData, "no-node");

    expect(await detach([], "serve", { self: { execPath: node, script } })).toEqual({
      code: 1,
      out: `Could not start Arcue in the browser: spawn ${node} ENOENT\n`,
      err: "",
    });
    expect(
      await detach([], "serve", { self: { execPath: process.execPath, script: join(userData, "arcue.js") } }),
    ).toEqual({ code: 1, out: `This arcue has no arcue.js in ${userData}.\n`, err: "" });
  });

  it("runs on the port Arcue in the browser ran on last while it is free, otherwise on 4530", async () => {
    const port = await freePort();
    writeLastCoreFile(userData, "serve", `http://localhost:${port}`);

    expect((await detach([], "serve")).code).toBe(0);
    expect(readRecord()?.argv.slice(2, 4)).toEqual(["--port", String(port)]);
    expect((await arcue(["stop"])).code).toBe(0);

    const taken: Server = createServer();
    await new Promise<void>((resolve) => taken.listen(port, "127.0.0.1", resolve));
    try {
      expect((await detach([], "serve")).code).toBe(0);
      expect(readRecord()?.argv.slice(2, 4)).toEqual(["--port", "4530"]);
    } finally {
      await new Promise((resolve) => taken.close(resolve));
    }
    expect(JSON.parse(readFileSync(join(userData, LAST_CORE_FILE), "utf8"))).toMatchObject({ kind: "serve" });
  });
});

describe("arcue stop", () => {
  const signals: [number, NodeJS.Signals][] = [];
  const options = (more: RunOptions = {}): RunOptions => ({
    signal: (pid, signal) => {
      signals.push([pid, signal]);
    },
    platform: "linux",
    ...more,
  });

  beforeEach(() => {
    signals.length = 0;
  });

  it("asks Arcue in the browser to stop and waits for its process, also when the reply is lost", async () => {
    const child = ownedProcess();
    const running = await serve({
      pid: child.pid,
      answers: {
        "serve.stop": (_input, core) => {
          core.disconnect();
          setTimeout(() => child.kill(), 200);
          return new Promise(() => undefined);
        },
      },
    });

    expect(await arcue(["stop"], options())).toEqual({
      code: 0,
      out: `Stopped Arcue in the browser at ${SERVE_URL} (process ${child.pid}).\n`,
      err: "",
    });
    expect(running.requests.map((request) => request.name)).toEqual(["serve.stop"]);
    expect(signals).toEqual([]);
  });

  it("counts a process that lingers once its bridge file and socket are gone as stopped", async () => {
    const child = ownedProcess();
    await serve({
      pid: child.pid,
      answers: {
        "serve.stop": (_input, core) => {
          void core.close();
        },
      },
    });
    const started = Date.now();

    expect(await arcue(["stop"], options())).toMatchObject({
      code: 0,
      out: `Stopped Arcue in the browser at ${SERVE_URL} (process ${child.pid}).\n`,
    });
    expect(Date.now() - started).toBeGreaterThan(9000);
    expect(isRunning(child.pid)).toBe(true);
  }, 30_000);

  it("says so when Arcue in the browser does not stop in time", async () => {
    const child = ownedProcess();
    await serve({ pid: child.pid, answers: { "serve.stop": () => undefined } });

    expect(await arcue(["stop"], options({ stopTimeoutMs: 2000 }))).toEqual({
      code: 1,
      out: `Arcue in the browser (process ${child.pid}) did not stop within 2 seconds.\n`,
      err: "",
    });
  });

  it("never stops the desktop app, also an older one", async () => {
    const app = await desktop({ pid: ownedProcess().pid });

    expect(await arcue(["stop"], options())).toEqual({ code: 0, out: "Arcue is not running in a browser.\n", err: "" });
    expect(app.requests).toEqual([]);
    expect(signals).toEqual([]);

    await app.close();
    const older = await desktop({ kind: undefined, locks: undefined, pid: ownedProcess().pid });

    expect(await arcue(["stop"], options())).toEqual({ code: 0, out: "Arcue is not running in a browser.\n", err: "" });
    expect(older.requests).toEqual([]);
    expect(signals).toEqual([]);
  });

  it("exits with 0 when nothing runs", async () => {
    expect(await arcue(["stop"], options())).toEqual({ code: 0, out: "Arcue is not running in a browser.\n", err: "" });
  });

  it("stops an older arcue serve with SIGTERM, except on Windows", async () => {
    const child = ownedProcess();
    const older = await desktop({ kind: undefined, locks: undefined, url: SERVE_URL, pid: child.pid });

    expect(await arcue(["stop"], options({ platform: "win32" }))).toEqual({
      code: 1,
      out: `The arcue serve at ${SERVE_URL} (process ${child.pid}) is older than this arcue command and cannot be stopped by it. Stop it where it runs.\n`,
      err: "",
    });
    expect(signals).toEqual([]);

    const ending = options({
      signal: (pid, signal) => {
        signals.push([pid, signal]);
        child.kill();
        void older.close();
      },
    });
    expect(await arcue(["stop"], ending)).toEqual({
      code: 0,
      out: `Stopped the older arcue serve at ${SERVE_URL} (process ${child.pid}).\n`,
      err: "",
    });
    expect(signals).toEqual([[child.pid, "SIGTERM"]]);
  });

  it("stops nothing when Arcue in the browser does not answer", async () => {
    const child = ownedProcess();
    await serve({ pid: child.pid, refuse: true });

    expect(await arcue(["stop"], options())).toEqual({
      code: 1,
      out: `Arcue in the browser at ${SERVE_URL} (process ${child.pid}) does not answer, so it was not stopped: Arcue refused the connection. The token does not match the running app.\n`,
      err: "",
    });
    expect(signals).toEqual([]);
    expect(isRunning(child.pid)).toBe(true);
  });

  it("waits for an Arcue that is starting, then stops it", async () => {
    const holder = holdStartLock(userData);
    owned.push(holder);
    let settled = false;
    const stopping = arcue(["stop"], options()).finally(() => {
      settled = true;
    });

    await sleep(500);
    expect(settled).toBe(false);
    const child = ownedProcess();
    await serve({
      pid: child.pid,
      answers: {
        "serve.stop": () => {
          child.kill();
        },
      },
    });
    holder.release();

    expect(await stopping).toEqual({
      code: 0,
      out: `Stopped Arcue in the browser at ${SERVE_URL} (process ${child.pid}).\n`,
      err: "",
    });
  });
});
