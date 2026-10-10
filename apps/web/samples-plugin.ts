import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { CompositionFile } from "@arcue/protocol";
import type { Plugin } from "vite";

/** A sample the web host serves at "samples/<file>" and, unless `gallery` is false, lists in the empty state. */
export interface SampleEntry {
  /** The file name without its extension, used by the `?sample=` link parameter. */
  id: string;
  /** The model to open. */
  file: string;
  description: string;
  /** Whether the empty state lists it. A test fixture opens only by id. */
  gallery: boolean;
  /** Every file to fetch, `file` first. */
  files: string[];
  /** The model's composition, which the web host writes where the core reads it before opening the model. */
  composition?: CompositionFile;
}

interface ManifestFile {
  file: string;
  description: string;
  gallery?: boolean;
}

/** A model that opens with other files, and the composition that names them, as its review folder would keep it. */
interface ManifestComposition {
  model: string;
  description: string;
  composition: CompositionFile;
}

const VIRTUAL_ID = "virtual:arcue-samples";
const RESOLVED_ID = `\0${VIRTUAL_ID}`;
const SAFE_NAME = /^[\w.@-]+$/;

/**
 * The FBX files `manifest.json` lists whose files exist in the folder, in the manifest's order. A model the manifest
 * gives a composition comes with it, with its description and every file it names, when those files exist too.
 */
export function readSampleEntries(folder: string): SampleEntry[] {
  const manifest = JSON.parse(readFileSync(join(folder, "manifest.json"), "utf8")) as {
    files: ManifestFile[];
    compositions?: ManifestComposition[];
  };
  const present = (file: string) => SAFE_NAME.test(file) && existsSync(join(folder, file));
  return manifest.files
    .filter((entry) => /\.fbx$/i.test(entry.file) && present(entry.file))
    .map((entry) => {
      const sample = { id: entry.file.replace(/\.fbx$/i, ""), file: entry.file, gallery: entry.gallery !== false };
      const set = manifest.compositions?.find((candidate) => candidate.model === entry.file);
      const members = set ? namedFiles(set.composition) : [];
      if (!set || !members.every(present)) return { ...sample, description: entry.description, files: [entry.file] };
      return {
        ...sample,
        description: set.description,
        files: [entry.file, ...members],
        composition: set.composition,
      };
    });
}

/** The files a composition names, each once: animation files, attached files, then textures. */
function namedFiles(composition: CompositionFile): string[] {
  const textures = Object.values(composition.materials ?? {}).flatMap((slots) => Object.values(slots));
  const files = [
    ...(composition.animations ?? []),
    ...(composition.attach ?? []).map((entry) => entry.file),
    ...textures.filter((file): file is string => file !== undefined),
  ];
  return [...new Set(files)];
}

/**
 * Serves the sample files at "samples/<file>" in development, copies them into the build, and provides their list as
 * the module "virtual:arcue-samples". Only files the manifest lists are served.
 */
export function arcueSamples(folder: string): Plugin {
  const entries = readSampleEntries(folder);
  const files = new Set(entries.flatMap((entry) => entry.files));
  return {
    name: "arcue-samples",
    resolveId: (id) => (id === VIRTUAL_ID ? RESOLVED_ID : null),
    load: (id) => (id === RESOLVED_ID ? `export default ${JSON.stringify(entries)};` : null),
    configureServer(server) {
      server.middlewares.use("/samples", (request, response, next) => {
        const file = decodeURIComponent((request.url ?? "").split("?")[0]?.replace(/^\//, "") ?? "");
        if (!files.has(file)) return next();
        response.setHeader("Content-Type", "application/octet-stream");
        response.end(readFileSync(join(folder, file)));
      });
    },
    generateBundle() {
      for (const file of files) {
        this.emitFile({ type: "asset", fileName: `samples/${file}`, source: readFileSync(join(folder, file)) });
      }
    },
  };
}
