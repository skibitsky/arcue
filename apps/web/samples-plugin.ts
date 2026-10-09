import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Plugin } from "vite";

/** A sample the web host serves at "samples/<file>" and lists in the empty state. */
export interface SampleEntry {
  /** The file name without its extension, used by the `?sample=` link parameter. */
  id: string;
  /** The file to open: an FBX file, or a composition file that opens its model with the other files. */
  file: string;
  description: string;
  /** Every file to fetch, `file` first. */
  files: string[];
  /** For a composition, the model it opens, which names the tab. */
  model?: string;
}

interface ManifestFile {
  file: string;
  description: string;
}

interface ManifestComposition {
  file: string;
  model: string;
  description: string;
  /** The model and every other file the composition loads. */
  files: string[];
}

const VIRTUAL_ID = "virtual:arcue-samples";
const RESOLVED_ID = `\0${VIRTUAL_ID}`;
const SAFE_NAME = /^[\w.@-]+$/;

/**
 * The samples `manifest.json` lists whose files exist in the folder, in the manifest's order: each FBX file that no
 * composition uses, then each composition with its files.
 */
export function readSampleEntries(folder: string): SampleEntry[] {
  const manifest = JSON.parse(readFileSync(join(folder, "manifest.json"), "utf8")) as {
    files: ManifestFile[];
    compositions?: ManifestComposition[];
  };
  const present = (file: string) => SAFE_NAME.test(file) && existsSync(join(folder, file));
  const compositions = (manifest.compositions ?? []).filter(
    (entry) =>
      /\.arcue$/i.test(entry.file) && entry.files.includes(entry.model) && [entry.file, ...entry.files].every(present),
  );
  const used = new Set(compositions.flatMap((entry) => entry.files));
  const models = manifest.files
    .filter((entry) => /\.fbx$/i.test(entry.file) && present(entry.file) && !used.has(entry.file))
    .map((entry) => ({
      id: entry.file.replace(/\.fbx$/i, ""),
      file: entry.file,
      description: entry.description,
      files: [entry.file],
    }));
  const sets = compositions.map((entry) => ({
    id: entry.file.replace(/\.arcue$/i, ""),
    file: entry.file,
    description: entry.description,
    files: [entry.file, ...entry.files],
    model: entry.model,
  }));
  return [...models, ...sets];
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
