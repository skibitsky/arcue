import type { ChildProcess } from "node:child_process";
import { execFile, spawn } from "node:child_process";
import { appendFileSync, cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import type { Server } from "node:net";
import { createServer } from "node:net";
import { basename, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { connectToCore, isRunning, readBridgeInfo } from "@arcue/platform-node";
import { writeLastCoreFile } from "@arcue/platform-node/test";
import { LAST_CORE_FILE } from "@arcue/protocol";
import { afterEach, beforeEach, describe, expect, inject, it, vi } from "vitest";
import { outsideSessions } from "./session-view";
import { registerPid } from "./test-pids";

const processRun = inject("processRun");
const posix = process.platform !== "win32";

let userData: string;
let children: ChildProcess[];

interface Result {
  code: number | null;
  signal: NodeJS.Signals | null;
  out: string;
  err: string;
}

/** The test's environment for arcue: its own data folder, and no agent session's variables. */
function env(more: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return outsideSessions({ ...process.env, ARCUE_USER_DATA: userData, ...more });
}

/** Runs the built arcue as a person's terminal or an agent's shell does, collecting its output until it exits. */
function arcue(
  args: string[],
  options: { env?: NodeJS.ProcessEnv; cwd?: string; script?: string } = {},
): Promise<Result> {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [options.script ?? processRun.arcue, ...args],
      { env: options.env ?? env(), cwd: options.cwd ?? processRun.folder, timeout: 90_000 },
      (error, stdout, stderr) => {
        const failed = error as (Error & { code?: number | string; signal?: NodeJS.Signals }) | null;
        resolve({
          code: failed ? (typeof failed.code === "number" ? failed.code : null) : 0,
          signal: failed?.signal ?? null,
          out: stdout,
          err: stderr,
        });
      },
    );
  });
}

/** Starts a process this test owns, recording it so the run's teardown can end it. */
function start(command: string, args: string[], options: { env?: NodeJS.ProcessEnv; detached?: boolean } = {}) {
  const child = spawn(command, args, {
    env: options.env ?? env(),
    cwd: processRun.folder,
    stdio: ["ignore", "pipe", "pipe"],
    detached: options.detached ?? false,
  });
  if (child.pid !== undefined) registerPid(processRun.folder, child.pid);
  children.push(child);
  const output = { out: "", err: "" };
  child.stdout?.on("data", (chunk: Buffer) => {
    output.out += chunk.toString();
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    output.err += chunk.toString();
  });
  const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
    child.once("close", (code, signal) => resolve({ code, signal }));
  });
  return { child, output, exited };
}

/** The pid of the serve core that answers at `serve.json`, recorded for the run's teardown. */
async function servePid(): Promise<number> {
  const connection = await connectToCore(userData, "serve");
  connection?.close();
  const pid = connection?.info.pid;
  if (pid === undefined) throw new Error("No Arcue in the browser answers.");
  registerPid(processRun.folder, pid);
  return pid;
}

/** The options that load a fixture into the built arcue before it runs. */
function preload(fixture: keyof typeof processRun.fixtures): string[] {
  return ["--import", pathToFileURL(processRun.fixtures[fixture]).href];
}

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  await new Promise((resolve) => server.close(resolve));
  if (typeof address !== "object" || !address) throw new Error("No port was free.");
  return address.port;
}

const started = (port: number) =>
  new RegExp(
    `^Arcue runs in a browser at http://localhost:${port} \\(process (\\d+)\\)\\. It stops by itself after 30 minutes with no page open\\.\\n$`,
  );

beforeEach(() => {
  userData = mkdtempSync(join(processRun.folder, "data-"));
  children = [];
});

afterEach(async () => {
  if (existsSync(userData)) await arcue(["stop"]);
  for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  rmSync(userData, { recursive: true, force: true });
});

describe("arcue serve --detach", () => {
  it("returns while Arcue in the browser keeps running, holding none of the caller's pipes", async () => {
    const port = await freePort();
    const before = Date.now();

    const result = await arcue(["serve", "--detach", "--port", String(port)]);

    expect(Date.now() - before).toBeLessThan(10_000);
    expect(result).toMatchObject({ code: 0, err: "" });
    expect(result.out).toMatch(started(port));
    const pid = await servePid();
    expect(result.out).toContain(`(process ${pid})`);
    expect(isRunning(pid)).toBe(true);
    expect((await fetch(`http://127.0.0.1:${port}/`)).status).toBe(200);
  });

  it("reports Arcue in the browser that runs instead of starting another", async () => {
    const port = await freePort();
    await arcue(["serve", "--detach", "--port", String(port)]);
    const pid = await servePid();

    expect(await arcue(["serve", "--detach"])).toMatchObject({
      code: 0,
      out: `Arcue already runs in a browser at http://localhost:${port} (process ${pid}).\n`,
    });
  });

  it("starts one Arcue in the browser when two start it at once, and both say where it runs", async () => {
    const port = await freePort();

    const [first, second] = await Promise.all([
      arcue(["serve", "--detach", "--port", String(port)]),
      arcue(["serve", "--detach", "--port", String(port)]),
    ]);

    const pid = await servePid();
    for (const result of [first, second]) {
      expect(result.code, result.err).toBe(0);
      expect(result.out).toContain(`http://localhost:${port} (process ${pid})`);
    }
    expect([first, second].filter((result) => started(port).test(result.out))).toHaveLength(1);
    const log = readFileSync(join(userData, "logs", "serve.log"), "utf8");
    expect(log).not.toContain("is in use");
    expect(log).toContain(`Arcue is already running at http://localhost:${port} (process ${pid}).`);
  });

  it("says when its port is in use", async () => {
    const port = await freePort();
    const taken: Server = createServer();
    await new Promise<void>((resolve) => taken.listen(port, "127.0.0.1", resolve));
    try {
      expect(await arcue(["serve", "--detach", "--port", String(port)])).toMatchObject({
        code: 1,
        out: "",
        err: `Port ${port} is in use. Choose another with --port.\n`,
      });
    } finally {
      await new Promise((resolve) => taken.close(resolve));
    }
  });

  it("takes a data folder relative to the working folder, and creates one that does not exist yet", async () => {
    const port = await freePort();
    rmSync(userData, { recursive: true });
    const relative = join(basename(userData), "nested");

    const result = await arcue(["serve", "--detach", "--port", String(port)], {
      env: env({ ARCUE_USER_DATA: relative }),
      cwd: processRun.folder,
    });

    expect(result.code, result.err).toBe(0);
    userData = join(processRun.folder, relative);
    const pid = await servePid();
    expect(result.out).toContain(`(process ${pid})`);
    expect(await arcue(["status"])).toMatchObject({ code: 0 });
  });

  it.runIf(posix)("keeps starting when the caller is interrupted while it waits", async () => {
    const port = await freePort();
    const caller = start(process.execPath, [processRun.arcue, "serve", "--detach", "--port", String(port)]);
    await vi.waitFor(() => expect(existsSync(join(userData, LAST_CORE_FILE))).toBe(true), {
      timeout: 10_000,
      interval: 5,
    });
    await sleep(100);

    caller.child.kill("SIGINT");

    expect((await caller.exited).signal).toBe("SIGINT");
    await vi.waitFor(async () => expect(await connectToCore(userData, "serve")).not.toBeNull(), { timeout: 15_000 });
    const pid = await servePid();
    expect(pid).not.toBe(caller.child.pid);
  });

  it.runIf(posix)("keeps running when the shell that started it ends its process group", async () => {
    const port = await freePort();
    const shell = start(
      "sh",
      ["-c", `"$0" "$1" serve --detach --port ${port}; kill -TERM 0`, process.execPath, processRun.arcue],
      { detached: true },
    );

    expect((await shell.exited).signal).toBe("SIGTERM");
    expect(shell.output.out).toMatch(started(port));
    const pid = await servePid();
    await sleep(500);
    expect(isRunning(pid)).toBe(true);
  });

  it("reports a foreground arcue serve, which arcue stop then stops", async () => {
    const port = await freePort();
    const foreground = start(process.execPath, [processRun.arcue, "serve", "--port", String(port)]);
    await vi.waitFor(() => expect(foreground.output.out).toContain("Arcue runs at"), { timeout: 15_000 });
    const pid = foreground.child.pid;

    expect(await arcue(["serve", "--detach"])).toMatchObject({
      code: 0,
      out: `Arcue already runs in a browser at http://localhost:${port} (process ${pid}).\n`,
    });
    expect(await arcue(["stop"])).toMatchObject({
      code: 0,
      out: `Stopped Arcue in the browser at http://localhost:${port} (process ${pid}).\n`,
    });
    expect(await foreground.exited).toEqual({ code: 0, signal: null });
    expect(foreground.output.out).toBe(
      `Arcue runs at http://localhost:${port}. Open it in a browser; agents' "arcue open" shows their models there.\nArcue stops: arcue stop asked it to.\n`,
    );
  });

  it("reports Arcue in the browser from another build and leaves it running", async () => {
    const port = await freePort();
    const other = mkdtempSync(join(processRun.folder, "dist-"));
    cpSync(processRun.dist, other, { recursive: true });
    appendFileSync(join(other, "arcue.js"), "\n");
    await arcue(["serve", "--detach", "--port", String(port)]);
    const pid = await servePid();

    expect(await arcue(["serve", "--detach"], { script: join(other, "arcue.js") })).toMatchObject({
      code: 0,
      out: `Arcue already runs in a browser at http://localhost:${port} (process ${pid}).\nIt runs from another arcue build: run arcue stop, then arcue serve --detach to use this one.\n`,
    });
    expect(isRunning(pid)).toBe(true);
    expect(await readBridgeInfo(userData, "serve")).toMatchObject({ pid });
    rmSync(other, { recursive: true, force: true });
  });
});

describe("stopping Arcue in the browser", () => {
  it("ends its process with arcue stop, and records that it ran last", async () => {
    const port = await freePort();
    await arcue(["serve", "--detach", "--port", String(port)]);
    const pid = await servePid();
    writeLastCoreFile(userData, "desktop");

    expect(await arcue(["stop"])).toMatchObject({
      code: 0,
      out: `Stopped Arcue in the browser at http://localhost:${port} (process ${pid}).\n`,
    });

    expect(isRunning(pid)).toBe(false);
    expect(JSON.parse(readFileSync(join(userData, LAST_CORE_FILE), "utf8"))).toEqual({
      version: 1,
      kind: "serve",
      serveUrl: `http://localhost:${port}`,
    });
    expect(await arcue(["stop"])).toMatchObject({ code: 0, out: "Arcue is not running in a browser.\n" });
  });

  it("stops by itself once no page was open for the idle time", async () => {
    const port = await freePort();
    const serving = start(process.execPath, [
      processRun.arcue,
      "serve",
      "--port",
      String(port),
      "--idle-stop-ms",
      "2000",
    ]);

    expect(await serving.exited).toEqual({ code: 0, signal: null });
    expect(serving.output.out).toContain("Arcue stops: no page was open for 0.03 minutes.\n");
    expect(JSON.parse(readFileSync(join(userData, LAST_CORE_FILE), "utf8"))).toMatchObject({ kind: "serve" });
  });

  it("ends arcue within 5 seconds once its command is done, whatever timers it leaves", async () => {
    const lingering = start(process.execPath, [...preload("linger"), processRun.arcue, "help"]);
    const before = Date.now();

    expect(await Promise.race([lingering.exited, sleep(10_000).then(() => "still running")])).toEqual({
      code: 0,
      signal: null,
    });

    expect(Date.now() - before).toBeLessThan(6000);
    expect(lingering.output.out).toContain("Usage:");
  });

  it("ends Arcue in the browser 30 seconds after arcue stop when its close never finishes", async () => {
    const port = await freePort();
    const hanging = start(process.execPath, [
      ...preload("hanging-serve"),
      processRun.arcue,
      "serve",
      "--port",
      String(port),
    ]);
    await vi.waitFor(() => expect(hanging.output.out).toContain("Arcue runs at"), { timeout: 15_000 });

    const stopping = arcue(["stop"]);
    await vi.waitFor(() => expect(hanging.output.out).toContain("Arcue stops: arcue stop asked it to.\n"), {
      timeout: 15_000,
      interval: 10,
    });
    const asked = Date.now();
    expect(await stopping).toMatchObject({ code: 0 });
    expect(await hanging.exited).toEqual({ code: 1, signal: null });

    expect(Date.now() - asked).toBeGreaterThan(29_000);
    expect(Date.now() - asked).toBeLessThan(31_000);
    expect(hanging.output.err).toContain("Arcue did not stop within 30 seconds, so it exits now.\n");
  });
});
