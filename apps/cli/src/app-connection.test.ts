import { existsSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { FakeCore, FakeCoreOptions } from "@arcue/platform-node/test";
import { startFakeCore, writeLaunchInfo } from "@arcue/platform-node/test";
import { ArcueError, BRIDGE_INFO_FILE, SERVE_INFO_FILE } from "@arcue/protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { connectOrLaunch, userDataDir } from "./app-connection";
import { run } from "./run";
import { sessionView } from "./session-view";

let userData: string;
let fakes: FakeCore[];
let openInView: (input: unknown) => unknown;

/** The environment of a person at a terminal, with the test's data folder. */
function env(more: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return { ARCUE_USER_DATA: userData, ...more };
}

/** A core of this build at `bridge.json`, the desktop app's file, or as `options` say, answering like Arcue. */
async function fakeCore(options: Partial<FakeCoreOptions> = {}): Promise<FakeCore> {
  const fake = await startFakeCore(userData, {
    file: BRIDGE_INFO_FILE,
    kind: "desktop",
    locks: 1,
    answers: {
      "asset.list": () => ({
        assets: [
          { assetId: "a1", path: "/work/Hero.fbx", name: "Hero.fbx", status: "ready", version: "v1", error: null },
        ],
      }),
      "asset.open": () => ({ assetId: "a2" }),
      "asset.openInView": (input) => openInView(input),
    },
    ...options,
  });
  fakes.push(fake);
  return fake;
}

/** An `arcue serve` from before cores ran side by side, which wrote `bridge.json` with its address and no kind. */
function olderServe(): Promise<FakeCore> {
  return fakeCore({ kind: undefined, locks: undefined, url: "http://localhost:4530" });
}

function requestsOf(name: string): unknown[] {
  return fakes.flatMap((fake) => fake.requests.filter((request) => request.name === name).map(({ input }) => input));
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
  fakes = [];
  openInView = () => ({ assetId: "a2", shown: "view" });
});

afterEach(async () => {
  await Promise.all(fakes.map((fake) => fake.close()));
  rmSync(userData, { recursive: true, force: true });
});

describe("starting the app", () => {
  it("runs the command from launch.json and connects once the socket appears", async () => {
    const marker = join(userData, "launched");
    writeLaunchInfo(userData, `require("node:fs").writeFileSync(${JSON.stringify(marker)}, "")`);
    const connecting = connectOrLaunch(userData, { timeoutMs: 10_000, pollMs: 20 });
    await vi.waitFor(() => expect(existsSync(marker)).toBe(true), { timeout: 5000 });
    await new Promise((resolve) => setTimeout(resolve, 100));
    await fakeCore();
    const connection = await connecting;
    await expect(connection.client.query("asset.list", {})).resolves.toMatchObject({ assets: [{ assetId: "a1" }] });
    connection.close();
  });

  it("gives up when the started app never listens", async () => {
    writeLaunchInfo(userData, "");
    await expect(connectOrLaunch(userData, { timeoutMs: 300, pollMs: 20 })).rejects.toThrow(/did not start within/);
  });

  it("says so when the app was never started on this computer", async () => {
    await expect(connectOrLaunch(userData, { timeoutMs: 300, pollMs: 20 })).rejects.toThrow(
      "Arcue is not running, and the Arcue app has not been started on this computer yet. Start the app once, or run arcue serve --detach to use Arcue in a browser.",
    );
  });

  it("fails at once when the app that launch.json names cannot be started", async () => {
    writeFileSync(join(userData, "launch.json"), JSON.stringify({ version: 1, command: "/nonexistent", args: [] }));
    const started = Date.now();

    await expect(connectOrLaunch(userData, { timeoutMs: 10_000, pollMs: 20 })).rejects.toThrow(
      "The Arcue app could not be started from /nonexistent: spawn /nonexistent ENOENT. Start it from where it is installed, or run arcue serve --detach to use Arcue in a browser.",
    );
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("waits only for the app's bridge.json, never for Arcue in the browser", async () => {
    const served = await fakeCore({ file: SERVE_INFO_FILE, kind: "serve", url: "http://localhost:4530" });
    writeLaunchInfo(userData, "");

    await expect(connectOrLaunch(userData, { timeoutMs: 300, pollMs: 20 })).rejects.toThrow(/did not start within/);
    expect(served.requests).toEqual([]);
  });

  it("retries a refused handshake while a starting core replaces bridge.json", async () => {
    await fakeCore({ refuse: true });
    const connecting = connectOrLaunch(userData, { timeoutMs: 5000, pollMs: 20 });
    await new Promise((resolve) => setTimeout(resolve, 100));
    await fakeCore();
    const connection = await connecting;
    await expect(connection.client.query("asset.list", {})).resolves.toMatchObject({ assets: [{ assetId: "a1" }] });
    connection.close();
  });

  it("reports the refusal when the handshake never succeeds", async () => {
    await fakeCore({ refuse: true });
    await expect(connectOrLaunch(userData, { timeoutMs: 200, pollMs: 20 })).rejects.toMatchObject({
      code: "forbidden",
    });
  });
});

describe("the arcue command", () => {
  it("opens a file by its absolute path with a clip and frame", async () => {
    await fakeCore();
    writeFileSync(join(userData, "Hero.fbx"), "fbx");
    const { lines, output } = capture();
    const code = await run(["open", "Hero.fbx", "--clip", "Armature|Charge", "--frame", "34"], output, env(), userData);
    expect(code).toBe(0);
    expect(requestsOf("asset.open")).toEqual([
      { path: join(userData, "Hero.fbx"), clip: "Armature|Charge", frame: 34 },
    ]);
    expect(lines.out).toContain("as a2");
  });

  it("opens a file by the letter case it has on disk", async ({ skip }) => {
    writeFileSync(join(userData, "Hero.fbx"), "fbx");
    if (!existsSync(join(userData, "HERO.FBX"))) skip();
    await fakeCore();
    const { output } = capture();
    await expect(run(["open", "hero.FBX"], output, env(), userData)).resolves.toBe(0);
    expect(requestsOf("asset.open")).toEqual([{ path: join(userData, "Hero.fbx") }]);
  });

  it("refuses a missing file before it starts the app", async () => {
    const { lines, output } = capture();
    await expect(run(["open", "Missing.fbx"], output, env(), userData)).resolves.toBe(1);
    expect(lines.err).toContain("is not a file");
  });

  it("reports the running app's assets", async () => {
    await fakeCore();
    const { lines, output } = capture();
    await expect(run(["status"], output, env())).resolves.toBe(0);
    expect(lines.out).toContain(`process ${process.pid}`);
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
  const serve = () => fakeCore({ file: SERVE_INFO_FILE, kind: "serve", url: "http://localhost:4530" });

  it("opens a file in the view of the session the environment names", async () => {
    await serve();
    writeFileSync(join(userData, "Hero.fbx"), "fbx");
    const { lines, output } = capture();

    await expect(run(["open", "Hero.fbx", "--frame", "12"], output, env(session), userData)).resolves.toBe(0);

    expect(requestsOf("asset.openInView")).toEqual([
      { path: join(userData, "Hero.fbx"), frame: 12, view, move: false },
    ]);
    expect(requestsOf("asset.open")).toEqual([]);
    expect(lines.out).toBe(`Opened ${join(userData, "Hero.fbx")} in this session's view as a2.\n`);
  });

  it("names the session's page when Arcue holds the model for it, or shows it outside views", async () => {
    await serve();
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
    await fakeCore();
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
    expect(requestsOf("asset.openInView").at(-1)).toMatchObject({ view: sessionView({}, "review"), move: false });

    const moved = capture();
    await expect(run(["open", "Hero.fbx", "--move"], moved.output, env(session), userData)).resolves.toBe(0);
    expect(requestsOf("asset.openInView").at(-1)).toMatchObject({ view, move: true });
  });

  it("says to restart an Arcue older than views, naming where it runs", async () => {
    writeFileSync(join(userData, "Hero.fbx"), "fbx");
    openInView = () => {
      throw new ArcueError("unknown-command", `There is no command named "asset.openInView".`);
    };
    const older = await olderServe();
    const served = capture();

    await expect(run(["open", "Hero.fbx"], served.output, env(session), userData, { platform: "linux" })).resolves.toBe(
      1,
    );
    expect(served.lines.err).toBe(
      `The Arcue at http://localhost:4530 (process ${process.pid}) is older than this arcue command and cannot show models in a session's view. Restart it: run arcue stop, then arcue serve --detach.\n`,
    );
    const onWindows = capture();
    await expect(
      run(["open", "Hero.fbx"], onWindows.output, env(session), userData, { platform: "win32" }),
    ).resolves.toBe(1);
    expect(onWindows.lines.err).toBe(
      `The Arcue at http://localhost:4530 (process ${process.pid}) is older than this arcue command and cannot show models in a session's view. Restart it: stop it where it runs, then arcue serve --detach.\n`,
    );

    await older.close();
    await fakeCore({ kind: undefined, locks: undefined });
    const desktop = capture();
    await expect(run(["open", "Hero.fbx"], desktop.output, env(session), userData)).resolves.toBe(1);
    expect(desktop.lines.err).toBe(
      `The Arcue app (process ${process.pid}) is older than this arcue command and cannot show models in a session's view. Restart it: quit the app and run arcue open again.\n`,
    );
  });

  it("refuses --move outside a session before it starts the app", async () => {
    writeFileSync(join(userData, "Hero.fbx"), "fbx");
    const { lines, output } = capture();

    await expect(run(["open", "Hero.fbx", "--move"], output, env(), userData)).resolves.toBe(1);
    expect(lines.err).toContain("--move takes a model into an agent session's view");
  });

  it("prints the session's view address in its status", async () => {
    await serve();
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
    expect(userDataDir({ ARCUE_USER_DATA: "/tmp/x" }, "darwin", "/Users/me")).toBe(resolve("/tmp/x"));
  });

  it("resolves a relative ARCUE_USER_DATA against the working folder", () => {
    expect(userDataDir({ ARCUE_USER_DATA: "data" })).toBe(resolve(process.cwd(), "data"));
    expect(userDataDir({ ARCUE_USER_DATA: join("..", "data") })).toBe(resolve(process.cwd(), "..", "data"));
  });
});
