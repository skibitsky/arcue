import type { CoreClient, SavedTab, WindowTabs } from "@arcue/protocol";
import { messageOf } from "./asset-session";
import type { WorkspaceStore } from "./workspace-store";

export interface ReopenOptions {
  /** Opens one saved tab in the current core. */
  open(tab: SavedTab): Promise<void>;
  /** Errors to drop without a toast, such as a model another session's view now has. */
  quiet?: (error: unknown) => boolean;
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
   * Call just before attaching a new channel: keeps every tab to reopen, releases the asset tabs, forgets their
   * summaries, and returns the new generation.
   */
  detach(): number {
    this.pending(this.tabs());
    for (const tab of this.#store.state.get().tabs) {
      if (tab.kind === "asset") this.#store.releaseAsset(tab.id);
    }
    this.#store.forgetSummaries();
    return ++this.#generation;
  }

  /**
   * Opens the pending tabs one by one, keeping the rest when the generation changes or the client is not connected,
   * then activates the saved active tab.
   */
  async reopen(generation: number, { open, quiet }: ReopenOptions): Promise<void> {
    for (;;) {
      const tab = this.#unopened[0];
      if (!tab || generation !== this.#generation) break;
      try {
        await open(tab);
      } catch (error) {
        if (generation !== this.#generation || this.#client.connectionState !== "connected") return;
        if (!quiet?.(error)) this.#store.notify({ message: messageOf(error), kind: "alert" });
      }
      if (generation !== this.#generation) return;
      this.#unopened = this.#unopened.filter((pending) => pending !== tab);
    }
    if (generation !== this.#generation) return;
    const wanted = this.#wantActive;
    this.#wantActive = null;
    const active = this.#store.state
      .get()
      .tabs.find((tab) => tab.kind === "asset" && this.#store.session(tab.id)?.state.get().summary.path === wanted);
    if (active) this.#store.activate(active.id);
  }
}
