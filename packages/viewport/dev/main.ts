import type { DisplayMode } from "@arcue/protocol";
import type { RegionAnchor, SceneDescription, SurfaceAnchor } from "@arcue/scene";
import type { CommentOverlay, ScreenshotOptions, ToolId, Viewport } from "../src/index";
import { createViewport } from "../src/index";
import { buildCreature } from "./creature";
import { albedoSpread, changedShare, modelPixels } from "./pixels";
import type { SampleName } from "./samples";
import { importSample, isSampleName, SAMPLES } from "./samples";
import type { TextureAgreement } from "./texture-check";
import { textureAgreement } from "./texture-check";

/** What the page exposes to the Playwright checks in verify.ts. */
export interface Harness {
  viewport: Viewport;
  scene: SceneDescription;
  overlays: CommentOverlay[];
  events: {
    pinPlaced: SurfaceAnchor[];
    regionPainted: { overlayId: string | null; anchor: RegionAnchor | null }[];
    hover: (SurfaceAnchor | null)[];
    time: { seconds: number; playing: boolean }[];
    cameraChange: number;
    emptyClicked: number;
    overlayClicked: string[];
    contextLost: number;
    contextRestored: number;
  };
  /** WebGL draw calls since the page loaded, across the view and its ID pass. */
  draws(): number;
  setOverlays(overlays: CommentOverlay[]): void;
  screenshotBase64(options: ScreenshotOptions): Promise<string>;
  buildCreature(skin: boolean): SceneDescription;
  /** Imports a sample FBX file through the FBX importer, shows it framed in the rest pose and makes it `scene`. */
  loadSample(name: SampleName): Promise<SceneDescription>;
  /** Shows a scene, framed in the rest pose, and makes it `scene`. */
  showScene(scene: SceneDescription): Promise<void>;
  modelPixels(shot: string, background: string): Promise<number>;
  albedoSpread(lit: string, clay: string, background: string): Promise<number>;
  changedShare(first: string, second: string): Promise<number>;
  /** How well the first mesh's base color texture matches the view, for a textured `scene`. */
  textureAgreement(): Promise<TextureAgreement>;
}

declare global {
  interface Window {
    harness?: Harness;
  }
}

let drawCount = 0;
for (const name of ["drawArrays", "drawElements", "drawArraysInstanced", "drawElementsInstanced"] as const) {
  const prototype = WebGL2RenderingContext.prototype;
  const original = prototype[name] as (...args: unknown[]) => void;
  Object.defineProperty(prototype, name, {
    value(this: WebGL2RenderingContext, ...args: unknown[]) {
      drawCount++;
      return original.apply(this, args);
    },
  });
}

async function skinTexture(): Promise<Uint8Array> {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (!context) return new Uint8Array();
  context.fillStyle = "#c9b79c";
  context.fillRect(0, 0, 256, 256);
  for (let band = 0; band < 12; band++) {
    context.fillStyle = band % 2 === 0 ? "#b39b7a" : "#d8c7aa";
    context.fillRect(0, band * 21.3, 256, 10);
  }
  context.fillStyle = "#8a6f52";
  for (let spot = 0; spot < 40; spot++) {
    context.beginPath();
    context.arc((spot * 53) % 256, (spot * 97) % 256, 4 + (spot % 5), 0, Math.PI * 2);
    context.fill();
  }
  return pngBytes(canvas);
}

/** A disc on a transparent square, so the badge's corners are cut out. */
async function badgeTexture(): Promise<Uint8Array> {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (!context) return new Uint8Array();
  context.fillStyle = "#c4643c";
  context.beginPath();
  context.arc(64, 64, 52, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#e8c070";
  context.beginPath();
  context.arc(64, 64, 26, 0, Math.PI * 2);
  context.fill();
  return pngBytes(canvas);
}

async function pngBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  return new Uint8Array(blob ? await blob.arrayBuffer() : new ArrayBuffer(0));
}

async function main(): Promise<void> {
  const container = document.getElementById("view");
  if (!container) return;
  const viewport = createViewport({ container });
  const detail = Number(new URLSearchParams(location.search).get("detail") ?? 1) || 1;
  const textures = { skin: await skinTexture(), badge: await badgeTexture() };
  const creature = buildCreature(textures, detail);
  let overlays: CommentOverlay[] = [];
  let nextId = 1;
  const events: Harness["events"] = {
    pinPlaced: [],
    regionPainted: [],
    hover: [],
    time: [],
    cameraChange: 0,
    emptyClicked: 0,
    overlayClicked: [],
    contextLost: 0,
    contextRestored: 0,
  };
  const status = document.getElementById("status");
  const show = (text: string) => {
    if (status) status.textContent = text;
  };
  const setOverlays = (next: CommentOverlay[]) => {
    overlays = next.map((overlay, index) => ({
      ...overlay,
      number: overlay.state === "draft" ? index + 1 : overlay.number,
    }));
    viewport.setOverlays(overlays);
    if (window.harness) window.harness.overlays = overlays;
  };
  const select = (id: string | null) =>
    setOverlays(overlays.map((overlay) => ({ ...overlay, selected: overlay.id === id })));

  viewport.on("pinPlaced", ({ anchor }) => {
    events.pinPlaced.push(anchor);
    const id = `c${nextId++}`;
    setOverlays([
      ...overlays.map((overlay) => ({ ...overlay, selected: false })),
      { id, number: null, state: "draft", anchor, selected: true },
    ]);
    show(`pin on ${anchor.mesh} ${anchor.vertices.join(",")}`);
  });
  viewport.on("regionPainted", (event) => {
    events.regionPainted.push(event);
    const { overlayId, anchor } = event;
    if (overlayId === null) {
      if (!anchor) return;
      const id = `c${nextId++}`;
      setOverlays([
        ...overlays.map((overlay) => ({ ...overlay, selected: false })),
        { id, number: null, state: "draft", anchor, selected: true },
      ]);
    } else if (anchor) {
      setOverlays(overlays.map((overlay) => (overlay.id === overlayId ? { ...overlay, anchor } : overlay)));
    } else {
      setOverlays(overlays.filter((overlay) => overlay.id !== overlayId));
    }
    show(anchor ? `region ${anchor.triangles.length} ranges` : "region erased");
  });
  viewport.on("hover", ({ anchor }) => {
    events.hover.push(anchor);
  });
  viewport.on("time", (time) => {
    events.time.push(time);
    if (events.time.length > 2000) events.time.splice(0, 1000);
  });
  viewport.on("cameraChange", () => {
    events.cameraChange++;
  });
  viewport.on("contextLost", () => {
    events.contextLost++;
  });
  viewport.on("contextRestored", () => {
    events.contextRestored++;
  });
  viewport.on("emptyClicked", () => {
    events.emptyClicked++;
    select(null);
  });
  viewport.on("overlayClicked", ({ id }) => {
    events.overlayClicked.push(id);
    select(id);
  });

  const clipSelect = document.getElementById("clip");
  if (clipSelect instanceof HTMLSelectElement) {
    clipSelect.addEventListener("change", () => viewport.setClip(clipSelect.value === "" ? null : clipSelect.value));
  }
  const listClips = (scene: SceneDescription) => {
    if (!(clipSelect instanceof HTMLSelectElement)) return;
    clipSelect.replaceChildren(new Option("Rest pose", ""));
    for (const clip of scene.clips) clipSelect.append(new Option(clip.displayName, clip.name));
  };
  const showScene = async (scene: SceneDescription) => {
    setOverlays([]);
    viewport.setClip(null);
    await viewport.setScene(scene);
    viewport.frame(null);
    listClips(scene);
    if (window.harness) window.harness.scene = scene;
  };
  const modelSelect = document.getElementById("model");
  const loadSample = async (name: SampleName) => {
    if (modelSelect instanceof HTMLSelectElement) modelSelect.value = name;
    show(`importing ${name}.fbx`);
    const scene = await importSample(name);
    await showScene(scene);
    show(`${name}.fbx`);
    return scene;
  };
  if (modelSelect instanceof HTMLSelectElement) {
    modelSelect.append(new Option("Creature", ""));
    for (const name of Object.keys(SAMPLES)) modelSelect.append(new Option(`${name}.fbx`, name));
    modelSelect.addEventListener("change", () => {
      const name = modelSelect.value;
      void (isSampleName(name) ? loadSample(name) : showScene(creature));
    });
  }
  let playing = false;
  viewport.on("time", (time) => {
    playing = time.playing;
    const play = document.getElementById("play");
    if (play) play.textContent = playing ? "Pause" : "Play";
  });
  document.getElementById("play")?.addEventListener("click", () => viewport.setPlaying(!playing));
  document.getElementById("frame")?.addEventListener("click", () => viewport.frame(null, { animate: true }));
  let skeleton = false;
  document.getElementById("skeleton")?.addEventListener("click", () => {
    skeleton = !skeleton;
    viewport.setSkeletonVisible(skeleton);
  });
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-tool]")) {
    button.addEventListener("click", () => viewport.setTool(button.dataset.tool as ToolId));
  }
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-mode]")) {
    button.addEventListener("click", () => viewport.setDisplayMode(button.dataset.mode as DisplayMode));
  }

  window.harness = {
    viewport,
    scene: creature,
    overlays,
    events,
    draws: () => drawCount,
    setOverlays,
    screenshotBase64: async (options) => {
      const bytes = await viewport.screenshot(options);
      let binary = "";
      for (const byte of bytes) binary += String.fromCharCode(byte);
      return btoa(binary);
    },
    buildCreature: (skin) => buildCreature(skin ? textures : { skin: null, badge: null }, detail),
    loadSample,
    showScene,
    modelPixels,
    albedoSpread,
    changedShare,
    textureAgreement: () => textureAgreement(viewport, window.harness?.scene ?? creature),
  };
  const requested = new URLSearchParams(location.search).get("model") ?? "";
  if (isSampleName(requested)) {
    await loadSample(requested);
  } else {
    await viewport.setScene(creature);
    listClips(creature);
  }
  document.body.dataset.ready = "true";
}

void main();
