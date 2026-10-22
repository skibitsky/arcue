import { execFile, execFileSync } from "node:child_process";
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import type { CoreConnection } from "@arcue/platform-node";
import { connectToCore, fromNativePath, NodePlatform, runningCore } from "@arcue/platform-node";
import type { FakeCore } from "@arcue/platform-node/test";
import { outsideSessions, startFakeCore } from "@arcue/platform-node/test";
import type { AssetSummary, CommandInput, CoreClient, ReviewFile, Settings } from "@arcue/protocol";
import {
  BRIDGE_INFO_FILE,
  LOCKS_FOLDER,
  lockRecordSchema,
  lockWaitingSchema,
  reviewFileSchema,
  SERVE_INFO_FILE,
} from "@arcue/protocol";
import type { ElectronApplication, Page } from "playwright";
import { _electron } from "playwright";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rendererSwitches } from "./rendering.ts";

interface WindowProbe {
  arcueWindow?: {
    client: CoreClient;
    store: {
      state: { get(): { settings: Settings | null } };
      session(id: string): { state: { get(): { review: ReviewFile | null } } } | null;
    };
  };
}

const appDir = fileURLToPath(new URL("..", import.meta.url));
const repo = resolve(appDir, "../..");
const arcueJs = join(repo, "apps", "plugin", "dist", "plugins", "arcue", "skills", "arcue", "scripts", "arcue.js");
const electronPath = createRequire(import.meta.url)("electron") as string;
/** Containers often run as root, where Electron starts only without its sandbox. */
const sandbox: Record<string, string> = process.getuid?.() === 0 ? { ELECTRON_DISABLE_SANDBOX: "1" } : {};
const posix = process.platform !== "win32";
const PORT = 4541;
const ADDRESS = `http://localhost:${PORT}`;
const VIEW = "side-by-side";
const BROWSER_STOPPED =
  "Arcue in the browser has stopped. Run arcue serve --detach to start it again; an open page reconnects by itself.\n";
const QUIT_COMMENT = "Saved as the app quits";
/**
 * How long a quitting app gave its windows to close their assets, then its core to stop, before it killed its core,
 * when the core's wait was shorter than a lock wait.
 */
const OLD_QUIT_WAIT_MS = 5000 + 3000;

let temp: string;
let userData: string;
let project: string;
let crate: string;
let golem: string;
let app: ElectronApplication | null;
let connections: CoreConnection[];
let fakes: FakeCore[];

/** The environment of the app and the command line: the test's data folder, and no agent session's variables. */
function env(more: Record<string, string> = {}): Record<string, string> {
  const given = { ...outsideSessions(process.env), ARCUE_USER_DATA: userData, ...more };
  return Object.fromEntries(Object.entries(given).filter((entry): entry is [string, string] => entry[1] !== undefined));
}

function launch(): Promise<ElectronApplication> {
  return _electron
    .launch({ executablePath: electronPath, args: [...rendererSwitches, appDir], env: env(sandbox) })
    .then((electron) => {
      app = electron;
      return electron;
    });
}

/** Runs the built plugin's arcue, as an agent does, collecting its output until it exits. */
function arcue(args: string[], more: Record<string, string> = {}): Promise<{ code: number; out: string; err: string }> {
  return new Promise((resolvePromise) => {
    execFile(process.execPath, [arcueJs, ...args], { env: env(more), timeout: 60_000 }, (error, stdout, stderr) => {
      const code = error ? (typeof error.code === "number" ? error.code : 1) : 0;
      resolvePromise({ code, out: stdout, err: stderr });
    });
  });
}

/** Starts Arcue in the browser with `arcue serve --detach` and returns its pid. */
async function detach(): Promise<number> {
  const result = await arcue(["serve", "--detach", "--port", String(PORT)]);
  const pid = Number(/^Arcue runs in a browser at \S+ \(process (\d+)\)\./.exec(result.out)?.[1]);
  if (result.code !== 0 || !(pid > 0))
    throw new Error(`arcue serve --detach did not start Arcue: ${result.out}${result.err}`);
  return pid;
}

function log(name: "main" | "core" | "serve"): string {
  try {
    return readFileSync(join(userData, "logs", `${name}.log`), "utf8");
  } catch {
    return "";
  }
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

function bridgeFile(name: string): { pid: number; kind?: string; locks?: number } {
  return readJson(join(userData, name)) as { pid: number; kind?: string; locks?: number };
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Whether the process runs this app, so a pid the system gave to another process since is left alone. */
function runsThisApp(pid: number): boolean {
  try {
    const command =
      process.platform === "linux"
        ? readFileSync(`/proc/${pid}/cmdline`, "utf8")
        : execFileSync("ps", ["-o", "command=", "-p", String(pid)], { encoding: "utf8" });
    return command.includes(appDir);
  } catch {
    return false;
  }
}

/** The app's main processes that started on the test's data folder and still run. */
function runningMains(): number[] {
  return [...log("main").matchAll(/Arcue starts \(pid (\d+)/g)]
    .map((match) => Number(match[1]))
    .filter((pid) => alive(pid) && runsThisApp(pid));
}

async function connectedWindow(electron: ElectronApplication): Promise<Page> {
  const page = await electron.firstWindow();
  await page.waitForFunction(
    () => (globalThis as WindowProbe).arcueWindow?.client.connectionState === "connected",
    undefined,
    { timeout: 20_000 },
  );
  return page;
}

async function serveClient(): Promise<CoreClient> {
  const connection = await connectToCore(userData, "serve");
  if (!connection) throw new Error("Arcue in the browser does not answer.");
  connections.push(connection);
  return connection.client;
}

function looseComment(assetId: string, version: string, text: string): CommandInput<"comment.create"> {
  return {
    assetId,
    text,
    version,
    time: { kind: "none" },
    target: null,
    camera: { position: [0, 1, 3], target: [0, 1, 0], up: [0, 1, 0], fov: 30 },
    context: { vertexCount: 0, bones: [], centroid: null, joints: [], viewLabel: "front" },
    screenshot: null,
  };
}

async function readyIn(list: () => Promise<AssetSummary[]>, path: string): Promise<AssetSummary> {
  let found: AssetSummary | undefined;
  await expect
    .poll(
      async () => {
        found = (await list()).find((asset) => asset.path === path);
        return found?.status;
      },
      { timeout: 30_000 },
    )
    .toBe("ready");
  if (!found?.version) throw new Error(`${path} has no version.`);
  return found;
}

function windowAssets(page: Page): Promise<AssetSummary[]> {
  return page.evaluate(async () => {
    const window = (globalThis as WindowProbe).arcueWindow;
    return window ? (await window.client.query("asset.list", {})).assets : [];
  });
}

/** One core's asset of a model: how to create comments on it and read its review. */
interface Side {
  assetId: string;
  version: string;
  create(texts: readonly string[]): Promise<string[]>;
  review(): Promise<ReviewFile>;
}

/** Opens the model in the app's window, as a person does, and waits until it loaded. */
async function openInWindow(page: Page, path: string): Promise<Side> {
  await page.evaluate(async (file) => {
    await (globalThis as WindowProbe).arcueWindow?.client.execute("asset.open", { path: file });
  }, path);
  const { assetId, version } = await readyIn(() => windowAssets(page), path);
  if (version === null) throw new Error(`${path} has no version.`);
  return {
    assetId,
    version,
    create: (texts) =>
      page.evaluate(
        async (inputs) => {
          const window = (globalThis as WindowProbe).arcueWindow;
          if (!window) throw new Error("The window has no arcueWindow.");
          const created = await Promise.all(inputs.map((input) => window.client.execute("comment.create", input)));
          return created.map((comment) => comment.commentId);
        },
        texts.map((text) => looseComment(assetId, version, text)),
      ),
    review: () =>
      page.evaluate(async (id) => {
        const window = (globalThis as WindowProbe).arcueWindow;
        if (!window) throw new Error("The window has no arcueWindow.");
        return window.client.query("review.get", { assetId: id });
      }, assetId),
  };
}

/** Opens the model in Arcue in the browser for an agent session's view whose page is not open, so serve holds it. */
async function openInServe(path: string): Promise<Side> {
  const client = await serveClient();
  const opened = await client.execute("asset.openInView", { path, view: VIEW });
  expect(opened.shown).toBe("held");
  const { assetId, version } = await readyIn(async () => (await client.query("asset.list", {})).assets, path);
  if (version === null) throw new Error(`${path} has no version.`);
  return {
    assetId,
    version,
    create: async (texts) => {
      const created = await Promise.all(
        texts.map((text) => client.execute("comment.create", looseComment(assetId, version, text))),
      );
      return created.map((comment) => comment.commentId);
    },
    review: () => client.query("review.get", { assetId }),
  };
}

function texts(count: number, from: string): string[] {
  return Array.from({ length: count }, (_, index) => `${from} ${index + 1}`);
}

function savedReview(name = "crate.fbx"): ReviewFile {
  return reviewFileSchema.parse(readJson(join(project, ".arcue", "reviews", name, "review.json")));
}

/**
 * Kills a process at a moment its lock files hold whole records. A kill between a lock file's create and its record
 * write leaves a file that names no process, which others wait out for the whole lease.
 */
async function killWithWholeLocks(pid: number): Promise<void> {
  const folder = join(userData, LOCKS_FOLDER);
  const whole = () =>
    readdirSync(folder)
      .filter((name) => name.endsWith(".lock"))
      .every((name) => {
        try {
          return lockRecordSchema.safeParse(readJson(join(folder, name))).success;
        } catch {
          return false;
        }
      });
  for (;;) {
    process.kill(pid, "SIGSTOP");
    await sleep(20);
    if (whole()) {
      process.kill(pid, "SIGKILL");
      return;
    }
    process.kill(pid, "SIGCONT");
    await sleep(3);
  }
}

/** Takes the reviews lock of the test's project as another Arcue on this computer does, until it is let go. */
async function holdReviews(): Promise<() => Promise<void>> {
  const platform = new NodePlatform({
    appDataDir: fromNativePath(userData),
    startImportWorker: () => {
      throw new Error("This platform imports nothing.");
    },
  });
  return platform.lock(fromNativePath(project), "reviews");
}

/** The processes that wait for a lock in the data folder, as the locks' waiting files name them. */
function waitingPids(): number[] {
  const folder = join(userData, LOCKS_FOLDER);
  return readdirSync(folder)
    .filter((name) => name.endsWith(".waiting"))
    .flatMap((name) => {
      try {
        return [lockWaitingSchema.parse(readJson(join(folder, name))).pid];
      } catch {
        return [];
      }
    });
}

beforeEach(() => {
  temp = realpathSync(mkdtempSync(join(tmpdir(), "arcue-e2e-side-")));
  userData = join(temp, "data");
  project = join(temp, "game");
  mkdirSync(join(project, ".git"), { recursive: true });
  crate = join(project, "crate.fbx");
  golem = join(project, "pebble-golem.fbx");
  copyFileSync(join(repo, "samples", "crate.fbx"), crate);
  copyFileSync(join(repo, "samples", "pebble-golem.fbx"), golem);
  app = null;
  connections = [];
  fakes = [];
});

afterEach(async ({ task }) => {
  for (const connection of connections) connection.close();
  await app?.close().catch(() => undefined);
  await Promise.all(fakes.map((fake) => fake.close()));
  if (existsSync(join(userData, SERVE_INFO_FILE))) await arcue(["stop"]);
  for (const pid of runningMains()) process.kill(pid, "SIGKILL");
  if (task.result?.state === "fail" && existsSync(join(userData, "logs"))) {
    cpSync(join(userData, "logs"), join(appDir, "test-results", task.name.replaceAll(/[^\w-]+/g, "-")), {
      recursive: true,
    });
  }
  rmSync(temp, { recursive: true, force: true });
});

describe("the desktop app beside Arcue in the browser", () => {
  it("starts its own core beside Arcue in the browser, without a notice", async () => {
    const servePid = await detach();
    const serveFile = readFileSync(join(userData, SERVE_INFO_FILE), "utf8");

    const electron = await launch();
    await connectedWindow(electron);

    expect(await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
    expect(log("main")).not.toContain("can't share reviews");
    expect(readFileSync(join(userData, SERVE_INFO_FILE), "utf8")).toBe(serveFile);
    const desktop = bridgeFile(BRIDGE_INFO_FILE);
    expect(desktop).toMatchObject({ kind: "desktop", locks: 1 });
    expect(desktop.pid).not.toBe(servePid);
  });

  it("lets Arcue in the browser start beside it", async () => {
    const electron = await launch();
    await connectedWindow(electron);
    const desktopFile = readFileSync(join(userData, BRIDGE_INFO_FILE), "utf8");

    const servePid = await detach();

    expect(readFileSync(join(userData, BRIDGE_INFO_FILE), "utf8")).toBe(desktopFile);
    expect(bridgeFile(SERVE_INFO_FILE)).toMatchObject({ kind: "serve", locks: 1, pid: servePid });
    expect(await connectToCore(userData, "desktop")).not.toBeNull();
  });

  it("leaves an agent's open to Arcue in the browser and a person's to the app, and status names both", async () => {
    const electron = await launch();
    const page = await connectedWindow(electron);
    const servePid = await detach();

    expect(await arcue(["open", crate], { ARCUE_VIEW: VIEW })).toMatchObject({
      code: 0,
      out: expect.stringContaining(`Arcue holds ${crate} as`),
    });
    expect(await arcue(["open", golem])).toMatchObject({ code: 0, out: expect.stringContaining(`Opened ${golem}`) });

    await readyIn(() => windowAssets(page), golem);
    expect((await windowAssets(page)).map((asset) => asset.path)).toEqual([golem]);
    const status = await arcue(["status"]);
    expect(status.code).toBe(0);
    const [browser, desktop] = status.out.split("\n\n");
    expect(browser).toMatch(new RegExp(`^Arcue is running in a browser at ${ADDRESS} \\(process ${servePid}\\)\\.\\n`));
    expect(browser).toContain(crate);
    expect(desktop).toMatch(/^The Arcue app is running \(process \d+\)\.\n/);
    expect(desktop).toContain(golem);
    expect(desktop).not.toContain(crate);
  });

  it("keeps every comment that the window and Arcue in the browser save at once, and each shows the other's", async () => {
    const electron = await launch();
    const page = await connectedWindow(electron);
    await detach();
    const fromWindow = await openInWindow(page, crate);
    const fromServe = await openInServe(crate);

    const created = (
      await Promise.all([fromWindow.create(texts(20, "From the app")), fromServe.create(texts(20, "From the browser"))])
    ).flat();

    expect(
      savedReview()
        .comments.map((comment) => comment.id)
        .sort(),
    ).toEqual(created.sort());
    await vi.waitFor(
      async () => {
        const [inWindow, inServe] = await Promise.all([fromWindow.review(), fromServe.review()]);
        expect(inWindow.comments).toHaveLength(40);
        expect(inWindow).toEqual(inServe);
      },
      { timeout: 10_000, interval: 100 },
    );

    const [fromBrowser] = await fromServe.create(["Seen in the app"]);
    await expect
      .poll(
        () =>
          page.evaluate(
            ([id, comment]) =>
              (globalThis as WindowProbe).arcueWindow?.store
                .session(id)
                ?.state.get()
                .review?.comments.some((saved) => saved.id === comment) ?? false,
            [fromWindow.assetId, fromBrowser] as const,
          ),
        { timeout: 5000 },
      )
      .toBe(true);
    const [fromApp] = await fromWindow.create(["Seen in the browser"]);
    await expect
      .poll(async () => (await fromServe.review()).comments.some((comment) => comment.id === fromApp), {
        timeout: 5000,
      })
      .toBe(true);
  });

  it("shows the settings Arcue in the browser changes in its window", async () => {
    const electron = await launch();
    const page = await connectedWindow(electron);
    await detach();

    await (await serveClient()).execute("settings.set", { coordinates: "z-up-blender" });

    await expect
      .poll(() => page.evaluate(() => (globalThis as WindowProbe).arcueWindow?.store.state.get().settings?.coordinates))
      .toBe("z-up-blender");
  });

  it("follows a rename of the model once, beside Arcue in the browser, keeping every comment", async () => {
    const electron = await launch();
    const page = await connectedWindow(electron);
    await detach();
    const fromWindow = await openInWindow(page, crate);
    const fromServe = await openInServe(crate);
    await Promise.all([fromWindow.create(["From the app"]), fromServe.create(["From the browser"])]);
    const box = join(project, "box.fbx");

    renameSync(crate, box);

    await readyIn(() => windowAssets(page), box);
    const client = await serveClient();
    await readyIn(async () => (await client.query("asset.list", {})).assets, box);
    expect(readdirSync(join(project, ".arcue", "reviews"))).toEqual(["box.fbx"]);
    expect(savedReview("box.fbx").comments).toHaveLength(2);
  });

  it.runIf(posix)(
    "reconnects its window when its core is killed mid-burst, and every save of Arcue in the browser lands",
    async () => {
      const electron = await launch();
      const page = await connectedWindow(electron);
      await detach();
      const fromWindow = await openInWindow(page, crate);
      const fromServe = await openInServe(crate);
      const corePid = bridgeFile(BRIDGE_INFO_FILE).pid;

      const serveSaves = fromServe.create(texts(60, "From the browser"));
      const windowSaves = fromWindow.create(texts(20, "From the app")).catch(() => []);
      await sleep(200);
      await killWithWholeLocks(corePid);

      const saved = await serveSaves;
      await windowSaves;
      await expect
        .poll(() => runningCore(userData, "desktop").then((info) => info?.pid), { timeout: 20_000 })
        .not.toBe(corePid);
      await connectedWindow(electron);
      const ids = new Set(savedReview().comments.map((comment) => comment.id));
      expect(saved.filter((id) => !ids.has(id))).toEqual([]);
    },
  );

  it("keeps its window connected through arcue stop, and Arcue in the browser keeps answering once the app quits", async () => {
    const electron = await launch();
    await connectedWindow(electron);
    const servePid = await detach();
    const desktopFile = readFileSync(join(userData, BRIDGE_INFO_FILE), "utf8");

    expect(await arcue(["stop"])).toMatchObject({
      code: 0,
      out: `Stopped Arcue in the browser at ${ADDRESS} (process ${servePid}).\n`,
    });

    const page = await connectedWindow(electron);
    expect(await windowAssets(page)).toEqual([]);
    expect(readFileSync(join(userData, BRIDGE_INFO_FILE), "utf8")).toBe(desktopFile);
    const restarted = await detach();
    await electron.close();
    app = null;
    expect(existsSync(join(userData, BRIDGE_INFO_FILE))).toBe(false);
    expect((await runningCore(userData, "serve"))?.pid).toBe(restarted);
    const status = await arcue(["status"]);
    expect(status.out).toMatch(
      new RegExp(`^Arcue is running in a browser at ${ADDRESS} \\(process ${restarted}\\)\\.\\n`),
    );
    expect(status.out).not.toContain("The Arcue app");
  });

  it("says why it quits beside an older arcue serve, and starts no core", async () => {
    const older = await startFakeCore(userData, { file: BRIDGE_INFO_FILE, url: ADDRESS });
    fakes.push(older);

    const electron = await launch();

    await expect
      .poll(() => log("main"), { timeout: 20_000 })
      .toContain(
        `Another Arcue runs (process ${older.info.pid} at ${ADDRESS}) and can't share reviews with this one, so this one quits`,
      );
    expect(await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(0);
    expect(log("core")).toBe("");
    expect(readJson(join(userData, BRIDGE_INFO_FILE))).toEqual(older.info);
  });

  it("is not started for an agent's open once Arcue in the browser ran last and stopped", async () => {
    const electron = await launch();
    await connectedWindow(electron);
    await electron.close();
    app = null;
    await detach();
    await arcue(["stop"]);

    expect(await arcue(["open", crate], { ARCUE_VIEW: VIEW })).toEqual({ code: 1, out: "", err: BROWSER_STOPPED });

    await sleep(5000);
    expect(existsSync(join(userData, BRIDGE_INFO_FILE))).toBe(false);
    expect([...log("main").matchAll(/Arcue starts \(pid/g)]).toHaveLength(1);
  });

  it("starts its own core in place of one that stopped without removing bridge.json", async () => {
    const stopped = await startFakeCore(userData, { file: BRIDGE_INFO_FILE, kind: "desktop", locks: 1 });
    await stopped.close();
    writeFileSync(join(userData, BRIDGE_INFO_FILE), JSON.stringify(stopped.info));

    const electron = await launch();
    await connectedWindow(electron);

    const started = await runningCore(userData, "desktop");
    expect(started?.token).not.toBe(stopped.info.token);
    expect(started?.pid).not.toBe(stopped.info.pid);
    await electron.close();
    app = null;
    expect(existsSync(join(userData, BRIDGE_INFO_FILE))).toBe(false);
  });

  it("saves the comment its core waits to save when the app quits while another Arcue holds the reviews lock", async () => {
    const electron = await launch();
    const page = await connectedWindow(electron);
    await detach();
    const fromWindow = await openInWindow(page, crate);
    const fromServe = await openInServe(crate);
    const corePid = bridgeFile(BRIDGE_INFO_FILE).pid;
    const unlock = await holdReviews();
    let serveSaves: Promise<string[]> = Promise.resolve([]);
    try {
      serveSaves = fromServe.create(texts(50, "From the browser"));
      void fromWindow.create([QUIT_COMMENT]).catch(() => []);
      await expect.poll(waitingPids, { timeout: 10_000, interval: 5 }).toContain(corePid);

      const quitting = electron.close();
      app = null;
      await sleep(OLD_QUIT_WAIT_MS + 2000);
      await unlock();
      await quitting;
    } finally {
      await unlock();
    }

    expect(await serveSaves).toHaveLength(50);
    const saved = savedReview();
    expect(saved.comments.filter((comment) => comment.text === QUIT_COMMENT)).toHaveLength(1);
    expect(saved.comments).toHaveLength(51);
    expect(readdirSync(join(project, ".arcue", "reviews", "crate.fbx"))).toEqual(["review.json"]);
    expect(log("main")).toContain("The core exited with code 0");
    expect(log("main")).not.toMatch(/restarting it|crashed|Uncaught|Unhandled/);
    expect(log("core")).not.toMatch(/could not|busy for/);
  });
});
