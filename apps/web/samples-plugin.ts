import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Plugin } from "vite";

/** A sample FBX file the web host serves at "samples/<file>" and lists in the empty state. */
export interface SampleEntry {
  /** The file name without ".fbx", used by the `?sample=` link parameter. */
  id: string;
  file: string;
  description: string;
}

interface ManifestFile {
  file: string;
  description: string;
}

const VIRTUAL_ID = "virtual:arcue-samples";
const RESOLVED_ID = `\0${VIRTUAL_ID}`;

/** The files `manifest.json` lists that exist in the folder, in the manifest's order. */
export function readSampleEntries(folder: string): SampleEntry[] {
  const manifest = JSON.parse(readFileSync(join(folder, "manifest.json"), "utf8")) as { files: ManifestFile[] };
  return manifest.files
    .filter((entry) => /^[\w.-]+\.fbx$/i.test(entry.file) && existsSync(join(folder, entry.file)))
    .map((entry) => ({ id: entry.file.replace(/\.fbx$/i, ""), file: entry.file, description: entry.description }));
}

/**
 * Serves the sample files at "samples/<file>" in development, copies them into the build, and provides their list as
 * the module "virtual:arcue-samples". Only files the manifest lists are served.
 */
export function arcueSamples(folder: string): Plugin {
  const entries = readSampleEntries(folder);
  const byFile = new Map(entries.map((entry) => [entry.file, entry]));
  return {
    name: "arcue-samples",
    resolveId: (id) => (id === VIRTUAL_ID ? RESOLVED_ID : null),
    load: (id) => (id === RESOLVED_ID ? `export default ${JSON.stringify(entries)};` : null),
    configureServer(server) {
      server.middlewares.use("/samples", (request, response, next) => {
        const file = decodeURIComponent((request.url ?? "").split("?")[0]?.replace(/^\//, "") ?? "");
        if (!byFile.has(file)) return next();
        response.setHeader("Content-Type", "application/octet-stream");
        response.end(readFileSync(join(folder, file)));
      });
    },
    generateBundle() {
      for (const entry of entries) {
        this.emitFile({
          type: "asset",
          fileName: `samples/${entry.file}`,
          source: readFileSync(join(folder, entry.file)),
        });
      }
    },
  };
}
