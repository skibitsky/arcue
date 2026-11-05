// Makes the key that signs the update manifest of every release, which installed apps check before they update. It
// writes the private key to the file named, which must not exist yet, and adds the public key to packaging/update-key.ts.
// Keep an old public key there while apps that trust only it may still update.
import { writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { UPDATE_KEYS } from "../packaging/update-key.ts";
import { newUpdateKey, updateKeysSource } from "../packaging/updates.ts";

const [target] = process.argv.slice(2);
if (!target) throw new Error("Usage: pnpm --filter @arcue/desktop update-key <file for the private key>");
const repo = fileURLToPath(new URL("../../..", import.meta.url));
const privateFile = resolve(process.env.INIT_CWD ?? process.cwd(), target);
const inRepo = relative(repo, privateFile);
if (!inRepo.startsWith("..") && !isAbsolute(inRepo)) {
  throw new Error(`Write the private key outside the repository, not to ${privateFile}.`);
}

const { privateKey, publicKey } = newUpdateKey();
await writeFile(privateFile, privateKey, { flag: "wx", mode: 0o600 });
const source = fileURLToPath(new URL("../packaging/update-key.ts", import.meta.url));
await writeFile(source, updateKeysSource([...UPDATE_KEYS, publicKey]));

console.log(`Wrote the private key to ${privateFile} and its public key to ${source}.

1. Save the private key where it cannot be lost, such as a password manager. Installed apps trust only updates it
   signs, so without it everyone has to reinstall Arcue by hand to get the next version.
2. Give it to the Release workflow:
   gh secret set UPDATE_SIGNING_KEY --env release --repo skibitsky/arcue < ${JSON.stringify(privateFile)}
3. Delete ${privateFile}, then commit apps/desktop/packaging/update-key.ts.`);
