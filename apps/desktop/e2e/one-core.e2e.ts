import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ArcueCore, ManualClock, MemoryPlatform } from "@arcue/core";
import type { BridgeServer } from "@arcue/platform-node";
import { runningCore, startBridgeServer } from "@arcue/platform-node";
import type { CoreClient } from "@arcue/protocol";
import { BRIDGE_INFO_FILE } from "@arcue/protocol";
import type { ElectronApplication } from "playwright";
import { _electron } from "playwright";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { rendererSwitches } from "./rendering.ts";

const appDir = fileURLToPath(new URL("..", import.meta.url));
const electronPath = createRequire(import.meta.url)("electron") as string;
/** Containers often run as root, where Electron starts only without its sandbox. */
const sandbox: Record<string, string> = process.getuid?.() === 0 ? { ELECTRON_DISABLE_SANDBOX: "1" } : {};
const ADDRESS = "http://localhost:4530";

let userData: string;
let core: ArcueCore;
let other: BridgeServer | null;
let app: ElectronApplication | null;

function launch(): Promise<ElectronApplication> {
  return _electron.launch({
    executablePath: electronPath,
    args: [...rendererSwitches, appDir],
    env: { ...process.env, ...sandbox, ARCUE_USER_DATA: userData },
  });
}

function mainLog(): string {
  try {
    return readFileSync(join(userData, "logs", "main.log"), "utf8");
  } catch {
    return "";
  }
}

beforeEach(async () => {
  userData = realpathSync(mkdtempSync(join(tmpdir(), "arcue-e2e-one-core-")));
  core = await ArcueCore.start({ platform: new MemoryPlatform({ clock: new ManualClock() }) });
  other = await startBridgeServer({
    core,
    userData,
    ensureWindow: async () => undefined,
    onError: () => undefined,
    url: ADDRESS,
  });
  app = null;
});

afterEach(async () => {
  await app?.close();
  await other?.close();
  core.dispose();
  rmSync(userData, { recursive: true, force: true });
});

describe("the desktop app beside another core", () => {
  it("names the address the other core runs at and quits without starting a core of its own", async () => {
    const running = other?.info;
    if (!running) throw new Error("The other core is not running.");
    const electron = await launch();
    app = electron;

    await expect
      .poll(mainLog, { timeout: 20_000 })
      .toContain(`Arcue is already running (process ${running.pid} at ${ADDRESS}), so this one quits`);
    expect(await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(0);
    expect(existsSync(join(userData, "logs", "core.log"))).toBe(false);

    await electron.close();
    app = null;
    expect(JSON.parse(readFileSync(join(userData, BRIDGE_INFO_FILE), "utf8"))).toEqual(running);
    await expect(runningCore(userData)).resolves.toEqual(running);
  });

  it("starts its own core in place of one that stopped without removing bridge.json", async () => {
    const stopped = other?.info;
    if (!stopped) throw new Error("The other core is not running.");
    await other?.close();
    other = null;
    writeFileSync(join(userData, BRIDGE_INFO_FILE), JSON.stringify(stopped));

    const electron = await launch();
    app = electron;
    const page = await electron.firstWindow();
    await page.waitForFunction(
      () =>
        (globalThis as { arcueWindow?: { client: CoreClient } }).arcueWindow?.client.connectionState === "connected",
      undefined,
      { timeout: 20_000 },
    );

    const started = await runningCore(userData);
    expect(started?.pid).not.toBe(stopped.pid);
    expect(started?.url).toBeUndefined();
    await electron.close();
    app = null;
    expect(existsSync(join(userData, BRIDGE_INFO_FILE))).toBe(false);
  });
});
