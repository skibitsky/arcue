import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@arcue/cli processes",
    include: ["src/**/*.process.test.ts"],
    globalSetup: ["src/test-global-setup.ts"],
    fileParallelism: false,
    testTimeout: 120_000,
    hookTimeout: 120_000,
    sequence: { groupOrder: 1 },
  },
});
