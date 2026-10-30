// Prints the desktop app's release version as JSON. Given a tag, it fails unless the tag is v and that version.
import { readFile } from "node:fs/promises";
import { parseVersion, versionOfTag } from "../packaging/layout.ts";

const manifest: { version: string } = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const tag = process.argv[2];
const version = tag ? versionOfTag(tag, manifest.version) : parseVersion(manifest.version);
console.log(JSON.stringify({ version: version.full, prerelease: version.prerelease }));
