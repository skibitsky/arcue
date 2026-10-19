import { access, chmod, copyFile, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Options } from "@electron/packager";
import { packager } from "@electron/packager";
import { appLayout, PRODUCT, parseArch, parsePlatform, parseVersion } from "../packaging/layout.ts";
import { macSigning } from "../packaging/signing.ts";
import { compileCommand } from "../packaging/windows.ts";
import { appRoot, buildProcesses, buildRenderer, dist } from "./bundles.ts";

const platform = parsePlatform(process.argv[2] ?? process.platform);
const arch = parseArch(process.argv[3] ?? process.arch);

const repo = fileURLToPath(new URL("../../..", import.meta.url));
const launcher = fileURLToPath(new URL("../packaging/arcue", import.meta.url));
const cliBuild = join(repo, "apps", "cli", "dist");
const webBuild = join(repo, "apps", "web", "dist-local");
await access(join(cliBuild, "arcue.js")).catch(() => {
  throw new Error(`${cliBuild} has no arcue.js. Build the command line first: pnpm --filter @arcue/cli build`);
});
await access(join(webBuild, "index.html")).catch(() => {
  throw new Error(`${webBuild} has no index.html. Build the page first: pnpm --filter @arcue/web build:local`);
});

await buildProcesses();
await buildRenderer();

const build = join(appRoot, "build");
const staging = join(build, "package");
await rm(staging, { recursive: true, force: true });
await mkdir(staging, { recursive: true });
await cp(dist, join(staging, "dist"), { recursive: true });
await cp(join(repo, "LICENSE"), join(staging, "LICENSE"));
const manifest: { version: string } = JSON.parse(await readFile(join(appRoot, "package.json"), "utf8"));
const version = parseVersion(manifest.version);
await writeFile(
  join(staging, "package.json"),
  `${JSON.stringify({ name: PRODUCT.packageName, productName: PRODUCT.name, version: version.full, type: "module", main: "dist/main.js", license: "MIT" }, null, 2)}\n`,
);

const command = join(build, "command");
await rm(command, { recursive: true, force: true });
await cp(cliBuild, join(command, "cli"), { recursive: true });
await cp(webBuild, join(command, "cli", "web"), { recursive: true });
if (platform === "darwin") await installLauncher(join(command, "bin", "arcue"));

const require = createRequire(import.meta.url);
const electron: { version: string } = require("electron/package.json");
const extension = platform === "darwin" ? "icns" : platform === "win32" ? "ico" : "png";
const [bundle] = await packager({
  dir: staging,
  name: PRODUCT.name,
  appBundleId: PRODUCT.bundleId,
  appVersion: version.full,
  buildVersion: version.numeric,
  platform,
  arch,
  electronVersion: electron.version,
  icon: join(repo, "assets", "branding", `arcue.${extension}`),
  out: join(appRoot, "out"),
  overwrite: true,
  asar: false,
  prune: false,
  extraResource: platform === "darwin" ? [join(command, "cli"), join(command, "bin")] : [join(command, "cli")],
  ...(platform === "darwin" ? macOptions() : {}),
});
if (!bundle) throw new Error("@electron/packager made no app.");

const layout = appLayout(platform);
if (platform === "linux") await installLauncher(join(bundle, layout.command));
if (platform === "win32") await compileCommand(join(bundle, layout.command), arch);
console.log(`Packaged Arcue ${version.full}: ${bundle}`);

async function installLauncher(path: string): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await copyFile(launcher, path);
  await chmod(path, 0o755);
}

/** Signs with the Developer ID identity the environment names and notarizes, or signs ad hoc without one. */
function macOptions(): Pick<Options, "osxSign" | "osxNotarize"> {
  const signing = macSigning(process.env);
  if (!signing) {
    return {
      osxSign: {
        identity: "-",
        identityValidation: false,
        optionsForFile: () => ({ hardenedRuntime: false }),
        preAutoEntitlements: false,
        preEmbedProvisioningProfile: false,
      },
    };
  }
  return {
    osxSign: { identity: signing.identity, ...(signing.keychain ? { keychain: signing.keychain } : {}) },
    ...(signing.notarize ? { osxNotarize: signing.notarize } : {}),
  };
}
