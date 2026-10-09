import type {
  AssetInspection,
  AssetVersion,
  AssetWarning,
  Author,
  CommandArgs,
  CommandName,
  CommandOutput,
  Comment,
  CompositionFile,
  CoreClient,
  ListenerErrorHandler,
  MeshTopology,
  MessageEndpoint,
  Peer,
  ReviewCandidate,
  ReviewFile,
  RoundSummary,
  Unsubscribe,
} from "@arcue/protocol";
import {
  ArcueError,
  COMPOSITION_VERSION,
  commands,
  isCommandName,
  memberRoleFor,
  reportListenerError,
  viewStateSchema,
  withTransfer,
} from "@arcue/protocol";
import type { SceneDescription, SceneNode } from "@arcue/scene";
import { findNode, materialSlots, splitMemberPath } from "@arcue/scene";
import { CommentIds } from "./comment-ids";
import {
  hasExtension,
  isConventionAnimation,
  listsMember,
  MODEL_EXTENSIONS,
  readComposition,
  serializeComposition,
  withAttachBone,
  withMember,
  withoutMember,
  withTexture,
} from "./composition-file";
import type { AssetFiles, ReadFile } from "./composition-load";
import { buildAssetScene, readAssetFiles } from "./composition-load";
import { readableImageExtensions } from "./file-search";
import { contentHash, versionIdOf } from "./hash";
import type { CompositionEdit } from "./history";
import { applySnapshot, editBetween, withDismissedWarnings } from "./history";
import { readUnityGuid } from "./identity";
import { importAsset } from "./import";
import { exporterName, inspectMembers, inspectScene } from "./inspect";
import { insideWithoutLinks } from "./links";
import type { LostFile } from "./lost-files";
import { findLostFiles, lostFiles, withMovedFiles } from "./lost-files";
import { findComment, OpenAsset, readRootFor } from "./open-asset";
import { basename, dirname, joinPath, normalizePath, pathInside, relativePath } from "./paths";
import type { FileStat, Platform } from "./platform";
import { renderPrompt } from "./prompt";
import { Reanchorer } from "./reanchor";
import type { CallContext } from "./registry";
import { CommandRegistry } from "./registry";
import type { EarlierReview } from "./relink";
import { fileIdentity, findEarlierReviews, matchByIdentity, matchByStructure, rankCandidates } from "./relink";
import { isUntouched, moveReview, relabelMembers } from "./review-move";
import type { ReviewChange } from "./review-session";
import { ReviewSession } from "./review-session";
import type { ReviewLocation } from "./review-store";
import {
  compositionFilePath,
  loadReview,
  locateReview,
  prepareArcueFolder,
  reviewFilePath,
  reviewLocationIn,
} from "./review-store";
import { buildRoundData } from "./round-data";
import {
  anchorRestPositions,
  checkTarget,
  findClip,
  meshesOf,
  partsOf,
  resolveTime,
  storedPartView,
} from "./scene-lookup";
import { readScreenshot, UNSENT_SCREENSHOT_NAME } from "./screenshots";
import { Serial } from "./serial";
import type { ServeOptions } from "./serve";
import { serveEndpoint } from "./serve";
import { SettingsStore } from "./settings";
import {
  commentWarning,
  findWarning,
  frontCamera,
  listWarnings,
  modelNotFound,
  warningClip,
  warningPrompt,
} from "./warnings";
import { WindowRegistry } from "./windows";

export interface ArcueCoreOptions {
  platform: Platform;
  /** Defaults to a new registry. */
  registry?: CommandRegistry;
  /** How long a changed asset file must keep its size and modification time before it is parsed. Defaults to 300. */
  stabilityIntervalMs?: number;
  /** Gives up on a parse after this many milliseconds. Defaults to two minutes. */
  importTimeoutMs?: number;
  /** How long a window has to answer "view.showAsset" before opening fails as "unavailable". Defaults to 10 s. */
  showAssetTimeoutMs?: number;
  /** Formats the time an asset version was written for the prompt, such as "14:02". Defaults to the local clock. */
  formatClockTime?: (epochMs: number) => string;
  /**
   * Receives errors from work no caller waits for, such as screenshot cleanup and review files changed by other
   * programs. By default they surface as unhandled rejections; the desktop host logs them instead.
   */
  onError?: ListenerErrorHandler;
}

const VIEW_SHOW_ASSET = "view.showAsset";

/** The most files in a missing model's folder that the core checks for the model under a new name. */
const MAX_RENAME_CANDIDATES = 256;
const VIEW_RELEASE_ASSET = "view.releaseAsset";

/**
 * All review state, behind the command registry. Hosts start it with a platform and connect each window and bridge
 * with `connect`; calls inside the host's own process go through `client`.
 */
export class ArcueCore {
  readonly registry: CommandRegistry;
  readonly #platform: Platform;
  readonly #settings: SettingsStore;
  readonly #windows = new WindowRegistry();
  readonly #connections = new Set<string>();
  /** Opens run one at a time, so two opens of one file share a tab. */
  readonly #opening = new Serial();
  readonly #assets = new Map<string, OpenAsset>();
  readonly #pending = new Set<Promise<unknown>>();
  readonly #unregister: Unsubscribe[] = [];
  readonly #stabilityIntervalMs: number;
  readonly #importTimeoutMs: number;
  readonly #showAssetTimeoutMs: number;
  readonly #formatClockTime: (epochMs: number) => string;
  readonly #onError: ListenerErrorHandler;
  readonly #commentIds = new CommentIds();
  #nextAssetNumber = 1;

  /** Creates the core and reads its settings. */
  static async start(options: ArcueCoreOptions): Promise<ArcueCore> {
    const core = new ArcueCore(options);
    await core.#settings.load();
    return core;
  }

  private constructor(options: ArcueCoreOptions) {
    this.#platform = options.platform;
    this.registry = options.registry ?? new CommandRegistry();
    this.#settings = new SettingsStore(options.platform);
    this.#stabilityIntervalMs = options.stabilityIntervalMs ?? 300;
    this.#importTimeoutMs = options.importTimeoutMs ?? 120_000;
    this.#showAssetTimeoutMs = options.showAssetTimeoutMs ?? 10_000;
    this.#formatClockTime = options.formatClockTime ?? localClockTime;
    this.#onError = options.onError ?? reportListenerError;
    this.#registerHandlers();
  }

  /** The in-process client, which runs the same validation as every other caller. */
  get client(): CoreClient {
    return this.registry;
  }

  /**
   * Serves a window or a bridge on the endpoint. The core sends view commands to windows over the returned peer.
   * Connection names must be unique among the open connections. Without a `user`, a window acts as the person the
   * `authorName` setting names, and a bridge as nobody.
   */
  connect(endpoint: MessageEndpoint, options: ServeOptions): Peer {
    if (this.#connections.has(options.connection)) {
      throw new ArcueError("conflict", `A connection named "${options.connection}" is already open.`);
    }
    const user = options.user ?? (options.caller === "window" ? () => this.#localUser() : undefined);
    const peer = serveEndpoint(this.registry, endpoint, { ...options, user });
    this.#connections.add(options.connection);
    peer.onClose(() => this.#connections.delete(options.connection));
    if (options.caller === "window") {
      this.#windows.add(options.connection, peer);
      peer.onClose(() => {
        this.#windows.remove(options.connection);
        for (const asset of this.#assets.values()) if (asset.window === options.connection) asset.window = null;
      });
    }
    return peer;
  }

  /** Resolves once no parse, file check or background save is running. Waiting timers do not count. */
  async idle(): Promise<void> {
    while (this.#pending.size > 0) await Promise.allSettled([...this.#pending]);
  }

  /** Stops watching files and removes the handlers. Open assets are dropped without events. */
  dispose(): void {
    for (const asset of this.#assets.values()) this.#stop(asset);
    this.#assets.clear();
    for (const unregister of this.#unregister.splice(0)) unregister();
  }

  #registerHandlers(): void {
    const registry = this.registry;
    this.#unregister.push(
      registry.handleCommand("asset.open", (args, context) => this.#opening.run(() => this.#open(args, context))),
      registry.handleCommand("asset.close", (args) => this.#close(args.assetId)),
      registry.handleCommand("asset.relink", (args) => this.#relinkAsset(args.assetId, args.path)),
      registry.handleCommand("asset.reload", async (args) => {
        const asset = this.#asset(args.assetId);
        asset.searched.clear();
        return { version: await this.#load(asset) };
      }),
      registry.handleCommand("comment.create", (args, context) => this.#createComment(args, context.user)),
      registry.handleCommand("comment.update", (args) => this.#updateComment(args)),
      registry.handleCommand("comment.delete", (args) => this.#deleteComment(args)),
      registry.handleCommand("comment.resolve", (args) => this.#resolveComment(args)),
      registry.handleCommand("comment.reopen", (args, context) => this.#reopenComment(args, context.user)),
      registry.handleCommand("comment.createFromWarning", (args, context) =>
        this.#createFromWarning(args, context.user),
      ),
      registry.handleCommand("warning.dismiss", (args) => this.#dismissWarnings(args.assetId, [args.warningId])),
      registry.handleCommand("warning.dismissAll", (args) => this.#dismissWarnings(args.assetId, null)),
      registry.handleCommand("round.copy", (args, context) => this.#copyRound(args.assetId, context.user)),
      registry.handleCommand("review.undo", (args) => this.#undo(args.assetId, "undo")),
      registry.handleCommand("review.redo", (args) => this.#undo(args.assetId, "redo")),
      registry.handleCommand("review.relink", (args) => this.#relinkReview(args.assetId, args.from)),
      registry.handleCommand("composition.addFile", (args) => this.#addCompositionFile(args)),
      registry.handleCommand("composition.removeFile", (args) => this.#removeCompositionFile(args)),
      registry.handleCommand("composition.attachFile", (args) => this.#attachCompositionFile(args)),
      registry.handleCommand("material.setTexture", (args) => this.#setMaterialTexture(args)),
      registry.handleCommand("settings.set", (args) => this.#settings.update(args)),
      registry.handleCommand("view.reportState", (args, context) => {
        const asset = this.#asset(args.assetId);
        asset.viewState = args.state;
        if (context.caller === "window" && this.#windows.has(context.connection)) asset.window = context.connection;
      }),
      registry.handleCommand("view.moveAsset", (args, context) =>
        this.#opening.run(() => this.#move(args.assetId, context)),
      ),
      registry.handleCommand("view.reportFocus", (_args, context) => {
        if (context.caller === "window" && context.connection !== null) this.#windows.focus(context.connection);
      }),
      registry.handleCommand(VIEW_SHOW_ASSET, async (args, context) => {
        const asset = this.#asset(args.assetId);
        const window =
          context.caller === "window" && this.#windows.has(context.connection)
            ? context.connection
            : this.#windowFor(asset, context);
        await this.#showAsset(asset, window, args);
      }),
      registry.handleQuery("asset.list", () => ({ assets: [...this.#assets.values()].map((asset) => asset.summary) })),
      registry.handleQuery("review.get", (args) => this.#asset(args.assetId).session.review),
      registry.handleQuery("review.candidates", (args) => ({ candidates: this.#asset(args.assetId).candidates })),
      registry.handleQuery("viewState.get", (args) => this.#asset(args.assetId).viewState),
      registry.handleQuery("scene.get", (args) => this.#asset(args.assetId).loaded()),
      registry.handleQuery("scene.parts", (args) => ({ parts: partsOf(this.#asset(args.assetId).loaded().scene) })),
      registry.handleQuery("scene.materials", (args) => ({
        materials: materialSlots(this.#asset(args.assetId).loaded().scene).map(({ material, slots }) => ({
          material,
          slots: slots.map(({ slot, state, path, overridden }) => ({ slot, state, path, overridden })),
        })),
      })),
      registry.handleQuery("settings.get", () => this.#settings.current),
      registry.handleQuery("warning.list", (args) => ({ warnings: this.#warnings(this.#asset(args.assetId)) })),
      registry.handleQuery("warning.prompt", (args) => {
        const asset = this.#asset(args.assetId);
        return { prompt: warningPrompt(asset.path, this.#warnings(asset)) };
      }),
      registry.handleQuery("asset.inspect", (args) => this.#track(this.#inspect(args.path))),
      registry.handleQuery("comment.screenshot", (args) => {
        const asset = this.#asset(args.assetId);
        const comment = findComment(asset.session.review, args.commentId);
        return readScreenshot(this.#platform, asset.location.folder, comment.id, comment.context.screenshot);
      }),
    );
    for (const name of Object.keys(commands)) {
      if (!isCommandName(name)) continue;
      const definition: { runsIn: string; internal?: true } = commands[name];
      if (definition.runsIn === "view" && !definition.internal) this.#forwardView(name);
    }
  }

  #forwardView<Name extends CommandName>(name: Name): void {
    this.#unregister.push(
      this.registry.handleCommand(name, async (args) => {
        const asset = this.#asset(assetIdOf(args));
        if (!this.#windows.has(asset.window)) throw new ArcueError("unavailable", `No window shows ${asset.name}.`);
        const output = await this.#windows.request(asset.window, name, args);
        if (output === undefined) return output as CommandOutput<Name>;
        const checked = commands[name].output.safeParse(output);
        if (!checked.success) throw new ArcueError("internal", `The window answered "${name}" with an invalid result.`);
        return withTransfer(checked.data as object, buffersIn(checked.data)) as CommandOutput<Name>;
      }),
    );
  }

  #asset(assetId: string): OpenAsset {
    const asset = this.#assets.get(assetId);
    if (!asset) throw new ArcueError("not-found", `No asset with id "${assetId}" is open.`);
    return asset;
  }

  #track<Value>(promise: Promise<Value>): Promise<Value> {
    this.#pending.add(promise);
    void promise.then(
      () => this.#pending.delete(promise),
      () => this.#pending.delete(promise),
    );
    return promise;
  }

  #now(): string {
    return new Date(this.#platform.clock.now()).toISOString();
  }

  #newCommentId(): string {
    return this.#commentIds.next(this.#platform.clock.now());
  }

  /** The person the `authorName` setting names, who acts through the windows. */
  #localUser(): Author | undefined {
    const name = this.#settings.current.authorName;
    return name === undefined ? undefined : { name };
  }

  #windowFor(asset: OpenAsset, context: CallContext): string {
    const window = this.#windows.has(asset.window) ? asset.window : this.#windows.choose(context);
    if (window === null) throw new ArcueError("unavailable", "No window is open to show the asset.");
    return window;
  }

  async #showAsset(
    asset: OpenAsset,
    window: string,
    { clip, frame }: { clip?: string | undefined; frame?: number | undefined },
  ): Promise<void> {
    const input: CommandArgs<"view.showAsset"> = { assetId: asset.id };
    if (clip !== undefined) input.clip = clip;
    if (frame !== undefined) input.frame = frame;
    await this.#windows.request(window, VIEW_SHOW_ASSET, input, {
      ms: this.#showAssetTimeoutMs,
      clock: this.#platform.clock,
    });
    asset.window = window;
  }

  /**
   * Moves an asset's tab to the calling window. The window that shows it releases the tab first and returns its view
   * state, so the receiving window starts from the same camera, clip and frame.
   */
  async #move(assetId: string, context: CallContext): Promise<void> {
    if (context.caller !== "window" || !this.#windows.has(context.connection)) {
      throw new ArcueError("forbidden", "Only a window can take an asset's tab.");
    }
    const asset = this.#asset(assetId);
    if (asset.closing) throw new ArcueError("conflict", `${asset.name} is closing, so its tab cannot move.`);
    const target = context.connection;
    const source = asset.window;
    if (source !== target && this.#windows.has(source)) {
      const released = await this.#windows.request(
        source,
        VIEW_RELEASE_ASSET,
        { assetId },
        { ms: this.#showAssetTimeoutMs, clock: this.#platform.clock },
      );
      const state = viewStateSchema.nullable().safeParse(released);
      if (state.success && state.data) asset.viewState = state.data;
      asset.window = null;
    }
    try {
      await this.#showAsset(asset, target, {});
    } catch (error) {
      if (source !== target && this.#windows.has(source)) {
        await this.#showAsset(asset, source, {}).catch(() => undefined);
      }
      throw error;
    }
  }

  async #open(args: CommandArgs<"asset.open">, context: CallContext): Promise<CommandOutput<"asset.open">> {
    const path = normalizePath(args.path);
    const existing = [...this.#assets.values()].find((asset) => asset.path === path && !asset.closing);
    if (existing) {
      await this.#showAsset(existing, this.#windowFor(existing, context), args);
      return { assetId: existing.id };
    }
    const stat = await this.#platform.stat(path);
    if (!stat) throw new ArcueError("not-found", `${path} does not exist.`);
    if (stat.kind !== "file") throw new ArcueError("invalid-input", `${path} is not an asset file.`);
    const window = this.#windows.choose(context);
    if (window === null) throw new ArcueError("unavailable", "No window is open to show the asset.");
    const location = await locateReview(this.#platform, path);
    const reviewPath = reviewFilePath(location);
    if (location.workspaceRoot && !(await insideWithoutLinks(this.#platform, location.workspaceRoot, reviewPath))) {
      throw new ArcueError("conflict", `The review folder ${location.folder} goes through a symbolic link.`);
    }
    const earlier = await this.#earlierReview(location, path, stat.size);
    const loaded = await loadReview(this.#platform, location);
    const id = `a${this.#nextAssetNumber++}`;
    const session = new ReviewSession(this.#platform, location, loaded, (review) =>
      this.registry.emit("review.changed", { assetId: id, review }),
    );
    const asset = new OpenAsset(id, path, location, session);
    if (args.viewState) asset.viewState = args.viewState;
    asset.candidates = earlier.candidates;
    asset.earlier = earlier.unmatched;
    this.#assets.set(asset.id, asset);
    try {
      await this.#showAsset(asset, window, args);
    } catch (error) {
      this.#assets.delete(asset.id);
      throw error;
    }
    this.registry.emit("asset.opened", { asset: asset.summary });
    if (earlier.moved !== null) {
      this.registry.emit("review.relinked", { assetId: asset.id, from: earlier.moved, automatic: true });
    }
    this.#offer(asset);
    this.#watchAsset(asset);
    void this.#load(asset).catch(() => undefined);
    return { assetId: asset.id };
  }

  /**
   * For a file without a review: finds the reviews whose model is gone and, when exactly one has a version with the
   * file's bytes or the file's Unity GUID, moves it to the file's review folder. Several such reviews become candidates
   * to offer; with none, the reviews are kept to compare meshes with once the file loads. A failure leaves the file
   * without a review rather than failing the open.
   */
  async #earlierReview(
    location: ReviewLocation,
    path: string,
    size: number,
  ): Promise<{ moved: string | null; candidates: ReviewCandidate[]; unmatched: EarlierReview[] }> {
    const none = { moved: null, candidates: [], unmatched: [] };
    try {
      if ((await this.#platform.stat(reviewFilePath(location))) !== null) return none;
      const open = new Set([...this.#assets.values()].map((asset) => asset.location.folder));
      const earlier = await findEarlierReviews(this.#platform, location, open);
      if (earlier.length === 0) return none;
      const guid = await readUnityGuid(this.#platform, path);
      const matches = await matchByIdentity(earlier, fileIdentity(this.#platform, path, size, guid));
      const [only] = matches;
      if (only && matches.length === 1) {
        const { location: from, model } = only.earlier;
        await moveReview(this.#platform, { from, fromModel: model, to: location, toModel: path });
        return { ...none, moved: model };
      }
      return { ...none, candidates: offered(matches), unmatched: matches.length === 0 ? earlier : [] };
    } catch (error) {
      this.#onError(error);
      return none;
    }
  }

  /** Compares the first version's meshes with the earlier reviews no file identity matched, rule 3, and offers the best. */
  #matchStructure(asset: OpenAsset, meshes: readonly MeshTopology[]): void {
    if (asset.earlier.length === 0) return;
    asset.candidates = offered(matchByStructure(asset.earlier, meshes));
    asset.earlier = [];
    this.#offer(asset);
  }

  #offer(asset: OpenAsset): void {
    const [candidate] = asset.candidates;
    if (candidate) this.registry.emit("review.offered", { assetId: asset.id, candidate });
  }

  /**
   * Moves the review of an earlier path of the asset's model onto the asset, as `review.relink` asks, replacing the
   * review that opening the asset wrote while that holds nothing but versions. The earlier model must be gone and its
   * review folder inside the asset's reviews root, and the asset reloads to re-anchor the comments.
   */
  #relinkReview(assetId: string, given: string): Promise<void> {
    const asset = this.#asset(assetId);
    return this.#inCompositionLine(asset, async () => {
      const from = normalizePath(given);
      const earlier = reviewLocationIn(this.#platform.appDataDir, asset.location.workspaceRoot, from);
      if (earlier === null || earlier.root !== asset.location.root || from === asset.path) {
        throw new ArcueError("invalid-input", `${given} is not an earlier path of ${asset.name} in the same reviews.`);
      }
      if (await this.#platform.exists(from)) {
        throw new ArcueError("conflict", `${basename(from)} still exists, so its review stays with it.`);
      }
      if ([...this.#assets.values()].some((open) => open.location.folder === earlier.folder)) {
        throw new ArcueError("conflict", `The review of ${basename(from)} is open in a tab.`);
      }
      await asset.session.moveTo(asset.location, () =>
        moveReview(this.#platform, {
          from: earlier,
          fromModel: from,
          to: asset.location,
          toModel: asset.path,
          replaceUntouched: true,
        }),
      );
      asset.candidates = [];
      asset.earlier = [];
      this.registry.emit("review.relinked", { assetId: asset.id, from, automatic: false });
      await this.#load(asset, true).catch(() => undefined);
    });
  }

  /** Watches the model file, its review file, and its composition file until it loads the files that one names. */
  #watchAsset(asset: OpenAsset): void {
    if (asset.closed) return;
    for (const stop of asset.stopWatching.splice(0)) stop();
    asset.stopWatching.push(
      this.#platform.watch(asset.path, () => this.#fileChanged(asset)),
      this.#platform.watch(reviewFilePath(asset.location), () => {
        void this.#track(asset.session.refresh().catch((error: unknown) => this.#onError(error)));
      }),
    );
    this.#watchComposition(asset, [asset.compositionPath]);
  }

  /** Watches the composition file and the files it names, and stops watching files it no longer names. */
  #watchComposition(asset: OpenAsset, paths: readonly string[]): void {
    if (asset.closed) return;
    const wanted = new Set(paths);
    for (const [path, stop] of asset.compositionWatchers) {
      if (wanted.has(path)) continue;
      stop();
      asset.compositionWatchers.delete(path);
    }
    for (const path of wanted) {
      if (!asset.compositionWatchers.has(path)) {
        asset.compositionWatchers.set(
          path,
          this.#platform.watch(path, () => this.#fileChanged(asset)),
        );
      }
    }
  }

  /**
   * Parses a file in its own import worker, composed with its composition's files as opening it would be, without
   * opening a tab or touching review data.
   */
  async #inspect(given: string): Promise<AssetInspection> {
    const path = normalizePath(given);
    const stat = await this.#platform.stat(path);
    if (!stat) throw new ArcueError("not-found", `${path} does not exist.`);
    if (stat.kind !== "file") throw new ArcueError("invalid-input", `${path} is not an asset file.`);
    const location = await locateReview(this.#platform, path);
    const readRoot = readRootFor(location.workspaceRoot, path);
    const files = await readAssetFiles(this.#platform, path, compositionFilePath(location), readRoot, {
      brokenComposition: "warn",
    });
    const bytes = files.model.bytes.byteLength;
    const scene = await buildAssetScene(files, (file) =>
      importAsset(this.#platform, file.path, file.bytes, { readRoot, timeoutMs: this.#importTimeoutMs }),
    );
    return inspectScene(scene, {
      path,
      bytes,
      composition: files.composition?.file.path ?? null,
      members: inspectMembers(files),
    });
  }

  #close(assetId: string): Promise<void> {
    const asset = this.#asset(assetId);
    asset.closing ??= (async () => {
      await asset.session.close();
      this.#stop(asset);
      this.#assets.delete(assetId);
      this.registry.emit("asset.closed", { assetId });
    })();
    return asset.closing;
  }

  #stop(asset: OpenAsset): void {
    asset.closed = true;
    for (const stop of asset.stopWatching.splice(0)) stop();
    for (const stop of asset.compositionWatchers.values()) stop();
    asset.compositionWatchers.clear();
    asset.cancelStabilityCheck();
  }

  #fileChanged(asset: OpenAsset): void {
    if (asset.closed) return;
    asset.cancelStabilityCheck();
    const check = ++asset.stabilityCheck;
    void this.#track(this.#checkStable(asset, check, undefined));
  }

  /**
   * Parses the files once two checks a short interval apart see the same size and modification time for the model
   * and every file of its composition, so an export that writes several files reloads once.
   */
  async #checkStable(
    asset: OpenAsset,
    check: number,
    previous: ReadonlyMap<string, FileStat | null> | undefined,
  ): Promise<void> {
    const paths = [asset.path, ...asset.compositionWatchers.keys()];
    const stats = await Promise.all(paths.map((path) => this.#platform.stat(path)));
    const current = new Map(paths.map((path, index) => [path, stats[index] ?? null]));
    if (asset.closed || check !== asset.stabilityCheck) return;
    if (previous !== undefined) {
      const model = current.get(asset.path) ?? null;
      const before = previous.get(asset.path) ?? null;
      if (model === null && before === null) {
        void this.#track(this.#modelGone(asset));
        return;
      }
      const settled = paths.every(
        (path) => previous.has(path) && sameStat(current.get(path) ?? null, previous.get(path) ?? null),
      );
      if (model?.kind === "file" && settled) {
        void this.#load(asset).catch(() => undefined);
        return;
      }
    }
    asset.cancelStabilityCheck = this.#platform.clock.setTimer(this.#stabilityIntervalMs, () => {
      void this.#track(this.#checkStable(asset, check, current));
    });
  }

  /**
   * Starts looking for the composition's lost files under new names, each once until the next `asset.reload`. It runs
   * beside the load, since writing the composition file waits for the asset's edits, and those may wait for loads.
   */
  #searchLostFiles(asset: OpenAsset, files: AssetFiles): void {
    const lost = lostFiles(files, asset.session.review).filter((file) => !asset.searched.has(file.path));
    if (lost.length === 0) return;
    for (const file of lost) asset.searched.add(file.path);
    const taken = new Set([asset.path, ...files.members.keys(), ...files.textures.map((texture) => texture.path)]);
    const relinked = this.#relinkLostFiles(asset, lost, taken).catch((error: unknown) => {
      if (!(error instanceof ArcueError && error.code === "conflict")) this.#onError(error);
    });
    void this.#track(relinked);
  }

  /**
   * Writes each lost file found under a new name into the composition file at its new path, renames the review's ids
   * for it, and reloads. A composition file that changed meanwhile keeps any entry that no longer names the old path.
   */
  async #relinkLostFiles(asset: OpenAsset, lost: readonly LostFile[], taken: ReadonlySet<string>): Promise<void> {
    const moved = await findLostFiles(this.#platform, asset.path, asset.readRoot, lost, taken);
    if (moved.size === 0) return;
    const changed = await this.#inCompositionLine(asset, () =>
      asset.session.run<boolean>(async (review) => {
        await this.#checkCompositionPath(asset);
        const found = await readComposition(this.#platform, asset.compositionPath, "conflict");
        if (!found) return { next: null, result: false };
        const { composition, labels } = withMovedFiles(found.composition, dirname(asset.path), moved);
        const text = serializeComposition(composition);
        if (text === serializeComposition(found.composition)) return { next: null, result: false };
        await prepareArcueFolder(this.#platform, asset.location);
        await this.#platform.writeFileAtomic(asset.compositionPath, text);
        return { next: relabelMembers(review, labels), result: true };
      }),
    );
    if (changed) await this.#load(asset).catch(() => undefined);
  }

  /** Loads the asset's files, and with `force` records and re-anchors even a version that is already on screen. */
  /**
   * The model stayed missing across two checks, so it was not replaced by an export. When exactly one file in its
   * folder has the bytes of the version on screen or the model's Unity GUID, the asset follows that file; otherwise
   * the asset reports "model-not-found".
   */
  async #modelGone(asset: OpenAsset): Promise<void> {
    try {
      const renamed = await this.#findRenamed(asset);
      if (renamed !== null) {
        await this.#follow(asset, renamed, true);
        return;
      }
    } catch (error) {
      if (!(error instanceof ArcueError && error.code === "conflict")) this.#onError(error);
    }
    if (asset.closed || asset.missing || (await this.#platform.exists(asset.path))) return;
    asset.missing = true;
    this.#failed(asset, new Error(`Model not found: ${asset.name}`));
  }

  /**
   * The one file in the model's folder, with the model's extension, that has the size and full hash of the file the
   * version on screen was read from, or the model's Unity GUID in its `.meta` file. Null when there is none or more
   * than one. It checks at most `MAX_RENAME_CANDIDATES` files, hashes only those of the same size, and skips files
   * other tabs show.
   */
  async #findRenamed(asset: OpenAsset): Promise<string | null> {
    const { identity } = asset;
    const guid = asset.session.review.asset.guid ?? null;
    if (identity === null && guid === null) return null;
    const folder = dirname(asset.path);
    const extension = asset.name.slice(asset.name.lastIndexOf(".")).toLowerCase();
    const open = new Set([...this.#assets.values()].map((other) => other.path));
    const entries = await this.#platform.list(folder);
    const names = new Set(entries.map((entry) => entry.name));
    const files = entries.filter((entry) => entry.kind === "file" && hasExtension(entry.name, [extension]));
    const found: string[] = [];
    for (const entry of files.slice(0, MAX_RENAME_CANDIDATES)) {
      const path = joinPath(folder, entry.name);
      if (open.has(path)) continue;
      const sameBytes =
        identity !== null &&
        (await this.#platform.stat(path))?.size === identity.size &&
        contentHash(await this.#platform.readFile(path)) === identity.hash;
      const sameGuid =
        !sameBytes &&
        guid !== null &&
        names.has(`${entry.name}.meta`) &&
        (await readUnityGuid(this.#platform, path)) === guid;
      if (sameBytes || sameGuid) found.push(path);
    }
    const [only] = found;
    return found.length === 1 && only !== undefined ? only : null;
  }

  /** Points an asset whose model is gone at a file the caller chose, as `asset.relink` asks. */
  async #relinkAsset(assetId: string, given: string): Promise<void> {
    const asset = this.#asset(assetId);
    const path = normalizePath(given);
    if (path === asset.path) throw new ArcueError("invalid-input", `${asset.name} is already at ${path}.`);
    if (await this.#platform.exists(asset.path)) {
      throw new ArcueError("conflict", `${asset.name} still exists, so its review stays with it.`);
    }
    if ((await this.#platform.stat(path))?.kind !== "file")
      throw new ArcueError("not-found", `${path} does not exist.`);
    if ([...this.#assets.values()].some((other) => other.path === path && !other.closing)) {
      throw new ArcueError("conflict", `${basename(path)} is open in another tab.`);
    }
    await this.#follow(asset, path, false);
  }

  /**
   * Points the asset at its model's new path. It moves the review folder to the new path's place, which refuses a file
   * that has a review of its own, keeps the asset's id, watches the new files and reloads. Windows retitle the tab on
   * "asset.updated" and learn of the move from "review.relinked".
   */
  #follow(asset: OpenAsset, path: string, automatic: boolean): Promise<void> {
    return this.#inCompositionLine(asset, async () => {
      const from = asset.path;
      const location = await locateReview(this.#platform, path);
      if (
        location.workspaceRoot &&
        !(await insideWithoutLinks(this.#platform, location.workspaceRoot, location.folder))
      ) {
        throw new ArcueError("conflict", `The review folder ${location.folder} goes through a symbolic link.`);
      }
      await asset.session.moveTo(location, async () => {
        if (!(await this.#platform.exists(reviewFilePath(asset.location)))) return;
        await moveReview(this.#platform, { from: asset.location, fromModel: from, to: location, toModel: path });
      });
      if (asset.closed) return;
      asset.cancelStabilityCheck();
      asset.stabilityCheck++;
      asset.relocate(path, location);
      asset.missing = false;
      asset.status = "loading";
      asset.error = null;
      asset.candidates = [];
      asset.earlier = [];
      this.#watchAsset(asset);
      this.registry.emit("asset.updated", { asset: asset.summary });
      this.registry.emit("review.relinked", { assetId: asset.id, from, automatic });
      await this.#load(asset, true).catch(() => undefined);
    });
  }

  #load(asset: OpenAsset, force = false): Promise<string> {
    return this.#track(asset.loads.run(() => this.#loadVersion(asset, force)));
  }

  async #loadVersion(asset: OpenAsset, force: boolean): Promise<string> {
    if (asset.closed) throw new ArcueError("not-found", `${asset.name} is closed.`);
    let files: AssetFiles;
    try {
      files = await readAssetFiles(this.#platform, asset.path, asset.compositionPath, asset.readRoot, {
        brokenComposition: asset.composition === null ? "warn" : "reject",
      });
    } catch (error) {
      this.#failed(asset, error);
      throw error;
    }
    asset.missing = false;
    this.#watchComposition(asset, files.watch);
    this.#searchLostFiles(asset, files);
    const versionId = files.versionId;
    if (versionId === asset.version && !force) {
      if (asset.status !== "ready") {
        asset.status = "ready";
        asset.error = null;
        this.registry.emit("asset.updated", { asset: asset.summary });
      }
      return versionId;
    }
    asset.status = "loading";
    this.registry.emit("asset.updated", { asset: asset.summary });
    let meshes: MeshTopology[] = [];
    try {
      const scene = await buildAssetScene(files, (file) => this.#importFile(asset, file), {
        parsed: (file) => asset.parsed(file.path, file.id),
      });
      meshes = meshesOf(scene).map((entry) => ({ mesh: entry.path, topology: entry.mesh.topology }));
      await asset.session.run((review) => {
        const record: AssetVersion = {
          id: versionId,
          fileModifiedAt: new Date(files.model.modifiedMs).toISOString(),
          loadedAt: this.#now(),
          exporter: exporterName(scene),
          meshes,
          hash: files.model.hash,
          size: files.model.size,
        };
        if (files.versionFiles) record.files = files.versionFiles;
        const versions = withVersion(review.versions, record);
        const guid = files.model.guid;
        const reanchorer = new Reanchorer(versions, versionId, scene);
        return {
          next: {
            ...review,
            asset: guid === undefined ? review.asset : { ...review.asset, guid },
            versions,
            comments: review.comments.map((comment) => reanchorer.reanchor(comment)),
          },
          result: undefined,
          apply: () => {
            asset.session.history.mapComments((comment) => reanchorer.reanchor(comment));
            asset.scene = scene;
            asset.version = versionId;
            asset.identity = { hash: files.model.hash, size: files.model.size };
            asset.composition = files.composition?.file.path ?? null;
            asset.status = "ready";
            asset.error = null;
            const kept = new Set([asset.path, ...files.members.keys()]);
            for (const path of asset.imported.keys()) if (!kept.has(path)) asset.imported.delete(path);
          },
        };
      });
    } catch (error) {
      this.#failed(asset, error);
      throw error;
    }
    this.registry.emit("asset.updated", { asset: asset.summary });
    this.#matchStructure(asset, meshes);
    return versionId;
  }

  /** Parses one file of the asset, or takes the scene parsed from the same bytes before. */
  async #importFile(asset: OpenAsset, file: ReadFile & { bytes: Uint8Array; id: string }): Promise<SceneDescription> {
    const cached = asset.parsed(file.path, file.id);
    if (cached) return cached;
    const scene = await importAsset(this.#platform, file.path, file.bytes, {
      readRoot: asset.readRoot,
      timeoutMs: this.#importTimeoutMs,
    });
    asset.imported.set(file.path, { id: file.id, scene });
    return scene;
  }

  #failed(asset: OpenAsset, error: unknown): void {
    if (asset.closed) return;
    asset.status = "failed";
    asset.error = error instanceof Error ? error.message : String(error);
    this.registry.emit("asset.updated", { asset: asset.summary });
  }

  /** A free screenshot path for the comment, refusing a review folder reached through a link. */
  async #screenshotSlot(asset: OpenAsset, commentId: string): Promise<{ relative: string; path: string }> {
    const folder = asset.location.folder;
    let relative = `screenshots/${commentId}.png`;
    for (let copy = 2; await this.#platform.exists(joinPath(folder, relative)); copy++) {
      relative = `screenshots/${commentId}-${copy}.png`;
    }
    const path = joinPath(folder, relative);
    if (!(await insideWithoutLinks(this.#platform, folder, path))) {
      throw new ArcueError("conflict", `${dirname(path)} is a symbolic link.`);
    }
    return { relative, path };
  }

  #screenshotWrite(
    slot: { path: string } | null,
    png: Uint8Array | null | undefined,
  ): Pick<ReviewChange<unknown>, "prepare" | "rollback"> {
    if (!slot || !png) return {};
    return {
      prepare: () => this.#platform.writeFileAtomic(slot.path, png),
      rollback: () => this.#platform.remove(slot.path),
    };
  }

  /**
   * Runs a composition command after the asset's earlier composition edits and undo steps, and before later ones, so
   * each checks its input against the version the edit before it loaded.
   */
  #inCompositionLine<Result>(asset: OpenAsset, task: () => Promise<Result>): Promise<Result> {
    return asset.compositionEdits.run(async () => {
      if (asset.closing) throw new ArcueError("conflict", `${asset.name} is closing.`);
      return task();
    });
  }

  /**
   * Changes the asset's composition file, creating it in the review folder on the first change, records the change in
   * the asset's undo history and reloads the asset. It works on the file as it is on disk, and never overwrites a file
   * it cannot read. Call it inside `#inCompositionLine`.
   */
  async #editComposition(
    asset: OpenAsset,
    change: (composition: CompositionFile, same: (path: string) => (written: string) => boolean) => CompositionFile,
  ): Promise<{ path: string }> {
    const path = asset.compositionPath;
    const folder = dirname(asset.path);
    const changed = await asset.session.run<boolean>(async () => {
      await this.#checkCompositionPath(asset);
      const found = await readComposition(this.#platform, path, "conflict");
      const current: CompositionFile = found?.composition ?? { version: COMPOSITION_VERSION };
      const same = (target: string) => (written: string) => joinPath(folder, written) === target;
      const text = serializeComposition(change(current, same));
      if (text === serializeComposition(current)) return { next: null, result: false };
      await prepareArcueFolder(this.#platform, asset.location);
      await this.#platform.writeFileAtomic(path, text);
      return {
        next: null,
        result: true,
        edit: { kind: "composition", path, before: found?.text ?? null, after: text },
      };
    });
    if (changed) await this.#load(asset).catch(() => undefined);
    return { path };
  }

  /** Refuses a composition file reached through a link, as opening refuses a review folder reached through one. */
  async #checkCompositionPath(asset: OpenAsset): Promise<void> {
    const root = asset.location.workspaceRoot ?? asset.location.folder;
    if (!(await insideWithoutLinks(this.#platform, root, asset.compositionPath))) {
      throw new ArcueError("conflict", `${asset.compositionPath} is reached through a symbolic link.`);
    }
  }

  /**
   * Puts back the composition file's text from one side of an edit, or removes the file where it did not exist. It
   * writes only when the file still holds the other side's text, so a change made since then is never lost.
   */
  async #restoreComposition(asset: OpenAsset, edit: CompositionEdit, direction: "undo" | "redo"): Promise<void> {
    const expected = direction === "undo" ? edit.after : edit.before;
    const restored = direction === "undo" ? edit.before : edit.after;
    await this.#checkCompositionPath(asset);
    const stat = await this.#platform.stat(edit.path);
    if (stat !== null && stat.kind !== "file") {
      throw new ArcueError("conflict", `${edit.path} is not a plain file.`);
    }
    const current = stat === null ? null : await this.#platform.readText(edit.path);
    if (current !== expected) {
      throw new ArcueError("conflict", `${basename(edit.path)} changed since then, so it was left as it is.`);
    }
    if (restored === null) {
      await this.#platform.remove(edit.path);
    } else {
      await prepareArcueFolder(this.#platform, asset.location);
      await this.#platform.writeFileAtomic(edit.path, restored);
    }
  }

  /** A path a composition command names: absolute, or relative to the model's folder. */
  #resolveCompositionPath(asset: OpenAsset, file: string): string {
    const slashed = file.replaceAll("\\", "/");
    return /^(?:[A-Za-z]:)?\//.test(slashed) ? normalizePath(slashed) : joinPath(dirname(asset.path), slashed);
  }

  /**
   * A file to add to the composition: inside the asset's workspace, reached without symbolic links, and an existing
   * file of one of the `extensions`. Returns its path and how the composition file writes it.
   */
  async #newCompositionFile(
    asset: OpenAsset,
    file: string,
    extensions: readonly string[],
  ): Promise<{ path: string; written: string }> {
    const path = this.#resolveCompositionPath(asset, file);
    const name = basename(path);
    const written = relativePath(dirname(asset.path), path);
    if (written === null || pathInside(asset.readRoot, path) === null) {
      throw new ArcueError("invalid-input", `${name} is outside the asset's workspace.`);
    }
    if (!hasExtension(path, extensions)) {
      throw new ArcueError("invalid-input", `${name} is not one of ${extensions.join(", ")}.`);
    }
    if (!(await insideWithoutLinks(this.#platform, asset.readRoot, path))) {
      throw new ArcueError("invalid-input", `${name} is reached through a symbolic link.`);
    }
    if ((await this.#platform.stat(path))?.kind !== "file") {
      throw new ArcueError("not-found", `${path} does not exist.`);
    }
    return { path, written };
  }

  #addCompositionFile(args: CommandArgs<"composition.addFile">): Promise<CommandOutput<"composition.addFile">> {
    const asset = this.#asset(args.assetId);
    return this.#inCompositionLine(asset, async () => {
      const { path, written } = await this.#newCompositionFile(asset, args.file, MODEL_EXTENSIONS);
      if (path === asset.path) throw new ArcueError("invalid-input", `${asset.name} is the model itself.`);
      const bone = args.bone;
      const model = asset.imported.get(asset.path)?.scene;
      if (bone !== undefined && model && !model.nodes.some((node) => node.name === bone || node.path === bone)) {
        throw new ArcueError("invalid-input", `${asset.name} has no bone "${bone}".`);
      }
      const role = args.role ?? (await this.#roleOf(asset, path));
      const result = await this.#editComposition(asset, (composition, same) =>
        withMember(composition, { file: written, role, node: args.node, bone }, same(path)),
      );
      return { ...result, role };
    });
  }

  /** How a file joins the view when the caller names no role, from what the file holds. */
  async #roleOf(asset: OpenAsset, path: string): Promise<"animation" | "set"> {
    const bytes = await this.#platform.readFile(path);
    const scene = await this.#importFile(asset, {
      path,
      label: basename(path),
      bytes,
      id: versionIdOf(bytes),
      problem: null,
    });
    const role = memberRoleFor({ meshes: scene.meshes.length, clips: scene.clips.length });
    if (role === null) throw new ArcueError("invalid-input", `${basename(path)} has no meshes or clips.`);
    return role;
  }

  #removeCompositionFile(args: CommandArgs<"composition.removeFile">): Promise<{ path: string }> {
    const asset = this.#asset(args.assetId);
    const path = this.#resolveCompositionPath(asset, args.file);
    const label = relativePath(dirname(asset.path), path);
    return this.#inCompositionLine(asset, () =>
      this.#editComposition(asset, (composition, same) => {
        if (!listsMember(composition, same(path))) {
          if (dirname(path) === dirname(asset.path) && isConventionAnimation(asset.path, basename(path))) {
            throw new ArcueError(
              "invalid-input",
              `${basename(path)} joins by its name. Rename or move it to take it out of the view.`,
            );
          }
          throw new ArcueError("not-found", `${args.file} is not in the composition.`);
        }
        return withoutMember(composition, same(path), (id) => label !== null && splitMemberPath(id).file === label);
      }),
    );
  }

  /**
   * Moves an added file's attached entries onto a bone of the model, written by its name when the name finds it, or
   * off their bone, in one edit. `nodes` picks the entries whose node names one of those nodes of the file.
   */
  #attachCompositionFile(args: CommandArgs<"composition.attachFile">): Promise<{ path: string }> {
    const asset = this.#asset(args.assetId);
    return this.#inCompositionLine(asset, () => {
      const path = this.#resolveCompositionPath(asset, args.file);
      const model = asset.imported.get(asset.path)?.scene;
      let bone: string | undefined;
      if (args.bone !== null) {
        bone = model ? boneReference(model.nodes, args.bone) : args.bone;
        if (bone === undefined) throw new ArcueError("invalid-input", `${asset.name} has no bone "${args.bone}".`);
      }
      const member = asset.imported.get(path)?.scene;
      const sameNode = (wanted: string, written: string | undefined): boolean => {
        if (written === undefined) return false;
        if (written === wanted) return true;
        if (!member) return false;
        const index = findNode(member.nodes, written, false);
        return index !== null && index === findNode(member.nodes, wanted, false);
      };
      const wanted = args.nodes;
      const picked = (written: string | undefined): boolean =>
        wanted === undefined || wanted.some((node) => sameNode(node, written));
      return this.#editComposition(asset, (composition, same) => {
        const entries = (composition.attach ?? []).filter((entry) => same(path)(entry.file));
        if (entries.length === 0 && (composition.animations ?? []).some(same(path))) {
          throw new ArcueError("invalid-input", `${args.file} is an animation file, so it has nothing to attach.`);
        }
        const lost = (wanted ?? []).find((node) => !entries.some((entry) => sameNode(node, entry.node)));
        if (lost !== undefined) {
          throw new ArcueError("not-found", `Node ${lost} of ${args.file} is not attached or set in the composition.`);
        }
        const moved = withAttachBone(composition, same(path), picked, bone);
        if (moved) return moved;
        throw new ArcueError("not-found", `${args.file} is not attached or set in the composition.`);
      });
    });
  }

  #setMaterialTexture(args: CommandArgs<"material.setTexture">): Promise<{ path: string }> {
    const asset = this.#asset(args.assetId);
    return this.#inCompositionLine(asset, async () => {
      if (!asset.loaded().scene.materials.some((material) => material.name === args.material)) {
        throw new ArcueError("not-found", `${asset.name} has no material "${args.material}".`);
      }
      const written =
        args.file === null ? null : (await this.#newCompositionFile(asset, args.file, readableImageExtensions)).written;
      return this.#editComposition(asset, (composition) => withTexture(composition, args.material, args.slot, written));
    });
  }

  #createComment(
    args: CommandArgs<"comment.create">,
    author: Author | undefined,
  ): Promise<CommandOutput<"comment.create">> {
    const asset = this.#asset(args.assetId);
    return asset.session.run(async (review) => {
      const { scene, version } = asset.pickedOn(args.version);
      const time = resolveTime(scene, args.time);
      const entry = args.target ? checkTarget(scene, args.target) : null;
      const id = this.#newCommentId();
      const slot = args.screenshot ? await this.#screenshotSlot(asset, id) : null;
      const now = this.#now();
      const comment: Comment = {
        id,
        text: args.text,
        status: "draft",
        createdAt: now,
        updatedAt: now,
        madeOnVersion: version,
        time,
        target: args.target,
        anchorVersion: version,
        anchorRestPositions: entry ? anchorRestPositions(entry.mesh, args.target) : [],
        camera: args.camera,
        context: { ...args.context, screenshot: slot?.relative ?? null },
        anchorState: "exact",
        followUps: [],
        rounds: [],
        reopenedFrom: null,
      };
      const parts = storedPartView(scene, args.parts);
      if (parts) comment.parts = parts;
      if (author) comment.author = author;
      const next: ReviewFile = { ...review, comments: [...review.comments, comment], queue: [...review.queue, id] };
      return {
        next,
        result: { commentId: id },
        edit: editBetween(review, next, { comments: [id] }),
        ...this.#screenshotWrite(slot, args.screenshot),
      };
    });
  }

  #updateComment(args: CommandArgs<"comment.update">): Promise<void> {
    const asset = this.#asset(args.assetId);
    return asset.session.run(async (review) => {
      const comment = findComment(review, args.commentId);
      if (comment.status !== "draft") {
        throw new ArcueError("conflict", `${comment.id} was sent; reopen it with a follow-up instead.`);
      }
      const updated: Comment = { ...comment, updatedAt: this.#now() };
      if (args.text !== undefined) {
        const pending = comment.reopenedFrom === null ? undefined : comment.followUps.at(-1);
        if (pending) updated.followUps = [...comment.followUps.slice(0, -1), { ...pending, text: args.text }];
        else updated.text = args.text;
      }
      if (args.camera !== undefined) updated.camera = args.camera;
      if (args.time !== undefined || args.target !== undefined) {
        if (args.version === undefined)
          throw new ArcueError("invalid-input", "A new time or target needs its version.");
        const { scene, version } = asset.pickedOn(args.version);
        if (args.time !== undefined) updated.time = resolveTime(scene, args.time);
        if (args.target !== undefined) {
          const entry = args.target ? checkTarget(scene, args.target) : null;
          updated.target = args.target;
          updated.anchorVersion = version;
          updated.anchorRestPositions = entry ? anchorRestPositions(entry.mesh, args.target) : [];
          updated.anchorState = "exact";
        }
      }
      if (args.parts !== undefined) {
        const parts = storedPartView(asset.loaded().scene, args.parts);
        if (parts) updated.parts = parts;
        else delete updated.parts;
      }
      const slot = args.screenshot ? await this.#screenshotSlot(asset, comment.id) : null;
      const screenshot = args.screenshot === undefined ? comment.context.screenshot : (slot?.relative ?? null);
      updated.context = { ...(args.context ?? comment.context), screenshot };
      const next = replaceComment(review, updated);
      return {
        next,
        result: undefined,
        edit: editBetween(review, next, { comments: [comment.id] }),
        ...this.#screenshotWrite(slot, args.screenshot),
      };
    });
  }

  /** Deletes a draft. A reopened draft loses only its pending follow-up and returns to the status it had. */
  #deleteComment(args: CommandArgs<"comment.delete">): Promise<void> {
    const asset = this.#asset(args.assetId);
    return asset.session.run((review) => {
      const comment = findComment(review, args.commentId);
      if (comment.status !== "draft") throw new ArcueError("conflict", "Only draft comments can be deleted.");
      const queue = review.queue.filter((id) => id !== comment.id);
      const next: ReviewFile =
        comment.reopenedFrom === null
          ? { ...review, queue, comments: review.comments.filter((entry) => entry.id !== comment.id) }
          : {
              ...replaceComment(review, {
                ...comment,
                status: comment.reopenedFrom,
                reopenedFrom: null,
                followUps: comment.followUps.slice(0, -1),
                updatedAt: this.#now(),
              }),
              queue,
            };
      return { next, result: undefined, edit: editBetween(review, next, { comments: [comment.id] }) };
    });
  }

  #resolveComment(args: CommandArgs<"comment.resolve">): Promise<void> {
    const asset = this.#asset(args.assetId);
    return asset.session.run((review) => {
      const comment = findComment(review, args.commentId);
      if (comment.status !== "sent") throw new ArcueError("conflict", "Only sent comments can be resolved.");
      const next = replaceComment(review, { ...comment, status: "resolved", updatedAt: this.#now() });
      return { next, result: undefined, edit: editBetween(review, next, { comments: [comment.id] }) };
    });
  }

  #reopenComment(args: CommandArgs<"comment.reopen">, author: Author | undefined): Promise<void> {
    const asset = this.#asset(args.assetId);
    return asset.session.run((review) => {
      const comment = findComment(review, args.commentId);
      const afterRound = comment.rounds.at(-1);
      if (comment.status === "draft" || afterRound === undefined) {
        throw new ArcueError("conflict", "Only sent or resolved comments can be reopened.");
      }
      const now = this.#now();
      const reopened = replaceComment(review, {
        ...comment,
        status: "draft",
        reopenedFrom: comment.status,
        updatedAt: now,
        followUps: [
          ...comment.followUps,
          { text: args.text, createdAt: now, afterRound, ...(author ? { author } : {}) },
        ],
      });
      const next = { ...reopened, queue: [...reopened.queue, comment.id] };
      return { next, result: undefined, edit: editBetween(review, next, { comments: [comment.id] }) };
    });
  }

  /** The import warnings of the version on screen; none before the first version loads. */
  #warnings(asset: OpenAsset, review: ReviewFile = asset.session.review): AssetWarning[] {
    const listed = asset.scene ? listWarnings(asset.scene, review, asset.path) : [];
    return asset.missing ? [modelNotFound(review, asset.path), ...listed] : listed;
  }

  /** Dismisses the listed warnings, or every warning not dismissed yet for null, as one undoable edit. */
  #dismissWarnings(assetId: string, ids: readonly string[] | null): Promise<void> {
    const asset = this.#asset(assetId);
    return asset.session.run((review) => {
      const warnings = this.#warnings(asset, review);
      const chosen =
        ids === null
          ? warnings.filter((warning) => !warning.dismissed).map((warning) => warning.id)
          : ids.map((id) => findWarning(warnings, id).id);
      const current = review.dismissedWarnings ?? [];
      const added = chosen.filter((id) => !current.includes(id));
      if (added.length === 0) return { next: null, result: undefined };
      const next = withDismissedWarnings(review, [...current, ...added]);
      return { next, result: undefined, edit: editBetween(review, next, { warnings: added }) };
    });
  }

  /**
   * Adds a draft about an import warning, without a surface target, from the view the window last reported. A clip's
   * warning is made at the clip's first frame. While a draft made from the warning is queued, returns that draft.
   */
  #createFromWarning(
    args: CommandArgs<"comment.createFromWarning">,
    author: Author | undefined,
  ): Promise<CommandOutput<"comment.createFromWarning">> {
    const asset = this.#asset(args.assetId);
    return asset.session.run((review) => {
      const { scene, version } = asset.loaded();
      const warning = findWarning(this.#warnings(asset, review), args.warningId);
      const queued = review.comments.find((comment) => comment.id === warning.commentId && comment.status === "draft");
      if (queued) return { next: null, result: { commentId: queued.id } };
      const id = this.#newCommentId();
      const now = this.#now();
      const clipName = warningClip(warning);
      const clip = clipName === null ? null : findClip(scene, clipName);
      const comment: Comment = {
        id,
        text: warning.message,
        status: "draft",
        createdAt: now,
        updatedAt: now,
        madeOnVersion: version,
        time: clip ? { kind: "frame", clip: clip.name, clipDisplayName: clip.displayName, frame: 0 } : { kind: "none" },
        target: null,
        anchorVersion: version,
        anchorRestPositions: [],
        camera: asset.viewState?.camera ?? frontCamera(scene),
        context: { vertexCount: 0, bones: [], centroid: null, joints: [], viewLabel: "", screenshot: null },
        anchorState: "exact",
        followUps: [],
        rounds: [],
        reopenedFrom: null,
        warning: commentWarning(warning),
      };
      if (author) comment.author = author;
      const next: ReviewFile = { ...review, comments: [...review.comments, comment], queue: [...review.queue, id] };
      return { next, result: { commentId: id }, edit: editBetween(review, next, { comments: [id] }) };
    });
  }

  /**
   * Steps the asset's history back or forward. It runs in line with composition edits, so a composition step and an
   * edit never interleave, and reloads the asset after a composition step. A composition step whose file changed since
   * then rejects with conflict and leaves the history, so the next step reaches the edits behind it.
   */
  #undo(assetId: string, direction: "undo" | "redo"): Promise<{ changed: boolean }> {
    const asset = this.#asset(assetId);
    const history = asset.session.history;
    return asset.compositionEdits.run(async () => {
      const step = await asset.session.run<{ changed: boolean; reload: boolean }>(async (review) => {
        const edit = direction === "undo" ? history.peekUndo() : history.peekRedo();
        if (!edit) return { next: null, result: { changed: false, reload: false } };
        const apply = () => (direction === "undo" ? history.undone() : history.redone());
        if (edit.kind === "composition") {
          try {
            await this.#restoreComposition(asset, edit, direction);
          } catch (error) {
            if (error instanceof ArcueError && error.code === "conflict") history.drop(direction);
            throw error;
          }
          return { next: null, result: { changed: true, reload: true }, apply };
        }
        return {
          next: applySnapshot(review, direction === "undo" ? edit.before : edit.after),
          result: { changed: true, reload: false },
          apply,
        };
      });
      if (step.reload) await this.#load(asset).catch(() => undefined);
      return { changed: step.changed };
    });
  }

  async #copyRound(assetId: string, author: Author | undefined): Promise<CommandOutput<"round.copy">> {
    const asset = this.#asset(assetId);
    const reviewFolder = asset.location.folder;
    const { round, prompt } = await asset.session.run(async (review) => {
      const { scene, version } = asset.loaded();
      if (review.queue.length === 0) throw new ArcueError("conflict", "The queue has no comments to copy.");
      const folderOf = (number: number) => joinPath(reviewFolder, "rounds", `round-${number}`);
      let round = Math.max(0, ...review.rounds.map((entry) => entry.number)) + 1;
      while (await this.#platform.exists(folderOf(round))) round++;
      const folder = folderOf(round);
      if (!(await insideWithoutLinks(this.#platform, reviewFolder, joinPath(folder, "round.json")))) {
        throw new ArcueError("conflict", `${dirname(folder)} is a symbolic link.`);
      }

      const screenshots = new Map<string, Uint8Array>();
      const queued: Comment[] = [];
      for (const id of review.queue) {
        const comment = findComment(review, id);
        const bytes = await readScreenshot(this.#platform, reviewFolder, id, comment.context.screenshot);
        if (bytes) screenshots.set(id, bytes);
        queued.push(bytes ? comment : { ...comment, context: { ...comment.context, screenshot: null } });
      }
      const convention = this.#settings.current.coordinates;
      const data = buildRoundData({ round, review, version, scene, comments: queued, convention });
      const fileModifiedAt = review.versions.find((entry) => entry.id === version)?.fileModifiedAt;
      const prompt = renderPrompt({
        data,
        assetPath: asset.path,
        roundFolder: folder,
        exportedAt: fileModifiedAt ? this.#formatClockTime(Date.parse(fileModifiedAt)) : "at an unknown time",
        partNames: new Map(scene.parts.map((part) => [part.id, part.name])),
      });

      const now = this.#now();
      const sent = new Set(review.queue);
      const comments = review.comments.map((comment): Comment => {
        if (!sent.has(comment.id)) return comment;
        return {
          ...comment,
          status: "sent",
          reopenedFrom: null,
          updatedAt: now,
          rounds: [...comment.rounds, round],
          context: {
            ...comment.context,
            screenshot: screenshots.has(comment.id) ? `rounds/round-${round}/${comment.id}.png` : null,
          },
        };
      });
      const summary: RoundSummary = { number: round, createdAt: now, version, comments: [...review.queue] };
      if (author) summary.author = author;
      return {
        next: { ...review, comments, queue: [], rounds: [...review.rounds, summary] },
        result: { round, prompt },
        clearHistory: true,
        prepare: async () => {
          for (const [id, bytes] of screenshots)
            await this.#platform.writeFileAtomic(joinPath(folder, `${id}.png`), bytes);
          await this.#platform.writeFileAtomic(joinPath(folder, "round.json"), `${JSON.stringify(data, null, 2)}\n`);
          await this.#platform.writeFileAtomic(joinPath(folder, "prompt.md"), prompt);
        },
        rollback: () => this.#platform.remove(folder),
      };
    });
    let copiedToClipboard = false;
    try {
      await this.#platform.writeClipboard(prompt);
      copiedToClipboard = true;
    } catch {
      copiedToClipboard = false;
    }
    this.registry.emit("round.copied", { assetId: asset.id, round });
    try {
      await this.#removeUnusedScreenshots(asset);
    } catch (error) {
      this.#onError(error);
    }
    return { round, prompt, copiedToClipboard };
  }

  /**
   * Removes unsent screenshots that no comment uses and undo cannot bring back. It runs inside the asset's review
   * changes, so no comment can be saving a screenshot meanwhile, and it removes only files named like screenshots.
   */
  #removeUnusedScreenshots(asset: OpenAsset): Promise<void> {
    return asset.session.run(async (review) => {
      const folder = joinPath(asset.location.folder, "screenshots");
      const stat = await this.#platform.stat(folder);
      if (stat?.kind !== "directory" || !(await insideWithoutLinks(this.#platform, asset.location.folder, folder))) {
        return { next: null, result: undefined };
      }
      const kept = asset.session.history.screenshots();
      for (const comment of review.comments) if (comment.context.screenshot) kept.add(comment.context.screenshot);
      for (const entry of await this.#platform.list(folder)) {
        if (entry.kind !== "file" || !UNSENT_SCREENSHOT_NAME.test(entry.name)) continue;
        if (!kept.has(`screenshots/${entry.name}`)) await this.#platform.remove(joinPath(folder, entry.name));
      }
      return { next: null, result: undefined };
    });
  }
}

/** The matches worth offering, best first: reviews that hold comments, rounds or dismissed warnings. */
function offered(matches: Parameters<typeof rankCandidates>[0]): ReviewCandidate[] {
  return rankCandidates(matches.filter(({ earlier }) => !isUntouched(earlier.review)));
}

function replaceComment(review: ReviewFile, updated: Comment): ReviewFile {
  return { ...review, comments: review.comments.map((comment) => (comment.id === updated.id ? updated : comment)) };
}

/**
 * The versions with the record added, or with the file identity filled in when an older build recorded the same
 * version without it.
 */
function withVersion(versions: readonly AssetVersion[], record: AssetVersion): AssetVersion[] {
  const known = versions.find((version) => version.id === record.id);
  if (!known) return [...versions, record];
  if (known.hash !== undefined) return [...versions];
  const filled: AssetVersion = { ...known, hash: record.hash, size: record.size };
  if (record.files) filled.files = record.files;
  return versions.map((version) => (version === known ? filled : version));
}

/** How a composition names a model bone: by its name when the name finds it, else by its path. */
function boneReference(nodes: readonly SceneNode[], given: string): string | undefined {
  const index = findNode(nodes, given, true);
  const node = index === null ? undefined : nodes[index];
  if (!node) return undefined;
  return findNode(nodes, node.name, true) === index ? node.name : node.path;
}

function sameStat(a: FileStat | null, b: FileStat | null): boolean {
  if (a === null || b === null) return a === b;
  return a.kind === b.kind && a.size === b.size && a.modifiedMs === b.modifiedMs;
}

function assetIdOf(args: unknown): string {
  const assetId = typeof args === "object" && args !== null && "assetId" in args ? args.assetId : undefined;
  if (typeof assetId !== "string") throw new ArcueError("invalid-input", "The command needs an assetId.");
  return assetId;
}

function buffersIn(value: unknown): ArrayBuffer[] {
  if (typeof value !== "object" || value === null) return [];
  return Object.values(value).flatMap((entry) =>
    entry instanceof Uint8Array && entry.buffer instanceof ArrayBuffer ? [entry.buffer] : [],
  );
}

function localClockTime(epochMs: number): string {
  const date = new Date(epochMs);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
