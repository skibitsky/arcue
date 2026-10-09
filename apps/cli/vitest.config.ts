import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@arcue/cli",
    include: ["src/**/*.test.ts"],
  },
});
