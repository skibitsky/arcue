import { defineConfig } from "vite";

export default defineConfig({
  build: {
    ssr: "src/bin.ts",
    outDir: "dist",
    target: "node22",
    rolldownOptions: {
      output: { entryFileNames: "arcue.js" },
    },
  },
  ssr: {
    noExternal: true,
  },
});
