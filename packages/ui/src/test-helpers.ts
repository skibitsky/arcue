import type { AssetInspection, ComputedContext, TimeSelection } from "@arcue/protocol";
import type {
  CameraAnchor,
  Material,
  Mesh,
  PartView,
  SceneDescription,
  SceneNode,
  ScenePart,
  SpatialAnchor,
  SurfaceAnchor,
} from "@arcue/scene";
import { importWarning } from "@arcue/scene";
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
import type { FileHost } from "./store/view-files";
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
  parts: PartView | null = null;
  camera: CameraAnchor = { position: [0, 1, 4], target: [0, 1, 0], up: [0, 1, 0], fov: 30 };
  overlays: readonly CommentOverlay[] = [];
  highlighted: readonly string[] | null = null;
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
  setPartView(view: PartView) {
    this.parts = structuredClone(view);
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
  setHighlight(meshes: readonly string[] | null) {
    this.highlighted = meshes ? [...meshes] : null;
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

type SceneChange = (scene: SceneDescription) => SceneDescription;

interface AddedNode {
  name: string;
  path: string;
  parent: number;
  /** Triangles of the node's mesh; a node without it has no mesh. */
  triangles?: number;
  /** Rest-pose height of the mesh's top, from the ground. */
  top?: number;
}

/** The scene with nodes appended, each with its own mesh. Returns the scene and the new nodes' and meshes' indices. */
function withNodes(scene: SceneDescription, added: readonly AddedNode[]) {
  const template = scene.meshes[0];
  if (!template) throw new Error("The scene has no mesh to copy.");
  const nodes: SceneNode[] = [...scene.nodes];
  const meshes: Mesh[] = [...scene.meshes];
  const indices = added.map((entry) => {
    let mesh: number | null = null;
    if (entry.triangles !== undefined) {
      meshes.push({
        ...template,
        name: entry.name,
        indices: new Uint32Array(entry.triangles * 3),
        restPositions: Float32Array.of(0, 0, 0, 0, entry.top ?? 1, 0, 0.1, 0, 0),
      });
      mesh = meshes.length - 1;
    }
    nodes.push({
      name: entry.name,
      path: entry.path,
      parent: entry.parent,
      kind: mesh === null ? "empty" : "mesh",
      translation: [0, 0, 0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
      mesh,
    });
    return { node: nodes.length - 1, mesh };
  });
  return { scene: { ...scene, nodes, meshes }, indices };
}

function partOf(id: string, name: string, node: number, meshes: (number | null)[], extra: Partial<ScenePart> = {}) {
  return {
    id,
    name,
    role: "model" as const,
    node,
    levels: meshes.map((mesh, level) => ({ level, meshes: mesh === null ? [] : [mesh] })),
    ...extra,
  };
}

/** The node index of a Stone Resonator bone, "Bone_1" to "Bone_62". */
export function stoneBone(scene: SceneDescription, name: string): number {
  return scene.nodes.findIndex((node) => node.name === name && node.kind === "bone");
}

/**
 * The Stone Resonator composed like the beetle: "beetle-shells.fbx" attaches ShellRound and ShellSpiked to Bone_1,
 * ShellSpiked hidden by default, and the model has a collision helper. With `split`, ShellSpiked hangs on Bone_2;
 * with `set`, "props.fbx" adds a Crate set piece.
 */
export function composedStone(options: { split?: boolean; set?: boolean } = {}): SceneChange {
  return (base) => {
    const bone1 = stoneBone(base, "Bone_1");
    const bone2 = stoneBone(base, "Bone_2");
    const { scene, indices } = withNodes(base, [
      { name: "UCX_Stone", path: "StoneResonator/UCX_Stone", parent: 0, triangles: 12, top: 2.4 },
      { name: "ShellRound", path: "beetle-shells.fbx//ShellRound", parent: bone1, triangles: 1_280, top: 2.2 },
      {
        name: "ShellSpiked",
        path: "beetle-shells.fbx//ShellSpiked",
        parent: options.split ? bone2 : bone1,
        triangles: 1_476,
      },
      ...(options.set ? [{ name: "Crate", path: "props.fbx//Crate", parent: -1, triangles: 756 }] : []),
    ]);
    const [collision, round, spiked, crate] = indices;
    if (!collision || !round || !spiked) throw new Error("The nodes were not added.");
    return {
      ...scene,
      parts: [
        ...scene.parts,
        { ...partOf("StoneResonator/UCX_Stone", "UCX_Stone", collision.node, [collision.mesh]), role: "collision" },
        partOf("beetle-shells.fbx//ShellRound", "ShellRound", round.node, [round.mesh]),
        partOf("beetle-shells.fbx//ShellSpiked", "ShellSpiked", spiked.node, [spiked.mesh], { hiddenByDefault: true }),
        ...(crate ? [partOf("props.fbx//Crate", "Crate", crate.node, [crate.mesh])] : []),
      ],
    };
  };
}

/** The Stone Resonator with LOD1 and LOD2 of its body, and a Pebble beside it without LODs. */
export function lodStone(base: SceneDescription): SceneDescription {
  const { scene, indices } = withNodes(base, [
    { name: "StoneResonator_LOD1", path: "StoneResonator/StoneResonator_LOD1", parent: 0, triangles: 5_360 },
    { name: "StoneResonator_LOD2", path: "StoneResonator/StoneResonator_LOD2", parent: 0, triangles: 2_680 },
    { name: "Pebble", path: "StoneResonator/Pebble", parent: 0, triangles: 200, top: 0.3 },
  ]);
  const [lod1, lod2, pebble] = indices;
  const body = scene.parts[0];
  if (!lod1 || !lod2 || !pebble || !body) throw new Error("The nodes were not added.");
  return {
    ...scene,
    parts: [
      {
        ...body,
        levels: [...body.levels, { level: 1, meshes: [lod1.mesh ?? 0] }, { level: 2, meshes: [lod2.mesh ?? 0] }],
      },
      partOf("StoneResonator/Pebble", "Pebble", pebble.node, [pebble.mesh]),
    ],
  };
}

export function stoneCatalog(path: string, change: SceneChange = (scene) => scene) {
  if (path !== STONE_RESONATOR_PATH) return null;
  return { scene: change(fakeScene(STONE_RESONATOR)), review: stoneResonatorReview(NOW), version: STONE_VERSION };
}

export async function flush(times = 6): Promise<void> {
  for (let index = 0; index < times; index++) await new Promise((resolve) => setTimeout(resolve, 0));
}

interface SetupOptions {
  clipboard?: "ok" | "blocked";
  /** Changes the Stone Resonator's scene before the fake core serves it. */
  scene?: SceneChange;
  /** The host's open dialog and dropped files. */
  files?: FileHost;
  /** What `asset.inspect` reports for a path. */
  inspect?: (path: string) => AssetInspection | null;
}

export function setup(options: SetupOptions = {}) {
  const timers = new ManualTimers();
  const client = new FakeCoreClient({
    catalog: (path) => stoneCatalog(path, options.scene),
    now: () => NOW,
    ...(options.inspect ? { inspect: options.inspect } : {}),
  });
  const copied: string[] = [];
  const store = createWorkspaceStore({
    client,
    setTimer: timers.setTimer,
    writeClipboard: async (text) => {
      if (options.clipboard === "blocked") throw new Error("Blocked.");
      copied.push(text);
    },
    ...(options.files ? { files: options.files } : {}),
  });
  client.connectWindow(store.handleRequest);
  store.start();
  return { client, store, timers, copied };
}

/** Opens the Stone Resonator at Charge frame 34 with a test viewport attached. */
export async function openStone(options: SetupOptions = {}) {
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

function material(name: string): Material {
  return {
    name,
    baseColor: [0.8, 0.8, 0.8, 1],
    baseColorTexture: null,
    metallic: 0,
    roughness: 0.5,
    metallicRoughnessTexture: null,
    roughnessTexture: null,
    metalnessTexture: null,
    normalTexture: null,
    normalScale: 1,
    occlusionTexture: null,
    emissive: [0, 0, 0],
    emissiveTexture: null,
    alphaMode: "opaque",
    alphaCutoff: 0.5,
    doubleSided: false,
  };
}

/** The Stone Resonator with one material and a warning of each kind the list treats differently. */
export function withWarnings(scene: SceneDescription): SceneDescription {
  return {
    ...scene,
    materials: [material("Stone")],
    source: {
      ...scene.source,
      warnings: [
        importWarning("root-scale", { kind: "node", name: "Armature" }, "Root scale of 100 on Armature"),
        importWarning(
          "texture-not-used",
          { kind: "texture", name: "Stone_BaseColor.png" },
          "Texture not used: Stone_BaseColor.png",
          undefined,
          { detail: "Stored path: Textures/Stone_BaseColor.png", foundPath: "Textures/Stone_BaseColor.png" },
        ),
        importWarning(
          "animation-bones-missing",
          { kind: "clip", name: "Armature|Run" },
          "Run animates bones the model lacks: Tail",
        ),
        importWarning(
          "texture-not-found",
          { kind: "texture", name: "Eyes.png" },
          "Texture not found: Eyes.png",
          undefined,
          {
            detail: "Stored path: C:/art/Eyes.png, used as base color of Stone",
            materials: ["Stone"],
            uses: [{ material: "Stone", slot: "baseColor" }],
          },
        ),
      ],
    },
  };
}
