import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@arcue/plugin",
    include: ["src/**/*.test.ts", "launcher/**/*.test.ts"],
  },
});
