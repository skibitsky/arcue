import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = fileURLToPath(new URL("..", import.meta.url));
const fixture = join(packageDir, "test/fixtures/rig-5.2.blend");
const scratch = mkdtempSync(join(tmpdir(), "arcue-blend-"));

const check = `
import { readFileSync } from "node:fs";
import { BlendReadError, readBlend } from "@arcue/blend";

const manifest = JSON.parse(readFileSync("node_modules/@arcue/blend/package.json", "utf8"));
const exported = Object.keys(manifest.exports);
if (exported.join() !== ".") throw new Error("The package exports " + exported.join(", ") + ", not only its entry.");

const scene = await readBlend(new Uint8Array(readFileSync(process.argv[2])));
const skinned = scene.meshes.filter((mesh) => mesh.skin !== null);
if (skinned.length === 0 || scene.skeletons.length === 0) throw new Error("The rig fixture read without a skin.");
const refused = await readBlend(new Uint8Array(16)).then(() => null, (error) => error);
if (!(refused instanceof BlendReadError) || refused.reason !== "unreadable") {
  throw new Error("Bytes that are not a .blend file were not refused as unreadable.");
}
console.log("Read " + scene.meshes.length + " meshes, " + scene.skeletons.length + " skeletons and " +
  scene.clips.length + " clips from Blender " + scene.blenderVersion + ".");
`;

try {
  execFileSync("pnpm", ["pack", "--pack-destination", scratch], { cwd: packageDir, stdio: "inherit" });
  const tarball = readdirSync(scratch).find((name) => name.endsWith(".tgz"));
  if (!tarball) throw new Error("pnpm pack wrote no tarball.");
  writeFileSync(join(scratch, "package.json"), JSON.stringify({ private: true, type: "module" }));
  writeFileSync(join(scratch, "check.mjs"), check);
  execFileSync("npm", ["install", "--no-audit", "--no-fund", "--ignore-scripts", `./${tarball}`], {
    cwd: scratch,
    stdio: "inherit",
  });
  execFileSync(process.execPath, ["check.mjs", fixture], { cwd: scratch, stdio: "inherit" });
  const files = JSON.parse(readFileSync(join(scratch, "node_modules/@arcue/blend/package.json"), "utf8")).files;
  console.log(`The packed package installs and reads a fixture in Node; it ships ${files.join(", ")}.`);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
