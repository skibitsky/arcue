import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { LOCAL_PAGE_MARKER } from "@arcue/protocol";
import { build } from "vite";

const appDir = fileURLToPath(new URL("..", import.meta.url));

/**
 * Builds the command line into `into` as `pnpm build` does, with a stub web UI in place of the page of Arcue in the
 * browser: an `index.html` that carries the page's marker and loads `/assets/stub.js`.
 */
export async function buildCli(into: string): Promise<{ dist: string; arcue: string }> {
  await build({
    root: appDir,
    configFile: join(appDir, "vite.config.ts"),
    logLevel: "silent",
    build: { outDir: into, emptyOutDir: true },
  });
  mkdirSync(join(into, "web", "assets"), { recursive: true });
  writeFileSync(
    join(into, "web", "index.html"),
    `<!doctype html><html><head><meta name="${LOCAL_PAGE_MARKER.name}" content="${LOCAL_PAGE_MARKER.content}" /><script type="module" src="/assets/stub.js"></script></head><body></body></html>\n`,
  );
  writeFileSync(join(into, "web", "assets", "stub.js"), "export {};\n");
  return { dist: into, arcue: join(into, "arcue.js") };
}

/** Builds `fixtures/<name>.fixture.ts` into one script for Node in `into`, and returns its path. */
export async function buildFixture(name: string, into: string): Promise<string> {
  await build({
    configFile: false,
    logLevel: "silent",
    root: appDir,
    build: {
      ssr: join(appDir, "src", "fixtures", `${name}.fixture.ts`),
      outDir: into,
      emptyOutDir: false,
      target: "node22",
      rolldownOptions: { output: { entryFileNames: `${name}.fixture.js`, chunkFileNames: `${name}-[hash].js` } },
    },
    ssr: { noExternal: true },
  });
  return join(into, `${name}.fixture.js`);
}
