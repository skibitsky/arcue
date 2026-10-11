import { describe, expect, it } from "vitest";
import { createLinkCheck, insideWithoutLinks } from "./links";
import { MemoryPlatform } from "./memory-platform";
import type { FileStat } from "./platform";

class CountingPlatform extends MemoryPlatform {
  statted: string[] = [];

  override async stat(path: string): Promise<FileStat | null> {
    this.statted.push(path);
    return super.stat(path);
  }
}

describe("insideWithoutLinks", () => {
  const platform = new MemoryPlatform({
    files: { "/repo/Art/Rock.png": "rock", "/outside/Secret.png": "secret" },
    symlinks: {
      "/repo/Art/Linked.png": "/outside/Secret.png",
      "/repo/Linked": "/outside",
      "/checkout": "/repo",
    },
  });

  it("accepts paths inside the root, missing ones too, and the root itself", async () => {
    await expect(insideWithoutLinks(platform, "/repo", "/repo/Art/Rock.png")).resolves.toBe(true);
    await expect(insideWithoutLinks(platform, "/repo", "/repo/Art/Missing/Rock.png")).resolves.toBe(true);
    await expect(insideWithoutLinks(platform, "/repo", "/repo")).resolves.toBe(true);
  });

  it("refuses paths outside the root, and links at or above the path", async () => {
    await expect(insideWithoutLinks(platform, "/repo", "/outside/Secret.png")).resolves.toBe(false);
    await expect(insideWithoutLinks(platform, "/repo", "/repo/../outside/Secret.png")).resolves.toBe(false);
    await expect(insideWithoutLinks(platform, "/repo", "/repo/Art/Linked.png")).resolves.toBe(false);
    await expect(insideWithoutLinks(platform, "/repo", "/repo/Linked/Secret.png")).resolves.toBe(false);
  });

  it("allows a root that is itself a link", async () => {
    await expect(insideWithoutLinks(platform, "/checkout", "/checkout/Art/Rock.png")).resolves.toBe(true);
    await expect(insideWithoutLinks(platform, "/checkout", "/checkout/Art/Linked.png")).resolves.toBe(false);
  });
});

describe("createLinkCheck", () => {
  it("checks each folder and file below the root at most once", async () => {
    const platform = new CountingPlatform({ files: { "/repo/a/b/c/Deep.png": "deep" } });
    const check = createLinkCheck(platform, "/repo");
    await expect(check("/repo/a/b/c/Deep.png")).resolves.toBe(true);
    await expect(check("/repo/a/b/c")).resolves.toBe(true);
    await expect(check("/repo/a/b/Other.png")).resolves.toBe(true);
    expect(platform.statted).toEqual([
      "/repo/a",
      "/repo/a/b",
      "/repo/a/b/c",
      "/repo/a/b/c/Deep.png",
      "/repo/a/b/Other.png",
    ]);
  });

  it("stops at the first link", async () => {
    const platform = new CountingPlatform({
      files: { "/outside/c/Deep.png": "deep" },
      symlinks: { "/repo/a/b": "/outside" },
    });
    const check = createLinkCheck(platform, "/repo");
    await expect(check("/repo/a/b/c/Deep.png")).resolves.toBe(false);
    await expect(check("/repo/a/b/c")).resolves.toBe(false);
    expect(platform.statted).toEqual(["/repo/a", "/repo/a/b"]);
  });
});
