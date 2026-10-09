import type { CommandInput, ComputedContext, CoreClient, IncomingRequest, MemoryEndpoint, Peer } from "@arcue/protocol";
import { createMemoryChannel, createPeer, createRemoteClient } from "@arcue/protocol";
import type {
  CameraAnchor,
  Clip,
  Importer,
  Mesh,
  SceneDescription,
  SceneNode,
  SurfaceAnchor,
  Vec3,
} from "@arcue/scene";
import {
  boundsOfPoints,
  buildNodePaths,
  clipNames,
  displayNames,
  SCENE_SPACE,
  topologyFingerprint,
} from "@arcue/scene";
import type { ArcueCoreOptions } from "./core";
import { ArcueCore } from "./core";
import { versionIdOf } from "./hash";
import { ManualClock } from "./manual-clock";
import { MemoryPlatform } from "./memory-platform";

/** A square grid of `grid` × `grid` vertices on the XY plane, `size` meters wide, from `offset`. */
export interface FakeMesh {
  name: string;
  grid: number;
  size?: number;
  offset?: Vec3;
  /** Splits each cell along the other diagonal, which changes the topology but not the vertices. */
  flip?: boolean;
}

/** What the fake importer reads from a file: the file's text is this object as JSON. */
export interface FakeAssetSpec {
  meshes: FakeMesh[];
  clips?: { name: string; frames: number; fps?: number }[];
  fps?: number;
  exporter?: { name: string; version: string | null } | null;
  /** Makes the import fail with this message. */
  fail?: string;
  /** Paths the importer asks the core for; the ones it gets become textures. */
  textures?: string[];
}

export function fakeAsset(spec: FakeAssetSpec): string {
  return JSON.stringify(spec);
}

export const fakeImporter: Importer = {
  format: "fbx",
  extensions: [".fbx"],
  async import({ bytes, readFile }) {
    const spec = JSON.parse(new TextDecoder().decode(bytes)) as FakeAssetSpec;
    if (spec.fail) throw new Error(spec.fail);
    const scene = fakeScene(spec);
    for (const path of spec.textures ?? []) {
      const texture = await readFile(path);
      if (texture) scene.textures.push({ name: path, mimeType: "image/png", bytes: texture });
    }
    return scene;
  },
};

export function fakeScene(spec: FakeAssetSpec): SceneDescription {
  const fps = spec.fps ?? 30;
  const rawNodes = [{ name: "Hero", parent: -1 }, ...spec.meshes.map((mesh) => ({ name: mesh.name, parent: 0 }))];
  const paths = buildNodePaths(rawNodes);
  const meshes = spec.meshes.map(gridMesh);
  const nodes: SceneNode[] = rawNodes.map((node, index) => ({
    name: node.name,
    path: paths[index] ?? node.name,
    parent: node.parent,
    kind: index === 0 ? "empty" : "mesh",
    translation: [0, 0, 0],
    rotation: [0, 0, 0, 1],
    scale: [1, 1, 1],
    mesh: index === 0 ? null : index - 1,
  }));
  const rawClips = spec.clips ?? [];
  const names = clipNames(rawClips.map((clip) => clip.name));
  const display = displayNames(names);
  const clips: Clip[] = rawClips.map((clip, index) => {
    const clipFps = clip.fps ?? fps;
    return {
      name: names[index] ?? clip.name,
      displayName: display[index] ?? clip.name,
      fps: clipFps,
      duration: (clip.frames - 1) / clipFps,
      frameCount: clip.frames,
      tracks: [],
      keyTimes: new Float32Array(),
      keyedEveryFrame: false,
    };
  });
  return {
    source: {
      format: "fbx",
      exporter: spec.exporter === undefined ? { name: "Blender", version: "5.2" } : spec.exporter,
      fps,
      originalSpace: SCENE_SPACE,
      conversion: { scale: 1, rotation: [0, 0, 0, 1] },
      warnings: [],
    },
    nodes,
    meshes,
    skeletons: [],
    materials: [],
    textures: [],
    clips,
    bounds: boundsOfPoints(meshes.map((mesh) => mesh.restPositions)),
  };
}

function gridMesh({ name, grid, size = 2, offset = [0, 0, 0], flip = false }: FakeMesh): Mesh {
  const count = grid * grid;
  const positions = new Float32Array(count * 3);
  for (let row = 0; row < grid; row++) {
    for (let column = 0; column < grid; column++) {
      const vertex = row * grid + column;
      positions[vertex * 3] = offset[0] + (column * size) / (grid - 1);
      positions[vertex * 3 + 1] = offset[1] + (row * size) / (grid - 1);
      positions[vertex * 3 + 2] = offset[2];
    }
  }
  const indices: number[] = [];
  for (let row = 0; row + 1 < grid; row++) {
    for (let column = 0; column + 1 < grid; column++) {
      const corner = row * grid + column;
      if (flip) indices.push(corner, corner + 1, corner + grid + 1, corner, corner + grid + 1, corner + grid);
      else indices.push(corner, corner + 1, corner + grid, corner + 1, corner + grid + 1, corner + grid);
    }
  }
  const sourceVertex = Uint32Array.from({ length: count }, (_, index) => index);
  const triangles = Uint32Array.from(indices);
  return {
    name,
    geometryName: name,
    positions,
    normals: new Float32Array(count * 3),
    uvs: [],
    colors: null,
    skeleton: null,
    bindMatrix: null,
    joints: null,
    weights: null,
    indices: triangles,
    groups: [],
    morphTargets: [],
    sourceVertex,
    sourceVertexCount: count,
    restPositions: positions.slice(),
    skinWeights: null,
    topology: topologyFingerprint({ indices: triangles, sourceVertex, sourceVertexCount: count }),
  };
}

/** A window on a memory channel: it answers the core's view commands and calls the core as a window does. */
export class FakeWindow {
  readonly connection: string;
  readonly peer: Peer;
  readonly client: CoreClient;
  readonly requests: IncomingRequest[] = [];
  /** Answers the core's requests; by default with nothing. */
  respond: (request: IncomingRequest) => unknown = () => undefined;
  readonly #endpoint: MemoryEndpoint;

  constructor(core: ArcueCore, connection: string) {
    const [coreSide, windowSide] = createMemoryChannel();
    this.connection = connection;
    this.#endpoint = windowSide;
    this.peer = createPeer(windowSide, {
      handleRequest: (request) => {
        this.requests.push(request);
        return this.respond(request);
      },
    });
    this.client = createRemoteClient(this.peer);
    core.connect(coreSide, { connection, caller: "window" });
  }

  get requestNames(): string[] {
    return this.requests.map((request) => request.name);
  }

  close(): void {
    this.#endpoint.close();
  }
}

/**
 * Records how each file was written, so tests can check that review data is only written atomically, and fails the
 * writes or removals that `fail` picks.
 */
export class RecordingPlatform extends MemoryPlatform {
  readonly writes: { path: string; atomic: boolean }[] = [];
  fail: ((operation: "write" | "remove", path: string) => boolean) | null = null;

  override async writeFile(path: string, data: Uint8Array | string): Promise<void> {
    this.#check("write", path);
    this.writes.push({ path, atomic: false });
    await super.writeFile(path, data);
  }

  override async writeFileAtomic(path: string, data: Uint8Array | string): Promise<void> {
    this.#check("write", path);
    this.writes.push({ path, atomic: true });
    await super.writeFileAtomic(path, data);
  }

  override async remove(path: string): Promise<void> {
    this.#check("remove", path);
    await super.remove(path);
  }

  #check(operation: "write" | "remove", path: string): void {
    if (this.fail?.(operation, path)) throw new Error(`The disk refused to ${operation} ${path}.`);
  }
}

export interface TestCore {
  core: ArcueCore;
  platform: RecordingPlatform;
  clock: ManualClock;
  window: FakeWindow;
  /** Errors from background work, which the core reports through `onError`. */
  errors: unknown[];
}

export async function startTestCore(
  files: Record<string, string | Uint8Array>,
  options: { clipboard?: boolean; core?: Partial<ArcueCoreOptions> } = {},
): Promise<TestCore> {
  const clock = new ManualClock(Date.UTC(2026, 9, 8, 14, 2));
  const platform = new RecordingPlatform({
    files,
    clock,
    importers: [fakeImporter],
    clipboard: options.clipboard ? "available" : "unavailable",
  });
  const errors: unknown[] = [];
  const core = await ArcueCore.start({
    platform,
    formatClockTime: (ms) => new Date(ms).toISOString().slice(11, 16),
    onError: (error) => errors.push(error),
    ...options.core,
  });
  const window = new FakeWindow(core, "window-1");
  return { core, platform, clock, window, errors };
}

/** Lets queued microtasks, such as file watch notifications, run. */
export async function flush(): Promise<void> {
  for (let turn = 0; turn < 20; turn++) await Promise.resolve();
}

export const HERO = "/work/game/Assets/Art/Hero.fbx";
export const HERO_REVIEW = "/work/game/.arcue/reviews/Assets/Art/Hero.fbx";

export const heroSpec: FakeAssetSpec = {
  meshes: [{ name: "Body", grid: 3 }],
  clips: [
    { name: "Armature|Charge", frames: 61 },
    { name: "Armature|Run", frames: 31 },
  ],
  fps: 60,
};

/** The version id of the hero file as `heroSpec` writes it. */
export const HERO_VERSION = versionIdOf(new TextEncoder().encode(fakeAsset(heroSpec)));

export function heroFiles(spec: FakeAssetSpec = heroSpec): Record<string, string> {
  return { "/work/game/.git/HEAD": "ref: refs/heads/main", [HERO]: fakeAsset(spec) };
}

/** Opens an asset from the test window and waits until it has loaded. */
export async function openAsset(test: TestCore, path = HERO): Promise<string> {
  const { assetId } = await test.window.client.execute("asset.open", { path });
  await test.core.idle();
  return assetId;
}

export const camera: CameraAnchor = { position: [0, 1, 3], target: [0, 1, 0], up: [0, 1, 0], fov: 30 };

export const pinContext: ComputedContext = {
  vertexCount: 3,
  bones: [
    { name: "Head", share: 0.9 },
    { name: "Neck", share: 0.1 },
  ],
  centroid: { rest: [1.25, 1.25, 0], posed: [1.25, 1.5, 0.25] },
  joints: [{ name: "Head", path: "Armature/Head", position: [1, 1.75, 0] }],
  viewLabel: "front",
};

export const pin: SurfaceAnchor = {
  kind: "surface",
  mesh: "Hero/Body",
  vertices: [4, 5, 7],
  weights: [0.5, 0.25, 0.25],
};

export const png = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 1);

/** A draft comment pinned to the hero's body at frame 34 of Charge. */
export function pinComment(
  assetId: string,
  text = "The thumb bends outward.",
  version = HERO_VERSION,
): CommandInput<"comment.create"> {
  return {
    assetId,
    text,
    version,
    time: { kind: "frame", clip: "Armature|Charge", frame: 34 },
    target: pin,
    camera,
    context: pinContext,
    screenshot: png,
  };
}

/** A draft comment on the whole model, without a surface target or screenshot. */
export function looseComment(
  assetId: string,
  text = "Textures look washed out.",
  version = HERO_VERSION,
): CommandInput<"comment.create"> {
  return {
    assetId,
    text,
    version,
    time: { kind: "none" },
    target: null,
    camera,
    context: { vertexCount: 0, bones: [], centroid: null, joints: [], viewLabel: "front" },
    screenshot: null,
  };
}

export async function readJson(platform: MemoryPlatform, path: string): Promise<unknown> {
  return JSON.parse(await platform.readText(path));
}
