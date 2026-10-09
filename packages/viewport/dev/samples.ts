import type { ImportRunInput } from "@arcue/protocol";
import { createPeer, importRequests, portEndpoint } from "@arcue/protocol";
import type { SceneDescription } from "@arcue/scene";
import blobUrl from "../../../samples/blob.fbx?url";
import golemUrl from "../../../samples/pebble-golem.fbx?url";
import rockUrl from "../../../samples/textured-rock.fbx?url";

export const SAMPLES = {
  "pebble-golem": golemUrl,
  "textured-rock": rockUrl,
  blob: blobUrl,
} as const;

export type SampleName = keyof typeof SAMPLES;

export function isSampleName(name: string): name is SampleName {
  return name in SAMPLES;
}

/** Imports one of the repository's sample FBX files in an import worker, as the app does. */
export async function importSample(name: SampleName): Promise<SceneDescription> {
  const response = await fetch(SAMPLES[name]);
  if (!response.ok) throw new Error(`Could not fetch ${name}.fbx: ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const worker = new Worker(new URL("./import-worker.ts", import.meta.url), { type: "module" });
  const peer = createPeer(portEndpoint(worker), { handleRequest: () => null });
  try {
    const input: ImportRunInput = { fileName: `${name}.fbx`, bytes };
    return (await peer.request("command", importRequests.run, input, [bytes.buffer])) as SceneDescription;
  } finally {
    peer.close();
    worker.terminate();
  }
}
