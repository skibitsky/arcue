import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { arcueSamples } from "./samples-plugin.ts";

export default defineConfig({
  plugins: [react(), arcueSamples(fileURLToPath(new URL("../../samples/", import.meta.url)))],
  worker: { format: "es" },
  build: { chunkSizeWarningLimit: 1500 },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
});
