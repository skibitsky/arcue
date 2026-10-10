import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { packager } from "@electron/packager";
import { appRoot, buildProcesses, buildRenderer, dist } from "./bundles.ts";

const platform = process.argv[2] ?? process.platform;
const arch = process.argv[3] ?? process.arch;
if (platform !== "darwin" && platform !== "win32" && platform !== "linux") {
  throw new Error(`Unsupported desktop platform: ${platform}`);
}
if (arch !== "arm64" && arch !== "x64") throw new Error(`Unsupported desktop architecture: ${arch}`);

await buildProcesses();
await buildRenderer();

const repo = fileURLToPath(new URL("../../..", import.meta.url));
const staging = join(appRoot, "build", "package");
await rm(staging, { recursive: true, force: true });
await mkdir(staging, { recursive: true });
await cp(dist, join(staging, "dist"), { recursive: true });
await cp(join(repo, "LICENSE"), join(staging, "LICENSE"));
const manifest: { version: string } = JSON.parse(await readFile(join(appRoot, "package.json"), "utf8"));
await writeFile(
  join(staging, "package.json"),
  `${JSON.stringify({ name: "arcue", productName: "Arcue", version: manifest.version, type: "module", main: "dist/main.js", license: "MIT" }, null, 2)}\n`,
);

const require = createRequire(import.meta.url);
const electron: { version: string } = require("electron/package.json");
const extension = platform === "darwin" ? "icns" : platform === "win32" ? "ico" : "png";
const bundles = await packager({
  dir: staging,
  name: "Arcue",
  appBundleId: "app.arcue.desktop",
  platform,
  arch,
  electronVersion: electron.version,
  icon: join(repo, "assets", "branding", `arcue.${extension}`),
  out: join(appRoot, "out"),
  overwrite: true,
  asar: false,
  prune: false,
  ...(platform === "darwin"
    ? {
        osxSign: {
          identity: "-",
          identityValidation: false,
          optionsForFile: () => ({ hardenedRuntime: false }),
          preAutoEntitlements: false,
          preEmbedProvisioningProfile: false,
        },
      }
    : {}),
});
for (const bundle of bundles) console.log(`Packaged Arcue: ${bundle}`);
