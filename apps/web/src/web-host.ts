import type { CompositionFile, CoreClient, Peer } from "@arcue/protocol";
import { compositionFileSchema, createPeer, createRemoteClient, portEndpoint } from "@arcue/protocol";
import type { SampleAsset, WorkspaceStore } from "@arcue/ui";
import { createWorkspaceStore } from "@arcue/ui";
import type { SampleInfo } from "./files";
import { openedFilePath, partitionFiles, planOpen, samplePath } from "./files";
import type {
  ImportWorkerFailed,
  SeedFile,
  SeedFilesInput,
  StartImportWorker,
  StopImportWorker,
} from "./host-protocol";
import { hostEvents, hostRequests, pageEvents } from "./host-protocol";

const RELOAD_HINT = "reload the page to get the current version.";

/** A script that fails to load fires a plain "error" event; an uncaught error inside a running worker fires an ErrorEvent. */
function isLoadFailure(event: Event): boolean {
  return !(event instanceof ErrorEvent);
}

/** A picked composition file's content, or null when it is not one, which the core then reports when opening it. */
async function readComposition(file: File): Promise<CompositionFile | null> {
  try {
    const parsed = compositionFileSchema.safeParse(JSON.parse(await file.text()));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export interface OpenAt {
  clip?: string;
  frame?: number;
}

/**
 * The page's side of the web host: starts the core worker, connects this page to it as a window, and seeds sample and
 * opened files into the core's in-memory platform before opening them.
 */
export class WebHost {
  readonly client: CoreClient;
  readonly store: WorkspaceStore;
  readonly samples: readonly SampleAsset[];
  readonly #sampleInfo: readonly SampleInfo[];
  readonly #baseUrl: string;
  readonly #host: Peer;
  readonly #ready: Promise<unknown>;
  readonly #seededSamples = new Map<string, Promise<void>>();
  readonly #importWorkers = new Map<number, Worker>();

  constructor(samples: readonly SampleInfo[], baseUrl: string) {
    this.#sampleInfo = samples;
    this.samples = samples.map((sample) => ({
      name: sample.file,
      path: samplePath(sample.file),
      description: sample.description,
    }));
    this.#baseUrl = baseUrl;

    const worker = new Worker(new URL("./workers/core-worker.ts", import.meta.url), {
      type: "module",
      name: "arcue-core",
    });
    worker.addEventListener("error", (event) => {
      if (isLoadFailure(event)) this.store.notify({ message: `Arcue could not start; ${RELOAD_HINT}`, kind: "alert" });
    });
    this.#host = createPeer(portEndpoint(worker));
    this.#host.onEvent((name, payload) => {
      if (name === hostEvents.startImportWorker) this.#startImportWorker(payload as StartImportWorker);
      if (name === hostEvents.stopImportWorker) this.#stopImportWorker(payload as StopImportWorker);
    });
    const channel = new MessageChannel();
    let store: WorkspaceStore | null = null;
    const windowPeer = createPeer(portEndpoint(channel.port1), {
      handleRequest: (request) => {
        if (!store) throw new Error("The window is not ready.");
        return store.handleRequest(request);
      },
    });
    this.client = createRemoteClient(windowPeer);
    store = createWorkspaceStore({ client: this.client });
    this.store = store;
    this.#ready = this.#host.request("command", hostRequests.connectWindow, { port: channel.port2 }, [channel.port2]);
  }

  sampleById(id: string): SampleAsset | null {
    const info = this.#sampleInfo.find((sample) => sample.id === id);
    return info ? (this.samples.find((sample) => sample.path === samplePath(info.file)) ?? null) : null;
  }

  /** Fetches the sample once, then opens it, at a clip and frame if given. Resolves to the asset id. */
  async openSample(sample: SampleAsset | string, at: OpenAt = {}): Promise<string> {
    const asset = typeof sample === "string" ? this.sampleById(sample) : sample;
    if (!asset) throw new Error(`No sample named "${String(sample)}".`);
    let seeded = this.#seededSamples.get(asset.path);
    if (!seeded) {
      seeded = this.#seedSample(asset).catch((error: unknown) => {
        this.#seededSamples.delete(asset.path);
        throw error;
      });
      this.#seededSamples.set(asset.path, seeded);
    }
    await seeded;
    const { assetId } = await this.client.execute("asset.open", { path: asset.path, ...at });
    return assetId;
  }

  /**
   * Writes each model or composition file into its own folder with copies of the files picked with it, then opens
   * them. A composition file brings the models and textures it needs; see `planOpen`.
   */
  async openFiles(files: readonly File[]): Promise<string[]> {
    const { models, compositions } = partitionFiles(files);
    if (models.length === 0) throw new Error("Choose an .fbx file. Its textures can come along with it.");
    const contents = new Map<File, CompositionFile | null>();
    for (const composition of compositions) contents.set(composition, await readComposition(composition));
    const plans = planOpen(files, contents);
    const seeds = await Promise.all(
      plans.flatMap((plan) =>
        plan.files.map(async (file) => ({
          path: openedFilePath(plan.open.name, file.name),
          bytes: new Uint8Array(await file.arrayBuffer()),
        })),
      ),
    );
    await this.#seed(seeds);
    const opened: string[] = [];
    for (const plan of plans) {
      const { assetId } = await this.client.execute("asset.open", { path: openedFilePath(plan.open.name) });
      opened.push(assetId);
    }
    return opened;
  }

  #startImportWorker({ id, port }: StartImportWorker): void {
    const worker = new Worker(new URL("./workers/import-worker.ts", import.meta.url), {
      type: "module",
      name: `arcue-import-${id}`,
    });
    worker.addEventListener("error", (event) => {
      const failed: ImportWorkerFailed = { id };
      this.#host.emit(pageEvents.importWorkerFailed, failed);
      if (isLoadFailure(event)) {
        this.store.notify({ message: `The importer could not load; ${RELOAD_HINT}`, kind: "alert" });
      }
    });
    worker.postMessage(port, [port]);
    this.#importWorkers.set(id, worker);
  }

  #stopImportWorker({ id }: StopImportWorker): void {
    this.#importWorkers.get(id)?.terminate();
    this.#importWorkers.delete(id);
  }

  /** Downloads the sample's files, a composition's members with it, and writes them beside each other. */
  async #seedSample(sample: SampleAsset): Promise<void> {
    const file = sample.path.slice(sample.path.lastIndexOf("/") + 1);
    const files = this.#sampleInfo.find((info) => info.file === file)?.files ?? [file];
    const seeds = await Promise.all(
      files.map(async (name) => {
        const response = await fetch(`${this.#baseUrl}samples/${encodeURIComponent(name)}`);
        if (!response.ok) throw new Error(`Could not download ${name} (${response.status}).`);
        return { path: samplePath(name), bytes: new Uint8Array(await response.arrayBuffer()) };
      }),
    );
    await this.#seed(seeds);
  }

  async #seed(files: SeedFile[]): Promise<void> {
    await this.#ready;
    const input: SeedFilesInput = { files };
    await this.#host.request(
      "command",
      hostRequests.seedFiles,
      input,
      files.map((file) => file.bytes.buffer),
    );
  }
}
