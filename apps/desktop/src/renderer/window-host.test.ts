import { ArcueCore, ManualClock, MemoryPlatform } from "@arcue/core";
import type { CoreChannel, MemoryEndpoint } from "@arcue/protocol";
import { createMemoryChannel } from "@arcue/protocol";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DesktopBridge, MenuCommand, TextEdit, WindowInit, WindowTabs } from "../shared/ipc";
import { WindowHost } from "./window-host";

const HERO = "/work/Hero.fbx";
const CRATE = "/work/Crate.fbx";
const GOLEM = "/work/Golem.fbx";
const BLOB = "/work/Blob.fbx";

/** A main process and a core in memory: each `connectCore` gets a fresh channel to the current core. */
class FakeDesktop {
  readonly platform = new MemoryPlatform({
    clock: new ManualClock(),
    files: {
      [HERO]: "fbx",
      [CRATE]: "fbx",
      [GOLEM]: "fbx",
      [BLOB]: "fbx",
    },
  });
  core: ArcueCore | null = null;
  /** Crashes the next core once it has opened this many assets. */
  crashAfterOpens: number | null = null;
  readonly reports: WindowTabs[] = [];
  readonly closed: WindowTabs[] = [];
  readonly textEdits: TextEdit[] = [];
  readyCount = 0;
  crashes = 0;
  #connections = 0;
  #windowSide: MemoryEndpoint | null = null;
  #portListener: ((channel: CoreChannel) => void) | null = null;
  #coreLost: (() => void) | null = null;
  #menu: ((command: MenuCommand) => void) | null = null;
  #close: (() => void) | null = null;

  readonly init: WindowInit;

  constructor(init: WindowInit) {
    this.init = init;
  }

  async startCore(): Promise<void> {
    const core = await ArcueCore.start({ platform: this.platform, onError: () => undefined });
    this.core = core;
    const limit = this.crashAfterOpens;
    this.crashAfterOpens = null;
    if (limit === null) return;
    let opens = 0;
    core.client.subscribe("asset.opened", () => {
      if (++opens === limit) queueMicrotask(() => this.crash());
    });
  }

  /** Stops the core as a crash would: its channel closes and the main process reports the loss. */
  crash(): void {
    this.crashes++;
    this.core?.dispose();
    this.core = null;
    this.#windowSide?.close();
    this.#coreLost?.();
  }

  menu(command: MenuCommand): void {
    this.#menu?.(command);
  }

  requestClose(): void {
    this.#close?.();
  }

  onPort = (listener: (channel: CoreChannel) => void) => {
    this.#portListener = listener;
    return () => {
      this.#portListener = null;
    };
  };

  readonly bridge: DesktopBridge = {
    init: async () => this.init,
    connectCore: () => {
      void (async () => {
        if (!this.core) await this.startCore();
        const core = this.core;
        if (!core) return;
        const [coreSide, windowSide] = createMemoryChannel();
        this.#windowSide = windowSide;
        core.connect(coreSide, { connection: `window-${++this.#connections}`, caller: "window" });
        this.#portListener?.(windowSide);
      })();
    },
    onCoreLost: (listener) => {
      this.#coreLost = listener;
      return () => undefined;
    },
    windowReady: () => {
      this.readyCount++;
    },
    reportTabs: (tabs) => {
      this.reports.push(tabs);
    },
    openDialog: async () => [],
    pickFiles: async () => [],
    onOpenPaths: () => () => undefined,
    onAdoptTab: () => () => undefined,
    pathForFile: () => "",
    tabDragEnd: () => undefined,
    onMenuCommand: (listener) => {
      this.#menu = listener;
      return () => undefined;
    },
    editText: (edit) => {
      this.textEdits.push(edit);
    },
    onCloseRequest: (listener) => {
      this.#close = listener;
      return () => undefined;
    },
    closeReady: (tabs) => {
      this.closed.push(tabs);
    },
  };
}

const cleanups: (() => void)[] = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

/** The paths of the window's open asset tabs, in order. */
function paths(window: WindowHost): string[] {
  return window.store.state
    .get()
    .tabs.map((tab) => window.store.session(tab.id)?.state.get().summary.path)
    .filter((path) => path !== undefined);
}

/** Starts a window as the page does; the Workspace component starts the store's subscriptions. */
async function startHost(
  desktop: FakeDesktop,
  options: Partial<ConstructorParameters<typeof WindowHost>[0]> = {},
): Promise<WindowHost> {
  const host = new WindowHost({
    bridge: desktop.bridge,
    onPort: desktop.onPort,
    closeWindow: () => undefined,
    ...options,
  });
  const stopStore = host.store.start();
  cleanups.push(() => {
    stopStore();
    host.dispose();
  });
  await host.start();
  return host;
}

describe("WindowHost", () => {
  it("restores its saved tabs on the first connection and tells the main process it is ready", async () => {
    const desktop = new FakeDesktop({
      platform: "darwin",
      restore: {
        tabs: [
          { path: HERO, view: null },
          { path: CRATE, view: null },
        ],
        active: 0,
      },
      adopt: null,
    });
    const window = await startHost(desktop);
    await vi.waitFor(() => expect(desktop.readyCount).toBe(1));
    await vi.waitFor(() => expect(paths(window)).toEqual([HERO, CRATE]));
    expect(window.tabs().active).toBe(0);
    expect(window.client.connectionState).toBe("connected");
  });

  it("shows reconnecting while the core restarts, then opens the same tabs in the new core", async () => {
    const desktop = new FakeDesktop({ platform: "linux", restore: null, adopt: null });
    const window = await startHost(desktop);
    await vi.waitFor(() => expect(desktop.readyCount).toBe(1));
    await window.store.openPath(HERO);
    await window.store.openPath(CRATE);
    await vi.waitFor(() => expect(paths(window)).toEqual([HERO, CRATE]));
    const states: string[] = [];
    window.client.onConnectionChange((state) => states.push(state));

    desktop.crash();
    await vi.waitFor(() => expect(states).toEqual(["reconnecting", "connected"]));
    await vi.waitFor(() => expect(paths(window)).toEqual([HERO, CRATE]));
    const assets = await window.client.query("asset.list", {});
    expect(assets.assets.map((asset) => asset.path)).toEqual([HERO, CRATE]);
    expect(desktop.readyCount).toBe(1);
  });

  it("keeps every tab when the core crashes again while the window reopens them", async () => {
    const all = [HERO, CRATE, GOLEM, BLOB];
    const desktop = new FakeDesktop({
      platform: "linux",
      restore: { tabs: all.map((path) => ({ path, view: null })), active: 2 },
      adopt: null,
    });
    const window = await startHost(desktop);
    await vi.waitFor(() => expect(paths(window)).toEqual(all));
    const notify = vi.spyOn(window.store, "notify");
    const reported = desktop.reports.length;

    desktop.crashAfterOpens = 2;
    desktop.crash();
    await vi.waitFor(() => expect(desktop.crashes).toBe(2));
    expect(window.tabs().tabs.map((tab) => tab.path)).toEqual(all);
    await vi.waitFor(async () => {
      const { assets } = await window.client.query("asset.list", {});
      expect(assets.map((asset) => asset.path)).toEqual(all);
    });
    await vi.waitFor(() => expect(paths(window)).toEqual(all));
    await vi.waitFor(() => expect(window.tabs().active).toBe(2));
    expect(notify).not.toHaveBeenCalled();
    for (const report of desktop.reports.slice(reported)) expect(report.tabs.map((tab) => tab.path)).toEqual(all);
  });

  it("tells a new core which window has the focus", async () => {
    const desktop = new FakeDesktop({ platform: "darwin", restore: null, adopt: null });
    const window = await startHost(desktop, { hasFocus: () => true });
    await vi.waitFor(() => expect(desktop.readyCount).toBe(1));
    const execute = vi.spyOn(window.client, "execute");
    desktop.crash();
    await vi.waitFor(() => expect(execute).toHaveBeenCalledWith("view.reportFocus", {}));
  });

  it("reports its tabs only when they changed", async () => {
    const intervals: (() => void)[] = [];
    const setTimer = (delayMs: number, callback: () => void) => {
      if (delayMs === 5000) {
        intervals.push(callback);
        return () => undefined;
      }
      const handle = setTimeout(callback, delayMs);
      return () => clearTimeout(handle);
    };
    const desktop = new FakeDesktop({ platform: "darwin", restore: null, adopt: null });
    const window = await startHost(desktop, { setTimer });
    await vi.waitFor(() => expect(desktop.readyCount).toBe(1));
    await window.store.openPath(HERO);
    await vi.waitFor(() => expect(desktop.reports.at(-1)?.tabs.map((tab) => tab.path)).toEqual([HERO]));
    await new Promise((resolve) => setTimeout(resolve, 400));
    const count = desktop.reports.length;
    for (let round = 0; round < 3; round++) for (const tick of intervals.splice(0)) tick();
    expect(desktop.reports).toHaveLength(count);
    await window.store.openPath(CRATE);
    await vi.waitFor(() => expect(desktop.reports.at(-1)?.tabs.map((tab) => tab.path)).toEqual([HERO, CRATE]));
  });

  it("closes its assets and hands over its final tabs when the window closes", async () => {
    const desktop = new FakeDesktop({
      platform: "win32",
      restore: { tabs: [{ path: HERO, view: null }], active: 0 },
      adopt: null,
    });
    const window = await startHost(desktop);
    await vi.waitFor(() => expect(paths(window)).toEqual([HERO]));
    desktop.requestClose();
    await vi.waitFor(() => expect(desktop.closed).toHaveLength(1));
    expect(desktop.closed[0]?.tabs.map((tab) => tab.path)).toEqual([HERO]);
    await expect(window.client.query("asset.list", {})).resolves.toEqual({ assets: [] });
  });

  it("opens a new tab and closes the active tab from the menu", async () => {
    const desktop = new FakeDesktop({ platform: "darwin", restore: null, adopt: null });
    const window = await startHost(desktop);
    await vi.waitFor(() => expect(desktop.readyCount).toBe(1));
    await window.store.openPath(HERO);
    await vi.waitFor(() => expect(paths(window)).toEqual([HERO]));
    desktop.menu("close-tab");
    await vi.waitFor(() => expect(window.store.state.get().tabs).toEqual([]));
    desktop.menu("new-tab");
    expect(window.store.state.get().tabs.map((tab) => tab.kind)).toEqual(["empty"]);
  });

  it("runs Edit > Undo and Redo as text edits in a focused text field, and on the visible tab's review otherwise", async () => {
    const desktop = new FakeDesktop({ platform: "darwin", restore: null, adopt: null });
    let typing = true;
    const window = await startHost(desktop, { inTextField: () => typing });
    await vi.waitFor(() => expect(desktop.readyCount).toBe(1));
    await window.store.openPath(HERO);
    await vi.waitFor(() => expect(paths(window)).toEqual([HERO]));
    const assetId = window.store.state.get().active;
    const execute = vi.spyOn(window.client, "execute");
    const history = () => execute.mock.calls.filter(([name]) => name === "review.undo" || name === "review.redo");

    desktop.menu("undo");
    desktop.menu("redo");
    expect(desktop.textEdits).toEqual(["undo", "redo"]);
    expect(history()).toEqual([]);

    typing = false;
    desktop.menu("undo");
    desktop.menu("redo");
    await vi.waitFor(() =>
      expect(history()).toEqual([
        ["review.undo", { assetId }],
        ["review.redo", { assetId }],
      ]),
    );
    expect(desktop.textEdits).toHaveLength(2);
  });

  it("takes a tab from another window with view.moveAsset", async () => {
    const desktop = new FakeDesktop({ platform: "darwin", restore: null, adopt: null });
    const first = await startHost(desktop);
    await vi.waitFor(() => expect(desktop.readyCount).toBe(1));
    await first.store.openPath(HERO);
    await vi.waitFor(() => expect(paths(first)).toEqual([HERO]));
    const second = await startHost(desktop);
    await vi.waitFor(() => expect(desktop.readyCount).toBe(2));
    const [assetId] = first.store.state.get().tabs.map((tab) => tab.id);
    await second.moveHere(assetId ?? "");
    expect(paths(second)).toEqual([HERO]);
    expect(first.store.state.get().tabs).toEqual([]);
  });
});
