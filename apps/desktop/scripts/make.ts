// Makes the installers for the app that `package` built in out/, into out/make/: a disk image on macOS, a setup
// program on Windows, and a Debian package and a tarball on Linux. It signs and notarizes the disk image as package.ts
// does the app.
import { execFile } from "node:child_process";
import { chmod, copyFile, cp, lstat, mkdir, readdir, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { DEB_APP_DIR, DEB_ICON_SIZES, debianControl, debianCopyright, desktopEntry } from "../packaging/debian.ts";
import type { Arch, Installer, Version } from "../packaging/layout.ts";
import {
  appLayout,
  installers,
  PRODUCT,
  packagedFolder,
  parseArch,
  parsePlatform,
  parseVersion,
} from "../packaging/layout.ts";
import { macSigning } from "../packaging/signing.ts";
import { makeInstaller } from "../packaging/windows.ts";
import { appRoot } from "./bundles.ts";

const run = promisify(execFile);
const platform = parsePlatform(process.argv[2] ?? process.platform);
const arch = parseArch(process.argv[3] ?? process.arch);
process.umask(0o022);

const repo = fileURLToPath(new URL("../../..", import.meta.url));
const manifest: { version: string } = JSON.parse(await readFile(join(appRoot, "package.json"), "utf8"));
const version = parseVersion(manifest.version);
const out = join(appRoot, "out");
const packaged = join(out, packagedFolder(platform, arch));
const made = join(out, "make");
await stat(join(packaged, appLayout(platform).command)).catch(() => {
  throw new Error(`${packaged} has no arcue command. Package the app first: pnpm --filter @arcue/desktop package`);
});
await mkdir(made, { recursive: true });

for (const installer of installers(platform, arch)) {
  const file = join(made, installer.file);
  await rm(file, { force: true });
  await make(installer, file);
  console.log(`Made ${file}`);
}

async function make(installer: Installer, file: string): Promise<void> {
  switch (installer.kind) {
    case "dmg":
      return makeDiskImage(file);
    case "setup":
      return makeInstaller({
        version,
        arch,
        source: packaged,
        outputDir: made,
        outputName: installer.file.replace(/\.exe$/, ""),
        icon: join(repo, "assets", "branding", "arcue.ico"),
      });
    case "deb":
      return makeDebian(file, version, arch);
    case "tar":
      return makeTarball(file);
  }
}

async function makeDiskImage(file: string): Promise<void> {
  const contents = join(appRoot, "build", "dmg");
  await rm(contents, { recursive: true, force: true });
  await mkdir(contents, { recursive: true });
  await run("ditto", [join(packaged, `${PRODUCT.name}.app`), join(contents, `${PRODUCT.name}.app`)]);
  await symlink("/Applications", join(contents, "Applications"));
  const create = ["create", "-volname", PRODUCT.name, "-srcfolder", contents, "-fs", "HFS+", "-format", "UDZO", file];
  for (let attempt = 1; ; attempt++) {
    try {
      await run("hdiutil", create);
      break;
    } catch (error) {
      if (attempt === 3) throw error;
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
  const signing = macSigning(process.env);
  if (!signing) return;
  const keychain = signing.keychain ? ["--keychain", signing.keychain] : [];
  await run("codesign", ["--sign", signing.identity, ...keychain, "--timestamp", file]);
  if (!signing.notarize) return;
  const { appleApiKey, appleApiKeyId, appleApiIssuer } = signing.notarize;
  const credentials = ["--key", appleApiKey, "--key-id", appleApiKeyId, "--issuer", appleApiIssuer];
  const { stdout } = await run(
    "xcrun",
    ["notarytool", "submit", file, ...credentials, "--wait", "--timeout", "1h", "--output-format", "json"],
    { maxBuffer: 16 * 1024 * 1024 },
  ).catch((error: { stdout?: string }) => ({ stdout: error.stdout ?? "{}" }));
  const result = JSON.parse(stdout) as { id?: string; status?: string };
  if (result.status !== "Accepted") {
    const log = result.id
      ? await run("xcrun", ["notarytool", "log", result.id, ...credentials]).then(
          ({ stdout: text }) => text,
          () => "",
        )
      : "";
    throw new Error(`Apple did not notarize ${file}: ${result.status ?? stdout}\n${log}`);
  }
  await run("xcrun", ["stapler", "staple", file]);
}

async function makeDebian(file: string, version: Version, arch: Arch): Promise<void> {
  const root = join(appRoot, "build", "deb");
  await rm(root, { recursive: true, force: true });
  const app = join(root, DEB_APP_DIR);
  await mkdir(join(app, ".."), { recursive: true });
  await cp(packaged, app, { recursive: true, verbatimSymlinks: true });
  await everyoneMayRead(app);
  await chmod(join(app, "chrome-sandbox"), 0o4755);
  await mkdir(join(root, "usr", "bin"), { recursive: true });
  await symlink(`../lib/${PRODUCT.packageName}/${appLayout("linux").command}`, join(root, "usr", "bin", "arcue"));
  const share = join(root, "usr", "share");
  await mkdir(join(share, "applications"), { recursive: true });
  await writeFile(join(share, "applications", `${PRODUCT.packageName}.desktop`), desktopEntry());
  for (const size of DEB_ICON_SIZES) {
    const icons = join(share, "icons", "hicolor", `${size}x${size}`, "apps");
    await mkdir(icons, { recursive: true });
    await copyFile(
      join(repo, "assets", "branding", "png", `arcue-${size}.png`),
      join(icons, `${PRODUCT.packageName}.png`),
    );
  }
  const doc = join(share, "doc", PRODUCT.packageName);
  await mkdir(doc, { recursive: true });
  await writeFile(join(doc, "copyright"), debianCopyright(await readFile(join(repo, "LICENSE"), "utf8")));
  const installedKiB = (await sizeOf(root)) / 1024;
  const control = join(root, "DEBIAN");
  await mkdir(control, { recursive: true });
  await chmod(control, 0o755);
  await writeFile(join(control, "control"), debianControl(version, arch, installedKiB));
  await run("dpkg-deb", ["--root-owner-group", "-Zxz", "--build", root, file], { maxBuffer: 16 * 1024 * 1024 });
}

async function makeTarball(file: string): Promise<void> {
  await run("tar", [
    "--create",
    "--gzip",
    "--file",
    file,
    "--owner=0",
    "--group=0",
    "--numeric-owner",
    "--mode=a+rX,go-w",
    "--directory",
    out,
    packagedFolder(platform, arch),
  ]);
}

/** Lets every user read and run the app, which @electron/packager leaves in a folder only its owner can open. */
async function everyoneMayRead(folder: string): Promise<void> {
  await chmod(folder, 0o755);
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) await everyoneMayRead(path);
    else if (entry.isFile()) await chmod(path, (await stat(path)).mode & 0o111 ? 0o755 : 0o644);
  }
}

/** The bytes of the files under a folder, without following symlinks. */
async function sizeOf(folder: string): Promise<number> {
  let total = 0;
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) total += await sizeOf(path);
    else total += (await lstat(path)).size;
  }
  return total;
}
