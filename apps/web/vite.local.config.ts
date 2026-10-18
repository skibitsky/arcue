import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/** The page `arcue serve` serves, which connects to a core on the same computer instead of starting one. */
export default defineConfig({
  root: fileURLToPath(new URL("./local/", import.meta.url)),
  publicDir: fileURLToPath(new URL("./public/", import.meta.url)),
  plugins: [react()],
  build: {
    outDir: fileURLToPath(new URL("./dist-local/", import.meta.url)),
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
  },
});
