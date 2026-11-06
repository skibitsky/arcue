import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from "node:crypto";
import type { Arch, Installer, Platform } from "./layout.ts";
import { installers, PRODUCT, parseVersion } from "./layout.ts";

/** The file each release publishes beside its installers, from which installed apps update. */
export const UPDATE_MANIFEST_FILE = "update.json";

/** Where installed apps look for an update: the manifest of the latest stable release. */
export const UPDATE_FEED_URL = `${PRODUCT.homepage}/releases/latest/download/${UPDATE_MANIFEST_FILE}`;

/** One installer of a release, which an app of its platform, architecture and kind of install updates from. */
export interface UpdateFile {
  platform: Platform;
  arch: Arch;
  kind: Installer["kind"];
  url: string;
  sha256: string;
  size: number;
}

/** What a release offers installed apps: its version, its page and summary, and every installer with its checksum. */
export interface UpdateManifest {
  product: typeof PRODUCT.packageName;
  version: string;
  /** The release page, which says what is new and links every file. */
  page: string;
  /** The first paragraph of the release notes. */
  summary: string;
  files: UpdateFile[];
}

/**
 * The published file: the manifest's exact text and an Ed25519 signature of its UTF-8 bytes, so an app checks the
 * bytes it read, never a copy it serialized again.
 */
export interface SignedManifest {
  format: 1;
  manifest: string;
  signature: string;
}

const PLATFORMS: readonly Platform[] = ["darwin", "win32", "linux"];
const ARCHES: readonly Arch[] = ["arm64", "x64"];

/** Every installer a release has, for every platform and architecture. */
export function releaseInstallers(): { platform: Platform; arch: Arch; installer: Installer }[] {
  return PLATFORMS.flatMap((platform) =>
    ARCHES.flatMap((arch) => installers(platform, arch).map((installer) => ({ platform, arch, installer }))),
  );
}

/** Where a release's file downloads from: the release itself, never `latest`, which may move during the download. */
export function releaseFileUrl(version: string, file: string): string {
  return `${PRODUCT.homepage}/releases/download/v${version}/${encodeURIComponent(file)}`;
}

/** The first paragraph of release notes, as one line of plain text. */
export function notesSummary(notes: string): string {
  const paragraph = notes.trim().split(/\n\s*\n/)[0] ?? "";
  return paragraph.replace(/\s+/g, " ").trim();
}

export interface ReleaseFile {
  name: string;
  bytes: Buffer;
}

/** The manifest of a release from its installers' bytes, which must include every installer `installers` names. */
export function updateManifest(version: string, notes: string, files: readonly ReleaseFile[]): UpdateManifest {
  const parsed = parseVersion(version);
  const byName = new Map(files.map((file) => [file.name, file]));
  return {
    product: PRODUCT.packageName,
    version: parsed.full,
    page: `${PRODUCT.homepage}/releases/tag/v${parsed.full}`,
    summary: notesSummary(notes),
    files: releaseInstallers().map(({ platform, arch, installer }) => {
      const file = byName.get(installer.file);
      if (!file) throw new Error(`The release has no ${installer.file}.`);
      return {
        platform,
        arch,
        kind: installer.kind,
        url: releaseFileUrl(parsed.full, installer.file),
        sha256: createHash("sha256").update(file.bytes).digest("hex"),
        size: file.bytes.length,
      };
    }),
  };
}

/** The signed file for a manifest. The key is an Ed25519 private key in PEM, as `UPDATE_SIGNING_KEY` holds it. */
export function signManifest(manifest: UpdateManifest, privateKeyPem: string): string {
  const key = createPrivateKey(privateKeyPem);
  if (key.asymmetricKeyType !== "ed25519") throw new Error("The update signing key is not an Ed25519 key.");
  const text = JSON.stringify(manifest);
  const signed: SignedManifest = {
    format: 1,
    manifest: text,
    signature: sign(null, Buffer.from(text, "utf8"), key).toString("base64"),
  };
  return `${JSON.stringify(signed, null, 2)}\n`;
}

/** Whether one of `keys`, Ed25519 public keys as base64 SPKI, signed `text`. */
export function signedByOneOf(text: string, signature: string, keys: readonly string[]): boolean {
  const bytes = Buffer.from(text, "utf8");
  const signatureBytes = Buffer.from(signature, "base64");
  return keys.some((key) => {
    try {
      return verify(
        null,
        bytes,
        createPublicKey({ key: Buffer.from(key, "base64"), format: "der", type: "spki" }),
        signatureBytes,
      );
    } catch {
      return false;
    }
  });
}

/** The public key, as base64 SPKI, of an Ed25519 private key in PEM. */
export function publicKeyOf(privateKeyPem: string): string {
  return createPublicKey(createPrivateKey(privateKeyPem)).export({ format: "der", type: "spki" }).toString("base64");
}

/** A new Ed25519 key pair for signing update manifests. */
export function newUpdateKey(): { privateKey: string; publicKey: string } {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  return {
    privateKey: privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
    publicKey: publicKey.export({ format: "der", type: "spki" }).toString("base64"),
  };
}

/** The source of `update-key.ts` with the given keys, which `scripts/update-key.ts` rewrites. */
export function updateKeysSource(keys: readonly string[]): string {
  const declaration = "export const UPDATE_KEYS: readonly string[] = ";
  const oneLine = `${declaration}[${keys.map((key) => `"${key}"`).join(", ")}];`;
  const list = oneLine.length <= 120 ? oneLine : `${declaration}[\n${keys.map((key) => `  "${key}",`).join("\n")}\n];`;
  return `${[
    "/**",
    " * The Ed25519 public keys, as base64 SPKI, whose signature on a release's update.json installed apps accept. Add one",
    " * with `pnpm --filter @arcue/desktop update-key`, and keep an old key while apps that trust only it still update.",
    " */",
    list,
  ].join("\n")}\n`;
}
