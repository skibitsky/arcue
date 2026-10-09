import { defineConfig } from "@playwright/test";

const PORT = 4174;
const gpuFlags =
  process.platform === "darwin"
    ? ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"]
    : ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"];

/** Runs against a production build, so the bundled workers, WebAssembly and samples are what gets tested. */
export default defineConfig({
  testDir: "e2e",
  testMatch: "*.e2e.ts",
  outputDir: "test-results",
  fullyParallel: true,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    browserName: "chromium",
    viewport: { width: 1440, height: 900 },
    launchOptions: { args: gpuFlags },
  },
  webServer: {
    command: `pnpm build && pnpm preview --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
