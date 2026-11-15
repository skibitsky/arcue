import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { singlePage } from "./single-page.ts";

/** Arcue's view in apps that show MCP Apps: the served page's window on a channel through the app, in one file. */
export default defineConfig({
  root: fileURLToPath(new URL("./view/", import.meta.url)),
  base: "./",
  publicDir: false,
  plugins: [react(), singlePage()],
  build: {
    outDir: fileURLToPath(new URL("./dist-view/", import.meta.url)),
    emptyOutDir: true,
    cssCodeSplit: false,
    modulePreload: false,
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    chunkSizeWarningLimit: 2000,
    cssTarget: ["chrome123", "edge123", "firefox120", "safari17.5"],
    rolldownOptions: {
      input: fileURLToPath(new URL("./view/view.html", import.meta.url)),
      output: { codeSplitting: false },
    },
  },
});
