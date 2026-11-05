import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { compareVersions } from "./layout";
import type { SignedManifest } from "./updates";
import {
  newUpdateKey,
  notesSummary,
  publicKeyOf,
  releaseInstallers,
  signedByOneOf,
  signManifest,
  updateKeysSource,
  updateManifest,
} from "./updates";

const run = promisify(execFile);
const allFiles = () =>
  releaseInstallers().map(({ installer }) => ({ name: installer.file, bytes: Buffer.from(installer.file) }));

describe("compareVersions", () => {
  it("orders releases and prereleases as Semantic Versioning does", () => {
    const ordered = [
      "0.1.0",
      "0.2.0-beta",
      "0.2.0-beta.1",
      "0.2.0-beta.2",
      "0.2.0-beta.10",
      "0.2.0-rc",
      "0.2.0",
      "0.10.0",
      "1.0.0",
    ];
    for (let index = 1; index < ordered.length; index++) {
      expect(compareVersions(ordered[index - 1] ?? "", ordered[index] ?? "")).toBe(-1);
      expect(compareVersions(ordered[index] ?? "", ordered[index - 1] ?? "")).toBe(1);
    }
    expect(compareVersions("0.2.0", "0.2.0")).toBe(0);
    expect(compareVersions("1.0.0-1", "1.0.0-alpha")).toBe(-1);
  });
});

describe("updateManifest", () => {
  it("lists every installer of the release with its checksum and the release's own download address", () => {
    const manifest = updateManifest("0.2.0", "Arcue updates itself.\nNo more downloads.\n\n- More things", allFiles());
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.page).toBe("https://github.com/skibitsky/arcue/releases/tag/v0.2.0");
    expect(manifest.summary).toBe("Arcue updates itself. No more downloads.");
    expect(manifest.files.map((file) => `${file.platform}-${file.arch}-${file.kind}`)).toEqual([
      "darwin-arm64-dmg",
      "darwin-x64-dmg",
      "win32-arm64-setup",
      "win32-x64-setup",
      "linux-arm64-deb",
      "linux-arm64-tar",
      "linux-x64-deb",
      "linux-x64-tar",
    ]);
    const mac = manifest.files[0];
    expect(mac?.url).toBe("https://github.com/skibitsky/arcue/releases/download/v0.2.0/Arcue-mac-arm64.dmg");
    expect(mac?.size).toBe("Arcue-mac-arm64.dmg".length);
    expect(mac?.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("refuses a release that misses an installer", () => {
    expect(() => updateManifest("0.2.0", "Notes", allFiles().slice(1))).toThrow(
      "The release has no Arcue-mac-arm64.dmg.",
    );
  });

  it("takes the first paragraph of the notes as one line", () => {
    expect(notesSummary("\n\nOne\ntwo.\n\nThree.")).toBe("One two.");
  });
});

describe("signManifest", () => {
  const key = newUpdateKey();
  const manifest = updateManifest("0.2.0", "Notes", allFiles());

  it("signs the manifest's exact text, which only the matching public key verifies", () => {
    const signed: SignedManifest = JSON.parse(signManifest(manifest, key.privateKey));
    expect(signed.format).toBe(1);
    expect(JSON.parse(signed.manifest)).toEqual(manifest);
    expect(signedByOneOf(signed.manifest, signed.signature, [key.publicKey])).toBe(true);
    expect(signedByOneOf(signed.manifest, signed.signature, [newUpdateKey().publicKey, key.publicKey])).toBe(true);
    expect(signedByOneOf(signed.manifest, signed.signature, [newUpdateKey().publicKey])).toBe(false);
    expect(signedByOneOf(signed.manifest.replace("0.2.0", "9.9.9"), signed.signature, [key.publicKey])).toBe(false);
    expect(signedByOneOf(signed.manifest, "not a signature", [key.publicKey])).toBe(false);
    expect(signedByOneOf(signed.manifest, signed.signature, ["not a key"])).toBe(false);
    expect(publicKeyOf(key.privateKey)).toBe(key.publicKey);
  });

  it("refuses a key that is not Ed25519", async () => {
    const { generateKeyPairSync } = await import("node:crypto");
    const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const pem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
    expect(() => signManifest(manifest, pem)).toThrow("not an Ed25519 key");
  });
});

describe("updateKeysSource", () => {
  it("writes one key on one line and several on their own lines, as Biome formats them", () => {
    const one = updateKeysSource([newUpdateKey().publicKey]);
    expect(one).toMatch(/^export const UPDATE_KEYS: readonly string\[\] = \["MCow[^"]+"\];$/m);
    const two = updateKeysSource([newUpdateKey().publicKey, newUpdateKey().publicKey]);
    expect(two).toMatch(/= \[\n {2}"MCow[^"]+",\n {2}"MCow[^"]+",\n\];\n$/);
    expect(updateKeysSource([])).toContain("export const UPDATE_KEYS: readonly string[] = [];");
  });

  it("keeps update-key.ts as the script writes it", async () => {
    const source = await readFile(fileURLToPath(new URL("./update-key.ts", import.meta.url)), "utf8");
    const keys = [...source.matchAll(/"(MCow[^"]+)"/g)].map((match) => match[1] ?? "");
    expect(source).toBe(updateKeysSource(keys));
  });
});

describe("scripts/update-manifest.ts", () => {
  it("signs update.json for the installers in a folder with the key the environment holds", async () => {
    const folder = await mkdtemp(join(tmpdir(), "arcue-manifest-"));
    try {
      for (const file of allFiles()) await writeFile(join(folder, file.name), file.bytes);
      const script = fileURLToPath(new URL("../scripts/update-manifest.ts", import.meta.url));
      const { version } = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
      const signing = run(process.execPath, [script, "sign", `v${version}`, folder], {
        env: { ...process.env, UPDATE_SIGNING_KEY: newUpdateKey().privateKey },
      });
      await expect(signing).rejects.toThrow(/names no key|is not the private key of any key/);
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });
});
