import { readFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative } from "node:path";
import { performance } from "node:perf_hooks";
import type { FoundFile } from "@arcue/scene";
import { parseStoredPath } from "@arcue/scene";
import { describe, expect, it } from "vitest";
import { restPoseError } from "../test/geometry";
import { importSample } from "../test/samples";
import { fbxImporter } from "./importer";
import { parseFbx } from "./parser";

const files = (process.env.ARCUE_EXTRA_FBX ?? "").split(":").filter((path) => path !== "");

function findBeside(assetPath: string) {
  const folder = dirname(assetPath);
  const read = (relativePath: string): FoundFile | null => {
    const resolved = join(folder, relativePath);
    const inside = relative(folder, resolved);
    if (isAbsolute(relativePath) || inside.startsWith("..") || isAbsolute(inside)) return null;
    try {
      return { path: inside, bytes: new Uint8Array(readFileSync(resolved)) };
    } catch {
      return null;
    }
  };
  return (storedPath: string): Promise<FoundFile | null> => {
    const stored = parseStoredPath(storedPath);
    return Promise.resolve((stored.relative === null ? null : read(stored.relative)) ?? read(stored.name));
  };
}

describe.skipIf(files.length === 0)("files listed in ARCUE_EXTRA_FBX", () => {
  for (const path of files) {
    it(`imports ${basename(path)}`, async () => {
      await importSample("crate.fbx");
      const bytes = new Uint8Array(readFileSync(path));
      const parseStart = performance.now();
      await parseFbx(bytes);
      const parseMs = performance.now() - parseStart;
      const importStart = performance.now();
      const scene = await fbxImporter.import({
        fileName: basename(path),
        bytes,
        readFile: () => Promise.resolve(null),
        findFile: findBeside(path),
      });
      const importMs = performance.now() - importStart;

      expect(scene.meshes.length).toBeGreaterThan(0);
      for (let mesh = 0; mesh < scene.meshes.length; mesh++) expect(restPoseError(scene, mesh)).toBeLessThan(1e-4);
      for (const clip of scene.clips) expect(clip.frameCount).toBeGreaterThanOrEqual(1);

      const triangles = scene.meshes.reduce((total, mesh) => total + mesh.indices.length / 3, 0);
      const summary = {
        parseMs: Math.round(parseMs),
        importMs: Math.round(importMs),
        meshes: scene.meshes.map((mesh) => `${mesh.name} (${mesh.geometryName})`),
        triangles,
        joints: scene.skeletons.map((skeleton) => skeleton.joints.length),
        clips: scene.clips.length,
        fps: scene.source.fps,
        textures: scene.textures.map(
          (texture) => `${texture.name} (${texture.mimeType}, ${texture.foundPath ?? "embedded"})`,
        ),
        warnings: scene.source.warnings.map((warning) => warning.message),
      };
      console.info(`${basename(path)}: ${JSON.stringify(summary)}`);
    });
  }
});
