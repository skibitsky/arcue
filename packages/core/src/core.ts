import type {
  AssetVersion,
  CommandArgs,
  CommandName,
  CommandOutput,
  Comment,
  CompositionFile,
  CoreClient,
  ListenerErrorHandler,
  MessageEndpoint,
  Peer,
  ReviewFile,
  Unsubscribe,
} from "@arcue/protocol";
import {
  ArcueError,
  COMPOSITION_VERSION,
  commands,
  isCommandName,
  reportListenerError,
  viewStateSchema,
  withTransfer,
} from "@arcue/protocol";
import type { SceneDescription } from "@arcue/scene";
import { splitMemberPath } from "@arcue/scene";
import {
  compositionPathFor,
  hasExtension,
  isCompositionPath,
  isConventionAnimation,
  listsMember,
  MODEL_EXTENSIONS,
  readComposition,
  serializeComposition,
  withMember,
  withoutMember,
  withTexture,
} from "./composition-file";
import type { AssetFiles, ReadFile } from "./composition-load";
import { buildAssetScene, readAssetFiles } from "./composition-load";
import { applySnapshot, editBetween } from "./history";
import { importAsset, readableImageExtensions } from "./import";
import { insideWithoutLinks } from "./links";
import { findComment, OpenAsset } from "./open-asset";
import { basename, dirname, joinPath, normalizePath, pathInside, relativePath } from "./paths";
import type { FileStat, Platform } from "./platform";
import { renderPrompt } from "./prompt";
import { Reanchorer } from "./reanchor";
import type { CallContext } from "./registry";
import { CommandRegistry } from "./registry";
import type { ReviewChange } from "./review-session";
import { ReviewSession } from "./review-session";
import { loadReview, locateReview, reviewFilePath } from "./review-store";
import { buildRoundData } from "./round-data";
import { anchorRestPositions, checkTarget, meshesOf, partsOf, resolveTime, storedPartView } from "./scene-lookup";
import { readScreenshot, UNSENT_SCREENSHOT_NAME } from "./screenshots";
import { Serial } from "./serial";
import type { ServeOptions } from "./serve";
import { serveEndpoint } from "./serve";
import { SettingsStore } from "./settings";
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
   * Connection names must be unique among the open connections.
   */
  connect(endpoint: MessageEndpoint, options: ServeOptions): Peer {
    if (this.#connections.has(options.connection)) {
      throw new ArcueError("conflict", `A connection named "${options.connection}" is already open.`);
    }
    const peer = serveEndpoint(this.registry, endpoint, options);
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
      registry.handleCommand("asset.reload", async (args) => ({
        version: await this.#load(this.#asset(args.assetId)),
      })),
      registry.handleCommand("comment.create", (args) => this.#createComment(args)),
      registry.handleCommand("comment.update", (args) => this.#updateComment(args)),
      registry.handleCommand("comment.delete", (args) => this.#deleteComment(args)),
      registry.handleCommand("comment.resolve", (args) => this.#resolveComment(args)),
      registry.handleCommand("comment.reopen", (args) => this.#reopenComment(args)),
      registry.handleCommand("round.copy", (args) => this.#copyRound(args.assetId)),
      registry.handleCommand("review.undo", (args) => this.#undo(args.assetId, "undo")),
      registry.handleCommand("review.redo", (args) => this.#undo(args.assetId, "redo")),
      registry.handleCommand("composition.addFile", (args) => this.#addCompositionFile(args)),
      registry.handleCommand("composition.removeFile", (args) => this.#removeCompositionFile(args)),
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
      registry.handleQuery("viewState.get", (args) => this.#asset(args.assetId).viewState),
      registry.handleQuery("scene.get", (args) => this.#asset(args.assetId).loaded()),
      registry.handleQuery("scene.parts", (args) => ({ parts: partsOf(this.#asset(args.assetId).loaded().scene) })),
      registry.handleQuery("settings.get", () => this.#settings.current),
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
    let path = normalizePath(args.path);
    let compositionPath = compositionPathFor(path);
    if (isCompositionPath(path)) {
      compositionPath = path;
      path = await this.#modelOf(path);
    }
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
    const loaded = await loadReview(this.#platform, location);
    const id = `a${this.#nextAssetNumber++}`;
    const session = new ReviewSession(this.#platform, location, loaded, (review) =>
      this.registry.emit("review.changed", { assetId: id, review }),
    );
    const asset = new OpenAsset(id, path, location, session, compositionPath);
    if (args.viewState) asset.viewState = args.viewState;
    this.#assets.set(asset.id, asset);
    try {
      await this.#showAsset(asset, window, args);
    } catch (error) {
      this.#assets.delete(asset.id);
      throw error;
    }
    this.registry.emit("asset.opened", { asset: asset.summary });
    asset.stopWatching.push(
      this.#platform.watch(path, () => this.#fileChanged(asset)),
      this.#platform.watch(reviewPath, () => {
        void this.#track(asset.session.refresh().catch((error: unknown) => this.#onError(error)));
      }),
    );
    this.#watchComposition(asset, [compositionPath]);
    void this.#load(asset).catch(() => undefined);
    return { assetId: asset.id };
  }

  /** The model a composition file names, which must sit inside the composition's workspace. */
  async #modelOf(compositionPath: string): Promise<string> {
    const found = await readComposition(this.#platform, compositionPath, "invalid-input");
    if (!found) throw new ArcueError("not-found", `${compositionPath} does not exist.`);
    const model = joinPath(dirname(compositionPath), found.composition.model);
    const root = (await this.#platform.findWorkspaceRoot(compositionPath)) ?? dirname(compositionPath);
    if (pathInside(root, model) === null || !(await insideWithoutLinks(this.#platform, root, model))) {
      throw new ArcueError(
        "invalid-input",
        `${compositionPath} names ${found.composition.model}, which is outside its workspace.`,
      );
    }
    return model;
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
      if (model === null && before === null) return;
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

  #load(asset: OpenAsset): Promise<string> {
    return this.#track(asset.loads.run(() => this.#loadVersion(asset)));
  }

  async #loadVersion(asset: OpenAsset): Promise<string> {
    if (asset.closed) throw new ArcueError("not-found", `${asset.name} is closed.`);
    let files: AssetFiles;
    try {
      files = await readAssetFiles(this.#platform, asset.path, asset.compositionPath, asset.readRoot);
    } catch (error) {
      this.#failed(asset, error);
      throw error;
    }
    this.#watchComposition(asset, files.watch);
    const versionId = files.versionId;
    if (versionId === asset.version) {
      if (asset.status !== "ready") {
        asset.status = "ready";
        asset.error = null;
        this.registry.emit("asset.updated", { asset: asset.summary });
      }
      return versionId;
    }
    asset.status = "loading";
    this.registry.emit("asset.updated", { asset: asset.summary });
    try {
      const scene = await buildAssetScene(files, (file) => this.#importFile(asset, file));
      await asset.session.run((review) => {
        const record: AssetVersion = {
          id: versionId,
          fileModifiedAt: new Date(files.model.modifiedMs).toISOString(),
          loadedAt: this.#now(),
          exporter: exporterName(scene),
          meshes: meshesOf(scene).map((entry) => ({ mesh: entry.path, topology: entry.mesh.topology })),
        };
        if (files.versionFiles) record.files = files.versionFiles;
        const versions = review.versions.some((version) => version.id === versionId)
          ? review.versions
          : [...review.versions, record];
        const reanchorer = new Reanchorer(versions, versionId, scene);
        return {
          next: { ...review, versions, comments: review.comments.map((comment) => reanchorer.reanchor(comment)) },
          result: undefined,
          apply: () => {
            asset.session.history.mapComments((comment) => reanchorer.reanchor(comment));
            asset.scene = scene;
            asset.version = versionId;
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
    return versionId;
  }

  /** Parses one file of the asset, or takes the scene parsed from the same bytes before. */
  async #importFile(asset: OpenAsset, file: ReadFile & { bytes: Uint8Array; id: string }): Promise<SceneDescription> {
    const cached = asset.imported.get(file.path);
    if (cached?.id === file.id) return cached.scene;
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
   * Changes the asset's composition file, creating it beside the model on the first change, and reloads the asset.
   * The file is read fresh for each change; one that cannot be read is never overwritten.
   */
  #editComposition(
    asset: OpenAsset,
    change: (composition: CompositionFile, same: (path: string) => (written: string) => boolean) => CompositionFile,
  ): Promise<{ path: string }> {
    return asset.compositionEdits.run(async () => {
      if (asset.closing) throw new ArcueError("conflict", `${asset.name} is closing.`);
      const path = asset.compositionPath;
      const folder = dirname(path);
      if (!(await insideWithoutLinks(this.#platform, asset.readRoot, path))) {
        throw new ArcueError("conflict", `${path} is outside the workspace or reached through a symbolic link.`);
      }
      const found = await readComposition(this.#platform, path, "conflict");
      if (found && joinPath(folder, found.composition.model) !== asset.path) {
        throw new ArcueError("conflict", `${basename(path)} belongs to ${found.composition.model}, not ${asset.name}.`);
      }
      const current: CompositionFile = found?.composition ?? {
        version: COMPOSITION_VERSION,
        model: relativePath(folder, asset.path) ?? asset.name,
      };
      const same = (target: string) => (written: string) => joinPath(folder, written) === target;
      const text = serializeComposition(change(current, same));
      if (text !== serializeComposition(current)) {
        await this.#platform.writeFileAtomic(path, text);
        await this.#load(asset).catch(() => undefined);
      }
      return { path };
    });
  }

  /** A path a composition command names: absolute, or relative to the composition file. */
  #resolveCompositionPath(asset: OpenAsset, file: string): string {
    const slashed = file.replaceAll("\\", "/");
    return /^(?:[A-Za-z]:)?\//.test(slashed)
      ? normalizePath(slashed)
      : joinPath(dirname(asset.compositionPath), slashed);
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
    const written = relativePath(dirname(asset.compositionPath), path);
    if (written === null || pathInside(asset.readRoot, path) === null) {
      throw new ArcueError("invalid-input", `${file} is outside the asset's workspace.`);
    }
    if (!hasExtension(path, extensions)) {
      throw new ArcueError("invalid-input", `${basename(path)} is not one of ${extensions.join(", ")}.`);
    }
    if (!(await insideWithoutLinks(this.#platform, asset.readRoot, path))) {
      throw new ArcueError("invalid-input", `${file} is reached through a symbolic link.`);
    }
    if ((await this.#platform.stat(path))?.kind !== "file") {
      throw new ArcueError("not-found", `${path} does not exist.`);
    }
    return { path, written };
  }

  async #addCompositionFile(args: CommandArgs<"composition.addFile">): Promise<{ path: string }> {
    const asset = this.#asset(args.assetId);
    const { path, written } = await this.#newCompositionFile(asset, args.file, MODEL_EXTENSIONS);
    if (path === asset.path) throw new ArcueError("invalid-input", `${asset.name} is the model itself.`);
    const bone = args.bone;
    const model = asset.imported.get(asset.path)?.scene;
    if (bone !== undefined && model && !model.nodes.some((node) => node.name === bone || node.path === bone)) {
      throw new ArcueError("invalid-input", `${asset.name} has no bone "${bone}".`);
    }
    return this.#editComposition(asset, (composition, same) =>
      withMember(composition, { file: written, role: args.role, node: args.node, bone }, same(path)),
    );
  }

  async #removeCompositionFile(args: CommandArgs<"composition.removeFile">): Promise<{ path: string }> {
    const asset = this.#asset(args.assetId);
    const path = this.#resolveCompositionPath(asset, args.file);
    const label = relativePath(dirname(asset.path), path);
    return this.#editComposition(asset, (composition, same) => {
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
    });
  }

  async #setMaterialTexture(args: CommandArgs<"material.setTexture">): Promise<{ path: string }> {
    const asset = this.#asset(args.assetId);
    if (!asset.loaded().scene.materials.some((material) => material.name === args.material)) {
      throw new ArcueError("not-found", `${asset.name} has no material "${args.material}".`);
    }
    const written =
      args.file === null ? null : (await this.#newCompositionFile(asset, args.file, readableImageExtensions)).written;
    return this.#editComposition(asset, (composition) => withTexture(composition, args.material, args.slot, written));
  }

  #createComment(args: CommandArgs<"comment.create">): Promise<CommandOutput<"comment.create">> {
    const asset = this.#asset(args.assetId);
    return asset.session.run(async (review) => {
      const { scene, version } = asset.pickedOn(args.version);
      const time = resolveTime(scene, args.time);
      const entry = args.target ? checkTarget(scene, args.target) : null;
      const id = `c${review.nextCommentNumber}`;
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
      const next: ReviewFile = {
        ...review,
        comments: [...review.comments, comment],
        queue: [...review.queue, id],
        nextCommentNumber: review.nextCommentNumber + 1,
      };
      return {
        next,
        result: { commentId: id },
        edit: editBetween(review, next, [id]),
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
        edit: editBetween(review, next, [comment.id]),
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
      return { next, result: undefined, edit: editBetween(review, next, [comment.id]) };
    });
  }

  #resolveComment(args: CommandArgs<"comment.resolve">): Promise<void> {
    const asset = this.#asset(args.assetId);
    return asset.session.run((review) => {
      const comment = findComment(review, args.commentId);
      if (comment.status !== "sent") throw new ArcueError("conflict", "Only sent comments can be resolved.");
      const next = replaceComment(review, { ...comment, status: "resolved", updatedAt: this.#now() });
      return { next, result: undefined, edit: editBetween(review, next, [comment.id]) };
    });
  }

  #reopenComment(args: CommandArgs<"comment.reopen">): Promise<void> {
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
        followUps: [...comment.followUps, { text: args.text, createdAt: now, afterRound }],
      });
      const next = { ...reopened, queue: [...reopened.queue, comment.id] };
      return { next, result: undefined, edit: editBetween(review, next, [comment.id]) };
    });
  }

  #undo(assetId: string, direction: "undo" | "redo"): Promise<{ changed: boolean }> {
    const asset = this.#asset(assetId);
    const history = asset.session.history;
    return asset.session.run<{ changed: boolean }>((review) => {
      const edit = direction === "undo" ? history.peekUndo() : history.peekRedo();
      if (!edit) return { next: null, result: { changed: false } };
      return {
        next: applySnapshot(review, direction === "undo" ? edit.before : edit.after),
        result: { changed: true },
        apply: () => (direction === "undo" ? history.undone() : history.redone()),
      };
    });
  }

  async #copyRound(assetId: string): Promise<CommandOutput<"round.copy">> {
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
      const summary = { number: round, createdAt: now, version, comments: [...review.queue] };
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

function replaceComment(review: ReviewFile, updated: Comment): ReviewFile {
  return { ...review, comments: review.comments.map((comment) => (comment.id === updated.id ? updated : comment)) };
}

function sameStat(a: FileStat | null, b: FileStat | null): boolean {
  if (a === null || b === null) return a === b;
  return a.kind === b.kind && a.size === b.size && a.modifiedMs === b.modifiedMs;
}

function exporterName(scene: SceneDescription): string | null {
  const exporter = scene.source.exporter;
  if (!exporter) return null;
  return [exporter.name, exporter.version].filter((part) => part !== null && part !== "").join(" ");
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
