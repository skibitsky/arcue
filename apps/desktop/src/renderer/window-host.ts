import type { WorkspaceStore } from "@arcue/ui";
import { createWorkspaceStore } from "@arcue/ui";
import type { DesktopBridge, MenuCommand, SavedTab, WindowTabs } from "../shared/ipc";
import type { CoreChannel } from "./reconnecting-client";
import { ReconnectingClient } from "./reconnecting-client";

export interface WindowHostOptions {
  bridge: DesktopBridge;
  /** Calls the listener with each port to the core the main process sends this window. */
  onPort(listener: (channel: CoreChannel) => void): () => void;
  closeWindow(): void;
  /** Whether this window has the keyboard focus, so a new core learns which window the user works in. */
  hasFocus?: () => boolean;
  setTimer?: (delayMs: number, callback: () => void) => () => void;
}

const REPORT_DELAY_MS = 300;
const REPORT_INTERVAL_MS = 5000;

const defaultTimer = (delayMs: number, callback: () => void) => {
  const handle = setTimeout(callback, delayMs);
  return () => clearTimeout(handle);
};

/**
 * One window's side of the desktop app: connects the Workspace to the core, reopens its tabs after a relaunch, a reload
 * or a core restart, moves tabs between windows, and keeps the main process's copy of its tabs current for session
 * restore.
 */
export class WindowHost {
  readonly client: ReconnectingClient;
  readonly store: WorkspaceStore;
  readonly #bridge: DesktopBridge;
  readonly #options: WindowHostOptions;
  readonly #setTimer: (delayMs: number, callback: () => void) => () => void;
  readonly #stops: (() => void)[] = [];
  /** Saved tabs not open in the current core yet, in order: the restored session, or the tabs a lost core had. */
  #unopened: SavedTab[] = [];
  /** The path of the saved tab to activate once every saved tab is open again. */
  #wantActive: string | null = null;
  #generation = 0;
  #adopt: string | null = null;
  #ready = false;
  #closing = false;
  #reopening: Promise<void> = Promise.resolve();
  #cancelReport: (() => void) | null = null;
  #lastActive: string | null = null;
  #lastReport: string | null = null;

  constructor(options: WindowHostOptions) {
    this.#options = options;
    this.#bridge = options.bridge;
    this.#setTimer = options.setTimer ?? defaultTimer;
    this.client = new ReconnectingClient({
      handleRequest: (request) => this.store.handleRequest(request),
      onLost: () => this.#bridge.connectCore(),
      onListenerError: (error) => console.error(error),
    });
    this.store = createWorkspaceStore({ client: this.client, setTimer: this.#setTimer });
  }

  async start(): Promise<void> {
    const init = await this.#bridge.init();
    if (init.restore) this.#pendingReopen(init.restore);
    this.#adopt = init.adopt;
    const bridge = this.#bridge;
    this.#stops.push(
      this.#options.onPort((channel) => this.#connect(channel)),
      bridge.onCoreLost(() => this.client.lost()),
      bridge.onOpenPaths((paths) => {
        for (const path of paths) void this.store.openPath(path);
      }),
      bridge.onAdoptTab((assetId) => void this.moveHere(assetId)),
      bridge.onMenuCommand((command) => this.#menu(command)),
      bridge.onCloseRequest(() => void this.#close()),
      this.store.state.subscribe(() => this.#onStateChange()),
      this.#interval(),
    );
    bridge.connectCore();
  }

  /** Takes an asset's tab from the window that shows it, and places it at `index` in this window's strip. */
  async moveHere(assetId: string, index?: number): Promise<void> {
    try {
      await this.client.execute("view.moveAsset", { assetId });
      if (index !== undefined) this.store.moveTab(assetId, index);
    } catch (error) {
      this.store.notify({ message: error instanceof Error ? error.message : String(error), kind: "alert" });
    }
  }

  async openDialog(): Promise<void> {
    for (const path of await this.#bridge.openDialog()) await this.store.openPath(path);
  }

  openFiles(files: readonly File[]): void {
    const paths = files.map((file) => this.#bridge.pathForFile(file)).filter((path) => path !== "");
    if (paths.length === 0) this.store.notify({ message: "Arcue can open files from your disk only.", kind: "alert" });
    for (const path of paths) void this.store.openPath(path);
  }

  /**
   * The asset tabs in order with what each shows, for session restore. Saved tabs that are not open again yet after a
   * core restart follow the open ones, so a report never drops them.
   */
  tabs(): WindowTabs {
    const { tabs, active } = this.store.state.get();
    const saved: SavedTab[] = [];
    let activeIndex: number | null = null;
    for (const tab of tabs) {
      const session = tab.kind === "asset" ? this.store.session(tab.id) : null;
      const path = session?.state.get().summary.path ?? "";
      if (!session || path === "") continue;
      if (tab.id === active) activeIndex = saved.length;
      saved.push({ path, view: session.viewState() });
    }
    const open = new Set(saved.map((tab) => tab.path));
    saved.push(...this.#unopened.filter((tab) => !open.has(tab.path)));
    const wanted = this.#wantActive === null ? -1 : saved.findIndex((tab) => tab.path === this.#wantActive);
    return { tabs: saved, active: wanted >= 0 ? wanted : activeIndex };
  }

  dispose(): void {
    for (const stop of this.#stops.splice(0)) stop();
    this.#cancelReport?.();
    this.client.dispose();
    this.store.dispose();
  }

  /**
   * A new port to the core. After the first connection the core may be a fresh process that knows none of this window's
   * assets, so the window drops its tabs and opens them again by path, starting each from the view it showed.
   */
  #connect(channel: CoreChannel): void {
    this.#pendingReopen(this.tabs());
    for (const tab of this.store.state.get().tabs) {
      if (tab.kind === "asset") this.store.releaseAsset(tab.id);
    }
    const generation = ++this.#generation;
    this.client.attach(channel);
    if (this.#hasFocus()) this.store.reportFocus();
    this.#reopening = this.#reopening.then(async () => {
      await this.#reopen(generation);
      if (generation !== this.#generation) return;
      const adopt = this.#adopt;
      this.#adopt = null;
      if (adopt) await this.moveHere(adopt);
      if (!this.#ready) {
        this.#ready = true;
        this.#bridge.windowReady();
      }
      this.#report();
    });
  }

  #pendingReopen({ tabs, active }: WindowTabs): void {
    this.#unopened = [...tabs];
    this.#wantActive = active === null ? null : (tabs[active]?.path ?? null);
  }

  #hasFocus(): boolean {
    return this.#options.hasFocus?.() ?? false;
  }

  /** Opens the saved tabs one by one, and stops, keeping the rest, when the connection is lost or replaced. */
  async #reopen(generation: number): Promise<void> {
    for (;;) {
      const tab = this.#unopened[0];
      if (!tab || generation !== this.#generation) break;
      try {
        await this.client.execute("asset.open", { path: tab.path, ...(tab.view ? { viewState: tab.view } : {}) });
      } catch (error) {
        if (generation !== this.#generation || this.client.connectionState !== "connected") return;
        this.store.notify({ message: error instanceof Error ? error.message : String(error), kind: "alert" });
      }
      if (generation !== this.#generation) return;
      this.#unopened = this.#unopened.filter((pending) => pending !== tab);
    }
    if (generation !== this.#generation) return;
    const wanted = this.#wantActive;
    this.#wantActive = null;
    const active = this.store.state
      .get()
      .tabs.find((tab) => tab.kind === "asset" && this.store.session(tab.id)?.state.get().summary.path === wanted);
    if (active) this.store.activate(active.id);
  }

  #menu(command: MenuCommand): void {
    if (command === "new-tab") {
      this.store.openNewTab();
      return;
    }
    const { active, tabs } = this.store.state.get();
    if (active !== null) void this.store.closeTab(active);
    else if (tabs.length === 0) this.#options.closeWindow();
  }

  /** Closes this window's assets in the core, so their writes finish, and hands the main process the final tabs. */
  async #close(): Promise<void> {
    await this.#reopening;
    const tabs = this.tabs();
    this.#closing = true;
    this.#cancelReport?.();
    await Promise.all(
      this.store.state
        .get()
        .tabs.filter((tab) => tab.kind === "asset")
        .map((tab) => this.client.execute("asset.close", { assetId: tab.id }).catch(() => undefined)),
    );
    this.#bridge.closeReady(tabs);
  }

  #onStateChange(): void {
    const { active } = this.store.state.get();
    if (active !== this.#lastActive) {
      this.#lastActive = active;
      this.#pauseHiddenTabs(active);
    }
    this.#scheduleReport();
  }

  /** Only the visible tab renders, so playback stops in a tab that goes to the background. */
  #pauseHiddenTabs(active: string | null): void {
    for (const tab of this.store.state.get().tabs) {
      if (tab.kind !== "asset" || tab.id === active) continue;
      const session = this.store.session(tab.id);
      if (session?.time.get().playing) session.setPlaying(false);
    }
  }

  #scheduleReport(): void {
    if (!this.#ready || this.#closing) return;
    this.#cancelReport?.();
    this.#cancelReport = this.#setTimer(REPORT_DELAY_MS, () => {
      this.#cancelReport = null;
      this.#report();
    });
  }

  /** Sends the tabs when they differ from the last report, since every report rewrites the saved session. */
  #report(): void {
    if (!this.#ready || this.#closing) return;
    const tabs = this.tabs();
    const json = JSON.stringify(tabs);
    if (json === this.#lastReport) return;
    this.#lastReport = json;
    this.#bridge.reportTabs(tabs);
  }

  /** Camera and frame changes do not touch the tab list, so the tabs are also reported every few seconds. */
  #interval(): () => void {
    let cancel = () => {};
    const loop = () => {
      this.#report();
      cancel = this.#setTimer(REPORT_INTERVAL_MS, loop);
    };
    cancel = this.#setTimer(REPORT_INTERVAL_MS, loop);
    return () => cancel();
  }
}
