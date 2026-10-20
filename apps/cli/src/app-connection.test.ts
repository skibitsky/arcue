import { existsSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
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
import { connectOrLaunch, userDataDir } from "./app-connection";
import { run } from "./run";
import { sessionView } from "./session-view";

const TOKEN = "t".repeat(43);
let userData: string;
let server: Server;
let sockets: Set<Socket>;
let requests: IncomingRequest[];
let openInView: (input: unknown) => unknown;

const timer = (delayMs: number, callback: () => void) => {
  const handle = setTimeout(callback, delayMs);
  return () => clearTimeout(handle);
};

/** The environment of a person at a terminal, with the test's data folder. */
function env(more: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return { ARCUE_USER_DATA: userData, ...more };
}

async function startFakeCore(token = TOKEN, url?: string): Promise<void> {
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
            if (request.name === "asset.openInView") return openInView(request.input);
            throw new ArcueError("unknown-command", request.name);
          },
        });
      },
      () => undefined,
    );
  });
  await new Promise<void>((resolve) => server.listen(socket, resolve));
  writeBridgeInfo(TOKEN, url);
}

function writeBridgeInfo(token: string, url?: string): void {
  const info: BridgeInfo = {
    version: 1,
    socket: join(userData, "arcue.sock"),
    token,
    pid: 4242,
    ...(url ? { url } : {}),
  };
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
  openInView = () => ({ assetId: "a2", shown: "view" });
});

afterEach(async () => {
  for (const socket of sockets) socket.destroy();
  if (server?.listening) await new Promise((resolve) => server.close(resolve));
  rmSync(userData, { recursive: true, force: true });
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

  it("gives up when the started app never listens", async () => {
    writeLaunchInfo("");
    await expect(connectOrLaunch(userData, { timeoutMs: 300, pollMs: 20 })).rejects.toThrow(/did not start within/);
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
    });
  });
});

describe("the arcue command", () => {
  it("opens a file by its absolute path with a clip and frame", async () => {
    await startFakeCore();
    writeFileSync(join(userData, "Hero.fbx"), "fbx");
    const { lines, output } = capture();
    const code = await run(["open", "Hero.fbx", "--clip", "Armature|Charge", "--frame", "34"], output, env(), userData);
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
    await expect(run(["open", "hero.FBX"], output, env(), userData)).resolves.toBe(0);
    expect(requests.find((request) => request.name === "asset.open")?.input).toEqual({
      path: join(userData, "Hero.fbx"),
    });
  });

  it("refuses a missing file before it starts the app", async () => {
    const { lines, output } = capture();
    await expect(run(["open", "Missing.fbx"], output, env(), userData)).resolves.toBe(1);
    expect(lines.err).toContain("is not a file");
  });

  it("reports the running app's assets", async () => {
    await startFakeCore();
    const { lines, output } = capture();
    await expect(run(["status"], output, env())).resolves.toBe(0);
    expect(lines.out).toContain("process 4242");
    expect(lines.out).toContain("a1  ready    /work/Hero.fbx");
  });

  it("reports when the app is not running", async () => {
    const { lines, output } = capture();
    await expect(run(["status"], output, env())).resolves.toBe(1);
    expect(lines.out).toBe("Arcue is not running.\n");
  });

  it("exits with 2 and the usage for bad arguments", async () => {
    const { lines, output } = capture();
    await expect(run(["open"], output, env())).resolves.toBe(2);
    expect(lines.err).toContain("Usage:");
  });
});

describe("the arcue command in an agent session", () => {
  const session = { CLAUDE_CODE_SESSION_ID: "c3a1d6f0-8e2b-4b1c-9d7e-2f5a6b8c0e14" };
  const view = sessionView(session) ?? "";
  const address = `http://localhost:4530/?view=${view}`;

  it("opens a file in the view of the session the environment names", async () => {
    await startFakeCore(TOKEN, "http://localhost:4530");
    writeFileSync(join(userData, "Hero.fbx"), "fbx");
    const { lines, output } = capture();

    await expect(run(["open", "Hero.fbx", "--frame", "12"], output, env(session), userData)).resolves.toBe(0);

    expect(requests.find((request) => request.name === "asset.openInView")?.input).toEqual({
      path: join(userData, "Hero.fbx"),
      frame: 12,
      view,
      move: false,
    });
    expect(requests.some((request) => request.name === "asset.open")).toBe(false);
    expect(lines.out).toBe(`Opened ${join(userData, "Hero.fbx")} in this session's view as a2.\n`);
  });

  it("names the session's page when Arcue holds the model for it, or shows it outside views", async () => {
    await startFakeCore(TOKEN, "http://localhost:4530");
    writeFileSync(join(userData, "Hero.fbx"), "fbx");
    openInView = () => ({ assetId: "a2", shown: "held" });
    const held = capture();

    await expect(run(["open", "Hero.fbx"], held.output, env(session), userData)).resolves.toBe(0);
    expect(held.lines.out).toContain(`until this session's page opens. Open ${address} in the built-in browser`);

    openInView = () => ({ assetId: "a2", shown: "window" });
    const outside = capture();
    await expect(run(["open", "Hero.fbx"], outside.output, env(session), userData)).resolves.toBe(0);
    expect(outside.lines.out).toContain(`in the Arcue page at http://localhost:4530, since this session's page`);
    expect(outside.lines.out).toContain(`Open ${address} in the built-in browser`);
  });

  it("takes --view and --move, and says how to move a model another view shows", async () => {
    await startFakeCore();
    writeFileSync(join(userData, "Hero.fbx"), "fbx");
    openInView = (input) => {
      if ((input as { move: boolean }).move) return { assetId: "a2", shown: "view" };
      throw new ArcueError("conflict", `Hero.fbx is open in another agent session's view, "abc".`);
    };
    const refused = capture();

    await expect(run(["open", "Hero.fbx", "--view", "review"], refused.output, env(session), userData)).resolves.toBe(
      1,
    );
    expect(refused.lines.err).toBe(
      `Hero.fbx is open in another agent session's view, "abc". Add --move to show it in this session's view instead.\n`,
    );
    expect(requests.at(-1)?.input).toMatchObject({ view: sessionView({}, "review"), move: false });

    const moved = capture();
    await expect(run(["open", "Hero.fbx", "--move"], moved.output, env(session), userData)).resolves.toBe(0);
    expect(requests.at(-1)?.input).toMatchObject({ view, move: true });
  });

  it("refuses --move outside a session before it starts the app", async () => {
    writeFileSync(join(userData, "Hero.fbx"), "fbx");
    const { lines, output } = capture();

    await expect(run(["open", "Hero.fbx", "--move"], output, env(), userData)).resolves.toBe(1);
    expect(lines.err).toContain("--move takes a model into an agent session's view");
  });

  it("prints the session's view address in its status", async () => {
    await startFakeCore(TOKEN, "http://localhost:4530");
    const { lines, output } = capture();

    await expect(run(["status"], output, env(session))).resolves.toBe(0);
    expect(lines.out).toContain(`This session's view: ${address}\n`);

    const outside = capture();
    await expect(run(["status"], outside.output, env())).resolves.toBe(0);
    expect(outside.lines.out).not.toContain("This session's view");
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
