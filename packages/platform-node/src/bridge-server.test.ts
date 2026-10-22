import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { connect, Server } from "node:net";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { ArcueCore, ManualClock, MemoryPlatform } from "@arcue/core";
import type { Author, BridgeInfo, CoreClient } from "@arcue/protocol";
import {
  BRIDGE_INFO_FILE,
  bridgeInfoSchema,
  connectBridge,
  createPeer,
  createRemoteClient,
  framedChannel,
  jsonFrameCodec,
  LAST_CORE_FILE,
  LOCKS_FOLDER,
  lastCoreSchema,
  SERVE_INFO_FILE,
} from "@arcue/protocol";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { BridgeServer } from "./bridge-server";
import { bridgeAddress, startBridgeServer } from "./bridge-server";
import { socketStream } from "./node-socket";
import { CoreRunningError, claimStart, recordLastCore, takeStartLock } from "./start-claim";
import type { Fixture, FixtureChild } from "./test-children";
import { buildFixture } from "./test-children";
import type { FakeCore } from "./test-cores";
import { deadPid, startFakeCore } from "./test-cores";

let userData: string;
let core: ArcueCore;
let server: BridgeServer;
const errors: unknown[] = [];
const others: { close(): Promise<void> }[] = [];
const ADDRESS = "http://localhost:4530";
const BUILD = "0123456789abcdef";
const quiet = { ensureWindow: async () => undefined, onError: () => undefined };

/** macOS's temporary folder is too long for the socket to fit inside the user data folder, so tests use /tmp. */
const userDataRoot = process.platform === "win32" ? tmpdir() : "/tmp";

const timer = (delayMs: number, callback: () => void) => {
  const handle = setTimeout(callback, delayMs);
  return () => clearTimeout(handle);
};

beforeEach(async () => {
  userData = realpathSync(mkdtempSync(join(userDataRoot, "arcue-bridge-")));
  core = await ArcueCore.start({ platform: new MemoryPlatform({ clock: new ManualClock() }) });
  server = await startBridgeServer({
    core,
    userData,
    kind: "desktop",
    ensureWindow: async () => undefined,
    onError: (error) => errors.push(error),
  });
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await server.close();
  for (const other of others.splice(0)) await other.close();
  core.dispose();
  rmSync(userData, { recursive: true, force: true });
  errors.length = 0;
});

function readInfo(file = BRIDGE_INFO_FILE): BridgeInfo {
  return bridgeInfoSchema.parse(JSON.parse(readFileSync(join(userData, file), "utf8")));
}

async function startDesktop(): Promise<BridgeServer> {
  const started = await startBridgeServer({ core, userData, kind: "desktop", ...quiet });
  others.push(started);
  return started;
}

async function startServe(url = ADDRESS, build?: string): Promise<BridgeServer> {
  const started = await startBridgeServer({
    core,
    userData,
    kind: "serve",
    url,
    ...quiet,
    ...(build ? { build } : {}),
  });
  others.push(started);
  return started;
}

async function fake(options: Parameters<typeof startFakeCore>[1]): Promise<FakeCore> {
  const started = await startFakeCore(userData, options);
  others.push(started);
  return started;
}

/** A bridge file that names a socket nothing listens on. */
function writeStale(file: string, more: Partial<BridgeInfo> = {}): BridgeInfo {
  const info: BridgeInfo = {
    version: 1,
    socket: join(userData, "gone.sock"),
    token: "t".repeat(43),
    pid: deadPid(),
    ...more,
  };
  writeFileSync(join(userData, file), JSON.stringify(info));
  return info;
}

async function stopDefault(): Promise<void> {
  await server.close();
  server = { ...server, close: async () => undefined };
}

async function timed<Value>(action: () => Promise<Value>): Promise<{ value: Value; ms: number }> {
  const started = performance.now();
  const value = await action();
  return { value, ms: performance.now() - started };
}

/** Checks that the start lock is free: a claim of a kind nothing keeps out is granted at once. */
async function startLockFree(): Promise<void> {
  const { value: claim, ms } = await timed(() => claimStart(userData, "serve"));
  await claim.release();
  expect(ms).toBeLessThan(500);
}

async function connectWith(token: string, user?: Author): Promise<CoreClient> {
  const socket = connect(readInfo().socket);
  await new Promise<void>((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("error", reject);
  });
  const endpoint = await connectBridge(framedChannel(socketStream(socket), jsonFrameCodec), {
    token,
    timeout: { ms: 2000, setTimer: timer },
    ...(user ? { user } : {}),
  });
  return createRemoteClient(createPeer(endpoint));
}

describe("the bridge server", () => {
  it("writes bridge.json readable only by the user, with the socket and a fresh token", () => {
    const info = readInfo();
    expect(info.pid).toBe(process.pid);
    expect(info).toMatchObject({ kind: "desktop", locks: 1 });
    expect(info.url).toBeUndefined();
    expect(info.token.length).toBeGreaterThanOrEqual(32);
    if (process.platform !== "win32") {
      expect(dirname(info.socket)).toBe(join(userData, "bridge"));
      expect(basename(info.socket)).toMatch(new RegExp(`^arcue-${process.pid}-[0-9a-f]{6}\\.sock$`));
      expect(statSync(join(userData, BRIDGE_INFO_FILE)).mode & 0o777).toBe(0o600);
      expect(statSync(dirname(info.socket)).mode & 0o777).toBe(0o700);
    }
  });

  it("serves a bridge that presents the token", async () => {
    const client = await connectWith(readInfo().token);
    await expect(client.query("asset.list", {})).resolves.toEqual({ assets: [] });
  });

  it("serves a bridge as the user its hello names, and as nobody without one", async () => {
    const connect = vi.spyOn(core, "connect");
    await (await connectWith(readInfo().token, { name: "Agent" })).query("asset.list", {});
    await (await connectWith(readInfo().token)).query("asset.list", {});
    expect(connect.mock.calls.map(([, options]) => options.user?.())).toEqual([{ name: "Agent" }, undefined]);
  });

  it("refuses internal commands from a bridge", async () => {
    const client = await connectWith(readInfo().token);
    await expect(client.execute("view.moveAsset", { assetId: "a1" })).rejects.toMatchObject({ code: "forbidden" });
  });

  it("closes connections without the token", async () => {
    await expect(connectWith("x".repeat(43))).rejects.toMatchObject({ code: "forbidden" });
  });

  it("removes bridge.json when it closes", async () => {
    await server.close();
    expect(() => statSync(join(userData, BRIDGE_INFO_FILE))).toThrow();
    server = { ...server, close: async () => undefined };
  });

  it("holds back an open until a window for the view it names is open, keeping later requests in order", async () => {
    await server.close();
    const asked: (string | null)[] = [];
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    server = await startBridgeServer({
      core,
      userData,
      kind: "desktop",
      ensureWindow: async (view) => {
        asked.push(view);
        if (view === "a") await held;
      },
      onError: () => undefined,
    });
    const client = await connectWith(server.info.token);

    await expect(client.execute("asset.open", { path: "/missing.fbx" })).rejects.toMatchObject({ code: "not-found" });
    const opening = client.execute("asset.openInView", { path: "/missing.fbx", view: "a" });
    let listed = false;
    const listing = client.query("asset.list", {}).then(() => {
      listed = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(listed).toBe(false);
    release();

    await expect(opening).rejects.toMatchObject({ code: "not-found" });
    await listing;
    await client.execute("asset.openInView", { path: "/missing.fbx", view: "../a" }).catch(() => undefined);
    expect(asked).toEqual([null, "a"]);
  });

  it("refuses to start while another desktop core answers at bridge.json, and leaves that core's file and socket", async () => {
    const second = startBridgeServer({ core, userData, kind: "desktop", ...quiet });

    await expect(second).rejects.toBeInstanceOf(CoreRunningError);
    await expect(second).rejects.toMatchObject({
      code: "conflict",
      running: server.info,
      reason: "same",
      starting: "desktop",
      message: `Arcue is already running (process ${process.pid}).`,
    });
    expect(readInfo()).toEqual(server.info);
    if (process.platform !== "win32")
      expect(readdirSync(join(userData, "bridge"))).toEqual([basename(server.info.socket)]);
    const client = await connectWith(server.info.token);
    await expect(client.query("asset.list", {})).resolves.toEqual({ assets: [] });
  });

  it("names the running core's address when a second serve core is refused", async () => {
    await startServe();

    await expect(startServe("http://localhost:4531")).rejects.toThrow(
      `Arcue is already running at ${ADDRESS} (process ${process.pid}).`,
    );
  });

  it("replaces the bridge.json of a core that stopped without removing it", async () => {
    const stopped = server.info;
    await server.close();
    writeFileSync(join(userData, BRIDGE_INFO_FILE), JSON.stringify(stopped));

    server = await startBridgeServer({ core, userData, kind: "desktop", ...quiet });

    expect(readInfo().token).toBe(server.info.token);
    expect(server.info.token).not.toBe(stopped.token);
    const client = await connectWith(server.info.token);
    await expect(client.query("asset.list", {})).resolves.toEqual({ assets: [] });
  });

  it("names the address a browser shows its pages at in serve.json, with its build", async () => {
    const browser = await startServe(ADDRESS, BUILD);

    expect(readInfo(SERVE_INFO_FILE)).toEqual(browser.info);
    expect(browser.info).toMatchObject({ url: ADDRESS, kind: "serve", locks: 1, build: BUILD });
  });

  it.skipIf(process.platform === "win32")("removes a stale bridge.json and fails when it cannot listen", async () => {
    await stopDefault();
    writeFileSync(join(userData, BRIDGE_INFO_FILE), "{}");
    rmSync(join(userData, "bridge"), { recursive: true });
    writeFileSync(join(userData, "bridge"), "not a folder");
    await expect(startBridgeServer({ core, userData, kind: "desktop", ...quiet })).rejects.toThrow();
    expect(existsSync(join(userData, BRIDGE_INFO_FILE))).toBe(false);
    await startLockFree();
  });

  it.skipIf(process.platform === "win32")(
    "creates a missing user data folder when the socket moves to a temporary folder",
    async () => {
      const missing = join(userData, "x".repeat(120), "data");
      const later = await startBridgeServer({ core, userData: missing, kind: "desktop", ...quiet });
      try {
        expect(dirname(later.info.socket).startsWith(missing)).toBe(false);
        expect(statSync(missing).mode & 0o777).toBe(0o700);
        expect(existsSync(join(missing, BRIDGE_INFO_FILE))).toBe(true);
      } finally {
        await later.close();
      }
      expect(existsSync(dirname(later.info.socket))).toBe(false);
    },
  );

  it.skipIf(process.platform === "win32")(
    "stops listening and removes its socket folder when it cannot write bridge.json",
    async () => {
      await stopDefault();
      const long = join(userData, "x".repeat(120));
      const temporary = `${BRIDGE_INFO_FILE}.${process.pid}.tmp`;
      mkdirSync(join(long, temporary), { recursive: true });
      const runtime = join(userData, "runtime");
      mkdirSync(runtime);
      vi.stubEnv("XDG_RUNTIME_DIR", runtime);
      const listening = vi.spyOn(Server.prototype, "listen");

      await expect(startBridgeServer({ core, userData: long, kind: "desktop", ...quiet })).rejects.toMatchObject({
        code: "EISDIR",
      });

      const started = listening.mock.contexts[0];
      const socket = listening.mock.calls[0]?.[0];
      listening.mockRestore();
      expect(started).toBeInstanceOf(Server);
      expect((started as Server).listening).toBe(false);
      expect(dirname(dirname(String(socket)))).toBe(runtime);
      expect(readdirSync(runtime)).toEqual([]);
      expect(readdirSync(long).filter((name) => name !== LOCKS_FOLDER)).toEqual([temporary]);
      const { value: claim, ms } = await timed(() => claimStart(long, "desktop"));
      await claim.release();
      expect(ms).toBeLessThan(500);
    },
  );
});

describe("cores of both kinds", () => {
  it("starts Arcue in the browser beside the desktop app, and each closes only its own file", async () => {
    const browser = await startServe(ADDRESS, BUILD);

    expect(readInfo()).toEqual(server.info);
    expect(readInfo()).toMatchObject({ kind: "desktop", locks: 1 });
    expect(readInfo(SERVE_INFO_FILE)).toMatchObject({ kind: "serve", locks: 1, build: BUILD, url: ADDRESS });
    await browser.close();
    expect(existsSync(join(userData, SERVE_INFO_FILE))).toBe(false);
    expect(readInfo()).toEqual(server.info);

    const again = await startServe();
    await server.close();
    expect(existsSync(join(userData, BRIDGE_INFO_FILE))).toBe(false);
    expect(readInfo(SERVE_INFO_FILE)).toEqual(again.info);
    server = { ...server, close: async () => undefined };
  });

  it("starts the desktop app beside Arcue in the browser", async () => {
    await stopDefault();
    const browser = await startServe();
    const app = await startDesktop();

    expect(readInfo()).toEqual(app.info);
    expect(readInfo(SERVE_INFO_FILE)).toEqual(browser.info);
    const client = await connectWith(app.info.token);
    await expect(client.query("asset.list", {})).resolves.toEqual({ assets: [] });
  });

  it("refuses both kinds beside an older core that takes no locks, with the message for each", async () => {
    await stopDefault();
    const olderServe = await fake({ file: BRIDGE_INFO_FILE, url: ADDRESS });
    const pid = olderServe.info.pid;

    await expect(startDesktop()).rejects.toMatchObject({
      reason: "unshared",
      message: `Another version of Arcue runs (process ${pid} at ${ADDRESS}) and can't share reviews with this one.`,
    });
    await expect(startServe()).rejects.toMatchObject({
      reason: "unshared",
      message: `An older arcue serve runs at ${ADDRESS} (process ${pid}) and can't share reviews with this one. ${process.platform === "win32" ? "Stop it where it runs" : "Run arcue stop"}, then try again.`,
    });
    await olderServe.close();

    await fake({ file: BRIDGE_INFO_FILE });
    await expect(startDesktop()).rejects.toMatchObject({
      reason: "unshared",
      message: `Another version of Arcue runs (process ${pid}) and can't share reviews with this one.`,
    });
    await expect(startServe()).rejects.toMatchObject({
      reason: "unshared",
      message: `An Arcue app runs (process ${pid}) that can't share reviews with Arcue in the browser. Quit it or update it, then try again.`,
    });
    expect(existsSync(join(userData, SERVE_INFO_FILE))).toBe(false);
  });

  it("refuses both kinds beside a core of either kind that takes other locks", async () => {
    await stopDefault();
    for (const [file, kind] of [
      [SERVE_INFO_FILE, "serve"],
      [BRIDGE_INFO_FILE, "desktop"],
    ] as const) {
      const future = await fake({ file, kind, locks: 2 });
      await expect(startDesktop()).rejects.toMatchObject({ reason: "unshared", running: future.info });
      await expect(startServe()).rejects.toMatchObject({ reason: "unshared", running: future.info });
      await future.close();
    }
  });

  it("replaces a stale serve.json when Arcue in the browser starts, and leaves it when the desktop app starts", async () => {
    await stopDefault();
    const stale = writeStale(SERVE_INFO_FILE, { url: ADDRESS, kind: "serve", locks: 1 });

    const app = await startDesktop();
    expect(readInfo(SERVE_INFO_FILE)).toEqual(stale);
    const browser = await startServe();

    expect(readInfo(SERVE_INFO_FILE)).toEqual(browser.info);
    expect(readInfo()).toEqual(app.info);
  });

  it("replaces its own stale file after a crash and leaves a live serve.json alone", async () => {
    await stopDefault();
    const browser = await startServe();
    writeStale(BRIDGE_INFO_FILE, { kind: "desktop", locks: 1 });

    const app = await startDesktop();

    expect(readInfo()).toEqual(app.info);
    expect(readInfo(SERVE_INFO_FILE)).toEqual(browser.info);
  });

  it("starts Arcue in the browser in place of a stale bridge.json of an older core", async () => {
    await stopDefault();
    writeStale(BRIDGE_INFO_FILE, { url: ADDRESS });

    const browser = await startServe();

    expect(readInfo(SERVE_INFO_FILE)).toEqual(browser.info);
  });

  it("records the kind that started last, keeps the address of the last Arcue in the browser, and not on a refusal", async () => {
    const lastCore = () => lastCoreSchema.parse(JSON.parse(readFileSync(join(userData, LAST_CORE_FILE), "utf8")));
    expect(lastCore()).toEqual({ version: 1, kind: "desktop" });

    const browser = await startServe();
    expect(lastCore()).toEqual({ version: 1, kind: "serve", serveUrl: ADDRESS });
    await server.close();
    server = await startBridgeServer({ core, userData, kind: "desktop", ...quiet });
    expect(lastCore()).toEqual({ version: 1, kind: "desktop", serveUrl: ADDRESS });

    await browser.close();
    await recordLastCore(userData, "serve", ADDRESS);
    expect(lastCore()).toEqual({ version: 1, kind: "serve", serveUrl: ADDRESS });

    await expect(startDesktop()).rejects.toBeInstanceOf(CoreRunningError);
    expect(lastCore()).toEqual({ version: 1, kind: "serve", serveUrl: ADDRESS });
  });

  it("lets go of the start lock when it is refused", async () => {
    await expect(startDesktop()).rejects.toBeInstanceOf(CoreRunningError);
    await startLockFree();
  });

  it("writes its bridge file again when it is gone, and never over another live core's", async () => {
    const browser = await startServe();
    await expect(browser.holdsInfo()).resolves.toBe("own");

    rmSync(join(userData, SERVE_INFO_FILE));
    await expect(browser.holdsInfo()).resolves.toBe("missing");
    await browser.rewriteInfo();
    expect(readInfo(SERVE_INFO_FILE)).toEqual(browser.info);

    writeStale(SERVE_INFO_FILE, { url: ADDRESS, kind: "serve", locks: 1 });
    await expect(browser.holdsInfo()).resolves.toBe("missing");
    await browser.rewriteInfo();
    expect(readInfo(SERVE_INFO_FILE)).toEqual(browser.info);

    const other = await fake({ file: SERVE_INFO_FILE, url: "http://localhost:4531", kind: "serve", locks: 1 });
    await expect(browser.holdsInfo()).resolves.toBe("other-live");
    await browser.rewriteInfo();
    expect(readInfo(SERVE_INFO_FILE)).toEqual(other.info);
    await browser.close();
    expect(readInfo(SERVE_INFO_FILE)).toEqual(other.info);
  });

  it("writes no bridge file once it closes, also from a rewrite that waited for the start lock meanwhile", async () => {
    const browser = await startServe();
    await browser.close();
    await browser.rewriteInfo();
    expect(existsSync(join(userData, SERVE_INFO_FILE))).toBe(false);

    const again = await startServe();
    rmSync(join(userData, SERVE_INFO_FILE));
    const release = await takeStartLock(userData, 1000);
    const rewrite = again.rewriteInfo();
    await new Promise((resolve) => setTimeout(resolve, 100));
    await again.close();
    await release();
    await rewrite;

    expect(existsSync(join(userData, SERVE_INFO_FILE))).toBe(false);
    await startLockFree();
  });

  it("does not bring back a data folder that was removed", async () => {
    const browser = await startServe();
    await server.close();
    server = { ...server, close: async () => undefined };
    await browser.close();
    rmSync(userData, { recursive: true, force: true });

    await browser.rewriteInfo();
    await recordLastCore(userData, "serve", ADDRESS);

    expect(existsSync(userData)).toBe(false);
  });
});

describe("cores starting at once in two processes", () => {
  let fixture: Fixture;

  beforeAll(async () => {
    fixture = await buildFixture();
  }, 60_000);

  afterAll(() => fixture.remove());

  afterEach(() => fixture.stopAll());

  async function together(children: FixtureChild[]): Promise<unknown[]> {
    await Promise.all(children.map((child) => child.message((message) => message === "ready")));
    for (const child of children) child.send("go");
    return Promise.all(
      children.map((child) =>
        child.message(
          (message) =>
            typeof message === "object" && message !== null && ("started" in message || "refused" in message),
        ),
      ),
    );
  }

  it("lets exactly one of two serve cores start", async () => {
    await stopDefault();
    const children = [4530, 4531].map((port) =>
      fixture.start({ mode: "serve-start", userData, url: `http://localhost:${port}` }, userData),
    );

    const outcomes = await together(children);

    const started = outcomes.filter(
      (outcome) => typeof outcome === "object" && outcome !== null && "started" in outcome,
    );
    expect(started).toHaveLength(1);
    expect(started[0]).toEqual({ started: readInfo(SERVE_INFO_FILE) });
    const refused = outcomes.find((outcome) => typeof outcome === "object" && outcome !== null && "refused" in outcome);
    expect(refused).toEqual({
      refused: `Arcue is already running at ${readInfo(SERVE_INFO_FILE).url} (process ${readInfo(SERVE_INFO_FILE).pid}).`,
    });
    for (const child of children) child.send("release");
    await Promise.all(children.map((child) => child.exited));
  });

  it("lets exactly one of a serve core and a future desktop core start, under the one start lock", async () => {
    await stopDefault();
    const children = [
      fixture.start({ mode: "serve-start", userData, url: ADDRESS }, userData),
      fixture.start({ mode: "future-desktop", userData }, userData),
    ];

    const outcomes = await together(children);

    expect(
      outcomes.filter((outcome) => typeof outcome === "object" && outcome !== null && "started" in outcome),
    ).toHaveLength(1);
    for (const child of children) child.send("release");
    await Promise.all(children.map((child) => child.exited));
  });
});

describe("the bridge address", () => {
  it.skipIf(process.platform === "win32")(
    "names each socket after its process, and removes the sockets of processes that have ended",
    async () => {
      const folder = join(userData, "bridge");
      const ended = spawnSync(process.execPath, ["-e", ""]).pid;
      writeFileSync(join(folder, `arcue-${ended}-0a0a0a.sock`), "");
      writeFileSync(join(folder, `arcue-${process.ppid}-0b0b0b.sock`), "");

      const address = await bridgeAddress(userData, process.platform, 4242);

      expect(address.socket).toMatch(/\/arcue-4242-[0-9a-f]{6}\.sock$/);
      expect(existsSync(join(folder, `arcue-${ended}-0a0a0a.sock`))).toBe(false);
      expect(existsSync(join(folder, `arcue-${process.ppid}-0b0b0b.sock`))).toBe(true);
    },
  );

  it.skipIf(process.platform === "win32")(
    "moves a socket path too long for the system into a new private temporary folder",
    async () => {
      const long = join(userData, "x".repeat(120));
      const first = await bridgeAddress(long);
      const second = await bridgeAddress(long);
      expect(Buffer.byteLength(first.socket)).toBeLessThanOrEqual(104);
      expect(first.socket).not.toBe(second.socket);
      expect(statSync(dirname(first.socket)).mode & 0o777).toBe(0o700);
      await first.remove();
      await second.remove();
      expect(existsSync(dirname(first.socket))).toBe(false);
    },
  );

  it("names a new random pipe on Windows each time", async () => {
    const roaming = "C:\\Users\\me\\AppData\\Roaming\\Arcue";
    const first = await bridgeAddress(roaming, "win32");
    const second = await bridgeAddress(roaming, "win32");
    expect(first.socket).toMatch(/^\\\\\.\\pipe\\arcue-[0-9a-f]{32}$/);
    expect(first.socket).not.toBe(second.socket);
  });
});
