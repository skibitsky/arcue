import type { ComputedContext, TimeSelection } from "@arcue/protocol";
import type { CameraAnchor, SceneDescription, SpatialAnchor, SurfaceAnchor } from "@arcue/scene";
import type {
  CommentOverlay,
  PlaybackRange,
  ScreenPosition,
  ScreenshotOptions,
  ToolId,
  Viewport,
  ViewportEventName,
  ViewportEvents,
} from "@arcue/viewport";
import { FakeCoreClient } from "../dev/fake-core";
import {
  fakeScene,
  STONE_RESONATOR,
  STONE_RESONATOR_PATH,
  STONE_VERSION,
  stoneResonatorReview,
} from "../dev/sample-data";
import { createWorkspaceStore } from "./store/workspace-store";

export const NOW = new Date(2026, 9, 8, 15, 0, 0);

/** A viewport that records what the UI asks of it and lets a test send its events. */
export class TestViewport implements Viewport {
  scene: SceneDescription | null = null;
  clip: string | null = null;
  seconds = 0;
  playing = false;
  speed = 1;
  loop = true;
  range: PlaybackRange | null = null;
  tool: ToolId = "view";
  brush = 0;
  displayMode = "lit";
  skeleton = false;
  camera: CameraAnchor = { position: [0, 1, 4], target: [0, 1, 0], up: [0, 1, 0], fov: 30 };
  overlays: readonly CommentOverlay[] = [];
  screenshots: ScreenshotOptions[] = [];
  framed: (SpatialAnchor | null)[] = [];
  readonly #listeners = new Map<string, Set<(payload: never) => void>>();

  async setScene(scene: SceneDescription | null) {
    this.scene = scene;
  }
  setClip(clip: string | null) {
    this.clip = clip;
  }
  setTime(seconds: number) {
    this.seconds = seconds;
  }
  setPlaying(playing: boolean) {
    this.playing = playing;
  }
  setSpeed(speed: number) {
    this.speed = speed;
  }
  setLoop(loop: boolean) {
    this.loop = loop;
  }
  setPlaybackRange(range: PlaybackRange | null) {
    this.range = range;
  }
  setDisplayMode(mode: "lit" | "clay" | "wireframe") {
    this.displayMode = mode;
  }
  setSkeletonVisible(visible: boolean) {
    this.skeleton = visible;
  }
  setTool(tool: ToolId) {
    this.tool = tool;
  }
  setBrushSize(radius: number) {
    this.brush = radius;
  }
  getCamera() {
    return structuredClone(this.camera);
  }
  setCamera(camera: CameraAnchor) {
    this.camera = structuredClone(camera);
  }
  frame(target?: SpatialAnchor | null) {
    this.framed.push(target ?? null);
  }
  setOverlays(overlays: readonly CommentOverlay[]) {
    this.overlays = overlays;
  }
  screenPosition(): ScreenPosition {
    return { x: 200, y: 150, visible: true };
  }
  on<Name extends ViewportEventName>(name: Name, listener: (payload: ViewportEvents[Name]) => void) {
    const set = this.#listeners.get(name) ?? new Set();
    this.#listeners.set(name, set);
    set.add(listener as (payload: never) => void);
    return () => {
      set.delete(listener as (payload: never) => void);
    };
  }
  emit<Name extends ViewportEventName>(name: Name, payload: ViewportEvents[Name]) {
    for (const listener of [...(this.#listeners.get(name) ?? [])]) {
      (listener as (payload: ViewportEvents[Name]) => void)(payload);
    }
  }
  computeContext(anchor: SpatialAnchor | null, _time: TimeSelection): ComputedContext {
    return {
      vertexCount: anchor ? 3 : 0,
      bones: anchor ? [{ name: "Head", share: 1 }] : [],
      centroid: anchor ? { rest: [0, 1.9, 0.1], posed: [0, 1.9, 0.1] } : null,
      joints: [],
      viewLabel: "front",
    };
  }
  async screenshot(options: ScreenshotOptions) {
    this.screenshots.push(options);
    return new Uint8Array([137, 80, 78, 71]);
  }
  dispose() {}
}

export const POINT: SurfaceAnchor = {
  kind: "surface",
  mesh: "StoneResonator",
  vertices: [10, 11, 12],
  weights: [0.5, 0.3, 0.2],
};

/** Timers that fire only when the test says so. */
export class ManualTimers {
  #pending: { at: number; callback: () => void; cancelled: boolean }[] = [];
  #now = 0;

  setTimer = (delayMs: number, callback: () => void) => {
    const entry = { at: this.#now + delayMs, callback, cancelled: false };
    this.#pending.push(entry);
    return () => {
      entry.cancelled = true;
    };
  };

  advance(ms: number): void {
    this.#now += ms;
    const due = this.#pending.filter((entry) => entry.at <= this.#now && !entry.cancelled);
    this.#pending = this.#pending.filter((entry) => entry.at > this.#now && !entry.cancelled);
    for (const entry of due) entry.callback();
  }
}

export function stoneCatalog(path: string) {
  if (path !== STONE_RESONATOR_PATH) return null;
  return { scene: fakeScene(STONE_RESONATOR), review: stoneResonatorReview(NOW), version: STONE_VERSION };
}

export async function flush(times = 6): Promise<void> {
  for (let index = 0; index < times; index++) await new Promise((resolve) => setTimeout(resolve, 0));
}

export function setup(options: { clipboard?: "ok" | "blocked" } = {}) {
  const timers = new ManualTimers();
  const client = new FakeCoreClient({ catalog: stoneCatalog, now: () => NOW });
  const copied: string[] = [];
  const store = createWorkspaceStore({
    client,
    setTimer: timers.setTimer,
    writeClipboard: async (text) => {
      if (options.clipboard === "blocked") throw new Error("Blocked.");
      copied.push(text);
    },
  });
  client.connectWindow(store.handleRequest);
  store.start();
  return { client, store, timers, copied };
}

/** Opens the Stone Resonator at Charge frame 34 with a test viewport attached. */
export async function openStone(options: { clipboard?: "ok" | "blocked" } = {}) {
  const context = setup(options);
  const { assetId } = await context.client.execute("asset.open", {
    path: STONE_RESONATOR_PATH,
    clip: "Armature|Charge",
    frame: 34,
  });
  const session = context.store.session(assetId);
  if (!session) throw new Error("The asset has no session.");
  const viewport = new TestViewport();
  session.attachViewport(viewport, document.createElement("div"));
  await flush();
  return { ...context, assetId, session, viewport };
}
