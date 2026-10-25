import type { CoreClient, SavedTab, WindowTabs } from "@arcue/protocol";
import { messageOf } from "./asset-session";
import type { WorkspaceStore } from "./workspace-store";

/** The asset a saved tab showed before the window's connection changed, in the core it was connected to then. */
export interface ReleasedTab {
  assetId: string;
  /** The version the tab showed, or null before one loaded. */
  version: string | null;
}

export interface ReopenOptions {
  /**
   * Opens one saved tab in the current core. `released` is the asset the tab showed before the connection changed,
   * which a core that kept running may hold at another path now, as when it followed the model to a new name.
   */
  open(tab: SavedTab, released: ReleasedTab | null): Promise<void>;
  /** Errors to drop without a toast, such as a model another session's view now has. */
  quiet?: (error: unknown) => boolean;
  /**
   * Runs once every saved tab is open, before the saved active tab is activated: for example, showing the other assets
   * the core holds for this window, each of which takes the active tab.
   */
  adopt?: () => Promise<void>;
  /**
   * The tab to activate in place of the saved active tab once every tab is open and adopted, such as a model an agent
   * opened while the window was away; null keeps the saved one.
   */
  activeInstead?: () => string | null;
  /** The asset that shows a saved tab now when it is at another path than the tab's, or null when none is. */
  shownAs?: (path: string) => string | null;
}

/**
 * A window's tabs across its connections to the core. A new connection may reach a fresh core that knows none of the
 * window's assets and numbers its assets from a1 again, so the window drops its tabs and opens them again by path,
 * starting each from the view it showed.
 */
export class TabRestore {
  readonly #store: WorkspaceStore;
  readonly #client: CoreClient;
  /** Saved tabs not open in the current core yet, in order: the restored session, or the tabs a lost core had. */
  #unopened: SavedTab[] = [];
  /** The path of the saved tab to activate once every saved tab is open again. */
  #wantActive: string | null = null;
  /** What each saved tab showed before the connection changed, by the tab's path. */
  #released = new Map<string, ReleasedTab>();
  #generation = 0;

  constructor(store: WorkspaceStore, client: CoreClient) {
    this.#store = store;
    this.#client = client;
  }

  get generation(): number {
    return this.#generation;
  }

  /** Saved tabs to open on the next connection: a restored session, or tabs a page saved. */
  pending({ tabs, active }: WindowTabs): void {
    this.#unopened = [...tabs];
    this.#wantActive = active === null ? null : (tabs[active]?.path ?? null);
  }

  /** The asset tabs in order with what each shows, then saved tabs not open again yet. The saved active tab wins. */
  tabs(): WindowTabs {
    const { tabs, active } = this.#store.state.get();
    const saved: SavedTab[] = [];
    let activeIndex: number | null = null;
    for (const tab of tabs) {
      const session = tab.kind === "asset" ? this.#store.session(tab.id) : null;
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

  /**
   * Call just before attaching a new channel: keeps every tab to reopen with the asset it showed, releases the asset
   * tabs, forgets their summaries, and returns the new generation.
   */
  detach(): number {
    this.pending(this.tabs());
    const released = new Map<string, ReleasedTab>();
    for (const { path } of this.#unopened) {
      const before = this.#released.get(path);
      if (before) released.set(path, before);
    }
    for (const tab of this.#store.state.get().tabs) {
      if (tab.kind !== "asset") continue;
      const summary = this.#store.session(tab.id)?.state.get().summary;
      if (summary && summary.path !== "") released.set(summary.path, { assetId: tab.id, version: summary.version });
      this.#store.releaseAsset(tab.id);
    }
    this.#released = released;
    this.#store.forgetSummaries();
    return ++this.#generation;
  }

  /**
   * Opens the pending tabs one by one, keeping the rest when the generation changes or the client is not connected,
   * runs `adopt`, then activates the tab `activeInstead` names, or else the saved active tab, also where `shownAs`
   * says another path shows it. Errors from `open` and `adopt` do not reject it: each becomes an alert unless `quiet`
   * drops it, and ends the reopen, without activating a tab, when the generation changed or the connection dropped
   * meanwhile.
   */
  async reopen(generation: number, { open, quiet, adopt, activeInstead, shownAs }: ReopenOptions): Promise<void> {
    for (;;) {
      const tab = this.#unopened[0];
      if (!tab || generation !== this.#generation) break;
      try {
        await open(tab, this.#released.get(tab.path) ?? null);
      } catch (error) {
        if (!this.#reported(generation, error, quiet)) return;
      }
      if (generation !== this.#generation) return;
      this.#unopened = this.#unopened.filter((pending) => pending !== tab);
    }
    if (generation !== this.#generation) return;
    try {
      await adopt?.();
    } catch (error) {
      if (!this.#reported(generation, error, quiet)) return;
    }
    if (generation !== this.#generation) return;
    const wanted = this.#wantActive;
    this.#wantActive = null;
    const instead = activeInstead?.() ?? null;
    const wantedAs = wanted === null ? null : (shownAs?.(wanted) ?? null);
    const { tabs } = this.#store.state.get();
    const active =
      tabs.find((tab) => tab.kind === "asset" && tab.id === instead) ??
      tabs.find((tab) => tab.kind === "asset" && tab.id === wantedAs) ??
      tabs.find((tab) => tab.kind === "asset" && this.#store.session(tab.id)?.state.get().summary.path === wanted);
    if (active) this.#store.activate(active.id);
  }

  /** Alerts the error unless `quiet` drops it; false, with no alert, once the generation or the connection changed. */
  #reported(generation: number, error: unknown, quiet: ReopenOptions["quiet"]): boolean {
    if (generation !== this.#generation || this.#client.connectionState !== "connected") return false;
    if (!quiet?.(error)) this.#store.notify({ message: messageOf(error), kind: "alert" });
    return true;
  }
}
