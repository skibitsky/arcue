import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ArcueCore, ManualClock, MemoryPlatform } from "@arcue/core";
import type { BridgeInfo } from "@arcue/protocol";
import { BRIDGE_INFO_FILE } from "@arcue/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { BridgeServer } from "./bridge-server";
import { startBridgeServer } from "./bridge-server";
import { connectToCore, runningCore } from "./core-connection";

let userData: string;
let core: ArcueCore;
let server: BridgeServer | null;

/** macOS's temporary folder is too long for the socket to fit inside the user data folder, so tests use /tmp. */
const userDataRoot = process.platform === "win32" ? tmpdir() : "/tmp";

beforeEach(async () => {
  userData = realpathSync(mkdtempSync(join(userDataRoot, "arcue-connection-")));
  core = await ArcueCore.start({ platform: new MemoryPlatform({ clock: new ManualClock() }) });
  server = null;
});

afterEach(async () => {
  await server?.close();
  core.dispose();
  rmSync(userData, { recursive: true, force: true });
});

async function serve(url?: string): Promise<BridgeServer> {
  server = await startBridgeServer({
    core,
    userData,
    ensureWindow: async () => undefined,
    onError: () => undefined,
    ...(url ? { url } : {}),
  });
  return server;
}

function writeBridgeInfo(info: BridgeInfo): void {
  writeFileSync(join(userData, BRIDGE_INFO_FILE), JSON.stringify(info));
}

const stale = (): BridgeInfo => ({ version: 1, socket: join(userData, "gone.sock"), token: "t".repeat(43), pid: 1 });

describe("connecting to a core", () => {
  it("presents the token from bridge.json and queries the core", async () => {
    const { info } = await serve();
    const connection = await connectToCore(userData);
    expect(connection?.info).toEqual(info);
    await expect(connection?.client.query("asset.list", {})).resolves.toEqual({ assets: [] });
    connection?.close();
  });

  it("is refused when the token does not match", async () => {
    const { info } = await serve();
    writeBridgeInfo({ ...info, token: "u".repeat(43) });
    await expect(connectToCore(userData)).rejects.toMatchObject({ code: "forbidden" });
  });

  it("finds nothing without bridge.json or with a stale socket", async () => {
    await expect(connectToCore(userData)).resolves.toBeNull();
    writeBridgeInfo(stale());
    await expect(connectToCore(userData)).resolves.toBeNull();
  });
});

describe("the running core", () => {
  it("is the one that answers at bridge.json, with the address it names", async () => {
    const { info } = await serve("http://localhost:4530");
    await expect(runningCore(userData)).resolves.toEqual(info);
  });

  it("is one that listens on the socket but refuses the token", async () => {
    const { info } = await serve();
    const changed = { ...info, token: "u".repeat(43) };
    writeBridgeInfo(changed);
    await expect(runningCore(userData)).resolves.toEqual(changed);
  });

  it("is none without bridge.json, with an invalid one, or with a stale socket", async () => {
    await expect(runningCore(userData)).resolves.toBeNull();
    writeFileSync(join(userData, BRIDGE_INFO_FILE), "{}");
    await expect(runningCore(userData)).resolves.toBeNull();
    writeBridgeInfo(stale());
    await expect(runningCore(userData)).resolves.toBeNull();
  });
});
