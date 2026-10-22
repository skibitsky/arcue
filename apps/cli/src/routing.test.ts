import { existsSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import type { FakeCore, FakeCoreOptions } from "@arcue/platform-node/test";
import { holdStartLock, startFakeCore, writeLastCoreFile, writeLaunchInfo } from "@arcue/platform-node/test";
import { BRIDGE_INFO_FILE, LAUNCH_INFO_FILE, SERVE_INFO_FILE } from "@arcue/protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Routed } from "./routing";
import { BROWSER_STOPPED, connectForOpen } from "./routing";

const VIEW = "3f9a0c1d2b4e";
const SERVE_URL = "http://localhost:4530";
const NOT_STARTED =
  "Arcue is not running, and the Arcue app has not been started on this computer yet. Start the app once, or run arcue serve --detach to use Arcue in a browser.";

let userData: string;
let marker: string;
let fakes: FakeCore[];
let routes: Routed[];
let holders: { kill(): void }[];

async function fake(options: FakeCoreOptions): Promise<FakeCore> {
  const core = await startFakeCore(userData, options);
  fakes.push(core);
  return core;
}

const desktop = () => fake({ file: BRIDGE_INFO_FILE, kind: "desktop", locks: 1 });
const serve = () => fake({ file: SERVE_INFO_FILE, kind: "serve", locks: 1, url: SERVE_URL });

/** Records a desktop app that only leaves a marker, so a test sees whether routing started it. */
function launchable(): void {
  writeLaunchInfo(userData, `require("node:fs").writeFileSync(${JSON.stringify(marker)}, "")`);
}

async function route(view: string | null, timeoutMs = 300): Promise<Routed> {
  const routed = await connectForOpen(userData, view, { timeoutMs, pollMs: 20 });
  routes.push(routed);
  return routed;
}

/** Waits long enough for an app that was started to leave its marker, and says whether it did. */
async function launchedAfterAWhile(): Promise<boolean> {
  await sleep(2000);
  return existsSync(marker);
}

beforeEach(() => {
  userData = realpathSync(mkdtempSync(join(tmpdir(), "arcue-routing-")));
  marker = join(userData, "launched");
  fakes = [];
  routes = [];
  holders = [];
});

afterEach(async () => {
  for (const routed of routes) routed.connection.close();
  for (const holder of holders) holder.kill();
  await Promise.all(fakes.map((core) => core.close()));
  rmSync(userData, { recursive: true, force: true });
});

describe("an open for an agent session's view", () => {
  it("goes to Arcue in the browser while it runs, and never to the desktop app", async () => {
    const app = await desktop();
    const served = await serve();

    const routed = await route(VIEW);

    expect(routed).toMatchObject({ kind: "serve", older: false });
    expect(routed.connection.info.token).toBe(served.info.token);
    expect(app.requests).toEqual([]);
  });

  it("goes to the desktop app when only it runs", async () => {
    const app = await desktop();

    const routed = await route(VIEW);

    expect(routed).toMatchObject({ kind: "desktop", older: false });
    expect(routed.connection.info.token).toBe(app.info.token);
  });

  it("says Arcue in the browser stopped when it ran last, and starts nothing", async () => {
    launchable();
    writeLastCoreFile(userData, "serve", SERVE_URL);

    await expect(route(VIEW)).rejects.toThrow(BROWSER_STOPPED);
    expect(await launchedAfterAWhile()).toBe(false);
  });

  it("starts the desktop app when it ran last, or nothing says which ran", async () => {
    launchable();
    const opening = route(VIEW, 10_000);
    await vi.waitFor(() => expect(existsSync(marker)).toBe(true), { timeout: 5000 });
    const app = await desktop();

    const routed = await opening;
    expect(routed).toMatchObject({ kind: "desktop" });
    expect(routed.connection.info.token).toBe(app.info.token);

    await app.close();
    rmSync(marker);
    writeLastCoreFile(userData, "desktop", SERVE_URL);
    await expect(route(VIEW)).rejects.toThrow(/did not start within/);
    await vi.waitFor(() => expect(existsSync(marker)).toBe(true), { timeout: 5000 });
  });

  it("goes to an older arcue serve at bridge.json, which takes no locks", async () => {
    await fake({ file: BRIDGE_INFO_FILE, url: SERVE_URL });

    await expect(route(VIEW)).resolves.toMatchObject({ kind: "serve", older: true });
    await expect(route(null)).resolves.toMatchObject({ kind: "serve", older: true });
  });

  it("passes over a serve.json that a crashed serve left", async () => {
    const stale = await serve();
    await stale.close();
    writeFileSync(join(userData, SERVE_INFO_FILE), JSON.stringify(stale.info));
    const app = await desktop();

    const routed = await route(VIEW);

    expect(routed.connection.info.token).toBe(app.info.token);
  });

  it("fails, naming the core, and starts nothing when a core listens but refuses or stays silent", async () => {
    launchable();
    const refusing = await fake({ file: SERVE_INFO_FILE, kind: "serve", locks: 1, url: SERVE_URL, refuse: true });
    await expect(route(VIEW)).rejects.toMatchObject({
      code: "forbidden",
      message: `Arcue in the browser at ${SERVE_URL} (process ${process.pid}) does not answer: Arcue refused the connection. The token does not match the running app.`,
    });
    await refusing.close();

    const silent = await fake({ file: BRIDGE_INFO_FILE, kind: "desktop", locks: 1, silent: true });
    const unanswered = {
      code: "timeout",
      message: `The Arcue app (process ${process.pid}) does not answer: The handshake took longer than 5000 ms.`,
    };
    await expect(route(VIEW)).rejects.toMatchObject(unanswered);
    await expect(route(null)).rejects.toMatchObject(unanswered);
    await silent.close();

    expect(await launchedAfterAWhile()).toBe(false);
  }, 30_000);

  it("waits for a core that is starting, then goes to it", async () => {
    launchable();
    const holder = holdStartLock(userData);
    holders.push(holder);
    let settled = false;
    const opening = route(VIEW).finally(() => (settled = true));

    await sleep(500);
    expect(settled).toBe(false);
    const served = await serve();
    holder.release();

    const routed = await opening;
    expect(routed.connection.info.token).toBe(served.info.token);
    expect(await launchedAfterAWhile()).toBe(false);
  });

  it("says Arcue in the browser stopped while serve --detach starts it, and starts no app", async () => {
    launchable();
    writeLastCoreFile(userData, "serve");

    await expect(route(VIEW)).rejects.toThrow(BROWSER_STOPPED);
    expect(await launchedAfterAWhile()).toBe(false);
  });
});

describe("an open outside views", () => {
  it("goes to the desktop app while it runs", async () => {
    await serve();
    const app = await desktop();

    const routed = await route(null);

    expect(routed).toMatchObject({ kind: "desktop" });
    expect(routed.connection.info.token).toBe(app.info.token);
  });

  it("starts the desktop app that launch.json names, even while Arcue in the browser runs", async () => {
    const served = await serve();
    launchable();
    const opening = route(null, 10_000);
    await vi.waitFor(() => expect(existsSync(marker)).toBe(true), { timeout: 5000 });
    const app = await desktop();

    const routed = await opening;
    expect(routed.connection.info.token).toBe(app.info.token);
    expect(served.requests).toEqual([]);
  });

  it("goes to Arcue in the browser where no app was ever started", async () => {
    const served = await serve();

    const routed = await route(null);

    expect(routed).toMatchObject({ kind: "serve" });
    expect(routed.connection.info.token).toBe(served.info.token);
  });

  it("goes to Arcue in the browser at once when the app in launch.json cannot start", async () => {
    writeFileSync(join(userData, LAUNCH_INFO_FILE), JSON.stringify({ version: 1, command: "/nonexistent", args: [] }));
    const served = await serve();
    const started = Date.now();

    const routed = await route(null, 10_000);

    expect(routed.connection.info.token).toBe(served.info.token);
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it("waits for a core that is starting where no app was ever started, then goes to it", async () => {
    const holder = holdStartLock(userData);
    holders.push(holder);
    let settled = false;
    const opening = route(null).finally(() => (settled = true));

    await sleep(500);
    expect(settled).toBe(false);
    const served = await serve();
    holder.release();

    const routed = await opening;
    expect(routed).toMatchObject({ kind: "serve" });
    expect(routed.connection.info.token).toBe(served.info.token);
  });

  it("says Arcue in the browser stopped when it ran last and no app was ever started", async () => {
    writeLastCoreFile(userData, "serve", SERVE_URL);

    await expect(route(null)).rejects.toThrow(BROWSER_STOPPED);
  });

  it("says the app was never started, or why it could not start", async () => {
    await expect(route(null)).rejects.toThrow(NOT_STARTED);

    writeFileSync(join(userData, LAUNCH_INFO_FILE), JSON.stringify({ version: 1, command: "/nonexistent", args: [] }));
    await expect(route(null)).rejects.toThrow(
      "The Arcue app could not be started from /nonexistent: spawn /nonexistent ENOENT.",
    );
  });
});
