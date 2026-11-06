import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import type { Server } from "node:http";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { connectToCore } from "@arcue/platform-node";
import { outsideSessions } from "@arcue/platform-node/test";
import type { AssetSummary, CoreClient, ViewState } from "@arcue/protocol";
import type { Browser, ElectronApplication, Page } from "playwright";
import { _electron, chromium } from "playwright";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { parseArch, parsePlatform } from "../packaging/layout.ts";
import type { UpdateManifest } from "../packaging/updates.ts";
import { newUpdateKey, signManifest } from "../packaging/updates.ts";
import { rendererSwitches } from "./rendering.ts";

interface WindowProbe {
  arcueWindow?: {
    client: CoreClient;
    store: {
      openPath(path: string): Promise<void>;
      state: { get(): { tabs: readonly { kind: string; id: string }[] } };
      session(id: string): {
        state: { get(): { viewportReady: boolean } };
        setClip(clip: string | null, frame?: number): void;
      } | null;
    };
    update: { get(): { state: { status: string } } };
  };
}

const appDir = fileURLToPath(new URL("..", import.meta.url));
const repo = resolve(appDir, "../..");
const electronPath = createRequire(import.meta.url)("electron") as string;
const run = promisify(execFile);
const sandbox: Record<string, string> = process.getuid?.() === 0 ? { ELECTRON_DISABLE_SANDBOX: "1" } : {};
const NOTE = "The idle breathing reads too fast";
const key = newUpdateKey();
const installer = Buffer.from("A newer Arcue that the restart does not install");

let workDir: string;
let userData: string;
let golem: string;
let server: Server;
let feed: string;
let app: ElectronApplication | null = null;
let relaunched: number | null = null;
let failed = false;

function env(): Record<string, string> {
  const given = {
    ...outsideSessions(process.env),
    ...sandbox,
    ARCUE_USER_DATA: userData,
    ARCUE_UPDATE_URL: feed,
    ARCUE_UPDATE_KEY: key.publicKey,
  };
  return Object.fromEntries(Object.entries(given).filter((entry): entry is [string, string] => entry[1] !== undefined));
}

async function connected(page: Page): Promise<Page> {
  await page.waitForFunction(
    () => (globalThis as WindowProbe).arcueWindow?.client.connectionState === "connected",
    undefined,
    { timeout: 20_000 },
  );
  return page;
}

/** The core of the app that answers the command line now, or null while none does. */
async function core(): Promise<{ client: CoreClient; pid: number; close(): void } | null> {
  const connection = await connectToCore(userData, "desktop").catch(() => null);
  return connection ? { client: connection.client, pid: connection.info.pid, close: () => connection.close() } : null;
}

beforeAll(async () => {
  workDir = realpathSync(mkdtempSync(join(tmpdir(), "arcue-update-e2e-")));
  userData = join(workDir, "user-data");
  golem = join(workDir, "pebble-golem.fbx");
  cpSync(join(repo, "samples", "pebble-golem.fbx"), golem);
  server = createServer((request, response) => {
    if (request.url === "/update.json") response.end(signManifest(manifest(), key.privateKey));
    else if (request.url === "/installer") response.end(installer);
    else response.writeHead(404).end();
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  feed = `http://127.0.0.1:${(server.address() as AddressInfo).port}/update.json`;
});

afterEach(({ task }) => {
  if (task.result?.state === "fail") failed = true;
});

afterAll(async () => {
  await app?.close().catch(() => undefined);
  const pid = relaunched;
  if (pid !== null) {
    process.kill(pid, "SIGTERM");
    const deadline = Date.now() + 20_000;
    while (alive(pid) && Date.now() < deadline) await new Promise((done) => setTimeout(done, 100));
  }
  server.close();
  if (failed && existsSync(join(userData, "logs"))) {
    cpSync(join(userData, "logs"), join(appDir, "test-results", "update"), { recursive: true });
  }
  rmSync(workDir, { recursive: true, force: true });
});

/** The relaunched app's window, through the debugging port it inherited, which it names in its data folder. */
async function relaunchedWindow(): Promise<{ browser: Browser; page: Page }> {
  const deadline = Date.now() + 20_000;
  for (;;) {
    try {
      const port = readFileSync(join(userData, "DevToolsActivePort"), "utf8").split("\n")[0];
      const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 2000 });
      const pages = browser.contexts().flatMap((context) => context.pages());
      const page = pages.find((candidate) => candidate.url().startsWith("arcue:"));
      if (page) return { browser, page };
      await browser.close();
    } catch {
      // The port may still be the first instance's, or the new one may not listen yet.
    }
    if (Date.now() > deadline) throw new Error("The relaunched app's window did not answer on its debugging port.");
    await new Promise((done) => setTimeout(done, 250));
  }
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function manifest(): UpdateManifest {
  const platform = parsePlatform(process.platform);
  return {
    product: "arcue",
    version: "99.0.0",
    page: new URL("/release", feed).href,
    summary: "A newer Arcue.",
    files: [
      {
        platform,
        arch: parseArch(process.arch),
        kind: platform === "darwin" ? "dmg" : platform === "win32" ? "setup" : "tar",
        url: new URL("/installer", feed).href,
        sha256: createHash("sha256").update(installer).digest("hex"),
        size: installer.length,
      },
    ],
  };
}

describe.skipIf(process.platform === "win32")("updating the desktop app", () => {
  it("restarts into an update it found, and reopens the tab with its view and the comment not sent yet", async () => {
    app = await _electron.launch({ executablePath: electronPath, args: [...rendererSwitches, appDir], env: env() });
    const electron = app;
    const page = await connected(await electron.firstWindow());
    const assetId = await page.evaluate(async (path) => {
      const window = (globalThis as WindowProbe).arcueWindow;
      if (!window) throw new Error("The window has no arcueWindow.");
      await window.store.openPath(path);
      const [tab] = window.store.state.get().tabs;
      return tab?.id ?? "";
    }, golem);
    await page.waitForFunction(
      (id) => (globalThis as WindowProbe).arcueWindow?.store.session(id)?.state.get().viewportReady,
      assetId,
      {
        timeout: 30_000,
      },
    );
    await page.evaluate(
      (id) => (globalThis as WindowProbe).arcueWindow?.store.session(id)?.setClip("Armature|Walk", 14),
      assetId,
    );
    await page.getByLabel("Comment without a pin").filter({ visible: true }).fill(NOTE);

    const restart = page.getByRole("button", { name: "Restart to update" });
    await restart.waitFor({ timeout: 40_000 });
    const before = await core();
    expect(before).not.toBeNull();
    before?.close();
    const exited = new Promise<void>((done) => electron.process().once("exit", () => done()));
    await restart.click();
    await exited;
    app = null;

    let after: Awaited<ReturnType<typeof core>> = null;
    await expect
      .poll(
        async () => {
          after?.close();
          after = await core();
          return after !== null && after.pid !== before?.pid;
        },
        { timeout: 40_000, interval: 250 },
      )
      .toBe(true);
    const relaunchedCore = after as Awaited<ReturnType<typeof core>>;
    if (!relaunchedCore) throw new Error("The app did not start again.");
    const parent = Number((await run("ps", ["-o", "ppid=", "-p", String(relaunchedCore.pid)])).stdout.trim());
    relaunched = parent > 1 ? parent : null;
    try {
      const reopened = async () => {
        const { assets } = (await relaunchedCore.client.query("asset.list", {})) as { assets: AssetSummary[] };
        const asset = assets.find((candidate) => candidate.path === golem);
        if (!asset) return null;
        return (await relaunchedCore.client.query("viewState.get", { assetId: asset.assetId })) as ViewState | null;
      };
      await expect.poll(reopened, { timeout: 30_000 }).toMatchObject({ clip: "Armature|Walk", frame: 14, note: NOTE });

      const shown = await relaunchedWindow();
      try {
        const field = shown.page.getByLabel("Comment without a pin").filter({ visible: true });
        await expect.poll(() => field.inputValue(), { timeout: 20_000 }).toBe(NOTE);
      } finally {
        await shown.browser.close();
      }
    } finally {
      relaunchedCore.close();
    }
  });
});
