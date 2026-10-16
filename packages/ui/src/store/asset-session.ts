import type {
  AssetSummary,
  AssetWarning,
  CommandInput,
  Comment,
  CoreClient,
  DisplayMode,
  FrameRange,
  PartView,
  ReviewCandidate,
  ReviewFile,
  TimeSelection,
  ViewState,
  WarningSubject,
} from "@arcue/protocol";
import { ArcueError } from "@arcue/protocol";
import type { CameraAnchor, Clip, SceneDescription, SpatialAnchor, TimeAnchor } from "@arcue/scene";
import {
  defaultPartView,
  frameToSeconds,
  isolationAsVisibility,
  knownPartView,
  lastFrame,
  lodLevels,
  secondsToFrame,
  subjectMeshes,
  withPartVisible,
} from "@arcue/scene";
import type { CommentOverlay, ScreenPosition, ToolId, Viewport } from "@arcue/viewport";
import { plural } from "../format";
import { commentPartView } from "./comment-view";
import { currentMessage, lastRound, pendingFollowUp, queuedComments } from "./history";
import { Store } from "./observable";
import type { OutlineFile } from "./outline";
import { hasOutline } from "./outline";
import { adjacentKey, clampFrame, isPlayable, normalizeRange, stepFrame } from "./timeline";

export const NEW_COMMENT_OVERLAY = "new";
export const BRUSH_MIN = 6;
export const BRUSH_MAX = 60;
const REPORT_DELAY_MS = 400;
const ADDED_FLASH_MS = 1200;
const SCREENSHOT_WIDTH = 1280;
const THUMBNAIL_RETRY_MS = 2000;
const THUMBNAIL_ATTEMPTS = 3;
let nextBoxId = 1;

export type ToastKind = "copied" | "info" | "alert";

export interface ToastInput {
  message: string;
  kind: ToastKind;
}

/** What a session needs from the window around it. */
export interface SessionHost {
  readonly client: CoreClient;
  notify(toast: ToastInput): void;
  /** Writes the prompt to the clipboard; false when the browser blocks it. */
  writeClipboard(text: string): Promise<boolean>;
  /** Shows the prompt in a sheet with its text selected; `round` names the round it was saved as, when there is one. */
  showCopySheet(sheet: { round: number | null; prompt: string }): void;
  setTimer(delayMs: number, callback: () => void): () => void;
}

export type BoxMode = "new" | "edit" | "reopen";

export interface CommentBox {
  /** Changes each time a box opens, so the view can focus a new one. */
  id: number;
  mode: BoxMode;
  /** The draft being edited, or the comment being reopened. */
  commentId: string | null;
  time: TimeSelection;
  /** The box was opened in the rest pose, which has no time to remove. */
  restPose: boolean;
  target: SpatialAnchor | null;
  /** The bone nearest a point target, for its chip. */
  targetBone: string | null;
  /** The round whose fix did not work, for a reopened comment. */
  followUpRound: number | null;
  text: string;
  /** Increases each time the box refuses to close, which replays its shake. */
  nudge: number;
  busy: boolean;
  /** The asset version whose scene the target was picked on. */
  anchorVersion: string | null;
  /** The user changed the time or the target in this box; an edit sends only what changed. */
  timeEdited: boolean;
  targetEdited: boolean;
  /** The core refused the target because the file reloaded; the next click or stroke replaces it. */
  needsRepick: boolean;
}

export interface SessionState {
  summary: AssetSummary;
  review: ReviewFile | null;
  scene: SceneDescription | null;
  version: string | null;
  sceneError: string | null;
  viewportReady: boolean;
  tool: ToolId;
  displayMode: DisplayMode;
  skeleton: boolean;
  /** Which parts the view draws: hidden and shown parts, an isolated part and the LOD level. */
  parts: PartView;
  /** The outline drawer is open; it shows only when `hasOutline` holds for the scene. */
  outlineOpen: boolean;
  brushSize: number;
  clip: string | null;
  loop: boolean;
  speed: number;
  range: FrameRange | null;
  selection: string | null;
  box: CommentBox | null;
  /** A draft that was just added, which the queue flashes. */
  added: string | null;
  /** The import warnings of the version on screen, errors first, as `warning.list` gives them. */
  warnings: readonly AssetWarning[];
  /** The subject the 3D view tints, as when pointing at a warning. */
  highlight: WarningSubject | null;
  /** An earlier review the core offers to continue, until the person continues, dismisses it or closes the tab. */
  offer: ReviewCandidate | null;
}

export interface TimeState {
  seconds: number;
  playing: boolean;
}

interface PendingShow {
  clip?: string | null;
  frame?: number;
}

/** What `selectComment` did: selected the comment, found no such comment, or kept a box with unsaved text. */
export type SelectResult = "selected" | "not-found" | "refused";

export class AssetSession {
  readonly assetId: string;
  readonly state: Store<SessionState>;
  readonly time = new Store<TimeState>({ seconds: 0, playing: false });
  /** Bumped on every camera move, so the comment box can follow its pin. */
  readonly camera = new Store<{ tick: number }>({ tick: 0 });
  readonly thumbnails = new Store<{ urls: Readonly<Record<string, string | null>> }>({ urls: {} });

  readonly #host: SessionHost;
  #viewport: Viewport | null = null;
  #container: HTMLElement | null = null;
  #unbindViewport: (() => void) | null = null;
  #sceneOnViewport: SceneDescription | null = null;
  #loadingVersion: string | null = null;
  #loadSequence = 0;
  #reviewSequence = 0;
  #initialViewApplied = false;
  #pendingShow: PendingShow | null = null;
  #savedView: ViewState | null = null;
  #cancelReport: (() => void) | null = null;
  #cancelAdded: (() => void) | null = null;
  #overlayKey: readonly unknown[] = [];
  readonly #thumbnailKeys = new Map<string, string>();
  readonly #thumbnailAttempts = new Map<string, number>();
  #copying = false;
  #warningSequence = 0;
  #offerDismissed = false;
  #disposed = false;

  constructor(summary: AssetSummary, host: SessionHost) {
    this.assetId = summary.assetId;
    this.#host = host;
    this.state = new Store<SessionState>({
      summary,
      review: null,
      scene: null,
      version: null,
      sceneError: null,
      viewportReady: false,
      tool: "view",
      displayMode: "lit",
      skeleton: false,
      parts: defaultPartView(),
      outlineOpen: false,
      brushSize: 22,
      clip: null,
      loop: true,
      speed: 1,
      range: null,
      selection: null,
      box: null,
      added: null,
      warnings: [],
      highlight: null,
      offer: null,
    });
  }

  get #client(): CoreClient {
    return this.#host.client;
  }

  get viewport(): Viewport | null {
    return this.#viewport;
  }

  /**
   * Loads the review, the summary and the scene. The first load also reads the saved view. A review that arrives
   * through `review.changed` while the query is in flight is newer, so the query's answer is then dropped.
   * Returns false when the core no longer has the asset.
   */
  async refresh(): Promise<boolean> {
    const { client } = this.#host;
    const reviewSequence = this.#reviewSequence;
    const initial = !this.#initialViewApplied && this.#savedView === null;
    const [review, savedView, list, candidates] = await Promise.all([
      client.query("review.get", { assetId: this.assetId }).catch(() => null),
      initial ? client.query("viewState.get", { assetId: this.assetId }).catch(() => null) : Promise.resolve(null),
      client.query("asset.list", {}).catch(() => null),
      client.query("review.candidates", { assetId: this.assetId }).catch(() => null),
    ]);
    if (this.#disposed) return true;
    if (savedView && !this.#initialViewApplied) this.#savedView = savedView;
    if (savedView?.relinkOfferDismissed) this.#offerDismissed = true;
    if (candidates) this.setOffer(candidates.candidates[0] ?? null);
    if (review && reviewSequence === this.#reviewSequence) this.setReview(review);
    const summary = list?.assets.find((asset) => asset.assetId === this.assetId);
    if (summary) this.setSummary(summary);
    else await this.#loadScene();
    void this.refreshWarnings();
    return list === null || summary !== undefined;
  }

  setSummary(summary: AssetSummary): void {
    const previous = this.state.get().summary;
    this.state.patch({ summary });
    if (previous.error !== summary.error) void this.refreshWarnings();
    void this.#loadScene();
  }

  /** Shows the core's offer to continue an earlier review, unless the person dismissed one in this tab; null hides it. */
  setOffer(offer: ReviewCandidate | null): void {
    this.state.patch({ offer: this.#offerDismissed ? null : offer });
  }

  /** Moves the offered review onto this asset. */
  async continueReview(): Promise<void> {
    const { offer } = this.state.get();
    if (!offer) return;
    await this.#run(async () => {
      await this.#client.execute("review.relink", { assetId: this.assetId, from: offer.path });
      this.setOffer(null);
    });
  }

  /** Hides the offer for good in this tab; the view state remembers it across window reloads and moves. */
  dismissOffer(): void {
    this.#offerDismissed = true;
    this.setOffer(null);
    void this.reportState();
  }

  setReview(review: ReviewFile): void {
    this.#reviewSequence++;
    const { selection, box } = this.state.get();
    const ids = new Set(review.comments.map((comment) => comment.id));
    const keepSelection = selection !== null && ids.has(selection) ? selection : null;
    this.state.patch({ review, selection: keepSelection, box: this.#refreshBox(box, review) });
    this.#dropThumbnails(review);
    this.#syncSelection();
    void this.refreshWarnings();
  }

  /** An edit box follows its comment's stored time and target until the user changes them in the box. */
  #refreshBox(box: CommentBox | null, review: ReviewFile): CommentBox | null {
    if (box?.mode !== "edit" || box.commentId === null) return box;
    if (!review.queue.includes(box.commentId)) return null;
    const comment = review.comments.find((candidate) => candidate.id === box.commentId);
    if (!comment) return null;
    return {
      ...box,
      ...(box.timeEdited ? {} : { time: selectionOf(comment.time), restPose: comment.time.kind === "none" }),
      ...(box.targetEdited
        ? {}
        : {
            target: comment.target,
            targetBone: comment.context.bones[0]?.name ?? null,
            anchorVersion: comment.anchorVersion,
          }),
      followUpRound: pendingFollowUp(comment)?.afterRound ?? null,
    };
  }

  /** Shows the asset at a clip and frame, as `view.showAsset` asks. */
  show(request: PendingShow): void {
    if (request.clip === undefined && request.frame === undefined) return;
    if (this.state.get().scene && this.#initialViewApplied) {
      const clip = request.clip === undefined ? this.state.get().clip : request.clip;
      this.setClip(clip, request.frame ?? 0);
    } else {
      this.#pendingShow = request;
    }
  }

  async #loadScene(): Promise<void> {
    const { summary, version } = this.state.get();
    if (!summary.version || summary.version === version || summary.version === this.#loadingVersion) return;
    const sequence = ++this.#loadSequence;
    this.#loadingVersion = summary.version;
    try {
      const result = await this.#client.query("scene.get", { assetId: this.assetId });
      if (this.#disposed || sequence !== this.#loadSequence) return;
      this.state.patch({ scene: result.scene, version: result.version, sceneError: null });
      void this.refreshWarnings();
      await this.#applyScene();
    } catch (error) {
      if (sequence === this.#loadSequence) this.state.patch({ sceneError: messageOf(error) });
    } finally {
      if (sequence === this.#loadSequence) this.#loadingVersion = null;
    }
  }

  attachViewport(viewport: Viewport, container: HTMLElement): () => void {
    this.#unbindViewport?.();
    this.#viewport = viewport;
    this.#container = container;
    this.#sceneOnViewport = null;
    this.#overlayKey = [];
    const { tool, displayMode, skeleton, parts, brushSize, speed, loop } = this.state.get();
    viewport.setTool(tool);
    viewport.setDisplayMode(displayMode);
    viewport.setSkeletonVisible(skeleton);
    viewport.setPartView(parts);
    viewport.setBrushSize(brushSize);
    viewport.setSpeed(speed);
    viewport.setLoop(loop);
    viewport.setHighlight(this.#highlightedMeshes());
    const unsubscribers = [
      viewport.on("pinPlaced", ({ anchor }) => this.#openNew(anchor)),
      viewport.on("regionPainted", ({ overlayId, anchor }) => this.#onRegionPainted(overlayId, anchor)),
      viewport.on("overlayClicked", ({ id }) => {
        if (id !== NEW_COMMENT_OVERLAY) this.selectComment(id);
      }),
      viewport.on("emptyClicked", () => this.#onEmptyClick()),
      viewport.on("time", ({ seconds, playing }) => {
        const wasPlaying = this.time.get().playing;
        this.time.patch({ seconds, playing });
        if (wasPlaying && !playing) this.#scheduleReport();
      }),
      viewport.on("cameraChange", () => {
        this.camera.set({ tick: this.camera.get().tick + 1 });
        this.#scheduleReport();
      }),
    ];
    this.#unbindViewport = () => {
      for (const unsubscribe of unsubscribers) unsubscribe();
    };
    void this.#applyScene();
    return () => {
      if (this.#viewport !== viewport) return;
      this.#unbindViewport?.();
      this.#unbindViewport = null;
      this.#viewport = null;
      this.#container = null;
      this.state.patch({ viewportReady: false });
    };
  }

  async #applyScene(): Promise<void> {
    const viewport = this.#viewport;
    const scene = this.state.get().scene;
    if (!viewport || !scene || this.#sceneOnViewport === scene) return;
    this.#sceneOnViewport = scene;
    try {
      await viewport.setScene(scene);
    } catch (error) {
      if (this.state.get().scene === scene) this.state.patch({ sceneError: messageOf(error) });
      return;
    }
    if (this.#viewport !== viewport || this.state.get().scene !== scene) return;
    if (!this.#initialViewApplied) {
      this.#initialViewApplied = true;
      this.#applyInitialView(viewport, scene);
    } else {
      this.#reconcileClip(scene, viewport);
      this.#reconcileParts(scene);
    }
    this.state.patch({ viewportReady: true });
    viewport.setHighlight(this.#highlightedMeshes());
    this.#syncSelection(true);
  }

  #applyInitialView(viewport: Viewport, scene: SceneDescription): void {
    const saved = this.#savedView;
    const pending = this.#pendingShow;
    this.#savedView = null;
    this.#pendingShow = null;
    if (saved) {
      viewport.setCamera(saved.camera, { animate: false });
      this.setDisplayMode(saved.display.mode);
      this.setSkeleton(saved.display.skeleton);
      this.setPartView(saved.parts);
      this.setOutlineOpen(saved.outlineOpen);
    }
    const exists = (clip: string | null | undefined) => clip == null || scene.clips.some((c) => c.name === clip);
    if (pending && exists(pending.clip)) {
      const clip = pending.clip === undefined ? (scene.clips[0]?.name ?? null) : pending.clip;
      this.setClip(clip, pending.frame ?? 0);
    } else if (saved && exists(saved.clip)) {
      this.setClip(saved.clip, saved.frame);
      if (saved.range) this.setRange(saved.range);
    } else {
      this.setClip(scene.clips[0]?.name ?? null, 0);
    }
  }

  /** After a reload the viewport keeps the clip when the new scene has it, and the frame clamped to its length. */
  #reconcileClip(scene: SceneDescription, viewport: Viewport): void {
    const { clip, range } = this.state.get();
    const current = scene.clips.find((candidate) => candidate.name === clip);
    if (!current) {
      this.setClip(null);
      return;
    }
    const seconds = frameToSeconds(this.currentFrame(), current.fps);
    this.time.patch({ seconds });
    viewport.setClip(current.name);
    viewport.setTime(seconds);
    this.setRange(range && range.start < lastFrame(current) ? { start: range.start, end: range.end } : null);
  }

  /** After a reload the parts view forgets parts and levels the new scene does not have. */
  #reconcileParts(scene: SceneDescription): void {
    const { parts } = this.state.get();
    if (!samePartView(knownPartView(scene.parts, parts), parts)) this.setPartView(parts);
  }

  clipInfo(clip: string | null = this.state.get().clip): Clip | null {
    if (clip === null) return null;
    return this.state.get().scene?.clips.find((candidate) => candidate.name === clip) ?? null;
  }

  /** The frame on screen: rounded down while playing, to the nearest frame otherwise. */
  currentFrame(): number {
    const clip = this.clipInfo();
    if (!clip) return 0;
    const { seconds, playing } = this.time.get();
    return clampFrame(secondsToFrame(seconds, clip.fps, playing ? "down" : "nearest"), clip);
  }

  currentTime(): TimeSelection {
    const { clip, range } = this.state.get();
    if (clip === null) return { kind: "none" };
    if (range) return { kind: "range", clip, start: range.start, end: range.end };
    return { kind: "frame", clip, frame: this.currentFrame() };
  }

  screenPosition(anchor: SpatialAnchor): ScreenPosition | null {
    return this.#viewport?.screenPosition(anchor) ?? null;
  }

  setTool(tool: ToolId): void {
    this.state.patch({ tool });
    this.#viewport?.setTool(tool);
  }

  setDisplayMode(displayMode: DisplayMode): void {
    this.state.patch({ displayMode });
    this.#viewport?.setDisplayMode(displayMode);
    this.#scheduleReport();
  }

  setSkeleton(skeleton: boolean): void {
    this.state.patch({ skeleton });
    this.#viewport?.setSkeletonVisible(skeleton);
    this.#scheduleReport();
  }

  /** Shows a parts view, without the parts and levels the scene on screen does not have. */
  setPartView(view: PartView): void {
    const scene = this.state.get().scene;
    const parts = scene ? knownPartView(scene.parts, view) : view;
    this.state.patch({ parts });
    this.#viewport?.setPartView(parts);
    this.#scheduleReport();
  }

  #part(id: string) {
    const scene = this.state.get().scene;
    if (!scene) throw new ArcueError("unavailable", "The model is not loaded yet.");
    const part = scene.parts.find((candidate) => candidate.id === id);
    if (!part) throw new ArcueError("not-found", `The model has no part "${id}".`);
    return part;
  }

  /** Shows or hides a part by its id; an unknown id is refused. An isolation ends, keeping what is on screen. */
  setPartVisible(id: string, visible: boolean): void {
    const part = this.#part(id);
    const parts = this.state.get().scene?.parts ?? [];
    this.setPartView(withPartVisible(isolationAsVisibility(parts, this.state.get().parts), part, visible));
  }

  /** Shows only one part, or every part again for null. */
  isolatePart(id: string | null): void {
    if (id !== null) this.#part(id);
    this.setPartView({ ...this.state.get().parts, isolated: id });
  }

  setLod(level: number): void {
    const scene = this.state.get().scene;
    if (!scene) throw new ArcueError("unavailable", "The model is not loaded yet.");
    const highest = lodLevels(scene.parts).at(-1) ?? 0;
    if (level > highest)
      throw new ArcueError("invalid-input", `The model has no LOD${level}; its highest is LOD${highest}.`);
    this.setPartView({ ...this.state.get().parts, lod: level });
  }

  /** Whether the model has parts or added files to list in an outline. */
  outlineAvailable(): boolean {
    const scene = this.state.get().scene;
    return scene !== null && hasOutline(scene);
  }

  setOutlineOpen(open: boolean): void {
    if (this.state.get().outlineOpen === open) return;
    this.state.patch({ outlineOpen: open });
    this.#scheduleReport();
  }

  /**
   * Attaches an added file to a model bone, by the bone's node index, or detaches it with null, through one
   * "composition.attachFile". A file that sits in several places moves only its nodes in this place.
   */
  async attachFile(file: OutlineFile, bone: number | null): Promise<void> {
    const { scene, summary } = this.state.get();
    const path = bone === null ? null : (scene?.nodes[bone]?.path ?? null);
    if (bone !== null && path === null) return;
    const folder = summary.path.slice(0, summary.path.lastIndexOf("/") + 1);
    const input = { assetId: this.assetId, file: `${folder}${file.file}`, bone: path };
    try {
      await this.#client.execute(
        "composition.attachFile",
        file.nodes === null || file.nodes.length === 0 ? input : { ...input, nodes: [...file.nodes] },
      );
    } catch (error) {
      this.#host.notify({ message: messageOf(error), kind: "alert" });
    }
  }

  setBrushSize(size: number): void {
    const brushSize = Math.max(BRUSH_MIN, Math.min(BRUSH_MAX, Math.round(size)));
    this.state.patch({ brushSize });
    this.#viewport?.setBrushSize(brushSize);
  }

  setClip(clip: string | null, frame = 0): void {
    const info = this.clipInfo(clip);
    const name = info ? info.name : null;
    const target = info ? clampFrame(frame, info) : 0;
    const seconds = info ? frameToSeconds(target, info.fps) : 0;
    this.state.patch({ clip: name, range: null });
    this.time.set({ seconds, playing: false });
    const viewport = this.#viewport;
    if (viewport) {
      viewport.setPlaying(false);
      viewport.setClip(name);
      this.#syncPlaybackRange();
      viewport.setTime(seconds);
    }
    this.#scheduleReport();
  }

  setFrame(frame: number): void {
    const clip = this.clipInfo();
    if (!clip) return;
    const seconds = frameToSeconds(clampFrame(frame, clip), clip.fps);
    this.time.patch({ seconds });
    this.#viewport?.setTime(seconds);
    this.#scheduleReport();
  }

  /** False for the rest pose, and for a clip or playback range of one or two frames. */
  canPlay(): boolean {
    const clip = this.clipInfo();
    return clip !== null && isPlayable(clip, this.#playbackRange());
  }

  /**
   * Starting at the end of the range, or at the clip's end without looping, starts again from the start. Does not start
   * when `canPlay` is false.
   */
  setPlaying(playing: boolean): void {
    const clip = this.clipInfo();
    if (playing && !this.canPlay()) return;
    if (playing && clip) {
      const { loop } = this.state.get();
      const range = this.#playbackRange();
      const frame = this.currentFrame();
      const start = range?.start ?? 0;
      const end = range?.end ?? lastFrame(clip);
      if (frame < start || (frame >= end && (!loop || range))) this.setFrame(start);
    }
    const frame = this.currentFrame();
    this.time.patch({ playing });
    this.#viewport?.setPlaying(playing);
    if (!playing) this.setFrame(frame);
  }

  togglePlaying(): void {
    this.setPlaying(!this.time.get().playing);
  }

  step(delta: number): void {
    const clip = this.clipInfo();
    if (!clip) return;
    if (this.time.get().playing) this.setPlaying(false);
    this.setFrame(stepFrame(this.currentFrame(), delta, lastFrame(clip), this.state.get().loop));
  }

  jumpToKey(direction: 1 | -1): void {
    const clip = this.clipInfo();
    if (!clip) return;
    if (this.time.get().playing) this.setPlaying(false);
    const key = adjacentKey(clip, this.currentFrame(), direction);
    if (key !== null) this.setFrame(key);
  }

  setLoop(loop: boolean): void {
    this.state.patch({ loop });
    this.#viewport?.setLoop(loop);
  }

  setSpeed(speed: number): void {
    const clamped = Math.max(0.25, Math.min(2, speed));
    this.state.patch({ speed: clamped });
    this.#viewport?.setSpeed(clamped);
  }

  setRange(range: FrameRange | null): void {
    const clip = this.clipInfo();
    const next = clip && range ? normalizeRange(clampFrame(range.start, clip), clampFrame(range.end, clip)) : null;
    this.state.patch({ range: next });
    this.#syncPlaybackRange();
    this.#scheduleReport();
  }

  /** Playback loops in the range picked on the timeline, else in the range of the selected comment. */
  #playbackRange(): FrameRange | null {
    const { range, selection } = this.state.get();
    if (range) return range;
    const clip = this.clipInfo();
    const time = selection ? this.comment(selection)?.time : undefined;
    if (!clip || time?.kind !== "range" || time.clip !== clip.name) return null;
    return normalizeRange(clampFrame(time.start, clip), clampFrame(time.end, clip));
  }

  #syncPlaybackRange(): void {
    const clip = this.clipInfo();
    const range = this.#playbackRange();
    this.#viewport?.setPlaybackRange(
      range && clip ? { start: frameToSeconds(range.start, clip.fps), end: frameToSeconds(range.end, clip.fps) } : null,
    );
    if (this.time.get().playing && !this.canPlay()) this.setPlaying(false);
  }

  /** A comment made on the timeline's range takes it over: the range clears, and the comment shows it when selected. */
  #releaseRange(time: TimeSelection): void {
    const { clip, range } = this.state.get();
    if (time.kind !== "range" || !range || time.clip !== clip) return;
    if (time.start === range.start && time.end === range.end) this.setRange(null);
  }

  setCamera(camera: CameraAnchor, animate: boolean): void {
    this.#viewport?.setCamera(camera, { animate });
    this.#scheduleReport();
  }

  /** The F shortcut: frames the target in the comment box, else the selected comment's target, else the model. */
  frameSelection(): void {
    const { box, selection } = this.state.get();
    const target = box?.target ?? (selection ? (this.comment(selection)?.target ?? null) : null);
    this.#viewport?.frame(target, { animate: true });
  }

  /** Frames a comment's target, or the model for null or a comment without a target. */
  frameComment(commentId: string | null): void {
    const viewport = this.#viewport;
    if (!viewport) throw new ArcueError("unavailable", "The 3D view is not ready yet.");
    if (commentId === null) {
      viewport.frame(null, { animate: true });
      return;
    }
    const comment = this.comment(commentId);
    if (!comment) throw new ArcueError("not-found", `No comment ${commentId}.`);
    viewport.frame(comment.target, { animate: true });
  }

  /** Escape: closes the box or clears the selection, then ends an isolation, then clears the range. */
  escape(): void {
    const { box, selection, range, parts } = this.state.get();
    if (box || selection) this.deselect();
    else if (parts.isolated !== null) this.isolatePart(null);
    else if (range) this.setRange(null);
  }

  comment(id: string): Comment | null {
    return this.state.get().review?.comments.find((comment) => comment.id === id) ?? null;
  }

  queue(): Comment[] {
    const review = this.state.get().review;
    return review ? queuedComments(review) : [];
  }

  selectComment(id: string | null): SelectResult {
    if (id === null) {
      this.deselect();
      return "selected";
    }
    const comment = this.comment(id);
    if (!comment) return "not-found";
    const { box } = this.state.get();
    const sameBox = box?.mode === "edit" && box.commentId === id;
    if (!sameBox && this.#refuseToClose()) return "refused";
    this.#jumpTo(comment.time, false);
    this.#viewport?.setCamera(comment.camera, { animate: true });
    this.#restoreParts(comment);
    const nextBox = sameBox ? box : comment.status === "draft" ? this.#editBox(comment) : null;
    this.state.patch({ selection: id, box: nextBox });
    this.#syncSelection();
    return "selected";
  }

  /**
   * Shows the parts a comment was made with, where a comment that stores none was made in the default view, and the
   * part that holds its target.
   */
  #restoreParts(comment: Comment): void {
    const parts = commentPartView(this.state.get().scene, comment);
    if (!samePartView(parts, this.state.get().parts)) this.setPartView(parts);
  }

  deselect(): void {
    this.state.patch({ selection: null, box: null });
    this.#syncSelection();
  }

  /** Shows the time's clip at its frame, or at the start of its range; `selectRange` also picks the range. */
  #jumpTo(time: TimeAnchor, selectRange: boolean): void {
    if (this.time.get().playing) this.setPlaying(false);
    if (time.kind === "none") {
      if (this.state.get().clip !== null) this.setClip(null);
      return;
    }
    if (!this.clipInfo(time.clip)) return;
    if (time.kind === "frame") {
      this.setClip(time.clip, time.frame);
    } else {
      this.setClip(time.clip, time.start);
      if (selectRange) this.setRange({ start: time.start, end: time.end });
    }
  }

  hasUnsavedBox(): boolean {
    const box = this.state.get().box;
    if (!box) return false;
    const text = box.text.trim();
    if (box.mode !== "edit" || box.commentId === null) return text !== "";
    const comment = this.comment(box.commentId);
    return comment !== null && (text !== currentMessage(comment) || box.timeEdited || box.targetEdited);
  }

  /** True when the box holds unsaved text; the box shakes and keeps focus instead of closing. */
  #refuseToClose(): boolean {
    if (!this.hasUnsavedBox()) return false;
    this.nudgeBox();
    return true;
  }

  nudgeBox(): void {
    const box = this.state.get().box;
    if (box) this.state.patch({ box: { ...box, nudge: box.nudge + 1 } });
  }

  #targetBone(target: SpatialAnchor | null, time: TimeSelection): string | null {
    if (target?.kind !== "surface" || !this.#viewport) return null;
    try {
      return this.#viewport.computeContext(target, time).bones[0]?.name ?? null;
    } catch {
      return null;
    }
  }

  #newBox(fields: Partial<CommentBox> & Pick<CommentBox, "time" | "target">): CommentBox {
    return {
      id: nextBoxId++,
      mode: "new",
      commentId: null,
      restPose: this.state.get().clip === null,
      targetBone: this.#targetBone(fields.target, fields.time),
      followUpRound: null,
      text: "",
      nudge: 0,
      busy: false,
      anchorVersion: this.state.get().version,
      timeEdited: false,
      targetEdited: false,
      needsRepick: false,
      ...fields,
    };
  }

  #editBox(comment: Comment): CommentBox {
    return {
      id: nextBoxId++,
      mode: "edit",
      commentId: comment.id,
      time: selectionOf(comment.time),
      restPose: comment.time.kind === "none",
      target: comment.target,
      targetBone: comment.context.bones[0]?.name ?? null,
      followUpRound: pendingFollowUp(comment)?.afterRound ?? null,
      text: currentMessage(comment),
      nudge: 0,
      busy: false,
      anchorVersion: comment.anchorVersion,
      timeEdited: false,
      targetEdited: false,
      needsRepick: false,
    };
  }

  #replaceTarget(box: CommentBox, target: SpatialAnchor | null): void {
    this.state.patch({
      box: {
        ...box,
        target,
        targetBone: this.#targetBone(target, box.time),
        anchorVersion: this.state.get().version,
        targetEdited: true,
        needsRepick: false,
      },
    });
    this.#syncSelection();
  }

  #openNew(target: SpatialAnchor): void {
    const box = this.state.get().box;
    if (box?.needsRepick) {
      this.#replaceTarget(box, target);
      return;
    }
    if (this.#refuseToClose()) return;
    this.state.patch({ selection: null, box: this.#newBox({ time: this.currentTime(), target }) });
    this.#syncSelection();
  }

  #onRegionPainted(overlayId: string | null, anchor: SpatialAnchor | null): void {
    const box = this.state.get().box;
    if (overlayId === null) {
      if (anchor) this.#openNew(anchor);
      return;
    }
    const boxOverlay = box?.mode === "edit" ? box.commentId : NEW_COMMENT_OVERLAY;
    if (!box || box.mode === "reopen" || overlayId !== boxOverlay) return;
    this.#replaceTarget(box, anchor);
  }

  #onEmptyClick(): void {
    if (this.#refuseToClose()) return;
    this.deselect();
  }

  setBoxText(text: string): void {
    const box = this.state.get().box;
    if (box) this.state.patch({ box: { ...box, text } });
  }

  removeBoxChip(chip: "time" | "target" | "followUp"): void {
    const box = this.state.get().box;
    if (!box) return;
    if (chip === "time" && box.mode !== "reopen") {
      this.state.patch({ box: { ...box, time: { kind: "none" }, timeEdited: true } });
    }
    if (chip === "target" && box.mode !== "reopen") this.#replaceTarget(box, null);
    if (chip === "followUp" && box.mode === "reopen") {
      this.state.patch({ box: { ...box, mode: "new", commentId: null, followUpRound: null } });
    }
    this.#syncSelection();
  }

  /** Closes the box, or discards the comment being written. */
  closeBox(): void {
    this.deselect();
  }

  reopen(commentId: string): void {
    const comment = this.comment(commentId);
    if (!comment || comment.status === "draft") return;
    if (this.#refuseToClose()) return;
    this.#jumpTo(comment.time, true);
    this.#viewport?.setCamera(comment.camera, { animate: true });
    this.#restoreParts(comment);
    const box = this.#newBox({
      mode: "reopen",
      commentId,
      time: selectionOf(comment.time),
      restPose: comment.time.kind === "none",
      target: comment.target,
      targetBone: comment.context.bones[0]?.name ?? null,
      followUpRound: lastRound(comment),
      anchorVersion: comment.anchorVersion,
    });
    this.state.patch({ selection: null, box });
    this.#syncSelection();
  }

  async submitBox(): Promise<boolean> {
    const box = this.state.get().box;
    if (!box || box.busy) return false;
    const text = box.text.trim();
    if (!text || box.needsRepick) {
      this.nudgeBox();
      return false;
    }
    this.state.patch({ box: { ...box, busy: true } });
    try {
      if (box.mode === "reopen" && box.commentId) {
        await this.#client.execute("comment.reopen", { assetId: this.assetId, commentId: box.commentId, text });
      } else if (box.mode === "edit" && box.commentId) {
        await this.#saveEdit(box, text);
      } else {
        const commentId = await this.#create(text, box.time, box.target, box.anchorVersion);
        this.#flashAdded(commentId);
      }
      if (this.state.get().box?.busy) this.state.patch({ box: null, selection: null });
      this.#releaseRange(box.time);
      this.#syncSelection();
      return true;
    } catch (error) {
      const current = this.state.get().box;
      const reloaded =
        error instanceof ArcueError && error.code === "conflict" && box.mode !== "reopen" && box.target !== null;
      if (current) this.state.patch({ box: { ...current, busy: false, needsRepick: reloaded } });
      this.#host.notify({
        message: reloaded ? "The model changed since you picked this spot. Click or paint it again." : messageOf(error),
        kind: "alert",
      });
      return false;
    }
  }

  async #create(
    text: string,
    time: TimeSelection,
    target: SpatialAnchor | null,
    anchorVersion: string | null,
  ): Promise<string> {
    const capture = await this.#capture(time, target);
    const { commentId } = await this.#client.execute("comment.create", {
      assetId: this.assetId,
      text,
      time,
      target,
      ...capture,
      parts: this.state.get().parts,
      version: this.#versionFor(target, anchorVersion),
    });
    return commentId;
  }

  /** The version a time or target was picked on: the target's when there is one, otherwise the version on screen. */
  #versionFor(target: SpatialAnchor | null, anchorVersion: string | null): string {
    const version = (target ? anchorVersion : null) ?? this.state.get().version;
    if (!version) throw new ArcueError("unavailable", "The model is not loaded yet.");
    return version;
  }

  async #saveEdit(box: CommentBox, text: string): Promise<void> {
    const comment = box.commentId ? this.comment(box.commentId) : null;
    if (!comment) return;
    const textChanged = text !== currentMessage(comment);
    const timeChanged = box.timeEdited && !sameTime(box.time, comment.time);
    const targetChanged = box.targetEdited;
    if (!textChanged && !timeChanged && !targetChanged) return;
    const input: CommandInput<"comment.update"> = {
      assetId: this.assetId,
      commentId: comment.id,
      ...(textChanged ? { text } : {}),
      ...(timeChanged ? { time: box.time } : {}),
      ...(targetChanged ? { target: box.target } : {}),
      ...(timeChanged || targetChanged
        ? {
            ...(await this.#capture(box.time, box.target)),
            parts: this.state.get().parts,
            version: this.#versionFor(targetChanged ? box.target : null, box.anchorVersion),
          }
        : {}),
    };
    await this.#client.execute("comment.update", input);
  }

  async #capture(time: TimeSelection, target: SpatialAnchor | null) {
    const viewport = this.#viewport;
    if (!viewport) throw new ArcueError("unavailable", "The 3D view is not ready yet.");
    const camera = viewport.getCamera();
    const context = viewport.computeContext(target, time);
    const screenshot = target
      ? await viewport.screenshot({
          ...this.#screenshotSize(),
          camera,
          time,
          overlays: [{ id: NEW_COMMENT_OVERLAY, number: null, state: "draft", anchor: target, selected: false }],
        })
      : null;
    return { camera, context, screenshot };
  }

  #screenshotSize(): { width: number; height: number } {
    const width = this.#container?.clientWidth ?? 0;
    const height = this.#container?.clientHeight ?? 0;
    const aspect = width > 0 && height > 0 ? height / width : 9 / 16;
    return { width: SCREENSHOT_WIDTH, height: Math.max(16, Math.min(4096, Math.round(SCREENSHOT_WIDTH * aspect))) };
  }

  #flashAdded(commentId: string): void {
    this.#cancelAdded?.();
    this.state.patch({ added: commentId });
    this.#cancelAdded = this.#host.setTimer(ADDED_FLASH_MS, () => this.state.patch({ added: null }));
  }

  /** Adds a comment without a surface target, from the panel's field. */
  async addTextComment(text: string): Promise<boolean> {
    const trimmed = text.trim();
    if (!trimmed) return false;
    try {
      const time = this.currentTime();
      const commentId = await this.#create(trimmed, time, null, null);
      this.#flashAdded(commentId);
      this.#releaseRange(time);
      return true;
    } catch (error) {
      this.#host.notify({ message: messageOf(error), kind: "alert" });
      return false;
    }
  }

  async deleteDraft(commentId: string): Promise<void> {
    try {
      await this.#client.execute("comment.delete", { assetId: this.assetId, commentId });
      const { box, selection } = this.state.get();
      this.state.patch({
        box: box?.mode === "edit" && box.commentId === commentId ? null : box,
        selection: selection === commentId ? null : selection,
      });
      this.#syncSelection();
    } catch (error) {
      this.#host.notify({ message: messageOf(error), kind: "alert" });
    }
  }

  async resolve(commentId: string): Promise<void> {
    try {
      await this.#client.execute("comment.resolve", { assetId: this.assetId, commentId });
    } catch (error) {
      this.#host.notify({ message: messageOf(error), kind: "alert" });
    }
  }

  async copyPrompt(): Promise<void> {
    if (this.#copying) return;
    this.#copying = true;
    try {
      await this.#copyPrompt();
    } finally {
      this.#copying = false;
    }
  }

  async #copyPrompt(): Promise<void> {
    const box = this.state.get().box;
    if (box?.mode === "edit" && this.hasUnsavedBox()) {
      if (!(await this.submitBox())) return;
    }
    const count = this.state.get().review?.queue.length ?? 0;
    if (count === 0) {
      this.#host.notify({ message: "Nothing to copy yet. Add a comment first.", kind: "info" });
      return;
    }
    try {
      const { round, prompt, copiedToClipboard } = await this.#client.execute("round.copy", { assetId: this.assetId });
      const copied = copiedToClipboard || (await this.#host.writeClipboard(prompt));
      const current = this.state.get().box;
      const keepBox = current !== null && current.mode !== "edit" && current.text.trim() !== "";
      this.state.patch({ selection: null, box: keepBox ? current : null });
      this.#syncSelection();
      if (copied) {
        this.#host.notify({ message: `Copied ${plural(count, "comment")} as round ${round}`, kind: "copied" });
      } else {
        this.#host.notify({ message: `Saved round ${round}. Copy the selected text.`, kind: "info" });
        this.#host.showCopySheet({ round, prompt });
      }
    } catch (error) {
      this.#host.notify({ message: messageOf(error), kind: "alert" });
    }
  }

  /** Reads the warnings of the version on screen again. An answer older than the latest request is dropped. */
  async refreshWarnings(): Promise<void> {
    const sequence = ++this.#warningSequence;
    try {
      const { warnings } = await this.#client.query("warning.list", { assetId: this.assetId });
      if (!this.#disposed && sequence === this.#warningSequence) this.state.patch({ warnings });
    } catch {
      if (!this.#disposed && sequence === this.#warningSequence && this.state.get().summary.version === null) {
        this.state.patch({ warnings: [] });
      }
    }
  }

  /** Tints a warning's subject in the 3D view, or clears the tint for null. */
  highlightSubject(subject: WarningSubject | null): void {
    this.state.patch({ highlight: subject });
    this.#viewport?.setHighlight(this.#highlightedMeshes());
  }

  #highlightedMeshes(): string[] | null {
    const { highlight, scene } = this.state.get();
    return highlight && scene ? subjectMeshes(scene, highlight) : null;
  }

  /** Pointing at a warning tints its subject; a clip's warning shows that clip instead. Null clears the tint. */
  pointAtWarning(warning: AssetWarning | null): void {
    if (warning?.fix?.kind === "show-clip") {
      if (this.state.get().clip !== warning.fix.clip) this.setClip(warning.fix.clip);
      this.highlightSubject(null);
      return;
    }
    this.highlightSubject(warning ? subjectOf(warning) : null);
  }

  /**
   * Runs the warning's quick fix: shows its clip, loads the files again, or uses the texture as the base color.
   * Choosing a texture or a model needs the host's open dialog, so `WorkspaceStore` runs those.
   */
  async fixWarning(warning: AssetWarning): Promise<void> {
    const fix = warning.fix;
    if (fix?.kind === "show-clip") {
      this.setClip(fix.clip);
    } else if (fix?.kind === "retry") {
      await this.reload();
    } else if (fix?.kind === "use-as-base-color") {
      const input = { assetId: this.assetId, material: fix.material, slot: "baseColor" as const, file: fix.file };
      await this.#run(() => this.#client.execute("material.setTexture", input));
    }
  }

  /** Reads the asset's files again, as the Retry fix asks. */
  async reload(): Promise<void> {
    await this.#run(() => this.#client.execute("asset.reload", { assetId: this.assetId }));
  }

  async dismissWarning(warningId: string): Promise<void> {
    this.highlightSubject(null);
    await this.#run(() => this.#client.execute("warning.dismiss", { assetId: this.assetId, warningId }));
  }

  async dismissAllWarnings(): Promise<void> {
    this.highlightSubject(null);
    await this.#run(() => this.#client.execute("warning.dismissAll", { assetId: this.assetId }));
  }

  /** Takes back the asset's last comment, warning or composition edit. */
  async undo(): Promise<void> {
    await this.#run(() => this.#client.execute("review.undo", { assetId: this.assetId }));
  }

  /** Applies again the edit undo took back last. */
  async redo(): Promise<void> {
    await this.#run(() => this.#client.execute("review.redo", { assetId: this.assetId }));
  }

  /** Adds a draft about the warning, which the queue flashes. */
  async commentOnWarning(warningId: string): Promise<void> {
    await this.#run(async () => {
      const { commentId } = await this.#client.execute("comment.createFromWarning", {
        assetId: this.assetId,
        warningId,
      });
      this.#flashAdded(commentId);
    });
  }

  /** Copies the prompt for the listed warnings, with the copy sheet when the clipboard is blocked. */
  async copyWarnings(): Promise<void> {
    await this.#run(async () => {
      const count = listedWarnings(this.state.get()).length;
      const { prompt } = await this.#client.query("warning.prompt", { assetId: this.assetId });
      if (await this.#host.writeClipboard(prompt)) {
        this.#host.notify({ message: `Copied ${plural(count, "warning")}`, kind: "copied" });
      } else {
        this.#host.notify({ message: "Copy the selected text.", kind: "info" });
        this.#host.showCopySheet({ round: null, prompt });
      }
    });
  }

  async #run(action: () => Promise<unknown>): Promise<void> {
    try {
      await action();
    } catch (error) {
      this.#host.notify({ message: messageOf(error), kind: "alert" });
    }
  }

  /** What the view draws: drafts with their numbers, the selected sent or resolved comment, and the box's target. */
  overlays(): CommentOverlay[] {
    const { review, selection, box } = this.state.get();
    const overlays: CommentOverlay[] = [];
    if (!review) return overlays;
    const editing = box?.mode === "edit" ? box.commentId : null;
    review.queue.forEach((id, index) => {
      const comment = review.comments.find((candidate) => candidate.id === id);
      const anchor = id === editing ? (box?.target ?? null) : (comment?.target ?? null);
      if (!anchor) return;
      overlays.push({ id, number: index + 1, state: "draft", anchor, selected: id === selection });
    });
    const selected = selection ? this.comment(selection) : null;
    if (selected && selected.status !== "draft" && selected.target) {
      overlays.push({ id: selected.id, number: null, state: selected.status, anchor: selected.target, selected: true });
    }
    if (box && box.mode !== "edit" && box.target) {
      overlays.push({
        id: NEW_COMMENT_OVERLAY,
        number: review.queue.length + 1,
        state: "draft",
        anchor: box.target,
        selected: true,
        pending: true,
      });
    }
    return overlays;
  }

  /** Shows the selection in the view: the comments' overlays, and the range playback loops in. */
  #syncSelection(force = false): void {
    this.#syncPlaybackRange();
    const viewport = this.#viewport;
    if (!viewport || !this.state.get().viewportReady) return;
    const { review, selection, box } = this.state.get();
    const key = [review, selection, box?.mode, box?.commentId, box?.target];
    if (!force && key.length === this.#overlayKey.length && key.every((part, i) => part === this.#overlayKey[i])) {
      return;
    }
    this.#overlayKey = key;
    viewport.setOverlays(this.overlays());
  }

  /** Fetches a comment's screenshot once per edit and keeps it as an object URL. A failed fetch is tried again. */
  async loadThumbnail(comment: Comment): Promise<void> {
    const key = `${comment.id}:${comment.updatedAt}:${comment.context.screenshot ?? ""}`;
    if (this.#thumbnailKeys.get(comment.id) === key) return;
    this.#thumbnailKeys.set(comment.id, key);
    let url: string | null = null;
    try {
      const bytes = await this.#client.query("comment.screenshot", { assetId: this.assetId, commentId: comment.id });
      this.#thumbnailAttempts.delete(comment.id);
      if (bytes && typeof URL.createObjectURL === "function") {
        url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "image/png" }));
      }
    } catch {
      if (this.#thumbnailKeys.get(comment.id) === key) this.#retryThumbnail(comment.id);
      return;
    }
    if (this.#disposed || this.#thumbnailKeys.get(comment.id) !== key) {
      if (url) URL.revokeObjectURL(url);
      return;
    }
    const previous = this.thumbnails.get().urls[comment.id];
    if (previous) URL.revokeObjectURL(previous);
    this.thumbnails.set({ urls: { ...this.thumbnails.get().urls, [comment.id]: url } });
  }

  #retryThumbnail(commentId: string): void {
    this.#thumbnailKeys.delete(commentId);
    const attempts = (this.#thumbnailAttempts.get(commentId) ?? 0) + 1;
    this.#thumbnailAttempts.set(commentId, attempts);
    if (attempts >= THUMBNAIL_ATTEMPTS) return;
    this.#host.setTimer(THUMBNAIL_RETRY_MS * attempts, () => {
      const comment = this.comment(commentId);
      if (!this.#disposed && comment && this.state.get().review?.queue.includes(commentId)) {
        void this.loadThumbnail(comment);
      }
    });
  }

  #dropThumbnails(review: ReviewFile): void {
    const queued = new Set(review.queue);
    const urls = this.thumbnails.get().urls;
    const leaving = Object.keys(urls).filter((id) => !queued.has(id));
    for (const id of [...this.#thumbnailKeys.keys()]) {
      if (!queued.has(id)) {
        this.#thumbnailKeys.delete(id);
        this.#thumbnailAttempts.delete(id);
      }
    }
    if (leaving.length === 0) return;
    const kept: Record<string, string | null> = {};
    for (const [id, url] of Object.entries(urls)) {
      if (queued.has(id)) kept[id] = url;
      else if (url) URL.revokeObjectURL(url);
    }
    this.thumbnails.set({ urls: kept });
  }

  #scheduleReport(): void {
    if (!this.#initialViewApplied) return;
    this.#cancelReport?.();
    this.#cancelReport = this.#host.setTimer(REPORT_DELAY_MS, () => {
      this.#cancelReport = null;
      void this.reportState();
    });
  }

  viewState(): ViewState | null {
    const viewport = this.#viewport;
    if (!viewport || !this.#initialViewApplied) return null;
    const { clip, range, displayMode, skeleton, parts, outlineOpen } = this.state.get();
    return {
      camera: viewport.getCamera(),
      clip,
      frame: this.currentFrame(),
      range,
      display: { mode: displayMode, skeleton },
      parts,
      outlineOpen,
      ...(this.#offerDismissed ? { relinkOfferDismissed: true } : {}),
    };
  }

  async reportState(): Promise<void> {
    const state = this.viewState();
    if (!state) return;
    await this.#client.execute("view.reportState", { assetId: this.assetId, state }).catch(() => undefined);
  }

  dispose(): void {
    this.#disposed = true;
    this.#cancelReport?.();
    this.#cancelAdded?.();
    this.#unbindViewport?.();
    this.#viewport = null;
    for (const url of Object.values(this.thumbnails.get().urls)) if (url) URL.revokeObjectURL(url);
  }
}

/** The warnings the status bar lists: those not dismissed, errors first. */
export function listedWarnings(state: Pick<SessionState, "warnings">): AssetWarning[] {
  return state.warnings.filter((warning) => !warning.dismissed);
}

export function subjectOf(warning: AssetWarning): WarningSubject {
  const subject: WarningSubject = { kind: warning.subject.kind, name: warning.subject.name };
  if (warning.file !== undefined) subject.file = warning.file;
  return subject;
}

export function selectionOf(time: TimeAnchor): TimeSelection {
  if (time.kind === "none") return { kind: "none" };
  if (time.kind === "frame") return { kind: "frame", clip: time.clip, frame: time.frame };
  return { kind: "range", clip: time.clip, start: time.start, end: time.end };
}

export function sameTime(a: TimeSelection, b: TimeAnchor | TimeSelection): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "frame" && b.kind === "frame") return a.clip === b.clip && a.frame === b.frame;
  if (a.kind === "range" && b.kind === "range") return a.clip === b.clip && a.start === b.start && a.end === b.end;
  return a.kind === "none";
}

function samePartView(a: PartView, b: PartView): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
