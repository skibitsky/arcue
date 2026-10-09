import type { CameraAnchor, Clip } from "@arcue/scene";
import type { PerspectiveCamera, Scene, WebGLRenderer } from "three";
import { Vector2, Vector3 } from "three";
import type { ResolvedAnchor } from "./render/anchor-points";
import { anchorPoint, facesCamera } from "./render/anchor-points";
import type { IdSample } from "./render/id-pass";
import { IdPass } from "./render/id-pass";
import type { Palette } from "./render/palette";
import { Projector } from "./render/projector";
import type { CommentOverlay } from "./viewport";

const REFERENCE_HEIGHT = 720;
/** The screenshot's ID pass is a float target, so its long side is capped; pins are looked up at the scaled spot. */
const MAX_ID_PASS_SIZE = 1024;

export interface ScreenshotEntry {
  overlay: CommentOverlay;
  resolved: ResolvedAnchor | null;
}

export interface ScreenshotInput<Entry extends ScreenshotEntry> {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  cameraAnchor: CameraAnchor;
  width: number;
  height: number;
  palette: Palette;
  modelSize: number;
  /** The time to render, or null for the time on screen. */
  pose: { clip: Clip | null; seconds: number } | null;
  setPose(clip: Clip | null, seconds: number): void;
  overlays: readonly Entry[];
  paintTint(entries: readonly Entry[]): void;
  judgeVisible(resolved: ResolvedAnchor, point: Vector3, depth: number, sample: IdSample): boolean;
}

/**
 * Renders the view at another size, camera and time into a 2D canvas: the viewport's background gradient, the model
 * with the given regions tinted, and a dot without a number for each pin. Everything runs in one task, so the page
 * never shows the intermediate frame; the caller restores its own pose, tint and frame afterwards.
 */
export function renderScreenshot<Entry extends ScreenshotEntry>(input: ScreenshotInput<Entry>): HTMLCanvasElement {
  const { renderer, width, height, cameraAnchor } = input;
  const camera = input.camera.clone();
  camera.up.set(...cameraAnchor.up);
  camera.position.set(...cameraAnchor.position);
  camera.fov = cameraAnchor.fov;
  camera.aspect = width / height;
  const target = new Vector3(...cameraAnchor.target);
  camera.lookAt(target);
  const distance = camera.position.distanceTo(target);
  camera.near = Math.max(distance * 0.01, input.modelSize * 1e-4, 1e-4);
  camera.far = (distance + input.modelSize * 4) * 6;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();

  if (input.pose) input.setPose(input.pose.clip, input.pose.seconds);
  input.paintTint(input.overlays);

  const savedRatio = renderer.getPixelRatio();
  const savedSize = renderer.getSize(new Vector2());
  const savedTarget = renderer.getRenderTarget();
  renderer.setRenderTarget(null);
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  renderer.render(input.scene, camera);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (context) {
    drawBackground(context, width, height, input.palette);
    context.drawImage(renderer.domElement, 0, 0, width, height);
  }

  const idScale = Math.min(1, MAX_ID_PASS_SIZE / Math.max(width, height));
  const pass =
    context && input.overlays.some((entry) => entry.resolved)
      ? new IdPass(renderer, Math.round(width * idScale), Math.round(height * idScale))
      : null;
  try {
    if (context && pass) {
      pass.render(input.scene, camera, 0);
      drawPins(context, input, camera, pass, idScale);
    }
  } finally {
    pass?.dispose();
    renderer.setPixelRatio(savedRatio);
    renderer.setSize(savedSize.x, savedSize.y, false);
    renderer.setRenderTarget(savedTarget);
  }
  return canvas;
}

function drawBackground(context: CanvasRenderingContext2D, width: number, height: number, palette: Palette): void {
  context.save();
  context.fillStyle = palette.viewportEdge;
  context.fillRect(0, 0, width, height);
  context.translate(width * 0.5, height * 0.32);
  context.scale(width * 1.2, height * 0.95);
  const gradient = context.createRadialGradient(0, 0, 0, 0, 0, 1);
  gradient.addColorStop(0, palette.viewportGlow);
  gradient.addColorStop(0.78, palette.viewportEdge);
  gradient.addColorStop(1, palette.viewportEdge);
  context.fillStyle = gradient;
  context.fillRect(-1, -1, 2, 2);
  context.restore();
}

function drawPins<Entry extends ScreenshotEntry>(
  context: CanvasRenderingContext2D,
  input: ScreenshotInput<Entry>,
  camera: PerspectiveCamera,
  pass: IdPass,
  idScale: number,
): void {
  const projector = new Projector(camera, input.width, input.height);
  const scale = Math.min(2.5, Math.max(0.6, input.height / REFERENCE_HEIGHT));
  const radius = 9 * scale;
  for (const entry of input.overlays) {
    const resolved = entry.resolved;
    if (!resolved) continue;
    const point = anchorPoint(resolved);
    const projected = projector.project(point.x, point.y, point.z);
    if (!projector.onScreen(projected)) continue;
    const idX = projected.x * idScale;
    const idY = projected.y * idScale;
    const sample = pass.read(idX, idY, 1, 1).at(idX, idY);
    const visible = facesCamera(resolved, camera) && input.judgeVisible(resolved, point, projected.depth, sample);
    const state = entry.overlay.pending ? "draft" : entry.overlay.state;
    const fill =
      state === "sent"
        ? input.palette.feedbackSent
        : state === "resolved"
          ? input.palette.feedbackResolved
          : input.palette.feedback;
    context.save();
    context.globalAlpha = visible ? 1 : 0.42;
    context.beginPath();
    context.arc(projected.x, projected.y, radius, 0, Math.PI * 2);
    context.fillStyle = fill;
    context.fill();
    context.lineWidth = 2.5 * scale;
    context.strokeStyle = input.palette.surfaceDesk;
    context.stroke();
    context.restore();
  }
}
