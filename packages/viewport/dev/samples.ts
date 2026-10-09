import type { ImportRunInput } from "@arcue/protocol";
import { compositionFileSchema, createPeer, importRequests, portEndpoint } from "@arcue/protocol";
import type { CompositionMember, SceneDescription } from "@arcue/scene";
import { composeScene } from "@arcue/scene";
import beetleUrl from "../../../samples/beetle.fbx?url";
import beetleShellsUrl from "../../../samples/beetle-shells.fbx?url";
import beetleTurnUrl from "../../../samples/beetle-turn.fbx?url";
import blobUrl from "../../../samples/blob.fbx?url";
import manifestText from "../../../samples/manifest.json?raw";
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

const BEETLE_FILES: Readonly<Record<string, string>> = {
  "beetle.fbx": beetleUrl,
  "beetle-shells.fbx": beetleShellsUrl,
  "beetle-turn.fbx": beetleTurnUrl,
};

/** Imports one FBX file in an import worker, as the app does. */
async function importFile(url: string, fileName: string): Promise<SceneDescription> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not fetch ${fileName}: ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const worker = new Worker(new URL("./import-worker.ts", import.meta.url), { type: "module" });
  const peer = createPeer(portEndpoint(worker), { handleRequest: () => null });
  try {
    const input: ImportRunInput = { fileName, bytes };
    return (await peer.request("command", importRequests.run, input, [bytes.buffer])) as SceneDescription;
  } finally {
    peer.close();
    worker.terminate();
  }
}

/** Imports one of the repository's sample FBX files. */
export function importSample(name: SampleName): Promise<SceneDescription> {
  return importFile(SAMPLES[name], `${name}.fbx`);
}

/** The beetle's composition, as the samples manifest gives it. */
function beetleComposition(): unknown {
  const manifest = JSON.parse(manifestText) as { compositions?: { model: string; composition: unknown }[] };
  return manifest.compositions?.find((entry) => entry.model === "beetle.fbx")?.composition;
}

/** The modular beetle, composed from its three files as its composition says, the way the core composes it. */
export async function importBeetle(): Promise<SceneDescription> {
  const composition = compositionFileSchema.parse(beetleComposition());
  const members = new Map<string, Promise<CompositionMember>>();
  const member = (file: string) => {
    let found = members.get(file);
    if (!found) {
      const url = BEETLE_FILES[file];
      if (!url) throw new Error(`The beetle's composition names ${file}, which the harness does not serve.`);
      found = importFile(url, file).then((scene) => ({ file, scene }));
      members.set(file, found);
    }
    return found;
  };
  const model = await member("beetle.fbx");
  const animations = await Promise.all((composition.animations ?? []).map(member));
  const attach = await Promise.all(
    (composition.attach ?? []).map(async (entry) => ({
      member: await member(entry.file),
      node: entry.node ?? null,
      bone: entry.bone ?? null,
    })),
  );
  return composeScene(model.scene, { animations, attach, materials: {}, hidden: composition.hidden ?? [] });
}
