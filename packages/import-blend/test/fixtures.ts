import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { fileURLToPath } from "node:url";
import type { Version } from "@arcue/blend/test/fixtures";
import { fixtureName, fixturesDir, readFixture } from "@arcue/blend/test/fixtures";
import type { FoundFile, SceneDescription } from "@arcue/scene";
import { blendImporter } from "../src/importer";

export type { ClipSample, MeshReference, Reference, Version } from "@arcue/blend/test/fixtures";
export {
  fixtureFaces,
  fixtureName,
  fixturesDir,
  readFixture,
  reference,
  VERSIONS,
} from "@arcue/blend/test/fixtures";

export const repositoryDir = fileURLToPath(new URL("../../../", import.meta.url));

/** Finds an image the way the core does for a path stored relative to the fixtures folder. */
export async function findInFixtures(storedPath: string): Promise<FoundFile | null> {
  if (storedPath.startsWith("/")) return null;
  try {
    const bytes = new Uint8Array(readFileSync(`${fixturesDir}${storedPath}`));
    return { path: relative(fixturesDir, `${fixturesDir}${storedPath}`), bytes };
  } catch {
    return null;
  }
}

export function importBytes(
  fileName: string,
  bytes: Uint8Array,
  findFile: (storedPath: string) => Promise<FoundFile | null> = () => Promise.resolve(null),
): Promise<SceneDescription> {
  return blendImporter.import({
    fileName,
    bytes,
    readFile: () => Promise.resolve(null),
    findFile,
    locateFile: async (storedPath) => (await findFile(storedPath))?.path ?? null,
  });
}

export function importFixture(
  name: string,
  version: Version,
  findFile?: (storedPath: string) => Promise<FoundFile | null>,
): Promise<SceneDescription> {
  return importBytes(fixtureName(name, version), readFixture(name, version), findFile);
}
