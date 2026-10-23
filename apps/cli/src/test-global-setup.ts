import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestProject } from "vitest/node";
import { buildCli, buildFixture } from "./test-build";
import { killRegistered } from "./test-pids";

declare module "vitest" {
  export interface ProvidedContext {
    /** The process tests' folder, with the command line built in `dist` and the fixtures built beside it. */
    processRun: { folder: string; dist: string; arcue: string; fixtures: Record<"linger" | "hanging-serve", string> };
  }
}

/**
 * Builds the command line and the fixtures once for the process tests. Teardown kills the processes they recorded
 * that still run, then removes the folder, which also makes any detached `arcue serve` from the build stop itself.
 */
export default async function setup(project: TestProject): Promise<() => void> {
  const folder = realpathSync(mkdtempSync(join(tmpdir(), "arcue-processes-")));
  const { dist, arcue } = await buildCli(join(folder, "dist"));
  const fixtures = join(folder, "fixtures");
  project.provide("processRun", {
    folder,
    dist,
    arcue,
    fixtures: {
      linger: await buildFixture("linger", fixtures),
      "hanging-serve": await buildFixture("hanging-serve", fixtures),
    },
  });
  return () => {
    killRegistered(folder);
    rmSync(folder, { recursive: true, force: true });
  };
}
