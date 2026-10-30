// Prints the notes of the release that a tag v<version> names, from release-notes/<version>.md. Given the folder where
// the Release workflow's builds recorded how they signed, the notes name what is not signed; without it, everything.
// LATEST=true says the release becomes the latest one, which INSTALL.md's commands download.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { versionOfTag } from "../packaging/layout.ts";
import { releaseNotes } from "../packaging/release-notes.ts";

const [tag, signingFolder] = process.argv.slice(2);
if (!tag) throw new Error("Usage: node scripts/release-notes.ts v<version> [signing folder]");
const manifest: { version: string } = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const version = versionOfTag(tag, manifest.version);
const summaryFile = new URL(`../release-notes/${version.full}.md`, import.meta.url);
const summary = await readFile(summaryFile, "utf8").catch(() => {
  throw new Error(`Write what ${tag} brings in apps/desktop/release-notes/${version.full}.md before you tag it.`);
});

const signing = async (target: string) =>
  signingFolder ? (await readFile(join(signingFolder, target), "utf8")).trim() : "unsigned";
const [macArm, macIntel, windowsX64, windowsArm] = await Promise.all(
  ["mac-arm64", "mac-x64", "win-x64", "win-arm64"].map(signing),
);
process.stdout.write(
  releaseNotes({
    repository: process.env.GITHUB_REPOSITORY ?? "skibitsky/arcue",
    tag,
    summary,
    macNotarized: macArm === "notarized" && macIntel === "notarized",
    windowsSigned: windowsX64 === "signed" && windowsArm === "signed",
    latest: process.env.LATEST === "true",
  }),
);
