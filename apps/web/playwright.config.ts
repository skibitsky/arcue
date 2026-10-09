import { defineConfig } from "@playwright/test";

const PORT = 4174;
const softwareRendering = process.platform !== "darwin" || process.env.ARCUE_E2E_SOFTWARE === "1";
const gpuFlags = softwareRendering
  ? ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
  : ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"];

/** Runs against a production build, so the bundled workers, WebAssembly and samples are what gets tested. */
export default defineConfig({
  testDir: "e2e",
  testMatch: "*.e2e.ts",
  outputDir: "test-results",
  fullyParallel: true,
  timeout: softwareRendering ? 120_000 : 30_000,
  expect: { timeout: softwareRendering ? 20_000 : 5000 },
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    browserName: "chromium",
    viewport: { width: 1440, height: 900 },
    launchOptions: { args: gpuFlags },
    trace: { mode: "retain-on-failure", screenshots: false, snapshots: true, sources: true },
    screenshot: "only-on-failure",
  },
  webServer: {
    command: `pnpm build && pnpm preview --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
