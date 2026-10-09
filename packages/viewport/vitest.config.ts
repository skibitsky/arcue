import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@arcue/viewport",
    include: ["src/**/*.test.ts"],
    css: { include: [/tokens\.css/] },
  },
});
