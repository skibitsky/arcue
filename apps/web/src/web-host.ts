import type { CoreClient, Peer } from "@arcue/protocol";
import { createPeer, createRemoteClient, IMAGE_FILE_EXTENSIONS, portEndpoint } from "@arcue/protocol";
import type { FileHost, FileKind, SampleAsset, WorkspaceStore } from "@arcue/ui";
import { createWorkspaceStore, isImageFile, isModelFile } from "@arcue/ui";
import { chooseFiles } from "./choose-files";
import type { SampleInfo } from "./files";
import { besideAsset, openedFilePath, partitionFiles, planOpen, samplePath } from "./files";
import type {
  ImportWorkerFailed,
  PlaceFilesOutput,
  RemoveFilesInput,
  SeedFile,
  SeedFilesInput,
  StartImportWorker,
  StopImportWorker,
  WriteCompositionInput,
} from "./host-protocol";
import { hostEvents, hostRequests, pageEvents } from "./host-protocol";

const RELOAD_HINT = "reload the page to get the current version.";

const IMAGE_ACCEPT = IMAGE_FILE_EXTENSIONS.join(",");
/** Models come with the textures picked beside them, since the page cannot read the folder they were in. */
const ACCEPT: Record<FileKind, string> = { model: `.fbx,${IMAGE_ACCEPT}`, image: IMAGE_ACCEPT };

/** A script that fails to load fires a plain "error" event; an uncaught error inside a running worker fires an ErrorEvent. */
function isLoadFailure(event: Event): boolean {
  return !(event instanceof ErrorEvent);
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
  /** The copy each dropped or picked file made beside an asset, for files whose copy no file there had yet. */
  readonly #copies = new WeakMap<File, string>();

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
    const files: FileHost = {
      pick: async (kind, assetPath) => {
        const chosen = await chooseFiles({ accept: ACCEPT[kind], multiple: kind === "model" });
        return chosen.length > 0 ? this.placeFiles(chosen, assetPath) : [];
      },
      place: (dropped, assetPath) => this.placeFiles(dropped, assetPath),
      open: (dropped) => {
        this.#removeCopies(dropped)
          .then(() => this.openFiles(dropped))
          .catch((error: unknown) => this.#alert(error));
      },
      discard: (dropped) => {
        this.#removeCopies(dropped).catch((error: unknown) => this.#alert(error));
      },
    };
    store = createWorkspaceStore({ client: this.client, files });
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

  /** Writes each model into its own folder with copies of the files picked with it, then opens them; see `planOpen`. */
  async openFiles(files: readonly File[]): Promise<string[]> {
    const { models } = partitionFiles(files);
    if (models.length === 0) throw new Error("Choose an .fbx file. Its textures can come along with it.");
    const plans = planOpen(files);
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

  /**
   * Copies models and images into the core's in-memory workspace beside an opened asset, where its composition may
   * name them, and returns their paths in order. Other files are left out. A different file of the same name there is
   * never replaced: the copy gets a numbered name, such as "Sword-2.fbx", and a file with the same bytes is reused.
   */
  async placeFiles(files: readonly File[], assetPath: string): Promise<string[]> {
    const usable = files.filter((file) => isModelFile(file.name) || isImageFile(file.name));
    const seeds = await Promise.all(
      usable.map(async (file) => ({
        path: besideAsset(assetPath, file.name),
        bytes: new Uint8Array(await file.arrayBuffer()),
      })),
    );
    await this.#ready;
    const input: SeedFilesInput = { files: seeds };
    const output = (await this.#host.request(
      "command",
      hostRequests.placeFiles,
      input,
      seeds.map((seed) => seed.bytes.buffer),
    )) as PlaceFilesOutput;
    output.files.forEach((placed, index) => {
      const file = usable[index];
      if (file && placed.created) this.#copies.set(file, placed.path);
    });
    return output.files.map((placed) => placed.path);
  }

  /**
   * Writes a model's composition file where the core reads it, as an agent edits the file on disk in the desktop app.
   * An open asset reloads with it.
   */
  async writeComposition(model: string, text: string): Promise<void> {
    await this.#ready;
    const input: WriteCompositionInput = { model, text };
    await this.#host.request("command", hostRequests.writeComposition, input);
  }

  #alert(error: unknown): void {
    this.store.notify({ message: error instanceof Error ? error.message : String(error), kind: "alert" });
  }

  /** Removes the copies dropped files made beside an asset, once they open in a tab of their own or are dismissed. */
  async #removeCopies(files: readonly File[]): Promise<void> {
    const paths = files.flatMap((file) => {
      const copy = this.#copies.get(file);
      this.#copies.delete(file);
      return copy === undefined ? [] : [copy];
    });
    if (paths.length === 0) return;
    const input: RemoveFilesInput = { paths };
    await this.#host.request("command", hostRequests.removeFiles, input);
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

  /**
   * Downloads the sample's files, its composition's members with it, and writes them beside each other, then writes its
   * composition where the core reads it.
   */
  async #seedSample(sample: SampleAsset): Promise<void> {
    const file = sample.path.slice(sample.path.lastIndexOf("/") + 1);
    const info = this.#sampleInfo.find((entry) => entry.file === file);
    const files = info?.files ?? [file];
    const seeds = await Promise.all(
      files.map(async (name) => {
        const response = await fetch(`${this.#baseUrl}samples/${encodeURIComponent(name)}`);
        if (!response.ok) throw new Error(`Could not download ${name} (${response.status}).`);
        return { path: samplePath(name), bytes: new Uint8Array(await response.arrayBuffer()) };
      }),
    );
    await this.#seed(seeds);
    if (info?.composition) await this.writeComposition(sample.path, `${JSON.stringify(info.composition, null, 2)}\n`);
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
