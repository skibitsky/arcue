// @vitest-environment jsdom
import type { CameraAnchor, RegionAnchor, SceneDescription, SurfaceAnchor } from "@arcue/scene";
import { defaultPartView } from "@arcue/scene";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { regionAnchor } from "./math/regions";
import { stripScene } from "./math/test-fixture";
import { Model } from "./render/model";
import { ThreeViewport } from "./three-viewport";
import type { CommentOverlay, ViewportEvents } from "./viewport";

const fake = vi.hoisted(() => {
  interface Sample {
    mesh: number;
    triangle: number;
    depth: number;
  }
  const pixels = (sample: Sample) => ({ at: () => sample });
  const state = {
    /** What the ID pass shows under every pixel. A read describes it as it was when the read began. */
    sample: { mesh: 0, triangle: 0, depth: 1 } as Sample,
    deferReads: false,
    pendingReads: [] as (() => void)[],
    failNextRender: false,
    renderer: {
      capabilities: { getMaxAnisotropy: () => 1 },
      ratio: 1,
      width: 1,
      height: 1,
      getPixelRatio: () => state.renderer.ratio,
      setPixelRatio: (ratio: number) => {
        state.renderer.ratio = ratio;
      },
      getSize: <Out extends { set(x: number, y: number): Out }>(out: Out) =>
        out.set(state.renderer.width, state.renderer.height),
      setSize: (width: number, height: number) => {
        state.renderer.width = width;
        state.renderer.height = height;
      },
      getRenderTarget: () => null,
      setRenderTarget: () => {},
      render: () => {
        if (!state.failNextRender) return;
        state.failNextRender = false;
        throw new Error("The GPU went away.");
      },
      dispose: () => {},
      forceContextLoss: () => {},
    },
    IdPass: class {
      setSize(): void {}
      invalidate(): void {}
      render(): void {}
      dispose(): void {}
      read() {
        return pixels(state.sample);
      }
      readAsync() {
        const result = pixels(state.sample);
        if (!state.deferReads) return Promise.resolve(result);
        return new Promise((resolve) => state.pendingReads.push(() => resolve(result)));
      }
    },
  };
  return state;
});

vi.mock("./render/id-pass", () => ({ IdPass: fake.IdPass }));

vi.mock("./render/stage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./render/stage")>();
  const { Scene } = await import("three");
  return {
    ...actual,
    createRenderer: () => fake.renderer,
    Stage: class {
      readonly scene = new Scene();
      fit(): void {}
      rebuildEnvironment(): void {}
      dispose(): void {}
    },
  };
});

const NO_HIT = { mesh: -1, triangle: -1, depth: Number.POSITIVE_INFINITY };
const BEND = "Armature|Bend";

const frames = new Map<number, FrameRequestCallback>();
let nextFrame = 1;
let container: HTMLDivElement;
let view: ThreeViewport;
let models: Model[];
let painted: ViewportEvents["regionPainted"][];
let pins: ViewportEvents["pinPlaced"][];
let hovers: (SurfaceAnchor | null)[];
let times: ViewportEvents["time"][];

beforeEach(() => {
  frames.clear();
  fake.sample = { mesh: 0, triangle: 0, depth: 1 };
  fake.deferReads = false;
  fake.pendingReads = [];
  fake.failNextRender = false;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    const id = nextFrame++;
    frames.set(id, callback);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe(): void {}
      disconnect(): void {}
    },
  );
  vi.stubGlobal("matchMedia", () => ({ addEventListener: () => {}, removeEventListener: () => {} }));
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  for (const name of ["setPointerCapture", "releasePointerCapture"]) {
    if (!(name in Element.prototype)) Object.defineProperty(Element.prototype, name, { value: () => {} });
  }
  models = [];
  const build = Model.build;
  vi.spyOn(Model, "build").mockImplementation(async (...args) => {
    const model = await build(...args);
    models.push(model);
    return model;
  });

  container = document.createElement("div");
  Object.defineProperty(container, "clientWidth", { value: 400 });
  Object.defineProperty(container, "clientHeight", { value: 300 });
  document.body.append(container);
  view = new ThreeViewport({ container });
  painted = [];
  pins = [];
  hovers = [];
  times = [];
  view.on("regionPainted", (event) => painted.push(event));
  view.on("pinPlaced", (event) => pins.push(event));
  view.on("hover", ({ anchor }) => hovers.push(anchor));
  view.on("time", (event) => times.push(event));
});

afterEach(() => {
  view.dispose();
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Runs the animation frames requested so far, once. */
function runFrames(now = performance.now()): void {
  const due = [...frames.values()];
  frames.clear();
  for (const callback of due) callback(now);
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function resolveReads(): Promise<void> {
  for (const resolve of fake.pendingReads.splice(0)) resolve();
  await settle();
}

function canvas(): HTMLCanvasElement {
  const element = container.querySelector("canvas");
  if (!element) throw new Error("The view has no canvas.");
  return element;
}

function pin(id: string): HTMLElement {
  const element = container.querySelector<HTMLElement>(`[data-overlay-id="${id}"]`);
  if (!element) throw new Error(`No pin for ${id}.`);
  return element;
}

function send(type: "pointerdown" | "pointermove" | "pointerup", x: number, y: number, init: PointerEventInit = {}) {
  canvas().dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      clientX: x,
      clientY: y,
      pointerId: 1,
      pointerType: "mouse",
      button: 0,
      buttons: type === "pointerup" ? 0 : 1,
      ...init,
    }),
  );
}

function drag(init: PointerEventInit = {}): void {
  send("pointerdown", 200, 150, init);
  send("pointermove", 210, 150, init);
  send("pointermove", 220, 150, init);
  send("pointerup", 220, 150, init);
}

function hoverAt(x: number, y: number): void {
  send("pointermove", x, y, { buttons: 0 });
  runFrames();
}

/** The alpha of a triangle's tint on the shown model's mesh. */
function tintAlpha(triangle: number): number {
  const data = models.at(-1)?.meshes[0]?.tint.uniforms.regionTint.value.image.data;
  return data?.[triangle * 4 + 3] ?? -1;
}

function region(scene: SceneDescription, triangles: number[]): RegionAnchor {
  const mesh = scene.meshes[0];
  const anchor = mesh ? regionAnchor("Strip", mesh, triangles) : null;
  if (!anchor) throw new Error("No region.");
  return anchor;
}

/** The center of the strip's first or second triangle. */
function surface(triangle: 0 | 1): SurfaceAnchor {
  const vertices: [number, number, number] = triangle === 0 ? [0, 1, 3] : [0, 3, 2];
  return { kind: "surface", mesh: "Strip", vertices, weights: [1 / 3, 1 / 3, 1 / 3] };
}

const DRAFT = Math.round(0.5 * 255);
const DRAFT_HOVERED = Math.round(0.58 * 255);
const DRAFT_SELECTED = Math.round(0.66 * 255);

describe("painting", () => {
  beforeEach(async () => {
    await view.setScene(stripScene());
    view.setTool("comment");
  });

  it("keeps drawing a stroke that a listener shows as a comment", () => {
    view.on("regionPainted", ({ anchor }) => {
      if (anchor) view.setOverlays([{ id: "new", number: 1, state: "draft", anchor, selected: true, pending: true }]);
    });
    drag();
    runFrames();
    expect(painted).toHaveLength(1);
    expect(tintAlpha(0)).toBe(DRAFT_SELECTED);
  });

  it("stops drawing a stroke that no listener takes", () => {
    drag();
    runFrames();
    expect(painted).toHaveLength(1);
    expect(tintAlpha(0)).toBe(0);
  });

  it("finishes only the stroke its own gesture began", () => {
    drag();
    drag({ ctrlKey: true });
    expect(painted).toHaveLength(1);
  });

  it("cancels a stroke when a move comes without buttons, as after a lost pointerup", () => {
    send("pointerdown", 200, 150);
    send("pointermove", 210, 150);
    send("pointermove", 230, 150, { buttons: 0 });
    runFrames();
    expect(tintAlpha(0)).toBe(0);
    send("pointerdown", 230, 150);
    send("pointerup", 230, 150);
    expect(painted).toHaveLength(0);
    expect(pins).toHaveLength(1);
  });

  it("stops the camera animation when a comment gesture starts", () => {
    const start = view.getCamera();
    const [x, y, z] = start.position;
    const far: CameraAnchor = { ...start, position: [x + 4, y + 1, z + 4] };
    const begun = performance.now();
    view.setCamera(far, { animate: true });
    runFrames(begun + 100);
    send("pointerdown", 200, 150);
    const held = view.getCamera().position;
    runFrames(begun + 2000);
    const now = view.getCamera().position;
    for (const axis of [0, 1, 2]) expect(now[axis]).toBeCloseTo(held[axis] ?? Number.NaN, 6);
  });
});

describe("hover", () => {
  let scene: SceneDescription;

  beforeEach(async () => {
    scene = stripScene();
    await view.setScene(scene);
  });

  it("forgets a hovered pin that goes away, so a new comment with its id is not drawn hovered", () => {
    const overlay: CommentOverlay = {
      id: "new",
      number: null,
      state: "draft",
      anchor: region(scene, [0]),
      selected: false,
    };
    view.setOverlays([overlay]);
    pin("new").dispatchEvent(new PointerEvent("pointerenter"));
    runFrames();
    expect(tintAlpha(0)).toBe(DRAFT_HOVERED);
    view.setOverlays([]);
    view.setOverlays([overlay]);
    runFrames();
    expect(tintAlpha(0)).toBe(DRAFT);
  });

  it("forgets the hovered pin when the scene is replaced", async () => {
    view.setOverlays([{ id: "c1", number: 1, state: "draft", anchor: region(scene, [0]), selected: false }]);
    pin("c1").dispatchEvent(new PointerEvent("pointerenter"));
    await view.setScene(stripScene());
    runFrames();
    expect(tintAlpha(0)).toBe(DRAFT);
  });

  it("drops a hover read that a part view change made stale", async () => {
    fake.deferReads = true;
    hoverAt(200, 150);
    expect(fake.pendingReads).toHaveLength(1);
    view.setPartView({ ...defaultPartView(), hidden: ["Strip"] });
    fake.sample = NO_HIT;
    await resolveReads();
    runFrames();
    await resolveReads();
    expect(hovers.filter((anchor) => anchor !== null)).toEqual([]);
  });

  it("applies no hover read while a gesture is active", async () => {
    fake.deferReads = true;
    hoverAt(200, 150);
    send("pointerdown", 200, 150);
    await resolveReads();
    expect(hovers).toEqual([]);
  });

  it("probes again when a drag ends", async () => {
    hoverAt(200, 150);
    await settle();
    expect(hovers.at(-1)).not.toBeNull();
    send("pointerdown", 200, 150);
    fake.sample = NO_HIT;
    send("pointerup", 200, 150);
    runFrames();
    await settle();
    expect(hovers.at(-1)).toBeNull();
  });

  it("probes again when the camera stops moving", async () => {
    hoverAt(200, 150);
    await settle();
    expect(hovers.at(-1)).not.toBeNull();
    fake.sample = NO_HIT;
    const camera = view.getCamera();
    const [x, y, z] = camera.position;
    view.setCamera({ ...camera, position: [x + 1, y, z] });
    runFrames();
    runFrames();
    await settle();
    expect(hovers.at(-1)).toBeNull();
  });
});

describe("pin visibility", () => {
  let scene: SceneDescription;
  const pinned: CommentOverlay = { id: "c1", number: 1, state: "draft", anchor: surface(0), selected: false };

  beforeEach(async () => {
    scene = stripScene();
    await view.setScene(scene);
    fake.deferReads = true;
    fake.sample = { mesh: 0, triangle: 3, depth: 0.001 };
    view.setOverlays([pinned]);
    runFrames();
    expect(fake.pendingReads).toHaveLength(1);
  });

  it("drops a read that a display mode change made stale", async () => {
    view.setDisplayMode("clay");
    fake.sample = NO_HIT;
    await resolveReads();
    expect(pin("c1").classList.contains("is-hidden-surface")).toBe(false);
  });

  it("drops a read that an anchor change made stale", async () => {
    view.setOverlays([{ ...pinned, anchor: surface(1) }]);
    fake.sample = NO_HIT;
    await resolveReads();
    runFrames();
    expect(pin("c1").classList.contains("is-hidden-surface")).toBe(false);
  });
});

describe("playback", () => {
  it("applies a clip set while a scene loads to that scene once it is shown", async () => {
    await view.setScene({ ...stripScene(), clips: [] });
    const shown = view.setScene(stripScene());
    view.setClip(BEND);
    view.setTime(0.5);
    view.setPlaying(true);
    await shown;
    expect(times.at(-1)?.seconds).toBeCloseTo(0.5, 6);
    expect(times.at(-1)?.playing).toBe(true);
  });

  it("stops playing when the clip has no length", async () => {
    const scene = stripScene();
    const bend = scene.clips[0];
    if (!bend) throw new Error("No clip.");
    await view.setScene({ ...scene, clips: [bend, { ...bend, name: "Armature|Still", duration: 0, frameCount: 1 }] });
    view.setClip(BEND);
    view.setPlaying(true);
    expect(times.at(-1)?.playing).toBe(true);
    view.setClip("Armature|Still");
    expect(times.at(-1)?.playing).toBe(false);
    view.setClip(BEND);
    view.setPlaying(true);
    await view.setScene({ ...scene, clips: [{ ...bend, duration: 0, frameCount: 1 }] });
    expect(times.at(-1)?.playing).toBe(false);
  });
});

describe("screenshots", () => {
  it("restores the pose, tint and renderer size when rendering fails", async () => {
    const scene = stripScene();
    await view.setScene(scene);
    view.setClip(BEND);
    view.setTime(0.5);
    runFrames();
    const model = models.at(-1);
    if (!model) throw new Error("No model.");
    const applyPose = vi.spyOn(model, "applyPose");
    fake.failNextRender = true;
    const overlays: CommentOverlay[] = [
      { id: "c1", number: 1, state: "draft", anchor: region(scene, [0]), selected: false },
    ];
    await expect(
      view.screenshot({ width: 64, height: 48, time: { kind: "frame", clip: BEND, frame: 0 }, overlays }),
    ).rejects.toThrow("The GPU went away.");
    expect(applyPose).toHaveBeenLastCalledWith(expect.objectContaining({ name: BEND }), 0.5);
    expect([fake.renderer.width, fake.renderer.height]).toEqual([400, 300]);
    expect(tintAlpha(0)).toBe(0);
  });
});

describe("dispose", () => {
  it("ignores calls after dispose", async () => {
    await view.setScene(stripScene());
    const model = models.at(-1);
    if (!model) throw new Error("No model.");
    const dispose = vi.spyOn(model, "dispose");
    view.dispose();
    await view.setScene(null);
    view.setOverlays([{ id: "c1", number: 1, state: "draft", anchor: surface(0), selected: false }]);
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(view.screenPosition(surface(0))).toBeNull();
    await expect(view.screenshot({ width: 8, height: 8 })).rejects.toMatchObject({ code: "unavailable" });
  });
});
