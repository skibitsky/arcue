import { describe, expect, it } from "vitest";
import { contentHash } from "./hash";
import { filesMatching, parseUnityGuid, readUnityGuid } from "./identity";
import { MemoryPlatform } from "./memory-platform";
import type { FileStat } from "./platform";

const GUID = "4f2a9c1e8b7d4e3f9a0b1c2d3e4f5a6b";

const meta = [
  "fileFormatVersion: 2",
  `guid: ${GUID}`,
  "ModelImporter:",
  "  serializedVersion: 22200",
  "  internalIDToNameTable: []",
  "",
].join("\n");

describe("parseUnityGuid", () => {
  it("reads the guid line of a Unity .meta file", () => {
    expect(parseUnityGuid(meta)).toBe(GUID);
  });

  it("accepts Windows line ends and uppercase digits, and returns lowercase", () => {
    expect(parseUnityGuid(`fileFormatVersion: 2\r\nguid: ${GUID.toUpperCase()}\r\n`)).toBe(GUID);
  });

  it("finds nothing without a well-formed guid line at the start of a line", () => {
    expect(parseUnityGuid("fileFormatVersion: 2\n")).toBeNull();
    expect(parseUnityGuid(`guid: ${GUID.slice(1)}\n`)).toBeNull();
    expect(parseUnityGuid(`guid: ${GUID}0\n`)).toBeNull();
    expect(parseUnityGuid(`  guid: ${GUID}\n`)).toBeNull();
    expect(parseUnityGuid(`externalObjects:\n  - guid: ${GUID}\n`)).toBeNull();
  });
});

describe("readUnityGuid", () => {
  it("reads the .meta file beside a file", async () => {
    const platform = new MemoryPlatform({ files: { "/Assets/Hero.fbx": "x", "/Assets/Hero.fbx.meta": meta } });
    await expect(readUnityGuid(platform, "/Assets/Hero.fbx")).resolves.toBe(GUID);
  });

  it("finds none without a .meta file, or when a link or a folder sits there", async () => {
    const platform = new MemoryPlatform({
      files: { "/Assets/Hero.fbx": "x", "/Elsewhere/Other.fbx.meta": meta, "/Assets/Box.fbx.meta/inner": "" },
      symlinks: { "/Assets/Rock.fbx.meta": "/Elsewhere/Other.fbx.meta" },
    });
    await expect(readUnityGuid(platform, "/Assets/Hero.fbx")).resolves.toBeNull();
    await expect(readUnityGuid(platform, "/Assets/Rock.fbx")).resolves.toBeNull();
    await expect(readUnityGuid(platform, "/Assets/Box.fbx")).resolves.toBeNull();
  });
});

describe("filesMatching", () => {
  class Recording extends MemoryPlatform {
    readonly calls: string[] = [];

    override async stat(path: string): Promise<FileStat | null> {
      this.calls.push(`stat ${path}`);
      return super.stat(path);
    }

    override async readFile(path: string): Promise<Uint8Array> {
      this.calls.push(`read ${path}`);
      return super.readFile(path);
    }
  }

  it("matches the same size and full hash, or else the same GUID, reading every size before anything else", async () => {
    const recorded = { size: 4, hash: contentHash(new TextEncoder().encode("hero")) };
    const platform = new Recording({
      files: {
        "/a/Long.fbx": "longer",
        "/a/Same.fbx": "hero",
        "/a/Other.fbx": "head",
        "/a/Renamed.fbx": "edited",
        "/a/Renamed.fbx.meta": meta,
      },
    });
    const paths = ["/a/Long.fbx", "/a/Same.fbx", "/a/Other.fbx", "/a/Renamed.fbx", "/a/Missing.fbx"];
    await expect(filesMatching(platform, paths, [recorded], GUID)).resolves.toEqual(["/a/Same.fbx", "/a/Renamed.fbx"]);
    const firstRead = platform.calls.findIndex((call) => !call.startsWith("stat /a/") || call.endsWith(".meta"));
    expect(platform.calls.slice(0, firstRead)).toEqual(paths.map((path) => `stat ${path}`));
    expect(platform.calls.filter((call) => call.startsWith("read /a/") && !call.endsWith(".meta"))).toEqual([
      "read /a/Same.fbx",
      "read /a/Other.fbx",
    ]);
  });
});
