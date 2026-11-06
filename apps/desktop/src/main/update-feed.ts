import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import { dirname } from "node:path";
import { pipeline } from "node:stream/promises";
import { z } from "zod";
import type { Arch, Installer, Platform } from "../../packaging/layout";
import { PRODUCT, parseVersion } from "../../packaging/layout";
import { UPDATE_KEYS } from "../../packaging/update-key";
import type { UpdateFile, UpdateManifest } from "../../packaging/updates";
import { signedByOneOf, UPDATE_FEED_URL } from "../../packaging/updates";

/**
 * Where updates come from: `ARCUE_UPDATE_URL` when set, where "off" or nothing turns them off, and otherwise the latest
 * release for a packaged app that trusts a key. An unpackaged app updates only from a feed a test names.
 */
export function updateFeed(env: NodeJS.ProcessEnv, packaged: boolean, keys: readonly string[]): string | null {
  const configured = env.ARCUE_UPDATE_URL;
  if (keys.length === 0) return null;
  if (configured !== undefined) return configured === "" || configured === "off" ? null : configured;
  return packaged ? UPDATE_FEED_URL : null;
}

/** The keys an update must be signed with. Only an unpackaged app takes one from `ARCUE_UPDATE_KEY`, for tests. */
export function updateKeys(env: NodeJS.ProcessEnv, packaged: boolean): readonly string[] {
  return !packaged && env.ARCUE_UPDATE_KEY ? [...UPDATE_KEYS, env.ARCUE_UPDATE_KEY] : UPDATE_KEYS;
}

/** The fetch of the network session updates use, which follows redirects. */
export type UpdateFetch = (url: string, init: { signal: AbortSignal }) => Promise<Response>;

const MAX_MANIFEST_BYTES = 256 * 1024;
const MAX_FILE_BYTES = 2 * 1024 * 1024 * 1024;

const versionSchema = z.string().refine((value) => {
  try {
    parseVersion(value);
    return true;
  } catch {
    return false;
  }
}, "Not a release version.");

const updateFileSchema = z.object({
  platform: z.enum(["darwin", "win32", "linux"]),
  arch: z.enum(["x64", "arm64"]),
  kind: z.enum(["dmg", "setup", "deb", "tar"]),
  url: z.url({ protocol: /^https?$/ }),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  size: z.int().positive().max(MAX_FILE_BYTES),
});

const manifestSchema = z.object({
  product: z.literal(PRODUCT.packageName),
  version: versionSchema,
  page: z.url({ protocol: /^https?$/ }),
  summary: z.string().max(4000),
  files: z.array(updateFileSchema).max(64),
});

const signedManifestSchema = z.object({
  format: z.literal(1),
  manifest: z.string().max(MAX_MANIFEST_BYTES),
  signature: z.string().max(200),
});

/** No release has published an update manifest yet, which is no update rather than a failure. */
export class NoManifestError extends Error {}

/**
 * The manifest a signed file carries, once one of `keys` verifies its signature, and only for this app. An address in
 * it must be https, or on the feed's own origin, as a local test feed is.
 */
export function readManifest(text: string, keys: readonly string[], feedUrl: string): UpdateManifest {
  let signed: z.output<typeof signedManifestSchema>;
  try {
    signed = signedManifestSchema.parse(JSON.parse(text));
  } catch {
    throw new Error("The update manifest is not a signed manifest.");
  }
  if (!signedByOneOf(signed.manifest, signed.signature, keys)) {
    throw new Error("The update manifest is not signed by Arcue's update key.");
  }
  const manifest: UpdateManifest = manifestSchema.parse(JSON.parse(signed.manifest));
  const feed = new URL(feedUrl).origin;
  for (const address of [manifest.page, ...manifest.files.map((file) => file.url)]) {
    const url = new URL(address);
    if (url.protocol !== "https:" && url.origin !== feed) throw new Error(`The update manifest names ${address}.`);
  }
  return manifest;
}

/** Reads the feed's manifest. Rejects with `NoManifestError` when the release has none. */
export async function fetchManifest(
  fetch: UpdateFetch,
  feedUrl: string,
  keys: readonly string[],
  signal: AbortSignal,
): Promise<UpdateManifest> {
  const response = await fetch(feedUrl, { signal });
  if (response.status === 404) throw new NoManifestError("The latest release has no update manifest.");
  if (!response.ok) throw new Error(`The update feed answered ${response.status} ${response.statusText}.`.trim());
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > MAX_MANIFEST_BYTES) throw new Error("The update manifest is too large.");
  const text = await response.text();
  if (text.length > MAX_MANIFEST_BYTES) throw new Error("The update manifest is too large.");
  return readManifest(text, keys, feedUrl);
}

/** The installer of a manifest for an app of this platform and architecture installed as `kind`, if it has one. */
export function fileFor(
  manifest: UpdateManifest,
  platform: Platform,
  arch: Arch,
  kind: Installer["kind"],
): UpdateFile | null {
  return manifest.files.find((file) => file.platform === platform && file.arch === arch && file.kind === kind) ?? null;
}

/** Whether `path` holds the file: its size and SHA-256 match. */
export async function hasFile(file: UpdateFile, path: string): Promise<boolean> {
  const size = await stat(path).then(
    (stats) => stats.size,
    () => -1,
  );
  if (size !== file.size) return false;
  const hash = createHash("sha256");
  await pipeline(createReadStream(path), hash);
  return hash.digest("hex") === file.sha256;
}

/**
 * Downloads a file to `path` through a partial file beside it, checking its size as it arrives and its SHA-256 at the
 * end. A file that does not match never reaches `path`.
 */
export async function download(
  fetch: UpdateFetch,
  file: UpdateFile,
  path: string,
  signal: AbortSignal,
  onProgress: (received: number) => void = () => undefined,
): Promise<void> {
  const partial = `${path}.part`;
  await mkdir(dirname(path), { recursive: true });
  try {
    const response = await fetch(file.url, { signal });
    if (!response.ok || !response.body) {
      throw new Error(`Downloading the update answered ${response.status} ${response.statusText}.`.trim());
    }
    const hash = createHash("sha256");
    let received = 0;
    const out = createWriteStream(partial);
    const chunks = async function* (body: ReadableStream<Uint8Array>) {
      for await (const chunk of body) {
        received += chunk.byteLength;
        if (received > file.size) throw new Error("The update is larger than its manifest says.");
        hash.update(chunk);
        onProgress(received);
        yield chunk;
      }
    };
    await pipeline(response.body, chunks, out, { signal });
    if (received !== file.size) throw new Error("The update download ended early.");
    if (hash.digest("hex") !== file.sha256) throw new Error("The update download does not match its checksum.");
    await rename(partial, path);
  } catch (error) {
    await rm(partial, { force: true });
    throw error;
  }
}
