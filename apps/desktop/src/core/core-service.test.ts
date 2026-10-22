import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FakeCore, FakeCoreOptions } from "@arcue/platform-node/test";
import { startFakeCore } from "@arcue/platform-node/test";
import { BRIDGE_INFO_FILE, bridgeInfoSchema, LAST_CORE_FILE, LOCK_PROTOCOL, lastCoreSchema } from "@arcue/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FromCore } from "../shared/core-messages";
import { CoreService } from "./core-service";

/** macOS's temporary folder is too long for the socket to fit inside the user data folder, so tests use /tmp. */
const userDataRoot = process.platform === "win32" ? tmpdir() : "/tmp";

let userData: string;
const fakes: FakeCore[] = [];

beforeEach(() => {
  userData = realpathSync(mkdtempSync(join(userDataRoot, "arcue-core-service-")));
});

afterEach(async () => {
  for (const fake of fakes.splice(0)) await fake.close();
  rmSync(userData, { recursive: true, force: true });
});

function runCore() {
  const posted: FromCore[] = [];
  const exits: number[] = [];
  const logFile = join(userData, "logs", "core.log");
  const service = new CoreService({
    importWorkerEntry: join(userData, "import-worker.js"),
    post: (message) => posted.push(message),
    exit: (code) => exits.push(code),
  });
  return {
    posted,
    exits,
    start: () => service.handle({ type: "start", userData, logFile }, []),
    stop: () => service.handle({ type: "stop" }, []),
    log: () => readFileSync(logFile, "utf8"),
  };
}

async function fakeCore(options: FakeCoreOptions): Promise<FakeCore> {
  const fake = await startFakeCore(userData, options);
  fakes.push(fake);
  return fake;
}

const readFile = (name: string) => readFileSync(join(userData, name), "utf8");

describe("the desktop app's core", () => {
  it("serves windows, and records that the app ran last once it stops", async () => {
    const core = runCore();
    await core.start();
    const info = bridgeInfoSchema.parse(JSON.parse(readFile(BRIDGE_INFO_FILE)));
    expect(info).toMatchObject({ kind: "desktop", locks: LOCK_PROTOCOL, pid: process.pid });
    expect(core.posted).toEqual([{ type: "started", socket: info.socket }]);
    rmSync(join(userData, LAST_CORE_FILE));

    await core.stop();
    expect(core.exits).toEqual([0]);
    expect(existsSync(join(userData, BRIDGE_INFO_FILE))).toBe(false);
    expect(lastCoreSchema.parse(JSON.parse(readFile(LAST_CORE_FILE)))).toEqual({ version: 1, kind: "desktop" });
  });

  it("stops beside an older core that takes no review locks, says why, and leaves the files alone", async () => {
    const older = await fakeCore({ file: BRIDGE_INFO_FILE, url: "http://localhost:4599" });
    const before = readFile(BRIDGE_INFO_FILE);
    const core = runCore();
    await core.start();
    expect(core.posted).toEqual([
      { type: "already-running", pid: older.info.pid, url: "http://localhost:4599", reason: "unshared" },
    ]);
    expect(core.log()).toContain(
      `Another version of Arcue runs (process ${older.info.pid} at http://localhost:4599) and can't share reviews with this one. This core stops.`,
    );

    await core.stop();
    expect(core.exits).toEqual([0]);
    expect(existsSync(join(userData, LAST_CORE_FILE))).toBe(false);
    expect(readFile(BRIDGE_INFO_FILE)).toBe(before);
  });

  it("stops beside another Arcue app and leaves the files alone", async () => {
    const app = await fakeCore({ file: BRIDGE_INFO_FILE, kind: "desktop", locks: LOCK_PROTOCOL });
    const before = readFile(BRIDGE_INFO_FILE);
    const core = runCore();
    await core.start();
    expect(core.posted).toEqual([{ type: "already-running", pid: app.info.pid, url: null, reason: "same" }]);
    expect(core.log()).toContain(`Arcue is already running (process ${app.info.pid}). This core stops.`);

    await core.stop();
    expect(core.exits).toEqual([0]);
    expect(existsSync(join(userData, LAST_CORE_FILE))).toBe(false);
    expect(readFile(BRIDGE_INFO_FILE)).toBe(before);
  });
});
