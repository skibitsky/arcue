import type { IncomingRequest, SetTimer, ShownModel, WindowChannelOutput } from "@arcue/protocol";
import {
  ArcueError,
  MCP_VIEW_META_KEY,
  ROUND_META_KEY,
  roundMetaSchema,
  shownModelSchema,
  WINDOW_CHANNEL_META_KEY,
  WINDOW_CHANNEL_TOOL,
  windowChannelOutputSchema,
} from "@arcue/protocol";
import type { Readable, RoundSender } from "@arcue/ui";
import { dataUrls, RoundNotPosted, Store } from "@arcue/ui";
import type { App } from "@modelcontextprotocol/ext-apps";
import { LocalHost } from "../local-host";
import type { ChannelCall } from "./tool-socket";
import { ChannelClosed, ToolSocket } from "./tool-socket";

/** What the view needs of the app that shows it. */
export type ViewApp = Pick<App, "callServerTool" | "sendMessage" | "updateModelContext" | "getHostCapabilities">;

/** What a tool call answers. */
export type ToolResult = Awaited<ReturnType<App["callServerTool"]>>;

type ContentBlock = ToolResult["content"][number];

export type ViewPhase =
  /** The tool still runs. */
  | { kind: "waiting"; name: string | null }
  /** The tool failed or was cancelled, or the view cannot show the model. */
  | { kind: "failed"; message: string }
  /** The view connects and takes the model. */
  | { kind: "opening"; model: ShownModel; name: string }
  /** The view shows its model. */
  | { kind: "shown"; model: ShownModel; name: string }
  /** A later view shows the model, so this one shows none until it takes the model back; the note says why it could not. */
  | { kind: "elsewhere"; model: ShownModel; name: string; note: string | null };

export interface McpViewOptions {
  setTimer?: SetTimer;
}

const NOTHING_SHOWN = "The tool showed no model.";
const NOT_KEPT = "This view can't show the model. Ask to see it again.";
const CANCELLED = "Showing the model was cancelled.";
const NO_TOOLS = "This app doesn't let Arcue's view reach Arcue, so it can't show the model here.";
const SEND_TIMEOUT_MS = 5 * 60_000;
/** How long a view that a later one superseded stays connected, so its last answers reach the core. */
const LEAVE_MS = 5000;
/** How often the view tries to take its model when the connection drops meanwhile. */
const TAKE_ATTEMPTS = 3;

const defaultTimer: SetTimer = (delayMs, callback) => {
  const handle = setTimeout(callback, delayMs);
  return () => clearTimeout(handle);
};

/**
 * Arcue's view in an app that shows MCP Apps: a window of Arcue in the browser on the channel `window_channel` carries,
 * which shows the model its `open_model` result names. When `open` says no later view showed that model, the view
 * takes it from any other window of its view. A view that a later one superseded shows a note instead, and connects
 * again only when asked to take the model back.
 */
export class McpView {
  readonly #phase: Store<ViewPhase> = new Store<ViewPhase>({ kind: "waiting", name: null });
  readonly #app: ViewApp;
  readonly #setTimer: SetTimer;
  #shown: { model: ShownModel; name: string } | null = null;
  #host: LocalHost | null = null;
  #socket: ToolSocket | null = null;
  #stops: (() => void)[] = [];
  #taking: Promise<void> | null = null;
  #cancelLeave: (() => void) | null = null;

  constructor(app: ViewApp, options: McpViewOptions = {}) {
    this.#app = app;
    this.#setTimer = options.setTimer ?? defaultTimer;
  }

  get phase(): Readable<ViewPhase> {
    return this.#phase;
  }

  get host(): LocalHost | null {
    return this.#host;
  }

  /** The tool's arguments arrived, which name the file. */
  toolInput(args: Record<string, unknown> | undefined): void {
    const phase = this.#phase.get();
    if (phase.kind !== "waiting") return;
    const path = typeof args?.path === "string" ? args.path : null;
    this.#phase.set({ kind: "waiting", name: path === null ? null : fileName(path) });
  }

  toolCancelled(): void {
    if (this.#phase.get().kind === "waiting") this.#phase.set({ kind: "failed", message: CANCELLED });
  }

  /**
   * The tool's result arrived: its error, or the model to show, which the view connects for. An app that shows the view
   * again gives it the result as the conversation kept it, which may hold the model only in its structured content.
   */
  toolResult(result: ToolResult): void {
    if (this.#shown || this.#phase.get().kind === "failed") return;
    if (result.isError) {
      this.fail(textOf(result) || NOTHING_SHOWN);
      return;
    }
    const shown = shownModelSchema.safeParse(shownIn(result.structuredContent) ?? result._meta?.[MCP_VIEW_META_KEY]);
    if (!shown.success) {
      const text = textOf(result);
      this.fail(text ? `${text} ${NOT_KEPT}` : NOT_KEPT);
      return;
    }
    if (this.#app.getHostCapabilities()?.serverTools === undefined) {
      this.fail(NO_TOOLS);
      return;
    }
    this.#shown = { model: shown.data, name: fileName(shown.data.path) };
    this.#phase.set({ kind: "opening", ...this.#shown });
    const host = this.#connect();
    void this.#whenConnected(host).then(() => {
      if (this.#host !== host) return;
      if (this.#socket?.latest === false) this.#leave();
      else void this.take();
    });
  }

  /** Shows the model here, taking it from the window that shows it, or opening it again when the core has none. */
  take(): Promise<void> {
    this.#taking ??= this.#take().finally(() => {
      this.#taking = null;
    });
    return this.#taking;
  }

  /** Shows why the view shows no model, and lets go of Arcue. */
  fail(message: string): void {
    this.#phase.set({ kind: "failed", message });
    this.#disconnect();
  }

  dispose(): void {
    this.#disconnect();
  }

  #connect(): LocalHost {
    const shown = this.#shown;
    if (!shown) throw new Error("The view shows no model.");
    const host = new LocalHost({
      openSocket: () => {
        this.#socket = new ToolSocket({
          call: this.#call,
          shown: { path: shown.model.path, shownAt: shown.model.shownAt },
          setTimer: this.#setTimer,
        });
        return this.#socket;
      },
      view: null,
      storage: null,
      setTimer: this.#setTimer,
      hasFocus: () => this.#socket?.latest === true,
      onRequest: (request) => this.#followRequest(request),
      onReopened: () => void this.#checkShown(host),
      imageUrls: dataUrls,
      ...(this.#app.getHostCapabilities()?.message ? { sendRound: this.#sender } : {}),
    });
    this.#host = host;
    host.start();
    return host;
  }

  #disconnect(): void {
    this.#cancelLeave?.();
    this.#cancelLeave = null;
    for (const stop of this.#stops.splice(0)) stop();
    this.#host?.dispose();
    this.#host = null;
    this.#socket = null;
  }

  /** Resolves once the host's client connects, or at once when the view let go of the host. */
  #whenConnected(host: LocalHost): Promise<void> {
    if (host.client.connectionState === "connected") return Promise.resolve();
    return new Promise<void>((resolve) => {
      const done = () => {
        stop();
        this.#stops = this.#stops.filter((entry) => entry !== done);
        resolve();
      };
      const stop = host.client.onConnectionChange((state) => {
        if (state === "connected") done();
      });
      this.#stops.push(done);
    });
  }

  async #take(): Promise<void> {
    const shown = this.#shown;
    const phase = this.#phase.get();
    if (!shown || phase.kind === "failed" || phase.kind === "waiting") return;
    const back = phase.kind === "elsewhere";
    this.#cancelLeave?.();
    this.#cancelLeave = null;
    if (phase.kind !== "shown") this.#phase.set({ kind: "opening", ...shown });
    const host = this.#host ?? this.#connect();
    for (let attempt = 1; ; attempt++) {
      await this.#whenConnected(host);
      if (this.#host !== host) return;
      try {
        const assetId = await this.#modelIn(host);
        if (this.#host !== host) return;
        host.store.activate(assetId);
        host.store.reportFocus();
        this.#phase.set({ kind: "shown", ...shown });
        return;
      } catch (error) {
        if (this.#host !== host) return;
        const lost = error instanceof ArcueError && error.code === "disconnected";
        if (lost && attempt < TAKE_ATTEMPTS) continue;
        const message = lost ? null : error instanceof Error ? error.message : String(error);
        if (this.#phase.get().kind === "shown") {
          if (message !== null) host.store.notify({ message, kind: "alert" });
        } else if (back || message === null) this.#leave(message);
        else this.#phase.set({ kind: "failed", message });
        return;
      }
    }
  }

  /** Moves the model's tab here from the window that shows it, or opens it again where it was shown, and returns its asset. */
  async #modelIn(host: LocalHost): Promise<string> {
    const { path = "", clip, frame } = this.#shown?.model ?? {};
    const { assets } = await host.client.query("asset.list", {});
    const assetId = assets.find((entry) => entry.path === path)?.assetId;
    if (assetId === undefined) {
      const at = { ...(clip !== undefined ? { clip } : {}), ...(frame !== undefined ? { frame } : {}) };
      return (await host.client.execute("asset.open", { path, ...at })).assetId;
    }
    if (!host.store.session(assetId)) await host.client.execute("view.moveAsset", { assetId });
    return assetId;
  }

  /** The asset of the view's model when this window shows it, else null. */
  async #shownHere(host: LocalHost): Promise<string | null> {
    const path = this.#shown?.model.path;
    const { assets } = await host.client.query("asset.list", {});
    const assetId = assets.find((entry) => entry.path === path)?.assetId;
    return assetId !== undefined && host.store.session(assetId) ? assetId : null;
  }

  /** After a reconnect, says a later view shows the model when another view took it while this one was away. */
  async #checkShown(host: LocalHost): Promise<void> {
    if (this.#phase.get().kind !== "shown" || this.#taking) return;
    const here = await this.#shownHere(host).catch(() => undefined);
    if (here === null && this.#host === host && this.#phase.get().kind === "shown" && !this.#taking) this.#leave();
  }

  /** Shows a note in place of the model, and lets go of Arcue once the core had the view's answers. */
  #leave(note: string | null = null): void {
    const shown = this.#shown;
    if (!shown) return;
    this.#phase.set({ kind: "elsewhere", ...shown, note });
    this.#cancelLeave?.();
    this.#cancelLeave = this.#setTimer(LEAVE_MS, () => {
      this.#cancelLeave = null;
      if (this.#phase.get().kind === "elsewhere") this.#disconnect();
    });
  }

  /**
   * Says a later view shows the model once the page gave the model's tab up for another window, and shows the model
   * the core shows here once it did. A reconnect, which reopens the tabs, changes neither.
   */
  #followRequest({ kind, name, input }: IncomingRequest): (() => void) | undefined {
    const host = this.#host;
    if (kind !== "command" || !host) return undefined;
    const assetId = typeof input === "object" && input !== null && "assetId" in input ? input.assetId : null;
    if (typeof assetId !== "string") return undefined;
    if (name === "view.showAsset") {
      return () => {
        if (this.#phase.get().kind !== "elsewhere") return;
        void this.#shownHere(host)
          .then((here) => {
            const shown = this.#shown;
            if (here === null || !shown || this.#host !== host || this.#phase.get().kind !== "elsewhere") return;
            this.#cancelLeave?.();
            this.#cancelLeave = null;
            this.#phase.set({ kind: "shown", ...shown });
          })
          .catch(() => undefined);
      };
    }
    if (name !== "view.releaseAsset") return undefined;
    const path = host.store.session(assetId)?.state.get().summary.path;
    return () => {
      if (this.#phase.get().kind === "shown" && path === this.#shown?.model.path) this.#leave();
    };
  }

  /** Sends the queue through `send_round`, and posts its prompt to the chat with the screenshots where it takes them. */
  #sender: RoundSender = {
    label: "Send to chat",
    send: async (asset) => {
      const sent = await this.#app.callServerTool(
        { name: "send_round", arguments: { path: asset.path } },
        { timeout: SEND_TIMEOUT_MS },
      );
      const round = roundMetaSchema.safeParse(sent._meta?.[ROUND_META_KEY]);
      if (sent.isError || !round.success) throw new Error(textOf(sent) || "Arcue could not send the comments.");
      await this.#post(sent.content, round.data.round);
    },
  };

  /** Posts a round's prompt to the chat. Where the chat takes no images, the screenshots go to the model's context. */
  async #post(content: readonly ContentBlock[], round: number): Promise<void> {
    const capabilities = this.#app.getHostCapabilities();
    let message = [...content];
    if (capabilities?.message?.image === undefined) {
      const shots = content.filter((block, index) => block.type === "image" || content[index + 1]?.type === "image");
      message = content.filter((block) => block.type === "text" && !shots.includes(block));
      if (shots.length > 0 && capabilities?.updateModelContext?.image !== undefined) {
        await this.#app.updateModelContext({ content: shots }).catch(() => undefined);
      }
    }
    const posted = await this.#app.sendMessage({ role: "user", content: message }).catch(() => ({ isError: true }));
    if (posted.isError) {
      const prompt = content[0]?.type === "text" ? content[0].text : "";
      throw new RoundNotPosted(round, prompt);
    }
  }

  #call: ChannelCall = async (input) => {
    const result = await this.#app.callServerTool({ name: WINDOW_CHANNEL_TOOL, arguments: { ...input } });
    if (result.isError) throw new ChannelClosed(textOf(result));
    const output = windowChannelOutputSchema.safeParse(result._meta?.[WINDOW_CHANNEL_META_KEY]);
    if (!output.success) throw new ChannelClosed("The server answered the window's channel with nothing it reads.");
    return output.data satisfies WindowChannelOutput;
  };
}

function shownIn(structured: unknown): unknown {
  return typeof structured === "object" && structured !== null && MCP_VIEW_META_KEY in structured
    ? structured[MCP_VIEW_META_KEY]
    : undefined;
}

function textOf(result: ToolResult): string {
  return (result.content ?? [])
    .flatMap((block) => (block.type === "text" && typeof block.text === "string" ? [block.text] : []))
    .join("\n")
    .trim();
}

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}
