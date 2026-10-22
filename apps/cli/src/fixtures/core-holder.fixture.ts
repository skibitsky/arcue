import { ArcueCore } from "@arcue/core";
import { fromNativePath, NodePlatform, startNodeImportWorker } from "@arcue/platform-node";

/**
 * Runs a core as another Arcue would, on the data folder, model and import worker its arguments name, opens the model
 * for a view and says "ready" over IPC once it loaded. On "create" it adds a comment, and its save of `review.json` says
 * "writing" and never finishes, so the core holds the model's reviews lock until the process is killed.
 */
const [userData, model, importWorker] = process.argv.slice(2);
if (!userData || !model || !importWorker) throw new Error("Usage: core-holder <data folder> <model> <import worker>");

class HoldingPlatform extends NodePlatform {
  holding = false;

  override async writeFileAtomic(path: string, data: Uint8Array | string): Promise<void> {
    if (this.holding && path.endsWith("/review.json")) {
      process.send?.("writing");
      await new Promise<never>(() => undefined);
    }
    return super.writeFileAtomic(path, data);
  }
}

const onError = (error: unknown) => process.stderr.write(`${String(error)}\n`);
const platform = new HoldingPlatform({
  appDataDir: fromNativePath(userData),
  startImportWorker: () => startNodeImportWorker(importWorker, onError),
});
const core = await ArcueCore.start({ platform, onError });
const { assetId } = await core.client.execute("asset.openInView", { path: fromNativePath(model), view: "holder" });

async function loadedVersion(): Promise<string> {
  for (;;) {
    const asset = (await core.client.query("asset.list", {})).assets.find((open) => open.assetId === assetId);
    if (asset?.status === "ready" && asset.version !== null) return asset.version;
    if (asset?.status === "failed") throw new Error(`The model did not load: ${asset.error}`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

const version = await loadedVersion();
process.on("message", (message) => {
  if (message !== "create") return;
  platform.holding = true;
  void core.client.execute("comment.create", {
    assetId,
    text: "Held by the other core.",
    version,
    time: { kind: "none" },
    target: null,
    camera: { position: [0, 1, 3], target: [0, 1, 0], up: [0, 1, 0], fov: 30 },
    context: { vertexCount: 0, bones: [], centroid: null, joints: [], viewLabel: "front" },
    screenshot: null,
  });
});
process.send?.("ready");
