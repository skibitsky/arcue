import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { UPDATE_KEYS } from "../../packaging/update-key";
import type { UpdateFile, UpdateManifest } from "../../packaging/updates";
import { newUpdateKey, releaseInstallers, signManifest, updateManifest } from "../../packaging/updates";
import type { UpdateFetch } from "./update-feed";
import {
  download,
  fetchManifest,
  fileFor,
  hasFile,
  NoManifestError,
  readManifest,
  updateFeed,
  updateKeys,
} from "./update-feed";

const FEED = "https://github.com/skibitsky/arcue/releases/latest/download/update.json";
const key = newUpdateKey();
const files = releaseInstallers().map(({ installer }) => ({
  name: installer.file,
  bytes: Buffer.from(installer.file),
}));
const manifest = updateManifest("0.2.0", "Arcue updates itself.", files);
const signed = (value: UpdateManifest = manifest, privateKey = key.privateKey) => signManifest(value, privateKey);

const folders: string[] = [];
afterEach(async () => {
  for (const folder of folders.splice(0)) await rm(folder, { recursive: true, force: true });
});

async function temporary(): Promise<string> {
  const folder = await mkdtemp(join(tmpdir(), "arcue-feed-"));
  folders.push(folder);
  return folder;
}

const answering =
  (response: () => Response): UpdateFetch =>
  async () =>
    response();

describe("updateFeed and updateKeys", () => {
  const keys = [key.publicKey];

  it("checks the latest release from a packaged app, and a feed only a test names from an unpackaged one", () => {
    expect(updateFeed({}, true, keys)).toBe(FEED);
    expect(updateFeed({}, false, keys)).toBeNull();
    expect(updateFeed({ ARCUE_UPDATE_URL: "http://127.0.0.1:4000/update.json" }, false, keys)).toBe(
      "http://127.0.0.1:4000/update.json",
    );
    expect(updateFeed({ ARCUE_UPDATE_URL: "off" }, true, keys)).toBeNull();
    expect(updateFeed({ ARCUE_UPDATE_URL: "" }, true, keys)).toBeNull();
    expect(updateFeed({}, true, [])).toBeNull();
  });

  it("trusts a key from the environment only in an unpackaged app", () => {
    expect(updateKeys({ ARCUE_UPDATE_KEY: key.publicKey }, true)).toEqual(UPDATE_KEYS);
    expect(updateKeys({ ARCUE_UPDATE_KEY: key.publicKey }, false)).toEqual([...UPDATE_KEYS, key.publicKey]);
    expect(updateKeys({}, false)).toEqual(UPDATE_KEYS);
  });
});

describe("readManifest", () => {
  it("takes a manifest one of the keys signed", () => {
    expect(readManifest(signed(), [newUpdateKey().publicKey, key.publicKey], FEED)).toEqual(manifest);
  });

  it("refuses a manifest signed by another key, a changed one, and one that is not signed", () => {
    expect(() => readManifest(signed(manifest, newUpdateKey().privateKey), [key.publicKey], FEED)).toThrow(
      "not signed by Arcue's update key",
    );
    const changed = JSON.parse(signed());
    changed.manifest = changed.manifest.replace("0.2.0", "9.0.0");
    expect(() => readManifest(JSON.stringify(changed), [key.publicKey], FEED)).toThrow(
      "not signed by Arcue's update key",
    );
    expect(() => readManifest(JSON.stringify(manifest), [key.publicKey], FEED)).toThrow("not a signed manifest");
    expect(() => readManifest("<html>", [key.publicKey], FEED)).toThrow("not a signed manifest");
  });

  it("refuses another product, a version that is not a release, and a file over plain HTTP elsewhere", () => {
    const other = { ...manifest, product: "other" } as unknown as UpdateManifest;
    expect(() => readManifest(signed(other), [key.publicKey], FEED)).toThrow();
    expect(() => readManifest(signed({ ...manifest, version: "latest" }), [key.publicKey], FEED)).toThrow();
    const [first, ...rest] = manifest.files;
    if (!first) throw new Error("No file.");
    const plain = { ...manifest, files: [{ ...first, url: "http://example.com/Arcue.dmg" }, ...rest] };
    expect(() => readManifest(signed(plain), [key.publicKey], FEED)).toThrow("names http://example.com/Arcue.dmg");
    const local = { ...manifest, files: [{ ...first, url: "http://127.0.0.1:4000/Arcue.dmg" }, ...rest] };
    expect(readManifest(signed(local), [key.publicKey], "http://127.0.0.1:4000/update.json").files[0]?.url).toBe(
      "http://127.0.0.1:4000/Arcue.dmg",
    );
  });
});

describe("fetchManifest", () => {
  const signal = new AbortController().signal;

  it("reads the feed, and takes a release without a manifest for no update", async () => {
    await expect(
      fetchManifest(
        answering(() => new Response(signed())),
        FEED,
        [key.publicKey],
        signal,
      ),
    ).resolves.toEqual(manifest);
    await expect(
      fetchManifest(
        answering(() => new Response("Not Found", { status: 404 })),
        FEED,
        [key.publicKey],
        signal,
      ),
    ).rejects.toBeInstanceOf(NoManifestError);
    await expect(
      fetchManifest(
        answering(() => new Response("", { status: 503, statusText: "Unavailable" })),
        FEED,
        [],
        signal,
      ),
    ).rejects.toThrow("The update feed answered 503 Unavailable.");
  });
});

describe("fileFor", () => {
  it("finds the installer for a platform, architecture and kind of install", () => {
    expect(fileFor(manifest, "linux", "x64", "tar")?.url).toMatch(/Arcue-linux-x64\.tar\.gz$/);
    expect(fileFor(manifest, "win32", "arm64", "setup")?.url).toMatch(/Arcue-win-arm64-setup\.exe$/);
    expect(fileFor({ ...manifest, files: [] }, "darwin", "arm64", "dmg")).toBeNull();
  });
});

describe("download", () => {
  const bytes = Buffer.from("the new Arcue");
  const file: UpdateFile = {
    platform: "linux",
    arch: "x64",
    kind: "tar",
    url: "https://example.com/Arcue-linux-x64.tar.gz",
    sha256: createHash("sha256").update(bytes).digest("hex"),
    size: bytes.length,
  };
  const signal = new AbortController().signal;

  it("writes a file whose size and checksum match, which hasFile then finds", async () => {
    const path = join(await temporary(), "1", "Arcue-update.tar.gz");
    const progress: number[] = [];
    await download(
      answering(() => new Response(bytes)),
      file,
      path,
      signal,
      (received) => progress.push(received),
    );
    expect(await readFile(path)).toEqual(bytes);
    expect(progress.at(-1)).toBe(bytes.length);
    expect(await hasFile(file, path)).toBe(true);
    await writeFile(path, "the old Arcue!");
    expect(await hasFile(file, path)).toBe(false);
  });

  it("leaves nothing behind for a file that does not match, ends early, grows too large or is refused", async () => {
    const folder = await temporary();
    const path = join(folder, "Arcue-update.tar.gz");
    const gone = async () => {
      await expect(stat(path)).rejects.toThrow();
      await expect(stat(`${path}.part`)).rejects.toThrow();
    };
    await expect(
      download(
        answering(() => new Response("the bad Arcue")),
        file,
        path,
        signal,
      ),
    ).rejects.toThrow("does not match its checksum");
    await gone();
    await expect(
      download(
        answering(() => new Response("short")),
        file,
        path,
        signal,
      ),
    ).rejects.toThrow("ended early");
    await gone();
    await expect(
      download(
        answering(() => new Response(Buffer.concat([bytes, bytes]))),
        file,
        path,
        signal,
      ),
    ).rejects.toThrow("larger than its manifest says");
    await gone();
    await expect(
      download(
        answering(() => new Response("", { status: 403, statusText: "Forbidden" })),
        file,
        path,
        signal,
      ),
    ).rejects.toThrow("answered 403 Forbidden");
    await gone();
    expect(await hasFile(file, path)).toBe(false);
  });
});
