import type { ComputedContext, DisplayMode, TimeSelection } from "@arcue/protocol";
import { ArcueError } from "@arcue/protocol";
import type { CameraAnchor, Clip, PartView, SceneDescription, SpatialAnchor, SurfaceAnchor, Vec3 } from "@arcue/scene";
import { defaultPartView, visibleMeshes } from "@arcue/scene";
import { Vector3 } from "three";
import { Emitter } from "./events";
import type { StrokeMode } from "./interaction/paint";
import { PaintStroke } from "./interaction/paint";
import { rayTriangleWeights, roundWeights } from "./math/barycentric";
import { clusterPoints } from "./math/clusters";
import { AnchorError, anchorContext, anchorVertices } from "./math/context";
import {
  advancePlayback,
  clampRange,
  clampSpeed,
  frameStart,
  type PlaybackSettings,
  playbackStart,
  resolveTimeSelection,
  shownTime,
} from "./math/playback";
import { clampToClip, poseAt, worldMatrices } from "./math/pose";
import { jointMatrices, meshSkinMatrices, posedVertex } from "./math/skinning";
import { viewLabel } from "./math/view-label";
import { BrushCursor } from "./overlay/brush";
import { PinLayer } from "./overlay/pins";
import { installStyles } from "./overlay/styles";
import type { ResolvedAnchor } from "./render/anchor-points";
import { anchorPoint, facesCamera, regionRadius, resolveAnchor, triangleCorners } from "./render/anchor-points";
import { CameraRig } from "./render/camera-rig";
import type { IdSample } from "./render/id-pass";
import { IdPass } from "./render/id-pass";
import type { MeshRuntime } from "./render/model";
import { Model } from "./render/model";
import type { Palette } from "./render/palette";
import { colorBytes, readPalette } from "./render/palette";
import { Projector } from "./render/projector";
import { SkeletonOverlay } from "./render/skeleton-overlay";
import { createRenderer, extentOf, Stage } from "./render/stage";
import { renderScreenshot } from "./screenshot";
import type {
  CommentOverlay,
  PlaybackRange,
  ScreenPosition,
  ScreenshotOptions,
  ToolId,
  Viewport,
  ViewportEventName,
  ViewportEvents,
  ViewportOptions,
} from "./viewport";

const CLICK_SLOP = 4;
/** While playing, pins are checked for hidden surface at most this often. */
const PLAYING_VISIBILITY_MS = 100;

type Rgba = [number, number, number, number];

interface TintStyles {
  draft: Rgba;
  draftHovered: Rgba;
  draftSelected: Rgba;
  sent: Rgba;
  sentHovered: Rgba;
  sentSelected: Rgba;
  resolved: Rgba;
  resolvedHovered: Rgba;
  resolvedSelected: Rgba;
  stroke: Rgba;
  highlight: Rgba;
}

interface OverlayEntry {
  overlay: CommentOverlay;
  key: string;
  resolved: ResolvedAnchor | null;
}

interface PinCandidate {
  entry: OverlayEntry;
  x: number;
  y: number;
  depth: number;
  facing: boolean;
}

interface Gesture {
  pointerId: number;
  startX: number;
  startY: number;
  moved: boolean;
  comment: boolean;
  mode: StrokeMode;
}

interface Pick {
  sample: IdSample;
  runtime: MeshRuntime;
  anchor: SurfaceAnchor;
}

export class ThreeViewport implements Viewport {
  private readonly container: HTMLElement;
  private readonly root: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly overlayLayer: HTMLDivElement;
  private readonly maxPixelRatio: number;
  private readonly emitter = new Emitter<ViewportEvents>();
  private readonly renderer;
  private readonly palette: Palette;
  private readonly tintStyles: TintStyles;
  private readonly stage: Stage;
  private readonly rig: CameraRig;
  private readonly idPass: IdPass;
  private readonly pins: PinLayer;
  private readonly brush: BrushCursor;
  private readonly resizeObserver: ResizeObserver;
  private readonly detach: (() => void)[] = [];

  private model: Model | null = null;
  private skeleton: SkeletonOverlay | null = null;
  private sceneToken = 0;
  private loadToken = 0;
  private disposed = false;
  private active = true;

  private clip: Clip | null = null;
  private time = 0;
  private playing = false;
  private speed = 1;
  private loop = true;
  private range: PlaybackRange | null = null;
  private poseDirty = true;

  private displayMode: DisplayMode = "lit";
  private skeletonVisible = false;
  private partView: PartView = defaultPartView();
  private tool: ToolId = "view";

  private overlays: OverlayEntry[] = [];
  private readonly surfaceVisibility = new Map<string, boolean>();
  private hoveredOverlay: string | null = null;
  private highlighted: ReadonlySet<string> = new Set();
  private tintDirty = true;
  private pinCandidates: PinCandidate[] = [];

  private width = 1;
  private height = 1;
  private frameRequest = 0;
  private lastTick = 0;
  private lastCameraRevision = -1;
  private viewStamp = 0;
  private seenCameraRevision = -1;
  private visibilityVersion = -1;
  private lastVisibilityAt = 0;
  private contextLost = false;
  private stopPixelRatioWatch: () => void = () => {};
  private visibilityInFlight = false;

  private gesture: Gesture | null = null;
  private stroke: PaintStroke | null = null;
  private strokeFinished = false;
  private pointer: { x: number; y: number; inside: boolean } = { x: 0, y: 0, inside: false };
  private hoverScheduled = false;
  private hoverInFlight = false;
  private hoverAgain = false;
  private hoverAnchorKey = "null";
  private overModel = false;

  constructor(options: ViewportOptions) {
    this.container = options.container;
    this.maxPixelRatio = options.maxPixelRatio ?? 2;
    const document = this.container.ownerDocument;
    installStyles(document);
    if (getComputedStyle(this.container).position === "static") this.container.style.position = "relative";

    this.root = document.createElement("div");
    this.root.className = "arcue-vp";
    this.canvas = document.createElement("canvas");
    this.canvas.className = "arcue-vp-canvas";
    this.canvas.setAttribute("role", "img");
    this.canvas.setAttribute("aria-label", "3D view of the model");
    this.overlayLayer = document.createElement("div");
    this.overlayLayer.className = "arcue-vp-overlay";
    this.root.append(this.canvas, this.overlayLayer);
    this.container.append(this.root);

    this.palette = readPalette(this.container);
    this.tintStyles = tintStyles(this.palette);
    this.renderer = createRenderer(this.canvas);
    this.stage = new Stage(this.renderer, this.palette);
    this.rig = new CameraRig(this.canvas, () => this.requestRender());
    this.idPass = new IdPass(this.renderer);
    this.pins = new PinLayer(
      this.overlayLayer,
      (id) => this.emitter.emit("overlayClicked", { id }),
      (id) => this.setHoveredOverlay(id),
    );
    this.brush = new BrushCursor(this.overlayLayer);

    this.listen(this.root, "pointerdown", (event) => this.onPointerDown(event), true);
    this.listen(this.canvas, "pointermove", (event) => this.onPointerMove(event));
    this.listen(this.canvas, "pointerup", (event) => this.onPointerUp(event));
    this.listen(this.canvas, "pointercancel", () => this.cancelGesture());
    this.listen(this.canvas, "pointerleave", () => this.onPointerLeave());

    const onContextLost = (event: Event) => this.onContextLost(event);
    const onContextRestored = () => this.onContextRestored();
    this.canvas.addEventListener("webglcontextlost", onContextLost);
    this.canvas.addEventListener("webglcontextrestored", onContextRestored);
    this.detach.push(() => {
      this.canvas.removeEventListener("webglcontextlost", onContextLost);
      this.canvas.removeEventListener("webglcontextrestored", onContextRestored);
    });

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);
    this.watchPixelRatio();
    this.resize();
  }

  private listen<K extends keyof HTMLElementEventMap>(
    target: HTMLElement,
    type: K,
    listener: (event: HTMLElementEventMap[K]) => void,
    capture = false,
  ): void {
    target.addEventListener(type, listener, capture);
    this.detach.push(() => target.removeEventListener(type, listener, capture));
  }

  async setScene(scene: SceneDescription | null): Promise<void> {
    const token = ++this.loadToken;
    if (!scene) {
      this.replaceModel(null);
      this.renderNow();
      return;
    }
    const model = await Model.build(scene, this.palette, this.renderer.capabilities.getMaxAnisotropy());
    if (token !== this.loadToken || this.disposed) {
      model.dispose();
      return;
    }
    const first = this.model === null;
    const kept = this.clip ? (scene.clips.find((clip) => clip.name === this.clip?.name) ?? null) : null;
    this.clip = kept;
    this.time = kept ? clampToClip(this.time, kept) : 0;
    this.range = kept ? clampRange(this.range, kept.duration) : null;
    if (!kept) this.playing = false;
    this.replaceModel(model);
    const extent = extentOf(scene.bounds);
    this.stage.fit(extent);
    this.rig.setModelSize(extent.size);
    if (first) {
      const radius = Math.hypot(...scene.bounds.max.map((max, axis) => max - (scene.bounds.min[axis] ?? 0))) / 2;
      this.rig.frameInitial([extent.center.x, extent.center.y, extent.center.z], radius);
    }
    this.renderNow();
    this.emitTime();
  }

  private replaceModel(model: Model | null): void {
    this.cancelGesture();
    this.model?.dispose();
    this.skeleton?.dispose();
    this.model = model;
    this.skeleton = null;
    this.sceneToken++;
    this.viewStamp++;
    this.poseDirty = true;
    this.idPass.invalidate();
    this.surfaceVisibility.clear();
    this.visibilityVersion = -1;
    if (model) {
      this.stage.scene.add(model.root);
      model.setDisplayMode(this.displayMode);
      model.setVisibleMeshes(visibleMeshes(model.scene.parts, this.partView));
      this.skeleton = new SkeletonOverlay(model.scene, this.palette.text);
      this.skeleton.object.visible = this.skeletonVisible;
      this.stage.scene.add(this.skeleton.object);
    } else {
      this.clip = null;
      this.time = 0;
      this.playing = false;
      this.range = null;
    }
    this.overlays = this.overlays.map((entry) => this.resolveEntry(entry.overlay));
    this.pins.sync(this.overlays.map((entry) => entry.overlay));
    this.tintDirty = true;
  }

  setClip(name: string | null): void {
    const clip = name === null ? null : (this.model?.scene.clips.find((candidate) => candidate.name === name) ?? null);
    if (clip === this.clip) return;
    this.clip = clip;
    this.time = 0;
    this.range = null;
    if (!clip) this.playing = false;
    this.poseDirty = true;
    this.lastTick = 0;
    this.requestRender();
    this.emitTime();
  }

  setTime(seconds: number): void {
    const time = this.clip ? clampToClip(seconds, this.clip) : 0;
    if (time === this.time && !this.playing) {
      this.emitTime();
      return;
    }
    this.time = time;
    this.poseDirty = true;
    this.requestRender();
    this.emitTime();
  }

  setPlaying(playing: boolean): void {
    const next = playing && this.clip !== null && this.clip.duration > 0;
    if (next && !this.playing && this.clip) {
      this.time = playbackStart(this.time, this.clip.duration, this.playbackSettings());
      this.poseDirty = true;
    }
    if (!next && this.playing && this.clip) {
      this.time = frameStart(this.shownTime(), this.clip);
      this.poseDirty = true;
    }
    this.playing = next;
    this.lastTick = 0;
    this.requestRender();
    this.emitTime();
  }

  setSpeed(speed: number): void {
    this.speed = clampSpeed(speed);
  }

  setActive(active: boolean): void {
    if (active === this.active) return;
    this.active = active;
    this.lastTick = 0;
    if (!active) {
      cancelAnimationFrame(this.frameRequest);
      this.frameRequest = 0;
      this.cancelGesture();
      return;
    }
    this.resize();
    this.requestRender();
  }

  setLoop(loop: boolean): void {
    this.loop = loop;
  }

  setPlaybackRange(range: PlaybackRange | null): void {
    this.range = range ? { start: range.start, end: range.end } : null;
    if (this.playing) this.requestRender();
  }

  private playbackSettings(): PlaybackSettings {
    return { speed: this.speed, loop: this.loop, range: this.range };
  }

  private emitTime(): void {
    this.emitter.emit("time", { seconds: this.shownTime(), playing: this.playing });
  }

  /** The time of the pose on screen; the playback clock can run a frame past the end while that frame shows. */
  private shownTime(): number {
    return this.clip ? shownTime(this.time, this.clip, this.range) : 0;
  }

  setDisplayMode(mode: DisplayMode): void {
    if (mode === this.displayMode) return;
    this.displayMode = mode;
    this.model?.setDisplayMode(mode);
    this.viewStamp++;
    this.idPass.invalidate();
    this.surfaceVisibility.clear();
    this.visibilityVersion = -1;
    this.requestRender();
    this.scheduleHover();
  }

  setSkeletonVisible(visible: boolean): void {
    this.skeletonVisible = visible;
    if (this.skeleton) this.skeleton.object.visible = visible;
    this.requestRender();
  }

  setPartView(view: PartView): void {
    this.partView = { ...view, hidden: [...view.hidden], shown: [...view.shown] };
    const model = this.model;
    if (!model) return;
    this.cancelGesture();
    model.setVisibleMeshes(visibleMeshes(model.scene.parts, this.partView));
    this.viewStamp++;
    this.idPass.invalidate();
    this.surfaceVisibility.clear();
    this.visibilityVersion = -1;
    this.overlays = this.overlays.map((entry) => this.resolveEntry(entry.overlay));
    this.pins.sync(this.overlays.map((entry) => entry.overlay));
    this.tintDirty = true;
    this.requestRender();
    this.scheduleHover();
  }

  setTool(tool: ToolId): void {
    if (tool === this.tool) return;
    this.tool = tool;
    this.cancelGesture();
    this.updateBrush();
    this.updateCursor();
  }

  setBrushSize(radius: number): void {
    this.brush.setRadius(radius);
    this.brush.moveTo(this.pointer.x, this.pointer.y);
  }

  getCamera(): CameraAnchor {
    return this.rig.getAnchor();
  }

  setCamera(camera: CameraAnchor, options?: { animate?: boolean }): void {
    this.rig.setAnchor(camera, this.active && (options?.animate ?? false));
    this.requestRender();
  }

  frame(target?: SpatialAnchor | null, options?: { animate?: boolean }): void {
    const model = this.model;
    if (!model) return;
    this.ensurePose();
    const animate = this.active && (options?.animate ?? false);
    const extent = extentOf(model.scene.bounds);
    const resolved = target ? resolveAnchor(model, target) : null;
    if (resolved?.kind === "surface") {
      const point = anchorPoint(resolved);
      this.rig.frameSphere([point.x, point.y, point.z], Math.max(extent.size * 0.08, 0.01), animate);
    } else if (resolved?.kind === "region") {
      const center = anchorPoint(resolved);
      const radius = Math.max(regionRadius(resolved, center) * 1.15, extent.size * 0.04);
      this.rig.frameSphere([center.x, center.y, center.z], radius, animate);
    } else {
      const { center, radius } = this.posedBounds(model);
      this.rig.frameSphere(center, radius, animate);
    }
    this.requestRender();
  }

  private posedBounds(model: Model): { center: Vec3; radius: number } {
    const min = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
    const max = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
    const point = new Float64Array(3);
    for (const runtime of model.meshes) {
      if (!runtime.visible) continue;
      const count = runtime.data.positions.length / 3;
      for (let vertex = 0; vertex < count; vertex++) {
        runtime.posed.get(vertex, point);
        for (let axis = 0; axis < 3; axis++) {
          const value = point[axis] ?? 0;
          if (value < (min[axis] ?? 0)) min[axis] = value;
          if (value > (max[axis] ?? 0)) max[axis] = value;
        }
      }
    }
    const [x0 = 0, y0 = 0, z0 = 0] = min;
    const [x1 = 0, y1 = 0, z1 = 0] = max;
    if (x0 > x1) {
      const extent = extentOf(model.scene.bounds);
      return { center: [extent.center.x, extent.center.y, extent.center.z], radius: extent.size / 2 };
    }
    return {
      center: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2],
      radius: Math.max(Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2, 0.005),
    };
  }

  setHighlight(meshes: readonly string[] | null): void {
    const next = new Set(meshes ?? []);
    if (next.size === this.highlighted.size && [...next].every((path) => this.highlighted.has(path))) return;
    this.highlighted = next;
    this.tintDirty = true;
    this.requestRender();
  }

  setOverlays(overlays: readonly CommentOverlay[]): void {
    const previous = new Map(this.overlays.map((entry) => [entry.overlay.id, entry]));
    let changed = this.strokeFinished || overlays.length !== this.overlays.length;
    this.overlays = overlays.map((overlay, index) => {
      const key = anchorKey(overlay.anchor);
      const old = previous.get(overlay.id);
      const same = old?.key === key;
      if (!same || old?.overlay.state !== overlay.state || old.overlay.selected !== overlay.selected) changed = true;
      if (old?.overlay.pending !== overlay.pending) changed = true;
      if (old?.overlay.number !== overlay.number || this.overlays[index]?.overlay.id !== overlay.id) changed = true;
      if (!same) this.surfaceVisibility.delete(overlay.id);
      return same && old ? { overlay: { ...overlay }, key, resolved: old.resolved } : this.resolveEntry(overlay);
    });
    for (const id of this.surfaceVisibility.keys())
      if (!overlays.some((overlay) => overlay.id === id)) this.surfaceVisibility.delete(id);
    if (this.strokeFinished) {
      this.stroke = null;
      this.strokeFinished = false;
    }
    if (!changed) return;
    this.pins.sync(this.overlays.map((entry) => entry.overlay));
    this.tintDirty = true;
    this.visibilityVersion = -1;
    this.requestRender();
  }

  private resolveEntry(overlay: CommentOverlay): OverlayEntry {
    return {
      overlay: { ...overlay },
      key: anchorKey(overlay.anchor),
      resolved: this.model ? resolveAnchor(this.model, overlay.anchor) : null,
    };
  }

  private setHoveredOverlay(id: string | null): void {
    if (id === this.hoveredOverlay) return;
    this.hoveredOverlay = id;
    this.pins.setHovered(id);
    this.tintDirty = true;
    this.requestRender();
  }

  screenPosition(anchor: SpatialAnchor): ScreenPosition | null {
    const model = this.model;
    if (!model) return null;
    this.ensurePose();
    const camera = this.rig.camera;
    camera.updateMatrixWorld();
    const resolved = resolveAnchor(model, anchor);
    if (!resolved) return null;
    const projector = new Projector(camera, this.width, this.height);
    const point = anchorPoint(resolved);
    const projected = projector.project(point.x, point.y, point.z);
    if (!projector.onScreen(projected)) return null;
    let visible = facesCamera(resolved, camera);
    if (visible) {
      const key = anchorKey(anchor);
      const entry = this.overlays.find((candidate) => candidate.key === key);
      const known = entry ? this.surfaceVisibility.get(entry.overlay.id) : undefined;
      if (known !== undefined) {
        visible = known;
      } else {
        this.idPass.render(this.stage.scene, camera, this.viewVersion());
        const sample = this.idPass.read(projected.x, projected.y, 1, 1).at(projected.x, projected.y);
        visible = this.judgeVisible(resolved, point, projected.depth, sample);
      }
    }
    return { x: projected.x, y: projected.y, visible };
  }

  on<Name extends ViewportEventName>(name: Name, listener: (payload: ViewportEvents[Name]) => void): () => void {
    return this.emitter.on(name, listener);
  }

  computeContext(anchor: SpatialAnchor | null, time: TimeSelection): ComputedContext {
    const model = this.model;
    const label = viewLabel(this.rig.getAnchor().position, this.rig.getAnchor().target);
    if (!model) throw new ArcueError("unavailable", "No scene is shown.");
    const at = resolveTimeSelection(model.scene.clips, time);
    if (!at)
      throw new ArcueError("not-found", `The scene has no clip named "${time.kind === "none" ? "" : time.clip}".`);
    if (!anchor) return { vertexCount: 0, bones: [], centroid: null, joints: [], viewLabel: label };
    const runtime = model.meshByPath.get(anchor.mesh);
    if (!runtime) throw new ArcueError("not-found", `The scene has no mesh at "${anchor.mesh}".`);
    if (!runtime.visible) throw new ArcueError("not-found", `The mesh at "${anchor.mesh}" is hidden.`);
    const scene = model.scene;
    const pose = poseAt(scene, at.clip, at.seconds);
    const worlds = worldMatrices(scene.nodes, pose);
    const skeleton = runtime.data.skeleton === null ? undefined : scene.skeletons[runtime.data.skeleton];
    const bindMatrix = runtime.data.bindMatrix;
    const meshPose = {
      skin:
        runtime.posedMesh.joints && skeleton && bindMatrix
          ? meshSkinMatrices(jointMatrices(skeleton, worlds), bindMatrix)
          : null,
      bindMatrix,
      nodeWorld: worlds.subarray(runtime.node * 16, runtime.node * 16 + 16),
      morphWeights: pose.morphWeights[runtime.index] ?? new Float32Array(),
    };
    try {
      const context = anchorContext({
        scene,
        mesh: runtime.data,
        meshNode: runtime.node,
        target: anchorVertices(anchor, runtime.data),
        representatives: runtime.representatives,
        worlds,
        posedSource: (vertex, out) => {
          const rendered = runtime.representatives[vertex] ?? -1;
          if (rendered >= 0) {
            posedVertex(runtime.posedMesh, rendered, meshPose, out);
            return;
          }
          out.set(runtime.data.restPositions.subarray(vertex * 3, vertex * 3 + 3));
        },
      });
      return { ...context, viewLabel: label };
    } catch (error) {
      if (error instanceof AnchorError) throw new ArcueError("invalid-input", error.message, { cause: error });
      throw error;
    }
  }

  async screenshot(options: ScreenshotOptions): Promise<Uint8Array> {
    if (this.contextLost) throw new ArcueError("unavailable", "The 3D view lost its graphics context.");
    const model = this.model;
    const time = options.time && model ? resolveTimeSelection(model.scene.clips, options.time) : null;
    if (options.time && model && !time) {
      throw new ArcueError("not-found", "The screenshot's clip is not in the scene.");
    }
    this.ensurePose();
    const canvas = renderScreenshot({
      renderer: this.renderer,
      scene: this.stage.scene,
      camera: this.rig.camera,
      cameraAnchor: options.camera ?? this.rig.getAnchor(),
      width: Math.min(4096, Math.max(1, Math.round(options.width))),
      height: Math.min(4096, Math.max(1, Math.round(options.height))),
      palette: this.palette,
      modelSize: model ? extentOf(model.scene.bounds).size : 1,
      setPose: (clip, seconds) => {
        model?.applyPose(clip, seconds);
        if (model) this.skeleton?.update(model.worlds);
      },
      pose: time,
      overlays: model ? (options.overlays ?? []).map((overlay) => this.resolveEntry(overlay)) : [],
      paintTint: (entries) => this.paintTint(entries, null, new Set()),
      judgeVisible: (resolved, point, depth, sample) => this.judgeVisible(resolved, point, depth, sample),
    });
    if (model) model.applyPose(this.clip, this.shownTime());
    this.tintDirty = true;
    this.renderNow();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new ArcueError("internal", "The browser could not encode the screenshot.");
    return new Uint8Array(await blob.arrayBuffer());
  }

  private requestRender(): void {
    if (this.frameRequest || this.disposed || this.contextLost || !this.active) return;
    this.frameRequest = requestAnimationFrame((now) => this.tick(now));
  }

  private tick(now: number): void {
    this.frameRequest = 0;
    if (this.disposed || !this.active) return;
    const dt = this.lastTick ? Math.min((now - this.lastTick) / 1000, 0.1) : 0;
    this.lastTick = now;
    let again = false;
    let timeChanged = false;
    if (this.playing && this.clip) {
      const step = advancePlayback(this.time, dt, this.clip, this.playbackSettings());
      timeChanged = step.time !== this.time || step.playing !== this.playing;
      this.time = step.time;
      this.playing = step.playing;
      this.poseDirty = this.poseDirty || timeChanged;
      again = step.playing;
    }
    if (this.rig.step(now)) again = true;
    this.renderNow();
    if (timeChanged) this.emitTime();
    if (again || this.stroke?.hasPending) this.requestRender();
    else this.lastTick = 0;
  }

  private ensurePose(): void {
    if (!this.poseDirty) return;
    this.poseDirty = false;
    this.viewStamp++;
    this.model?.applyPose(this.clip, this.shownTime());
  }

  private renderNow(): void {
    if (this.contextLost) return;
    this.ensurePose();
    const camera = this.rig.camera;
    camera.updateMatrixWorld();
    if (this.stroke?.hasPending) this.processStroke();
    if (this.tintDirty) this.updateTint();
    if (this.model) this.skeleton?.update(this.model.worlds);
    this.renderer.render(this.stage.scene, camera);
    this.placePins();
    if (this.rig.revision !== this.lastCameraRevision) {
      this.lastCameraRevision = this.rig.revision;
      this.emitter.emit("cameraChange", { camera: this.rig.getAnchor() });
    }
    this.checkVisibility();
  }

  /** A number that changes whenever the scene, pose, camera or size changes, so the ID pass knows when it is stale. */
  private viewVersion(): number {
    if (this.rig.revision !== this.seenCameraRevision) {
      this.seenCameraRevision = this.rig.revision;
      this.viewStamp++;
    }
    return this.viewStamp;
  }

  private resize(): void {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width <= 0 || height <= 0 || this.disposed) return;
    this.width = width;
    this.height = height;
    this.viewStamp++;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.maxPixelRatio));
    this.renderer.setSize(width, height, false);
    this.rig.setAspect(width / height);
    this.idPass.setSize(width, height);
    this.renderNow();
  }

  /** Resizes when the window moves to a screen with another pixel ratio, which changes no element size. */
  private watchPixelRatio(): void {
    this.stopPixelRatioWatch();
    const query = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    const onChange = () => {
      this.watchPixelRatio();
      this.resize();
    };
    query.addEventListener("change", onChange);
    this.stopPixelRatioWatch = () => query.removeEventListener("change", onChange);
  }

  private updateTint(): void {
    this.tintDirty = false;
    const finished = this.stroke;
    this.paintTint(
      this.overlays.filter((entry) => !finished || entry.overlay.id !== finished.overlayId),
      finished,
      this.highlighted,
    );
  }

  /** Tints the highlighted meshes, then the painted regions over them; screenshots pass no highlight. */
  private paintTint(
    entries: readonly OverlayEntry[],
    stroke: PaintStroke | null,
    highlighted: ReadonlySet<string>,
  ): void {
    const model = this.model;
    if (!model) return;
    for (const runtime of model.meshes) {
      runtime.tint.clear();
      if (highlighted.has(runtime.path)) runtime.tint.fill(this.tintStyles.highlight);
    }
    const ranked = entries
      .filter((entry) => entry.resolved?.kind === "region")
      .map((entry) => ({ entry, rank: this.tintRank(entry.overlay) }))
      .sort((a, b) => a.rank - b.rank);
    for (const { entry } of ranked) {
      const resolved = entry.resolved;
      if (resolved?.kind !== "region") continue;
      resolved.runtime.tint.paint(resolved.triangles, this.tintStyle(entry.overlay));
    }
    if (stroke?.mesh) {
      stroke.mesh.tint.paint(stroke.painted, stroke.overlayId ? this.tintStyles.draftSelected : this.tintStyles.stroke);
    }
    for (const runtime of model.meshes) runtime.tint.upload();
  }

  private tintRank(overlay: CommentOverlay): number {
    if (overlay.selected) return 4;
    if (overlay.id === this.hoveredOverlay) return 3;
    const state = overlay.pending ? "draft" : overlay.state;
    return state === "draft" ? 2 : state === "sent" ? 1 : 0;
  }

  private tintStyle(overlay: CommentOverlay): Rgba {
    const state = overlay.pending ? "draft" : overlay.state;
    const level = overlay.selected ? "Selected" : overlay.id === this.hoveredOverlay ? "Hovered" : "";
    return this.tintStyles[`${state}${level}` as keyof TintStyles];
  }

  private placePins(): void {
    const camera = this.rig.camera;
    const projector = new Projector(camera, this.width, this.height);
    const candidates: PinCandidate[] = [];
    for (const entry of this.overlays) {
      const resolved = entry.resolved;
      if (!resolved) {
        this.pins.place(entry.overlay.id, null);
        continue;
      }
      const point = anchorPoint(resolved);
      const projected = projector.project(point.x, point.y, point.z);
      const onScreen = projector.onScreen(projected, 16);
      const facing = facesCamera(resolved, camera);
      const visible = facing && (this.surfaceVisibility.get(entry.overlay.id) ?? true);
      this.pins.place(entry.overlay.id, { x: projected.x, y: projected.y, onScreen, surfaceVisible: visible });
      if (onScreen) candidates.push({ entry, x: projected.x, y: projected.y, depth: projected.depth, facing });
    }
    this.pinCandidates = candidates;
  }

  /**
   * Reads the ID pass under the pins on screen in a few rectangles, without stalling, and fades pins whose surface
   * is hidden.
   */
  private checkVisibility(): void {
    if (this.contextLost || !this.model || !this.active) return;
    const version = this.viewVersion();
    if (this.visibilityInFlight || version === this.visibilityVersion) return;
    const now = performance.now();
    if (this.playing && now - this.lastVisibilityAt < PLAYING_VISIBILITY_MS) return;
    this.visibilityVersion = version;
    this.lastVisibilityAt = now;
    const clusters = clusterPoints(
      this.pinCandidates.filter(({ facing, x, y }) => facing && x >= 0 && y >= 0 && x < this.width && y < this.height),
    );
    if (clusters.length === 0) return;
    this.idPass.render(this.stage.scene, this.rig.camera, version);
    this.visibilityInFlight = true;
    const token = this.sceneToken;
    const reads = clusters.map(async ({ left, top, width, height, points }) => {
      const pixels = await this.idPass.readAsync(left, top, width, height);
      return points.map((candidate) => ({ candidate, sample: pixels.at(candidate.x, candidate.y) }));
    });
    Promise.all(reads)
      .then((groups) => {
        if (this.disposed || token !== this.sceneToken) return;
        for (const { candidate, sample } of groups.flat()) {
          const resolved = candidate.entry.resolved;
          if (!resolved) continue;
          const point = anchorPoint(resolved);
          this.surfaceVisibility.set(
            candidate.entry.overlay.id,
            this.judgeVisible(resolved, point, candidate.depth, sample),
          );
        }
        this.placePins();
      })
      .catch(() => {})
      .finally(() => {
        this.visibilityInFlight = false;
        if (!this.disposed && !this.playing && this.visibilityVersion !== this.viewVersion()) this.checkVisibility();
      });
  }

  private judgeVisible(resolved: ResolvedAnchor, point: Vector3, depth: number, sample: IdSample): boolean {
    if (sample.mesh < 0) return true;
    const size = this.model ? extentOf(this.model.scene.bounds).size : 1;
    let tolerance = Math.max(depth * 0.005, size * 0.002);
    if (sample.mesh === resolved.runtime.index) {
      if (resolved.kind === "surface" && sample.triangle === resolved.triangle) return true;
      if (resolved.kind === "region" && resolved.triangleSet.has(sample.triangle)) return true;
    }
    if (resolved.kind === "region") tolerance = Math.max(tolerance, regionRadius(resolved, point));
    return sample.depth >= depth - tolerance;
  }

  private localPoint(event: PointerEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  private onPointerDown(event: PointerEvent): void {
    if (event.target !== this.canvas) return;
    if (this.gesture) {
      this.cancelGesture();
      return;
    }
    const comment = this.tool === "comment" && !event.altKey && event.button === 0;
    this.rig.setLeftButtonOrbits(!(this.tool === "comment" && !event.altKey));
    if (event.button !== 0) return;
    const { x, y } = this.localPoint(event);
    this.gesture = {
      pointerId: event.pointerId,
      startX: x,
      startY: y,
      moved: false,
      comment,
      mode: event.ctrlKey || event.metaKey ? "erase" : event.shiftKey ? "add" : "paint",
    };
  }

  private onPointerMove(event: PointerEvent): void {
    const { x, y } = this.localPoint(event);
    this.pointer = { x, y, inside: true };
    this.brush.moveTo(x, y);
    const gesture = this.gesture;
    if (!gesture || gesture.pointerId !== event.pointerId) {
      if (event.buttons === 0) this.scheduleHover();
      return;
    }
    if (!gesture.moved && Math.hypot(x - gesture.startX, y - gesture.startY) > CLICK_SLOP) {
      gesture.moved = true;
      if (gesture.comment) this.beginStroke(gesture.mode, gesture.startX, gesture.startY);
    }
    if (gesture.moved && this.stroke && !this.strokeFinished) {
      this.stroke.addPoint(x, y, this.brush.size);
      this.requestRender();
    }
  }

  private onPointerUp(event: PointerEvent): void {
    const gesture = this.gesture;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    this.gesture = null;
    const { x, y } = this.localPoint(event);
    if (gesture.moved) {
      if (gesture.comment) this.finishStroke();
      return;
    }
    this.click(gesture, x, y);
  }

  private onPointerLeave(): void {
    this.pointer = { ...this.pointer, inside: false };
    if (!this.stroke || this.strokeFinished) this.brush.setVisible(false);
    this.overModel = false;
    this.updateCursor();
    this.emitHover(null);
  }

  private click(gesture: Gesture, x: number, y: number): void {
    const pick = this.pickAt(x, y);
    if (gesture.comment) {
      if (pick) this.emitter.emit("pinPlaced", { anchor: pick.anchor });
      else this.emitter.emit("emptyClicked", {});
      return;
    }
    if (!pick) {
      this.emitter.emit("emptyClicked", {});
      return;
    }
    const region = this.overlays
      .filter(
        (entry) =>
          entry.resolved?.kind === "region" &&
          entry.resolved.runtime === pick.runtime &&
          entry.resolved.triangleSet.has(pick.sample.triangle),
      )
      .sort((a, b) => this.tintRank(b.overlay) - this.tintRank(a.overlay))[0];
    if (region) this.emitter.emit("overlayClicked", { id: region.overlay.id });
  }

  private cancelGesture(): void {
    this.gesture = null;
    if (this.stroke && !this.strokeFinished) {
      this.stroke = null;
      this.tintDirty = true;
      this.requestRender();
    }
    this.brush.setPainting(false);
  }

  private pickAt(x: number, y: number): Pick | null {
    const model = this.model;
    if (!model || this.contextLost) return null;
    this.ensurePose();
    this.rig.camera.updateMatrixWorld();
    this.idPass.render(this.stage.scene, this.rig.camera, this.viewVersion());
    const sample = this.idPass.read(x, y, 1, 1).at(x, y);
    return this.anchorFromSample(sample, x, y);
  }

  private anchorFromSample(sample: IdSample, x: number, y: number): Pick | null {
    const runtime = this.model?.meshes.find((candidate) => candidate.index === sample.mesh);
    if (!runtime || sample.triangle < 0 || sample.triangle >= runtime.triangleCount) return null;
    const projector = new Projector(this.rig.camera, this.width, this.height);
    const ray = projector.ray(x, y);
    const [a, b, c] = triangleCorners(runtime, sample.triangle);
    const hit = rayTriangleWeights(
      [ray.origin.x, ray.origin.y, ray.origin.z],
      [ray.direction.x, ray.direction.y, ray.direction.z],
      a,
      b,
      c,
    );
    const mesh = runtime.data;
    const source = (corner: number) => mesh.sourceVertex[mesh.indices[sample.triangle * 3 + corner] ?? 0] ?? 0;
    return {
      sample,
      runtime,
      anchor: {
        kind: "surface",
        mesh: runtime.path,
        vertices: [source(0), source(1), source(2)],
        weights: roundWeights(hit?.weights ?? [1 / 3, 1 / 3, 1 / 3]),
      },
    };
  }

  private scheduleHover(): void {
    if (this.hoverScheduled || this.disposed || !this.active) return;
    this.hoverScheduled = true;
    requestAnimationFrame(() => {
      this.hoverScheduled = false;
      this.probeHover();
    });
  }

  /** Reads the ID pass under the cursor without stalling and reports the surface there. Draws no frame. */
  private probeHover(): void {
    if (!this.model || !this.pointer.inside || this.gesture || this.disposed || this.contextLost || !this.active)
      return;
    if (this.hoverInFlight) {
      this.hoverAgain = true;
      return;
    }
    this.ensurePose();
    this.rig.camera.updateMatrixWorld();
    this.idPass.render(this.stage.scene, this.rig.camera, this.viewVersion());
    const { x, y } = this.pointer;
    const token = this.sceneToken;
    this.hoverInFlight = true;
    this.idPass
      .readAsync(x, y, 1, 1)
      .then((pixels) => {
        if (this.disposed || token !== this.sceneToken || !this.pointer.inside) return;
        const pick = this.anchorFromSample(pixels.at(x, y), x, y);
        this.overModel = pick !== null;
        this.updateBrush();
        this.updateCursor();
        this.emitHover(pick?.anchor ?? null);
      })
      .catch(() => {})
      .finally(() => {
        this.hoverInFlight = false;
        if (this.hoverAgain) {
          this.hoverAgain = false;
          this.scheduleHover();
        }
      });
  }

  private emitHover(anchor: SurfaceAnchor | null): void {
    const key = JSON.stringify(anchor);
    if (key === this.hoverAnchorKey) return;
    this.hoverAnchorKey = key;
    this.emitter.emit("hover", { anchor });
  }

  private updateBrush(): void {
    const painting = this.stroke !== null && !this.strokeFinished;
    this.brush.setVisible(this.tool === "comment" && this.pointer.inside && (this.overModel || painting));
    this.brush.setPainting(painting);
  }

  private updateCursor(): void {
    this.canvas.style.cursor = this.tool === "comment" && this.overModel ? "crosshair" : "";
  }

  private beginStroke(mode: StrokeMode, x: number, y: number): void {
    const selected = this.overlays.find((entry) => entry.overlay.selected && entry.resolved?.kind === "region");
    const base =
      selected?.resolved?.kind === "region"
        ? { overlayId: selected.overlay.id, runtime: selected.resolved.runtime, triangles: selected.resolved.triangles }
        : null;
    if (mode === "erase" && !base) return;
    this.stroke = new PaintStroke(mode, base);
    this.strokeFinished = false;
    this.stroke.addPoint(x, y, this.brush.size);
    this.updateBrush();
    this.requestRender();
  }

  private processStroke(): void {
    const stroke = this.stroke;
    const model = this.model;
    if (!stroke || !model) return;
    const camera = this.rig.camera;
    const version = this.viewVersion();
    const changed = stroke.process({
      model,
      projector: new Projector(camera, this.width, this.height),
      cameraPosition: new Vector3().setFromMatrixPosition(camera.matrixWorld),
      radius: this.brush.size,
      modelSize: extentOf(model.scene.bounds).size,
      read: (x, y, width, height) => {
        this.idPass.render(this.stage.scene, camera, version);
        return this.idPass.read(x, y, width, height);
      },
    });
    if (changed) this.tintDirty = true;
  }

  private finishStroke(): void {
    const stroke = this.stroke;
    if (!stroke) return;
    if (stroke.hasPending) {
      this.ensurePose();
      this.rig.camera.updateMatrixWorld();
      this.processStroke();
    }
    this.strokeFinished = true;
    this.updateBrush();
    const result = stroke.result();
    if (!result || (result.overlayId !== null && !stroke.changed)) {
      this.stroke = null;
      this.strokeFinished = false;
      this.tintDirty = true;
      this.requestRender();
      return;
    }
    this.tintDirty = true;
    this.requestRender();
    this.emitter.emit("regionPainted", result);
  }

  private onContextLost(event: Event): void {
    event.preventDefault();
    this.contextLost = true;
    if (this.frameRequest) cancelAnimationFrame(this.frameRequest);
    this.frameRequest = 0;
    this.cancelGesture();
    this.emitter.emit("contextLost", {});
  }

  /**
   * three.js rebuilds its GL state and uploads geometry and textures again from their CPU copies. What lived only on
   * the GPU is made again here: the environment map, the ID pass and the region tints.
   */
  private onContextRestored(): void {
    this.contextLost = false;
    this.stage.rebuildEnvironment(this.renderer);
    this.idPass.invalidate();
    this.viewStamp++;
    this.visibilityVersion = -1;
    this.tintDirty = true;
    this.lastTick = 0;
    this.requestRender();
    this.emitter.emit("contextRestored", {});
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.frameRequest) cancelAnimationFrame(this.frameRequest);
    this.resizeObserver.disconnect();
    this.stopPixelRatioWatch();
    for (const detach of this.detach) detach();
    this.rig.dispose();
    this.model?.dispose();
    this.skeleton?.dispose();
    this.stage.dispose();
    this.idPass.dispose();
    this.pins.dispose();
    this.brush.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.root.remove();
    this.emitter.clear();
  }
}

function anchorKey(anchor: SpatialAnchor): string {
  return JSON.stringify(anchor);
}

function tintStyles(palette: Palette): TintStyles {
  const style = (color: string, opacity: number): Rgba => {
    const [r, g, b] = colorBytes(color);
    return [r, g, b, Math.round(opacity * 255)];
  };
  return {
    stroke: style(palette.feedback, 0.42),
    draft: style(palette.feedback, 0.5),
    draftHovered: style(palette.feedbackHover, 0.58),
    draftSelected: style(palette.feedback, 0.66),
    sent: style(palette.feedbackSent, 0.5),
    sentHovered: style(palette.feedbackSent, 0.58),
    sentSelected: style(palette.feedbackSent, 0.66),
    resolved: style(palette.feedbackResolved, 0.34),
    resolvedHovered: style(palette.feedbackResolved, 0.42),
    resolvedSelected: style(palette.feedbackResolved, 0.5),
    highlight: style(palette.alert, 0.55),
  };
}
