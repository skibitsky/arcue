import { chmodSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { connect, Socket } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { ArcueCore, ManualClock, MemoryPlatform } from "@arcue/core";
import type { BridgeInfo, CoreKind } from "@arcue/protocol";
import { BRIDGE_INFO_FILE, SERVE_INFO_FILE } from "@arcue/protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BridgeServer } from "./bridge-server";
import { startBridgeServer } from "./bridge-server";
import { blockingCore, connectToCore, readBridgeInfo, runningCore } from "./core-connection";
import type { FakeCore, FakeCoreOptions } from "./test-cores";
import { deadPid, startFakeCore } from "./test-cores";

vi.mock("node:net", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:net")>();
  return { ...actual, connect: vi.fn(actual.connect) };
});

let userData: string;
let core: ArcueCore;
const started: { close(): Promise<void> }[] = [];

/** macOS's temporary folder is too long for the socket to fit inside the user data folder, so tests use /tmp. */
const userDataRoot = process.platform === "win32" ? tmpdir() : "/tmp";
const ADDRESS = "http://localhost:4530";

beforeEach(async () => {
  userData = realpathSync(mkdtempSync(join(userDataRoot, "arcue-connection-")));
  core = await ArcueCore.start({ platform: new MemoryPlatform({ clock: new ManualClock() }) });
});

afterEach(async () => {
  vi.mocked(connect).mockReset();
  for (const server of started.splice(0)) await server.close();
  core.dispose();
  rmSync(userData, { recursive: true, force: true });
});

async function serve(kind: CoreKind): Promise<BridgeServer> {
  const quiet = { core, userData, ensureWindow: async () => undefined, onError: () => undefined };
  const server = await startBridgeServer(kind === "serve" ? { ...quiet, kind, url: ADDRESS } : { ...quiet, kind });
  started.push(server);
  return server;
}

async function fake(options: FakeCoreOptions): Promise<FakeCore> {
  const server = await startFakeCore(userData, options);
  started.push(server);
  return server;
}

function writeInfo(file: string, info: BridgeInfo): void {
  writeFileSync(join(userData, file), JSON.stringify(info));
}

/** A socket whose connect fails with this code, as a socket this user may not reach does. */
function failingSocket(code: string): Socket {
  const socket = new Socket();
  process.nextTick(() => socket.destroy(Object.assign(new Error(`connect ${code}`), { code })));
  return socket;
}

const stale = (more: Partial<BridgeInfo> = {}): BridgeInfo => ({
  version: 1,
  socket: join(userData, "gone.sock"),
  token: "t".repeat(43),
  pid: deadPid(),
  ...more,
});

describe("connecting to a core", () => {
  it("presents the token from the bridge file of its kind and queries the core", async () => {
    const app = await serve("desktop");
    const browser = await serve("serve");

    const toApp = await connectToCore(userData, "desktop");
    const toBrowser = await connectToCore(userData, "serve");

    expect(toApp?.info).toEqual(app.info);
    expect(toBrowser?.info).toEqual(browser.info);
    await expect(toBrowser?.client.query("asset.list", {})).resolves.toEqual({ assets: [] });
    toApp?.close();
    toBrowser?.close();
  });

  it("is refused when the token does not match", async () => {
    const { info } = await serve("desktop");
    writeInfo(BRIDGE_INFO_FILE, { ...info, token: "u".repeat(43) });
    await expect(connectToCore(userData, "desktop")).rejects.toMatchObject({ code: "forbidden" });
  });

  it("finds nothing without the bridge file or with a stale socket", async () => {
    await expect(connectToCore(userData, "serve")).resolves.toBeNull();
    writeInfo(SERVE_INFO_FILE, stale());
    await expect(connectToCore(userData, "serve")).resolves.toBeNull();
  });

  it("reads only the bridge file of the kind it asks for", async () => {
    const browser = await serve("serve");
    await expect(readBridgeInfo(userData, "serve")).resolves.toEqual(browser.info);
    await expect(readBridgeInfo(userData, "desktop")).resolves.toBeNull();
    await expect(connectToCore(userData, "desktop")).resolves.toBeNull();
  });

  it("rejects when connecting fails other than because nothing listens, and counts that core as live", async () => {
    const unreachable = await fake({ file: SERVE_INFO_FILE, kind: "serve", locks: 1, url: ADDRESS });
    for (let call = 0; call < 3; call++) vi.mocked(connect).mockImplementationOnce(() => failingSocket("EACCES"));

    await expect(connectToCore(userData, "serve")).rejects.toMatchObject({ code: "EACCES" });
    await expect(runningCore(userData, "serve")).resolves.toEqual(unreachable.info);
    await expect(blockingCore(userData, "serve")).resolves.toEqual({ info: unreachable.info, reason: "same" });
  });

  it.skipIf(process.platform === "win32")(
    "rejects when the socket's path runs through a file, and counts that core as live",
    async () => {
      writeFileSync(join(userData, "in-the-way"), "");
      const info = stale({ socket: join(userData, "in-the-way", "arcue.sock"), kind: "serve", locks: 1, url: ADDRESS });
      writeInfo(SERVE_INFO_FILE, info);

      await expect(connectToCore(userData, "serve")).rejects.toMatchObject({ code: "ENOTDIR" });
      await expect(runningCore(userData, "serve")).resolves.toEqual(info);
      await expect(blockingCore(userData, "serve")).resolves.toEqual({ info, reason: "same" });
    },
  );

  it.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
    "rejects when it may not reach the socket, and counts that core as running",
    async () => {
      const unreachable = await fake({ file: SERVE_INFO_FILE, kind: "serve", locks: 1, url: ADDRESS });
      chmodSync(dirname(unreachable.info.socket), 0o000);
      try {
        await expect(connectToCore(userData, "serve")).rejects.toMatchObject({ code: "EACCES" });
        await expect(runningCore(userData, "serve")).resolves.toEqual(unreachable.info);
      } finally {
        chmodSync(dirname(unreachable.info.socket), 0o700);
      }
    },
  );
});

describe("the running core", () => {
  it("is the one that answers at the bridge file of its kind, with the address it names", async () => {
    const { info } = await serve("serve");
    await expect(runningCore(userData, "serve")).resolves.toEqual(info);
    await expect(runningCore(userData, "desktop")).resolves.toBeNull();
  });

  it("is one that listens on the socket but refuses the token", async () => {
    const { info } = await serve("desktop");
    const changed = { ...info, token: "u".repeat(43) };
    writeInfo(BRIDGE_INFO_FILE, changed);
    await expect(runningCore(userData, "desktop")).resolves.toEqual(changed);
  });

  it("is one that refuses every token, or never answers", async () => {
    const refusing = await fake({ file: SERVE_INFO_FILE, kind: "serve", locks: 1, url: ADDRESS, refuse: true });
    await expect(runningCore(userData, "serve")).resolves.toEqual(refusing.info);
    const silent = await fake({ file: BRIDGE_INFO_FILE, silent: true });
    await expect(runningCore(userData, "desktop", 200)).resolves.toEqual(silent.info);
  });

  it("is none without the bridge file, with an invalid one, or with a stale socket", async () => {
    await expect(runningCore(userData, "desktop")).resolves.toBeNull();
    writeFileSync(join(userData, BRIDGE_INFO_FILE), "{}");
    await expect(runningCore(userData, "desktop")).resolves.toBeNull();
    writeInfo(BRIDGE_INFO_FILE, stale());
    await expect(runningCore(userData, "desktop")).resolves.toBeNull();
  });
});

describe("the core that keeps another from starting", () => {
  const current = { locks: 1 } as const;

  it("is a second Arcue in the browser for Arcue in the browser", async () => {
    const browser = await fake({ file: SERVE_INFO_FILE, kind: "serve", url: ADDRESS, ...current });
    await expect(blockingCore(userData, "serve")).resolves.toEqual({ info: browser.info, reason: "same" });
  });

  it("is Arcue in the browser that takes other locks, for either kind", async () => {
    for (const more of [{ locks: 2 }, {}]) {
      const browser = await fake({ file: SERVE_INFO_FILE, kind: "serve", url: ADDRESS, ...more });
      await expect(blockingCore(userData, "serve")).resolves.toEqual({ info: browser.info, reason: "unshared" });
      await expect(blockingCore(userData, "desktop")).resolves.toEqual({ info: browser.info, reason: "unshared" });
      await browser.close();
    }
    const unmarked = await fake({ file: SERVE_INFO_FILE, url: ADDRESS, ...current });
    await expect(blockingCore(userData, "serve")).resolves.toEqual({ info: unmarked.info, reason: "unshared" });
  });

  it("is a core at bridge.json that takes no locks or other ones, for Arcue in the browser", async () => {
    for (const options of [{ url: ADDRESS }, {}, { kind: "desktop", locks: 2 }] as const) {
      const older = await fake({ file: BRIDGE_INFO_FILE, ...options });
      await expect(blockingCore(userData, "serve")).resolves.toEqual({ info: older.info, reason: "unshared" });
      await older.close();
    }
  });

  it("is never the desktop app that takes the same locks, for Arcue in the browser", async () => {
    await fake({ file: BRIDGE_INFO_FILE, kind: "desktop", ...current });
    await expect(blockingCore(userData, "serve")).resolves.toBeNull();
  });

  it("is a second desktop app for the desktop app", async () => {
    const app = await fake({ file: BRIDGE_INFO_FILE, kind: "desktop", ...current });
    await expect(blockingCore(userData, "desktop")).resolves.toEqual({ info: app.info, reason: "same" });
  });

  it("is anything else at bridge.json for the desktop app", async () => {
    for (const options of [
      { url: ADDRESS },
      {},
      { kind: "desktop", locks: 2 },
      { kind: "serve", url: ADDRESS, ...current },
    ] as const) {
      const other = await fake({ file: BRIDGE_INFO_FILE, ...options });
      await expect(blockingCore(userData, "desktop")).resolves.toEqual({ info: other.info, reason: "unshared" });
      await other.close();
    }
  });

  it("is never Arcue in the browser that takes the same locks, for the desktop app", async () => {
    await fake({ file: SERVE_INFO_FILE, kind: "serve", url: ADDRESS, ...current });
    await expect(blockingCore(userData, "desktop")).resolves.toBeNull();
  });

  it("is none for stale files of either kind", async () => {
    writeInfo(BRIDGE_INFO_FILE, stale());
    writeInfo(SERVE_INFO_FILE, stale({ url: ADDRESS }));
    await expect(blockingCore(userData, "serve")).resolves.toBeNull();
    await expect(blockingCore(userData, "desktop")).resolves.toBeNull();
  });

  it("is a core that refuses or never answers", async () => {
    const refusing = await fake({ file: SERVE_INFO_FILE, kind: "serve", url: ADDRESS, refuse: true, ...current });
    await expect(blockingCore(userData, "serve", 200)).resolves.toEqual({ info: refusing.info, reason: "same" });
    const silent = await fake({ file: BRIDGE_INFO_FILE, silent: true });
    await expect(blockingCore(userData, "desktop", 200)).resolves.toEqual({ info: silent.info, reason: "unshared" });
  });
});
