import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { Arch, Installer, Platform } from "../../packaging/layout";
import { compareVersions, parseVersion } from "../../packaging/layout";
import type { UpdateManifest } from "../../packaging/updates";
import type { Notice, UpdateState } from "../shared/ipc";
import type { Log } from "../shared/log";
import type { UpdateFetch } from "./update-feed";
import { download, fetchManifest, fileFor, hasFile, NoManifestError } from "./update-feed";
import type { InstallMethod, Staged } from "./update-install";
import { installerKind, messageOf } from "./update-install";

/** How long after launch the first check waits, so it never slows the app's start. */
export const FIRST_CHECK_MS = 10_000;
export const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
export const RECORD_FILE = "state.json";

/** What the updater is doing, which the menu shows. Windows see only what they can act on, as `UpdateState`. */
export type UpdatePhase =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "downloading"; version: string }
  | { kind: "ready"; manifest: UpdateManifest; method: InstallMethod; staged: Staged }
  | { kind: "manual"; manifest: UpdateManifest; reason: string }
  | { kind: "installing"; version: string };

export type CheckResult =
  | { kind: "off" }
  | { kind: "current"; version: string }
  | { kind: "unavailable" }
  | { kind: "found"; phase: UpdatePhase }
  | { kind: "failed"; message: string };

/** What an install leaves for the next launch to do. */
export interface Installed {
  /** The port of an arcue serve that the install stopped and could not start again itself. */
  servePort: number | null;
}

export interface UpdaterOptions {
  version: string;
  platform: Platform;
  arch: Arch;
  /** The feed's address, or null when updates are off. */
  feedUrl: string | null;
  keys: readonly string[];
  /** The folder for downloads and the record of the last install. */
  folder: string;
  fetch: UpdateFetch;
  method(): Promise<InstallMethod>;
  stage(method: InstallMethod, file: string, folder: string, version: string): Promise<Staged>;
  /**
   * Installs the staged update as the app quits. With `relaunch`, the next instance starts even when the install
   * fails, which it then rejects with.
   */
  install(method: InstallMethod, staged: Staged, relaunch: boolean): Promise<Installed>;
  setTimer(delayMs: number, callback: () => void): () => void;
  now(): number;
  log: Log;
}

/** What `start` found that the last launch left: what to tell the person, and an arcue serve to start again. */
export interface StartResult {
  notice: Notice | null;
  servePort: number | null;
}

const recordSchema = z.object({
  version: z.literal(1),
  /** The update the app was installing as it quit, which the next launch reports. */
  installing: z.object({ version: z.string(), from: z.string(), reason: z.string().nullable() }).nullable(),
  /** A version that did not install, which the app then offers only as a download. */
  failed: z.string().nullable(),
  servePort: z.int().min(1).max(65_535).nullable(),
});

type UpdateRecord = z.output<typeof recordSchema>;

const emptyRecord = (): UpdateRecord => ({ version: 1, installing: null, failed: null, servePort: null });

/** The ways of updating that are quick and need no one, so a plain quit installs a ready update too. */
const INSTALLS_ON_QUIT = new Set<InstallMethod["kind"]>(["bundle", "folder"]);

const DOWNLOAD_NAMES: Record<Installer["kind"], string> = {
  dmg: "Arcue-update.dmg",
  setup: "Arcue-update-setup.exe",
  deb: "Arcue-update.deb",
  tar: "Arcue-update.tar.gz",
};

/**
 * Checks the feed after launch and every six hours, downloads and stages a newer release in the background, and
 * installs it as the app quits: on a restart the person asked for, or on any quit where that is quick and needs no one.
 * The next launch reports how the install went.
 */
export class Updater {
  readonly #options: UpdaterOptions;
  readonly #listeners = new Set<() => void>();
  #phase: UpdatePhase = { kind: "idle" };
  #record: UpdateRecord = emptyRecord();
  #checking: Promise<CheckResult> | null = null;
  #lastCheck = Number.NEGATIVE_INFINITY;
  #cancelTimer: (() => void) | null = null;
  #abort: AbortController | null = null;
  #restart = false;
  #stopped = false;
  readonly #recordRead = Promise.withResolvers<void>();

  constructor(options: UpdaterOptions) {
    this.#options = options;
  }

  get phase(): UpdatePhase {
    return this.#phase;
  }

  get enabled(): boolean {
    return this.#options.feedUrl !== null;
  }

  /** What windows show: an update to restart into, one to download, or one installing. */
  get state(): UpdateState {
    const phase = this.#phase;
    switch (phase.kind) {
      case "ready":
        return this.#restart
          ? { status: "installing", version: phase.manifest.version }
          : { status: "ready", version: phase.manifest.version, page: phase.manifest.page };
      case "manual":
        return { status: "manual", version: phase.manifest.version, page: phase.manifest.page, reason: phase.reason };
      case "installing":
        return { status: "installing", version: phase.version };
      default:
        return { status: "none" };
    }
  }

  /** Whether the next quit installs an update: one the person restarts into, or one that installs on any quit. */
  get installsOnQuit(): boolean {
    const phase = this.#phase;
    return phase.kind === "ready" && (this.#restart || INSTALLS_ON_QUIT.has(phase.method.kind));
  }

  onChange(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  /**
   * Reads what the last launch recorded, removes old downloads, and schedules the first check. A check that starts
   * earlier waits for the record before it downloads anything.
   */
  async start(): Promise<StartResult> {
    const found = await this.#takeRecord().finally(() => this.#recordRead.resolve());
    await this.#writeRecord().catch((error: unknown) =>
      this.#options.log.error("Could not write the update record", error),
    );
    await this.#removeOldDownloads();
    if (this.enabled) this.#schedule(FIRST_CHECK_MS);
    return found;
  }

  /** Checks now, or joins the check that runs. While an update downloads or installs, reports it instead. */
  check(): Promise<CheckResult> {
    if (!this.enabled || this.#stopped) return Promise.resolve({ kind: "off" });
    const phase = this.#phase;
    if (phase.kind === "downloading" || phase.kind === "installing") {
      return this.#checking ?? Promise.resolve({ kind: "found", phase });
    }
    this.#checking ??= this.#runCheck().finally(() => {
      this.#checking = null;
    });
    return this.#checking;
  }

  /** Checks when the last check is older than the interval, as after the computer wakes. */
  checkIfDue(): void {
    if (this.enabled && this.#options.now() - this.#lastCheck >= CHECK_INTERVAL_MS) void this.check();
  }

  /**
   * Starts no more checks as the app begins to quit, and stops the one that runs, which then leaves the phase as it is,
   * so a ready update still installs.
   */
  stopChecks(): void {
    this.#stop();
  }

  /** Asks the next quit to install the ready update and start the app again. False when no update is ready. */
  requestRestart(): boolean {
    if (this.#phase.kind !== "ready") return false;
    if (!this.#restart) {
      this.#restart = true;
      this.#set(this.#phase);
    }
    return true;
  }

  /**
   * Installs a ready update as the app quits, once its windows closed their assets and the core stopped. A plain quit
   * installs only what is quick and needs no one. Never rejects: a failed install is recorded for the next launch.
   */
  async finishQuit(): Promise<void> {
    this.#stop();
    const phase = this.#phase;
    if (phase.kind !== "ready") return;
    const relaunch = this.#restart;
    if (!relaunch && !INSTALLS_ON_QUIT.has(phase.method.kind)) return;
    const version = phase.manifest.version;
    const { log } = this.#options;
    if (phase.method.kind === "restart") {
      await this.#options.install(phase.method, phase.staged, relaunch).catch((error: unknown) => {
        log.error("Could not restart", error);
      });
      return;
    }
    this.#set({ kind: "installing", version });
    log.info(`Installing Arcue ${version}${relaunch ? " and starting it" : ""}`);
    this.#record = { ...this.#record, installing: { version, from: this.#options.version, reason: null } };
    await this.#writeRecord().catch((error: unknown) => log.error("Could not write the update record", error));
    try {
      const { servePort } = await this.#options.install(phase.method, phase.staged, relaunch);
      this.#record = { ...this.#record, servePort };
    } catch (error) {
      log.error(`Could not install Arcue ${version}`, error);
      this.#record = {
        ...this.#record,
        installing: { version, from: this.#options.version, reason: messageOf(error) },
      };
    }
    await this.#writeRecord().catch((error: unknown) => log.error("Could not write the update record", error));
  }

  dispose(): void {
    this.#stop();
    this.#listeners.clear();
  }

  #stop(): void {
    this.#stopped = true;
    this.#cancelTimer?.();
    this.#cancelTimer = null;
    this.#abort?.abort();
  }

  #set(phase: UpdatePhase): void {
    this.#phase = phase;
    if (phase.kind !== "ready") this.#restart = false;
    for (const listener of [...this.#listeners]) listener();
  }

  /** A change a check makes, which it no longer makes once the updater stopped. */
  #checked(phase: UpdatePhase): void {
    if (!this.#stopped) this.#set(phase);
  }

  #schedule(delayMs: number): void {
    this.#cancelTimer?.();
    if (this.#stopped) return;
    this.#cancelTimer = this.#options.setTimer(delayMs, () => {
      this.#cancelTimer = null;
      void this.check();
    });
  }

  async #runCheck(): Promise<CheckResult> {
    const options = this.#options;
    const feedUrl = options.feedUrl;
    if (!feedUrl) return { kind: "off" };
    this.#lastCheck = options.now();
    const previous = this.#phase;
    if (previous.kind === "idle") this.#checked({ kind: "checking" });
    const abort = new AbortController();
    this.#abort = abort;
    try {
      const manifest = await fetchManifest(options.fetch, feedUrl, options.keys, abort.signal);
      if (compareVersions(manifest.version, options.version) <= 0) {
        if (previous.kind === "idle" || previous.kind === "checking") this.#checked({ kind: "idle" });
        else this.#checked(previous);
        return { kind: "current", version: options.version };
      }
      if ((previous.kind === "ready" || previous.kind === "manual") && previous.manifest.version === manifest.version) {
        this.#checked(previous);
        return { kind: "found", phase: previous };
      }
      return { kind: "found", phase: await this.#prepare(manifest, abort.signal) };
    } catch (error) {
      if (abort.signal.aborted) return { kind: "off" };
      this.#checked(previous.kind === "checking" ? { kind: "idle" } : previous);
      if (error instanceof NoManifestError) return { kind: "unavailable" };
      options.log.error("Could not check for updates", error);
      return { kind: "failed", message: messageOf(error) };
    } finally {
      if (this.#abort === abort) this.#abort = null;
      this.#schedule(CHECK_INTERVAL_MS);
    }
  }

  /** Downloads and stages a release, or offers it as a download where this app cannot install it. */
  async #prepare(manifest: UpdateManifest, signal: AbortSignal): Promise<UpdatePhase> {
    const options = this.#options;
    const version = manifest.version;
    const manual = (reason: string): UpdatePhase => {
      const phase: UpdatePhase = { kind: "manual", manifest, reason };
      this.#checked(phase);
      return phase;
    };
    await this.#recordRead.promise;
    if (this.#record.failed === version)
      return manual("It did not install here before. Download it from its release page.");
    const method = await options.method();
    if (method.kind === "manual") return manual(method.reason);
    const kind = installerKind(method, options.platform);
    const file = kind ? fileFor(manifest, options.platform, options.arch, kind) : null;
    if (!kind || !file) return manual("The release has no installer for this computer.");
    if (this.#phase.kind !== "ready") this.#checked({ kind: "downloading", version });
    const folder = join(options.folder, parseVersion(version).full);
    const path = join(folder, DOWNLOAD_NAMES[kind]);
    try {
      if (!(await hasFile(file, path))) {
        options.log.info(`Downloading Arcue ${version} from ${file.url}`);
        await download(options.fetch, file, path, signal);
      }
      const staged = await options.stage(method, path, folder, version);
      const phase: UpdatePhase = { kind: "ready", manifest, method, staged };
      options.log.info(`Arcue ${version} is ready to install`);
      this.#checked(phase);
      return phase;
    } catch (error) {
      await rm(folder, { recursive: true, force: true }).catch(() => undefined);
      throw error;
    }
  }

  /** Reads the record, and takes from it what the last launch left for this one. */
  async #takeRecord(): Promise<StartResult> {
    this.#record = await this.#readRecord();
    const notice = this.#lastInstall();
    const servePort = this.#record.servePort;
    this.#record = { ...this.#record, installing: null, servePort: null };
    return { notice, servePort };
  }

  /** What to tell the person about the update the last launch was installing as it quit. */
  #lastInstall(): Notice | null {
    const installing = this.#record.installing;
    if (!installing) return null;
    if (compareVersions(this.#options.version, installing.version) >= 0) {
      this.#record = { ...this.#record, failed: null };
      return { kind: "info", message: `Updated to Arcue ${this.#options.version}.` };
    }
    this.#record = { ...this.#record, failed: installing.version };
    return {
      kind: "alert",
      message: installing.reason
        ? `Arcue ${installing.version} did not install: ${installing.reason}`
        : `Arcue ${installing.version} did not install. Download it from its release page.`,
    };
  }

  async #readRecord(): Promise<UpdateRecord> {
    try {
      const parsed = recordSchema.safeParse(
        JSON.parse(await readFile(join(this.#options.folder, RECORD_FILE), "utf8")),
      );
      return parsed.success ? parsed.data : emptyRecord();
    } catch {
      return emptyRecord();
    }
  }

  async #writeRecord(): Promise<void> {
    await mkdir(this.#options.folder, { recursive: true });
    const path = join(this.#options.folder, RECORD_FILE);
    const temporary = `${path}.tmp`;
    await writeFile(temporary, `${JSON.stringify(this.#record, null, 2)}\n`);
    await rename(temporary, path);
  }

  /** Removes the downloads of versions this app already is, or has passed. */
  async #removeOldDownloads(): Promise<void> {
    const entries = await readdir(this.#options.folder, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      let newer = false;
      try {
        newer = compareVersions(entry.name, this.#options.version) > 0;
      } catch {
        newer = false;
      }
      if (!newer)
        await rm(join(this.#options.folder, entry.name), { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
