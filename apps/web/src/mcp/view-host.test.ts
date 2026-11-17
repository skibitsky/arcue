import type { ArcueCore } from "@arcue/core";
import { ManualClock } from "@arcue/core";
import type { RecordingPlatform, TestCore } from "@arcue/core/test-support";
import { fakeAsset, startTestCore } from "@arcue/core/test-support";
import type { ByteStream, ChannelPiece, CoreClient, WindowChannelInput, WindowChannelOutput } from "@arcue/protocol";
import {
  binaryFrameCodec,
  createMemoryChannel,
  createPeer,
  createRemoteClient,
  framedEndpoint,
  MCP_VIEW_META_KEY,
  messageChannel,
  ROUND_META_KEY,
  WINDOW_CHANNEL_META_KEY,
  WINDOW_CHANNEL_TOOL,
} from "@arcue/protocol";
import type { McpUiHostCapabilities } from "@modelcontextprotocol/ext-apps";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LocalHost } from "../local-host";
import { fromBase64, toBase64 } from "./tool-socket";
import type { McpViewOptions, ToolResult, ViewApp } from "./view-host";
import { McpView } from "./view-host";

const HERO = "/work/Hero.fbx";
const CRATE = "/work/Crate.fbx";
const VIEW = "3f9a0c1d2b4e";

/** One window's channel, as `arcue mcp` keeps it, on a connection of the view to the core. */
class Channel {
  readonly #toCore = new Set<(bytes: Uint8Array) => void>();
  readonly #ends = new Set<() => void>();
  readonly #out: ChannelPiece[] = [];
  #outBase = 0;
  #next = 0;
  #closed = false;
  #wake: (() => void) | null = null;

  constructor(core: ArcueCore, connection: string) {
    const stream: ByteStream = {
      write: (bytes) => {
        this.#out.push({ data: toBase64(bytes) });
        this.#wakeUp();
      },
      onData: (listener) => {
        this.#toCore.add(listener);
        return () => this.#toCore.delete(listener);
      },
      onClose: (listener) => {
        this.#ends.add(listener);
        return () => this.#ends.delete(listener);
      },
      close: () => this.close(),
    };
    const channel = messageChannel(stream, binaryFrameCodec);
    const peer = core.connect(framedEndpoint(channel), { connection, caller: "window", view: VIEW, browser: true });
    peer.onClose(() => channel.close());
  }

  send(seq: number, pieces: readonly ChannelPiece[]): number {
    for (const [index, piece] of pieces.entries()) {
      if (seq + index < this.#next) continue;
      const bytes = fromBase64(piece.data);
      queueMicrotask(() => {
        for (const listener of [...this.#toCore]) listener(bytes);
      });
      this.#next++;
    }
    return this.#next;
  }

  async receive(from: number): Promise<WindowChannelOutput> {
    this.#out.splice(0, from - this.#outBase);
    this.#outBase = from;
    if (this.#out.length === 0 && !this.#closed) await new Promise<void>((resolve) => (this.#wake = resolve));
    return { from, pieces: this.#out.slice(0, 2), closed: this.#closed && this.#out.length <= 2 };
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    for (const listener of [...this.#ends]) listener();
    this.#wakeUp();
  }

  #wakeUp(): void {
    const wake = this.#wake;
    this.#wake = null;
    wake?.();
  }
}

/** Arcue in the browser behind `arcue mcp`: `open_model` and the `window_channel` tool, in memory. */
class FakeArcue {
  #test: TestCore | null = null;
  readonly #channels = new Map<string, Channel>();
  readonly #shownAt = new Map<string, number>();
  #lastShown = 0;
  #connections = 0;

  async start(): Promise<this> {
    const files = {
      [HERO]: fakeAsset({ meshes: [{ name: "Body", grid: 1 }], clips: [{ name: "Armature|Walk", frames: 31 }] }),
      [CRATE]: fakeAsset({ meshes: [{ name: "Box", grid: 2 }] }),
    };
    this.#test = await startTestCore(files);
    this.#test.window.close();
    cores.push(this.#test.core);
    return this;
  }

  get platform(): RecordingPlatform {
    return this.#started().platform;
  }

  /** The command line's connection, as `open_model` uses it. */
  bridge(): CoreClient {
    const core = this.#running();
    const [coreSide, bridgeSide] = createMemoryChannel();
    core.connect(coreSide, { connection: `cli-${++this.#connections}`, caller: "bridge" });
    return createRemoteClient(createPeer(bridgeSide));
  }

  /** Shows a model in the view as `open_model` does, and answers what it answers. */
  async openModel(path: string, at: { clip?: string; frame?: number } = {}): Promise<ToolResult> {
    const { assetId } = await this.bridge().execute("asset.openInView", { path, view: VIEW, move: false, ...at });
    this.#lastShown++;
    this.#shownAt.set(path, this.#lastShown);
    const shown = { path, assetId, shownAt: this.#lastShown, ...at };
    return {
      content: [{ type: "text", text: `Arcue shows ${path} as ${assetId} in its view in this conversation.` }],
      structuredContent: { [MCP_VIEW_META_KEY]: shown },
      _meta: { [MCP_VIEW_META_KEY]: shown },
    };
  }

  async windowChannel({ op, channel, path, shownAt, seq, from, pieces }: WindowChannelInput) {
    if (op === "open") {
      const id = `channel${++this.#connections}`.padEnd(22, "0");
      this.#channels.set(id, new Channel(this.#running(), `browser-${this.#connections}`));
      const latest = path === undefined || shownAt === undefined || shownAt >= (this.#shownAt.get(path) ?? 0);
      if (path !== undefined && shownAt !== undefined && latest) this.#shownAt.set(path, shownAt);
      return { channel: id, latest };
    }
    const open = this.#channels.get(channel ?? "");
    if (!open) throw new Error("This window's channel is closed.");
    if (op === "send") return { next: open.send(seq ?? 0, pieces ?? []) };
    if (op === "receive") return open.receive(from ?? 0);
    open.close();
    this.#channels.delete(channel ?? "");
    return {};
  }

  /** Ends every window's channel, as when Arcue in the browser drops its sockets. */
  dropChannels(): void {
    for (const channel of this.#channels.values()) channel.close();
    this.#channels.clear();
  }

  async paths(): Promise<string[]> {
    const { assets } = await this.#running().client.query("asset.list", {});
    return assets.map((asset) => asset.path);
  }

  #running(): ArcueCore {
    return this.#started().core;
  }

  #started(): TestCore {
    if (!this.#test) throw new Error("No core runs.");
    return this.#test;
  }
}

/** The app that shows the view: it calls Arcue's tools and takes the messages the view posts. */
class FakeApp implements ViewApp {
  readonly messages: Parameters<ViewApp["sendMessage"]>[0][] = [];
  readonly contexts: Parameters<ViewApp["updateModelContext"]>[0][] = [];
  readonly toolCalls: string[] = [];
  round: ToolResult = { content: [] };
  /** Whether the chat refuses the messages the view posts. */
  refuseMessages = false;

  readonly arcue: FakeArcue;
  readonly capabilities: McpUiHostCapabilities;

  constructor(arcue: FakeArcue, capabilities: McpUiHostCapabilities = { serverTools: {} }) {
    this.arcue = arcue;
    this.capabilities = capabilities;
  }

  callServerTool: ViewApp["callServerTool"] = async ({ name, arguments: input }) => {
    this.toolCalls.push(name);
    if (name === "send_round") return this.round;
    if (name !== WINDOW_CHANNEL_TOOL) throw new Error(`No tool ${name}.`);
    try {
      const output = await this.arcue.windowChannel(input as WindowChannelInput);
      return { content: [], _meta: { [WINDOW_CHANNEL_META_KEY]: output } };
    } catch (error) {
      return { isError: true, content: [{ type: "text", text: error instanceof Error ? error.message : "" }] };
    }
  };

  sendMessage: ViewApp["sendMessage"] = async (params) => {
    this.messages.push(params);
    return this.refuseMessages ? { isError: true } : {};
  };

  updateModelContext: ViewApp["updateModelContext"] = async (params) => {
    this.contexts.push(params);
    return {};
  };

  getHostCapabilities = () => this.capabilities;
}

const views: McpView[] = [];
const cores: ArcueCore[] = [];

afterEach(() => {
  for (const view of views.splice(0)) view.dispose();
  for (const core of cores.splice(0)) core.dispose();
});

function startView(app: FakeApp, result: ToolResult, path = HERO, options: McpViewOptions = {}): McpView {
  const view = new McpView(app, options);
  views.push(view);
  view.toolInput({ path });
  view.toolResult(result);
  return view;
}

function hostOf(view: McpView): LocalHost {
  if (!view.host) throw new Error("The view has no host.");
  return view.host;
}

/** The paths of the view's tabs and the active one's. */
function tabs(view: McpView) {
  const store = view.host?.store;
  const state = store?.state.get();
  const pathOf = (id: string | null | undefined) => (id ? store?.session(id)?.state.get().summary.path : undefined);
  return { paths: state?.tabs.map((tab) => pathOf(tab.id)) ?? [], active: pathOf(state?.active) ?? null };
}

describe("McpView", () => {
  it("names the file while the tool runs, and says why it shows nothing when the tool fails or is cancelled", () => {
    const app = new FakeApp(new FakeArcue());
    const view = new McpView(app);
    views.push(view);
    expect(view.phase.get()).toEqual({ kind: "waiting", name: null });
    view.toolInput({ path: "/work/models/Hero.fbx" });
    expect(view.phase.get()).toEqual({ kind: "waiting", name: "Hero.fbx" });
    view.toolResult({ isError: true, content: [{ type: "text", text: "/work/Hero.txt is not a model." }] });
    expect(view.phase.get()).toEqual({ kind: "failed", message: "/work/Hero.txt is not a model." });

    const cancelled = new McpView(app);
    views.push(cancelled);
    cancelled.toolCancelled();
    expect(cancelled.phase.get()).toEqual({ kind: "failed", message: "Showing the model was cancelled." });

    const without = new McpView(app);
    views.push(without);
    without.toolResult({ content: [{ type: "text", text: "Arcue shows Hero.fbx in the Arcue app as a1." }] });
    expect(without.phase.get()).toEqual({
      kind: "failed",
      message: "Arcue shows Hero.fbx in the Arcue app as a1. This view can't show the model. Ask to see it again.",
    });
    expect(without.host).toBeNull();

    const empty = new McpView(app);
    views.push(empty);
    empty.toolResult({ content: [] });
    expect(empty.phase.get()).toEqual({
      kind: "failed",
      message: "This view can't show the model. Ask to see it again.",
    });
  });

  it("says it cannot show the model in an app that does not let it call tools", async () => {
    const arcue = await new FakeArcue().start();
    const view = startView(new FakeApp(arcue, { message: { text: {} } }), await arcue.openModel(HERO));

    expect(view.phase.get()).toEqual({
      kind: "failed",
      message: "This app doesn't let Arcue's view reach Arcue, so it can't show the model here.",
    });
    expect(view.host).toBeNull();
  });

  it("shows the model the tool opened, through the window's channel", async () => {
    const arcue = await new FakeArcue().start();
    const app = new FakeApp(arcue);
    const view = startView(app, await arcue.openModel(HERO));
    expect(view.phase.get()).toMatchObject({ kind: "opening", name: "Hero.fbx", model: { path: HERO } });
    await vi.waitFor(() => expect(view.phase.get().kind).toBe("shown"));
    expect(tabs(view)).toEqual({ paths: [HERO], active: HERO });
    expect(app.toolCalls.every((name) => name === WINDOW_CHANNEL_TOOL)).toBe(true);
  });

  it("shows its model again when the app shows the view again with the result the conversation kept", async () => {
    const arcue = await new FakeArcue().start();
    const result = await arcue.openModel(HERO, { clip: "Armature|Walk", frame: 12 });
    const first = startView(new FakeApp(arcue), result);
    await vi.waitFor(() => expect(first.phase.get().kind).toBe("shown"));
    first.dispose();

    const { _meta, ...kept } = result;
    const again = startView(new FakeApp(arcue), kept);
    await vi.waitFor(() => expect(again.phase.get().kind).toBe("shown"));
    expect(again.phase.get()).toMatchObject({ model: { path: HERO, clip: "Armature|Walk", frame: 12 } });
    expect(tabs(again)).toEqual({ paths: [HERO], active: HERO });
  });

  it("opens the model again at the clip and frame it was shown at when the core no longer has it", async () => {
    const arcue = await new FakeArcue().start();
    const result = await arcue.openModel(HERO, { clip: "Armature|Walk", frame: 12 });
    const { assets } = await arcue.bridge().query("asset.list", {});
    for (const asset of assets) await arcue.bridge().execute("asset.close", { assetId: asset.assetId });
    expect(await arcue.paths()).toEqual([]);

    const view = startView(new FakeApp(arcue), result);
    const execute = vi.spyOn(hostOf(view).client, "execute");
    await vi.waitFor(() => expect(tabs(view)).toEqual({ paths: [HERO], active: HERO }));
    expect(await arcue.paths()).toEqual([HERO]);
    expect(execute).toHaveBeenCalledWith("asset.open", { path: HERO, clip: "Armature|Walk", frame: 12 });
  });

  it("gives the model up to a later view, and takes it back when asked", async () => {
    const arcue = await new FakeArcue().start();
    const first = startView(new FakeApp(arcue), await arcue.openModel(HERO));
    await vi.waitFor(() => expect(tabs(first).active).toBe(HERO));

    const second = startView(new FakeApp(arcue), await arcue.openModel(HERO));
    await vi.waitFor(() => expect(tabs(second).active).toBe(HERO));
    await vi.waitFor(() =>
      expect(first.phase.get()).toMatchObject({ kind: "elsewhere", name: "Hero.fbx", note: null }),
    );
    expect(tabs(first).paths).toEqual([]);
    expect(second.phase.get().kind).toBe("shown");

    await first.take();
    expect(tabs(first)).toEqual({ paths: [HERO], active: HERO });
    await vi.waitFor(() => expect(second.phase.get().kind).toBe("elsewhere"));
    expect(first.phase.get().kind).toBe("shown");
  });

  it("leaves the model to the later view when an earlier view connects after it", async () => {
    const arcue = await new FakeArcue().start();
    const earlier = await arcue.openModel(HERO);
    const later = startView(new FakeApp(arcue), await arcue.openModel(HERO));
    await vi.waitFor(() => expect(tabs(later).active).toBe(HERO));

    const view = startView(new FakeApp(arcue), earlier);
    expect(view.phase.get().kind).toBe("opening");
    await vi.waitFor(() => expect(view.phase.get().kind).toBe("elsewhere"));
    expect(tabs(view).paths).toEqual([]);
    expect(tabs(later).paths).toEqual([HERO]);
    expect(later.phase.get().kind).toBe("shown");
  });

  it("lets go of Arcue a while after a later view took its model, and connects again to take it back", async () => {
    const timers = new ManualClock(0);
    const arcue = await new FakeArcue().start();
    const first = startView(new FakeApp(arcue), await arcue.openModel(HERO), HERO, {
      setTimer: (delayMs, callback) => timers.setTimer(delayMs, callback),
    });
    await vi.waitFor(() => expect(first.phase.get().kind).toBe("shown"));
    const second = startView(new FakeApp(arcue), await arcue.openModel(HERO));
    await vi.waitFor(() => expect(first.phase.get().kind).toBe("elsewhere"));
    expect(first.host).not.toBeNull();

    timers.advance(5000);
    expect(first.host).toBeNull();
    await first.take();
    expect(first.phase.get().kind).toBe("shown");
    expect(tabs(first)).toEqual({ paths: [HERO], active: HERO });
    await vi.waitFor(() => expect(second.phase.get().kind).toBe("elsewhere"));
  });

  it("stays superseded when the core shows another model in it", async () => {
    const arcue = await new FakeArcue().start();
    const first = startView(new FakeApp(arcue), await arcue.openModel(HERO));
    await vi.waitFor(() => expect(first.phase.get().kind).toBe("shown"));
    startView(new FakeApp(arcue), await arcue.openModel(HERO));
    await vi.waitFor(() => expect(first.phase.get().kind).toBe("elsewhere"));
    first.host?.store.reportFocus();
    await new Promise((resolve) => setTimeout(resolve, 50));

    await arcue.openModel(CRATE);
    await vi.waitFor(() => expect(tabs(first).paths).toEqual([CRATE]));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(first.phase.get().kind).toBe("elsewhere");
  });

  it("says a later view took the model while it was away", async () => {
    const arcue = await new FakeArcue().start();
    const first = startView(new FakeApp(arcue), await arcue.openModel(HERO));
    await vi.waitFor(() => expect(first.phase.get().kind).toBe("shown"));

    arcue.dropChannels();
    const second = startView(new FakeApp(arcue), await arcue.openModel(HERO));
    await vi.waitFor(() => expect(second.phase.get().kind).toBe("shown"));
    await vi.waitFor(() => expect(first.phase.get().kind).toBe("elsewhere"), { timeout: 5000 });
    expect(tabs(second).paths).toEqual([HERO]);
  });

  it("says why it could not take its model back", async () => {
    const arcue = await new FakeArcue().start();
    const first = startView(new FakeApp(arcue), await arcue.openModel(HERO));
    await vi.waitFor(() => expect(first.phase.get().kind).toBe("shown"));
    const second = startView(new FakeApp(arcue), await arcue.openModel(HERO));
    await vi.waitFor(() => expect(first.phase.get().kind).toBe("elsewhere"));
    second.dispose();
    const bridge = arcue.bridge();
    for (const asset of (await bridge.query("asset.list", {})).assets) {
      await bridge.execute("asset.close", { assetId: asset.assetId });
    }
    await arcue.platform.remove(HERO);

    await first.take();
    expect(first.phase.get()).toMatchObject({ kind: "elsewhere", note: expect.stringContaining("Hero.fbx") });
  });

  it("keeps showing its model when the core shows another model in it", async () => {
    const arcue = await new FakeArcue().start();
    const view = startView(new FakeApp(arcue), await arcue.openModel(HERO));
    await vi.waitFor(() => expect(tabs(view).active).toBe(HERO));
    await arcue.openModel(CRATE);
    await vi.waitFor(() => expect(tabs(view).paths).toEqual([HERO, CRATE]));
    expect(view.phase.get().kind).toBe("shown");
  });

  it("sends the queue to the chat, with the screenshots in the model's context where the chat takes no images", async () => {
    const arcue = await new FakeArcue().start();
    const app = new FakeApp(arcue, {
      serverTools: {},
      message: { text: {} },
      updateModelContext: { text: {}, image: {} },
    });
    const view = startView(app, await arcue.openModel(HERO));
    await vi.waitFor(() => expect(tabs(view).active).toBe(HERO));
    const store = view.host?.store;
    const session = store?.session(store.state.get().active ?? "");
    if (!session) throw new Error("The view shows no model.");
    expect(session.sendLabel).toBe("Send to chat");

    const prompt = { type: "text" as const, text: "Round 1 of Hero.fbx" };
    const label = { type: "text" as const, text: "Comment 1:" };
    const screenshot = { type: "image" as const, data: "iVBORw0KGgo=", mimeType: "image/png" };
    app.round = {
      content: [prompt, label, screenshot],
      _meta: { [ROUND_META_KEY]: { round: 1, comments: ["c01"] } },
    };
    await view.host?.client.execute("comment.create", {
      assetId: session.assetId,
      version: session.state.get().summary.version ?? "",
      time: { kind: "none" },
      target: null,
      camera: { position: [0, 1, 3], target: [0, 0, 0], up: [0, 1, 0], fov: 30 },
      context: { vertexCount: 0, bones: [], centroid: null, joints: [], viewLabel: "front" },
      text: "The fist clips through the thigh.",
      screenshot: null,
    });
    await vi.waitFor(() => expect(session.state.get().review?.queue).toHaveLength(1));
    await session.copyPrompt();

    expect(app.toolCalls).toContain("send_round");
    expect(app.messages).toEqual([{ role: "user", content: [prompt] }]);
    expect(app.contexts).toEqual([{ content: [label, screenshot] }]);
    expect(store?.state.get().toast?.message).toBe("Sent 1 comment");
  });

  it("offers the round's prompt to copy when the chat refuses it, and posts nothing that sent no round", async () => {
    const arcue = await new FakeArcue().start();
    const app = new FakeApp(arcue, { serverTools: {}, message: { text: {}, image: {} } });
    const view = startView(app, await arcue.openModel(HERO));
    await vi.waitFor(() => expect(tabs(view).active).toBe(HERO));
    const store = view.host?.store;
    const session = store?.session(store.state.get().active ?? "");
    if (!session) throw new Error("The view shows no model.");
    await view.host?.client.execute("comment.create", {
      assetId: session.assetId,
      version: session.state.get().summary.version ?? "",
      time: { kind: "none" },
      target: null,
      camera: { position: [0, 1, 3], target: [0, 0, 0], up: [0, 1, 0], fov: 30 },
      context: { vertexCount: 0, bones: [], centroid: null, joints: [], viewLabel: "front" },
      text: "The fist clips through the thigh.",
      screenshot: null,
    });
    await vi.waitFor(() => expect(session.state.get().review?.queue).toHaveLength(1));

    app.round = { content: [{ type: "text", text: "Hero.fbx has no comments in its queue." }] };
    await session.copyPrompt();
    expect(app.messages).toEqual([]);
    expect(store?.state.get().toast?.message).toBe("Hero.fbx has no comments in its queue.");

    app.refuseMessages = true;
    app.round = {
      content: [{ type: "text", text: "Round 2 of Hero.fbx" }],
      _meta: { [ROUND_META_KEY]: { round: 2, comments: ["c01"] } },
    };
    await session.copyPrompt();
    expect(app.messages).toHaveLength(1);
    expect(store?.state.get().copySheet).toEqual({ round: 2, prompt: "Round 2 of Hero.fbx" });
    expect(store?.state.get().toast?.message).toBe("Saved round 2. Copy the selected text.");
  });

  it("copies the prompt as Arcue in the browser does where the app takes no messages", async () => {
    const arcue = await new FakeArcue().start();
    const view = startView(new FakeApp(arcue, { serverTools: {} }), await arcue.openModel(HERO));
    await vi.waitFor(() => expect(tabs(view).active).toBe(HERO));
    const store = view.host?.store;
    expect(store?.session(store.state.get().active ?? "")?.sendLabel).toBeNull();
  });
});
