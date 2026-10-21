import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { connectToCore, fromNativePath, NodePlatform } from "@arcue/platform-node";
import { armHardExit, exitAfterRun } from "../exit-after-run";
import { run } from "../run";

/**
 * Runs `arcue serve` as `bin.ts` does, on port `ARCUE_PORT`, with the built web UI and import worker in `ARCUE_DIST`,
 * while this process keeps the reviews lock of its data folder and never lets go. It opens a model outside any
 * repository and adds a file to its composition, a save that waits for that lock, so the serve's close never ends, and
 * keeps a timer running, so only an exit ends the process. It writes `waiting` in its data folder once the save waits.
 */
const userData = process.env.ARCUE_USER_DATA ?? "";
const dist = process.env.ARCUE_DIST ?? "";
const platform = new NodePlatform({
  appDataDir: fromNativePath(userData),
  startImportWorker: () => {
    throw new Error("This platform imports nothing.");
  },
});
await platform.lock(fromNativePath(userData), "reviews");

const serving = run(
  ["serve", "--port", process.env.ARCUE_PORT ?? ""],
  { out: (text) => process.stdout.write(text), err: (text) => process.stderr.write(text) },
  process.env,
  process.cwd(),
  {
    webUi: join(dist, "web"),
    importWorkerEntry: join(dist, "import-worker.js"),
    onStopping: () => armHardExit(30_000),
  },
);

let connection = await connectToCore(userData, "serve");
while (!connection) {
  await sleep(50);
  connection = await connectToCore(userData, "serve");
}
const models = process.env.ARCUE_MODELS ?? "";
writeFileSync(join(models, "Hero.fbx"), "fbx");
writeFileSync(join(models, "Prop.fbx"), "fbx");
const { assetId } = await connection.client.execute("asset.openInView", { path: join(models, "Hero.fbx"), view: "a" });
void connection.client
  .execute("composition.addFile", { assetId, file: "Prop.fbx", role: "set" })
  .catch(() => undefined);
await sleep(300);
setInterval(() => undefined, 1000);
writeFileSync(join(userData, "waiting"), "");

exitAfterRun(await serving);
