import { readFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative } from "node:path";
import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import { restPoseError } from "../test/geometry";
import { importSample } from "../test/samples";
import { fbxImporter } from "./importer";
import { parseFbx } from "./parser";

const files = (process.env.ARCUE_EXTRA_FBX ?? "").split(":").filter((path) => path !== "");

function readBeside(assetPath: string) {
  const folder = dirname(assetPath);
  return (relativePath: string): Promise<Uint8Array | null> => {
    const resolved = join(folder, relativePath);
    const inside = relative(folder, resolved);
    if (isAbsolute(relativePath) || inside.startsWith("..") || isAbsolute(inside)) return Promise.resolve(null);
    try {
      return Promise.resolve(new Uint8Array(readFileSync(resolved)));
    } catch {
      return Promise.resolve(null);
    }
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
      const scene = await fbxImporter.import({ fileName: basename(path), bytes, readFile: readBeside(path) });
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
        textures: scene.textures.map((texture) => `${texture.name} (${texture.mimeType})`),
        warnings: scene.source.warnings.map((warning) => warning.message),
      };
      console.info(`${basename(path)}: ${JSON.stringify(summary)}`);
    });
  }
});
