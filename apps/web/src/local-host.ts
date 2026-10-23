import type { AssetSummary, CommandArgs, FramedChannel, IncomingRequest, SetTimer, WindowTabs } from "@arcue/protocol";
import {
  ArcueError,
  binaryFrameCodec,
  framedEndpoint,
  messageChannel,
  ReconnectingClient,
  SERVE_STOPPED_CLOSE_CODE,
  viewNameSchema,
  windowTabsSchema,
} from "@arcue/protocol";
import type { Readable, ReleasedTab, WorkspaceStore } from "@arcue/ui";
import { createWorkspaceStore, Store, TabRestore } from "@arcue/ui";
import { webSocketStream } from "./core-socket";
import type { ServedPage } from "./served-page";
import { PROBE_TIMEOUT_MS } from "./served-page";

export interface LocalHostOptions {
  /** Opens a new socket to the core on the server the page came from. */
  openSocket(): WebSocket;
  /** The agent session's view the page's address names, or null for none. A name that is not valid never connects. */
  view: string | null;
  /** Keeps the tabs across a reload; null where the browser refuses storage. */
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null;
  /**
   * The owner the served page names, which tells this Arcue in the browser from another at the same address, or null
   * when it names none. The page never opens tabs it kept for another owner.
   */
  owner?: string | null;
  setTimer?: SetTimer;
  hasFocus?: () => boolean;
  /**
   * Reads "/" again. It is changed only when it carries the arcue-page marker and names another module script, and
   * elsewhere when it names another owner than the page's.
   */
  probe?: () => Promise<ServedPage>;
  reload?: () => void;
}

/** What the page shows about its address beside the store's connection state. */
export interface HostStatus {
  /** Another Arcue in the browser runs at the page's address, so the page connects to none until its own does. */
  elsewhere: boolean;
}

/** A page's tabs as it keeps them in its storage, with the owner of the page that kept them when it named one. */
interface SavedTabs {
  version: 1;
  owner?: string;
  tabs: WindowTabs;
}

/** One socket the page opened, and whether the client took it. */
interface Attempt {
  socket: WebSocket;
  attached: boolean;
}

/** The assets the core asked the page to show, in order, since the page attached for a reopen of its tabs. */
interface Shows {
  ids: string[];
}

const FIRST_RETRY_MS = 250;
const MAX_RETRY_MS = 5000;
const ATTEMPT_TIMEOUT_MS = 10_000;
const PROBE_AFTER_FAILURES = 3;
const SAVE_DELAY_MS = 300;
const SAVE_INTERVAL_MS = 5000;
const RELOADED_FOR = "arcue.reloadedFor";
const PAGE_STOPPED = "Arcue in the browser stopped. This page reconnects once it runs again.";
const ELSEWHERE = "Another Arcue in the browser runs at this address now, so this page doesn't connect to it.";
const INVALID_VIEW = "This page's address names a view that isn't valid, so it doesn't connect.";

const defaultTimer: SetTimer = (delayMs, callback) => {
  const handle = setTimeout(callback, delayMs);
  return () => clearTimeout(handle);
};

/**
 * The page `arcue serve` serves: a window of the core that runs on this computer's files, connected over a WebSocket to
 * the server it came from. The core reads models where they are, so the page opens none itself.
 *
 * Whenever its socket closes, as when Arcue in the browser stops and starts again, the page connects again and opens its
 * tabs again in order, then shows the other assets the core holds for its view. It keeps its tabs in the page's
 * storage, so a reload opens them too, unless another Arcue in the browser serves the page then, and reloads once into
 * a new build of itself when the server serves one.
 */
export class LocalHost {
  /** The same client for the page's life, across its connections. */
  readonly client: ReconnectingClient;
  readonly store: WorkspaceStore;
  readonly #status = new Store<HostStatus>({ elsewhere: false });
  readonly #options: LocalHostOptions;
  readonly #setTimer: SetTimer;
  readonly #restore: TabRestore;
  /** The view the page shows, null for none, or undefined when its address names a view that is not valid. */
  readonly #view: string | null | undefined;
  readonly #stops: (() => void)[] = [];
  #started = false;
  #disposed = false;
  #reloading = false;
  /** The socket that is connecting or in use. */
  #socket: WebSocket | null = null;
  #cancelRetry: (() => void) | null = null;
  #cancelSave: (() => void) | null = null;
  #failures = 0;
  #attachedBefore = false;
  #toldStopped = false;
  #reopening: Promise<void> = Promise.resolve();
  /** The shows of the reopen that runs or waits to run, until it ends. */
  #shows: Shows | null = null;

  constructor(options: LocalHostOptions) {
    this.#options = options;
    this.#setTimer = options.setTimer ?? defaultTimer;
    const view = options.view === null ? null : viewNameSchema.safeParse(options.view);
    this.#view = view === null ? null : view.success ? view.data : undefined;
    this.client = new ReconnectingClient({
      handleRequest: (request) => {
        this.#noteShow(request);
        return this.store.handleRequest(request);
      },
      onLost: () => {
        this.#socket = null;
        this.#retryLater();
      },
      onListenerError: (error) => console.error(error),
    });
    this.store = createWorkspaceStore({ client: this.client, setTimer: this.#setTimer });
    this.#restore = new TabRestore(this.store, this.client);
  }

  get status(): Readable<HostStatus> {
    return this.#status;
  }

  /** The last probe found the page of another Arcue in the browser at the page's address. */
  get #elsewhere(): boolean {
    return this.#status.get().elsewhere;
  }

  /** Starts the store, takes the tabs the page kept before a reload, and connects. */
  start(): void {
    if (this.#started || this.#disposed) return;
    this.#started = true;
    this.store.start();
    if (this.#view === undefined) {
      this.store.notify({ message: INVALID_VIEW, kind: "alert" });
      return;
    }
    const saved = this.#savedTabs();
    if (saved) this.#restore.pending(saved);
    this.#stops.push(
      this.store.state.subscribe(() => this.#scheduleSave()),
      this.#saveEvery(),
    );
    this.#connect();
  }

  /** Connects at once while the page waits to try again, as when the page comes back to the foreground. */
  retryNow(): void {
    if (!this.#canConnect() || this.#socket !== null || this.client.connectionState !== "reconnecting") return;
    this.#connect();
  }

  /** Keeps the tabs in the page's storage, with those not open again yet, so a reload opens them again. */
  saveTabs(): void {
    const storage = this.#options.storage;
    if (!storage || !this.#started || this.#disposed || this.#view === undefined) return;
    const owner = this.#options.owner ?? null;
    const saved: SavedTabs = { version: 1, ...(owner === null ? {} : { owner }), tabs: this.#restore.tabs() };
    try {
      storage.setItem(this.#tabsKey(), JSON.stringify(saved));
    } catch {}
  }

  dispose(): void {
    this.#disposed = true;
    for (const stop of this.#stops.splice(0)) stop();
    this.#cancelRetry?.();
    this.#cancelSave?.();
    const socket = this.#socket;
    this.#socket = null;
    socket?.close();
    this.client.dispose();
    this.store.dispose();
  }

  #canConnect(): boolean {
    return this.#started && !this.#disposed && !this.#reloading && this.#view !== undefined;
  }

  #tabsKey(): string {
    return `arcue.tabs:${this.#view ?? ""}`;
  }

  #savedTabs(): WindowTabs | null {
    try {
      const text = this.#options.storage?.getItem(this.#tabsKey()) ?? null;
      if (text === null) return null;
      const saved: unknown = JSON.parse(text);
      if (typeof saved !== "object" || saved === null || !("version" in saved) || saved.version !== 1) return null;
      const owner = this.#options.owner ?? null;
      if (owner !== null && "owner" in saved && typeof saved.owner === "string" && saved.owner !== owner) return null;
      const tabs = windowTabsSchema.safeParse("tabs" in saved ? saved.tabs : null);
      return tabs.success ? tabs.data : null;
    } catch {
      return null;
    }
  }

  /**
   * Opens one socket, which the client takes once it opens. One that closes first, or still connects when the attempt
   * times out, makes the page try again later.
   */
  #connect(): void {
    this.#cancelRetry?.();
    this.#cancelRetry = null;
    if (this.#elsewhere) {
      this.#retryLater();
      return;
    }
    let socket: WebSocket;
    try {
      socket = this.#options.openSocket();
    } catch {
      this.#retryLater();
      return;
    }
    this.#socket = socket;
    const attempt: Attempt = { socket, attached: false };
    const cancelTimeout = this.#setTimer(ATTEMPT_TIMEOUT_MS, () => {
      if (this.#socket !== socket) return;
      this.#socket = null;
      socket.close();
      this.#retryLater();
    });
    socket.addEventListener("close", (event) => {
      cancelTimeout();
      if (this.#socket !== socket) return;
      this.#socket = null;
      if (event.code === SERVE_STOPPED_CLOSE_CODE && !this.#toldStopped) {
        this.#toldStopped = true;
        this.store.notify({ message: PAGE_STOPPED, kind: "info" });
      }
      if (!attempt.attached) this.#retryLater();
    });
    const channel = messageChannel(webSocketStream(socket), binaryFrameCodec);
    socket.addEventListener(
      "open",
      () => {
        cancelTimeout();
        void this.#opened(attempt, channel);
      },
      { once: true },
    );
  }

  /**
   * After an earlier connection, the server may serve another build of the page now, which the page reloads into once,
   * or be another Arcue in the browser, which the page never attaches to. Otherwise the client takes the socket and the
   * tabs open again.
   */
  async #opened(attempt: Attempt, channel: FramedChannel): Promise<void> {
    if (this.#attachedBefore) {
      const page = await this.#probe();
      if (this.#socket !== attempt.socket || !this.#canConnect()) return;
      if (page === "elsewhere") {
        this.#foundElsewhere();
        attempt.socket.close();
        return;
      }
      if (typeof page === "object" && this.#reloadOnce(page.changed)) return;
    }
    this.#failures = 0;
    const generation = this.#restore.detach();
    const shows: Shows = { ids: [] };
    this.#shows = shows;
    this.client.attach({ ...framedEndpoint(channel), close: () => attempt.socket.close() });
    attempt.attached = true;
    this.#attachedBefore = true;
    this.#toldStopped = false;
    if (this.#options.hasFocus?.()) this.store.reportFocus();
    this.#reopening = this.#reopening
      .then(() => this.#reopenAll(generation, shows))
      .catch((error: unknown) => console.error(error))
      .finally(() => {
        if (this.#shows === shows) this.#shows = null;
      });
  }

  #noteShow({ kind, name, input }: IncomingRequest): void {
    if (!this.#shows || kind !== "command" || name !== "view.showAsset") return;
    const assetId = typeof input === "object" && input !== null && "assetId" in input ? input.assetId : null;
    if (typeof assetId === "string") this.#shows.ids.push(assetId);
  }

  /**
   * Opens the tabs again in order. A model the core still has moves to this page as the core keeps it, such as at the
   * clip and frame an agent opened it at, also from a page of the view that adopted it just before, and from the view
   * the tab kept when the core keeps none; any other opens from its path, or, when its path is gone, moves in its place
   * the model it showed, which the core kept with the same version under a new name. Then the page adopts the other
   * assets the core holds for its view, which another page of the view that lost its connection too may take back.
   *
   * The model an agent opened last ends up active, and otherwise the saved active tab: one the core showed in the page
   * while it reopened its tabs, which goes after them unless it is one of them, or else, of the models the core held
   * for an agent's opens while the page was away, the one opened last.
   */
  async #reopenAll(generation: number, shows: Shows): Promise<void> {
    let listed: AssetSummary[];
    try {
      listed = (await this.client.query("asset.list", {})).assets;
    } catch {
      return;
    }
    const known = new Map(listed.map((asset) => [asset.path, asset.assetId]));
    const moved = new Set<string>();
    const restored = new Set<string>();
    /** The assets that show saved tabs at other paths than the tabs', by the tabs' paths. */
    const renamed = new Map<string, string>();
    /** The asset a saved tab showed, which the core now holds at another path with the version the tab showed. */
    const renamedTo = (path: string, released: ReleasedTab | null) => {
      if (released === null || released.version === null) return null;
      const now = listed.find((asset) => asset.assetId === released.assetId);
      const same = now && now.path !== path && now.version === released.version && !moved.has(now.assetId);
      return same ? now.assetId : null;
    };
    let held: { assetId: string; order: number } | null = null;
    const noteHeld = (assetId: string, result: unknown) => {
      const order = heldOrder(result);
      if (order !== null && (held === null || order >= held.order)) held = { assetId, order };
    };
    /** Runs one of the reopen's own calls, which shows at most the asset it names, and drops that show from `shows`. */
    const own = async <Result>(call: () => Promise<Result>, assetIdOf: (result: Result) => string) => {
      const from = shows.ids.length;
      const result = await call();
      const at = shows.ids.indexOf(assetIdOf(result), from);
      if (at >= 0) shows.ids.splice(at, 1);
      return result;
    };
    const move = async (assetId: string, input: Omit<CommandArgs<"view.moveAsset">, "assetId">) => {
      moved.add(assetId);
      const result = await own(
        () => this.client.execute("view.moveAsset", { assetId, ...input }),
        () => assetId,
      );
      noteHeld(assetId, result);
    };
    const agentOpened = () =>
      shows.ids.filter((assetId, at) => shows.ids.lastIndexOf(assetId) === at && this.store.session(assetId) !== null);
    await this.#restore.reopen(generation, {
      open: async ({ path, view }, released) => {
        const kept = view ? { viewState: view } : {};
        const assetId = known.get(path);
        if (assetId !== undefined) {
          restored.add(assetId);
          await move(assetId, { unlessShown: true, ...kept });
          return;
        }
        try {
          const opened = await own(
            () => this.client.execute("asset.open", { path, ...kept }),
            (result) => result.assetId,
          );
          restored.add(opened.assetId);
        } catch (error) {
          const followed = isNotFound(error) ? renamedTo(path, released) : null;
          if (followed === null) throw error;
          restored.add(followed);
          renamed.set(path, followed);
          await move(followed, { unlessShown: true, ...kept });
        }
      },
      quiet: isConflict,
      adopt: async () => {
        for (const assetId of known.values()) {
          if (moved.has(assetId) || generation !== this.#restore.generation) continue;
          try {
            await move(assetId, { adopt: true });
          } catch (error) {
            if (isConflict(error) || generation !== this.#restore.generation) continue;
            if (this.client.connectionState !== "connected") return;
            this.store.notify({ message: error instanceof Error ? error.message : String(error), kind: "alert" });
          }
        }
        for (const assetId of agentOpened()) {
          if (!restored.has(assetId)) this.store.moveTab(assetId, Number.POSITIVE_INFINITY);
        }
      },
      activeInstead: () => agentOpened().at(-1) ?? held?.assetId ?? null,
      shownAs: (path) => renamed.get(path) ?? null,
    });
    if (generation === this.#restore.generation) this.saveTabs();
  }

  /**
   * Tries again after a delay that doubles with each failure, and from the third failure, or while another Arcue in the
   * browser has the address, first probes the page.
   */
  #retryLater(): void {
    if (!this.#canConnect() || this.#cancelRetry !== null) return;
    this.#failures++;
    const backoffMs = Math.min(MAX_RETRY_MS, FIRST_RETRY_MS * 2 ** (this.#failures - 1));
    const delayMs = backoffMs * (0.8 + Math.random() * 0.4);
    if ((this.#failures < PROBE_AFTER_FAILURES && !this.#elsewhere) || !this.#options.probe) {
      this.#schedule(delayMs);
      return;
    }
    void this.#probe().then((page) => {
      if (page === "elsewhere") this.#foundElsewhere();
      else this.#status.patch({ elsewhere: false });
      if (typeof page === "object" && this.#socket === null && this.#reloadOnce(page.changed)) return;
      this.#schedule(delayMs);
    });
  }

  /** Says once that another Arcue in the browser has the address, and connects to none until a probe finds its own. */
  #foundElsewhere(): void {
    if (!this.#elsewhere) this.store.notify({ message: ELSEWHERE, kind: "info" });
    this.#status.patch({ elsewhere: true });
  }

  #schedule(delayMs: number): void {
    if (!this.#canConnect() || this.#socket !== null || this.#cancelRetry !== null) return;
    this.#cancelRetry = this.#setTimer(delayMs, () => {
      this.#cancelRetry = null;
      if (this.#canConnect() && this.#socket === null) this.#connect();
    });
  }

  /** What the server serves at "/" now; a probe that has not answered after `PROBE_TIMEOUT_MS` counts as "down". */
  async #probe(): Promise<ServedPage> {
    const { probe } = this.#options;
    if (!probe) return "same";
    let cancel = () => {};
    const timedOut = new Promise<ServedPage>((resolve) => {
      cancel = this.#setTimer(PROBE_TIMEOUT_MS, () => resolve("down"));
    });
    try {
      return await Promise.race([probe(), timedOut]);
    } catch {
      return "down";
    } finally {
      cancel();
    }
  }

  /**
   * Reloads into the build of the page the server serves now, keeping the tabs, unless the page already reloaded for
   * that build or has no storage to remember it in. Returns whether it reloads.
   */
  #reloadOnce(script: string): boolean {
    if (!this.#canConnect()) return false;
    this.saveTabs();
    const { storage, reload } = this.#options;
    if (!storage || !reload) return false;
    try {
      if (storage.getItem(RELOADED_FOR) === script) return false;
      storage.setItem(RELOADED_FOR, script);
    } catch {
      return false;
    }
    this.#reloading = true;
    this.#cancelRetry?.();
    this.#cancelRetry = null;
    reload();
    return true;
  }

  #scheduleSave(): void {
    if (this.#cancelSave) return;
    this.#cancelSave = this.#setTimer(SAVE_DELAY_MS, () => {
      this.#cancelSave = null;
      this.saveTabs();
    });
  }

  /** Camera and frame changes do not touch the tab list, so the tabs are also kept every few seconds. */
  #saveEvery(): () => void {
    let cancel = () => {};
    const loop = () => {
      this.saveTabs();
      cancel = this.#setTimer(SAVE_INTERVAL_MS, loop);
    };
    cancel = this.#setTimer(SAVE_INTERVAL_MS, loop);
    return () => cancel();
  }
}

/** The window and document a page's host follows. */
export interface PageEvents {
  window: Pick<EventTarget, "addEventListener" | "removeEventListener">;
  document: Pick<EventTarget, "addEventListener" | "removeEventListener"> & Pick<Document, "visibilityState">;
}

/**
 * Connects at once when the page comes back, since a browser slows the timers of a page in the background and freezes
 * some, and keeps the tabs when the page is hidden or goes away. Returns a function that stops following.
 */
export function followPage(host: LocalHost, { window, document }: PageEvents): () => void {
  const retry = () => host.retryNow();
  const save = () => host.saveTabs();
  const visibility = () => (document.visibilityState === "visible" ? host.retryNow() : host.saveTabs());
  const comeBack = ["focus", "online", "pageshow"] as const;
  for (const name of comeBack) window.addEventListener(name, retry);
  window.addEventListener("pagehide", save);
  document.addEventListener("resume", retry);
  document.addEventListener("visibilitychange", visibility);
  return () => {
    for (const name of comeBack) window.removeEventListener(name, retry);
    window.removeEventListener("pagehide", save);
    document.removeEventListener("resume", retry);
    document.removeEventListener("visibilitychange", visibility);
  };
}

function isConflict(error: unknown): boolean {
  return error instanceof ArcueError && error.code === "conflict";
}

function isNotFound(error: unknown): boolean {
  return error instanceof ArcueError && error.code === "not-found";
}

/**
 * When a move showed an asset the core held for the page's view, the place of the open it held the asset for among
 * the core's holds, or 0 from a core from before it said so; otherwise null, also from a core from before it said
 * whether it held the asset, which answers nothing.
 */
function heldOrder(result: unknown): number | null {
  if (typeof result !== "object" || result === null || !("held" in result) || result.held !== true) return null;
  return "heldOrder" in result && typeof result.heldOrder === "number" ? result.heldOrder : 0;
}
