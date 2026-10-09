import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@arcue/web",
    include: ["src/**/*.test.ts", "*.test.ts"],
  },
});
