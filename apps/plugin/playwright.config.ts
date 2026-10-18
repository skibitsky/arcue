import { defineConfig } from "@playwright/test";

const softwareRendering = process.platform !== "darwin" || process.env.ARCUE_E2E_SOFTWARE === "1";
const gpuFlags = softwareRendering
  ? ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
  : ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"];

/** Runs the built plugin's own `arcue serve`, as an agent starts it for the built-in browser of the Claude or Codex app. */
export default defineConfig({
  testDir: "e2e",
  testMatch: "*.e2e.ts",
  outputDir: "test-results",
  workers: 1,
  timeout: softwareRendering ? 120_000 : 30_000,
  expect: { timeout: softwareRendering ? 20_000 : 5000 },
  reporter: process.env.CI ? "github" : "list",
  use: {
    browserName: "chromium",
    viewport: { width: 1440, height: 900 },
    launchOptions: { args: gpuFlags },
    trace: { mode: "retain-on-failure", screenshots: false, snapshots: true, sources: true },
    screenshot: "only-on-failure",
  },
});
