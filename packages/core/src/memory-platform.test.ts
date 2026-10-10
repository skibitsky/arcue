import { describe, expect, it } from "vitest";
import { ManualClock } from "./manual-clock";
import { MemoryPlatform } from "./memory-platform";
import type { FileChange } from "./platform";

describe("MemoryPlatform files", () => {
  it("reads back text and bytes", async () => {
    const platform = new MemoryPlatform();
    await platform.writeFile("/work/notes.txt", "Fold the thumb back");
    await platform.writeFile("/work/data.bin", Uint8Array.of(1, 2, 3));
    await expect(platform.readText("/work/notes.txt")).resolves.toBe("Fold the thumb back");
    await expect(platform.readFile("/work/data.bin")).resolves.toEqual(Uint8Array.of(1, 2, 3));
  });

  it("starts with the given files", async () => {
    const platform = new MemoryPlatform({ files: { "/samples/Hero.fbx": Uint8Array.of(9) } });
    await expect(platform.exists("/samples/Hero.fbx")).resolves.toBe(true);
    await expect(platform.exists("/samples")).resolves.toBe(true);
  });

  it("copies data in and out, so callers cannot change stored files", async () => {
    const platform = new MemoryPlatform();
    const data = Uint8Array.of(1, 2);
    await platform.writeFile("/a.bin", data);
    data[0] = 9;
    const read = await platform.readFile("/a.bin");
    read[1] = 9;
    await expect(platform.readFile("/a.bin")).resolves.toEqual(Uint8Array.of(1, 2));
  });

  it("creates missing parent folders on write, including for atomic writes", async () => {
    const platform = new MemoryPlatform();
    await platform.writeFileAtomic("/repo/.arcue/reviews/Hero.fbx/review.json", "{}");
    await expect(platform.stat("/repo/.arcue/reviews")).resolves.toMatchObject({ kind: "directory" });
    await expect(platform.readText("/repo/.arcue/reviews/Hero.fbx/review.json")).resolves.toBe("{}");
  });

  it("reports size and modification time from the clock", async () => {
    const clock = new ManualClock(5000);
    const platform = new MemoryPlatform({ clock });
    await platform.writeFile("/a.txt", "abc");
    clock.advance(10);
    await expect(platform.stat("/a.txt")).resolves.toEqual({ kind: "file", size: 3, modifiedMs: 5000 });
    await expect(platform.stat("/missing")).resolves.toBeNull();
  });

  it("rejects reads of missing files as not found", async () => {
    const platform = new MemoryPlatform();
    await expect(platform.readFile("/missing.fbx")).rejects.toMatchObject({ code: "not-found" });
    await expect(platform.list("/missing")).rejects.toMatchObject({ code: "not-found" });
  });

  it("refuses to write through a file or over a folder", async () => {
    const platform = new MemoryPlatform();
    await platform.writeFile("/a", "file");
    await expect(platform.writeFile("/a/b.txt", "x")).rejects.toMatchObject({ code: "conflict" });
    await platform.mkdir("/folder");
    await expect(platform.writeFile("/folder", "x")).rejects.toMatchObject({ code: "conflict" });
  });

  it("lists a folder's direct entries by name", async () => {
    const platform = new MemoryPlatform();
    await platform.writeFile("/r/b.json", "{}");
    await platform.writeFile("/r/a.png", "");
    await platform.writeFile("/r/rounds/round-1/prompt.md", "");
    await platform.mkdir("/r/empty");
    await expect(platform.list("/r")).resolves.toEqual([
      { name: "a.png", kind: "file" },
      { name: "b.json", kind: "file" },
      { name: "empty", kind: "directory" },
      { name: "rounds", kind: "directory" },
    ]);
  });

  it("lists the root, and never a sibling whose name starts with the folder's", async () => {
    const platform = new MemoryPlatform();
    await platform.writeFile("/r/a.png", "");
    await platform.writeFile("/r2/b.png", "");
    await platform.writeFile("/r.png", "");
    await expect(platform.list("/r")).resolves.toEqual([{ name: "a.png", kind: "file" }]);
    await expect(platform.list("/")).resolves.toEqual([
      { name: "r", kind: "directory" },
      { name: "r.png", kind: "file" },
      { name: "r2", kind: "directory" },
    ]);
  });

  it("removes a folder with everything in it, and ignores missing paths", async () => {
    const platform = new MemoryPlatform();
    await platform.writeFile("/r/rounds/round-1/c1.png", "");
    await platform.writeFile("/r/review.json", "{}");
    await platform.remove("/r/rounds");
    await expect(platform.list("/r")).resolves.toEqual([{ name: "review.json", kind: "file" }]);
    await expect(platform.remove("/nothing/here")).resolves.toBeUndefined();
    await expect(platform.remove("/")).rejects.toMatchObject({ code: "invalid-input" });
  });

  it("removes a folder only while it is empty", async () => {
    const platform = new MemoryPlatform();
    await platform.writeFile("/r/full/review.json", "{}");
    await platform.mkdir("/r/empty");
    await expect(platform.removeEmptyFolder("/r/full")).rejects.toMatchObject({ code: "conflict" });
    await expect(platform.removeEmptyFolder("/r/missing")).rejects.toMatchObject({ code: "not-found" });
    await platform.removeEmptyFolder("/r/empty");
    await expect(platform.list("/r")).resolves.toEqual([{ name: "full", kind: "directory" }]);
  });

  it("renames a folder with everything in it, creating the folders above the new name", async () => {
    const platform = new MemoryPlatform();
    await platform.writeFile("/r/Hero.fbx/review.json", "{}");
    await platform.writeFile("/r/Hero.fbx/rounds/round-1/prompt.md", "p");
    await platform.rename("/r/Hero.fbx", "/r/New/Striker.fbx");
    await expect(platform.exists("/r/Hero.fbx")).resolves.toBe(false);
    await expect(platform.readText("/r/New/Striker.fbx/review.json")).resolves.toBe("{}");
    await expect(platform.readText("/r/New/Striker.fbx/rounds/round-1/prompt.md")).resolves.toBe("p");
  });

  it("never renames over an existing path, into itself, or from a missing one", async () => {
    const platform = new MemoryPlatform();
    await platform.writeFile("/r/a/review.json", "a");
    await platform.mkdir("/r/b");
    await expect(platform.rename("/r/a", "/r/b")).rejects.toMatchObject({ code: "conflict" });
    await expect(platform.rename("/r/a", "/r/a/inner")).rejects.toMatchObject({ code: "invalid-input" });
    await expect(platform.rename("/r/missing", "/r/c")).rejects.toMatchObject({ code: "not-found" });
    await expect(platform.readText("/r/a/review.json")).resolves.toBe("a");
  });
});

describe("MemoryPlatform watching", () => {
  it("delivers changes asynchronously", async () => {
    const platform = new MemoryPlatform();
    const changes: FileChange[] = [];
    platform.watch("/a.txt", (change) => changes.push(change));
    const write = platform.writeFile("/a.txt", "x");
    expect(changes).toEqual([]);
    await write;
    await Promise.resolve();
    expect(changes).toEqual([{ kind: "created", path: "/a.txt" }]);
  });

  it("reports creation, change and removal of a watched file", async () => {
    const platform = new MemoryPlatform();
    const changes: FileChange[] = [];
    const stop = platform.watch("/work/Hero.fbx", (change) => changes.push(change));
    await platform.writeFile("/work/Hero.fbx", "v1");
    await platform.writeFile("/work/Hero.fbx", "v2");
    await platform.writeFile("/work/Other.fbx", "v1");
    await platform.remove("/work");
    await Promise.resolve();
    stop();
    await platform.writeFile("/work/Hero.fbx", "v3");
    await Promise.resolve();
    expect(changes).toEqual([
      { kind: "created", path: "/work/Hero.fbx" },
      { kind: "changed", path: "/work/Hero.fbx" },
      { kind: "removed", path: "/work/Hero.fbx" },
    ]);
  });

  it("reports a rename as a removal of the old name and a creation of the new one", async () => {
    const platform = new MemoryPlatform({ files: { "/work/Hero.fbx": "v1" } });
    await Promise.resolve();
    const changes: FileChange[] = [];
    platform.watch("/work/Hero.fbx", (change) => changes.push(change));
    platform.watch("/work/Striker.fbx", (change) => changes.push(change));
    await platform.rename("/work/Hero.fbx", "/work/Striker.fbx");
    await Promise.resolve();
    expect(changes).toEqual([
      { kind: "removed", path: "/work/Hero.fbx" },
      { kind: "created", path: "/work/Striker.fbx" },
    ]);
  });
});

describe("MemoryPlatform environment", () => {
  it("finds the git repository that contains a path", async () => {
    const platform = new MemoryPlatform({ files: { "/work/game/.git/HEAD": "ref: refs/heads/main" } });
    await expect(platform.findWorkspaceRoot("/work/game/Assets/Hero.fbx")).resolves.toBe("/work/game");
    await expect(platform.findWorkspaceRoot("/downloads/Hero.fbx")).resolves.toBeNull();
  });

  it("has no clipboard unless asked for one", async () => {
    await expect(new MemoryPlatform().writeClipboard("x")).rejects.toMatchObject({ code: "unavailable" });
    const platform = new MemoryPlatform({ clipboard: "available" });
    await platform.writeClipboard("3D review · round 4");
    expect(platform.clipboardText).toBe("3D review · round 4");
  });

  it("normalizes the app data folder", () => {
    expect(new MemoryPlatform({ appDataDir: "/data/arcue/" }).appDataDir).toBe("/data/arcue");
  });
});

describe("MemoryPlatform symbolic links", () => {
  const linked = () =>
    new MemoryPlatform({
      files: { "/outside/secret.png": "secret", "/repo/real/a.png": "a" },
      symlinks: { "/repo/link.png": "/outside/secret.png", "/repo/folder": "real" },
    });

  it("reports a link at the path itself without following it", async () => {
    const platform = linked();
    await expect(platform.stat("/repo/link.png")).resolves.toMatchObject({ kind: "symlink" });
    await expect(platform.stat("/repo/folder")).resolves.toMatchObject({ kind: "symlink" });
    await expect(platform.list("/repo")).resolves.toEqual([
      { name: "folder", kind: "symlink" },
      { name: "link.png", kind: "symlink" },
      { name: "real", kind: "directory" },
    ]);
  });

  it("follows links when reading, and in the folders above a path", async () => {
    const platform = linked();
    await expect(platform.readText("/repo/link.png")).resolves.toBe("secret");
    await expect(platform.stat("/repo/folder/a.png")).resolves.toMatchObject({ kind: "file" });
    await expect(platform.readText("/repo/folder/a.png")).resolves.toBe("a");
    await expect(platform.list("/repo/folder")).resolves.toEqual([{ name: "a.png", kind: "file" }]);
  });

  it("replaces a link on atomic writes and removes the link, not its target", async () => {
    const platform = linked();
    await platform.writeFileAtomic("/repo/link.png", "mine");
    await expect(platform.stat("/repo/link.png")).resolves.toMatchObject({ kind: "file" });
    await expect(platform.readText("/outside/secret.png")).resolves.toBe("secret");
    await platform.remove("/repo/folder");
    await expect(platform.exists("/repo/real/a.png")).resolves.toBe(true);
  });

  it("rejects link loops", async () => {
    const platform = new MemoryPlatform({ symlinks: { "/a": "/b", "/b": "/a" } });
    await expect(platform.readFile("/a")).rejects.toMatchObject({ code: "invalid-input" });
  });
});
