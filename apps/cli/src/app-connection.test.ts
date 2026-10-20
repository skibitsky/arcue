import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import type { Server, Socket } from "node:net";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BridgeInfo, IncomingRequest, LaunchInfo } from "@arcue/protocol";
import {
  ArcueError,
  acceptBridge,
  BRIDGE_INFO_FILE,
  createPeer,
  framedChannel,
  jsonFrameCodec,
  LAUNCH_INFO_FILE,
} from "@arcue/protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appEnvironment, bundledApp, connectOrLaunch, connectToApp, userDataDir } from "./app-connection";
import { run } from "./run";

const TOKEN = "t".repeat(43);
let userData: string;
let server: Server;
let sockets: Set<Socket>;
let requests: IncomingRequest[];
let previousUserData: string | undefined;

const timer = (delayMs: number, callback: () => void) => {
  const handle = setTimeout(callback, delayMs);
  return () => clearTimeout(handle);
};

async function startFakeCore(token = TOKEN): Promise<void> {
  const socket = join(userData, "arcue.sock");
  server = createServer((connection) => {
    sockets.add(connection);
    const stream = {
      write: (bytes: Uint8Array) => {
        connection.write(bytes);
      },
      onData(listener: (bytes: Uint8Array) => void) {
        connection.on("data", listener);
        return () => connection.off("data", listener);
      },
      onClose(listener: () => void) {
        connection.once("close", listener);
        return () => connection.off("close", listener);
      },
      close: () => connection.destroy(),
    };
    acceptBridge(framedChannel(stream, jsonFrameCodec), { token, timeout: { ms: 2000, setTimer: timer } }).then(
      ({ endpoint }) => {
        createPeer(endpoint, {
          handleRequest: (request) => {
            requests.push(request);
            if (request.name === "asset.list") {
              return {
                assets: [
                  {
                    assetId: "a1",
                    path: "/work/Hero.fbx",
                    name: "Hero.fbx",
                    status: "ready",
                    version: "v1",
                    error: null,
                  },
                ],
              };
            }
            if (request.name === "asset.open") return { assetId: "a2" };
            throw new ArcueError("unknown-command", request.name);
          },
        });
      },
      () => undefined,
    );
  });
  await new Promise<void>((resolve) => server.listen(socket, resolve));
  writeBridgeInfo(TOKEN);
}

function writeBridgeInfo(token: string): void {
  const info: BridgeInfo = { version: 1, socket: join(userData, "arcue.sock"), token, pid: 4242 };
  writeFileSync(join(userData, BRIDGE_INFO_FILE), JSON.stringify(info));
}

/** Records a launch command that runs Node with the script, standing in for the app. */
function writeLaunchInfo(script: string): void {
  const info: LaunchInfo = { version: 1, command: process.execPath, args: ["-e", script] };
  writeFileSync(join(userData, LAUNCH_INFO_FILE), JSON.stringify(info));
}

function capture() {
  const lines = { out: "", err: "" };
  return {
    lines,
    output: { out: (text: string) => (lines.out += text), err: (text: string) => (lines.err += text) },
  };
}

beforeEach(() => {
  userData = realpathSync(mkdtempSync(join(tmpdir(), "arcue-cli-")));
  sockets = new Set();
  requests = [];
  previousUserData = process.env.ARCUE_USER_DATA;
  process.env.ARCUE_USER_DATA = userData;
});

afterEach(async () => {
  for (const socket of sockets) socket.destroy();
  if (server?.listening) await new Promise((resolve) => server.close(resolve));
  if (previousUserData === undefined) delete process.env.ARCUE_USER_DATA;
  else process.env.ARCUE_USER_DATA = previousUserData;
  rmSync(userData, { recursive: true, force: true });
});

describe("connecting to the app", () => {
  it("presents the token from bridge.json and queries the core", async () => {
    await startFakeCore();
    const connection = await connectToApp(userData);
    expect(connection).not.toBeNull();
    await expect(connection?.client.query("asset.list", {})).resolves.toMatchObject({ assets: [{ assetId: "a1" }] });
    connection?.close();
  });

  it("is refused when the token does not match", async () => {
    await startFakeCore("u".repeat(43));
    await expect(connectToApp(userData)).rejects.toMatchObject({ code: "forbidden" });
  });

  it("finds nothing without bridge.json or with a stale socket", async () => {
    await expect(connectToApp(userData)).resolves.toBeNull();
    const stale: BridgeInfo = { version: 1, socket: join(userData, "gone.sock"), token: TOKEN, pid: 1 };
    writeFileSync(join(userData, BRIDGE_INFO_FILE), JSON.stringify(stale));
    await expect(connectToApp(userData)).resolves.toBeNull();
  });
});

describe("starting the app", () => {
  it("runs the command from launch.json and connects once the socket appears", async () => {
    const marker = join(userData, "launched");
    writeLaunchInfo(`require("node:fs").writeFileSync(${JSON.stringify(marker)}, "")`);
    const connecting = connectOrLaunch(userData, { timeoutMs: 10_000, pollMs: 20 });
    await vi.waitFor(() => expect(existsSync(marker)).toBe(true), { timeout: 5000 });
    await new Promise((resolve) => setTimeout(resolve, 100));
    await startFakeCore();
    const connection = await connecting;
    await expect(connection.client.query("asset.list", {})).resolves.toMatchObject({ assets: [{ assetId: "a1" }] });
    connection.close();
  });

  it("starts the given app rather than launch.json's, and never as Node", async () => {
    const recorded = join(userData, "recorded");
    const started = join(userData, "started");
    writeLaunchInfo(`require("node:fs").writeFileSync(${JSON.stringify(recorded)}, "")`);
    const script = `require("node:fs").writeFileSync(${JSON.stringify(started)}, process.env.ELECTRON_RUN_AS_NODE ?? "unset")`;
    const previous = process.env.ELECTRON_RUN_AS_NODE;
    process.env.ELECTRON_RUN_AS_NODE = "1";
    try {
      const connecting = connectOrLaunch(userData, {
        timeoutMs: 10_000,
        pollMs: 20,
        app: { version: 1, command: process.execPath, args: ["-e", script] },
      });
      await vi.waitFor(() => expect(existsSync(started)).toBe(true), { timeout: 5000 });
      await startFakeCore();
      (await connecting).close();
    } finally {
      if (previous === undefined) delete process.env.ELECTRON_RUN_AS_NODE;
      else process.env.ELECTRON_RUN_AS_NODE = previous;
    }
    expect(readFileSync(started, "utf8")).toBe("unset");
    expect(existsSync(recorded)).toBe(false);
  });

  it("gives up when the started app never listens", async () => {
    writeLaunchInfo("");
    await expect(connectOrLaunch(userData, { timeoutMs: 300, pollMs: 20 })).rejects.toThrow(
      /^Arcue did not start within \d+ seconds\. Run "arcue serve" to use it in a browser\.$/,
    );
  });

  it("keeps waiting when the started app exits with 0, as a second instance does", async () => {
    const marker = join(userData, "launched");
    writeLaunchInfo(`require("node:fs").writeFileSync(${JSON.stringify(marker)}, "")`);
    const connecting = connectOrLaunch(userData, { timeoutMs: 10_000, pollMs: 20 });
    await vi.waitFor(() => expect(existsSync(marker)).toBe(true), { timeout: 5000 });
    await new Promise((resolve) => setTimeout(resolve, 300));
    await startFakeCore();
    (await connecting).close();
  });

  it("says so at once when the app is no longer where launch.json says", async () => {
    const gone = join(userData, "gone", "Arcue");
    const info: LaunchInfo = { version: 1, command: gone, args: [] };
    writeFileSync(join(userData, LAUNCH_INFO_FILE), JSON.stringify(info));
    const started = Date.now();

    await expect(connectOrLaunch(userData, { timeoutMs: 30_000, pollMs: 20 })).rejects.toThrow(
      `Arcue is not running, and it is no longer at ${gone}. Open Arcue once where it is installed now, or run "arcue serve" to use it in a browser.`,
    );
    expect(Date.now() - started).toBeLessThan(3000);
  });

  it("says so at once when the started app quits with an error", async () => {
    writeLaunchInfo("process.exit(3)");
    const started = Date.now();

    await expect(connectOrLaunch(userData, { timeoutMs: 30_000, pollMs: 20 })).rejects.toThrow(
      'Arcue quit as it started (exit code 3). Run "arcue serve" to use it in a browser.',
    );
    expect(Date.now() - started).toBeLessThan(3000);
  });

  it.skipIf(process.platform === "win32")("names the signal that ended the started app", async () => {
    writeLaunchInfo('process.kill(process.pid, "SIGKILL")');

    await expect(connectOrLaunch(userData, { timeoutMs: 30_000, pollMs: 20 })).rejects.toThrow(
      "Arcue quit as it started (signal SIGKILL).",
    );
  });

  it("says so when the app was never started on this computer", async () => {
    await expect(connectOrLaunch(userData, { timeoutMs: 300, pollMs: 20 })).rejects.toThrow(/Start it once first/);
  });

  it("retries a refused handshake while a starting core replaces bridge.json", async () => {
    await startFakeCore("u".repeat(43));
    const connecting = connectOrLaunch(userData, { timeoutMs: 5000, pollMs: 20 });
    await new Promise((resolve) => setTimeout(resolve, 100));
    writeBridgeInfo("u".repeat(43));
    const connection = await connecting;
    await expect(connection.client.query("asset.list", {})).resolves.toMatchObject({ assets: [{ assetId: "a1" }] });
    connection.close();
  });

  it("reports the refusal when the handshake never succeeds", async () => {
    await startFakeCore("u".repeat(43));
    await expect(connectOrLaunch(userData, { timeoutMs: 200, pollMs: 20 })).rejects.toMatchObject({
      code: "forbidden",
      message:
        'Arcue refused the connection. The token does not match the running app. Quit Arcue and open it again, or run "arcue serve" to use it in a browser.',
    });
  });

  it("says what to do when the app accepts the connection but never answers", async () => {
    server = createServer((connection) => {
      sockets.add(connection);
    });
    await new Promise<void>((resolve) => server.listen(join(userData, "arcue.sock"), resolve));
    writeBridgeInfo(TOKEN);

    await expect(connectOrLaunch(userData, { timeoutMs: 200, pollMs: 20, handshakeMs: 50 })).rejects.toMatchObject({
      code: "timeout",
      message:
        'The handshake took longer than 50 ms. Quit Arcue and open it again, or run "arcue serve" to use it in a browser.',
    });
  });
});

describe("the arcue command", () => {
  it("opens a file by its absolute path with a clip and frame", async () => {
    await startFakeCore();
    writeFileSync(join(userData, "Hero.fbx"), "fbx");
    const { lines, output } = capture();
    const code = await run(["open", "Hero.fbx", "--clip", "Armature|Charge", "--frame", "34"], output, userData);
    expect(code).toBe(0);
    expect(requests.find((request) => request.name === "asset.open")?.input).toEqual({
      path: join(userData, "Hero.fbx"),
      clip: "Armature|Charge",
      frame: 34,
    });
    expect(lines.out).toContain("as a2");
  });

  it("opens a file by the letter case it has on disk", async ({ skip }) => {
    writeFileSync(join(userData, "Hero.fbx"), "fbx");
    if (!existsSync(join(userData, "HERO.FBX"))) skip();
    await startFakeCore();
    const { output } = capture();
    await expect(run(["open", "hero.FBX"], output, userData)).resolves.toBe(0);
    expect(requests.find((request) => request.name === "asset.open")?.input).toEqual({
      path: join(userData, "Hero.fbx"),
    });
  });

  it("refuses a missing file before it starts the app", async () => {
    const { lines, output } = capture();
    await expect(run(["open", "Missing.fbx"], output, userData)).resolves.toBe(1);
    expect(lines.err).toContain("is not a file");
  });

  it("reports the running app's assets", async () => {
    await startFakeCore();
    const { lines, output } = capture();
    await expect(run(["status"], output)).resolves.toBe(0);
    expect(lines.out).toContain("process 4242");
    expect(lines.out).toContain("a1  ready    /work/Hero.fbx");
  });

  it("reports when the app is not running", async () => {
    const { lines, output } = capture();
    await expect(run(["status"], output)).resolves.toBe(1);
    expect(lines.out).toBe("Arcue is not running.\n");
  });

  it("exits with 2 and the usage for bad arguments", async () => {
    const { lines, output } = capture();
    await expect(run(["open"], output)).resolves.toBe(2);
    expect(lines.err).toContain("Usage:");
  });
});

describe("bundledApp", () => {
  it("is the Electron that runs the command line from its own resources", () => {
    expect(
      bundledApp({
        execPath: "/Applications/Arcue.app/Contents/MacOS/Arcue",
        electron: "44.6.0",
        scriptDir: "/Applications/Arcue.app/Contents/Resources/cli",
        platform: "darwin",
      }),
    ).toEqual({ version: 1, command: "/Applications/Arcue.app/Contents/MacOS/Arcue", args: [] });
    expect(
      bundledApp({
        execPath: "/usr/lib/arcue/Arcue",
        electron: "44.6.0",
        scriptDir: "/usr/lib/arcue/resources/cli",
        platform: "linux",
      }),
    ).toEqual({ version: 1, command: "/usr/lib/arcue/Arcue", args: [] });
    expect(
      bundledApp({
        execPath: "C:\\Users\\Me\\AppData\\Local\\Programs\\Arcue\\Arcue.exe",
        electron: "44.6.0",
        scriptDir: "c:\\users\\me\\appdata\\local\\programs\\arcue\\resources\\cli",
        platform: "win32",
      }),
    ).toEqual({ version: 1, command: "C:\\Users\\Me\\AppData\\Local\\Programs\\Arcue\\Arcue.exe", args: [] });
  });

  it("is nothing on Node, or for a command line outside the Electron app", () => {
    expect(
      bundledApp({
        execPath: "/usr/bin/node",
        electron: undefined,
        scriptDir: "/usr/bin/resources/cli",
        platform: "linux",
      }),
    ).toBeNull();
    expect(
      bundledApp({
        execPath: "/work/node_modules/electron/dist/electron",
        electron: "44.6.0",
        scriptDir: "/work/apps/cli/dist",
        platform: "linux",
      }),
    ).toBeNull();
    expect(
      bundledApp({
        execPath: "/Applications/Arcue.app/Contents/MacOS/Arcue",
        electron: "44.6.0",
        scriptDir: "/Applications/Arcue.app/Contents/Resources/cli/web",
        platform: "darwin",
      }),
    ).toBeNull();
  });

  it("is nothing for the command line under test", () => {
    expect(bundledApp()).toBeNull();
  });
});

describe("appEnvironment", () => {
  it("keeps everything but ELECTRON_RUN_AS_NODE, in any letter case", () => {
    expect(appEnvironment({ PATH: "/bin", ELECTRON_RUN_AS_NODE: "1", Electron_Run_As_Node: "1", HOME: "/h" })).toEqual({
      PATH: "/bin",
      HOME: "/h",
    });
  });
});

describe("userDataDir", () => {
  it("follows Electron's folder for an app named Arcue", () => {
    expect(userDataDir({}, "darwin", "/Users/me")).toBe(join("/Users/me", "Library", "Application Support", "Arcue"));
    expect(userDataDir({ XDG_CONFIG_HOME: "/cfg" }, "linux", "/home/me")).toBe(join("/cfg", "Arcue"));
    expect(userDataDir({}, "linux", "/home/me")).toBe(join("/home/me", ".config", "Arcue"));
    expect(userDataDir({ ARCUE_USER_DATA: "/tmp/x" }, "darwin", "/Users/me")).toBe("/tmp/x");
  });
});
