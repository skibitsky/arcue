import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { readFile, rename, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { blockingCore } from "@arcue/platform-node";
import type { LaunchInfo } from "@arcue/protocol";
import { LAUNCH_INFO_FILE } from "@arcue/protocol";
import type { MenuItemConstructorOptions } from "electron";
import { app, dialog, powerMonitor, protocol, session, shell } from "electron";
import type { Log } from "../shared/log";
import { fileLog } from "../shared/log";
import type { QuitNotice, RunningCore } from "./already-running";
import { alreadyRunningLogLine, alreadyRunningNotice } from "./already-running";
import { checkFromMenu, createUpdater, offerDownload, startServe } from "./app-updates";
import { assetPathsFromArgv, launchDataSchema } from "./args";
import { CoreHost } from "./core-host";
import { installMenu } from "./menu";
import { QuitSequence } from "./quit";
import {
  contentSecurityPolicy,
  isAllowedRequest,
  isAppUrl,
  RENDERER_ORIGIN,
  RENDERER_SCHEME,
  rendererFile,
} from "./security";
import { loadSession, SESSION_FILE, saveSession } from "./session";
import type { Updater } from "./updater";
import { WindowManager } from "./windows";

const here = dirname(fileURLToPath(import.meta.url));

const userDataOverride = process.env.ARCUE_USER_DATA;
if (userDataOverride) app.setPath("userData", resolve(userDataOverride));

protocol.registerSchemesAsPrivileged([
  { scheme: RENDERER_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

const devServer = app.isPackaged ? null : (process.env.ARCUE_RENDERER_URL ?? null);
const initialPaths = assetPathsFromArgv(process.argv, process.cwd(), process.defaultApp === true);

if (app.requestSingleInstanceLock({ paths: initialPaths })) {
  void run();
} else {
  app.quit();
}

async function run(): Promise<void> {
  const pendingOpens: string[] = [...initialPaths];
  let windows: WindowManager | null = null;

  app.on("open-file", (event, path) => {
    event.preventDefault();
    if (windows) windows.openPaths([path]);
    else pendingOpens.push(path);
  });

  app.on("second-instance", (_event, argv, workingDirectory, data) => {
    const forwarded = launchDataSchema.safeParse(data);
    const paths = forwarded.success
      ? forwarded.data.paths
      : assetPathsFromArgv(argv, workingDirectory, process.defaultApp === true);
    if (!windows) pendingOpens.push(...paths);
    else if (paths.length > 0) windows.openPaths(paths);
    else windows.reveal();
  });

  await app.whenReady();
  const icon = join(here, "icons", process.platform === "win32" ? "arcue.ico" : "arcue.png");
  if (!app.isPackaged) app.dock?.setIcon(icon);
  const userData = app.getPath("userData");
  const logs = join(userData, "logs");
  mkdirSync(logs, { recursive: true });
  const log = fileLog(join(logs, "main.log"));
  log.info(`Arcue starts (pid ${process.pid}, ${app.isPackaged ? "packaged" : "unpackaged"})`);
  process.on("uncaughtException", (error) => log.error("Uncaught exception in the main process", error));
  process.on("unhandledRejection", (error) => log.error("Unhandled rejection in the main process", error));

  const blocking = await blockingCore(userData, "desktop");
  if (blocking) {
    await quitBeside({ ...blocking, older: blocking.info.kind === undefined }, log);
    return;
  }

  harden(devServer);
  const rendererRoot = join(here, "renderer");
  protocol.handle(RENDERER_SCHEME, (request) => serveRenderer(rendererRoot, request.url));
  await writeLaunchInfo(userData).catch((error: unknown) => log.error("Could not write launch.json", error));

  const sessionPath = join(userData, SESSION_FILE);
  let saveTimer: NodeJS.Timeout | null = null;
  const saveNow = async () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = null;
    if (windows)
      await saveSession(sessionPath, windows.session()).catch((error: unknown) =>
        log.error("Could not save the session", error),
      );
  };

  const updater = createUpdater({ userData, logs, log });
  const restartToUpdate = () => {
    if (updater.requestRestart()) app.quit();
  };

  const core = new CoreHost({
    entry: join(here, "core.js"),
    userData,
    logFile: join(logs, "core.log"),
    log,
    onNeedWindow: () => windows?.ensureWindow(),
    onLost: () => windows?.coreLost(),
    onAlreadyRunning: (other) => void quitBeside(other, log),
    onFailed: (reason) => void quitWithoutCore(reason, logs, log),
  });
  const manager = new WindowManager({
    core,
    log,
    preload: join(here, "preload.cjs"),
    icon,
    rendererUrl: devServer ?? `${RENDERER_ORIGIN}/index.html`,
    devServer,
    onSessionChange: () => {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => void saveNow(), 500);
    },
    updateState: () => updater.state,
    onUpdateAction: (action) => {
      const phase = updater.phase;
      if (action === "restart") restartToUpdate();
      else if (phase.kind === "manual") void offerDownload(phase.manifest, phase.reason);
    },
  });
  const showUpdates = () => installMenu(manager, updateMenuItem(updater, restartToUpdate));
  updater.onChange(() => {
    manager.sendUpdateState(updater.state);
    showUpdates();
  });
  showUpdates();
  core.start();
  manager.restore(await loadSession(sessionPath));
  windows = manager;
  manager.openPaths(pendingOpens.splice(0));
  void updater.start().then(({ notice, servePort }) => {
    if (notice) manager.notify(notice);
    if (servePort !== null) startServe(servePort, { log });
  });
  powerMonitor.on("resume", () => updater.checkIfDue());

  app.on("activate", () => {
    if (manager.count === 0) manager.create();
  });
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
  const quit = new QuitSequence({
    steps: async () => {
      updater.stopChecks();
      await manager.prepareQuit();
      await saveNow();
      await core.stop();
      if (updater.installsOnQuit) manager.hideAll();
      await updater.finishQuit();
      log.info("Arcue quits");
    },
    quit: () => app.quit(),
    onError: (error) => log.error("Could not close everything before quitting", error),
  });
  app.on("before-quit", (event) => quit.beforeQuit(event));
  app.on("will-quit", (event) => quit.willQuit(event));
}

/** The update item of the menu, which says what the updater does, or null when the app does not update. */
function updateMenuItem(updater: Updater, restart: () => void): MenuItemConstructorOptions | null {
  if (!updater.enabled) return null;
  const phase = updater.phase;
  switch (phase.kind) {
    case "checking":
      return { label: "Checking for Updates…", enabled: false };
    case "downloading":
      return { label: "Downloading Update…", enabled: false };
    case "installing":
      return { label: "Installing Update…", enabled: false };
    case "ready":
      return { label: `Restart to Update to ${phase.manifest.version}`, click: restart };
    case "manual":
      return {
        label: `Download Arcue ${phase.manifest.version}…`,
        click: () => void offerDownload(phase.manifest, phase.reason),
      };
    case "idle":
      return { label: "Check for Updates…", click: () => void checkFromMenu(updater, restart) };
  }
}

/**
 * Says which Arcue keeps this one from starting, offers to open the address of an older arcue serve, and quits. Arcue
 * in the browser of this build runs beside the app and never gets here.
 */
async function quitBeside(running: RunningCore, log: Log): Promise<void> {
  log.info(alreadyRunningLogLine(running));
  await quitSaying(alreadyRunningNotice(running), "info", log);
}

/** Says that the core could not start and where its log is, and quits. */
async function quitWithoutCore(reason: string, logs: string, log: Log): Promise<void> {
  const notice: QuitNotice = {
    message: "Arcue could not start",
    detail: `${reason}\n\nThe details are in core.log in ${logs}.`,
    buttons: ["Quit"],
    open: null,
  };
  await quitSaying(notice, "error", log);
}

/** Shows the notice, opens the address of its first button when the person chooses it, and quits. */
async function quitSaying(notice: QuitNotice, type: "info" | "error", log: Log): Promise<void> {
  try {
    const { response } = await dialog.showMessageBox({
      type,
      title: "Arcue",
      message: notice.message,
      detail: notice.detail,
      buttons: notice.buttons,
      defaultId: 0,
      cancelId: notice.buttons.length - 1,
      noLink: true,
    });
    if (notice.open && response === 0) await shell.openExternal(notice.open);
  } catch (error) {
    log.error("Could not say why Arcue quits", error);
  } finally {
    app.quit();
  }
}

/** No remote content, no new windows, no navigation away from the app, and only the clipboard permission. */
function harden(devServer: string | null): void {
  const policy = contentSecurityPolicy(devServer);
  const defaultSession = session.defaultSession;
  defaultSession.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: !isAllowedRequest(details.url, devServer) });
  });
  defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const headers = { ...details.responseHeaders, "Content-Security-Policy": [policy] };
    callback({ responseHeaders: headers });
  });
  defaultSession.setPermissionRequestHandler((_contents, permission, callback) => {
    callback(permission === "clipboard-sanitized-write");
  });
  defaultSession.setPermissionCheckHandler((_contents, permission) => permission === "clipboard-sanitized-write");
  app.on("web-contents-created", (_event, contents) => {
    contents.setWindowOpenHandler(() => ({ action: "deny" }));
    contents.on("will-navigate", (event, url) => {
      if (!isAppUrl(url, devServer)) event.preventDefault();
    });
    contents.on("will-redirect", (event, url) => {
      if (!isAppUrl(url, devServer)) event.preventDefault();
    });
    contents.on("will-attach-webview", (event) => event.preventDefault());
  });
}

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".wasm": "application/wasm",
};

async function serveRenderer(root: string, url: string): Promise<Response> {
  const file = rendererFile(root, url);
  const contentType = file ? CONTENT_TYPES[extname(file).toLowerCase()] : undefined;
  if (!file || !contentType) return new Response("Not found", { status: 404 });
  try {
    return new Response(await readFile(file), {
      headers: { "Content-Type": contentType, "Content-Security-Policy": contentSecurityPolicy(null) },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

/** Tells the command line how to start the app when it is not running. */
async function writeLaunchInfo(userData: string): Promise<void> {
  const info: LaunchInfo = {
    version: 1,
    command: process.execPath,
    args: app.isPackaged ? [] : [app.getAppPath()],
  };
  const path = join(userData, LAUNCH_INFO_FILE);
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(info)}\n`, { mode: 0o600 });
  await rename(temporary, path);
}
