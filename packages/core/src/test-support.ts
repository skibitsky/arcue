import type { CommandInput, ComputedContext, CoreClient, IncomingRequest, MemoryEndpoint, Peer } from "@arcue/protocol";
import { ArcueError, createMemoryChannel, createPeer, createRemoteClient, serveImportWorker } from "@arcue/protocol";
import type {
  CameraAnchor,
  Clip,
  Importer,
  ImportWarning,
  Material,
  Mesh,
  SceneDescription,
  SceneNode,
  SurfaceAnchor,
  Vec3,
} from "@arcue/scene";
import {
  buildNodePaths,
  clipNames,
  defaultViewBounds,
  describeParts,
  displayNames,
  SCENE_SPACE,
  topologyFingerprint,
} from "@arcue/scene";
import { expect, onTestFinished } from "vitest";
import type { ArcueCoreOptions } from "./core";
import { ArcueCore } from "./core";
import { versionIdOf } from "./hash";
import { ManualClock } from "./manual-clock";
import type { MemoryPlatformOptions } from "./memory-platform";
import { MemoryPlatform } from "./memory-platform";
import { joinPath } from "./paths";
import type { ImportWorker, Platform, Unlock } from "./platform";
import { REVIEWS_LOCK, SETTINGS_LOCK } from "./review-store";
import { BROKEN_SETTINGS_FILE } from "./settings";

/** A square grid of `grid` × `grid` vertices on the XY plane, `size` meters wide, from `offset`. */
export interface FakeMesh {
  name: string;
  grid: number;
  size?: number;
  offset?: Vec3;
  /** Splits each cell along the other diagonal, which changes the topology but not the vertices. */
  flip?: boolean;
  /** The bone the mesh's node hangs under, by name; the root by default. */
  parent?: string;
  /** Skins the mesh to these bones, by name. */
  skin?: string[];
  /** Index into the spec's materials. */
  material?: number;
  /** Hides the mesh's part until someone shows it, as Blender's eye does. */
  hidden?: boolean;
}

/** A bone under the root or another bone, by name. */
export interface FakeBone {
  name: string;
  parent?: string;
  at?: Vec3;
}

/** What the fake importer reads from a file: the file's text is this object as JSON. */
export interface FakeAssetSpec {
  meshes: FakeMesh[];
  bones?: FakeBone[];
  materials?: string[];
  /** Each clip turns the bones it names, by name. */
  clips?: { name: string; frames: number; fps?: number; bones?: string[]; sourceStartFrame?: number }[];
  fps?: number;
  exporter?: { name: string; version: string | null } | null;
  /** Makes the import fail with this message. */
  fail?: string;
  /** Paths the importer asks the core for; the ones it gets become textures. */
  textures?: string[];
  foundTextures?: string[];
  /** The import warnings the scene reports. */
  warnings?: ImportWarning[];
}

export function fakeAsset(spec: FakeAssetSpec): string {
  return JSON.stringify(spec);
}

export const fakeImporter: Importer = {
  format: "fbx",
  extensions: [".fbx"],
  async import({ bytes, readFile, findFile }) {
    const spec = JSON.parse(new TextDecoder().decode(bytes)) as FakeAssetSpec;
    if (spec.fail) throw new Error(spec.fail);
    const scene = fakeScene(spec);
    for (const path of spec.textures ?? []) {
      const texture = await readFile(path);
      if (texture)
        scene.textures.push({ name: path, mimeType: "image/png", bytes: texture, storedPath: path, foundPath: path });
    }
    for (const path of spec.foundTextures ?? []) {
      const found = await findFile(path);
      if (found)
        scene.textures.push({
          name: path,
          mimeType: "image/png",
          bytes: found.bytes,
          storedPath: path,
          foundPath: found.path,
        });
    }
    return scene;
  },
};

export function fakeScene(spec: FakeAssetSpec): SceneDescription {
  const fps = spec.fps ?? 30;
  const bones = spec.bones ?? [];
  const names = ["Hero", ...bones.map((bone) => bone.name)];
  const indexOf = (name: string | undefined) => (name === undefined ? 0 : Math.max(0, names.indexOf(name)));
  const rawNodes = [
    { name: "Hero", parent: -1 },
    ...bones.map((bone) => ({ name: bone.name, parent: indexOf(bone.parent) })),
    ...spec.meshes.map((mesh) => ({ name: mesh.name, parent: indexOf(mesh.parent) })),
  ];
  const paths = buildNodePaths(rawNodes);
  const skeletons: SceneDescription["skeletons"] = [];
  const meshes = spec.meshes.map((entry) => {
    const mesh = gridMesh(entry);
    if (entry.material !== undefined)
      mesh.groups = [{ start: 0, triangleCount: mesh.indices.length / 3, material: entry.material }];
    if (entry.skin) {
      skeletons.push({
        joints: entry.skin.map(indexOf),
        inverseBindMatrices: new Float32Array(16 * entry.skin.length),
      });
      const vertices = mesh.positions.length / 3;
      mesh.skeleton = skeletons.length - 1;
      mesh.bindMatrix = Float32Array.of(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
      mesh.joints = new Uint16Array(vertices * 4);
      mesh.weights = new Float32Array(vertices * 4).map((_, at) => (at % 4 === 0 ? 1 : 0));
    }
    return mesh;
  });
  const nodes: SceneNode[] = rawNodes.map((node, index) => {
    const bone = index > 0 && index <= bones.length ? bones[index - 1] : undefined;
    return {
      name: node.name,
      path: paths[index] ?? node.name,
      parent: node.parent,
      kind: index === 0 ? "empty" : bone ? "bone" : "mesh",
      translation: bone?.at ?? [0, 0, 0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
      mesh: index > bones.length ? index - bones.length - 1 : null,
    };
  });
  const rawClips = spec.clips ?? [];
  const clipIds = clipNames(rawClips.map((clip) => clip.name));
  const display = displayNames(clipIds);
  const clips: Clip[] = rawClips.map((clip, index) => {
    const clipFps = clip.fps ?? fps;
    return {
      name: clipIds[index] ?? clip.name,
      displayName: display[index] ?? clip.name,
      fps: clipFps,
      duration: (clip.frames - 1) / clipFps,
      frameCount: clip.frames,
      tracks: (clip.bones ?? []).map((name) => ({
        node: indexOf(name),
        property: "rotation",
        interpolation: "linear",
        times: Float32Array.of(0, (clip.frames - 1) / clipFps),
        values: Float32Array.of(0, 0, 0, 1, 0, 1, 0, 0),
      })),
      keyTimes: new Float32Array(),
      keyedEveryFrame: false,
      ...(clip.sourceStartFrame === undefined ? {} : { sourceStartFrame: clip.sourceStartFrame }),
    };
  });
  const hiddenMeshes = new Set(spec.meshes.flatMap((mesh, index) => (mesh.hidden ? [index] : [])));
  const parts = describeParts(nodes).map((part) =>
    part.levels.some((level) => level.meshes.some((mesh) => hiddenMeshes.has(mesh)))
      ? { ...part, hiddenByDefault: true }
      : part,
  );
  return {
    source: {
      format: "fbx",
      exporter: spec.exporter === undefined ? { name: "Blender", version: "5.2" } : spec.exporter,
      fps,
      originalSpace: SCENE_SPACE,
      conversion: { scale: 1, rotation: [0, 0, 0, 1] },
      warnings: spec.warnings ?? [],
    },
    nodes,
    meshes,
    skeletons,
    materials: (spec.materials ?? []).map(fakeMaterial),
    textures: [],
    clips,
    parts,
    bounds: defaultViewBounds(meshes, parts),
  };
}

function fakeMaterial(name: string): Material {
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

  /** A window with a view is the page of that agent session's view; with `browser`, a page `arcue serve` serves. */
  constructor(core: ArcueCore, connection: string, view?: string, { browser = false }: { browser?: boolean } = {}) {
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
    core.connect(coreSide, { connection, caller: "window", view, browser });
  }

  get requestNames(): string[] {
    return this.requests.map((request) => request.name);
  }

  close(): void {
    this.#endpoint.close();
  }
}

/** A change to files that `RecordingPlatform` reports to `beforeWrite` and in its `log`. */
export type WriteOp = "write" | "writeAtomic" | "remove" | "rename" | "removeEmptyFolder";

/** One change to files or locks, by the core that made it, or by the test itself for a null actor. */
export interface PlatformLogEntry {
  actor: string | null;
  op: WriteOp | "lock" | "unlock";
  /** The path changed, or for a lock its key. A rename logs both of its paths. */
  path: string;
  /** The keys of the locks the actor held at that moment. */
  held: string[];
}

/**
 * Records how each file was written, so tests can check that review data is only written atomically, and fails the
 * writes, removals or locks that `fail` picks. Each core of a test runs on its own `forCore` view, so the log tells
 * whose write it was and which locks that core held.
 */
export class RecordingPlatform extends MemoryPlatform {
  readonly writes: { path: string; atomic: boolean }[] = [];
  readonly log: PlatformLogEntry[] = [];
  /** The file names the import workers parsed, in order. */
  readonly parsed: string[];
  fail: ((operation: "write" | "remove" | "lock", path: string, actor: string | null) => boolean) | null = null;
  /** Runs before each file is read, so a test can change files at that moment or hold the read back. */
  beforeRead: ((path: string) => Promise<void> | void) | null = null;
  /** Runs before each change to files, so a test can hold it back; the actor is null for the test's own writes. */
  beforeWrite: ((path: string, op: WriteOp, actor: string | null) => Promise<void> | void) | null = null;
  readonly #held = new Map<string | null, Set<string>>();

  constructor(options: MemoryPlatformOptions = {}) {
    const parsed: string[] = [];
    super({ ...options, importers: options.importers && recording(options.importers, parsed) });
    this.parsed = parsed;
  }

  /**
   * The platform as one core of the test sees it: the same files, clock and locks, with its writes and locks logged as
   * the actor's. With `importers`, its import workers run those instead of the platform's, so a test can hold back one
   * core's parses.
   */
  forCore(actor: string, options: { importers?: readonly Importer[] } = {}): Platform {
    const importers = options.importers && recording(options.importers, this.parsed);
    return {
      appDataDir: this.appDataDir,
      clock: this.clock,
      readFile: (path) => this.readFile(path),
      readText: (path) => this.readText(path),
      writeFile: (path, data) => this.#writeFile(actor, path, data),
      writeFileAtomic: (path, data) => this.#writeFileAtomic(actor, path, data),
      exists: (path) => this.exists(path),
      stat: (path) => this.stat(path),
      mkdir: (path) => this.mkdir(path),
      list: (path) => this.list(path),
      remove: (path) => this.#remove(actor, path),
      removeEmptyFolder: (path) => this.#removeEmptyFolder(actor, path),
      rename: (from, to) => this.#rename(actor, from, to),
      watch: (path, listener) => this.watch(path, listener),
      findWorkspaceRoot: (path) => this.findWorkspaceRoot(path),
      lock: (folder, name) => this.#lock(actor, folder, name),
      startImportWorker: () => (importers ? inProcessWorker(importers) : this.startImportWorker()),
      writeClipboard: (text) => this.writeClipboard(text),
    };
  }

  override async readFile(path: string): Promise<Uint8Array> {
    await this.beforeRead?.(path);
    return super.readFile(path);
  }

  override async readText(path: string): Promise<string> {
    await this.beforeRead?.(path);
    return super.readText(path);
  }

  override writeFile(path: string, data: Uint8Array | string): Promise<void> {
    return this.#writeFile(null, path, data);
  }

  override writeFileAtomic(path: string, data: Uint8Array | string): Promise<void> {
    return this.#writeFileAtomic(null, path, data);
  }

  override remove(path: string): Promise<void> {
    return this.#remove(null, path);
  }

  override removeEmptyFolder(path: string): Promise<void> {
    return this.#removeEmptyFolder(null, path);
  }

  override rename(from: string, to: string): Promise<void> {
    return this.#rename(null, from, to);
  }

  override lock(folder: string, name: string): Promise<Unlock> {
    return this.#lock(null, folder, name);
  }

  async #writeFile(actor: string | null, path: string, data: Uint8Array | string): Promise<void> {
    await this.beforeWrite?.(path, "write", actor);
    this.#check("write", path, actor);
    this.writes.push({ path, atomic: false });
    this.#record(actor, "write", path);
    await super.writeFile(path, data);
  }

  async #writeFileAtomic(actor: string | null, path: string, data: Uint8Array | string): Promise<void> {
    await this.beforeWrite?.(path, "writeAtomic", actor);
    this.#check("write", path, actor);
    this.writes.push({ path, atomic: true });
    this.#record(actor, "writeAtomic", path);
    await super.writeFileAtomic(path, data);
  }

  async #remove(actor: string | null, path: string): Promise<void> {
    await this.beforeWrite?.(path, "remove", actor);
    this.#check("remove", path, actor);
    this.#record(actor, "remove", path);
    await super.remove(path);
  }

  async #removeEmptyFolder(actor: string | null, path: string): Promise<void> {
    await this.beforeWrite?.(path, "removeEmptyFolder", actor);
    this.#record(actor, "removeEmptyFolder", path);
    await super.removeEmptyFolder(path);
  }

  async #rename(actor: string | null, from: string, to: string): Promise<void> {
    await this.beforeWrite?.(from, "rename", actor);
    this.#record(actor, "rename", from);
    this.#record(actor, "rename", to);
    await super.rename(from, to);
  }

  async #lock(actor: string | null, folder: string, name: string): Promise<Unlock> {
    if (this.fail?.("lock", folder, actor)) {
      throw new ArcueError("forbidden", `Arcue cannot lock the ${name} of ${folder}: the test refused it.`);
    }
    const key = this.lockKey(folder, name);
    const unlock = await super.lock(folder, name);
    const held = this.#held.get(actor) ?? new Set<string>();
    this.#held.set(actor, held);
    held.add(key);
    this.#record(actor, "lock", key);
    let released = false;
    return async () => {
      if (released) return;
      released = true;
      held.delete(key);
      this.#record(actor, "unlock", key);
      await unlock();
    };
  }

  #record(actor: string | null, op: PlatformLogEntry["op"], path: string): void {
    this.log.push({ actor, op, path, held: [...(this.#held.get(actor) ?? [])] });
  }

  #check(operation: "write" | "remove", path: string, actor: string | null): void {
    if (this.fail?.(operation, path, actor)) throw new Error(`The disk refused to ${operation} ${path}.`);
  }
}

function recording(importers: readonly Importer[], parsed: string[]): Importer[] {
  return importers.map((importer) => ({
    ...importer,
    import: (request) => {
      parsed.push(request.fileName);
      return importer.import(request);
    },
  }));
}

function inProcessWorker(importers: readonly Importer[]): ImportWorker {
  const [coreSide, workerSide] = createMemoryChannel();
  serveImportWorker(workerSide, importers);
  return { endpoint: coreSide, terminate: () => coreSide.close() };
}

/**
 * The changes cores made under a reviews root or to the settings file without holding that root's or the settings'
 * lock. The test's own changes are never listed.
 */
export function unlockedWrites(platform: RecordingPlatform): PlatformLogEntry[] {
  return platform.log.filter((entry) => {
    if (entry.actor === null || entry.op === "lock" || entry.op === "unlock") return false;
    const key = lockFor(platform, entry.path);
    return key !== null && !entry.held.includes(key);
  });
}

/** The key of the lock a change of the path needs, or null for a path outside reviews and settings. */
function lockFor(platform: RecordingPlatform, path: string): string | null {
  const appData = platform.appDataDir;
  if (path === joinPath(appData, "settings.json") || path === joinPath(appData, BROKEN_SETTINGS_FILE)) {
    return platform.lockKey(appData, SETTINGS_LOCK);
  }
  if (path.startsWith(`${joinPath(appData, "reviews")}/`)) return platform.lockKey(appData, REVIEWS_LOCK);
  const arcue = /^(.*?)\/\.arcue(?:\/|$)/.exec(path);
  return arcue ? platform.lockKey(arcue[1] || "/", REVIEWS_LOCK) : null;
}

/** Holds back one file's parses until the test lets them go. */
export interface GatedImporter {
  importer: Importer;
  /** Makes parses of the file wait from now on, including one that starts later. */
  hold(fileName: string): void;
  /** Lets the file's waiting parses run, and the ones after them. */
  release(fileName: string): void;
}

export function gatedImporter(importer: Importer = fakeImporter): GatedImporter {
  const gates = new Map<string, PromiseWithResolvers<void>>();
  return {
    importer: {
      ...importer,
      import: async (request) => {
        await gates.get(request.fileName)?.promise;
        return importer.import(request);
      },
    },
    hold: (fileName) => {
      if (!gates.has(fileName)) gates.set(fileName, Promise.withResolvers<void>());
    },
    release: (fileName) => {
      gates.get(fileName)?.resolve();
      gates.delete(fileName);
    },
  };
}

export interface TestCore {
  core: ArcueCore;
  platform: RecordingPlatform;
  clock: ManualClock;
  window: FakeWindow;
  /** Errors from background work, which the core reports through `onError`. */
  errors: unknown[];
}

const testClockTime = (ms: number) => new Date(ms).toISOString().slice(11, 16);

/**
 * Starts a core on the files, as "core-1", and checks once the test finishes that it held the reviews lock for every
 * change to review data and the settings lock for every change to settings.
 */
export async function startTestCore(
  files: Record<string, string | Uint8Array>,
  options: { clipboard?: boolean; core?: Partial<ArcueCoreOptions>; lockTimeoutMs?: number } = {},
): Promise<TestCore> {
  const clock = new ManualClock(Date.UTC(2026, 9, 8, 14, 2));
  const platform = new RecordingPlatform({
    files,
    clock,
    importers: [fakeImporter],
    clipboard: options.clipboard ? "available" : "unavailable",
    ...(options.lockTimeoutMs === undefined ? {} : { lockTimeoutMs: options.lockTimeoutMs }),
  });
  onTestFinished(() => expect(unlockedWrites(platform)).toEqual([]));
  const errors: unknown[] = [];
  const core = await ArcueCore.start({
    platform: platform.forCore("core-1"),
    formatClockTime: testClockTime,
    onError: (error) => errors.push(error),
    ...options.core,
  });
  disposeWhenFailed(core);
  const window = new FakeWindow(core, "window-1");
  return { core, platform, clock, window, errors };
}

export interface SecondCore {
  core: ArcueCore;
  window: FakeWindow;
  errors: unknown[];
}

/** Starts a second core, "core-2", on the test's files, clock and locks, as another process on the computer would. */
export async function startSecondCore(
  test: TestCore,
  options: { core?: Partial<ArcueCoreOptions>; importers?: readonly Importer[] } = {},
): Promise<SecondCore> {
  const errors: unknown[] = [];
  const platform = test.platform.forCore("core-2", options.importers ? { importers: options.importers } : {});
  const core = await ArcueCore.start({
    platform,
    formatClockTime: testClockTime,
    onError: (error) => errors.push(error),
    ...options.core,
  });
  disposeWhenFailed(core);
  return { core, window: new FakeWindow(core, "window-2"), errors };
}

/**
 * Disposes the core when its test fails, so work it keeps doing in microtasks, such as answering another core's saves
 * for ever, ends and the failure can be reported.
 */
function disposeWhenFailed(core: ArcueCore): void {
  onTestFinished(({ task }) => {
    if (task.result?.state === "fail") core.dispose();
  });
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
