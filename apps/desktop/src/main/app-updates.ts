import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { isRunning, readBridgeInfo } from "@arcue/platform-node";
import { app, dialog, session, shell } from "electron";
import type { Platform } from "../../packaging/layout";
import { parseArch, parsePlatform } from "../../packaging/layout";
import type { UpdateManifest } from "../../packaging/updates";
import type { Log } from "../shared/log";
import { updateFeed, updateKeys } from "./update-feed";
import type { InstallMethod, Staged } from "./update-install";
import {
  debianArguments,
  installMethod,
  pkexecFailure,
  relaunchArguments,
  removeLeftovers,
  run,
  runAfterExit,
  setupArguments,
  stage,
  startDetached,
  swapInPlace,
  systemContext,
} from "./update-install";
import type { CheckResult, Installed } from "./updater";
import { Updater } from "./updater";

const STOP_SERVE_TIMEOUT_MS = 40_000;

export interface AppUpdatesOptions {
  userData: string;
  logs: string;
  log: Log;
}

/** The app's updater on this computer: Electron's network for the feed, and the system's tools to install. */
export function createUpdater({ userData, logs, log }: AppUpdatesOptions): Updater {
  const platform = parsePlatform(process.platform);
  const packaged = app.isPackaged;
  const keys = updateKeys(process.env, packaged);
  const network = session.fromPartition("arcue-updates");
  const context = systemContext(platform, process.execPath, packaged);
  let method: Promise<InstallMethod> | null = null;
  const updater = new Updater({
    version: app.getVersion(),
    platform,
    arch: parseArch(process.arch),
    feedUrl: updateFeed(process.env, packaged, keys),
    keys,
    folder: join(userData, "updates"),
    fetch: (url, init) => network.fetch(url, init),
    method: () => {
      method ??= installMethod(context).then(async (found) => {
        if (found.kind === "bundle" || found.kind === "folder") await removeLeftovers(found.target);
        return found;
      });
      return method;
    },
    stage: (found, file, folder, version) => stage(found, file, folder, version),
    install: (found, staged, relaunch) => install(found, staged, relaunch, { userData, logs, log, platform }),
    setTimer: (delayMs, callback) => {
      const timer = setTimeout(callback, delayMs);
      return () => clearTimeout(timer);
    },
    now: () => Date.now(),
    log,
  });
  return updater;
}

interface InstallContext extends AppUpdatesOptions {
  platform: Platform;
}

/**
 * Installs a staged update as the app quits. An arcue serve that runs this installation's command line stops first, as
 * its files change, and starts again on its port afterwards, so its pages reconnect. With `relaunch` the new app, or
 * the old one when the install failed, starts once this one exits.
 */
async function install(
  method: InstallMethod,
  staged: Staged,
  relaunch: boolean,
  context: InstallContext,
): Promise<Installed> {
  const { log, logs, platform } = context;
  const servePort = await stopServe(context).catch((error: unknown) => {
    log.error("Could not stop arcue serve for the update", error);
    return null;
  });
  if (method.kind === "setup") {
    startDetached(staged.path, setupArguments(join(logs, "update-setup.log"), relaunch), process.env);
    return { servePort };
  }
  try {
    switch (method.kind) {
      case "bundle":
      case "folder": {
        const old = await swapInPlace(method.target, staged.path, platform);
        runAfterExit("rm", ["-rf", old], process.env);
        break;
      }
      case "deb":
        await run("pkexec", debianArguments(method.command, staged.path)).catch((error: unknown) => {
          throw new Error(pkexecFailure(error));
        });
        break;
      case "restart":
        break;
      case "manual":
        throw new Error(method.reason);
    }
  } finally {
    if (servePort !== null) startServe(servePort, context);
    if (relaunch) runAfterExit(process.execPath, relaunchArguments(process.argv, app.isPackaged), process.env);
  }
  return { servePort: null };
}

const cliScript = () => join(process.resourcesPath, "cli", "arcue.js");

/** Runs this installation's command line on the app's own Node. */
function runCommandLine(args: readonly string[], timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      [cliScript(), ...args],
      { env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }, timeout: timeoutMs, windowsHide: true },
      (error) => (error ? reject(error) : resolve()),
    );
  });
}

/** Stops the arcue serve that runs this installation's arcue.js, and returns its port, or null when none does. */
async function stopServe({ userData, log }: InstallContext): Promise<number | null> {
  if (!app.isPackaged) return null;
  const info = await readBridgeInfo(userData, "serve");
  if (!info?.url || !info.build || !isRunning(info.pid)) return null;
  const ours = createHash("sha256")
    .update(await readFile(cliScript()))
    .digest("hex")
    .slice(0, 16);
  if (info.build !== ours) return null;
  const port = Number(new URL(info.url).port);
  if (!Number.isInteger(port) || port < 1) return null;
  log.info(`Stopping arcue serve on port ${port} for the update`);
  await runCommandLine(["stop"], STOP_SERVE_TIMEOUT_MS);
  return port;
}

/** Starts arcue serve in the background again on its port, from the installation as it is now. */
export function startServe(port: number, { log }: Pick<AppUpdatesOptions, "log">): void {
  log.info(`Starting arcue serve on port ${port} again after the update`);
  try {
    startDetached(process.execPath, [cliScript(), "serve", "--detach", "--port", String(port)], {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
    });
  } catch (error) {
    log.error("Could not start arcue serve again", error);
  }
}

/** Says why this app cannot install an update itself, and offers its release page to download it from. */
export async function offerDownload(manifest: UpdateManifest, reason: string): Promise<void> {
  const { response } = await dialog.showMessageBox({
    title: "Arcue",
    noLink: true,
    message: `Arcue ${manifest.version} is available`,
    detail: `${manifest.summary}\n\n${reason}`.trim(),
    buttons: ["Open release page", "Later"],
    defaultId: 0,
    cancelId: 1,
  });
  if (response === 0) await shell.openExternal(manifest.page);
}

/**
 * Help > Check for Updates. Says the app is up to date, why it could not check, or what it found: an update it
 * downloads, one to restart into now, or one to download from the release page.
 */
export async function checkFromMenu(updater: Updater, restart: () => void): Promise<void> {
  const version = app.getVersion();
  let stopWatching = () => {};
  const downloading = new Promise<{ kind: "downloading" }>((resolve) => {
    const seen = () => {
      if (updater.phase.kind === "downloading") resolve({ kind: "downloading" });
    };
    stopWatching = updater.onChange(seen);
    seen();
  });
  const result: CheckResult | { kind: "downloading" } = await Promise.race([updater.check(), downloading]);
  stopWatching();
  const show = (options: Electron.MessageBoxOptions) =>
    dialog.showMessageBox({ title: "Arcue", noLink: true, ...options });
  switch (result.kind) {
    case "off":
      await show({ message: "Arcue does not update itself", detail: "This build does not check for updates." });
      return;
    case "current":
    case "unavailable":
      await show({ message: "Arcue is up to date", detail: `Version ${version} is the latest.` });
      return;
    case "failed":
      await show({ type: "warning", message: "Arcue could not check for updates", detail: result.message });
      return;
    case "found":
    case "downloading":
      break;
  }
  const phase = updater.phase;
  if (phase.kind === "ready") {
    const { response } = await show({
      message: `Arcue ${phase.manifest.version} is ready`,
      detail:
        `${phase.manifest.summary}\n\nArcue restarts and opens your windows, tabs and comments as they are.`.trim(),
      buttons: ["Restart now", "Later"],
      defaultId: 0,
      cancelId: 1,
    });
    if (response === 0) restart();
    return;
  }
  if (phase.kind === "manual") {
    await offerDownload(phase.manifest, phase.reason);
    return;
  }
  if (phase.kind === "downloading") {
    await show({
      message: `Arcue ${phase.version} is downloading`,
      detail: "When it is ready, Restart to update appears at the top of the window.",
    });
  }
}
