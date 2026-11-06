// The Release workflow's update manifest. `check` fails unless packaging/update-key.ts names a key, so a release never
// ships an app that cannot update. `sign v<version> <folder>` writes <folder>/update.json for the installers there,
// signed with the Ed25519 private key in UPDATE_SIGNING_KEY, whose public key update-key.ts must name.
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { versionOfTag } from "../packaging/layout.ts";
import { UPDATE_KEYS } from "../packaging/update-key.ts";
import type { SignedManifest } from "../packaging/updates.ts";
import {
  publicKeyOf,
  signedByOneOf,
  signManifest,
  UPDATE_MANIFEST_FILE,
  updateManifest,
} from "../packaging/updates.ts";

const NO_KEY =
  "packaging/update-key.ts names no key, so installed apps could not update from this release. Run pnpm --filter @arcue/desktop update-key and commit the change before you tag.";

const [command, tag, folder] = process.argv.slice(2);
if (command === "check") {
  if (UPDATE_KEYS.length === 0) throw new Error(NO_KEY);
} else if (command === "sign" && tag && folder) {
  await sign(tag, folder);
} else {
  throw new Error("Usage: node scripts/update-manifest.ts check | sign v<version> <folder>");
}

async function sign(tag: string, folder: string): Promise<void> {
  if (UPDATE_KEYS.length === 0) throw new Error(NO_KEY);
  const privateKey = process.env.UPDATE_SIGNING_KEY ?? "";
  if (!privateKey.trim()) {
    throw new Error("Set the UPDATE_SIGNING_KEY secret of the release environment to the update key's private key.");
  }
  if (!UPDATE_KEYS.includes(publicKeyOf(privateKey))) {
    throw new Error("UPDATE_SIGNING_KEY is not the private key of any key in packaging/update-key.ts.");
  }
  const app: { version: string } = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  const version = versionOfTag(tag, app.version);
  const notes = await readFile(new URL(`../release-notes/${version.full}.md`, import.meta.url), "utf8");
  const names = (await readdir(folder)).filter((name) => name !== UPDATE_MANIFEST_FILE);
  const files = await Promise.all(names.map(async (name) => ({ name, bytes: await readFile(join(folder, name)) })));
  const text = signManifest(updateManifest(version.full, notes, files), privateKey);
  const written: SignedManifest = JSON.parse(text);
  if (!signedByOneOf(written.manifest, written.signature, UPDATE_KEYS)) {
    throw new Error("The signature did not verify.");
  }
  await writeFile(join(folder, UPDATE_MANIFEST_FILE), text);
  console.log(`Signed ${UPDATE_MANIFEST_FILE} for Arcue ${version.full}.`);
}
