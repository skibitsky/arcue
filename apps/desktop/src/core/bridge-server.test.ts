import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { ArcueCore, ManualClock, MemoryPlatform } from "@arcue/core";
import type { BridgeInfo, CoreClient } from "@arcue/protocol";
import {
  BRIDGE_INFO_FILE,
  bridgeInfoSchema,
  connectBridge,
  createPeer,
  createRemoteClient,
  framedChannel,
  jsonFrameCodec,
} from "@arcue/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { BridgeServer } from "./bridge-server";
import { bridgeAddress, startBridgeServer } from "./bridge-server";
import { socketStream } from "./node-socket";

let userData: string;
let core: ArcueCore;
let server: BridgeServer;
const errors: unknown[] = [];

const timer = (delayMs: number, callback: () => void) => {
  const handle = setTimeout(callback, delayMs);
  return () => clearTimeout(handle);
};

beforeEach(async () => {
  userData = realpathSync(mkdtempSync(join(tmpdir(), "arcue-bridge-")));
  core = await ArcueCore.start({ platform: new MemoryPlatform({ clock: new ManualClock() }) });
  server = await startBridgeServer({
    core,
    userData,
    ensureWindow: async () => undefined,
    onError: (error) => errors.push(error),
  });
});

afterEach(async () => {
  await server.close();
  core.dispose();
  rmSync(userData, { recursive: true, force: true });
  errors.length = 0;
});

function readInfo(): BridgeInfo {
  return bridgeInfoSchema.parse(JSON.parse(readFileSync(join(userData, BRIDGE_INFO_FILE), "utf8")));
}

async function connectWith(token: string): Promise<CoreClient> {
  const socket = connect(readInfo().socket);
  await new Promise<void>((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("error", reject);
  });
  const endpoint = await connectBridge(framedChannel(socketStream(socket), jsonFrameCodec), {
    token,
    timeout: { ms: 2000, setTimer: timer },
  });
  return createRemoteClient(createPeer(endpoint));
}

describe("the bridge server", () => {
  it("writes bridge.json readable only by the user, with the socket and a fresh token", () => {
    const info = readInfo();
    expect(info.pid).toBe(process.pid);
    expect(info.token.length).toBeGreaterThanOrEqual(32);
    if (process.platform !== "win32") {
      expect(info.socket).toBe(join(userData, "bridge", "arcue.sock"));
      expect(statSync(join(userData, BRIDGE_INFO_FILE)).mode & 0o777).toBe(0o600);
      expect(statSync(dirname(info.socket)).mode & 0o777).toBe(0o700);
    }
  });

  it("serves a bridge that presents the token", async () => {
    const client = await connectWith(readInfo().token);
    await expect(client.query("asset.list", {})).resolves.toEqual({ assets: [] });
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
});

describe("the bridge address", () => {
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
