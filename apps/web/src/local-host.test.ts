import { ArcueCore, ManualClock, MemoryPlatform } from "@arcue/core";
import type { ByteStream, CoreClient, IncomingRequest, ViewState, WindowTabs } from "@arcue/protocol";
import {
  ArcueError,
  binaryFrameCodec,
  createMemoryChannel,
  createPeer,
  createRemoteClient,
  framedEndpoint,
  messageChannel,
  SERVE_STOPPED_CLOSE_CODE,
} from "@arcue/protocol";
import type { Importer, SceneDescription } from "@arcue/scene";
import { SCENE_SPACE } from "@arcue/scene";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LocalHostOptions } from "./local-host";
import { followPage, LocalHost } from "./local-host";
import type { ServedPage } from "./served-page";

const HERO = "/work/Hero.fbx";
const CRATE = "/work/Crate.fbx";
const GOLEM = "/work/Golem.fbx";
const BLOB = "/work/Blob.fbx";
const VIEW = "3f9a0c1d2b4e";
const PAGE_STOPPED = "Arcue in the browser stopped. This page reconnects once it runs again.";
const NEW_BUILD = "/assets/index-new.js";

/** Longer than any backoff, so advancing by it lets the next attempt run. */
const PAST_BACKOFF_MS = 6000;
/** The longest first retry after a connection is lost: 250 ms with its jitter. */
const FIRST_RETRY_MS = 300;
const SAVE_DELAY_MS = 300;
const SAVE_INTERVAL_MS = 5000;
const OTHER_VIEW = "7b2e5d9c1a0f";
const TABS_KEY = `arcue.tabs:${VIEW}`;

function emptyScene(): SceneDescription {
  return {
    source: {
      format: "fbx",
      exporter: null,
      fps: 30,
      originalSpace: SCENE_SPACE,
      conversion: { scale: 1, rotation: [0, 0, 0, 1] },
      warnings: [],
    },
    nodes: [],
    meshes: [],
    skeletons: [],
    materials: [],
    textures: [],
    clips: [],
    parts: [],
    bounds: { min: [0, 0, 0], max: [0, 0, 0] },
  };
}

const emptyImporter: Importer = { format: "fbx", extensions: [".fbx"], import: async () => emptyScene() };

/** A page's WebSocket and the server's end of it, connected to the server's core once the server accepts it. */
class FakeSocket extends EventTarget {
  readyState: number = WebSocket.CONNECTING;
  binaryType = "blob";
  #toCore: ((bytes: Uint8Array) => void) | null = null;
  #endCore: (() => void) | null = null;

  send(bytes: Uint8Array): void {
    if (this.readyState !== WebSocket.OPEN) return;
    const copy = bytes.slice();
    queueMicrotask(() => this.#toCore?.(copy));
  }

  close(): void {
    this.drop(1005);
  }

  accept(core: ArcueCore, connection: string, view: string | null): void {
    const data = new Set<(bytes: Uint8Array) => void>();
    const ends = new Set<() => void>();
    const stream: ByteStream = {
      write: (bytes) => {
        const copy = bytes.slice();
        queueMicrotask(() => {
          if (this.readyState === WebSocket.OPEN)
            this.dispatchEvent(new MessageEvent("message", { data: copy.buffer }));
        });
      },
      onData: (listener) => {
        data.add(listener);
        return () => data.delete(listener);
      },
      onClose: (listener) => {
        ends.add(listener);
        return () => ends.delete(listener);
      },
      close: () => this.drop(1000),
    };
    this.#toCore = (bytes) => {
      for (const listener of [...data]) listener(bytes);
    };
    this.#endCore = () => {
      for (const listener of [...ends]) listener();
    };
    const channel = messageChannel(stream, binaryFrameCodec);
    const peer = core.connect(framedEndpoint(channel), {
      connection,
      caller: "window",
      view: view ?? undefined,
      browser: true,
    });
    peer.onClose(() => channel.close());
    this.readyState = WebSocket.OPEN;
    this.dispatchEvent(new Event("open"));
  }

  /** Ends the socket on both sides; the page hears the close with this code. */
  drop(code: number): void {
    if (this.readyState === WebSocket.CLOSED) return;
    this.readyState = WebSocket.CLOSED;
    const endCore = this.#endCore;
    this.#toCore = null;
    this.#endCore = null;
    endCore?.();
    queueMicrotask(() => this.dispatchEvent(Object.assign(new Event("close"), { code })));
  }
}

/** Arcue in the browser in memory: a core that stops and starts again over the same files, and its pages' sockets. */
class FakeServer {
  readonly platform = new MemoryPlatform({
    clock: new ManualClock(),
    files: { [HERO]: "hero", [CRATE]: "crate", [GOLEM]: "golem", [BLOB]: "blob" },
    importers: [emptyImporter],
  });
  core: ArcueCore | null = null;
  readonly sockets: FakeSocket[] = [];
  /** "hang" leaves new sockets connecting, as a server that never answers. */
  answer: "accept" | "hang" = "accept";
  #connections = 0;

  async start(): Promise<ArcueCore> {
    const core = await ArcueCore.start({ platform: this.platform, onError: () => undefined });
    this.core = core;
    return core;
  }

  /** Stops as Arcue in the browser does on purpose: its pages' sockets close with the code, then the core shuts down. */
  async stop(code = SERVE_STOPPED_CLOSE_CODE): Promise<void> {
    const core = this.core;
    this.core = null;
    for (const socket of this.sockets) socket.drop(code);
    await core?.shutdown();
  }

  /** Drops every page's socket while the core keeps running. */
  dropSockets(): void {
    for (const socket of this.sockets) socket.drop(1006);
  }

  /** Accepts the sockets left connecting. */
  acceptWaiting(): void {
    const core = this.core;
    if (!core) throw new Error("No core runs.");
    for (const socket of this.sockets) {
      if (socket.readyState === WebSocket.CONNECTING) socket.accept(core, `browser-${++this.#connections}`, null);
    }
  }

  socket(view: string | null): WebSocket {
    const socket = new FakeSocket();
    this.sockets.push(socket);
    queueMicrotask(() => {
      if (this.answer === "hang" || socket.readyState !== WebSocket.CONNECTING) return;
      if (this.core) socket.accept(this.core, `browser-${++this.#connections}`, view);
      else socket.drop(1006);
    });
    return socket as unknown as WebSocket;
  }

  /** The command line's connection, as an agent's `arcue open` uses it. */
  bridge(): CoreClient {
    const core = this.core;
    if (!core) throw new Error("No core runs.");
    const [coreSide, bridgeSide] = createMemoryChannel();
    core.connect(coreSide, { connection: `cli-${++this.#connections}`, caller: "bridge" });
    return createRemoteClient(createPeer(bridgeSide));
  }

  async paths(): Promise<string[]> {
    if (!this.core) throw new Error("No core runs.");
    const { assets } = await this.core.client.query("asset.list", {});
    return assets.map((asset) => asset.path);
  }
}

class FakeStorage {
  readonly items = new Map<string, string>();
  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }
  removeItem(key: string): void {
    this.items.delete(key);
  }
}

class FakeDocument extends EventTarget {
  visibilityState: DocumentVisibilityState = "visible";
}

const cleanups: (() => void)[] = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

/** A page of the server, with its own timers and storage. */
class Page {
  readonly timers = new ManualClock(0);
  readonly storage: FakeStorage;
  readonly host: LocalHost;

  constructor(
    server: FakeServer,
    options: Partial<Omit<LocalHostOptions, "storage">> & { storage?: FakeStorage } = {},
  ) {
    const view = options.view === undefined ? VIEW : options.view;
    this.storage = options.storage ?? new FakeStorage();
    this.host = new LocalHost({
      openSocket: () => server.socket(view),
      setTimer: (delayMs, callback) => this.timers.setTimer(delayMs, callback),
      ...options,
      view,
      storage: this.storage,
    });
    cleanups.push(() => this.host.dispose());
  }

  start(): this {
    this.host.start();
    return this;
  }

  get store() {
    return this.host.store;
  }

  /** The paths of the page's asset tabs, in order. */
  paths(): string[] {
    return this.store.state
      .get()
      .tabs.map((tab) => this.store.session(tab.id)?.state.get().summary.path)
      .filter((path) => path !== undefined);
  }

  ids(): string[] {
    return this.store.state.get().tabs.map((tab) => tab.id);
  }

  activePath(): string | null {
    const { active } = this.store.state.get();
    return active === null ? null : (this.store.session(active)?.state.get().summary.path ?? null);
  }

  /** Lets the backoff run out until the page is connected. */
  async connected(): Promise<void> {
    await vi.waitFor(() => {
      if (this.host.client.connectionState !== "connected") this.timers.advance(PAST_BACKOFF_MS);
      expect(this.host.client.connectionState).toBe("connected");
    });
  }

  async opened(...paths: string[]): Promise<void> {
    for (const path of paths) await this.store.openPath(path);
    await vi.waitFor(() => expect(this.paths()).toEqual(paths));
  }

  saved(): WindowTabs | null {
    return keptTabs(this.storage);
  }
}

/** The tabs a page of the view keeps in its storage. */
function keptTabs(storage: FakeStorage): WindowTabs | null {
  const text = storage.getItem(TABS_KEY);
  return text === null ? null : (JSON.parse(text) as { tabs: WindowTabs }).tabs;
}

function savedTabs(storage: FakeStorage, paths: string[], active: number | null, view = VIEW): void {
  const tabs: WindowTabs = { tabs: paths.map((path) => ({ path, view: null })), active };
  storage.setItem(`arcue.tabs:${view}`, JSON.stringify({ version: 1, tabs }));
}

/** The paths the page asked the core to open, in order. */
function opensOf(page: Page) {
  const execute = vi.spyOn(page.host.client, "execute");
  return () =>
    execute.mock.calls.flatMap(([name, input]) =>
      name === "asset.open" && typeof input === "object" && input !== null && "path" in input ? [input.path] : [],
    );
}

/** The view commands the core sent the page. */
function requestsTo(page: Page): IncomingRequest[] {
  const requests: IncomingRequest[] = [];
  const handle = page.store.handleRequest;
  vi.spyOn(page.store, "handleRequest").mockImplementation((request) => {
    requests.push(request);
    return handle(request);
  });
  return requests;
}

function toasts(page: Page, message: string) {
  const notify = vi.spyOn(page.store, "notify");
  return () => notify.mock.calls.filter(([toast]) => toast.message === message).map(([toast]) => toast);
}

async function restart(server: FakeServer, code = SERVE_STOPPED_CLOSE_CODE): Promise<void> {
  await server.stop(code);
  await server.start();
}

describe("LocalHost", () => {
  it("opens its tabs again in order after a restart, at the saved active tab, never labelled by a lost core's ids", async () => {
    const server = new FakeServer();
    await server.start();
    const page = new Page(server).start();
    await page.connected();
    await page.opened(HERO, CRATE);
    expect(page.ids()).toEqual(["a1", "a2"]);
    page.store.moveTab("a2", 0);
    page.store.activate("a1");

    const labels: string[] = [];
    let detached = false;
    page.store.state.subscribe(() => {
      const { tabs } = page.store.state.get();
      if (tabs.length === 0) detached = true;
      if (!detached) return;
      for (const tab of tabs) labels.push(`${tab.id} ${page.store.session(tab.id)?.state.get().summary.name}`);
    });
    await restart(server);
    await page.connected();

    await vi.waitFor(() => expect(page.paths()).toEqual([CRATE, HERO]));
    await vi.waitFor(() => expect(page.activePath()).toBe(HERO));
    expect(page.ids()).toEqual(["a1", "a2"]);
    expect(labels).not.toContain("a1 Hero.fbx");
    expect(labels).not.toContain("a2 Crate.fbx");
    expect(await server.paths()).toEqual([CRATE, HERO]);
  });

  it("takes its socket only once it opens", async () => {
    const server = new FakeServer();
    await server.start();
    server.answer = "hang";
    const page = new Page(server).start();
    await vi.waitFor(() => expect(server.sockets).toHaveLength(1));

    expect(page.host.client.connectionState).toBe("reconnecting");
    await expect(page.host.client.query("asset.list", {})).rejects.toMatchObject({ code: "disconnected" });
    server.acceptWaiting();
    await vi.waitFor(() => expect(page.host.client.connectionState).toBe("connected"));
    await expect(page.host.client.query("asset.list", {})).resolves.toEqual({ assets: [] });
  });

  it("says once that Arcue in the browser stopped, keeps trying until it runs again, and says so when it stops again", async () => {
    const server = new FakeServer();
    await server.start();
    const page = new Page(server).start();
    await page.connected();
    await page.opened(HERO);
    const stopped = toasts(page, PAGE_STOPPED);

    await server.stop();
    await vi.waitFor(() => expect(stopped()).toEqual([{ message: PAGE_STOPPED, kind: "info" }]));
    expect(page.store.state.get().connection).toBe("reconnecting");
    const attempts = server.sockets.length;
    await vi.waitFor(() => {
      page.timers.advance(PAST_BACKOFF_MS);
      expect(server.sockets.length).toBeGreaterThanOrEqual(attempts + 6);
    });
    expect(stopped()).toHaveLength(1);

    await server.start();
    await page.connected();
    await vi.waitFor(() => expect(page.paths()).toEqual([HERO]));
    expect(stopped()).toHaveLength(1);

    await server.stop();
    await vi.waitFor(() => expect(stopped()).toHaveLength(2));
    await vi.waitFor(() => expect(page.host.client.connectionState).toBe("reconnecting"));
    const afterSecondStop = server.sockets.length;
    page.timers.advance(FIRST_RETRY_MS);
    expect(server.sockets).toHaveLength(afterSecondStop + 1);
  });

  it("reloads once into a new build of the page, keeping its tabs, and again for a newer one", async () => {
    const server = new FakeServer();
    await server.start();
    const storage = new FakeStorage();
    const keptAtReload: (WindowTabs | null)[] = [];
    const reload = vi.fn(() => keptAtReload.push(keptTabs(storage)));
    const probe = vi.fn(async (): Promise<ServedPage> => {
      storage.removeItem(TABS_KEY);
      return { changed: NEW_BUILD };
    });
    const page = new Page(server, { probe, reload, storage }).start();
    await page.connected();
    await page.opened(HERO, CRATE);
    expect(probe).not.toHaveBeenCalled();

    await restart(server);
    await vi.waitFor(() => {
      page.timers.advance(PAST_BACKOFF_MS);
      expect(reload).toHaveBeenCalledTimes(1);
    });
    expect(page.storage.getItem("arcue.reloadedFor")).toBe(NEW_BUILD);
    expect(keptAtReload).toEqual([{ tabs: [HERO, CRATE].map((path) => ({ path, view: null })), active: 1 }]);
    page.timers.advance(PAST_BACKOFF_MS);
    expect(page.host.client.connectionState).toBe("reconnecting");
    page.host.dispose();

    const reloaded = new Page(server, { probe, reload, storage }).start();
    await reloaded.connected();
    await vi.waitFor(() => expect(reloaded.paths()).toEqual([HERO, CRATE]));
    probe.mockImplementation(async () => ({ changed: "/assets/index-newer.js" }));
    await restart(server);
    await vi.waitFor(() => {
      reloaded.timers.advance(PAST_BACKOFF_MS);
      expect(reload).toHaveBeenCalledTimes(2);
    });
    expect(page.storage.getItem("arcue.reloadedFor")).toBe("/assets/index-newer.js");
  });

  it("reloads when the server serves a new build while the page cannot connect", async () => {
    const server = new FakeServer();
    await server.start();
    const reload = vi.fn();
    const probe = vi.fn(async (): Promise<ServedPage> => "down");
    const page = new Page(server, { probe, reload }).start();
    await page.connected();
    await page.opened(HERO);
    await server.stop();

    await vi.waitFor(() => {
      page.timers.advance(PAST_BACKOFF_MS);
      expect(probe).toHaveBeenCalled();
    });
    expect(reload).not.toHaveBeenCalled();
    probe.mockImplementation(async () => ({ changed: NEW_BUILD }));
    await vi.waitFor(() => {
      page.timers.advance(PAST_BACKOFF_MS);
      expect(reload).toHaveBeenCalledTimes(1);
    });
    const attempts = server.sockets.length;
    page.timers.advance(PAST_BACKOFF_MS);
    expect(server.sockets).toHaveLength(attempts);
    expect(page.saved()?.tabs.map((tab) => tab.path)).toEqual([HERO]);
  });

  it("shows a model an agent opened while the page was away at the frame the agent asked for, in the active tab", async () => {
    const server = new FakeServer();
    await server.start();
    const page = new Page(server).start();
    await page.connected();
    await page.opened(HERO, CRATE);
    page.store.activate("a1");

    await restart(server);
    const opened = await server.bridge().execute("asset.openInView", { path: GOLEM, view: VIEW, frame: 12 });
    expect(opened.shown).toBe("held");
    const requests = requestsTo(page);
    await page.connected();

    await vi.waitFor(() => expect(page.saved()?.tabs).toHaveLength(3));
    expect(page.paths()).toEqual([HERO, CRATE, GOLEM]);
    expect(requests).toContainEqual({
      kind: "command",
      name: "view.showAsset",
      input: { assetId: opened.assetId, frame: 12 },
    });
    expect(page.activePath()).toBe(GOLEM);
    expect(page.saved()?.active).toBe(2);
  });

  it("shows the model an agent opened last while the page was away in the active tab, also when it opened it before", async () => {
    const server = new FakeServer();
    await server.start();
    const page = new Page(server).start();
    await page.connected();
    await page.opened(HERO);

    await restart(server);
    const agent = server.bridge();
    await agent.execute("asset.openInView", { path: CRATE, view: VIEW });
    await expect(agent.execute("asset.openInView", { path: HERO, view: VIEW, frame: 12 })).resolves.toMatchObject({
      shown: "held",
    });
    await page.connected();

    await vi.waitFor(() => expect(page.saved()?.tabs).toHaveLength(2));
    expect(page.paths()).toEqual([HERO, CRATE]);
    expect(page.activePath()).toBe(HERO);
  });

  it("shows the model an agent opened last before the page opened in the active tab, also when it opened it before", async () => {
    const server = new FakeServer();
    await server.start();
    const agent = server.bridge();
    for (const path of [HERO, CRATE, HERO]) await agent.execute("asset.openInView", { path, view: VIEW });
    const page = new Page(server).start();
    await page.connected();

    await vi.waitFor(() => expect(page.saved()?.tabs).toHaveLength(2));
    expect(page.paths()).toEqual([HERO, CRATE]);
    expect(page.activePath()).toBe(HERO);
  });

  it("brings its tabs back with the same ids when its socket drops while the core keeps running", async () => {
    const server = new FakeServer();
    await server.start();
    const page = new Page(server).start();
    await page.connected();
    await page.opened(HERO, CRATE);
    const opens = opensOf(page);

    server.dropSockets();
    await vi.waitFor(() => expect(page.host.client.connectionState).toBe("reconnecting"));
    await page.connected();

    await vi.waitFor(() => expect(page.paths()).toEqual([HERO, CRATE]));
    expect(page.ids()).toEqual(["a1", "a2"]);
    expect(opens()).toEqual([]);
    expect(await server.paths()).toEqual([HERO, CRATE]);
  });

  it("keeps a page outside views to its own tabs, apart from a view's page, across a reload", async () => {
    const server = new FakeServer();
    await server.start();
    const plain = new Page(server, { view: null }).start();
    await plain.connected();
    await plain.opened(HERO);
    const viewPage = new Page(server).start();
    await viewPage.connected();
    await server.bridge().execute("asset.openInView", { path: CRATE, view: VIEW });
    await vi.waitFor(() => expect(viewPage.paths()).toEqual([CRATE]));
    plain.timers.advance(300);
    expect(JSON.parse(plain.storage.getItem("arcue.tabs:") ?? "null")).toEqual({
      version: 1,
      tabs: { tabs: [{ path: HERO, view: null }], active: 0 },
    });

    plain.host.dispose();
    const reloaded = new Page(server, { view: null, storage: plain.storage }).start();
    await reloaded.connected();

    await vi.waitFor(() => expect(reloaded.paths()).toEqual([HERO]));
    expect(viewPage.paths()).toEqual([CRATE]);
    expect(await server.paths()).toEqual([HERO, CRATE]);
  });

  it("opens the tabs it kept when it reloads while Arcue in the browser is stopped", async () => {
    const server = new FakeServer();
    await server.start();
    const first = new Page(server).start();
    await first.connected();
    await first.opened(HERO, CRATE, GOLEM);
    first.store.activate("a2");
    first.timers.advance(300);
    expect(first.saved()).toEqual({ tabs: [HERO, CRATE, GOLEM].map((path) => ({ path, view: null })), active: 1 });

    await server.stop();
    first.host.dispose();
    const reloaded = new Page(server, { storage: first.storage }).start();
    reloaded.timers.advance(PAST_BACKOFF_MS * 3);
    expect(reloaded.saved()?.tabs.map((tab) => tab.path)).toEqual([HERO, CRATE, GOLEM]);
    await server.start();
    await reloaded.connected();

    await vi.waitFor(() => expect(reloaded.paths()).toEqual([HERO, CRATE, GOLEM]));
    await vi.waitFor(() => expect(reloaded.activePath()).toBe(CRATE));
  });

  it("opens the tabs it kept after a reload only when the same Arcue in the browser serves it", async () => {
    const server = new FakeServer();
    await server.start();
    const first = new Page(server, { owner: "mine" }).start();
    await first.connected();
    await first.opened(HERO, CRATE);
    first.timers.advance(SAVE_DELAY_MS);
    first.host.dispose();
    const again = new Page(server, { owner: "mine", storage: first.storage }).start();
    await again.connected();
    await vi.waitFor(() => expect(again.paths()).toEqual([HERO, CRATE]));
    again.host.dispose();

    const other = new FakeServer();
    await other.start();
    const elsewhere = new Page(other, { owner: "theirs", storage: first.storage }).start();
    await elsewhere.connected();
    await vi.waitFor(() =>
      expect(JSON.parse(first.storage.getItem(TABS_KEY) ?? "{}")).toMatchObject({ owner: "theirs" }),
    );

    expect(await other.paths()).toEqual([]);
    expect(elsewhere.paths()).toEqual([]);
  });

  it("opens a tab the core doesn't have from the view it kept, at its clip, frame and camera", async () => {
    const server = new FakeServer();
    const core = await server.start();
    const view: ViewState = {
      camera: { position: [2, 1.5, 3], target: [0, 1, 0], up: [0, 1, 0], fov: 35 },
      clip: "Armature|Walk",
      frame: 20,
      range: null,
      display: { mode: "clay", skeleton: true },
      parts: { hidden: [], shown: [], isolated: null, lod: 0 },
      outlineOpen: false,
    };
    const storage = new FakeStorage();
    const tabs: WindowTabs = {
      tabs: [
        { path: HERO, view },
        { path: CRATE, view: null },
      ],
      active: 0,
    };
    storage.setItem(TABS_KEY, JSON.stringify({ version: 1, tabs }));
    const page = new Page(server, { storage }).start();
    await page.connected();

    await vi.waitFor(() => expect(page.paths()).toEqual([HERO, CRATE]));
    const { assets } = await core.client.query("asset.list", {});
    const views = await Promise.all(assets.map(({ assetId }) => core.client.query("viewState.get", { assetId })));
    expect(views).toEqual([view, null]);
  });

  it("shows a kept tab that an agent opened while the page was away from the view it kept, at the agent's frame", async () => {
    const server = new FakeServer();
    const core = await server.start();
    const view: ViewState = {
      camera: { position: [2, 1.5, 3], target: [0, 1, 0], up: [0, 1, 0], fov: 35 },
      clip: "Armature|Walk",
      frame: 20,
      range: null,
      display: { mode: "clay", skeleton: true },
      parts: { hidden: [], shown: [], isolated: null, lod: 0 },
      outlineOpen: false,
    };
    const storage = new FakeStorage();
    storage.setItem(TABS_KEY, JSON.stringify({ version: 1, tabs: { tabs: [{ path: HERO, view }], active: 0 } }));
    const opened = await server.bridge().execute("asset.openInView", { path: HERO, view: VIEW, frame: 12 });
    expect(opened.shown).toBe("held");
    const page = new Page(server, { storage });
    const requests = requestsTo(page);
    page.start();
    await page.connected();

    await vi.waitFor(() => expect(page.paths()).toEqual([HERO]));
    await expect(core.client.query("viewState.get", { assetId: opened.assetId })).resolves.toEqual(view);
    expect(requests).toContainEqual({
      kind: "command",
      name: "view.showAsset",
      input: { assetId: opened.assetId, frame: 12 },
    });
  });

  it("says nothing of a tab another session's view takes while the page opens its tabs again", async () => {
    const server = new FakeServer();
    const core = await server.start();
    const bridge = server.bridge();
    core.client.subscribe("asset.opened", ({ asset }) => {
      if (asset.path === HERO) void bridge.execute("asset.openInView", { path: CRATE, view: OTHER_VIEW });
    });
    const storage = new FakeStorage();
    savedTabs(storage, [HERO, CRATE, GOLEM], 0);
    const page = new Page(server, { storage });
    const alerts = vi.spyOn(page.store, "notify");
    page.start();
    await page.connected();

    await vi.waitFor(() => expect(page.paths()).toEqual([HERO, GOLEM]));
    await vi.waitFor(() => expect(page.activePath()).toBe(HERO));
    expect(await server.paths()).toEqual([HERO, CRATE, GOLEM]);
    expect(alerts.mock.calls.filter(([toast]) => toast.kind === "alert")).toEqual([]);
  });

  it("starts without saved tabs when its storage throws or holds something else", async () => {
    const server = new FakeServer();
    await server.start();
    const throwing = new FakeStorage();
    throwing.getItem = () => {
      throw new Error("The storage is off.");
    };
    throwing.setItem = () => {
      throw new Error("The storage is full.");
    };
    const page = new Page(server, { storage: throwing }).start();
    await page.connected();
    await page.opened(HERO);
    page.timers.advance(PAST_BACKOFF_MS);
    expect(() => page.host.saveTabs()).not.toThrow();

    const garbage = [
      "{not json",
      "42",
      "null",
      JSON.stringify({ version: 2, tabs: { tabs: [{ path: CRATE, view: null }], active: 0 } }),
      JSON.stringify({ version: 1, tabs: { tabs: "x", active: 0 } }),
      JSON.stringify({ version: 1, tabs: { tabs: [{ path: "", view: null }], active: 0 } }),
    ];
    for (const text of garbage) {
      const storage = new FakeStorage();
      storage.setItem(`arcue.tabs:${VIEW}`, text);
      const other = new Page(server, { storage }).start();
      await other.connected();
      await vi.waitFor(() => expect(other.store.state.get().connection).toBe("connected"));
      expect(other.paths()).toEqual([]);
      other.host.dispose();
    }
    expect(await server.paths()).toEqual([HERO]);
  });

  it("never connects when its address names a view that isn't valid", async () => {
    const server = new FakeServer();
    await server.start();
    const page = new Page(server, { view: "Not a view" });
    const alerts = toasts(page, "This page's address names a view that isn't valid, so it doesn't connect.");
    page.start();
    page.host.retryNow();
    page.timers.advance(PAST_BACKOFF_MS * 4);
    await Promise.resolve();

    expect(server.sockets).toEqual([]);
    expect(alerts()).toEqual([
      { message: "This page's address names a view that isn't valid, so it doesn't connect.", kind: "alert" },
    ]);
    page.host.saveTabs();
    expect(page.storage.items.size).toBe(0);
  });

  it("tries again at once when the page comes back, ahead of a backoff a background page's timers slow down", async () => {
    const server = new FakeServer();
    const page = new Page(server).start();
    await vi.waitFor(() => {
      page.timers.advance(PAST_BACKOFF_MS);
      expect(server.sockets.length).toBeGreaterThanOrEqual(5);
    });
    const document = new FakeDocument();
    const window = new EventTarget();
    cleanups.push(followPage(page.host, { window, document }));
    await Promise.resolve();

    for (const name of ["focus", "online", "pageshow"]) {
      await vi.waitFor(() => expect(page.host.client.connectionState).toBe("reconnecting"));
      const attempts = server.sockets.length;
      await vi.waitFor(() => {
        window.dispatchEvent(new Event(name));
        expect(server.sockets.length).toBeGreaterThan(attempts);
      });
    }
    document.visibilityState = "hidden";
    document.dispatchEvent(new Event("visibilitychange"));

    await server.start();
    document.visibilityState = "visible";
    await vi.waitFor(() => {
      document.dispatchEvent(new Event("visibilitychange"));
      expect(page.host.client.connectionState).toBe("connected");
    });
  });

  it("opens no second socket when the page comes back while an attempt still connects", async () => {
    const server = new FakeServer();
    await server.start();
    server.answer = "hang";
    const page = new Page(server).start();
    await vi.waitFor(() => expect(server.sockets).toHaveLength(1));
    const document = new FakeDocument();
    const window = new EventTarget();
    cleanups.push(followPage(page.host, { window, document }));

    for (const name of ["focus", "online", "pageshow"]) window.dispatchEvent(new Event(name));
    document.dispatchEvent(new Event("resume"));
    document.dispatchEvent(new Event("visibilitychange"));
    await Promise.resolve();

    expect(server.sockets).toHaveLength(1);
    server.acceptWaiting();
    await vi.waitFor(() => expect(page.host.client.connectionState).toBe("connected"));
    expect(server.sockets).toHaveLength(1);
  });

  it("keeps its tabs every few seconds, and at once when the page is hidden or goes away", async () => {
    const server = new FakeServer();
    await server.start();
    const page = new Page(server).start();
    await page.connected();
    await page.opened(HERO, CRATE);
    const document = new FakeDocument();
    const window = new EventTarget();
    cleanups.push(followPage(page.host, { window, document }));
    const tabs = { tabs: [HERO, CRATE].map((path) => ({ path, view: null })), active: 1 };
    page.timers.advance(SAVE_DELAY_MS);
    let changes = 0;
    cleanups.push(page.store.state.subscribe(() => changes++));

    page.storage.items.clear();
    page.timers.advance(SAVE_INTERVAL_MS);
    expect(page.saved()).toEqual(tabs);
    page.storage.items.clear();
    page.timers.advance(SAVE_INTERVAL_MS);
    expect(page.saved()).toEqual(tabs);

    page.storage.items.clear();
    window.dispatchEvent(new Event("pagehide"));
    expect(page.saved()).toEqual(tabs);
    page.storage.items.clear();
    document.visibilityState = "hidden";
    document.dispatchEvent(new Event("visibilitychange"));
    expect(page.saved()).toEqual(tabs);
    expect(changes).toBe(0);
  });

  it("gives up on an attempt still connecting after 10 seconds and tries again", async () => {
    const server = new FakeServer();
    await server.start();
    server.answer = "hang";
    const page = new Page(server).start();
    await vi.waitFor(() => expect(server.sockets).toHaveLength(1));

    page.timers.advance(9999);
    expect(server.sockets[0]?.readyState).toBe(WebSocket.CONNECTING);
    page.timers.advance(1);
    expect(server.sockets[0]?.readyState).toBe(WebSocket.CLOSED);
    page.timers.advance(PAST_BACKOFF_MS);
    expect(server.sockets).toHaveLength(2);

    server.answer = "accept";
    await page.connected();
    expect(server.sockets[0]?.readyState).toBe(WebSocket.CLOSED);
  });

  it("lets two pages of one view reconnect without moving a model back and forth", async () => {
    const server = new FakeServer();
    await server.start();
    const first = new Page(server).start();
    await first.connected();
    await first.opened(HERO, CRATE);
    const storage = new FakeStorage();
    savedTabs(storage, [HERO, GOLEM], 0);
    const second = new Page(server, { storage }).start();
    await second.connected();
    await vi.waitFor(() => expect(second.paths()).toEqual([GOLEM]));
    expect(first.paths()).toEqual([HERO, CRATE]);
    const releases = [requestsTo(first), requestsTo(second)];
    const notices = [first, second].map((page) => vi.spyOn(page.store, "notify"));

    await restart(server);
    await Promise.all([first.connected(), second.connected()]);

    await vi.waitFor(async () => {
      expect(await server.paths()).toHaveLength(3);
      const shown = [...first.paths(), ...second.paths()];
      expect(shown.toSorted()).toEqual([CRATE, GOLEM, HERO].toSorted());
    });
    expect(first.paths()).toContain(CRATE);
    expect(second.paths()).toContain(GOLEM);
    for (const requests of releases) expect(requests.map((request) => request.name)).not.toContain("view.releaseAsset");
    for (const notify of notices) {
      expect(notify.mock.calls.filter(([toast]) => toast.kind === "alert")).toEqual([]);
    }
  });

  it("gives each of two pages of one view its own models back after both lose their socket to a running core", async () => {
    const server = new FakeServer();
    await server.start();
    const first = new Page(server).start();
    await first.connected();
    await first.opened(HERO, CRATE);
    const second = new Page(server).start();
    await second.connected();
    await second.opened(GOLEM);

    server.dropSockets();
    await vi.waitFor(() => {
      for (const page of [first, second]) expect(page.host.client.connectionState).toBe("reconnecting");
    });
    await first.connected();
    await vi.waitFor(() => expect(first.paths()).toEqual([HERO, CRATE, GOLEM]));
    await second.connected();

    await vi.waitFor(() => expect(second.paths()).toEqual([GOLEM]));
    await vi.waitFor(() => expect(first.paths()).toEqual([HERO, CRATE]));
    expect(second.saved()?.tabs.map((tab) => tab.path)).toEqual([GOLEM]);
  });

  it("keeps drafts across a restart, but not the unsaved text of a comment box", async () => {
    const server = new FakeServer();
    await server.start();
    const page = new Page(server).start();
    await page.connected();
    await page.opened(HERO);
    const [tab] = page.ids();
    const session = page.store.session(tab ?? "");
    await vi.waitFor(() => expect(session?.state.get().summary.version).not.toBeNull());
    const { commentId } = await page.host.client.execute("comment.create", {
      assetId: tab ?? "",
      text: "The lid floats.",
      version: session?.state.get().summary.version ?? "",
      time: { kind: "none" },
      target: null,
      camera: { position: [0, 1, 3], target: [0, 1, 0], up: [0, 1, 0], fov: 30 },
      context: { vertexCount: 0, bones: [], centroid: null, joints: [], viewLabel: "front" },
      screenshot: null,
    });
    await vi.waitFor(() => expect(session?.comment(commentId)).not.toBeNull());
    session?.selectComment(commentId);
    session?.setBoxText("The lid floats, and the hinge");
    expect(session?.hasUnsavedBox()).toBe(true);

    await restart(server);
    await page.connected();

    await vi.waitFor(() => expect(page.paths()).toEqual([HERO]));
    const [reopened] = page.ids();
    const after = page.store.session(reopened ?? "");
    await vi.waitFor(() =>
      expect(after?.comment(commentId)).toMatchObject({ text: "The lid floats.", status: "draft" }),
    );
    expect(after?.state.get().box).toBeNull();
    expect(after?.hasUnsavedBox()).toBe(false);
  });

  it("connects at once on resume, as from a frozen page, and drops the backoff it waited on", async () => {
    const server = new FakeServer();
    const page = new Page(server).start();
    await vi.waitFor(() => {
      page.timers.advance(PAST_BACKOFF_MS);
      expect(server.sockets.length).toBeGreaterThanOrEqual(5);
    });
    const document = new FakeDocument();
    cleanups.push(followPage(page.host, { window: new EventTarget(), document }));
    await server.start();

    await vi.waitFor(() => {
      document.dispatchEvent(new Event("resume"));
      expect(page.host.client.connectionState).toBe("connected");
    });
    server.dropSockets();
    await vi.waitFor(() => expect(page.host.client.connectionState).toBe("reconnecting"));
    const afterDrop = server.sockets.length;
    page.timers.advance(FIRST_RETRY_MS);
    expect(server.sockets).toHaveLength(afterDrop + 1);

    await page.connected();
    const attempts = server.sockets.length;
    page.timers.advance(PAST_BACKOFF_MS);
    document.dispatchEvent(new Event("resume"));
    expect(server.sockets).toHaveLength(attempts);
  });

  it("opens the rest of its tabs once when its socket closes while it reopens them", async () => {
    const all = [HERO, CRATE, GOLEM, BLOB];
    const server = new FakeServer();
    const core = await server.start();
    let opens = 0;
    core.client.subscribe("asset.opened", () => {
      if (++opens === 2) queueMicrotask(() => server.dropSockets());
    });
    const storage = new FakeStorage();
    savedTabs(storage, all, 2);
    const page = new Page(server, { storage });
    const asked = opensOf(page);
    let attaches = 0;
    cleanups.push(
      page.host.client.onConnectionChange((state) => {
        if (state === "connected" && ++attaches === 2) storage.removeItem(TABS_KEY);
      }),
    );
    page.start();

    await vi.waitFor(() => expect(server.sockets[0]?.readyState).toBe(WebSocket.CLOSED));
    await page.connected();

    await vi.waitFor(() => expect(page.paths()).toEqual(all));
    await vi.waitFor(() => expect(page.activePath()).toBe(GOLEM));
    expect(asked()).toEqual(all);
    expect(await server.paths()).toEqual(all);
    await vi.waitFor(() =>
      expect(page.saved()).toEqual({ tabs: all.map((path) => ({ path, view: null })), active: 2 }),
    );
  });

  it("says once per outage that Arcue in the browser stopped, and nothing for a socket that just drops", async () => {
    const server = new FakeServer();
    await server.start();
    const answers: ((page: ServedPage) => void)[] = [];
    const probe = vi.fn(() => new Promise<ServedPage>((resolve) => answers.push(resolve)));
    const page = new Page(server, { probe }).start();
    await page.connected();
    await page.opened(HERO);
    const stopped = toasts(page, PAGE_STOPPED);

    await restart(server);
    await vi.waitFor(() => {
      page.timers.advance(PAST_BACKOFF_MS);
      expect(probe).toHaveBeenCalledTimes(1);
    });
    await server.stop();
    await vi.waitFor(() => expect(server.sockets.every((socket) => socket.readyState === WebSocket.CLOSED)).toBe(true));
    answers.shift()?.("same");
    await Promise.resolve();
    expect(stopped()).toHaveLength(1);
    expect(page.host.client.connectionState).toBe("reconnecting");

    probe.mockImplementation(async () => "same");
    await server.start();
    await page.connected();
    await vi.waitFor(() => expect(page.paths()).toEqual([HERO]));
    server.dropSockets();
    await vi.waitFor(() => expect(page.store.state.get().connection).toBe("reconnecting"));
    page.timers.advance(PAST_BACKOFF_MS);
    expect(stopped()).toHaveLength(1);
  });

  it("never reloads for a probe that finds no page of Arcue, and keeps trying", async () => {
    const server = new FakeServer();
    await server.start();
    const reload = vi.fn();
    const probe = vi.fn(async (): Promise<ServedPage> => "down");
    const page = new Page(server, { probe, reload }).start();
    await page.connected();
    await page.opened(HERO);

    await server.stop();
    await vi.waitFor(() => {
      page.timers.advance(PAST_BACKOFF_MS);
      expect(probe.mock.calls.length).toBeGreaterThanOrEqual(4);
    });
    await server.start();
    await page.connected();

    await vi.waitFor(() => expect(page.paths()).toEqual([HERO]));
    expect(reload).not.toHaveBeenCalled();
  });

  it("leaves an agent's open held for its view when the page reloads into a new build before it shows it", async () => {
    const server = new FakeServer();
    await server.start();
    const answer = Promise.withResolvers<ServedPage>();
    const probe = vi.fn((): Promise<ServedPage> => answer.promise);
    const reload = vi.fn(() => {
      for (const socket of server.sockets) socket.close();
    });
    const page = new Page(server, { probe, reload }).start();
    await page.connected();
    await page.opened(HERO);

    await restart(server);
    await vi.waitFor(() => {
      page.timers.advance(FIRST_RETRY_MS);
      expect(probe).toHaveBeenCalled();
    });
    const opening = server.bridge().execute("asset.openInView", { path: GOLEM, view: VIEW, frame: 12 });
    await vi.waitFor(async () => expect(await server.paths()).toEqual([GOLEM]));
    answer.resolve({ changed: NEW_BUILD });

    await expect(opening).resolves.toMatchObject({ shown: "held" });
    expect(reload).toHaveBeenCalledTimes(1);
    expect(await server.paths()).toEqual([GOLEM]);
  });

  it("never attaches to another Arcue in the browser that took its address, says so while it waits, and attaches once its own runs there", async () => {
    const server = new FakeServer();
    await server.start();
    const reload = vi.fn();
    const probe = vi.fn(async (): Promise<ServedPage> => "same");
    const page = new Page(server, { probe, reload }).start();
    const elsewhere = toasts(
      page,
      "Another Arcue in the browser runs at this address now, so this page doesn't connect to it.",
    );
    await page.connected();
    await page.opened(HERO);
    probe.mockImplementation(async () => "elsewhere");

    await restart(server);
    for (let wait = 0; wait < 10; wait++) {
      page.timers.advance(PAST_BACKOFF_MS);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    expect(page.host.client.connectionState).toBe("reconnecting");
    expect(page.host.status.get()).toEqual({ elsewhere: true });
    expect(await server.paths()).toEqual([]);
    expect(elsewhere()).toHaveLength(1);
    expect(reload).not.toHaveBeenCalled();
    const sockets = server.sockets.length;
    page.timers.advance(PAST_BACKOFF_MS);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(server.sockets).toHaveLength(sockets);

    probe.mockImplementation(async () => "same");
    await page.connected();
    await vi.waitFor(() => expect(page.paths()).toEqual([HERO]));
    expect(elsewhere()).toHaveLength(1);
    expect(page.host.status.get()).toEqual({ elsewhere: false });
  });

  it("keeps trying, and attaches, when a probe never answers", async () => {
    const server = new FakeServer();
    await server.start();
    const reload = vi.fn();
    const probe = vi.fn((): Promise<ServedPage> => new Promise(() => undefined));
    const page = new Page(server, { probe, reload }).start();
    await page.connected();
    await page.opened(HERO);

    await server.stop();
    await vi.waitFor(() => {
      page.timers.advance(PAST_BACKOFF_MS);
      expect(probe.mock.calls.length).toBeGreaterThanOrEqual(3);
    });
    await server.start();
    await page.connected();

    await vi.waitFor(() => expect(page.paths()).toEqual([HERO]));
    expect(reload).not.toHaveBeenCalled();
  });

  it("attaches without reloading when it already reloaded for the build the server serves", async () => {
    const server = new FakeServer();
    await server.start();
    const reload = vi.fn();
    const probe = vi.fn(async (): Promise<ServedPage> => ({ changed: NEW_BUILD }));
    const storage = new FakeStorage();
    storage.setItem("arcue.reloadedFor", NEW_BUILD);
    const page = new Page(server, { probe, reload, storage }).start();
    await page.connected();
    await page.opened(HERO);

    await restart(server);
    await page.connected();

    await vi.waitFor(() => expect(page.paths()).toEqual([HERO]));
    expect(probe).toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it("waits 250 ms after the first failed attempt and twice as long after each next one up to 5 s, probing from the third", async () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0.5);
    cleanups.push(() => random.mockRestore());
    const server = new FakeServer();
    const probe = vi.fn(async (): Promise<ServedPage> => "down");
    const attempts: { at: number; probes: number }[] = [];
    const page: Page = new Page(server, {
      probe,
      openSocket: () => {
        attempts.push({ at: page.timers.now(), probes: probe.mock.calls.length });
        return server.socket(VIEW);
      },
    });
    page.start();

    let seen = 0;
    while (attempts.length < 8 && page.timers.now() < 60_000) {
      if (attempts.length > seen) {
        seen = attempts.length;
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      page.timers.advance(1);
    }

    const gaps = attempts.slice(1).map(({ at }, index) => at - (attempts[index]?.at ?? 0));
    expect(gaps).toEqual([250, 500, 1000, 2000, 4000, 5000, 5000]);
    expect(attempts.map(({ probes }) => probes)).toEqual([0, 0, 0, 1, 2, 3, 4, 5]);
  });

  it("tells the core it has the focus each time it connects while it has it", async () => {
    const server = new FakeServer();
    await server.start();
    const focused = new Page(server, { hasFocus: () => true });
    const unfocused = new Page(server, { hasFocus: () => false, view: OTHER_VIEW });
    const [toFocused, toUnfocused] = [focused, unfocused].map((page) => {
      const execute = vi.spyOn(page.host.client, "execute");
      return () => execute.mock.calls.filter(([name]) => name === "view.reportFocus");
    });
    focused.start();
    unfocused.start();
    await Promise.all([focused.connected(), unfocused.connected()]);
    await vi.waitFor(() => expect(toFocused?.()).toEqual([["view.reportFocus", {}]]));

    await restart(server);
    await Promise.all([focused.connected(), unfocused.connected()]);

    await vi.waitFor(() =>
      expect(toFocused?.()).toEqual([
        ["view.reportFocus", {}],
        ["view.reportFocus", {}],
      ]),
    );
    expect(toUnfocused?.()).toEqual([]);
  });

  it("alerts an asset held for its view that it cannot show, but not one that is closing, and shows the rest", async () => {
    const server = new FakeServer();
    await server.start();
    const page = new Page(server).start();
    await page.connected();
    await page.opened(HERO);

    await restart(server);
    const bridge = server.bridge();
    const closing = await bridge.execute("asset.openInView", { path: GOLEM, view: VIEW });
    const gone = await bridge.execute("asset.openInView", { path: BLOB, view: VIEW });
    await bridge.execute("asset.openInView", { path: CRATE, view: VIEW });
    const refusals = new Map([
      [closing.assetId, new ArcueError("conflict", "Golem.fbx is closing, so its tab cannot move.")],
      [gone.assetId, new ArcueError("not-found", "Blob.fbx is not open.")],
    ]);
    const client = page.host.client;
    const execute = client.execute.bind(client);
    vi.spyOn(client, "execute").mockImplementation((name, input) => {
      const assetId = typeof input === "object" && input !== null && "assetId" in input ? input.assetId : null;
      const refusal = name === "view.moveAsset" && typeof assetId === "string" ? refusals.get(assetId) : undefined;
      return refusal ? Promise.reject(refusal) : execute(name, input);
    });
    const notify = vi.spyOn(page.store, "notify");
    await page.connected();

    await vi.waitFor(() => expect(page.paths()).toEqual([HERO, CRATE]));
    await vi.waitFor(() => expect(page.activePath()).toBe(CRATE));
    expect(notify.mock.calls.filter(([toast]) => toast.kind === "alert")).toEqual([
      [{ message: "Blob.fbx is not open.", kind: "alert" }],
    ]);
  });
});
