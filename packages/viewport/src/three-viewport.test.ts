// @vitest-environment jsdom
import type { CameraAnchor, SurfaceAnchor } from "@arcue/scene";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stripScene } from "./math/test-fixture";
import { Model } from "./render/model";
import { ThreeViewport } from "./three-viewport";
import type { ViewportEvents } from "./viewport";

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

function canvas(): HTMLCanvasElement {
  const element = container.querySelector("canvas");
  if (!element) throw new Error("The view has no canvas.");
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

/** The alpha of a triangle's tint on the shown model's mesh. */
function tintAlpha(triangle: number): number {
  const data = models.at(-1)?.meshes[0]?.tint.uniforms.regionTint.value.image.data;
  return data?.[triangle * 4 + 3] ?? -1;
}

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
