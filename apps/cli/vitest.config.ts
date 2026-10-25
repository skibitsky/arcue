import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@arcue/cli",
    include: ["src/**/*.test.ts"],
    exclude: [...configDefaults.exclude, "src/**/*.process.test.ts"],
  },
});
