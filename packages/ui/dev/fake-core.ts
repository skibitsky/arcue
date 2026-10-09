import type {
  AssetSummary,
  CommandArgs,
  CommandInput,
  CommandName,
  CommandOutput,
  Comment,
  ConnectionState,
  CoreClient,
  EventName,
  EventPayload,
  IncomingRequest,
  QueryArgs,
  QueryInput,
  QueryName,
  QueryOutput,
  ReviewFile,
  Settings,
  TimeSelection,
  ViewState,
} from "@arcue/protocol";
import { ArcueError, commands, queries, reviewFileSchema } from "@arcue/protocol";
import type { SceneDescription, SpatialAnchor, TimeAnchor, Vec3 } from "@arcue/scene";
import { countInRanges, isDefaultPartView } from "@arcue/scene";

export interface FakeAssetSeed {
  scene: SceneDescription;
  review: ReviewFile;
  version: string;
  /** Screenshots of seeded comments, made when first asked for. */
  screenshot?: (comment: Comment, scene: SceneDescription) => Promise<Uint8Array | null>;
}

export interface FakeCoreOptions {
  /** The asset at a path, or null when the path cannot be opened. */
  catalog: (path: string) => FakeAssetSeed | null;
  /** How long a fake import takes. */
  loadDelayMs?: number;
  /** Whether `round.copy` reaches the clipboard itself, as the desktop core does. The web host's core cannot. */
  coreClipboard?: boolean;
  now?: () => Date;
}

interface FakeAsset {
  summary: AssetSummary;
  seed: FakeAssetSeed | null;
  review: ReviewFile;
  screenshots: Map<string, Uint8Array | null>;
  viewState: ViewState | null;
}

type WindowHandler = (request: IncomingRequest) => Promise<unknown>;
type CommandHandlers = {
  [Name in CommandName]: (args: CommandArgs<Name>) => Promise<CommandOutput<Name>> | CommandOutput<Name>;
};
type QueryHandlers = {
  [Name in QueryName]: (args: QueryArgs<Name>) => Promise<QueryOutput<Name>> | QueryOutput<Name>;
};

/**
 * An in-memory core for the dev harness and tests. It validates every call with the protocol's schemas, keeps review
 * data in memory, checks it against `reviewFileSchema` before every event, and routes view commands to the window.
 */
export class FakeCoreClient implements CoreClient {
  #connectionState: ConnectionState = "connected";
  readonly #options: FakeCoreOptions;
  readonly #assets = new Map<string, FakeAsset>();
  readonly #listeners = new Map<string, Set<(payload: never) => void>>();
  readonly #connectionListeners = new Set<(state: ConnectionState) => void>();
  readonly #calls: { name: string; input: unknown }[] = [];
  #window: WindowHandler | null = null;
  #nextAsset = 1;
  #lastPrompt: string | null = null;
  #eventsMuted = false;
  #settings: Settings = { coordinates: "y-up" };

  constructor(options: FakeCoreOptions) {
    this.#options = options;
  }

  get connectionState(): ConnectionState {
    return this.#connectionState;
  }

  /** Every command and query so far, for tests. */
  get calls(): readonly { name: string; input: unknown }[] {
    return this.#calls;
  }

  get lastPrompt(): string | null {
    return this.#lastPrompt;
  }

  /** Where the core sends view commands: the window's `handleRequest`. */
  connectWindow(handler: WindowHandler): void {
    this.#window = handler;
  }

  /** Drops events instead of delivering them, as a broken connection would. */
  setEventsMuted(muted: boolean): void {
    this.#eventsMuted = muted;
  }

  setConnectionState(state: ConnectionState): void {
    this.#connectionState = state;
    for (const listener of [...this.#connectionListeners]) listener(state);
  }

  onConnectionChange(listener: (state: ConnectionState) => void): () => void {
    this.#connectionListeners.add(listener);
    return () => {
      this.#connectionListeners.delete(listener);
    };
  }

  subscribe<Name extends EventName>(name: Name, listener: (payload: EventPayload<Name>) => void): () => void {
    const set = this.#listeners.get(name) ?? new Set();
    this.#listeners.set(name, set);
    set.add(listener as (payload: never) => void);
    return () => {
      set.delete(listener as (payload: never) => void);
    };
  }

  async execute<Name extends CommandName>(name: Name, input: CommandInput<Name>): Promise<CommandOutput<Name>> {
    this.#calls.push({ name, input });
    const parsed = commands[name].input.safeParse(input);
    if (!parsed.success) throw new ArcueError("invalid-input", `Invalid input for "${name}": ${parsed.error.message}`);
    const definition = commands[name];
    if (definition.runsIn === "view" && name !== "view.showAsset") {
      if (!this.#window) throw new ArcueError("unavailable", "No window is connected.");
      return (await this.#window({ kind: "command", name, input: parsed.data })) as CommandOutput<Name>;
    }
    const handler = this.#commands[name] as (
      args: CommandArgs<Name>,
    ) => Promise<CommandOutput<Name>> | CommandOutput<Name>;
    return handler(parsed.data as CommandArgs<Name>);
  }

  async query<Name extends QueryName>(name: Name, input: QueryInput<Name>): Promise<QueryOutput<Name>> {
    this.#calls.push({ name, input });
    const parsed = queries[name].input.safeParse(input);
    if (!parsed.success) throw new ArcueError("invalid-input", `Invalid input for "${name}".`);
    const handler = this.#queries[name] as (args: QueryArgs<Name>) => Promise<QueryOutput<Name>> | QueryOutput<Name>;
    return structuredClone(await handler(parsed.data as QueryArgs<Name>));
  }

  /** Simulates a new export of the file: the asset reloads with a new version. */
  async simulateExport(assetId: string, options: { fail?: string } = {}): Promise<void> {
    const asset = this.#asset(assetId);
    this.#setSummary(asset, { status: "loading", error: null });
    await this.#delay();
    if (options.fail) {
      this.#setSummary(asset, { status: "failed", error: options.fail });
      return;
    }
    const version = Math.random().toString(16).slice(2, 9);
    const now = this.#now().toISOString();
    asset.review = {
      ...asset.review,
      versions: [
        ...asset.review.versions,
        { id: version, fileModifiedAt: now, loadedAt: now, exporter: "Blender 5.2 FBX", meshes: [] },
      ],
    };
    this.#setSummary(asset, { status: "ready", version, error: null });
    this.#emitReview(asset);
  }

  /** As the core does, a time or target must be picked on the version on screen. */
  #pickedOn(asset: FakeAsset, version: string): void {
    const current = asset.summary.version;
    if (version !== current) {
      throw new ArcueError(
        "conflict",
        `The target was picked on version ${version}, but the asset now shows ${current}.`,
      );
    }
  }

  #now(): Date {
    return this.#options.now?.() ?? new Date();
  }

  #delay(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, this.#options.loadDelayMs ?? 0));
  }

  #emit<Name extends EventName>(name: Name, payload: EventPayload<Name>): void {
    if (this.#eventsMuted) return;
    const copy = structuredClone(payload);
    queueMicrotask(() => {
      for (const listener of [...(this.#listeners.get(name) ?? [])]) {
        (listener as (payload: EventPayload<Name>) => void)(copy);
      }
    });
  }

  #asset(assetId: string): FakeAsset {
    const asset = this.#assets.get(assetId);
    if (!asset) throw new ArcueError("not-found", `No open asset ${assetId}.`);
    return asset;
  }

  #setSummary(asset: FakeAsset, fields: Partial<AssetSummary>): void {
    asset.summary = { ...asset.summary, ...fields };
    this.#emit("asset.updated", { asset: asset.summary });
  }

  #emitReview(asset: FakeAsset): void {
    asset.review = reviewFileSchema.parse(asset.review);
    this.#emit("review.changed", { assetId: asset.summary.assetId, review: asset.review });
  }

  #comment(asset: FakeAsset, commentId: string): Comment {
    const comment = asset.review.comments.find((candidate) => candidate.id === commentId);
    if (!comment) throw new ArcueError("not-found", `No comment ${commentId}.`);
    return comment;
  }

  #replaceComment(asset: FakeAsset, comment: Comment): void {
    asset.review = {
      ...asset.review,
      comments: asset.review.comments.map((candidate) => (candidate.id === comment.id ? comment : candidate)),
    };
  }

  #timeAnchor(asset: FakeAsset, time: TimeSelection): TimeAnchor {
    if (time.kind === "none") return time;
    const clip = asset.seed?.scene.clips.find((candidate) => candidate.name === time.clip);
    if (!clip) throw new ArcueError("not-found", `No clip named "${time.clip}".`);
    return { ...time, clipDisplayName: clip.displayName };
  }

  #restPositions(target: SpatialAnchor | null): Vec3[] {
    if (!target) return [];
    const count = target.kind === "surface" ? 3 : countInRanges(target.vertices);
    return Array.from({ length: count }, (): Vec3 => [0, 1, 0]);
  }

  async #openAsset(args: CommandArgs<"asset.open">): Promise<CommandOutput<"asset.open">> {
    const window = this.#window;
    if (!window) throw new ArcueError("unavailable", "No window is connected.");
    const existing = [...this.#assets.values()].find((asset) => asset.summary.path === args.path);
    const show = (assetId: string) =>
      window({
        kind: "command",
        name: "view.showAsset",
        input: {
          assetId,
          ...(args.clip !== undefined ? { clip: args.clip } : {}),
          ...(args.frame !== undefined ? { frame: args.frame } : {}),
        },
      });
    if (existing) {
      await show(existing.summary.assetId);
      return { assetId: existing.summary.assetId };
    }
    const assetId = `a${this.#nextAsset++}`;
    const seed = this.#options.catalog(args.path);
    const name = args.path.split("/").pop() ?? args.path;
    const asset: FakeAsset = {
      summary: { assetId, path: args.path, name, status: "loading", version: null, error: null },
      seed,
      review: seed?.review ?? {
        schemaVersion: 1,
        asset: { path: args.path },
        versions: [],
        comments: [],
        queue: [],
        rounds: [],
        nextCommentNumber: 1,
      },
      screenshots: new Map(),
      viewState: null,
    };
    this.#assets.set(assetId, asset);
    await show(assetId);
    this.#emit("asset.opened", { asset: asset.summary });
    void this.#delay().then(() => {
      if (!this.#assets.has(assetId)) return;
      if (!seed) {
        this.#setSummary(asset, { status: "failed", error: "This file is not in the sample set." });
        return;
      }
      this.#setSummary(asset, { status: "ready", version: seed.version });
      this.#emitReview(asset);
    });
    return { assetId };
  }

  /** The fake keeps no files; composition edits only name the file they would write. */
  #compositionPath(assetId: string): string {
    return this.#asset(assetId).summary.path.replace(/\.[^./]*$/, ".arcue");
  }

  #buildPrompt(asset: FakeAsset, round: number, comments: Comment[]): string {
    const lines = [
      `3D review · round ${round} · ${comments.length} comment${comments.length === 1 ? "" : "s"}`,
      `Asset: ${asset.summary.path}`,
      `Version ${asset.summary.version ?? "unknown"}`,
      `Data and screenshots: .arcue/reviews/${asset.review.asset.path}/rounds/round-${round}/`,
    ];
    comments.forEach((comment, index) => {
      const time =
        comment.time.kind === "none"
          ? "Rest pose"
          : comment.time.kind === "frame"
            ? `Clip "${comment.time.clipDisplayName}", frame ${comment.time.frame}`
            : `Clip "${comment.time.clipDisplayName}", frames ${comment.time.start}–${comment.time.end}`;
      const target = comment.target
        ? `${comment.target.kind === "region" ? "region" : "point"} on "${comment.target.mesh}"`
        : "no surface target";
      const followUp = comment.followUps[comment.followUps.length - 1];
      lines.push("", `${index + 1}. ${time} · ${target}`);
      if (comment.context.screenshot) {
        lines.push(`   View: ${comment.context.viewLabel} · screenshot: ${comment.id}.png`);
      }
      if (comment.reopenedFrom !== null && followUp) {
        lines.push(`   Follow-up to round ${followUp.afterRound}: "${followUp.text}"`);
      }
      lines.push(`   "${comment.text}"`);
    });
    return lines.join("\n");
  }

  readonly #commands: CommandHandlers = {
    "asset.open": (args) => this.#openAsset(args),
    "asset.close": ({ assetId }) => {
      this.#asset(assetId);
      this.#assets.delete(assetId);
      this.#emit("asset.closed", { assetId });
    },
    "asset.reload": async ({ assetId }) => {
      await this.simulateExport(assetId);
      return { version: this.#asset(assetId).summary.version ?? "" };
    },
    "comment.create": (args) => {
      const asset = this.#asset(args.assetId);
      this.#pickedOn(asset, args.version);
      const id = `c${asset.review.nextCommentNumber}`;
      const now = this.#now().toISOString();
      const version = asset.summary.version ?? "unknown";
      const comment: Comment = {
        id,
        text: args.text,
        status: "draft",
        createdAt: now,
        updatedAt: now,
        madeOnVersion: version,
        time: this.#timeAnchor(asset, args.time),
        target: args.target,
        anchorVersion: version,
        anchorRestPositions: this.#restPositions(args.target),
        camera: args.camera,
        context: { ...args.context, screenshot: args.screenshot ? `screenshots/${id}.png` : null },
        anchorState: "exact",
        followUps: [],
        rounds: [],
        reopenedFrom: null,
        ...(args.parts && !isDefaultPartView(args.parts) ? { parts: args.parts } : {}),
      };
      asset.screenshots.set(id, args.screenshot);
      asset.review = {
        ...asset.review,
        comments: [...asset.review.comments, comment],
        queue: [...asset.review.queue, id],
        nextCommentNumber: asset.review.nextCommentNumber + 1,
      };
      this.#emitReview(asset);
      return { commentId: id };
    },
    "comment.update": (args) => {
      const asset = this.#asset(args.assetId);
      const comment = this.#comment(asset, args.commentId);
      if (comment.status !== "draft") throw new ArcueError("conflict", "Only drafts can be edited.");
      const pending = comment.reopenedFrom === null ? undefined : comment.followUps.at(-1);
      const next: Comment = { ...comment, updatedAt: this.#now().toISOString() };
      if (args.text !== undefined) {
        if (pending) next.followUps = [...comment.followUps.slice(0, -1), { ...pending, text: args.text }];
        else next.text = args.text;
      }
      if (args.time !== undefined || args.target !== undefined) {
        if (args.version === undefined)
          throw new ArcueError("invalid-input", "A new time or target needs its version.");
        this.#pickedOn(asset, args.version);
      }
      if (args.time !== undefined) next.time = this.#timeAnchor(asset, args.time);
      if (args.target !== undefined) {
        next.target = args.target;
        next.anchorVersion = asset.summary.version ?? next.anchorVersion;
        next.anchorRestPositions = this.#restPositions(args.target);
        next.anchorState = "exact";
      }
      if (args.camera !== undefined) next.camera = args.camera;
      if (args.context !== undefined) {
        next.context = { ...args.context, screenshot: args.screenshot ? `screenshots/${comment.id}.png` : null };
      }
      if (args.screenshot !== undefined) asset.screenshots.set(comment.id, args.screenshot);
      this.#replaceComment(asset, next);
      this.#emitReview(asset);
    },
    "comment.delete": ({ assetId, commentId }) => {
      const asset = this.#asset(assetId);
      const comment = this.#comment(asset, commentId);
      if (comment.status !== "draft") throw new ArcueError("conflict", "Only drafts can be deleted.");
      const queue = asset.review.queue.filter((id) => id !== commentId);
      if (comment.reopenedFrom !== null) {
        this.#replaceComment(asset, {
          ...comment,
          status: comment.reopenedFrom,
          reopenedFrom: null,
          followUps: comment.followUps.slice(0, -1),
        });
        asset.review = { ...asset.review, queue };
      } else {
        asset.review = {
          ...asset.review,
          queue,
          comments: asset.review.comments.filter((candidate) => candidate.id !== commentId),
        };
      }
      this.#emitReview(asset);
    },
    "comment.resolve": ({ assetId, commentId }) => {
      const asset = this.#asset(assetId);
      const comment = this.#comment(asset, commentId);
      if (comment.status !== "sent") throw new ArcueError("conflict", "Only sent comments can be resolved.");
      this.#replaceComment(asset, { ...comment, status: "resolved", updatedAt: this.#now().toISOString() });
      this.#emitReview(asset);
    },
    "comment.reopen": ({ assetId, commentId, text }) => {
      const asset = this.#asset(assetId);
      const comment = this.#comment(asset, commentId);
      const afterRound = comment.rounds[comment.rounds.length - 1];
      if (comment.status === "draft" || afterRound === undefined) {
        throw new ArcueError("conflict", "Only sent or resolved comments can be reopened.");
      }
      const now = this.#now().toISOString();
      this.#replaceComment(asset, {
        ...comment,
        status: "draft",
        reopenedFrom: comment.status,
        updatedAt: now,
        followUps: [...comment.followUps, { text, createdAt: now, afterRound }],
      });
      asset.review = { ...asset.review, queue: [...asset.review.queue, commentId] };
      this.#emitReview(asset);
    },
    "round.copy": ({ assetId }) => {
      const asset = this.#asset(assetId);
      if (asset.review.queue.length === 0) throw new ArcueError("conflict", "The queue is empty.");
      const round = Math.max(0, ...asset.review.rounds.map((candidate) => candidate.number)) + 1;
      const queued = asset.review.queue.map((id) => this.#comment(asset, id));
      const prompt = this.#buildPrompt(asset, round, queued);
      const sent = new Set(asset.review.queue);
      asset.review = {
        ...asset.review,
        comments: asset.review.comments.map((comment) =>
          sent.has(comment.id)
            ? {
                ...comment,
                status: "sent",
                reopenedFrom: null,
                rounds: [...comment.rounds, round],
                context: {
                  ...comment.context,
                  screenshot: comment.context.screenshot ? `rounds/round-${round}/${comment.id}.png` : null,
                },
              }
            : comment,
        ),
        queue: [],
        rounds: [
          ...asset.review.rounds,
          {
            number: round,
            createdAt: this.#now().toISOString(),
            version: asset.summary.version ?? "unknown",
            comments: [...sent],
          },
        ],
      };
      this.#lastPrompt = prompt;
      this.#emitReview(asset);
      this.#emit("round.copied", { assetId, round });
      return { round, prompt, copiedToClipboard: this.#options.coreClipboard ?? false };
    },
    "composition.addFile": ({ assetId }) => ({ path: this.#compositionPath(assetId) }),
    "composition.removeFile": ({ assetId }) => ({ path: this.#compositionPath(assetId) }),
    "material.setTexture": ({ assetId }) => ({ path: this.#compositionPath(assetId) }),
    "settings.set": (args) => {
      this.#settings = { ...this.#settings, ...args };
      return structuredClone(this.#settings);
    },
    "review.undo": () => ({ changed: false }),
    "review.redo": () => ({ changed: false }),
    "view.reportState": ({ assetId, state }) => {
      this.#asset(assetId).viewState = state;
    },
    "view.reportFocus": () => {},
    "view.showAsset": async (args) => {
      await this.#window?.({ kind: "command", name: "view.showAsset", input: args });
    },
    "view.moveAsset": async ({ assetId }) => {
      await this.#window?.({ kind: "command", name: "view.showAsset", input: { assetId } });
    },
    "view.releaseAsset": () => null,
    "view.setClip": () => {},
    "view.setFrame": () => {},
    "view.setPlaying": () => {},
    "view.setSpeed": () => {},
    "view.setLoop": () => {},
    "view.setRange": () => {},
    "view.setCamera": () => {},
    "view.frame": () => {},
    "view.setDisplayMode": () => {},
    "view.setSkeleton": () => {},
    "view.setPartVisible": () => {},
    "view.isolatePart": () => {},
    "view.setLod": () => {},
    "view.selectComment": () => {},
    "view.screenshot": () => ({ png: new Uint8Array() }),
  };

  readonly #queries: QueryHandlers = {
    "settings.get": () => this.#settings,
    "asset.list": () => ({ assets: [...this.#assets.values()].map((asset) => asset.summary) }),
    "review.get": ({ assetId }) => this.#asset(assetId).review,
    "viewState.get": ({ assetId }) => this.#asset(assetId).viewState,
    "comment.screenshot": async ({ assetId, commentId }) => {
      const asset = this.#asset(assetId);
      const comment = this.#comment(asset, commentId);
      if (!asset.screenshots.has(commentId)) {
        const made =
          comment.context.screenshot && asset.seed?.screenshot
            ? await asset.seed.screenshot(comment, asset.seed.scene)
            : null;
        asset.screenshots.set(commentId, made);
      }
      return asset.screenshots.get(commentId) ?? null;
    },
    "scene.get": ({ assetId }) => {
      const asset = this.#asset(assetId);
      if (!asset.seed || asset.summary.version === null) throw new ArcueError("not-found", "No scene is loaded.");
      return { version: asset.summary.version, scene: asset.seed.scene };
    },
    "scene.parts": ({ assetId }) => {
      const asset = this.#asset(assetId);
      if (!asset.seed) throw new ArcueError("not-found", "No scene is loaded.");
      return { parts: asset.seed.scene.parts.map(({ id, name, role }) => ({ id, name, role, levels: [] })) };
    },
  };
}
