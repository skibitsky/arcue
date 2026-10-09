import type { ComputedContext, DisplayMode, TimeSelection } from "@arcue/protocol";
import type {
  CameraAnchor,
  Clip,
  RegionAnchor,
  SceneDescription,
  SpatialAnchor,
  SurfaceAnchor,
  Vec3,
} from "@arcue/scene";
import { countInRanges } from "@arcue/scene";
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
} from "@arcue/viewport";
import { SEEDED_POINTS } from "./sample-data";

const PICK_BASE = 1_000_000;
const BACK_OFFSET = 4_000_000;
const DEFAULT_CAMERA: CameraAnchor = { position: [-1.05, 1.45, 4.4], target: [0, 1.0, 0], up: [0, 1, 0], fov: 30 };
const SHOULDER_Y = 1.4;
const SHOULDER_X = 0.36;
const HAND_Y = 0.95;
const HAND_X = 0.55;

type Vec2 = [number, number];

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const length = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
const normalize = (a: Vec3): Vec3 => scale(a, 1 / (length(a) || 1));
const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => add(a, scale(sub(b, a), t));

interface Basis {
  forward: Vec3;
  right: Vec3;
  up: Vec3;
  focal: number;
}

function basisOf(camera: CameraAnchor): Basis {
  const forward = normalize(sub(camera.target, camera.position));
  const right = normalize(cross(forward, camera.up));
  const up = cross(right, forward);
  return { forward, right, up, focal: 1 / Math.tan((camera.fov * Math.PI) / 360) };
}

function project(point: Vec3, camera: CameraAnchor, width: number, height: number): Vec2 | null {
  const basis = basisOf(camera);
  const offset = sub(point, camera.position);
  const depth = dot(offset, basis.forward);
  if (depth <= 0.01) return null;
  const half = height / 2;
  return [
    width / 2 + (dot(offset, basis.right) / depth) * basis.focal * half,
    half - (dot(offset, basis.up) / depth) * basis.focal * half,
  ];
}

/** Where the ray under a screen point meets the model's plane, z = 0. */
function unproject(x: number, y: number, camera: CameraAnchor, width: number, height: number): Vec3 | null {
  const basis = basisOf(camera);
  const half = height / 2;
  const px = (x - width / 2) / half / basis.focal;
  const py = (half - y) / half / basis.focal;
  const direction = normalize(add(basis.forward, add(scale(basis.right, px), scale(basis.up, py))));
  if (Math.abs(direction[2]) < 1e-4) return null;
  const t = -camera.position[2] / direction[2];
  if (t <= 0) return null;
  return add(camera.position, scale(direction, t));
}

function armSwing(clip: Clip | null, seconds: number): number {
  if (!clip || clip.duration <= 0) return 0;
  return Math.sin((seconds / clip.duration) * Math.PI * 2) * 0.45;
}

function handOf(side: -1 | 1, swing: number): Vec2 {
  const [x, y] = posePoint([side * HAND_X, HAND_Y, 0], swing);
  return [x, y];
}

/** Moves a rest-pose point on an arm along with the arm. */
function posePoint(point: Vec3, swing: number): Vec3 {
  const [x, y, z] = point;
  if (Math.abs(x) < SHOULDER_X || y > SHOULDER_Y + 0.05) return point;
  const side = x < 0 ? -1 : 1;
  const angle = swing * side;
  const lx = (x - side * SHOULDER_X) * side;
  const ly = y - SHOULDER_Y;
  return [
    side * SHOULDER_X + side * (lx * Math.cos(angle) - ly * Math.sin(angle)),
    SHOULDER_Y + lx * Math.sin(angle) + ly * Math.cos(angle),
    z,
  ];
}

function distanceToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const abx = b[0] - a[0];
  const aby = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * abx + (p[1] - a[1]) * aby) / (abx * abx + aby * aby || 1)));
  return Math.hypot(p[0] - (a[0] + abx * t), p[1] - (a[1] + aby * t));
}

function onModel(point: Vec3, swing: number): boolean {
  const [x, y] = point;
  if (Math.abs(Math.abs(x) - 0.17) < 0.13 && y >= 0 && y < 0.8) return true;
  if (Math.abs(x) < 0.34 && y > 0.72 && y < 1.5) return true;
  if (Math.hypot(x, y - 1.72) < 0.24) return true;
  for (const side of [-1, 1] as const) {
    const hand = handOf(side, swing);
    if (distanceToSegment([x, y], [side * SHOULDER_X, SHOULDER_Y], hand) < 0.11) return true;
  }
  return false;
}

interface Colors {
  feedback: string;
  feedbackSoft: string;
  feedbackSent: string;
  feedbackResolved: string;
  surface: string;
  surfaceStrong: string;
  text: string;
  muted: string;
  faint: string;
  line: string;
}

function readColors(element: Element): Colors {
  const style = getComputedStyle(element);
  const read = (name: string) => style.getPropertyValue(name).trim() || "gray";
  return {
    feedback: read("--feedback"),
    feedbackSoft: read("--feedback-soft"),
    feedbackSent: read("--feedback-sent"),
    feedbackResolved: read("--feedback-resolved"),
    surface: read("--surface-raised-strong"),
    surfaceStrong: read("--text-faint"),
    text: read("--text"),
    muted: read("--text-muted"),
    faint: read("--text-faint"),
    line: read("--line-strong"),
  };
}

export function anchorPoint(anchor: SpatialAnchor): Vec3 {
  const first = anchor.kind === "surface" ? anchor.vertices[0] : (anchor.vertices[0]?.[0] ?? 0);
  const seeded = SEEDED_POINTS.get(first);
  if (seeded) return seeded;
  const back = first >= BACK_OFFSET;
  const code = (back ? first - BACK_OFFSET : first) - PICK_BASE;
  if (code < 0) return [0, 1, 0.1];
  const xi = Math.floor(code / 2000);
  const yi = code % 2000;
  return [xi / 500 - 1, yi / 500, back ? -0.1 : 0.1];
}

function encodePoint(point: Vec3): number {
  const xi = Math.round((Math.max(-1, Math.min(1, point[0])) + 1) * 500);
  const yi = Math.round(Math.max(0, Math.min(2.4, point[1])) * 500);
  return PICK_BASE + xi * 2000 + yi + (point[2] < 0 ? BACK_OFFSET : 0);
}

function anchorSize(anchor: SpatialAnchor): number {
  return anchor.kind === "surface" ? 3 : countInRanges(anchor.vertices);
}

interface DrawParams {
  width: number;
  height: number;
  camera: CameraAnchor;
  clip: Clip | null;
  seconds: number;
  mode: DisplayMode;
  skeleton: boolean;
  overlays: readonly CommentOverlay[];
  stroke: readonly Vec3[];
  colors: Colors;
  /** Screenshots draw pins without numbers into the image. */
  pinsInImage: boolean;
}

function drawScene(context: CanvasRenderingContext2D, params: DrawParams): void {
  const { width, height, camera, colors } = params;
  context.clearRect(0, 0, width, height);
  const swing = armSwing(params.clip, params.seconds);
  const toScreen = (x: number, y: number, z = 0) => project([x, y, z], camera, width, height);

  context.lineWidth = 1;
  context.strokeStyle = colors.line;
  for (let i = -4; i <= 4; i++) {
    const a = toScreen(i * 0.5, 0, -2);
    const b = toScreen(i * 0.5, 0, 2);
    const c = toScreen(-2, 0, i * 0.5);
    const d = toScreen(2, 0, i * 0.5);
    context.beginPath();
    if (a && b) {
      context.moveTo(a[0], a[1]);
      context.lineTo(b[0], b[1]);
    }
    if (c && d) {
      context.moveTo(c[0], c[1]);
      context.lineTo(d[0], d[1]);
    }
    context.stroke();
  }

  const polygon = (points: Vec2[]) => {
    const projected = points.map(([x, y]) => toScreen(x, y));
    if (projected.some((point) => point === null)) return;
    context.beginPath();
    projected.forEach((point, index) => {
      if (!point) return;
      if (index === 0) context.moveTo(point[0], point[1]);
      else context.lineTo(point[0], point[1]);
    });
    context.closePath();
    if (params.mode === "wireframe") {
      context.strokeStyle = colors.muted;
      context.stroke();
    } else {
      context.fill();
      context.strokeStyle = colors.surface;
      context.stroke();
    }
  };
  const box = (x0: number, y0: number, x1: number, y1: number) =>
    polygon([
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
    ]);
  const circle = (cx: number, cy: number, r: number) =>
    polygon(
      Array.from(
        { length: 20 },
        (_, i): Vec2 => [cx + Math.cos((i / 20) * Math.PI * 2) * r, cy + Math.sin((i / 20) * Math.PI * 2) * r],
      ),
    );
  const limb = (a: Vec2, b: Vec2, r: number) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * r;
    const ny = (dx / len) * r;
    polygon([
      [a[0] + nx, a[1] + ny],
      [b[0] + nx, b[1] + ny],
      [b[0] - nx, b[1] - ny],
      [a[0] - nx, a[1] - ny],
    ]);
  };

  const fill = context.createLinearGradient(0, 0, 0, height);
  fill.addColorStop(0, params.mode === "clay" ? colors.muted : colors.faint);
  fill.addColorStop(1, colors.surface);
  context.fillStyle = fill;
  box(-0.3, 0, -0.05, 0.8);
  box(0.05, 0, 0.3, 0.8);
  box(-0.34, 0.72, 0.34, 1.5);
  for (const side of [-1, 1] as const) {
    const hand = handOf(side, swing);
    limb([side * SHOULDER_X, SHOULDER_Y], hand, 0.09);
    circle(hand[0], hand[1], 0.085);
  }
  circle(0, 1.72, 0.22);
  polygon([
    [-0.19, 1.82],
    [-0.13, 2.05],
    [-0.07, 1.88],
  ]);
  polygon([
    [-0.05, 1.9],
    [0.01, 1.98],
    [0.07, 1.9],
  ]);
  polygon([
    [0.09, 1.88],
    [0.15, 2.05],
    [0.21, 1.82],
  ]);

  if (params.skeleton) {
    context.strokeStyle = colors.text;
    context.lineWidth = 1.5;
    const bones: [Vec2, Vec2][] = [
      [
        [0, 0.8],
        [0, 1.72],
      ],
      [
        [-0.17, 0],
        [0, 0.8],
      ],
      [
        [0.17, 0],
        [0, 0.8],
      ],
      [
        [-SHOULDER_X, SHOULDER_Y],
        [SHOULDER_X, SHOULDER_Y],
      ],
      [[-SHOULDER_X, SHOULDER_Y], handOf(-1, swing)],
      [[SHOULDER_X, SHOULDER_Y], handOf(1, swing)],
    ];
    for (const [a, b] of bones) {
      const pa = toScreen(a[0], a[1], 0.12);
      const pb = toScreen(b[0], b[1], 0.12);
      if (!pa || !pb) continue;
      context.beginPath();
      context.moveTo(pa[0], pa[1]);
      context.lineTo(pb[0], pb[1]);
      context.stroke();
    }
  }

  const tint = (point: Vec3, count: number, color: string) => {
    const center = project(point, camera, width, height);
    const edge = project(add(point, [0.03 + Math.sqrt(count) * 0.012, 0, 0]), camera, width, height);
    if (!center || !edge) return;
    context.fillStyle = color;
    context.beginPath();
    context.arc(center[0], center[1], Math.max(4, Math.abs(edge[0] - center[0])), 0, Math.PI * 2);
    context.fill();
  };
  for (const overlay of params.overlays) {
    if (overlay.anchor.kind !== "region") continue;
    const color =
      overlay.state === "draft"
        ? colors.feedbackSoft
        : overlay.state === "sent"
          ? colors.feedbackSent
          : colors.feedbackResolved;
    const point = posePoint(anchorPoint(overlay.anchor), swing);
    tint(point, anchorSize(overlay.anchor), color);
    if (overlay.selected) tint(point, anchorSize(overlay.anchor) * 0.5, colors.feedbackSoft);
  }
  for (const point of params.stroke) tint(point, 1, colors.feedbackSoft);

  if (params.pinsInImage) {
    for (const overlay of params.overlays) {
      const point = project(posePoint(anchorPoint(overlay.anchor), swing), camera, width, height);
      if (!point) continue;
      const radius = Math.max(6, height / 60);
      context.fillStyle = overlay.state === "draft" ? colors.feedback : colors.feedbackSent;
      context.beginPath();
      context.arc(point[0], point[1], radius, 0, Math.PI * 2);
      context.fill();
      context.lineWidth = Math.max(2, radius / 4);
      context.strokeStyle = colors.surface;
      context.stroke();
    }
  }
}

function viewLabel(camera: CameraAnchor): string {
  const [ox, oy, oz] = sub(camera.position, camera.target);
  const len = Math.hypot(ox, oy, oz) || 1;
  const azimuth = Math.abs((Math.atan2(ox, oz) * 180) / Math.PI);
  const elevation = (Math.asin(oy / len) * 180) / Math.PI;
  const side = ox > 0 ? "left" : "right";
  let direction = "front";
  if (azimuth > 150) direction = "back";
  else if (azimuth > 110) direction = `back ${side}`;
  else if (azimuth > 65) direction = `${side} side`;
  else if (azimuth > 28) direction = `front ${side}`;
  if (elevation > 38) return `${direction}, from above`;
  if (elevation > 12) return `${direction}, slightly above`;
  if (elevation < -38) return `${direction}, from below`;
  if (elevation < -12) return `${direction}, slightly below`;
  return direction;
}

function boneFor(point: Vec3): string {
  const [x, y] = point;
  if (y > 1.55) return "Head";
  if (Math.abs(x) > SHOULDER_X - 0.02 && y < SHOULDER_Y + 0.05) {
    const side = x < 0 ? "Right" : "Left";
    return y < 1.1 ? `${side}_Hand` : `${side}_Forearm`;
  }
  if (y > 1.1) return "Chest";
  if (y > 0.72) return "Hips";
  return x < 0 ? "Right_Shin" : "Left_Shin";
}

async function canvasToPng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) return new Uint8Array();
  return new Uint8Array(await blob.arrayBuffer());
}

/** Renders the placeholder model to PNG bytes, for seeded screenshots. */
export async function renderStill(options: {
  scene: SceneDescription;
  camera: CameraAnchor;
  time: TimeSelection;
  overlays: readonly CommentOverlay[];
  width: number;
  height: number;
}): Promise<Uint8Array> {
  const canvas = document.createElement("canvas");
  canvas.width = options.width;
  canvas.height = options.height;
  const context = canvas.getContext("2d");
  if (!context) return new Uint8Array();
  const clipName = options.time.kind === "none" ? null : options.time.clip;
  const clip = options.scene.clips.find((candidate) => candidate.name === clipName) ?? null;
  const frame =
    options.time.kind === "frame" ? options.time.frame : options.time.kind === "range" ? options.time.start : 0;
  const colors = readColors(document.documentElement);
  const background = context.createRadialGradient(
    options.width / 2,
    options.height * 0.32,
    0,
    options.width / 2,
    options.height * 0.32,
    options.width,
  );
  const style = getComputedStyle(document.documentElement);
  background.addColorStop(0, style.getPropertyValue("--viewport-glow").trim() || "black");
  background.addColorStop(0.78, style.getPropertyValue("--viewport-edge").trim() || "black");
  drawScene(context, {
    width: options.width,
    height: options.height,
    camera: options.camera,
    clip,
    seconds: clip ? frame / clip.fps : 0,
    mode: "lit",
    skeleton: false,
    overlays: options.overlays,
    stroke: [],
    colors,
    pinsInImage: true,
  });
  context.globalCompositeOperation = "destination-over";
  context.fillStyle = background;
  context.fillRect(0, 0, options.width, options.height);
  return canvasToPng(canvas);
}

type Listener<Name extends ViewportEventName> = (payload: ViewportEvents[Name]) => void;

/**
 * A stand-in for the three.js view: it draws a flat placeholder figure with a real perspective camera, places pins
 * in its overlay layer, and turns clicks and drags into the same events the real view sends.
 */
export class FakeViewport implements Viewport {
  readonly #container: HTMLElement;
  readonly #canvas: HTMLCanvasElement;
  readonly #layer: HTMLDivElement;
  readonly #brush: HTMLDivElement;
  readonly #maxPixelRatio: number;
  readonly #listeners = new Map<ViewportEventName, Set<(payload: never) => void>>();
  readonly #pins = new Map<string, HTMLButtonElement>();
  readonly #observer: ResizeObserver | null;
  #scene: SceneDescription | null = null;
  #clip: string | null = null;
  #seconds = 0;
  #playing = false;
  #speed = 1;
  #loop = true;
  #range: PlaybackRange | null = null;
  #mode: DisplayMode = "lit";
  #skeleton = false;
  #tool: ToolId = "view";
  #brushRadius = 22;
  #camera: CameraAnchor = DEFAULT_CAMERA;
  #overlays: readonly CommentOverlay[] = [];
  #stroke: Vec3[] = [];
  #frameRequest = 0;
  #lastTick = 0;
  #cameraTween: { from: CameraAnchor; to: CameraAnchor; start: number } | null = null;
  #disposed = false;

  constructor(options: ViewportOptions) {
    this.#container = options.container;
    this.#maxPixelRatio = options.maxPixelRatio ?? 2;
    this.#canvas = document.createElement("canvas");
    this.#canvas.className = "fv-canvas";
    this.#layer = document.createElement("div");
    this.#layer.className = "fv-layer";
    this.#brush = document.createElement("div");
    this.#brush.className = "fv-brush";
    this.#brush.hidden = true;
    this.#layer.append(this.#brush);
    this.#container.append(this.#canvas, this.#layer);
    this.#canvas.addEventListener("pointerdown", this.#onPointerDown);
    this.#canvas.addEventListener("pointermove", this.#onHover);
    this.#canvas.addEventListener("pointerleave", () => {
      this.#brush.hidden = true;
    });
    this.#canvas.addEventListener("wheel", this.#onWheel, { passive: false });
    this.#canvas.addEventListener("contextmenu", (event) => event.preventDefault());
    this.#observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            this.#resize();
            this.#emit("cameraChange", { camera: this.getCamera() });
          });
    this.#observer?.observe(this.#container);
    this.#resize();
  }

  async setScene(scene: SceneDescription | null): Promise<void> {
    this.#scene = scene;
    if (scene && this.#clip !== null && !scene.clips.some((clip) => clip.name === this.#clip)) this.#clip = null;
    const clip = this.#currentClip();
    if (clip) this.#seconds = Math.min(this.#seconds, clip.duration);
    await new Promise((resolve) => setTimeout(resolve, 120));
    this.#render();
  }

  setClip(clip: string | null): void {
    this.#clip = clip;
    this.#seconds = 0;
    this.#emitTime();
    this.#requestRender();
  }

  setTime(seconds: number): void {
    const clip = this.#currentClip();
    this.#seconds = clip ? Math.max(0, Math.min(clip.duration, seconds)) : 0;
    this.#emitTime();
    this.#requestRender();
  }

  setPlaying(playing: boolean): void {
    if (playing && !this.#currentClip()) return;
    this.#playing = playing;
    this.#lastTick = 0;
    this.#emitTime();
    this.#requestRender();
  }

  setSpeed(speed: number): void {
    this.#speed = speed;
  }

  setLoop(loop: boolean): void {
    this.#loop = loop;
  }

  setPlaybackRange(range: PlaybackRange | null): void {
    this.#range = range;
  }

  setDisplayMode(mode: DisplayMode): void {
    this.#mode = mode;
    this.#requestRender();
  }

  setSkeletonVisible(visible: boolean): void {
    this.#skeleton = visible;
    this.#requestRender();
  }

  setPartView(): void {}

  setTool(tool: ToolId): void {
    this.#tool = tool;
    this.#canvas.dataset.tool = tool;
    if (tool === "view") this.#brush.hidden = true;
  }

  setBrushSize(radius: number): void {
    this.#brushRadius = radius;
    this.#brush.style.width = `${radius * 2}px`;
    this.#brush.style.height = `${radius * 2}px`;
  }

  getCamera(): CameraAnchor {
    return structuredClone(this.#camera);
  }

  setCamera(camera: CameraAnchor, options?: { animate?: boolean }): void {
    if (options?.animate) {
      this.#cameraTween = { from: this.#camera, to: structuredClone(camera), start: performance.now() };
    } else {
      this.#cameraTween = null;
      this.#camera = structuredClone(camera);
      this.#emit("cameraChange", { camera: this.getCamera() });
    }
    this.#requestRender();
  }

  frame(target?: SpatialAnchor | null, options?: { animate?: boolean }): void {
    const focus: Vec3 = target ? posePoint(anchorPoint(target), this.#swing()) : [0, 1, 0];
    const radius = target ? 0.35 : 1.25;
    const direction = normalize(sub(this.#camera.position, this.#camera.target));
    const distance = radius / Math.tan((this.#camera.fov * Math.PI) / 360);
    this.setCamera({ ...this.#camera, target: focus, position: add(focus, scale(direction, distance)) }, options);
  }

  setOverlays(overlays: readonly CommentOverlay[]): void {
    this.#overlays = structuredClone([...overlays]);
    this.#requestRender();
  }

  screenPosition(anchor: SpatialAnchor): ScreenPosition | null {
    const point = posePoint(anchorPoint(anchor), this.#swing());
    const { width, height } = this.#size();
    const screen = project(point, this.#camera, width, height);
    if (!screen || screen[0] < 0 || screen[1] < 0 || screen[0] > width || screen[1] > height) return null;
    const facing = dot(sub(this.#camera.position, point), [0, 0, point[2] < 0 ? -1 : 1]) > 0;
    return { x: screen[0], y: screen[1], visible: facing };
  }

  on<Name extends ViewportEventName>(name: Name, listener: Listener<Name>): () => void {
    const set = this.#listeners.get(name) ?? new Set();
    this.#listeners.set(name, set);
    set.add(listener as (payload: never) => void);
    return () => {
      set.delete(listener as (payload: never) => void);
    };
  }

  computeContext(anchor: SpatialAnchor | null, time: TimeSelection): ComputedContext {
    const label = viewLabel(this.#camera);
    if (!anchor) return { vertexCount: 0, bones: [], centroid: null, joints: [], viewLabel: label };
    const clipName = time.kind === "none" ? null : time.clip;
    const clip = this.#scene?.clips.find((candidate) => candidate.name === clipName) ?? null;
    const frame = time.kind === "frame" ? time.frame : time.kind === "range" ? time.start : 0;
    const rest = anchorPoint(anchor);
    const posed = posePoint(rest, armSwing(clip, clip ? frame / clip.fps : 0));
    const bone = boneFor(rest);
    return {
      vertexCount: anchorSize(anchor),
      bones: [{ name: bone, share: 1 }],
      centroid: { rest, posed },
      joints: [{ name: bone, path: `Armature/${bone}`, position: posed }],
      viewLabel: label,
    };
  }

  async screenshot(options: ScreenshotOptions): Promise<Uint8Array> {
    if (!this.#scene) return new Uint8Array();
    return renderStill({
      scene: this.#scene,
      camera: options.camera ?? this.#camera,
      time:
        options.time ??
        (this.#clip === null
          ? { kind: "none" }
          : { kind: "frame", clip: this.#clip, frame: Math.round(this.#seconds * (this.#currentClip()?.fps ?? 30)) }),
      overlays: options.overlays ?? [],
      width: options.width,
      height: options.height,
    });
  }

  dispose(): void {
    this.#disposed = true;
    cancelAnimationFrame(this.#frameRequest);
    this.#observer?.disconnect();
    this.#canvas.remove();
    this.#layer.remove();
    this.#listeners.clear();
  }

  #emit<Name extends ViewportEventName>(name: Name, payload: ViewportEvents[Name]): void {
    for (const listener of [...(this.#listeners.get(name) ?? [])]) (listener as Listener<Name>)(payload);
  }

  #emitTime(): void {
    this.#emit("time", { seconds: this.#seconds, playing: this.#playing });
  }

  #currentClip(): Clip | null {
    return this.#scene?.clips.find((clip) => clip.name === this.#clip) ?? null;
  }

  #swing(): number {
    return armSwing(this.#currentClip(), this.#seconds);
  }

  #size(): { width: number; height: number } {
    return { width: this.#container.clientWidth, height: this.#container.clientHeight };
  }

  #resize(): void {
    const { width, height } = this.#size();
    const ratio = Math.min(window.devicePixelRatio || 1, this.#maxPixelRatio);
    this.#canvas.width = Math.max(1, Math.round(width * ratio));
    this.#canvas.height = Math.max(1, Math.round(height * ratio));
    this.#render();
  }

  #requestRender(): void {
    if (this.#frameRequest || this.#disposed) return;
    this.#frameRequest = requestAnimationFrame((now) => {
      this.#frameRequest = 0;
      this.#tick(now);
    });
  }

  #tick(now: number): void {
    let again = false;
    if (this.#cameraTween) {
      const t = Math.min(1, (now - this.#cameraTween.start) / 350);
      const eased = 1 - (1 - t) ** 3;
      const { from, to } = this.#cameraTween;
      this.#camera = {
        position: lerp(from.position, to.position, eased),
        target: lerp(from.target, to.target, eased),
        up: to.up,
        fov: from.fov + (to.fov - from.fov) * eased,
      };
      if (t >= 1) this.#cameraTween = null;
      this.#emit("cameraChange", { camera: this.getCamera() });
      again = this.#cameraTween !== null;
    }
    if (this.#playing) {
      const clip = this.#currentClip();
      const delta = this.#lastTick ? Math.min(0.1, (now - this.#lastTick) / 1000) : 0;
      this.#lastTick = now;
      if (clip) {
        const start = this.#range?.start ?? 0;
        const end = this.#range?.end ?? clip.duration;
        let seconds = this.#seconds + delta * this.#speed;
        if (seconds >= end) {
          if (this.#loop || this.#range) seconds = start + ((seconds - start) % Math.max(end - start, 1 / clip.fps));
          else {
            seconds = end;
            this.#playing = false;
          }
        }
        this.#seconds = seconds;
        this.#emitTime();
        this.#emit("cameraChange", { camera: this.getCamera() });
        again ||= this.#playing;
      }
    }
    this.#render();
    if (again) this.#requestRender();
  }

  #render(): void {
    const context = this.#canvas.getContext("2d");
    if (!context || this.#disposed) return;
    const { width, height } = this.#size();
    const ratio = this.#canvas.width / Math.max(1, width);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    if (this.#scene) {
      drawScene(context, {
        width,
        height,
        camera: this.#camera,
        clip: this.#currentClip(),
        seconds: this.#seconds,
        mode: this.#mode,
        skeleton: this.#skeleton,
        overlays: this.#overlays,
        stroke: this.#stroke,
        colors: readColors(this.#container),
        pinsInImage: false,
      });
    } else {
      context.clearRect(0, 0, width, height);
    }
    this.#placePins();
  }

  #placePins(): void {
    const keep = new Set<string>();
    for (const overlay of this.#overlays) {
      keep.add(overlay.id);
      let pin = this.#pins.get(overlay.id);
      if (!pin) {
        pin = document.createElement("button");
        pin.type = "button";
        pin.className = "fv-pin";
        const id = overlay.id;
        pin.addEventListener("pointerdown", (event) => event.stopPropagation());
        pin.addEventListener("click", () => this.#emit("overlayClicked", { id }));
        this.#layer.append(pin);
        this.#pins.set(overlay.id, pin);
      }
      pin.textContent = overlay.number === null ? "" : String(overlay.number);
      pin.dataset.state = overlay.state;
      pin.classList.toggle("is-selected", overlay.selected);
      pin.classList.toggle("is-new", overlay.id === "new");
      pin.setAttribute("aria-label", overlay.number === null ? "Comment" : `Comment ${overlay.number}`);
      const position = this.#scene ? this.screenPosition(overlay.anchor) : null;
      pin.hidden = position === null;
      if (position) {
        pin.style.left = `${position.x}px`;
        pin.style.top = `${position.y}px`;
        pin.classList.toggle("is-occluded", !position.visible);
      }
    }
    for (const [id, pin] of this.#pins) {
      if (keep.has(id)) continue;
      pin.remove();
      this.#pins.delete(id);
    }
  }

  #pointOnModel(event: PointerEvent): Vec3 | null {
    const rect = this.#canvas.getBoundingClientRect();
    const { width, height } = this.#size();
    const hit = unproject(event.clientX - rect.left, event.clientY - rect.top, this.#camera, width, height);
    if (!hit || !onModel(hit, this.#swing())) return null;
    const front = this.#camera.position[2] >= 0;
    return [hit[0], hit[1], front ? 0.1 : -0.1];
  }

  #onHover = (event: PointerEvent): void => {
    if (this.#tool !== "comment") return;
    const rect = this.#canvas.getBoundingClientRect();
    const over = this.#pointOnModel(event) !== null;
    this.#brush.hidden = !over && !this.#brush.classList.contains("is-painting");
    this.#brush.style.transform = `translate(${event.clientX - rect.left - this.#brushRadius}px, ${event.clientY - rect.top - this.#brushRadius}px)`;
  };

  #onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    const offset = sub(this.#camera.position, this.#camera.target);
    const factor = Math.exp(event.deltaY * 0.001);
    this.#camera = { ...this.#camera, position: add(this.#camera.target, scale(offset, factor)) };
    this.#emit("cameraChange", { camera: this.getCamera() });
    this.#requestRender();
  };

  #onPointerDown = (event: PointerEvent): void => {
    const orbit = this.#tool === "view" || event.button === 2 || event.altKey;
    if (event.button !== 0 && event.button !== 2) return;
    event.preventDefault();
    this.#canvas.setPointerCapture?.(event.pointerId);
    const startX = event.clientX;
    const startY = event.clientY;
    const startPoint = orbit ? null : this.#pointOnModel(event);
    let moved = false;
    let lastX = startX;
    let lastY = startY;
    this.#stroke = startPoint ? [startPoint] : [];
    const move = (moveEvent: PointerEvent) => {
      if (!moved && Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) > 4) moved = true;
      if (!moved) return;
      if (orbit) {
        this.#orbit(moveEvent.clientX - lastX, moveEvent.clientY - lastY);
      } else {
        this.#brush.classList.add("is-painting");
        this.#onHover(moveEvent);
        const point = this.#pointOnModel(moveEvent);
        if (point) this.#stroke.push(point);
        this.#requestRender();
      }
      lastX = moveEvent.clientX;
      lastY = moveEvent.clientY;
    };
    const up = (upEvent: PointerEvent) => {
      this.#canvas.removeEventListener("pointermove", move);
      this.#canvas.removeEventListener("pointerup", up);
      this.#canvas.removeEventListener("pointercancel", up);
      this.#brush.classList.remove("is-painting");
      if (orbit) {
        if (!moved && event.button === 0) this.#emit("emptyClicked", {});
        return;
      }
      if (!moved) {
        this.#stroke = [];
        if (startPoint) this.#emit("pinPlaced", { anchor: this.#surfaceAnchor(startPoint) });
        else this.#emit("emptyClicked", {});
        return;
      }
      this.#finishStroke(upEvent);
    };
    this.#canvas.addEventListener("pointermove", move);
    this.#canvas.addEventListener("pointerup", up);
    this.#canvas.addEventListener("pointercancel", up);
  };

  #orbit(dx: number, dy: number): void {
    const offset = sub(this.#camera.position, this.#camera.target);
    const distance = length(offset);
    let yaw = Math.atan2(offset[0], offset[2]) - dx * 0.008;
    let pitch = Math.asin(Math.max(-1, Math.min(1, offset[1] / distance))) + dy * 0.006;
    pitch = Math.max(-1.2, Math.min(1.3, pitch));
    yaw = ((yaw + Math.PI) % (Math.PI * 2)) - Math.PI;
    const direction: Vec3 = [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)];
    this.#camera = { ...this.#camera, position: add(this.#camera.target, scale(direction, distance)) };
    this.#emit("cameraChange", { camera: this.getCamera() });
    this.#requestRender();
  }

  #surfaceAnchor(point: Vec3): SurfaceAnchor {
    const code = encodePoint(point);
    return {
      kind: "surface",
      mesh: this.#meshPath(),
      vertices: [code, code + 1, code + 2],
      weights: [0.6, 0.25, 0.15],
    };
  }

  #regionAnchor(points: readonly Vec3[]): RegionAnchor {
    const centroid = scale(
      points.reduce<Vec3>((sum, point) => add(sum, point), [0, 0, 0]),
      1 / points.length,
    );
    const code = encodePoint(centroid);
    const count = Math.max(6, points.length * 3);
    return {
      kind: "region",
      mesh: this.#meshPath(),
      triangles: [[code, code + count]],
      vertices: [[code, code + count]],
    };
  }

  #meshPath(): string {
    const node = this.#scene?.nodes.find((candidate) => candidate.mesh === 0);
    return node?.path ?? "Mesh";
  }

  #finishStroke(event: PointerEvent): void {
    const stroke = this.#stroke;
    this.#stroke = [];
    this.#requestRender();
    if (stroke.length === 0) return;
    const selected = this.#overlays.find((overlay) => overlay.selected && overlay.anchor.kind === "region");
    const erase = event.ctrlKey || event.metaKey;
    if (selected && (event.shiftKey || erase)) {
      const previous = selected.anchor as RegionAnchor;
      const count = countInRanges(previous.vertices) + (erase ? -stroke.length * 3 : stroke.length * 3);
      if (count <= 0) {
        this.#emit("regionPainted", { overlayId: selected.id, anchor: null });
        return;
      }
      const centroid = erase
        ? anchorPoint(previous)
        : lerp(anchorPoint(previous), stroke[0] ?? anchorPoint(previous), 0.3);
      const code = encodePoint(centroid);
      this.#emit("regionPainted", {
        overlayId: selected.id,
        anchor: {
          kind: "region",
          mesh: previous.mesh,
          triangles: [[code, code + count]],
          vertices: [[code, code + count]],
        },
      });
      return;
    }
    if (erase) return;
    this.#emit("regionPainted", { overlayId: null, anchor: this.#regionAnchor(stroke) });
  }
}
