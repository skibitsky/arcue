import type { ChildProcess } from "node:child_process";
import { execFile, fork } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { ArcueCore } from "@arcue/core";
import type { BridgeServer, CoreConnection } from "@arcue/platform-node";
import {
  connectToCore,
  fromNativePath,
  NodePlatform,
  readBridgeInfo,
  startBridgeServer,
  startNodeImportWorker,
} from "@arcue/platform-node";
import type { CommandInput, CoreClient, CoreKind, ReviewFile } from "@arcue/protocol";
import { compositionFileSchema, LOCKS_FOLDER, lockRecordSchema, reviewFileSchema } from "@arcue/protocol";
import { afterEach, beforeAll, beforeEach, describe, expect, inject, it, vi } from "vitest";
import { outsideSessions } from "./session-view";
import { buildFixture } from "./test-build";
import { registerPid } from "./test-pids";

const processRun = inject("processRun");
const posix = process.platform !== "win32";
const samples = fileURLToPath(new URL("../../../samples/", import.meta.url));
const importWorker = join(processRun.dist, "import-worker.js");
const VIEW = "side-by-side";

/** One core's tab of a model: the connection to the core, the asset and the version it loaded. */
interface Side {
  client: CoreClient;
  assetId: string;
  version: string;
}

interface DesktopCore {
  core: ArcueCore;
  bridge: BridgeServer;
  errors: unknown[];
}

let holderScript: string;
let temp: string;
let userData: string;
let repo: string;
let model: string;
let desktop: DesktopCore | null;
let connections: CoreConnection[];
let holder: ChildProcess | null;

/** The test's environment for arcue: its own data folder, and no agent session's variables. */
function env(): NodeJS.ProcessEnv {
  return outsideSessions({ ...process.env, ARCUE_USER_DATA: userData });
}

/** Runs the built arcue as a person's terminal does, collecting its output until it exits. */
function arcue(args: string[]): Promise<{ code: number | null; out: string; err: string }> {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [processRun.arcue, ...args],
      { env: env(), cwd: processRun.folder, timeout: 90_000 },
      (error, stdout, stderr) => {
        const failed = error as (Error & { code?: number | string }) | null;
        resolve({
          code: failed ? (typeof failed.code === "number" ? failed.code : null) : 0,
          out: stdout,
          err: stderr,
        });
      },
    );
  });
}

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  await new Promise((resolve) => server.close(resolve));
  if (typeof address !== "object" || !address) throw new Error("No port was free.");
  return address.port;
}

/** Starts Arcue in the browser with `arcue serve --detach`, and records its pid for the run's teardown. */
async function startServe(port?: number): Promise<{ port: number; pid: number }> {
  const chosen = port ?? (await freePort());
  const result = await arcue(["serve", "--detach", "--port", String(chosen)]);
  expect(result, result.err).toMatchObject({ code: 0 });
  const pid = (await readBridgeInfo(userData, "serve"))?.pid;
  if (pid === undefined) throw new Error(`No serve.json after: ${result.out}`);
  registerPid(processRun.folder, pid);
  expect(result.out).toContain(`(process ${pid})`);
  return { port: chosen, pid };
}

/** A core of the desktop app's kind in this process, as the desktop app runs one, on the test's data folder. */
async function startDesktop(): Promise<DesktopCore> {
  const errors: unknown[] = [];
  const onError = (error: unknown) => errors.push(error);
  const platform = new NodePlatform({
    appDataDir: fromNativePath(userData),
    startImportWorker: () => startNodeImportWorker(importWorker, onError),
  });
  const core = await ArcueCore.start({ platform, onError });
  const bridge = await startBridgeServer({
    core,
    userData,
    kind: "desktop",
    ensureWindow: async () => undefined,
    onError,
  });
  return { core, bridge, errors };
}

async function connect(kind: CoreKind): Promise<CoreClient> {
  const connection = await connectToCore(userData, kind);
  if (!connection) throw new Error(`No core answers at the ${kind} bridge file.`);
  connections.push(connection);
  return connection.client;
}

/** Opens the model in a core for the test's view, as an agent's arcue open does, and waits until it loaded. */
async function open(kind: CoreKind): Promise<Side> {
  const client = await connect(kind);
  const { assetId } = await client.execute("asset.openInView", { path: fromNativePath(model), view: VIEW });
  return { client, assetId, version: await loaded(client, assetId, fromNativePath(model)) };
}

function loaded(client: CoreClient, assetId: string, path: string): Promise<string> {
  return vi.waitFor(
    async () => {
      const asset = (await client.query("asset.list", {})).assets.find((open) => open.assetId === assetId);
      expect(asset).toMatchObject({ path, status: "ready" });
      return asset?.version ?? "";
    },
    { timeout: 30_000, interval: 50 },
  );
}

/** The model open in both cores: Arcue in the browser and the desktop app's core. */
async function bothOpen(): Promise<{ serve: Side; app: Side; servePid: number }> {
  const { pid } = await startServe();
  const [serve, app] = await Promise.all([open("serve"), open("desktop")]);
  return { serve, app, servePid: pid };
}

function loose(side: Side, text: string): CommandInput<"comment.create"> {
  return {
    assetId: side.assetId,
    text,
    version: side.version,
    time: { kind: "none" },
    target: null,
    camera: { position: [0, 1, 3], target: [0, 1, 0], up: [0, 1, 0], fov: 30 },
    context: { vertexCount: 0, bones: [], centroid: null, joints: [], viewLabel: "front" },
    screenshot: null,
  };
}

function burst(side: Side, count: number, from: string): Promise<string>[] {
  return Array.from({ length: count }, (_, index) =>
    side.client.execute("comment.create", loose(side, `${from} ${index + 1}`)).then(({ commentId }) => commentId),
  );
}

function reviewFolder(name = "crate.fbx"): string {
  return join(repo, ".arcue", "reviews", name);
}

function savedReview(name?: string): ReviewFile {
  return reviewFileSchema.parse(JSON.parse(readFileSync(join(reviewFolder(name), "review.json"), "utf8")));
}

/** Both cores' review of the model, once each took in what the other saved. */
function bothSee(serve: Side, app: Side, comments: number): Promise<ReviewFile> {
  return vi.waitFor(
    async () => {
      const [fromServe, fromApp] = await Promise.all([
        serve.client.query("review.get", { assetId: serve.assetId }),
        app.client.query("review.get", { assetId: app.assetId }),
      ]);
      expect(fromServe.comments).toHaveLength(comments);
      expect(fromApp).toEqual(fromServe);
      return fromServe;
    },
    { timeout: 10_000, interval: 50 },
  );
}

/** Whether every lock file in the data folder holds a whole record, as it does except between its create and write. */
function wholeLockRecords(): boolean {
  const folder = join(userData, LOCKS_FOLDER);
  return readdirSync(folder)
    .filter((name) => name.endsWith(".lock"))
    .every((name) => {
      try {
        return lockRecordSchema.safeParse(JSON.parse(readFileSync(join(folder, name), "utf8"))).success;
      } catch {
        return false;
      }
    });
}

/**
 * Kills a process at a moment its lock files hold whole records. A kill between a lock file's create and its record
 * write leaves a file that names no process, which others wait out for the whole lease.
 */
async function killWithWholeLocks(pid: number): Promise<void> {
  for (;;) {
    process.kill(pid, "SIGSTOP");
    await sleep(20);
    if (wholeLockRecords()) {
      process.kill(pid, "SIGKILL");
      return;
    }
    process.kill(pid, "SIGCONT");
    await sleep(3);
  }
}

/** Starts the core-holder fixture: another core on the test's model whose next review save never finishes. */
function startHolder(): { child: ChildProcess; said(message: string): Promise<void> } {
  const child = fork(holderScript, [userData, model, importWorker], {
    env: env(),
    execArgv: [],
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  if (child.pid !== undefined) registerPid(processRun.folder, child.pid);
  holder = child;
  let err = "";
  child.stderr?.on("data", (chunk: Buffer) => {
    err += chunk.toString();
  });
  const said = (expected: string) =>
    new Promise<void>((resolve, reject) => {
      const onExit = (code: number | null) => reject(new Error(`The holder exited with ${code}: ${err}`));
      const onMessage = (message: unknown) => {
        if (message !== expected) return;
        child.off("message", onMessage);
        child.off("exit", onExit);
        resolve();
      };
      child.on("message", onMessage);
      child.once("exit", onExit);
    });
  return { child, said };
}

beforeAll(async () => {
  holderScript = await buildFixture("core-holder", join(processRun.folder, "fixtures"));
});

beforeEach(async () => {
  temp = mkdtempSync(join(processRun.folder, "side-"));
  userData = join(temp, "data");
  repo = join(temp, "game");
  mkdirSync(join(repo, ".git"), { recursive: true });
  model = join(repo, "crate.fbx");
  copyFileSync(join(samples, "crate.fbx"), model);
  connections = [];
  holder = null;
  desktop = await startDesktop();
});

afterEach(async () => {
  for (const connection of connections) connection.close();
  holder?.kill("SIGKILL");
  await arcue(["stop"]);
  if (desktop) {
    await desktop.bridge.close();
    await desktop.core.shutdown();
  }
  desktop = null;
  rmSync(temp, { recursive: true, force: true });
});

describe("the desktop app's core beside Arcue in the browser", () => {
  it("keeps every comment both save at once, and puts no lock in the repository", async () => {
    const { serve, app } = await bothOpen();
    const before = savedReview().revision;

    const created = await Promise.all([...burst(serve, 25, "From the browser"), ...burst(app, 25, "From the app")]);

    const saved = savedReview();
    expect(saved.comments.map((comment) => comment.id).sort()).toEqual([...created].sort());
    expect(saved.revision).toBe(before + 50);
    expect(await bothSee(serve, app, 50)).toEqual(saved);
    const files = readdirSync(repo, { recursive: true, encoding: "utf8" }).map((path) => path.replaceAll("\\", "/"));
    expect(files.filter((path) => /(^|\/)locks(\/|$)|\.(lock|waiting|break)$/.test(path))).toEqual([]);
    expect(desktop?.errors).toEqual([]);
  });

  it("keeps both files that the two add to the model's view at once", async () => {
    copyFileSync(join(samples, "beetle-turn.fbx"), join(repo, "beetle-turn.fbx"));
    copyFileSync(join(samples, "rock-lods.fbx"), join(repo, "rock-lods.fbx"));
    const { serve, app } = await bothOpen();

    await Promise.all([
      serve.client.execute("composition.addFile", { assetId: serve.assetId, file: "beetle-turn.fbx" }),
      app.client.execute("composition.addFile", { assetId: app.assetId, file: "rock-lods.fbx" }),
    ]);

    const composition = compositionFileSchema.parse(
      JSON.parse(readFileSync(join(reviewFolder(), "composition.json"), "utf8")),
    );
    expect(composition.animations).toEqual(["beetle-turn.fbx"]);
    expect(composition.attach?.map((entry) => entry.file)).toEqual(["rock-lods.fbx"]);
    for (const side of [serve, app]) {
      await vi.waitFor(
        async () => {
          const { scene } = await side.client.query("scene.get", { assetId: side.assetId });
          expect(scene.clips.map((clip) => clip.name)).toContain("beetle-turn.fbx//Armature|Turn");
          expect(scene.nodes.map((node) => node.path)).toContainEqual(expect.stringMatching(/^rock-lods\.fbx\/\//));
        },
        { timeout: 30_000, interval: 50 },
      );
    }
  });

  it("keeps the setting each changes at once, and both answer with both", async () => {
    await startServe();
    const [serve, app] = await Promise.all([connect("serve"), connect("desktop")]);

    await Promise.all([
      serve.execute("settings.set", { authorName: "Robin" }),
      app.execute("settings.set", { coordinates: "z-up-blender" }),
    ]);

    const both = { authorName: "Robin", coordinates: "z-up-blender" };
    expect(JSON.parse(readFileSync(join(userData, "settings.json"), "utf8"))).toEqual(both);
    for (const client of [serve, app]) {
      await vi.waitFor(async () => expect(await client.query("settings.get", {})).toEqual(both), {
        timeout: 10_000,
        interval: 50,
      });
    }
  });

  it("follows a rename of the model once, keeping every comment", async () => {
    const { serve, app } = await bothOpen();
    await Promise.all([...burst(serve, 3, "From the browser"), ...burst(app, 3, "From the app")]);
    const renamed = join(repo, "box.fbx");

    renameSync(model, renamed);

    for (const side of [serve, app]) await loaded(side.client, side.assetId, fromNativePath(renamed));
    expect(readdirSync(join(repo, ".arcue", "reviews"))).toEqual(["box.fbx"]);
    const saved = savedReview("box.fbx");
    expect(saved.asset.path).toBe("box.fbx");
    expect(saved.comments).toHaveLength(6);
    expect(await bothSee(serve, app, 6)).toEqual(saved);
  });

  it.runIf(posix)(
    "goes on saving when Arcue in the browser is killed mid-burst, keeps what it acknowledged, and starts again",
    async () => {
      const { serve, app, servePid } = await bothOpen();
      const url = (await readBridgeInfo(userData, "serve"))?.url ?? "";
      const acknowledged: string[] = [];
      const serveBurst = Promise.allSettled(
        burst(serve, 200, "From the browser").map((created) => created.then((id) => acknowledged.push(id))),
      );
      await vi.waitFor(() => expect(acknowledged.length).toBeGreaterThanOrEqual(5), { timeout: 10_000, interval: 2 });
      const appBurst = Promise.all(burst(app, 10, "From the app"));

      await killWithWholeLocks(servePid);
      const killed = Date.now();
      const kept = [...acknowledged];
      const fromApp = await appBurst;

      expect(Date.now() - killed).toBeLessThan(10_000);
      expect((await serveBurst).some((result) => result.status === "rejected")).toBe(true);
      const saved = savedReview();
      const ids = new Set(saved.comments.map((comment) => comment.id));
      expect([...kept, ...fromApp].filter((id) => !ids.has(id))).toEqual([]);
      const others = readdirSync(reviewFolder()).filter((name) => name !== "review.json" && !name.endsWith(".tmp"));
      expect(others).toEqual([]);

      const status = await arcue(["status"]);
      expect(status).toMatchObject({ code: 0, err: "" });
      expect(status.out).toMatch(new RegExp(`^The Arcue app is running \\(process ${process.pid}\\)\\.\\n`));
      expect(status.out).not.toContain("in a browser");

      const restarted = await startServe(Number(new URL(url).port));
      expect(restarted.pid).not.toBe(servePid);
      expect(await readBridgeInfo(userData, "serve")).toMatchObject({ pid: restarted.pid, url });
      const again = await open("serve");
      const reopened = await again.client.query("review.get", { assetId: again.assetId });
      expect(reopened.comments).toEqual(saved.comments);
    },
  );

  it("saves at once when the core that held the reviews lock is killed while it writes review.json", async () => {
    const app = await open("desktop");
    const other = startHolder();
    await other.said("ready");
    const writing = other.said("writing");
    other.child.send("create");
    await writing;

    const saving = app.client.execute("comment.create", loose(app, "Saved once the other core is gone."));
    expect(await Promise.race([saving.then(() => "saved"), sleep(500).then(() => "waiting")])).toBe("waiting");
    other.child.kill("SIGKILL");
    const killed = Date.now();
    const { commentId } = await saving;

    expect(Date.now() - killed).toBeLessThan(1000);
    expect(savedReview().comments.map((comment) => comment.id)).toEqual([commentId]);
  });

  it("saves the app's comment within 2 seconds while Arcue in the browser saves 200 to the repository's models", async () => {
    const { serve, app } = await bothOpen();
    const sides = [serve];
    for (const name of ["barrel.fbx", "chest.fbx", "lid.fbx"]) {
      const path = join(repo, name);
      copyFileSync(model, path);
      const { assetId } = await serve.client.execute("asset.openInView", { path: fromNativePath(path), view: VIEW });
      sides.push({ ...serve, assetId, version: await loaded(serve.client, assetId, fromNativePath(path)) });
    }
    let saves = 0;
    const serveBurst = Promise.all(
      sides.flatMap((side) => burst(side, 50, "From the browser").map((created) => created.then(() => saves++))),
    );
    await vi.waitFor(() => expect(saves).toBeGreaterThanOrEqual(10), { timeout: 10_000, interval: 2 });

    const started = Date.now();
    await app.client.execute("comment.create", loose(app, "Between the browser's saves."));

    expect(Date.now() - started).toBeLessThan(2000);
    expect(saves).toBeLessThan(200);
    await serveBurst;
    expect(savedReview().comments).toHaveLength(51);
  });
});
