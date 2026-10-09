import { copyFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import type { InlineConfig } from "vite";
import { build } from "vite";

export const appRoot = fileURLToPath(new URL("..", import.meta.url));
export const dist = join(appRoot, "dist");
export const DEV_SERVER_PORT = 5190;
const require = createRequire(import.meta.url);

/** A bundle for Node or Electron's main side: workspace packages are bundled, Electron and Node's modules are not. */
function nodeBundle(entry: string, fileName: string, format: "es" | "cjs"): InlineConfig {
  return {
    root: appRoot,
    configFile: false,
    logLevel: "warn",
    build: {
      ssr: entry,
      outDir: dist,
      emptyOutDir: false,
      target: "node22",
      minify: false,
      rolldownOptions: { external: ["electron"], output: { format, entryFileNames: fileName } },
    },
    ssr: { noExternal: true, external: ["electron"] },
  };
}

export function rendererConfig(): InlineConfig {
  return {
    root: join(appRoot, "src", "renderer"),
    configFile: false,
    base: "./",
    plugins: [react()],
    logLevel: "warn",
    server: { port: DEV_SERVER_PORT, strictPort: true },
    build: {
      outDir: join(dist, "renderer"),
      emptyOutDir: true,
      target: "chrome140",
      assetsInlineLimit: 0,
      chunkSizeWarningLimit: 4096,
    },
  };
}

/** Builds the main process, preload, core utility process and import worker into `dist/`. */
export async function buildProcesses(): Promise<void> {
  await rm(dist, { recursive: true, force: true });
  await build(nodeBundle("src/main/main.ts", "main.js", "es"));
  await build(nodeBundle("src/preload/preload.ts", "preload.cjs", "cjs"));
  await build(nodeBundle("src/core/core-process.ts", "core.js", "es"));
  await build(nodeBundle(require.resolve("@arcue/platform-node/import-worker"), "import-worker.js", "es"));
  const wasm = require.resolve("@arcue/import-fbx/arcue-ufbx.wasm");
  await copyFile(wasm, join(dist, "arcue-ufbx.wasm"));
}

export async function buildRenderer(): Promise<void> {
  await build(rendererConfig());
}
