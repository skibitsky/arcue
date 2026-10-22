import type { ChildProcess } from "node:child_process";
import { execFile, execFileSync, spawn } from "node:child_process";
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { CoreClient, LaunchInfo, ViewState } from "@arcue/protocol";
import { BRIDGE_INFO_FILE, LAST_CORE_FILE, LAUNCH_INFO_FILE, roundDataSchema } from "@arcue/protocol";
import type { Page, WebSocketRoute } from "@playwright/test";
import { expect, test } from "@playwright/test";

interface PageProbe {
  arcueWindow: {
    client: CoreClient;
    store: {
      state: { get(): { tabs: readonly { kind: string; id: string }[] } };
      session(id: string): {
        state: { get(): { viewportReady: boolean; summary: { path: string } } };
        viewState(): ViewState | null;
      } | null;
    };
  };
}

const BUILT = fileURLToPath(new URL("../dist/plugins/arcue/skills/arcue/scripts", import.meta.url));
const SAMPLE = fileURLToPath(new URL("../../../samples/stone-striker.fbx", import.meta.url));
const PORT = 4536;
const IDLE_PORT = 4538;
const OTHER_PORT = 4540;
const ADDRESS = `http://localhost:${PORT}`;
const WALK = "StoneResonatorRig|Walk";
const DRAFT = "Lift the back foot sooner.";
const PAGE_STOPPED = "Arcue in the browser stopped. This page reconnects once it runs again.";
const BROWSER_STOPPED =
  "Arcue in the browser has stopped. Run arcue serve --detach to start it again; an open page reconnects by itself.\n";
const DETACHED = /^Arcue runs in a browser at (\S+) \(process (\d+)\)\. It stops by itself/;

let temp: string;
let scripts: string;
let project: string;
let model: string;
let data: string;
let env: NodeJS.ProcessEnv;
/** The processes of Arcue in the browser the tests started, to end any that arcue stop left running. */
const started = new Set<number>();
let failed = false;

/** The environment without the variables that name an agent session, as a person at a terminal has it. */
function outsideSessions(given: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const sessions = ["ARCUE_VIEW", "CLAUDE_CODE_SESSION_ID", "CODEX_SESSION_ID", "CODEX_THREAD_ID"];
  return Object.fromEntries(Object.entries(given).filter(([name]) => !sessions.includes(name)));
}

function arcue(...args: string[]): Promise<{ code: number; out: string }> {
  return arcueIn(env, ...args);
}

function arcueIn(environment: NodeJS.ProcessEnv, ...args: string[]): Promise<{ code: number; out: string }> {
  return arcueFrom(join(scripts, "arcue.js"), environment, ...args);
}

function arcueFrom(script: string, environment: NodeJS.ProcessEnv, ...args: string[]) {
  return new Promise<{ code: number; out: string }>((resolve) => {
    execFile(process.execPath, [script, ...args], { env: environment }, (error, stdout, stderr) => {
      resolve({ code: error ? (typeof error.code === "number" ? error.code : 1) : 0, out: `${stdout}${stderr}` });
    });
  });
}

/** Starts Arcue in the browser with `arcue serve --detach` and returns its pid. */
async function detach(options: { env?: NodeJS.ProcessEnv; script?: string; port?: number } = {}): Promise<number> {
  const script = options.script ?? join(scripts, "arcue.js");
  const port = String(options.port ?? PORT);
  const result = await arcueFrom(script, options.env ?? env, "serve", "--detach", "--port", port);
  const pid = Number(DETACHED.exec(result.out)?.[2]);
  if (result.code !== 0 || !(pid > 0)) throw new Error(`arcue serve --detach did not start Arcue: ${result.out}`);
  started.add(pid);
  return pid;
}

async function stop(): Promise<void> {
  expect(await arcue("stop")).toMatchObject({
    code: 0,
    out: expect.stringMatching(new RegExp(`^Stopped Arcue in the browser at ${ADDRESS} \\(process \\d+\\)\\.\\n$`)),
  });
}

function running(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Kills the process when it still runs from the tests' folder, and leaves a pid the system gave to another alone. */
function killStarted(pid: number): void {
  if (!running(pid)) return;
  let command = "";
  try {
    command =
      process.platform === "linux"
        ? readFileSync(`/proc/${pid}/cmdline`, "utf8")
        : execFileSync("ps", ["-o", "command=", "-p", String(pid)], { encoding: "utf8" });
  } catch {
    return;
  }
  if (command.includes(temp)) process.kill(pid, "SIGKILL");
}

/** A copy of the sample in the project, so each test's model shows in its own view. */
function copyModel(name: string): string {
  const path = join(project, name);
  copyFileSync(SAMPLE, path);
  return path;
}

/** The environment of an agent session and the address of its view's page. */
async function sessionView(name: string): Promise<{ env: NodeJS.ProcessEnv; address: string }> {
  const environment = { ...env, ARCUE_VIEW: name };
  const address = /This session's view: (\S+)/.exec((await arcueIn(environment, "status")).out)?.[1];
  if (!address) throw new Error(`arcue status names no view for ${name}.`);
  return { env: environment, address };
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

/** Waits until the page's client answers from a core, which only a page connected to a running core does. */
function connected(page: Page, timeout?: number): Promise<unknown> {
  return page.waitForFunction(
    () =>
      Promise.race([
        (window as unknown as PageProbe).arcueWindow.client.query("asset.list", {}).then(
          () => true,
          () => false,
        ),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 300)),
      ]),
    undefined,
    { timeout, polling: 100 },
  );
}

/** The frame the page last reported to the core for the model at `path`, which the core keeps for its asset. */
function reportedFrame(page: Page, path: string): Promise<number | null> {
  return page.evaluate(async (file) => {
    const { client } = (window as unknown as PageProbe).arcueWindow;
    const asset = (await client.query("asset.list", {})).assets.find((open) => open.path === file);
    return asset ? ((await client.query("viewState.get", { assetId: asset.assetId }))?.frame ?? null) : null;
  }, path);
}

/** The ids of the page's asset tabs, in order. */
function tabIds(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    (window as unknown as PageProbe).arcueWindow.store.state
      .get()
      .tabs.filter((tab) => tab.kind === "asset")
      .map((tab) => tab.id),
  );
}

/** The clip, frame and rounded camera of the tab that shows `path`, or null while its view is not ready. */
function shown(page: Page, path: string) {
  return page.evaluate((file) => {
    const { store } = (window as unknown as PageProbe).arcueWindow;
    for (const tab of store.state.get().tabs) {
      const session = store.session(tab.id);
      if (session?.state.get().summary.path !== file) continue;
      const view = session.state.get().viewportReady ? session.viewState() : null;
      if (!view) return null;
      const round = (values: readonly number[]) => values.map((value) => Math.round(value * 1000) / 1000);
      const { position, target, up, fov } = view.camera;
      return { clip: view.clip, frame: view.frame, camera: [round(position), round(target), round(up), fov] };
    }
    return null;
  }, path);
}

/** Routes the page's sockets to the core, or while held to a socket that never answers, so the page stays away. */
async function gateSockets(page: Page): Promise<{ hold(): void; release(): Promise<void> }> {
  let holding = false;
  const held: WebSocketRoute[] = [];
  await page.routeWebSocket(/\/core\//, (socket) => {
    if (holding) held.push(socket);
    else socket.connectToServer();
  });
  return {
    hold: () => {
      holding = true;
    },
    release: async () => {
      holding = false;
      for (const socket of held.splice(0)) await socket.close();
    },
  };
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  temp = realpathSync(mkdtempSync(join(tmpdir(), "arcue-plugin-e2e-")));
  scripts = join(temp, "plugin", "scripts");
  cpSync(BUILT, scripts, { recursive: true });
  project = join(temp, "project");
  mkdirSync(join(project, ".git"), { recursive: true });
  model = copyModel("stone-striker.fbx");
  data = join(temp, "data");
  env = { ...outsideSessions(process.env), ARCUE_USER_DATA: data };
  await detach();
});

test.afterEach(async () => {
  const info = test.info();
  if (info.status === info.expectedStatus) return;
  failed = true;
  for (const folder of readdirSync(temp).filter((name) => existsSync(join(temp, name, "logs")))) {
    cpSync(join(temp, folder, "logs"), info.outputPath(folder, "logs"), { recursive: true });
  }
});

test.afterAll(async () => {
  await arcue("stop");
  for (const pid of started) killStarted(pid);
  if (!failed) rmSync(temp, { recursive: true, force: true });
});

test("shows the model arcue open opens, at its clip and frame, and again after a reload", async ({ page }) => {
  await page.goto(ADDRESS);
  await expect(page.getByText("Ask your agent to show you a model")).toBeVisible();

  const opened = await arcue("open", model, "--clip", WALK, "--frame", "12");
  expect(opened).toMatchObject({ code: 0, out: expect.stringContaining("Opened") });
  await expect(page.getByRole("tab", { name: "stone-striker.fbx" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Frame 12 of 60" })).toBeVisible();
  expect((await arcue("status")).out).toContain(`Arcue is running in a browser at ${ADDRESS}`);

  await expect.poll(() => reportedFrame(page, model)).toBe(12);
  await page.reload();
  await expect(page.getByRole("img", { name: "Frame 12 of 60" })).toBeVisible();
});

test("saves a review round beside the model, as the desktop app does", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: ADDRESS });
  await page.goto(ADDRESS);
  await expect(page.getByRole("img", { name: "Frame 12 of 60" })).toBeVisible();

  await page.getByRole("button", { name: "Comment", exact: true }).click();
  const canvas = page.locator("canvas").first();
  const rect = await canvas.boundingBox();
  if (!rect) throw new Error("The 3D view has no box.");
  await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height * 0.48);
  const commentBox = page.getByRole("form", { name: "Comment 1" });
  await commentBox.getByRole("textbox", { name: "Comment text" }).fill("Round the shoulder plate.");
  await page.keyboard.press("Enter");
  await expect(commentBox).toBeHidden();
  await page.getByRole("button", { name: /Copy prompt/ }).click();
  await expect(page.getByText("Copied 1 comment as round 1")).toBeVisible();

  const prompt = await page.evaluate(() => navigator.clipboard.readText());
  expect(prompt).toContain('Clip "Walk", frame 12');
  const round = join(project, ".arcue", "reviews", "stone-striker.fbx", "rounds", "round-1");
  expect(prompt).toContain(round);
  const data = roundDataSchema.parse(JSON.parse(readFileSync(join(round, "round.json"), "utf8")));
  expect(data.comments.map((comment) => comment.text)).toEqual(["Round the shoulder plate."]);
  expect(readdirSync(round).filter((file) => file.endsWith(".png"))).toHaveLength(1);
});

test("leaves the models to the page that shows them when another page opens", async ({ page, context }) => {
  await page.goto(ADDRESS);
  await expect(page.getByRole("tab", { name: "stone-striker.fbx" })).toBeVisible();

  const other = await context.newPage();
  await other.goto(ADDRESS);
  await expect(other.getByText("Ask your agent to show you a model")).toBeVisible();
  await expect(page.getByRole("tab", { name: "stone-striker.fbx" })).toBeVisible();
  await other.close();
});

test("shows each agent session's models only in its own view's page", async ({ page, context }) => {
  const first = await sessionView("first session");
  const second = await sessionView("second session");
  expect(first.address).toMatch(new RegExp(`^${ADDRESS}/\\?view=[0-9a-f]{12}$`));
  expect(second.address).not.toBe(first.address);

  await page.goto(first.address);
  const other = await context.newPage();
  await other.goto(second.address);
  await expect(other.getByText("Ask your agent to show you a model")).toBeVisible();

  const copy = copyModel("stone-striker-copy.fbx");
  expect(await arcueIn(first.env, "open", copy, "--frame", "5")).toMatchObject({
    code: 0,
    out: expect.stringContaining("in this session's view as"),
  });
  await expect(page.getByRole("tab", { name: "stone-striker-copy.fbx" })).toBeVisible();
  await expect(other.getByRole("tab", { name: "stone-striker-copy.fbx" })).toBeHidden();

  expect(await arcueIn(second.env, "open", copy)).toMatchObject({
    code: 1,
    out: expect.stringContaining("Add --move"),
  });
  await other.reload();
  await expect(other.getByText("Ask your agent to show you a model")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("tab", { name: "stone-striker-copy.fbx" })).toBeVisible();
  await other.close();
});

test("refuses a second server while one runs, and a detach says where it runs", async () => {
  expect(await arcue("serve", "--port", String(OTHER_PORT))).toMatchObject({
    code: 1,
    out: expect.stringContaining(`Arcue is already running at ${ADDRESS}`),
  });
  const pid = [...started].at(-1);
  expect(await arcue("serve", "--detach")).toEqual({
    code: 0,
    out: `Arcue already runs in a browser at ${ADDRESS} (process ${pid}).\n`,
  });
});

test("comes back at its clip, frame and camera with its drafts after arcue stop, and after a reload while stopped", async ({
  page,
}) => {
  const copy = copyModel("reconnect.fbx");
  const session = await sessionView("reconnect");
  await page.goto(session.address);
  expect(await arcueIn(session.env, "open", copy, "--clip", WALK, "--frame", "20")).toMatchObject({ code: 0 });
  await expect(page.getByRole("img", { name: "Frame 20 of 60" })).toBeVisible();
  const field = page.getByLabel("Comment without a pin").filter({ visible: true });
  await field.fill(DRAFT);
  await field.press("Enter");
  const drafts = page.getByRole("list", { name: "Drafts" }).filter({ visible: true });
  await expect(drafts).toContainText(DRAFT);
  await expect.poll(() => shown(page, copy)).not.toBeNull();
  const before = await shown(page, copy);

  await stop();
  await expect(page.getByText(PAGE_STOPPED)).toBeVisible();
  const launch: LaunchInfo = {
    version: 1,
    command: process.execPath,
    args: ["-e", `require("node:fs").writeFileSync(${JSON.stringify(join(data, "launched"))}, "")`],
  };
  writeFileSync(join(data, LAUNCH_INFO_FILE), JSON.stringify(launch));
  try {
    expect(await arcueIn(session.env, "open", copy)).toEqual({ code: 1, out: BROWSER_STOPPED });
    await page.waitForTimeout(2000);
    expect(existsSync(join(data, "launched"))).toBe(false);
    expect(existsSync(join(data, BRIDGE_INFO_FILE))).toBe(false);
  } finally {
    rmSync(join(data, LAUNCH_INFO_FILE), { force: true });
  }

  await detach();
  await connected(page);
  await expect(page.getByRole("img", { name: "Frame 20 of 60" })).toBeVisible();
  await expect.poll(() => shown(page, copy)).toEqual(before);
  await expect(drafts).toContainText(DRAFT);

  await stop();
  await page.reload().catch(() => undefined);
  await detach();
  await page.goto(session.address);
  await expect(page.getByRole("tab", { name: "reconnect.fbx" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Frame 20 of 60" })).toBeVisible();
  await expect.poll(() => shown(page, copy)).toEqual(before);
  await expect(drafts).toContainText(DRAFT);
});

test("shows a model opened while its page was away at the clip and frame the agent named", async ({ page }) => {
  const copy = copyModel("outage.fbx");
  const session = await sessionView("outage");
  const sockets = await gateSockets(page);
  await page.goto(session.address);
  await expect(page.getByText("Ask your agent to show you a model")).toBeVisible();

  sockets.hold();
  await stop();
  await expect(page.getByText(PAGE_STOPPED)).toBeVisible();
  await detach();
  expect(await arcueIn(session.env, "open", copy, "--clip", WALK, "--frame", "30")).toMatchObject({
    code: 0,
    out: expect.stringContaining(`Arcue holds ${copy} as`),
  });
  await sockets.release();

  await expect(page.getByRole("tab", { name: "outage.fbx" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Frame 30 of 60" })).toBeVisible();
});

test("brings its tabs back with the same ids after its socket drops", async ({ page }) => {
  const sockets: WebSocketRoute[] = [];
  await page.routeWebSocket(/\/core\//, (socket) => {
    sockets.push(socket, socket.connectToServer());
  });
  const copy = copyModel("dropped.fbx");
  const session = await sessionView("dropped");
  await page.goto(session.address);
  expect(await arcueIn(session.env, "open", copy, "--clip", WALK, "--frame", "8")).toMatchObject({ code: 0 });
  await expect(page.getByRole("img", { name: "Frame 8 of 60" })).toBeVisible();
  const before = await tabIds(page);
  await expect.poll(() => reportedFrame(page, copy)).toBe(8);

  for (const socket of sockets.splice(0)) await socket.close();

  await expect.poll(() => sockets.length).toBe(2);
  await connected(page);
  await expect.poll(() => tabIds(page)).toEqual(before);
  await expect(page.getByRole("img", { name: "Frame 8 of 60" })).toBeVisible();
  await expect(page.getByText(PAGE_STOPPED)).toBeHidden();
});

test("reloads once into another build of its page and reopens its tabs at their frame", async ({ page }) => {
  const copy = copyModel("rebuilt.fbx");
  const session = await sessionView("rebuilt");
  await page.goto(session.address);
  expect(await arcueIn(session.env, "open", copy, "--clip", WALK, "--frame", "40")).toMatchObject({ code: 0 });
  await expect(page.getByRole("img", { name: "Frame 40 of 60" })).toBeVisible();
  let loads = 0;
  page.on("load", () => loads++);

  await stop();
  const assets = join(scripts, "web", "assets");
  const [script] = readdirSync(assets).filter((name) => /^index-.*\.js$/.test(name));
  if (!script) throw new Error("The built page has no script.");
  const rebuilt = `index-${Date.now().toString(36)}.js`;
  renameSync(join(assets, script), join(assets, rebuilt));
  const index = join(scripts, "web", "index.html");
  writeFileSync(index, readFileSync(index, "utf8").replace(`/assets/${script}`, `/assets/${rebuilt}`));
  await detach();

  await expect.poll(() => loads).toBe(1);
  await expect(page.getByRole("tab", { name: "rebuilt.fbx" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Frame 40 of 60" })).toBeVisible();
  expect(await page.evaluate(() => document.querySelector('script[type="module"][src]')?.getAttribute("src"))).toBe(
    `/assets/${rebuilt}`,
  );
  await page.waitForTimeout(2000);
  expect(loads).toBe(1);
});

test("connects again at once when the browser wakes the frozen page", async ({ page, context }) => {
  const copy = copyModel("frozen.fbx");
  const session = await sessionView("frozen");
  await page.goto(session.address);
  await connected(page);
  const devtools = await context.newCDPSession(page);
  await devtools.send("Page.setWebLifecycleState", { state: "frozen" });

  await stop();
  await detach();
  expect(await arcueIn(session.env, "open", copy)).toMatchObject({
    code: 0,
    out: expect.stringContaining(`Arcue holds ${copy} as`),
  });
  await devtools.send("Page.setWebLifecycleState", { state: "active" });

  await connected(page, 2000);
  await expect(page.getByRole("tab", { name: "frozen.fbx" })).toBeVisible();
});

test("stops by itself once no page was open for the idle time", async ({ context }) => {
  const idleData = join(temp, "idle-data");
  const idleEnv = { ...env, ARCUE_USER_DATA: idleData };
  const serving: ChildProcess = spawn(
    process.execPath,
    [join(scripts, "arcue.js"), "serve", "--port", String(IDLE_PORT), "--idle-stop-ms", "3000"],
    { env: idleEnv, stdio: ["ignore", "pipe", "pipe"] },
  );
  let output = "";
  serving.stdout?.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });
  serving.stderr?.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });
  const exited = new Promise<number | null>((resolve) => serving.once("exit", (code) => resolve(code)));
  try {
    await expect.poll(() => output).toContain("Arcue runs at");
    const page = await context.newPage();
    await page.goto(`http://localhost:${IDLE_PORT}`);
    await connected(page);
    await page.waitForTimeout(4500);
    expect(serving.exitCode).toBeNull();

    await page.close();

    expect(await exited).toBe(0);
    expect(output).toContain("Arcue stops: no page was open for 0.05 minutes.\n");
    expect(readJson(join(idleData, LAST_CORE_FILE))).toEqual({
      version: 1,
      kind: "serve",
      serveUrl: `http://localhost:${IDLE_PORT}`,
    });
    expect(await arcueIn({ ...idleEnv, ARCUE_VIEW: "idle" }, "open", model)).toEqual({
      code: 1,
      out: BROWSER_STOPPED,
    });
  } finally {
    if (serving.exitCode === null) serving.kill("SIGKILL");
  }
});

test("stops by itself when its plugin folder is removed", async () => {
  const second = join(temp, "second", "scripts");
  cpSync(BUILT, second, { recursive: true });
  const otherEnv = { ...env, ARCUE_USER_DATA: join(temp, "other-data") };
  const pid = await detach({ env: otherEnv, script: join(second, "arcue.js"), port: OTHER_PORT });

  rmSync(join(temp, "second"), { recursive: true, force: true });

  await expect.poll(() => running(pid), { timeout: 10_000 }).toBe(false);
  expect(readJson(join(temp, "other-data", LAST_CORE_FILE))).toMatchObject({ kind: "serve" });
});
