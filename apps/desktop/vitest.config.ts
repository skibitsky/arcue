import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@arcue/desktop",
    include: ["src/**/*.test.ts"],
  },
});
