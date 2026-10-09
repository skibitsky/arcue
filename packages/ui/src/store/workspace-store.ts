import type {
  AssetSummary,
  CommandArgs,
  CommandName,
  CommandOutput,
  ConnectionState,
  CoordinateConvention,
  CoreClient,
  IncomingRequest,
  Settings,
  ViewState,
} from "@arcue/protocol";
import { ArcueError, commands, isCommandName, withTransfer } from "@arcue/protocol";
import type { SessionHost, ToastInput } from "./asset-session";
import { AssetSession, messageOf, NEW_COMMENT_OVERLAY } from "./asset-session";
import { Store } from "./observable";

export type TabEntry = { kind: "asset"; id: string } | { kind: "empty"; id: string };

export interface Toast extends ToastInput {
  id: number;
}

export interface CopySheet {
  round: number;
  prompt: string;
}

export interface WorkspaceState {
  tabs: readonly TabEntry[];
  active: string | null;
  toast: Toast | null;
  copySheet: CopySheet | null;
  connection: ConnectionState;
  /** Null until the core answers, or when it has no settings. */
  settings: Settings | null;
}

export interface WorkspaceStoreOptions {
  client: CoreClient;
  /** Writes text to the clipboard when the core could not. Defaults to the browser's clipboard. */
  writeClipboard?: (text: string) => Promise<void>;
  setTimer?: (delayMs: number, callback: () => void) => () => void;
}

/** The commands with runsIn "view", which the core routes to the window that shows the asset. */
export const VIEW_COMMANDS = [
  "view.showAsset",
  "view.releaseAsset",
  "view.setClip",
  "view.setFrame",
  "view.setPlaying",
  "view.setSpeed",
  "view.setLoop",
  "view.setRange",
  "view.setCamera",
  "view.frame",
  "view.setDisplayMode",
  "view.setSkeleton",
  "view.setPartVisible",
  "view.isolatePart",
  "view.setLod",
  "view.selectComment",
  "view.screenshot",
] as const satisfies readonly CommandName[];

export type ViewCommandName = (typeof VIEW_COMMANDS)[number];

type ViewHandlers = {
  [Name in ViewCommandName]: (args: CommandArgs<Name>) => CommandOutput<Name> | Promise<CommandOutput<Name>>;
};

const TOAST_MS = 3200;

const defaultTimer = (delayMs: number, callback: () => void) => {
  const handle = setTimeout(callback, delayMs);
  return () => clearTimeout(handle);
};

async function browserClipboard(text: string): Promise<void> {
  if (typeof navigator === "undefined" || !navigator.clipboard) throw new Error("No clipboard.");
  await navigator.clipboard.writeText(text);
}

/**
 * The state of one window: its tabs, one `AssetSession` per asset tab, toasts, and the handler for the view commands
 * the core sends to this window.
 */
export class WorkspaceStore {
  readonly client: CoreClient;
  readonly state: Store<WorkspaceState>;
  readonly #sessions = new Map<string, AssetSession>();
  readonly #summaries = new Map<string, AssetSummary>();
  readonly #setTimer: (delayMs: number, callback: () => void) => () => void;
  readonly #writeClipboard: (text: string) => Promise<void>;
  readonly #host: SessionHost;
  #nextEmptyTab = 1;
  #nextToast = 1;
  #cancelToast: (() => void) | null = null;
  #stop: (() => void) | null = null;

  constructor(options: WorkspaceStoreOptions) {
    this.client = options.client;
    this.#setTimer = options.setTimer ?? defaultTimer;
    this.#writeClipboard = options.writeClipboard ?? browserClipboard;
    this.state = new Store<WorkspaceState>({
      tabs: [],
      active: null,
      toast: null,
      copySheet: null,
      connection: options.client.connectionState,
      settings: null,
    });
    this.#host = {
      client: this.client,
      notify: (toast) => this.notify(toast),
      writeClipboard: async (text) => {
        try {
          await this.#writeClipboard(text);
          return true;
        } catch {
          return false;
        }
      },
      showCopySheet: (sheet) => this.state.patch({ copySheet: sheet }),
      setTimer: this.#setTimer,
    };
  }

  /** Subscribes to the core's events. Returns a function that stops listening. */
  start(): () => void {
    if (this.#stop) return this.#stop;
    const { client } = this;
    const unsubscribers = [
      client.subscribe("asset.opened", ({ asset }) => this.#onSummary(asset)),
      client.subscribe("asset.updated", ({ asset }) => this.#onSummary(asset)),
      client.subscribe("asset.closed", ({ assetId }) => {
        this.#removeAsset(assetId);
        this.#summaries.delete(assetId);
      }),
      client.subscribe("review.changed", ({ assetId, review }) => this.#sessions.get(assetId)?.setReview(review)),
      client.onConnectionChange((connection) => this.#onConnection(connection)),
    ];
    this.#stop = () => {
      for (const unsubscribe of unsubscribers) unsubscribe();
      this.#stop = null;
    };
    void this.loadSettings();
    return this.#stop;
  }

  session(assetId: string): AssetSession | null {
    return this.#sessions.get(assetId) ?? null;
  }

  activeSession(): AssetSession | null {
    const { active, tabs } = this.state.get();
    const tab = tabs.find((entry) => entry.id === active);
    return tab?.kind === "asset" ? this.session(tab.id) : null;
  }

  #onConnection(connection: ConnectionState): void {
    const previous = this.state.get().connection;
    this.state.patch({ connection });
    if (connection === "connected" && previous !== "connected") void this.resync();
  }

  /** Reads everything again after the connection to the core comes back, since events may have been missed. */
  async resync(): Promise<void> {
    await this.loadSettings();
    await Promise.all(
      [...this.#sessions.values()].map(async (session) => {
        if (!(await session.refresh())) this.#removeAsset(session.assetId);
      }),
    );
  }

  #onSummary(asset: AssetSummary): void {
    this.#summaries.set(asset.assetId, asset);
    this.#sessions.get(asset.assetId)?.setSummary(asset);
  }

  activate(id: string): void {
    if (this.state.get().tabs.some((tab) => tab.id === id)) this.state.patch({ active: id });
  }

  openNewTab(): string {
    const existing = this.state.get().tabs.find((tab) => tab.kind === "empty");
    if (existing) {
      this.activate(existing.id);
      return existing.id;
    }
    const id = `new-${this.#nextEmptyTab++}`;
    this.state.patch({ tabs: [...this.state.get().tabs, { kind: "empty", id }], active: id });
    return id;
  }

  /** Closes an empty tab, or asks the core to close an asset. */
  async closeTab(id: string): Promise<void> {
    const tab = this.state.get().tabs.find((entry) => entry.id === id);
    if (!tab) return;
    if (tab.kind === "empty") {
      this.#removeTab(id);
      return;
    }
    try {
      await this.client.execute("asset.close", { assetId: id });
      this.#removeAsset(id);
      this.#summaries.delete(id);
    } catch (error) {
      this.notify({ message: messageOf(error), kind: "alert" });
    }
  }

  /**
   * Removes an asset's tab without closing the asset, as when the tab moves to another window, and returns what the tab
   * showed. It reports nothing to the core, so a late report cannot claim the asset back for this window.
   */
  releaseAsset(assetId: string): ViewState | null {
    const session = this.#sessions.get(assetId);
    const state = session?.viewState() ?? null;
    session?.dispose();
    this.#sessions.delete(assetId);
    this.#removeTab(assetId);
    return state;
  }

  moveTab(id: string, toIndex: number): void {
    const tabs = [...this.state.get().tabs];
    const from = tabs.findIndex((tab) => tab.id === id);
    const [tab] = from === -1 ? [] : tabs.splice(from, 1);
    if (!tab) return;
    tabs.splice(Math.max(0, Math.min(tabs.length, toIndex)), 0, tab);
    this.state.patch({ tabs });
  }

  #removeAsset(assetId: string): void {
    const session = this.#sessions.get(assetId);
    if (session) {
      void session.reportState();
      session.dispose();
      this.#sessions.delete(assetId);
    }
    this.#removeTab(assetId);
  }

  #removeTab(id: string): void {
    const { tabs, active } = this.state.get();
    const index = tabs.findIndex((tab) => tab.id === id);
    if (index === -1) return;
    const remaining = tabs.filter((tab) => tab.id !== id);
    const neighbor = remaining[Math.min(index, remaining.length - 1)]?.id ?? null;
    this.state.patch({ tabs: remaining, active: active === id ? neighbor : active });
  }

  async openPath(path: string): Promise<void> {
    try {
      await this.client.execute("asset.open", { path });
    } catch (error) {
      this.notify({ message: messageOf(error), kind: "alert" });
    }
  }

  /** Adds a tab for the asset, or focuses its tab, at a clip and frame if given. */
  showAsset(args: CommandArgs<"view.showAsset">): void {
    const { assetId } = args;
    let session = this.#sessions.get(assetId);
    if (!session) {
      const summary = this.#summaries.get(assetId) ?? {
        assetId,
        path: "",
        name: "",
        status: "loading" as const,
        version: null,
        error: null,
      };
      session = new AssetSession(summary, this.#host);
      this.#sessions.set(assetId, session);
      const { tabs, active } = this.state.get();
      const activeTab = tabs.find((tab) => tab.id === active);
      const entry: TabEntry = { kind: "asset", id: assetId };
      const next =
        activeTab?.kind === "empty" ? tabs.map((tab) => (tab.id === activeTab.id ? entry : tab)) : [...tabs, entry];
      this.state.patch({ tabs: next });
      void session.refresh();
    }
    session.show({
      ...(args.clip !== undefined ? { clip: args.clip } : {}),
      ...(args.frame !== undefined ? { frame: args.frame } : {}),
    });
    this.state.patch({ active: assetId });
  }

  /**
   * Answers a request the core sends to this window. Pass it as the peer's `handleRequest`: it runs the commands with
   * runsIn "view" and refuses everything else.
   */
  handleRequest = async (request: IncomingRequest): Promise<unknown> => {
    const { name } = request;
    if (request.kind !== "command" || !isCommandName(name) || commands[name].runsIn !== "view") {
      throw new ArcueError("unknown-command", `This window does not run "${name}".`);
    }
    const parsed = commands[name].input.safeParse(request.input);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((issue) => ({
        path: issue.path.filter((part): part is string | number => typeof part !== "symbol"),
        message: issue.message,
      }));
      throw new ArcueError("invalid-input", `Invalid input for "${name}".`, { issues });
    }
    return this.runViewCommand(name as ViewCommandName, parsed.data as CommandArgs<ViewCommandName>);
  };

  runViewCommand<Name extends ViewCommandName>(name: Name, args: CommandArgs<Name>): Promise<CommandOutput<Name>> {
    const handler = this.#viewHandlers[name] as (
      args: CommandArgs<Name>,
    ) => CommandOutput<Name> | Promise<CommandOutput<Name>>;
    return Promise.resolve(handler(args));
  }

  #require(assetId: string): AssetSession {
    const session = this.#sessions.get(assetId);
    if (!session) throw new ArcueError("not-found", `Asset ${assetId} is not open in this window.`);
    return session;
  }

  #requireViewport(assetId: string) {
    const viewport = this.#require(assetId).viewport;
    if (!viewport) throw new ArcueError("unavailable", `The 3D view of asset ${assetId} is not ready.`);
    return viewport;
  }

  readonly #viewHandlers: ViewHandlers = {
    "view.showAsset": (args) => this.showAsset(args),
    "view.releaseAsset": ({ assetId }) => this.releaseAsset(assetId),
    "view.setClip": ({ assetId, clip }) => {
      const session = this.#require(assetId);
      if (clip !== null && !session.clipInfo(clip)) throw new ArcueError("not-found", `No clip named "${clip}".`);
      session.setClip(clip);
    },
    "view.setFrame": ({ assetId, frame }) => this.#require(assetId).setFrame(frame),
    "view.setPlaying": ({ assetId, playing }) => this.#require(assetId).setPlaying(playing),
    "view.setSpeed": ({ assetId, speed }) => this.#require(assetId).setSpeed(speed),
    "view.setLoop": ({ assetId, loop }) => this.#require(assetId).setLoop(loop),
    "view.setRange": ({ assetId, range }) => this.#require(assetId).setRange(range),
    "view.setCamera": ({ assetId, camera, animate }) => this.#require(assetId).setCamera(camera, animate),
    "view.frame": ({ assetId, commentId }) => this.#require(assetId).frameComment(commentId),
    "view.setDisplayMode": ({ assetId, mode }) => this.#require(assetId).setDisplayMode(mode),
    "view.setSkeleton": ({ assetId, visible }) => this.#require(assetId).setSkeleton(visible),
    "view.setPartVisible": ({ assetId, part, visible }) => this.#require(assetId).setPartVisible(part, visible),
    "view.isolatePart": ({ assetId, part }) => this.#require(assetId).isolatePart(part),
    "view.setLod": ({ assetId, level }) => this.#require(assetId).setLod(level),
    "view.selectComment": ({ assetId, commentId }) => {
      const session = this.#require(assetId);
      if (commentId === null && session.hasUnsavedBox()) {
        throw new ArcueError("conflict", "The comment box has unsaved text.");
      }
      const result = session.selectComment(commentId);
      if (result === "not-found") throw new ArcueError("not-found", `No comment ${commentId}.`);
      if (result === "refused") throw new ArcueError("conflict", "The comment box has unsaved text.");
    },
    "view.screenshot": async ({ assetId, width, height, time, camera, drawComments }) => {
      const session = this.#require(assetId);
      const viewport = this.#requireViewport(assetId);
      const overlays = drawComments
        ? session
            .overlays()
            .filter((overlay) => overlay.id !== NEW_COMMENT_OVERLAY)
            .map((overlay) => ({ ...overlay, number: null, selected: false }))
        : [];
      const png = await viewport.screenshot({
        width,
        height,
        overlays,
        ...(time ? { time } : {}),
        ...(camera ? { camera } : {}),
      });
      return withTransfer({ png }, [png.buffer]);
    },
  };

  async loadSettings(): Promise<void> {
    try {
      const settings = await this.client.query("settings.get", {});
      this.state.patch({ settings });
    } catch {
      this.state.patch({ settings: null });
    }
  }

  async setCoordinates(coordinates: CoordinateConvention): Promise<void> {
    const previous = this.state.get().settings;
    if (!previous || previous.coordinates === coordinates) return;
    this.state.patch({ settings: { ...previous, coordinates } });
    try {
      this.state.patch({ settings: await this.client.execute("settings.set", { coordinates }) });
    } catch (error) {
      this.state.patch({ settings: previous });
      this.notify({ message: messageOf(error), kind: "alert" });
    }
  }

  notify(toast: ToastInput): void {
    this.#cancelToast?.();
    const id = this.#nextToast++;
    this.state.patch({ toast: { ...toast, id } });
    this.#cancelToast = this.#setTimer(TOAST_MS, () => {
      if (this.state.get().toast?.id === id) this.state.patch({ toast: null });
    });
  }

  closeCopySheet(): void {
    this.state.patch({ copySheet: null });
  }

  /** Tells the core this window has focus, so new assets open here. */
  reportFocus(): void {
    this.client.execute("view.reportFocus", {}).catch(() => {});
  }

  dispose(): void {
    this.#stop?.();
    this.#cancelToast?.();
    for (const session of this.#sessions.values()) session.dispose();
    this.#sessions.clear();
  }
}

export function createWorkspaceStore(options: WorkspaceStoreOptions): WorkspaceStore {
  return new WorkspaceStore(options);
}
