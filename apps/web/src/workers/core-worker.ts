import type { Clock } from "@arcue/core";
import { ArcueCore, locateComposition, MemoryPlatform } from "@arcue/core";
import { ArcueError, createPeer, portEndpoint } from "@arcue/protocol";
import type {
  ConnectWindowInput,
  ImportWorkerFailed,
  PlaceFilesOutput,
  RemoveFilesInput,
  RenameFileInput,
  SeedFilesInput,
  StartImportWorker,
  StopImportWorker,
  WriteCompositionInput,
} from "../host-protocol";
import { hostEvents, hostRequests, pageEvents } from "../host-protocol";
import { closableEndpoint } from "./closable-endpoint";
import { freeClosedFiles } from "./free-closed-files";
import { placeFile } from "./place-files";

const clock: Clock = {
  now: () => Date.now(),
  setTimer(delayMs, callback) {
    const handle = setTimeout(callback, delayMs);
    return () => clearTimeout(handle);
  },
};

let windows = 0;
let importWorkers = 0;
const closeImportWorker = new Map<number, () => void>();

const platform = new MemoryPlatform({
  clock,
  lockTimeoutMs: 15_000,
  startImportWorker() {
    const id = ++importWorkers;
    const channel = new MessageChannel();
    const start: StartImportWorker = { id, port: channel.port2 };
    const closable = closableEndpoint(portEndpoint(channel.port1));
    closeImportWorker.set(id, closable.close);
    page.emit(hostEvents.startImportWorker, start, [channel.port2]);
    return {
      endpoint: closable.endpoint,
      terminate() {
        closeImportWorker.delete(id);
        channel.port1.close();
        const stop: StopImportWorker = { id };
        page.emit(hostEvents.stopImportWorker, stop);
      },
    };
  },
});

const page = createPeer(portEndpoint(self), {
  async handleRequest({ name, input }) {
    if (name === hostRequests.connectWindow) {
      const { port } = input as ConnectWindowInput;
      const core = await started;
      windows += 1;
      core.connect(portEndpoint(port), { connection: `window-${windows}`, caller: "window" });
      return null;
    }
    if (name === hostRequests.seedFiles) {
      for (const file of (input as SeedFilesInput).files) await platform.writeFile(file.path, file.bytes);
      return null;
    }
    if (name === hostRequests.placeFiles) {
      const output: PlaceFilesOutput = { files: [] };
      for (const file of (input as SeedFilesInput).files) output.files.push(await placeFile(platform, file));
      return output;
    }
    if (name === hostRequests.removeFiles) {
      for (const path of (input as RemoveFilesInput).paths) await platform.remove(path);
      return null;
    }
    if (name === hostRequests.renameFile) {
      const { from, to } = input as RenameFileInput;
      await platform.rename(from, to);
      return null;
    }
    if (name === hostRequests.writeComposition) {
      const { model, text } = input as WriteCompositionInput;
      await platform.writeFile(await locateComposition(platform, model), text);
      return null;
    }
    throw new ArcueError("unknown-command", `The core worker does not handle "${name}".`);
  },
});

page.onEvent((name, payload) => {
  if (name === pageEvents.importWorkerFailed) closeImportWorker.get((payload as ImportWorkerFailed).id)?.();
});

const started = ArcueCore.start({ platform, onError: (error) => console.error(error) });
void started.then((core) => freeClosedFiles(core.client, platform, (error) => console.error(error)));
