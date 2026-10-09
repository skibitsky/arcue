import { IMAGE_FILE_EXTENSIONS } from "@arcue/protocol";
import type { IpcMainEvent, IpcMainInvokeEvent, Rectangle, WebContents } from "electron";
import { BrowserWindow, dialog, ipcMain, screen, webContents } from "electron";
import type { FileKind, MenuCommand, TextEdit, WindowInit, WindowTabs } from "../shared/ipc";
import { channels, fileKindSchema, tabDragEndSchema, textEditSchema, windowTabsSchema } from "../shared/ipc";
import type { Log } from "../shared/log";
import { ASSET_EXTENSIONS } from "./args";
import type { CoreHost } from "./core-host";
import { isAppUrl } from "./security";
import type { Bounds, SavedWindow, Session } from "./session";
import { fitBounds } from "./session";

export interface WindowManagerOptions {
  core: CoreHost;
  log: Log;
  preload: string;
  rendererUrl: string;
  devServer: string | null;
  /** Called whenever what a session restore needs changed: tabs, bounds, or the set of windows. */
  onSessionChange(): void;
}

interface CreateOptions {
  bounds?: Partial<Bounds> | undefined;
  maximized?: boolean;
  restore?: WindowTabs | null;
  adopt?: string | null;
}

const DEFAULT_SIZE = { width: 1440, height: 900 };
const MODEL_FILTER = { name: "Models", extensions: ["fbx"] };
const IMAGE_FILTER = { name: "Images", extensions: IMAGE_FILE_EXTENSIONS.map((extension) => extension.slice(1)) };
const CLOSE_TIMEOUT_MS = 5000;
const CASCADE = 28;

const emptyTabs = (): WindowTabs => ({ tabs: [], active: null });

class AppWindow {
  readonly window: BrowserWindow;
  readonly id: number;
  tabs: WindowTabs;
  /** What `init` returns the first time; after a reload the window restores its last reported tabs. */
  firstInit: WindowInit;
  initialized = false;
  ready = false;
  pendingOpens: string[] = [];
  pendingAdopts: string[] = [];
  closeAllowed = false;
  closing: Promise<void> | null = null;
  /** What the window showed just before it closed, since a destroyed window has no bounds. */
  final: SavedWindow | null = null;
  finishClose: (() => void) | null = null;
  connections = 0;

  constructor(window: BrowserWindow, init: WindowInit) {
    this.window = window;
    this.id = window.webContents.id;
    this.firstInit = init;
    this.tabs = init.restore ?? emptyTabs();
  }

  get contents(): WebContents {
    return this.window.webContents;
  }

  saved(): SavedWindow {
    return { bounds: this.window.getNormalBounds(), maximized: this.window.isMaximized(), tabs: this.tabs };
  }
}

/**
 * The app's windows: creating and restoring them, routing opens to the window used last, tearing tabs off into new
 * windows, and the close handshake that lets a window close its assets in the core before it goes.
 */
export class WindowManager {
  readonly #options: WindowManagerOptions;
  readonly #windows = new Map<number, AppWindow>();
  #lastUsed: number | null = null;
  #lastClosed: SavedWindow | null = null;
  #quitting = false;

  constructor(options: WindowManagerOptions) {
    this.#options = options;
    this.#registerIpc();
  }

  get count(): number {
    return this.#windows.size;
  }

  create(options: CreateOptions = {}): AppWindow {
    const { log } = this.#options;
    const cascadeFrom = this.#lastUsedWindow()?.window.getBounds();
    const bounds = options.bounds ?? (cascadeFrom ? cascade(cascadeFrom) : DEFAULT_SIZE);
    const mac = process.platform === "darwin";
    const window = new BrowserWindow({
      ...DEFAULT_SIZE,
      ...bounds,
      minWidth: 720,
      minHeight: 480,
      show: false,
      title: "Arcue",
      ...(mac ? { titleBarStyle: "hidden" as const, trafficLightPosition: { x: 14, y: 14 } } : {}),
      webPreferences: {
        preload: this.#options.preload,
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        nodeIntegrationInWorker: false,
        webSecurity: true,
        allowRunningInsecureContent: false,
        navigateOnDragDrop: false,
        spellcheck: false,
      },
    });
    const init: WindowInit = {
      platform: process.platform,
      restore: options.restore ?? null,
      adopt: options.adopt ?? null,
    };
    const entry = new AppWindow(window, init);
    this.#windows.set(entry.id, entry);
    this.#lastUsed = entry.id;
    if (options.maximized) window.maximize();
    window.once("ready-to-show", () => window.show());
    window.on("focus", () => {
      this.#lastUsed = entry.id;
    });
    window.on("close", (event) => {
      if (entry.closeAllowed) {
        entry.final = entry.saved();
        return;
      }
      event.preventDefault();
      void this.#closeAssets(entry).then(() => {
        entry.closeAllowed = true;
        window.close();
      });
    });
    window.on("closed", () => this.#onClosed(entry));
    const boundsChanged = () => this.#options.onSessionChange();
    window.on("resized", boundsChanged);
    window.on("moved", boundsChanged);
    window.on("maximize", boundsChanged);
    window.on("unmaximize", boundsChanged);
    entry.contents.on("render-process-gone", (_event, details) => {
      log.error(`A window's renderer is gone (${details.reason}); reloading it`);
      entry.ready = false;
      if (details.reason !== "clean-exit" && !window.isDestroyed()) window.reload();
    });
    entry.contents.on("did-start-loading", () => {
      entry.ready = false;
    });
    void window
      .loadURL(this.#options.rendererUrl)
      .catch((error: unknown) => log.error("A window failed to load", error));
    this.#options.onSessionChange();
    return entry;
  }

  /** Restores saved windows, or opens one empty window. */
  restore(session: Session): void {
    const areas = screen.getAllDisplays().map((display) => display.workArea);
    for (const saved of session.windows) {
      this.create({ bounds: fitBounds(saved.bounds, areas), maximized: saved.maximized, restore: saved.tabs });
    }
    if (this.#windows.size === 0) this.create();
  }

  /** Opens files in the window used last, opening a window first when none is open. */
  openPaths(paths: readonly string[]): void {
    if (paths.length === 0) return;
    const target = this.#lastUsedWindow() ?? this.create();
    target.pendingOpens.push(...paths);
    this.#flush(target);
    reveal(target.window);
  }

  /** Opens a window when none is open, for an open that arrives from the command line. */
  ensureWindow(): void {
    if (!this.#lastUsedWindow()) this.create();
  }

  /** Brings the window used last to the front, opening one when none is open. */
  reveal(): void {
    reveal((this.#lastUsedWindow() ?? this.create()).window);
  }

  /**
   * Edit > Undo or Redo. Contents that are not an app window, such as developer tools, get their native edit; an app
   * window decides between its text field's edit and the visible tab's review.
   */
  editHistory(edit: TextEdit): void {
    const focused = webContents.getFocusedWebContents();
    if (focused && !this.#windows.has(focused.id)) {
      if (edit === "undo") focused.undo();
      else focused.redo();
      return;
    }
    this.sendMenuCommand(edit);
  }

  sendMenuCommand(command: MenuCommand): void {
    const target = this.#focusedWindow();
    if (target) target.contents.send(channels.menuCommand, command);
    else if (command === "new-tab") this.create();
  }

  async showOpenDialog(): Promise<void> {
    const paths = await this.#pickFiles(BrowserWindow.getFocusedWindow());
    this.openPaths(paths);
  }

  /** Tells every window that the core stopped, so each shows "reconnecting" and asks for a new port. */
  coreLost(): void {
    for (const entry of this.#windows.values()) {
      if (!entry.contents.isDestroyed()) entry.contents.send(channels.coreLost);
    }
  }

  /** Asks every window to close its assets, so their review writes finish, before the app quits. */
  async prepareQuit(): Promise<void> {
    this.#quitting = true;
    await Promise.all([...this.#windows.values()].map((entry) => this.#closeAssets(entry)));
    for (const entry of this.#windows.values()) entry.closeAllowed = true;
  }

  session(): Session {
    const open = [...this.#windows.values()].map((entry) => entry.saved());
    return { version: 1, windows: open.length > 0 ? open : this.#lastClosed ? [this.#lastClosed] : [] };
  }

  #lastUsedWindow(): AppWindow | null {
    const last = this.#lastUsed === null ? undefined : this.#windows.get(this.#lastUsed);
    if (last && !last.closing) return last;
    return [...this.#windows.values()].reverse().find((entry) => !entry.closing) ?? null;
  }

  #focusedWindow(): AppWindow | null {
    const focused = BrowserWindow.getFocusedWindow();
    return (focused && this.#windows.get(focused.webContents.id)) ?? this.#lastUsedWindow();
  }

  #flush(entry: AppWindow): void {
    if (!entry.ready || entry.contents.isDestroyed()) return;
    const paths = entry.pendingOpens.splice(0);
    if (paths.length > 0) entry.contents.send(channels.openPaths, { paths });
    for (const assetId of entry.pendingAdopts.splice(0)) entry.contents.send(channels.adoptTab, { assetId });
  }

  #closeAssets(entry: AppWindow): Promise<void> {
    entry.closing ??= new Promise<void>((resolve) => {
      if (!entry.ready || entry.contents.isDestroyed()) {
        resolve();
        return;
      }
      const timer = setTimeout(() => {
        this.#options.log.error("A window did not close its assets in time");
        resolve();
      }, CLOSE_TIMEOUT_MS);
      entry.finishClose = () => {
        clearTimeout(timer);
        resolve();
      };
      entry.contents.send(channels.closeRequest);
    });
    return entry.closing;
  }

  #onClosed(entry: AppWindow): void {
    this.#windows.delete(entry.id);
    if (this.#lastUsed === entry.id) this.#lastUsed = null;
    if (this.#quitting) return;
    if (this.#windows.size === 0) this.#lastClosed = entry.final;
    this.#options.onSessionChange();
  }

  #sender(event: IpcMainEvent | IpcMainInvokeEvent): AppWindow | null {
    const entry = this.#windows.get(event.sender.id);
    const frame = event.senderFrame;
    if (!entry || !frame || frame.parent !== null || !isAppUrl(frame.url, this.#options.devServer)) {
      this.#options.log.error(`Ignored IPC from an unknown frame: ${frame?.url ?? "gone"}`);
      return null;
    }
    return entry;
  }

  async #pickFiles(parent: BrowserWindow | null): Promise<string[]> {
    return this.#showOpenDialog(parent, {
      title: "Open an asset",
      properties: ["openFile", "multiSelections"],
      filters: [{ name: "Models", extensions: ASSET_EXTENSIONS.map((extension) => extension.slice(1)) }],
    });
  }

  /** The open dialog for files to add to a view: FBX models, or one image for a texture slot. */
  #pickViewFiles(parent: BrowserWindow, kind: FileKind): Promise<string[]> {
    return this.#showOpenDialog(
      parent,
      kind === "model"
        ? { title: "Add to view", properties: ["openFile", "multiSelections"], filters: [MODEL_FILTER] }
        : { title: "Choose a texture", properties: ["openFile"], filters: [IMAGE_FILTER] },
    );
  }

  async #showOpenDialog(parent: BrowserWindow | null, options: Electron.OpenDialogOptions): Promise<string[]> {
    const result = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options);
    return result.canceled ? [] : result.filePaths;
  }

  #registerIpc(): void {
    ipcMain.handle(channels.init, (event) => {
      const entry = this.#sender(event);
      if (!entry) throw new Error("Unknown window.");
      const init: WindowInit = entry.initialized
        ? { platform: process.platform, restore: entry.tabs, adopt: null }
        : entry.firstInit;
      entry.initialized = true;
      return init;
    });
    ipcMain.on(channels.connectCore, (event) => {
      const entry = this.#sender(event);
      if (!entry) return;
      const contents = entry.contents;
      entry.connections += 1;
      this.#options.core.requestPort(`window-${entry.id}-${entry.connections}`, (port) => {
        if (contents.isDestroyed()) port.close();
        else contents.postMessage(channels.corePort, null, [port]);
      });
    });
    ipcMain.on(channels.windowReady, (event) => {
      const entry = this.#sender(event);
      if (!entry) return;
      entry.ready = true;
      this.#flush(entry);
    });
    ipcMain.on(channels.reportTabs, (event, payload: unknown) => {
      const entry = this.#sender(event);
      const tabs = windowTabsSchema.safeParse(payload);
      if (!entry || !tabs.success || entry.closing) return;
      entry.tabs = tabs.data;
      this.#options.onSessionChange();
    });
    ipcMain.on(channels.closeReady, (event, payload: unknown) => {
      const entry = this.#sender(event);
      const tabs = windowTabsSchema.safeParse(payload);
      if (!entry) return;
      if (tabs.success) entry.tabs = tabs.data;
      entry.finishClose?.();
      this.#options.onSessionChange();
    });
    ipcMain.handle(channels.openDialog, async (event) => {
      const entry = this.#sender(event);
      return entry ? this.#pickFiles(entry.window) : [];
    });
    ipcMain.handle(channels.pickFiles, async (event, payload: unknown) => {
      const entry = this.#sender(event);
      const kind = fileKindSchema.safeParse(payload);
      return entry && kind.success ? this.#pickViewFiles(entry.window, kind.data) : [];
    });
    ipcMain.on(channels.editText, (event, payload: unknown) => {
      const edit = textEditSchema.safeParse(payload);
      if (!this.#sender(event) || !edit.success) return;
      if (edit.data === "undo") event.sender.undo();
      else event.sender.redo();
    });
    ipcMain.on(channels.tabDragEnd, (event, payload: unknown) => {
      const entry = this.#sender(event);
      const drag = tabDragEndSchema.safeParse(payload);
      if (!entry || !drag.success || drag.data.dropped) return;
      this.#tearOff(entry, drag.data.assetId);
    });
  }

  /**
   * A tab dragged out of its strip and dropped where no strip took it. Over another Arcue window, that window takes
   * the tab; outside every window, a new window opens under the cursor and takes it.
   */
  #tearOff(source: AppWindow, assetId: string): void {
    const point = screen.getCursorScreenPoint();
    const target = [...this.#windows.values()].find(
      (entry) =>
        entry !== source &&
        !entry.closing &&
        entry.window.isVisible() &&
        !entry.window.isMinimized() &&
        contains(entry.window.getBounds(), point),
    );
    if (target) {
      target.pendingAdopts.push(assetId);
      this.#flush(target);
      reveal(target.window);
      return;
    }
    if (contains(source.window.getBounds(), point)) return;
    const { width, height } = source.window.getBounds();
    this.create({ bounds: { x: point.x - 120, y: point.y - 16, width, height }, adopt: assetId });
  }
}

function contains(bounds: Rectangle, point: { x: number; y: number }): boolean {
  return (
    point.x >= bounds.x &&
    point.x < bounds.x + bounds.width &&
    point.y >= bounds.y &&
    point.y < bounds.y + bounds.height
  );
}

function cascade(bounds: Rectangle): Bounds {
  return { x: bounds.x + CASCADE, y: bounds.y + CASCADE, width: bounds.width, height: bounds.height };
}

function reveal(window: BrowserWindow): void {
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
}
