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
} from "@arcue/protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BridgeServer } from "./bridge-server";
import { bridgeAddress, CoreRunningError, startBridgeServer } from "./bridge-server";
import { socketStream } from "./node-socket";

let userData: string;
let core: ArcueCore;
let server: BridgeServer;
const errors: unknown[] = [];

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
    ensureWindow: async () => undefined,
    onError: (error) => errors.push(error),
  });
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await server.close();
  core.dispose();
  rmSync(userData, { recursive: true, force: true });
  errors.length = 0;
});

function readInfo(): BridgeInfo {
  return bridgeInfoSchema.parse(JSON.parse(readFileSync(join(userData, BRIDGE_INFO_FILE), "utf8")));
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
    server = { info: server.info, close: async () => undefined };
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

  it("refuses to start while another core answers at bridge.json, and leaves that core's file and socket", async () => {
    const second = startBridgeServer({ core, userData, ensureWindow: async () => undefined, onError: () => undefined });

    await expect(second).rejects.toBeInstanceOf(CoreRunningError);
    await expect(second).rejects.toMatchObject({ code: "conflict", running: server.info });
    expect(readInfo()).toEqual(server.info);
    if (process.platform !== "win32")
      expect(readdirSync(join(userData, "bridge"))).toEqual([basename(server.info.socket)]);
    const client = await connectWith(server.info.token);
    await expect(client.query("asset.list", {})).resolves.toEqual({ assets: [] });
  });

  it("names the running core's address when it refuses", async () => {
    await server.close();
    server = await startBridgeServer({
      core,
      userData,
      ensureWindow: async () => undefined,
      onError: () => undefined,
      url: "http://localhost:4530",
    });

    await expect(
      startBridgeServer({ core, userData, ensureWindow: async () => undefined, onError: () => undefined }),
    ).rejects.toThrow(`Arcue is already running at http://localhost:4530 (process ${process.pid}).`);
  });

  it("replaces the bridge.json of a core that stopped without removing it", async () => {
    const stopped = server.info;
    await server.close();
    writeFileSync(join(userData, BRIDGE_INFO_FILE), JSON.stringify(stopped));

    server = await startBridgeServer({ core, userData, ensureWindow: async () => undefined, onError: () => undefined });

    expect(readInfo().token).toBe(server.info.token);
    expect(server.info.token).not.toBe(stopped.token);
    const client = await connectWith(server.info.token);
    await expect(client.query("asset.list", {})).resolves.toEqual({ assets: [] });
  });

  it("names the address a browser shows its window at", async () => {
    await server.close();
    server = await startBridgeServer({
      core,
      userData,
      ensureWindow: async () => undefined,
      onError: () => undefined,
      url: "http://localhost:4530",
    });

    expect(readInfo().url).toBe("http://localhost:4530");
  });

  it.skipIf(process.platform === "win32")("removes a stale bridge.json and fails when it cannot listen", async () => {
    await server.close();
    server = { info: server.info, close: async () => undefined };
    writeFileSync(join(userData, BRIDGE_INFO_FILE), "{}");
    rmSync(join(userData, "bridge"), { recursive: true });
    writeFileSync(join(userData, "bridge"), "not a folder");
    await expect(
      startBridgeServer({ core, userData, ensureWindow: async () => undefined, onError: () => undefined }),
    ).rejects.toThrow();
    expect(existsSync(join(userData, BRIDGE_INFO_FILE))).toBe(false);
  });

  it.skipIf(process.platform === "win32")(
    "creates a missing user data folder when the socket moves to a temporary folder",
    async () => {
      const missing = join(userData, "x".repeat(120), "data");
      const later = await startBridgeServer({
        core,
        userData: missing,
        ensureWindow: async () => undefined,
        onError: () => undefined,
      });
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
      await server.close();
      server = { info: server.info, close: async () => undefined };
      const long = join(userData, "x".repeat(120));
      const temporary = `${BRIDGE_INFO_FILE}.${process.pid}.tmp`;
      mkdirSync(join(long, temporary), { recursive: true });
      const runtime = join(userData, "runtime");
      mkdirSync(runtime);
      vi.stubEnv("XDG_RUNTIME_DIR", runtime);
      const listening = vi.spyOn(Server.prototype, "listen");

      await expect(
        startBridgeServer({ core, userData: long, ensureWindow: async () => undefined, onError: () => undefined }),
      ).rejects.toMatchObject({ code: "EISDIR" });

      const started = listening.mock.contexts[0];
      const socket = listening.mock.calls[0]?.[0];
      listening.mockRestore();
      expect(started).toBeInstanceOf(Server);
      expect((started as Server).listening).toBe(false);
      expect(dirname(dirname(String(socket)))).toBe(runtime);
      expect(readdirSync(runtime)).toEqual([]);
      expect(readdirSync(long)).toEqual([temporary]);
    },
  );
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
