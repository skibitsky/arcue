import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Platform } from "../../packaging/layout";
import type { UpdateManifest } from "../../packaging/updates";
import { newUpdateKey, releaseFileUrl, releaseInstallers, signManifest } from "../../packaging/updates";
import type { InstallMethod } from "./update-install";
import type { Installed, UpdaterOptions } from "./updater";
import { CHECK_INTERVAL_MS, FIRST_CHECK_MS, RECORD_FILE, Updater } from "./updater";

const FEED = "https://github.com/skibitsky/arcue/releases/latest/download/update.json";
const key = newUpdateKey();
const installer = (version: string) => Buffer.from(`Arcue ${version}`);

function manifestOf(version: string): UpdateManifest {
  return {
    product: "arcue",
    version,
    page: `https://github.com/skibitsky/arcue/releases/tag/v${version}`,
    summary: `Arcue ${version} brings things.`,
    files: releaseInstallers().map(({ platform, arch, installer: { kind, file } }) => ({
      platform,
      arch,
      kind,
      url: releaseFileUrl(version, file),
      sha256: createHash("sha256").update(installer(version)).digest("hex"),
      size: installer(version).length,
    })),
  };
}

class ManualTimers {
  #now = 0;
  #pending: { at: number; callback: () => void; cancelled: boolean }[] = [];

  now = () => this.#now;

  setTimer = (delayMs: number, callback: () => void) => {
    const entry = { at: this.#now + delayMs, callback, cancelled: false };
    this.#pending.push(entry);
    return () => {
      entry.cancelled = true;
    };
  };

  get next(): number | null {
    const due = this.#pending.filter((entry) => !entry.cancelled).map((entry) => entry.at - this.#now);
    return due.length > 0 ? Math.min(...due) : null;
  }

  advance(ms: number): void {
    this.#now += ms;
    const due = this.#pending.filter((entry) => entry.at <= this.#now && !entry.cancelled);
    this.#pending = this.#pending.filter((entry) => entry.at > this.#now && !entry.cancelled);
    for (const entry of due) entry.callback();
  }
}

const folders: string[] = [];
afterEach(async () => {
  for (const folder of folders.splice(0)) await rm(folder, { recursive: true, force: true });
});

interface Harness {
  updater: Updater;
  timers: ManualTimers;
  requests: string[];
  installs: { method: InstallMethod["kind"]; relaunch: boolean }[];
  feed: { release: string | null; status: number };
  folder: string;
}

async function harness(
  options: {
    version?: string;
    folder?: string;
    method?: InstallMethod;
    platform?: Platform;
    install?: () => Promise<Installed>;
    feedUrl?: string | null;
    signWith?: string;
  } = {},
): Promise<Harness> {
  const folder = options.folder ?? (await mkdtemp(join(tmpdir(), "arcue-updater-")));
  if (!options.folder) folders.push(folder);
  const timers = new ManualTimers();
  const requests: string[] = [];
  const installs: Harness["installs"] = [];
  const feed: Harness["feed"] = { release: "0.2.0", status: 200 };
  const fetch: UpdaterOptions["fetch"] = async (url) => {
    requests.push(url);
    if (url === FEED) {
      if (feed.status !== 200 || feed.release === null)
        return new Response("", { status: feed.status === 200 ? 404 : feed.status });
      return new Response(signManifest(manifestOf(feed.release), options.signWith ?? key.privateKey));
    }
    const version = /\/v([^/]+)\//.exec(url)?.[1] ?? "";
    return new Response(installer(version));
  };
  const method = options.method ?? { kind: "bundle", target: "/Applications/Arcue.app" };
  const updater = new Updater({
    version: options.version ?? "0.1.0",
    platform: options.platform ?? "darwin",
    arch: "arm64",
    feedUrl: options.feedUrl === undefined ? FEED : options.feedUrl,
    keys: [key.publicKey],
    folder,
    fetch,
    method: async () => method,
    stage: async (_method, file) => ({ path: `${file}.staged` }),
    install: async (found, _staged, relaunch) => {
      installs.push({ method: found.kind, relaunch });
      return options.install ? options.install() : { servePort: null };
    },
    setTimer: timers.setTimer,
    now: timers.now,
    log: { info: () => undefined, error: () => undefined },
  });
  return { updater, timers, requests, installs, feed, folder };
}

describe("Updater", () => {
  it("checks after launch, downloads a newer release in the background, and offers to restart into it", async () => {
    const { updater, timers, requests } = await harness();
    const states: string[] = [];
    updater.onChange(() => states.push(updater.phase.kind));
    expect(await updater.start()).toEqual({ notice: null, servePort: null });
    expect(timers.next).toBe(FIRST_CHECK_MS);
    expect(updater.state).toEqual({ status: "none" });

    timers.advance(FIRST_CHECK_MS);
    await vi.waitFor(() => expect(updater.phase.kind).toBe("ready"));
    expect(states).toEqual(["checking", "downloading", "ready"]);
    expect(requests).toEqual([FEED, "https://github.com/skibitsky/arcue/releases/download/v0.2.0/Arcue-mac-arm64.dmg"]);
    expect(updater.state).toEqual({
      status: "ready",
      version: "0.2.0",
      page: "https://github.com/skibitsky/arcue/releases/tag/v0.2.0",
    });
    expect(timers.next).toBe(CHECK_INTERVAL_MS);

    expect(updater.requestRestart()).toBe(true);
    expect(updater.state).toEqual({ status: "installing", version: "0.2.0" });
    expect(updater.installsOnQuit).toBe(true);
  });

  it("says when it is up to date or the release has no manifest, and stays quiet", async () => {
    const { updater, feed } = await harness({ version: "0.2.0" });
    await updater.start();
    expect(await updater.check()).toEqual({ kind: "current", version: "0.2.0" });
    feed.release = null;
    expect(await updater.check()).toEqual({ kind: "unavailable" });
    feed.status = 500;
    expect(await updater.check()).toMatchObject({ kind: "failed", message: expect.stringContaining("500") });
    expect(updater.phase).toEqual({ kind: "idle" });
    expect(updater.state).toEqual({ status: "none" });
  });

  it("refuses a manifest signed by another key", async () => {
    const { updater, requests } = await harness({ signWith: newUpdateKey().privateKey });
    await updater.start();
    expect(await updater.check()).toEqual({
      kind: "failed",
      message: "The update manifest is not signed by Arcue's update key.",
    });
    expect(updater.phase).toEqual({ kind: "idle" });
    expect(requests).toEqual([FEED]);
  });

  it("offers a download where the app cannot install the update", async () => {
    const { updater, requests } = await harness({
      method: { kind: "manual", reason: "Open Arcue from Applications." },
    });
    await updater.start();
    await updater.check();
    expect(updater.state).toEqual({
      status: "manual",
      version: "0.2.0",
      page: "https://github.com/skibitsky/arcue/releases/tag/v0.2.0",
      reason: "Open Arcue from Applications.",
    });
    expect(requests).toEqual([FEED]);
    expect(updater.requestRestart()).toBe(false);
  });

  it("installs on any quit where that is quick, and only on a restart where it needs a setup program", async () => {
    const mac = await harness();
    await mac.updater.start();
    await mac.updater.check();
    expect(mac.updater.installsOnQuit).toBe(true);
    await mac.updater.finishQuit();
    expect(mac.installs).toEqual([{ method: "bundle", relaunch: false }]);

    const windows = await harness({ method: { kind: "setup" }, platform: "win32" });
    await windows.updater.start();
    await windows.updater.check();
    expect(windows.updater.installsOnQuit).toBe(false);
    await windows.updater.finishQuit();
    expect(windows.installs).toEqual([]);

    const restart = await harness({ method: { kind: "setup" }, platform: "win32" });
    await restart.updater.start();
    await restart.updater.check();
    restart.updater.requestRestart();
    await restart.updater.finishQuit();
    expect(restart.installs).toEqual([{ method: "setup", relaunch: true }]);
  });

  it("tells the next launch it updated, and an arcue serve to start again", async () => {
    const first = await harness({ install: async () => ({ servePort: 4530 }) });
    await first.updater.start();
    await first.updater.check();
    first.updater.requestRestart();
    await first.updater.finishQuit();
    expect(JSON.parse(await readFile(join(first.folder, RECORD_FILE), "utf8"))).toMatchObject({
      installing: { version: "0.2.0", from: "0.1.0", reason: null },
      servePort: 4530,
    });

    const next = await harness({ version: "0.2.0", folder: first.folder });
    expect(await next.updater.start()).toEqual({
      notice: { kind: "info", message: "Updated to Arcue 0.2.0." },
      servePort: 4530,
    });
    expect(await next.updater.start()).toEqual({ notice: null, servePort: null });
    expect(await readdir(first.folder)).toEqual([RECORD_FILE]);
  });

  it("says why an update did not install, and then offers it only as a download", async () => {
    const first = await harness({ install: () => Promise.reject(new Error("the password prompt was closed")) });
    await first.updater.start();
    await first.updater.check();
    first.updater.requestRestart();
    await first.updater.finishQuit();

    const next = await harness({ folder: first.folder });
    expect((await next.updater.start()).notice).toEqual({
      kind: "alert",
      message: "Arcue 0.2.0 did not install: the password prompt was closed",
    });
    await next.updater.check();
    expect(next.updater.state).toMatchObject({ status: "manual", version: "0.2.0" });
    expect(next.requests).toEqual([FEED]);
  });

  it("keeps a download for the next launch, and drops those of versions the app has reached", async () => {
    const first = await harness({ method: { kind: "setup" }, platform: "win32" });
    await first.updater.start();
    await first.updater.check();
    await first.updater.finishQuit();
    expect(await readdir(join(first.folder, "0.2.0"))).toEqual(["Arcue-update-setup.exe"]);

    const again = await harness({ method: { kind: "setup" }, platform: "win32", folder: first.folder });
    await again.updater.start();
    await again.updater.check();
    expect(again.updater.phase.kind).toBe("ready");
    expect(again.requests).toEqual([FEED]);

    await mkdir(join(first.folder, "0.0.9"));
    await writeFile(join(first.folder, "stray.txt"), "");
    const updated = await harness({ version: "0.2.0", folder: first.folder });
    await updated.updater.start();
    expect((await readdir(first.folder)).sort()).toEqual([RECORD_FILE, "stray.txt"]);
  });

  it("checks again when a newer release comes out while one is ready, and not while it downloads", async () => {
    const { updater, feed, requests, timers } = await harness();
    await updater.start();
    await updater.check();
    feed.release = "0.3.0";
    timers.advance(CHECK_INTERVAL_MS);
    await vi.waitFor(() => expect(updater.state).toMatchObject({ status: "ready", version: "0.3.0" }));
    expect(requests.filter((url) => url !== FEED)).toHaveLength(2);
    const [first, second] = [updater.check(), updater.check()];
    expect(first).toBe(second);
    await first;
  });

  it("does nothing without a feed", async () => {
    const { updater, timers } = await harness({ feedUrl: null });
    await updater.start();
    expect(timers.next).toBeNull();
    expect(await updater.check()).toEqual({ kind: "off" });
    expect(updater.enabled).toBe(false);
  });
});
