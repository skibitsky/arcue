import { execFile, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { access, mkdir, mkdtemp, readdir, readFile, rename, rm } from "node:fs/promises";
import { basename, delimiter, dirname, join, posix, win32 } from "node:path";
import { promisify } from "node:util";
import type { Installer, Platform } from "../../packaging/layout";
import { PRODUCT, parseVersion } from "../../packaging/layout";

const execFileAsync = promisify(execFile);

/** Runs a program without a shell and resolves with what it printed; rejects when it fails. */
export type Run = (command: string, args: readonly string[]) => Promise<{ stdout: string; stderr: string }>;

export const run: Run = (command, args) => execFileAsync(command, [...args], { maxBuffer: 16 * 1024 * 1024 });

/** Where the Debian package installs the app. */
export const DEB_FOLDER = `/usr/lib/${PRODUCT.packageName}`;

/**
 * How this app updates. A macOS bundle or a folder from the Linux tarball is replaced in place, the Windows app runs
 * its new setup program, and the Debian package is installed as an administrator. `restart` installs nothing: an
 * unpackaged app that a test points at a feed only restarts. Otherwise the person downloads the update themselves.
 */
export type InstallMethod =
  | { kind: "bundle"; target: string }
  | { kind: "folder"; target: string }
  | { kind: "setup" }
  | { kind: "deb"; command: "apt-get" | "dpkg" }
  | { kind: "restart" }
  | { kind: "manual"; reason: string };

/** The release file each way of updating installs from. */
export function installerKind(method: InstallMethod, platform: Platform): Installer["kind"] | null {
  switch (method.kind) {
    case "bundle":
      return "dmg";
    case "folder":
      return "tar";
    case "setup":
      return "setup";
    case "deb":
      return "deb";
    case "restart":
      return platform === "darwin" ? "dmg" : platform === "win32" ? "setup" : "tar";
    case "manual":
      return null;
  }
}

export interface MethodContext {
  platform: Platform;
  execPath: string;
  packaged: boolean;
  writable(path: string): Promise<boolean>;
  exists(path: string): Promise<boolean>;
  /** The program's path on PATH, or null. */
  which(program: string): Promise<string | null>;
}

const CANNOT_REPLACE = (folder: string) =>
  `Arcue cannot replace itself in ${folder}. Download the update and install it as you installed Arcue.`;

/** How the app at `execPath` updates, with the path rules of its own platform. */
export async function installMethod(context: MethodContext): Promise<InstallMethod> {
  if (!context.packaged) return { kind: "restart" };
  const { platform, execPath } = context;
  const { dirname, join } = platform === "win32" ? win32 : posix;
  if (platform === "darwin") {
    const bundle = posix.resolve(dirname(execPath), "..", "..");
    if (bundle.includes("/AppTranslocation/")) {
      return { kind: "manual", reason: "Move Arcue to the Applications folder and open it from there to update it." };
    }
    const writable = (await context.writable(bundle)) && (await context.writable(dirname(bundle)));
    if (writable) return { kind: "bundle", target: bundle };
    if (bundle.startsWith("/Volumes/")) {
      return { kind: "manual", reason: "Open Arcue from the Applications folder, not its disk image, to update it." };
    }
    return { kind: "manual", reason: CANNOT_REPLACE(dirname(bundle)) };
  }
  const folder = dirname(execPath);
  if (platform === "win32") {
    if (await context.exists(join(folder, "unins000.exe"))) return { kind: "setup" };
    return { kind: "manual", reason: "Arcue was not installed with its setup program, so it cannot update itself." };
  }
  if (folder === DEB_FOLDER) {
    if (await context.which("pkexec")) {
      if (await context.which("apt-get")) return { kind: "deb", command: "apt-get" };
      if (await context.which("dpkg")) return { kind: "deb", command: "dpkg" };
    }
    return { kind: "manual", reason: "Install the new package as you installed Arcue." };
  }
  if ((await context.writable(folder)) && (await context.writable(dirname(folder)))) {
    return { kind: "folder", target: folder };
  }
  return { kind: "manual", reason: CANNOT_REPLACE(dirname(folder)) };
}

/** The context of the running app. */
export function systemContext(platform: Platform, execPath: string, packaged: boolean): MethodContext {
  const can = (mode: number) => (path: string) =>
    access(path, mode).then(
      () => true,
      () => false,
    );
  return {
    platform,
    execPath,
    packaged,
    writable: can(constants.W_OK),
    exists: can(constants.F_OK),
    which: async (program) => {
      for (const folder of (process.env.PATH ?? "").split(delimiter).filter(Boolean)) {
        const path = join(folder, program);
        if (await can(constants.X_OK)(path)) return path;
      }
      return null;
    },
  };
}

/** What a staged update holds: the app to move into place, or the installer to run. */
export interface Staged {
  path: string;
}

/**
 * Prepares a downloaded update so that installing it at quit takes only a moment, and checks that it is Arcue of the
 * expected version, signed as the running app is.
 */
export async function stage(
  method: InstallMethod,
  file: string,
  folder: string,
  version: string,
  runner: Run = run,
): Promise<Staged> {
  switch (method.kind) {
    case "bundle":
      return { path: await stageBundle(method.target, file, folder, version, runner) };
    case "folder":
      return { path: await stageFolder(file, folder, version, runner) };
    case "deb":
      await checkDebian(file, version, runner);
      return { path: file };
    case "setup":
    case "restart":
      return { path: file };
    case "manual":
      throw new Error(method.reason);
  }
}

async function stageBundle(running: string, dmg: string, folder: string, version: string, runner: Run) {
  const staged = join(folder, `${PRODUCT.name}.app`);
  await rm(staged, { recursive: true, force: true });
  const mount = await mkdtemp(join(folder, "mount-"));
  try {
    await runner("hdiutil", [
      "attach",
      dmg,
      "-nobrowse",
      "-readonly",
      "-noautoopen",
      "-noverify",
      "-mountpoint",
      mount,
    ]);
    try {
      await runner("ditto", [join(mount, `${PRODUCT.name}.app`), staged]);
    } finally {
      await runner("hdiutil", ["detach", mount, "-force"]).catch(() => undefined);
    }
  } finally {
    await rm(mount, { recursive: true, force: true }).catch(() => undefined);
  }
  const plist = join(staged, "Contents", "Info.plist");
  const field = async (key: string) =>
    (await runner("plutil", ["-extract", key, "raw", "-o", "-", plist])).stdout.trim();
  if ((await field("CFBundleIdentifier")) !== PRODUCT.bundleId) throw new Error("The update is not Arcue.");
  const found = await field("CFBundleShortVersionString");
  if (found !== version) throw new Error(`The update holds Arcue ${found}, not ${version}.`);
  await runner("codesign", ["--verify", "--deep", "--strict", staged]).catch((error: unknown) => {
    throw new Error(`The update's signature does not verify: ${messageOf(error)}`);
  });
  const team = await teamOf(running, runner);
  if (team !== null && (await teamOf(staged, runner)) !== team) {
    throw new Error("The update is not signed by the developer who signed this Arcue.");
  }
  await runner("xattr", ["-dr", "com.apple.quarantine", staged]).catch(() => undefined);
  return staged;
}

/** The Team ID of a signed app, or null for one signed ad hoc. */
export async function teamOf(bundle: string, runner: Run): Promise<string | null> {
  const { stdout, stderr } = await runner("codesign", ["-dv", "--verbose=2", bundle]);
  const team = /^TeamIdentifier=(.+)$/m.exec(`${stdout}\n${stderr}`)?.[1]?.trim();
  return team && team !== "not set" ? team : null;
}

async function stageFolder(tarball: string, folder: string, version: string, runner: Run) {
  const extract = join(folder, "extract");
  await rm(extract, { recursive: true, force: true });
  await mkdir(extract, { recursive: true });
  await runner("tar", ["-xzf", tarball, "-C", extract]);
  const entries = await readdir(extract);
  const [top] = entries;
  if (entries.length !== 1 || !top) throw new Error("The update's tarball does not hold one folder.");
  const staged = join(extract, top);
  const app: { version?: unknown } = JSON.parse(
    await readFile(join(staged, "resources", "app", "package.json"), "utf8").catch(() => "{}"),
  );
  if (app.version !== version) throw new Error(`The update holds Arcue ${String(app.version)}, not ${version}.`);
  await access(join(staged, PRODUCT.name), constants.X_OK).catch(() => {
    throw new Error("The update's tarball has no Arcue program.");
  });
  return staged;
}

async function checkDebian(deb: string, version: string, runner: Run): Promise<void> {
  const { stdout } = await runner("dpkg-deb", ["--field", deb, "Package", "Version"]);
  const fields = Object.fromEntries(
    stdout
      .split("\n")
      .map((line) => /^(\w+):\s*(.*)$/.exec(line.trim()))
      .flatMap((match) => (match?.[1] && match[2] !== undefined ? [[match[1], match[2]] as const] : [])),
  );
  if (fields.Package !== PRODUCT.packageName) throw new Error("The update is not Arcue's package.");
  if (fields.Version !== parseVersion(version).debian) throw new Error(`The update's package is not Arcue ${version}.`);
}

/** The names a swap leaves beside the app, which the next launch removes. */
export const SWAP_LEFTOVER = /^\.(.+)\.(old|new)-[0-9a-f]{12}$/;

/**
 * Puts the staged app where `target` is, keeping the old one until the new one is in place: the old one moves aside,
 * the new one moves in, and if that fails the old one moves back. Returns the old app's new path, to remove once the
 * app has quit. A staged app on another volume is copied next to the target first.
 */
export async function swapInPlace(target: string, staged: string, platform: Platform, runner: Run = run) {
  const parent = dirname(target);
  const tag = () => randomBytes(6).toString("hex");
  const incoming = join(parent, `.${basename(target)}.new-${tag()}`);
  const old = join(parent, `.${basename(target)}.old-${tag()}`);
  try {
    await rename(staged, incoming);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EXDEV") throw error;
    await runner(
      platform === "darwin" ? "ditto" : "cp",
      platform === "darwin" ? [staged, incoming] : ["-a", staged, incoming],
    );
  }
  try {
    await rename(target, old);
  } catch (error) {
    await rm(incoming, { recursive: true, force: true });
    throw error;
  }
  try {
    await rename(incoming, target);
  } catch (error) {
    await rename(old, target);
    await rm(incoming, { recursive: true, force: true });
    throw error;
  }
  return old;
}

/** Removes what earlier swaps left beside the app. */
export async function removeLeftovers(target: string): Promise<void> {
  const parent = dirname(target);
  const name = basename(target);
  const entries = await readdir(parent).catch(() => []);
  for (const entry of entries) {
    const match = SWAP_LEFTOVER.exec(entry);
    if (match?.[1] === name) await rm(join(parent, entry), { recursive: true, force: true }).catch(() => undefined);
  }
}

/** The arguments of the setup program for an update; `relaunch` has it start Arcue again when it ends. */
export function setupArguments(log: string, relaunch: boolean): string[] {
  return ["/VERYSILENT", "/SUPPRESSMSGBOXES", "/NORESTART", `/LOG=${log}`, ...(relaunch ? ["/RELAUNCH"] : [])];
}

/** The pkexec command line that installs a Debian package as an administrator. */
export function debianArguments(command: "apt-get" | "dpkg", deb: string): string[] {
  return command === "apt-get" ? ["apt-get", "install", "--yes", "--", deb] : ["dpkg", "--install", "--", deb];
}

/** What pkexec's exit code says about a password prompt the person closed. */
export function pkexecFailure(error: unknown): string {
  const code = (error as { code?: unknown }).code;
  if (code === 126) return "the password prompt was closed";
  if (code === 127) return "this account may not install software";
  return messageOf(error);
}

/** The shell that waits for a process to exit, then runs a program, such as the app's next instance after an update. */
export const AFTER_EXIT_SCRIPT = 'pid=$1; shift; while kill -0 "$pid" 2>/dev/null; do sleep 0.1; done; exec "$@"';

/** Runs `command` once this process has exited, without a shell between its arguments. Not for Windows. */
export function runAfterExit(command: string, args: readonly string[], env: NodeJS.ProcessEnv): void {
  const { ELECTRON_RUN_AS_NODE: _runAsNode, ...rest } = env;
  const child = spawn("/bin/sh", ["-c", AFTER_EXIT_SCRIPT, "arcue-after-exit", String(process.pid), command, ...args], {
    detached: true,
    stdio: "ignore",
    env: rest,
  });
  child.unref();
}

/**
 * The arguments the next instance starts with: an unpackaged app's, which name the app, or a packaged app's switches,
 * such as those that pick a renderer. Files it opened are left out, as the restored session opens them.
 */
export function relaunchArguments(argv: readonly string[], packaged: boolean): string[] {
  const rest = argv.slice(1);
  return packaged ? rest.filter((arg) => arg.startsWith("--")) : rest;
}

/** Starts a program in the background, without waiting for it or keeping it attached to this process. */
export function startDetached(command: string, args: readonly string[], env: NodeJS.ProcessEnv): void {
  const child = spawn(command, [...args], { detached: true, stdio: "ignore", env, windowsHide: false });
  child.unref();
}

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
