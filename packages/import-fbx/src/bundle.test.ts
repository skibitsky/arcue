import { copyFileSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { MessageChannel, Worker } from "node:worker_threads";
import type { ImportRunInput } from "@arcue/protocol";
import { createPeer, importRequests, portEndpoint } from "@arcue/protocol";
import type { SceneDescription } from "@arcue/scene";
import { build } from "vite";
import { afterAll, describe, expect, it } from "vitest";
import { readSample } from "../test/samples";

const fixture = fileURLToPath(new URL("../test/bundle/", import.meta.url));
const wasm = readFileSync(new URL("../wasm/arcue-ufbx.wasm", import.meta.url));
const outputs: string[] = [];

function outputDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "arcue-import-fbx-"));
  outputs.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of outputs) rmSync(dir, { recursive: true, force: true });
});

describe("bundling the parser with Vite", () => {
  it("emits the WebAssembly module as an asset that the page and its worker load by URL", async () => {
    const outDir = outputDir();
    await build({ root: fixture, configFile: false, logLevel: "silent", build: { outDir, emptyOutDir: true } });

    const assets = readdirSync(join(outDir, "assets"));
    const wasmAssets = assets.filter((name) => name.endsWith(".wasm"));
    expect(wasmAssets).toHaveLength(1);
    const wasmAsset = wasmAssets[0] ?? "";
    expect(readFileSync(join(outDir, "assets", wasmAsset))).toEqual(wasm);
    expect(assets.some((name) => name.includes("browser-external"))).toBe(false);

    const chunks = assets.filter((name) => name.endsWith(".js"));
    const page = chunks.find((name) => name.startsWith("index-"));
    const worker = chunks.find((name) => name.startsWith("web-worker-"));
    expect(page && worker).toBeTruthy();
    for (const chunk of [page, worker]) {
      expect(readFileSync(join(outDir, "assets", chunk ?? ""), "utf8")).toContain(wasmAsset);
    }
  });

  it("runs the import worker from a Node bundle in worker_threads once the module is copied beside it", async () => {
    const outDir = outputDir();
    await build({
      root: fixture,
      configFile: false,
      logLevel: "silent",
      build: { ssr: "node-worker.js", outDir, emptyOutDir: true, target: "node22" },
      ssr: { noExternal: true },
    });
    const wasmPath = createRequire(import.meta.url).resolve("@arcue/import-fbx/arcue-ufbx.wasm");
    copyFileSync(wasmPath, join(outDir, "arcue-ufbx.wasm"));

    const worker = new Worker(join(outDir, "node-worker.js"));
    const channel = new MessageChannel();
    worker.postMessage(channel.port2, [channel.port2]);
    const peer = createPeer(portEndpoint(channel.port1), { handleRequest: () => null });
    try {
      const bytes = readSample("crate.fbx");
      const input: ImportRunInput = { fileName: "crate.fbx", bytes };
      const scene = (await peer.request("command", importRequests.run, input, [bytes.buffer])) as SceneDescription;
      expect(scene.meshes.map((mesh) => [mesh.name, mesh.indices.length / 3])).toEqual([["Crate", 756]]);
    } finally {
      peer.close();
      channel.port1.close();
      await worker.terminate();
    }
  });
});
