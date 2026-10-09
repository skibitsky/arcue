import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@arcue/desktop e2e",
    include: ["e2e/**/*.e2e.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
