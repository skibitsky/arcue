import { describe, expect, it } from "vitest";
import { ManualClock } from "./manual-clock";
import { MemoryPlatform } from "./memory-platform";
import type { FileChange, Unlock } from "./platform";
import { flush } from "./test-support";

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

describe("MemoryPlatform locks", () => {
  const busy = "Another change kept the reviews of /work/game busy, so nothing was changed. Try again.";

  it("grants a lock to one holder at a time, in the order they asked", async () => {
    const platform = new MemoryPlatform();
    const key = platform.lockKey("/work/game", "reviews");
    const granted: string[] = [];
    const take = (name: string) =>
      platform.lock("/work/game", "reviews").then((unlock) => {
        granted.push(name);
        return unlock;
      });
    const first = await take("first");
    const second = take("second");
    const third = take("third");
    await flush();
    expect(granted).toEqual(["first"]);
    expect(platform.lockWaiters(key)).toBe(2);

    await first();
    await first();
    await flush();
    expect(granted).toEqual(["first", "second"]);
    expect(platform.lockWaiters(key)).toBe(1);

    await (await second)();
    await (await third)();
    expect(granted).toEqual(["first", "second", "third"]);
    expect(platform.heldLocks()).toEqual([]);
  });

  it("sets a timer only for the first waiter, and rejects it when one holder keeps the lock too long", async () => {
    const clock = new ManualClock();
    const platform = new MemoryPlatform({ clock, lockTimeoutMs: 1000 });
    const unlock = await platform.lock("/work/game", "reviews");
    expect(clock.pendingTimers).toBe(0);

    const first = platform.lock("/work/game", "reviews").catch((error: unknown) => error);
    expect(clock.pendingTimers).toBe(1);
    const second = platform.lock("/work/game", "reviews");
    expect(clock.pendingTimers).toBe(1);

    clock.advance(1000);
    await expect(first).resolves.toMatchObject({ code: "timeout", message: busy });
    expect(clock.pendingTimers).toBe(1);

    await unlock();
    const unlockSecond = await second;
    expect(clock.pendingTimers).toBe(0);
    clock.advance(5000);
    expect(platform.heldLocks()).toEqual([platform.lockKey("/work/game", "reviews")]);
    await unlockSecond();
    expect(platform.heldLocks()).toEqual([]);
  });

  it("is one lock however the folder is spelled or linked", async () => {
    const platform = new MemoryPlatform({ files: { "/work/game/.git/HEAD": "" }, symlinks: { "/link": "/work/game" } });
    const key = platform.lockKey("/work/game", "reviews");
    expect(key).toBe("/work/game\nreviews");
    expect(platform.lockKey("/Work/Game", "reviews")).toBe(key);
    expect(platform.lockKey("/link", "reviews")).toBe(key);
    expect(platform.lockKey("/work/game/", "reviews")).toBe(key);
    expect(platform.lockKey("/work/Cafe\u0301", "reviews")).toBe(platform.lockKey("/work/Caf\u00e9", "reviews"));

    const unlock = await platform.lock("/Work/Game", "reviews");
    expect(platform.heldLocks()).toEqual([key]);
    const viaLink = platform.lock("/link", "reviews");
    expect(platform.lockWaiters(key)).toBe(1);
    await unlock();
    await (await viaLink)();
    expect(platform.heldLocks()).toEqual([]);
  });

  it("keeps locks of different names apart", async () => {
    const platform = new MemoryPlatform();
    const reviews = await platform.lock(platform.appDataDir, "reviews");
    const settings = await platform.lock(platform.appDataDir, "settings");
    expect(platform.heldLocks().sort()).toEqual(["/app-data\nreviews", "/app-data\nsettings"]);
    await reviews();
    await settings();
    expect(platform.heldLocks()).toEqual([]);
  });

  it("lets go of the lock it took, even after the folder moved and its path links elsewhere", async () => {
    const platform = new MemoryPlatform({ files: { "/app-data/settings.json": "{}", "/elsewhere/a.txt": "" } });
    const key = platform.lockKey("/app-data", "reviews");
    const unlock = await platform.lock("/app-data", "reviews");
    await platform.rename("/app-data", "/moved");
    await platform.symlink("/app-data", "/elsewhere");
    expect(platform.lockKey("/app-data", "reviews")).not.toBe(key);
    await unlock();
    expect(platform.heldLocks()).toEqual([]);

    await platform.remove("/app-data");
    const again = await platform.lock("/app-data", "reviews");
    expect(platform.heldLocks()).toEqual([key]);
    await again();
  });

  it("locks a folder that does not exist yet as it will be once created", async () => {
    const platform = new MemoryPlatform({ files: { "/work/.keep": "" }, symlinks: { "/repos": "/work" } });
    const unlock = await platform.lock("/repos/game", "reviews");
    await platform.mkdir("/work/game");
    const key = platform.lockKey("/work/game", "reviews");
    expect(platform.heldLocks()).toEqual([key]);
    const real = platform.lock("/work/game", "reviews");
    expect(platform.lockWaiters(key)).toBe(1);
    await unlock();
    await (await real)();
    expect(platform.heldLocks()).toEqual([]);
  });

  it("either grants or times out a waiter whose limit falls due as its holder lets go", async () => {
    for (const releaseFirst of [true, false]) {
      const clock = new ManualClock();
      const platform = new MemoryPlatform({ clock, lockTimeoutMs: 1000 });
      const holder = await platform.lock("/work/game", "reviews");
      if (releaseFirst) clock.setTimer(1000, () => void holder());
      const waiter = platform.lock("/work/game", "reviews").then(
        (unlock): { unlock: Unlock } | { error: unknown } => ({ unlock }),
        (error: unknown) => ({ error }),
      );
      if (!releaseFirst) clock.setTimer(1000, () => void holder());
      clock.advance(1000);
      const outcome = await waiter;
      if (releaseFirst) {
        expect(outcome).toHaveProperty("unlock");
        expect(platform.heldLocks()).toEqual([platform.lockKey("/work/game", "reviews")]);
        if ("unlock" in outcome) await outcome.unlock();
      } else {
        expect(outcome).toEqual({ error: expect.objectContaining({ code: "timeout" }) });
      }
      await flush();
      expect(platform.heldLocks()).toEqual([]);
      expect(platform.lockWaiters(platform.lockKey("/work/game", "reviews"))).toBe(0);
      expect(clock.pendingTimers).toBe(0);
    }
  });

  it("creates no files and notifies no watcher", async () => {
    const platform = new MemoryPlatform({ files: { "/work/game/Hero.fbx": "v1" } });
    await flush();
    const changes: FileChange[] = [];
    platform.watch("/work/game/Hero.fbx", (change) => changes.push(change));
    const root = await platform.list("/");
    const folder = await platform.list("/work/game");
    const unlock = await platform.lock("/work/game", "reviews");
    const settings = await platform.lock(platform.appDataDir, "settings");
    await unlock();
    await settings();
    await flush();
    await expect(platform.list("/")).resolves.toEqual(root);
    await expect(platform.list("/work/game")).resolves.toEqual(folder);
    await expect(platform.exists(platform.appDataDir)).resolves.toBe(false);
    expect(changes).toEqual([]);
  });

  it("starts each waiter's limit when the lock passes to the holder before it", async () => {
    const clock = new ManualClock();
    const platform = new MemoryPlatform({ clock, lockTimeoutMs: 1000 });
    const outcomes: string[] = [];
    const holdFor900 = (index: number) =>
      platform.lock("/work/game", "reviews").then(
        (unlock) => {
          outcomes.push(`held ${index}`);
          clock.setTimer(900, () => void unlock());
        },
        () => outcomes.push(`timed out ${index}`),
      );
    const holders = Array.from({ length: 11 }, (_, index) => holdFor900(index));
    for (let turn = 0; turn < 11; turn++) {
      await flush();
      clock.advance(900);
    }
    await Promise.all(holders);
    expect(outcomes).toEqual(Array.from({ length: 11 }, (_, index) => `held ${index}`));
    expect(platform.heldLocks()).toEqual([]);
  });
});
