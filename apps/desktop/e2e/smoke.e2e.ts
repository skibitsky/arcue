import { execFile } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { AssetSummary, CoreClient, ViewState } from "@arcue/protocol";
import type { BrowserWindow } from "electron";
import type { ElectronApplication, Page } from "playwright";
import { _electron } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

interface WindowProbe {
  arcueWindow?: {
    client: CoreClient;
    store: {
      state: { get(): { tabs: readonly { kind: string; id: string }[]; active: string | null } };
      session(id: string): {
        state: { get(): { clip: string | null; viewportReady: boolean; summary: { path: string } } };
        currentFrame(): number;
        viewState(): ViewState | null;
        setFrame(frame: number): void;
        setCamera(camera: ViewState["camera"], animate: boolean): void;
      } | null;
      activate(id: string): void;
    };
  };
  arcueDesktop?: { tabDragEnd(assetId: string, dropped: boolean): void };
}

const appDir = fileURLToPath(new URL("..", import.meta.url));
const repo = resolve(appDir, "../..");
const cli = join(repo, "apps", "cli", "dist", "arcue.js");
const electronPath = createRequire(import.meta.url)("electron") as string;
const run = promisify(execFile);
const TORN_CAMERA: ViewState["camera"] = { position: [2.5, 1.4, 3], target: [0, 0.9, 0], up: [0, 1, 0], fov: 35 };
const DRAFT = "Lift the left arm higher on the second step";

/** A temporary folder with copies of the samples, so reviews the tests write never land in the repository. */
let workDir: string;
let userData: string;
let crate: string;
let golem: string;
let blob: string;
let turn: string;
let outside: string;
let app: ElectronApplication | null = null;

function launch(): Promise<ElectronApplication> {
  return _electron.launch({
    executablePath: electronPath,
    args: [appDir],
    env: { ...process.env, ARCUE_USER_DATA: userData },
  });
}

async function connected(page: Page): Promise<Page> {
  await page.waitForFunction(
    () => (globalThis as WindowProbe).arcueWindow?.client.connectionState === "connected",
    undefined,
    { timeout: 20_000 },
  );
  return page;
}

async function connectedWindow(electron: ElectronApplication): Promise<Page> {
  return connected(await electron.firstWindow());
}

function assets(page: Page): Promise<AssetSummary[]> {
  return page.evaluate(async () => {
    const window = (globalThis as WindowProbe).arcueWindow;
    if (!window) return [];
    return window.client.query("asset.list", {}).then(
      (list) => list.assets,
      () => [],
    );
  });
}

/** Waits until every listed asset finished parsing, and returns the summaries. */
async function settled(page: Page, count: number): Promise<AssetSummary[]> {
  const deadline = Date.now() + 30_000;
  for (;;) {
    const list = await assets(page);
    if (list.length === count && list.every((asset) => asset.status !== "loading")) return list;
    if (Date.now() > deadline) throw new Error(`Assets did not settle: ${JSON.stringify(list)}`);
    await page.waitForTimeout(100);
  }
}

function sceneOf(page: Page, assetId: string) {
  return page.evaluate(async (id) => {
    const window = (globalThis as WindowProbe).arcueWindow;
    if (!window) throw new Error("The window has no arcueWindow.");
    const { scene } = await window.client.query("scene.get", { assetId: id });
    return { meshes: scene.meshes.map((mesh) => mesh.name), clips: scene.clips.map((clip) => clip.name) };
  }, assetId);
}

function bridgeInfo(): { pid: number } {
  try {
    return JSON.parse(readFileSync(join(userData, "bridge.json"), "utf8")) as { pid: number };
  } catch {
    return { pid: 0 };
  }
}

/** The paths of a window's asset tabs, in order. */
function tabPaths(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const store = (globalThis as WindowProbe).arcueWindow?.store;
    if (!store) return [];
    return store.state
      .get()
      .tabs.filter((tab) => tab.kind === "asset")
      .map((tab) => store.session(tab.id)?.state.get().summary.path ?? "");
  });
}

/** The clip, frame and rounded camera an asset's tab shows, or null while its view is not ready. */
function shown(page: Page, assetId: string) {
  return page.evaluate((id) => {
    const session = (globalThis as WindowProbe).arcueWindow?.store.session(id);
    const view = session?.state.get().viewportReady ? session.viewState() : null;
    if (!view) return null;
    const round = (values: readonly number[]) => values.map((value) => Math.round(value * 1000) / 1000);
    const { position, target, up, fov } = view.camera;
    return {
      clip: view.clip,
      frame: view.frame,
      camera: { position: round(position), target: round(target), up: round(up), fov: Math.round(fov * 1000) / 1000 },
    };
  }, assetId);
}

/** Clicks an item of the native application menu by its id, as a mouse click would. */
async function clickMenuItem(electron: ElectronApplication, id: string): Promise<void> {
  await electron.evaluate(({ Menu }, itemId) => {
    const item = Menu.getApplicationMenu()?.getMenuItemById(itemId);
    if (!item) throw new Error(`No menu item "${itemId}".`);
    item.click();
  }, id);
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function drafts(page: Page): Promise<string | null> {
  return page.getByRole("list", { name: "Drafts" }).filter({ visible: true }).textContent();
}

/** The share of the visible 3D view's pixels that are bright, which the dark empty stage never is. */
async function brightShare(electron: ElectronApplication, page: Page): Promise<number> {
  const box = await page.getByTestId("viewport").filter({ visible: true }).boundingBox();
  if (!box || box.width < 10 || box.height < 10) return 0;
  const window = await electron.browserWindow(page);
  return window.evaluate(async (win: BrowserWindow, rect) => {
    const image = await win.webContents.capturePage({
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.floor(rect.width),
      height: Math.floor(rect.height),
    });
    const pixels = image.toBitmap();
    let bright = 0;
    for (let index = 0; index + 3 < pixels.length; index += 4) {
      const luma =
        0.0722 * (pixels[index] ?? 0) + 0.7152 * (pixels[index + 1] ?? 0) + 0.2126 * (pixels[index + 2] ?? 0);
      if (luma > 90) bright++;
    }
    return bright / Math.max(1, pixels.length / 4);
  }, box);
}

beforeAll(() => {
  workDir = realpathSync(mkdtempSync(join(tmpdir(), "arcue-e2e-")));
  userData = join(workDir, "user-data");
  const samples = join(workDir, "samples");
  mkdirSync(samples);
  [crate, golem, blob, turn] = ["crate.fbx", "pebble-golem.fbx", "blob.fbx", "beetle-turn.fbx"].map((name) => {
    cpSync(join(repo, "samples", name), join(samples, name));
    return join(samples, name);
  }) as [string, string, string, string];
  outside = join(workDir, "elsewhere", "Elsewhere.fbx");
  mkdirSync(join(workDir, "elsewhere"));
  cpSync(join(repo, "samples", "beetle-turn.fbx"), outside);
});

afterAll(async () => {
  await app?.close();
  rmSync(workDir, { recursive: true, force: true });
});

describe("arcue inspect", () => {
  it("summarizes a sample without starting the app", async () => {
    const inspected = await run(process.execPath, [cli, "inspect", "--json", "samples/pebble-golem.fbx"], {
      cwd: workDir,
      env: { ...process.env, ARCUE_USER_DATA: userData },
    });
    expect(JSON.parse(inspected.stdout)).toMatchObject({
      file: { path: golem },
      bones: 27,
      meshes: [{ name: "PebbleGolem", skinned: true }],
    });
    expect(bridgeInfo().pid).toBe(0);
  });
});

describe("the desktop app", () => {
  it("opens a sample from its window and renders it in the 3D view", async () => {
    const electron = await launch();
    app = electron;
    const page = await connectedWindow(electron);
    const crateId = await page.evaluate(async (path) => {
      const window = (globalThis as WindowProbe).arcueWindow;
      if (!window) throw new Error("The window has no arcueWindow.");
      return (await window.client.execute("asset.open", { path })).assetId;
    }, crate);
    const [crateSummary] = await settled(page, 1);
    expect(crateSummary).toMatchObject({ assetId: crateId, status: "ready", name: "crate.fbx" });
    expect(await sceneOf(page, crateId)).toMatchObject({ meshes: ["Crate"] });
    await expect.poll(() => brightShare(electron, page)).toBeGreaterThan(0.05);
  });

  it("adds a file to the view from the native open dialog, and says why it refuses one", async () => {
    const electron = app;
    if (!electron) throw new Error("The app is not running.");
    const page = await connectedWindow(electron);
    const crateId = (await assets(page)).find((asset) => asset.path === crate)?.assetId ?? "";
    const answer = (paths: string[]) =>
      electron.evaluate(({ dialog }, filePaths) => {
        dialog.showOpenDialog = (async () => ({ canceled: false, filePaths })) as typeof dialog.showOpenDialog;
      }, paths);
    await page.getByRole("button", { name: "Asset info" }).filter({ visible: true }).click();

    await answer([outside]);
    await page.getByRole("button", { name: "Add file" }).click();
    await expect.poll(() => page.getByText("Elsewhere.fbx is outside the asset's workspace.").count()).toBe(1);

    await answer([turn]);
    await page.getByRole("button", { name: "Add file" }).click();
    await expect.poll(async () => (await sceneOf(page, crateId)).clips).toEqual(["beetle-turn.fbx//Armature|Turn"]);
    const composition = (await assets(page)).find((asset) => asset.assetId === crateId)?.composition ?? "";
    expect(composition).toBe(join(userData, "reviews", crate.slice(1), "composition.json"));
    expect(JSON.parse(readFileSync(composition, "utf8"))).toEqual({ version: 1, animations: ["beetle-turn.fbx"] });
    expect(readdirSync(join(workDir, "samples")).sort()).toEqual([
      "beetle-turn.fbx",
      "blob.fbx",
      "crate.fbx",
      "pebble-golem.fbx",
    ]);

    const clips = async () => (await sceneOf(page, crateId)).clips;
    await clickMenuItem(electron, "undo");
    await expect.poll(() => existsSync(composition)).toBe(false);
    await expect.poll(clips).toEqual([]);
    await clickMenuItem(electron, "redo");
    await expect.poll(clips).toEqual(["beetle-turn.fbx//Armature|Turn"]);

    const field = page.getByLabel("Comment without a pin").filter({ visible: true });
    await field.click();
    await page.keyboard.type("Spin");
    await clickMenuItem(electron, "undo");
    await expect.poll(() => field.inputValue()).not.toBe("Spin");
    expect(existsSync(composition)).toBe(true);
    await field.fill("");
    await field.blur();

    await clickMenuItem(electron, "undo");
    await expect.poll(() => existsSync(composition)).toBe(false);
    await expect.poll(clips).toEqual([]);
    await page.keyboard.press("Escape");
  });

  it("adds a tab at the clip and frame that arcue open names", async () => {
    if (!app) throw new Error("The app is not running.");
    const page = await connectedWindow(app);
    const opened = await run(
      process.execPath,
      [cli, "open", "samples/pebble-golem.fbx", "--clip", "Armature|Walk", "--frame", "12"],
      { cwd: workDir, env: { ...process.env, ARCUE_USER_DATA: userData } },
    );
    expect(opened.stdout).toContain(`Opened ${golem}`);
    const list = await settled(page, 2);
    const golemSummary = list.find((asset) => asset.path === golem);
    expect(golemSummary?.status).toBe("ready");
    const golemId = golemSummary?.assetId ?? "";
    const golemScene = await sceneOf(page, golemId);
    expect(golemScene.meshes).toEqual(["PebbleGolem"]);
    expect(golemScene.clips).toContain("Armature|Walk");
    await expect.poll(() => page.locator("[role='tab']").count()).toBe(2);
    await expect.poll(() => tabPaths(page)).toEqual([crate, golem]);
    await expect.poll(async () => (await shown(page, golemId))?.frame).toBe(12);
    expect((await shown(page, golemId))?.clip).toBe("Armature|Walk");
    expect(await page.evaluate(() => (globalThis as WindowProbe).arcueWindow?.store.state.get().active)).toBe(golemId);

    const status = await run(process.execPath, [cli, "status"], { env: { ...process.env, ARCUE_USER_DATA: userData } });
    expect(status.stdout).toContain("crate.fbx");
    expect(status.stdout).toContain("pebble-golem.fbx");
  });

  it("forwards a second launch's file to the running app", async () => {
    if (!app) throw new Error("The app is not running.");
    const page = await connectedWindow(app);
    await run(electronPath, [appDir, blob], {
      env: { ...process.env, ARCUE_USER_DATA: userData },
    });
    const list = await settled(page, 3);
    expect(list.find((asset) => asset.path === blob)?.status).toBe("ready");
    await expect.poll(() => tabPaths(page)).toEqual([crate, golem, blob]);
  });

  it("reconnects its window and reopens its tabs after the core crashes", async () => {
    if (!app) throw new Error("The app is not running.");
    const page = await connectedWindow(app);
    const before = bridgeInfo();
    process.kill(before.pid, "SIGKILL");
    await expect.poll(() => bridgeInfo().pid, { timeout: 20_000 }).not.toBe(before.pid);
    await connectedWindow(app);
    const list = await settled(page, 3);
    expect(list.map((asset) => asset.path)).toEqual([crate, golem, blob]);
    await expect.poll(() => tabPaths(page)).toEqual([crate, golem, blob]);
    const golemId = list.find((asset) => asset.path === golem)?.assetId ?? "";
    await page.evaluate((id) => (globalThis as WindowProbe).arcueWindow?.store.activate(id), golemId);
    await expect.poll(() => shown(page, golemId)).toMatchObject({ clip: "Armature|Walk", frame: 12 });
  });

  it("keeps a torn-off tab's camera, clip, frame and draft in its new window", async () => {
    const electron = app;
    if (!electron) throw new Error("The app is not running.");
    const page = await connectedWindow(electron);
    const golemId = (await assets(page)).find((asset) => asset.path === golem)?.assetId ?? "";
    await page.evaluate((id) => (globalThis as WindowProbe).arcueWindow?.store.activate(id), golemId);
    await expect.poll(() => shown(page, golemId)).not.toBeNull();
    await page.evaluate(
      ([id, camera]) => {
        const session = (globalThis as WindowProbe).arcueWindow?.store.session(id);
        session?.setFrame(20);
        session?.setCamera(camera, false);
      },
      [golemId, TORN_CAMERA] as const,
    );
    const field = page.getByLabel("Comment without a pin").filter({ visible: true });
    await field.fill(DRAFT);
    await field.press("Enter");
    await expect.poll(() => drafts(page)).toContain(DRAFT);
    const before = await shown(page, golemId);
    expect(before).toMatchObject({ clip: "Armature|Walk", frame: 20 });
    expect(before?.camera.position).toEqual(TORN_CAMERA.position);

    await electron.evaluate(({ BrowserWindow, screen }) => {
      const [source] = BrowserWindow.getAllWindows();
      const area = screen.getDisplayMatching(source?.getBounds() ?? screen.getPrimaryDisplay().bounds).workArea;
      source?.setBounds({ x: area.x, y: area.y, width: Math.floor(area.width / 2), height: area.height });
      const cursor = { x: area.x + Math.floor(area.width * 0.6), y: area.y + 40 };
      screen.getCursorScreenPoint = () => cursor;
    });
    const opened = electron.waitForEvent("window");
    await page.evaluate((id) => (globalThis as WindowProbe).arcueDesktop?.tabDragEnd(id, false), golemId);
    const torn = await connected(await opened);

    await expect.poll(() => tabPaths(torn)).toEqual([golem]);
    await expect.poll(() => tabPaths(page)).toEqual([crate, blob]);
    await expect.poll(() => shown(torn, golemId)).toEqual(before);
    await expect.poll(() => drafts(torn)).toContain(DRAFT);
    await expect.poll(() => brightShare(electron, torn)).toBeGreaterThan(0.02);
  });

  it("restores its windows and tabs after a relaunch", async () => {
    await app?.close();
    app = null;
    const session = JSON.parse(readFileSync(join(userData, "session.json"), "utf8")) as {
      windows: { tabs: { tabs: { path: string }[] } }[];
    };
    expect(session.windows.map((window) => window.tabs.tabs.map((tab) => tab.path))).toEqual([[crate, blob], [golem]]);

    app = await launch();
    const electron = app;
    await expect.poll(() => electron.windows().length, { timeout: 20_000 }).toBe(2);
    const pages = await Promise.all(electron.windows().map((page) => connected(page)));
    const first = await connectedWindow(electron);
    const list = await settled(first, 3);
    expect(list.map((asset) => asset.status)).toEqual(["ready", "ready", "ready"]);
    await expect
      .poll(async () => (await Promise.all(pages.map((page) => tabPaths(page)))).sort((a, b) => a.length - b.length))
      .toEqual([[golem], [crate, blob]]);
    const shownGolem = await Promise.all(
      pages.map(async (page) => ((await tabPaths(page)).includes(golem) ? page : null)),
    );
    const golemPage = shownGolem.find((page) => page !== null);
    if (!golemPage) throw new Error("No window shows the golem.");
    const restoredId = (await assets(golemPage)).find((asset) => asset.path === golem)?.assetId ?? "";
    await expect.poll(() => shown(golemPage, restoredId)).toMatchObject({ clip: "Armature|Walk", frame: 20 });
    await expect.poll(() => drafts(golemPage)).toContain(DRAFT);
  });

  it.skipIf(process.platform === "win32")("starts the stopped app with its built windows for arcue open", async () => {
    await app?.close();
    app = null;
    const env = { ...process.env, ARCUE_USER_DATA: userData };
    const opened = await run(process.execPath, [cli, "open", crate], { env });
    expect(opened.stdout).toContain(`Opened ${crate}`);
    const corePid = bridgeInfo().pid;
    const mainPid = Number((await run("ps", ["-o", "ppid=", "-p", String(corePid)])).stdout.trim());
    expect(mainPid).toBeGreaterThan(1);
    process.kill(mainPid, "SIGTERM");
    await expect.poll(() => alive(mainPid), { timeout: 20_000 }).toBe(false);
  });
});
