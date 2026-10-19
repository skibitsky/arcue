import { copyFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { defineConfig } from "vite";

const require = createRequire(import.meta.url);

export default defineConfig({
  build: {
    ssr: true,
    outDir: "dist",
    target: "node24",
    rolldownOptions: {
      input: {
        arcue: "src/bin.ts",
        "import-worker": require.resolve("@arcue/platform-node/import-worker"),
      },
      output: { entryFileNames: "[name].js", chunkFileNames: "arcue-[hash].js" },
    },
  },
  ssr: {
    noExternal: true,
  },
  plugins: [
    {
      name: "copy-ufbx-wasm",
      apply: "build",
      async writeBundle(options) {
        const outDir = options.dir ?? "dist";
        await copyFile(require.resolve("@arcue/import-fbx/arcue-ufbx.wasm"), join(outDir, "arcue-ufbx.wasm"));
      },
    },
  ],
});
