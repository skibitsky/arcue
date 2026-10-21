import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import * as fs from "node:fs/promises";
import { rename, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { FileChange, ImportWorker } from "@arcue/core";
import { ArcueCore, MemoryPlatform } from "@arcue/core";
import { fbxImporter } from "@arcue/import-fbx";
import { createMemoryChannel, createPeer, createRemoteClient } from "@arcue/protocol";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fromNativePath, toNativePath } from "./native-paths";
import { NodePlatform } from "./node-platform";
import type { Fixture } from "./test-children";
import { buildFixture } from "./test-children";

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, writeFile: vi.fn(actual.writeFile) };
});

const CRATE = fileURLToPath(new URL("../../../samples/crate.fbx", import.meta.url));

let root: string;
let native: string;
let platform: NodePlatform;

const noWorker = (): ImportWorker => {
  throw new Error("No import worker in this test.");
};

beforeEach(() => {
  native = realpathSync(mkdtempSync(join(tmpdir(), "arcue-platform-")));
  root = fromNativePath(native);
  platform = new NodePlatform({ appDataDir: join(native, "app-data"), startImportWorker: noWorker });
});

afterEach(() => {
  rmSync(native, { recursive: true, force: true });
});

const at = (relative: string) => `${root}/${relative}`;

async function until(check: () => boolean, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error("Timed out waiting for a file change.");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

describe("NodePlatform files", () => {
  it("reads back text and bytes, creating parent folders", async () => {
    await platform.writeFile(at("work/notes.txt"), "Fold the thumb back");
    await platform.writeFile(at("work/data.bin"), Uint8Array.of(1, 2, 3));
    await expect(platform.readText(at("work/notes.txt"))).resolves.toBe("Fold the thumb back");
    const bytes = await platform.readFile(at("work/data.bin"));
    expect(bytes).toEqual(Uint8Array.of(1, 2, 3));
    expect(bytes.byteOffset).toBe(0);
    expect(bytes.buffer.byteLength).toBe(3);
  });

  it("writes atomically through a temporary file and leaves none behind", async () => {
    await platform.writeFileAtomic(at("repo/.arcue/reviews/Hero.fbx/review.json"), "{}");
    await platform.writeFileAtomic(at("repo/.arcue/reviews/Hero.fbx/review.json"), '{"v":2}');
    await expect(platform.readText(at("repo/.arcue/reviews/Hero.fbx/review.json"))).resolves.toBe('{"v":2}');
    await expect(platform.list(at("repo/.arcue/reviews/Hero.fbx"))).resolves.toEqual([
      { name: "review.json", kind: "file" },
    ]);
  });

  it("reports kind, size and modification time, and null for missing paths", async () => {
    await platform.writeFile(at("a.txt"), "abc");
    const stat = await platform.stat(at("a.txt"));
    expect(stat).toMatchObject({ kind: "file", size: 3 });
    expect(stat?.modifiedMs).toBeGreaterThan(0);
    await expect(platform.stat(at("missing"))).resolves.toBeNull();
    await expect(platform.stat(at("a.txt/below"))).resolves.toBeNull();
    await expect(platform.exists(root)).resolves.toBe(true);
  });

  it("rejects reads of missing files as not found", async () => {
    await expect(platform.readFile(at("missing.fbx"))).rejects.toMatchObject({ code: "not-found" });
    await expect(platform.readText(at("missing.txt"))).rejects.toMatchObject({ code: "not-found" });
    await expect(platform.list(at("missing"))).rejects.toMatchObject({ code: "not-found" });
  });

  it("refuses to write over a folder", async () => {
    await platform.mkdir(at("folder/inner"));
    await platform.mkdir(at("folder/inner"));
    await expect(platform.writeFile(at("folder"), "x")).rejects.toMatchObject({ code: "conflict" });
  });

  it("lists a folder's direct entries sorted by name", async () => {
    await platform.writeFile(at("r/b.json"), "{}");
    await platform.writeFile(at("r/a.png"), "");
    await platform.writeFile(at("r/rounds/round-1/prompt.md"), "");
    await platform.mkdir(at("r/empty"));
    await expect(platform.list(at("r"))).resolves.toEqual([
      { name: "a.png", kind: "file" },
      { name: "b.json", kind: "file" },
      { name: "empty", kind: "directory" },
      { name: "rounds", kind: "directory" },
    ]);
  });

  it("removes a folder with everything in it, ignores missing paths and refuses the root", async () => {
    await platform.writeFile(at("r/rounds/round-1/c1.png"), "");
    await platform.writeFile(at("r/review.json"), "{}");
    await platform.remove(at("r/rounds"));
    await expect(platform.list(at("r"))).resolves.toEqual([{ name: "review.json", kind: "file" }]);
    await expect(platform.remove(at("nothing/here"))).resolves.toBeUndefined();
    await expect(platform.remove("/")).rejects.toMatchObject({ code: "invalid-input" });
  });

  it("removes a folder only while it is empty", async () => {
    await platform.writeFile(at("r/full/review.json"), "{}");
    await platform.mkdir(at("r/empty"));
    await expect(platform.removeEmptyFolder(at("r/full"))).rejects.toMatchObject({ code: "conflict" });
    await expect(platform.removeEmptyFolder(at("r/missing"))).rejects.toMatchObject({ code: "not-found" });
    await platform.removeEmptyFolder(at("r/empty"));
    await expect(platform.list(at("r"))).resolves.toEqual([{ name: "full", kind: "directory" }]);
  });

  it("renames a folder with everything in it, creating the folders above the new name", async () => {
    await platform.writeFile(at("r/Hero.fbx/review.json"), "{}");
    await platform.writeFile(at("r/Hero.fbx/rounds/round-1/prompt.md"), "p");
    await platform.rename(at("r/Hero.fbx"), at("r/New/Striker.fbx"));
    await expect(platform.exists(at("r/Hero.fbx"))).resolves.toBe(false);
    await expect(platform.readText(at("r/New/Striker.fbx/review.json"))).resolves.toBe("{}");
    await expect(platform.readText(at("r/New/Striker.fbx/rounds/round-1/prompt.md"))).resolves.toBe("p");
  });

  it("never renames over an existing file or folder, or from a missing path", async () => {
    await platform.writeFile(at("r/a/review.json"), "a");
    await platform.writeFile(at("r/b.txt"), "b");
    await platform.mkdir(at("r/empty"));
    await expect(platform.rename(at("r/a"), at("r/empty"))).rejects.toMatchObject({ code: "conflict" });
    await expect(platform.rename(at("r/a/review.json"), at("r/b.txt"))).rejects.toMatchObject({ code: "conflict" });
    await expect(platform.rename(at("r/missing"), at("r/c"))).rejects.toMatchObject({ code: "not-found" });
    await expect(platform.readText(at("r/a/review.json"))).resolves.toBe("a");
    await expect(platform.readText(at("r/b.txt"))).resolves.toBe("b");
  });
});

describe("NodePlatform symbolic links", () => {
  beforeEach(() => {
    mkdirSync(join(native, "outside"));
    writeFileSync(join(native, "outside", "secret.png"), "secret");
    mkdirSync(join(native, "repo", "real"), { recursive: true });
    writeFileSync(join(native, "repo", "real", "a.png"), "a");
    symlinkSync(join(native, "outside", "secret.png"), join(native, "repo", "link.png"));
    symlinkSync(join(native, "repo", "real"), join(native, "repo", "folder"), "junction");
  });

  it("reports a link at the path itself without following it", async () => {
    await expect(platform.stat(at("repo/link.png"))).resolves.toMatchObject({ kind: "symlink", size: 0 });
    await expect(platform.stat(at("repo/folder"))).resolves.toMatchObject({ kind: "symlink" });
    await expect(platform.exists(at("repo/link.png"))).resolves.toBe(true);
    await expect(platform.list(at("repo"))).resolves.toEqual([
      { name: "folder", kind: "symlink" },
      { name: "link.png", kind: "symlink" },
      { name: "real", kind: "directory" },
    ]);
  });

  it("reports a dangling link as a link", async () => {
    symlinkSync(join(native, "gone.png"), join(native, "repo", "dangling.png"));
    await expect(platform.stat(at("repo/dangling.png"))).resolves.toMatchObject({ kind: "symlink" });
  });

  it("follows links when reading, and in the folders above a path", async () => {
    await expect(platform.readText(at("repo/link.png"))).resolves.toBe("secret");
    await expect(platform.stat(at("repo/folder/a.png"))).resolves.toMatchObject({ kind: "file" });
    await expect(platform.list(at("repo/folder"))).resolves.toEqual([{ name: "a.png", kind: "file" }]);
  });

  it("replaces a link on atomic writes, and removes the link, not its target", async () => {
    await platform.writeFileAtomic(at("repo/link.png"), "mine");
    await expect(platform.stat(at("repo/link.png"))).resolves.toMatchObject({ kind: "file" });
    await expect(platform.readText(at("outside/secret.png"))).resolves.toBe("secret");
    await platform.remove(at("repo/folder"));
    await expect(platform.exists(at("repo/real/a.png"))).resolves.toBe(true);
    await expect(platform.exists(at("repo/folder"))).resolves.toBe(false);
  });
});

describe("NodePlatform watching", () => {
  it("reports creation, change and removal of a watched file, and stops when asked", async () => {
    await platform.mkdir(at("work"));
    const changes: FileChange[] = [];
    const stop = platform.watch(at("work/Hero.fbx"), (change) => changes.push(change));
    await new Promise((resolve) => setTimeout(resolve, 50));
    await platform.writeFile(at("work/Hero.fbx"), "v1");
    await until(() => changes.some((change) => change.kind === "created"));
    await platform.writeFile(at("work/Hero.fbx"), "v2");
    await until(() => changes.some((change) => change.kind === "changed"));
    await platform.remove(at("work/Hero.fbx"));
    await until(() => changes.some((change) => change.kind === "removed"));
    expect(changes.every((change) => change.path === at("work/Hero.fbx"))).toBe(true);
    stop();
    const count = changes.length;
    await platform.writeFile(at("work/Hero.fbx"), "v3");
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(changes).toHaveLength(count);
  });

  it("sees an atomic replace made by renaming another file over the watched one", async () => {
    await platform.writeFile(at("work/Hero.fbx"), "v1");
    const changes: FileChange[] = [];
    const stop = platform.watch(at("work/Hero.fbx"), (change) => changes.push(change));
    await new Promise((resolve) => setTimeout(resolve, 50));
    await writeFile(join(native, "work", "Hero.fbx.part"), "v2");
    await rename(join(native, "work", "Hero.fbx.part"), join(native, "work", "Hero.fbx"));
    await until(() => changes.length > 0);
    expect(changes.at(-1)).toEqual({ kind: "changed", path: at("work/Hero.fbx") });
    stop();
  });

  it("ignores other files in the same folder", async () => {
    await platform.mkdir(at("work"));
    const changes: FileChange[] = [];
    const stop = platform.watch(at("work/Hero.fbx"), (change) => changes.push(change));
    await new Promise((resolve) => setTimeout(resolve, 50));
    await platform.writeFile(at("work/Other.fbx"), "v1");
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(changes).toEqual([]);
    stop();
  });

  it("keeps watching when the file's folder is removed and made again", async () => {
    await platform.writeFile(at("export/Hero.fbx"), "v1");
    const changes: FileChange[] = [];
    const stop = platform.watch(at("export/Hero.fbx"), (change) => changes.push(change));
    await new Promise((resolve) => setTimeout(resolve, 50));
    rmSync(join(native, "export"), { recursive: true });
    await until(() => changes.some((change) => change.kind === "removed"));
    await new Promise((resolve) => setTimeout(resolve, 100));
    mkdirSync(join(native, "export"));
    await new Promise((resolve) => setTimeout(resolve, 100));
    await writeFile(join(native, "export", "Hero.fbx"), "v2");
    await until(() => changes.some((change) => change.kind === "created"));
    stop();
  });

  it("watches a file whose folders do not exist yet", async () => {
    const path = at("repo/.arcue/reviews/Hero.fbx/review.json");
    const changes: FileChange[] = [];
    const stop = platform.watch(path, (change) => changes.push(change));
    await new Promise((resolve) => setTimeout(resolve, 50));
    await platform.writeFileAtomic(path, "{}");
    await until(() => changes.some((change) => change.kind === "created"));
    await new Promise((resolve) => setTimeout(resolve, 50));
    await platform.writeFileAtomic(path, '{"v":2}');
    await until(() => changes.some((change) => change.kind === "changed"));
    stop();
  });
});

describe("NodePlatform environment", () => {
  it("finds the git repository that contains a path, including a worktree's .git file", async () => {
    await platform.mkdir(at("game/.git"));
    await platform.writeFile(at("tree/.git"), "gitdir: elsewhere");
    await expect(platform.findWorkspaceRoot(at("game/Assets/Hero.fbx"))).resolves.toBe(at("game"));
    await expect(platform.findWorkspaceRoot(at("tree/Hero.fbx"))).resolves.toBe(at("tree"));
    await expect(platform.findWorkspaceRoot(at("downloads/Hero.fbx"))).resolves.toBe(
      (await platform.exists("/.git")) ? "/" : null,
    );
  });

  it("writes the clipboard through the host, and rejects without one so the window writes it", async () => {
    await expect(platform.writeClipboard("prompt")).rejects.toMatchObject({ code: "unavailable" });
    const written: string[] = [];
    const withClipboard = new NodePlatform({
      appDataDir: native,
      startImportWorker: noWorker,
      writeClipboard: async (text) => {
        written.push(text);
      },
    });
    await withClipboard.writeClipboard("prompt");
    expect(written).toEqual(["prompt"]);
  });

  it("uses / separators for the app data folder", () => {
    expect(platform.appDataDir).toBe(`${root}/app-data`);
  });
});

/** Whether the promise is still pending after `ms`. */
async function pendingAfter(promise: Promise<unknown>, ms: number): Promise<boolean> {
  let settled = false;
  void promise.then(
    () => (settled = true),
    () => (settled = true),
  );
  await new Promise((resolve) => setTimeout(resolve, ms));
  return !settled;
}

/** Holds the lock of `first`, checks that a lock of `second` waits for it, then lets both go. */
async function excludeEachOther(first: () => Promise<() => Promise<void>>, second: () => Promise<() => Promise<void>>) {
  const unlock = await first();
  const waiting = second();
  expect(await pendingAfter(waiting, 200)).toBe(true);
  await unlock();
  await (await waiting)();
}

function listAll(folder: string): string[] {
  return readdirSync(folder, { recursive: true, encoding: "utf8" }).sort();
}

describe("NodePlatform locks", () => {
  it("keeps out a second NodePlatform on the same data folder", async () => {
    const other = new NodePlatform({ appDataDir: join(native, "app-data"), startImportWorker: noWorker });
    await platform.mkdir(at("game"));
    await excludeEachOther(
      () => platform.lock(at("game"), "reviews"),
      () => other.lock(at("game"), "reviews"),
    );
    const unlock = await platform.lock(at("game"), "reviews");
    await (await other.lock(at("game"), "settings"))();
    await (await other.lock(at("other"), "reviews"))();
    await unlock();
  });

  it("locks a folder the same through a link, in another case and in decomposed Unicode", async () => {
    mkdirSync(join(native, "game"));
    mkdirSync(join(native, "café"));
    symlinkSync(join(native, "game"), join(native, "link"), "junction");
    for (const [first, second] of [
      ["game", "link"],
      ["game", "GAME"],
      ["café", "cafe\u0301"],
    ] as const) {
      await excludeEachOther(
        () => platform.lock(at(first), "reviews"),
        () => platform.lock(at(second), "reviews"),
      );
    }
  });

  it("locks a folder that does not exist yet behind a link the same as once it exists", async () => {
    mkdirSync(join(native, "real"));
    symlinkSync(join(native, "real"), join(native, "link"), "junction");
    const unlock = await platform.lock(at("link/missing"), "reviews");
    mkdirSync(join(native, "real", "missing"));
    const waiting = platform.lock(at("real/missing"), "reviews");
    expect(await pendingAfter(waiting, 200)).toBe(true);
    await unlock();
    await (await waiting)();
  });

  it("keeps its lock files in the data folder and leaves the repository alone", async () => {
    await platform.writeFile(at("repo/.git/HEAD"), "ref: refs/heads/main");
    await platform.writeFile(at("repo/Hero.fbx"), "fbx");
    await platform.writeFile(at("repo/.arcue/reviews/Hero.fbx/review.json"), "{}");
    const before = listAll(join(native, "repo"));

    const unlock = await platform.lock(at("repo"), "reviews");

    expect(listAll(join(native, "repo"))).toEqual(before);
    expect(readdirSync(join(native, "app-data", "locks"))).toEqual([expect.stringMatching(/^[0-9a-f]{32}\.lock$/)]);
    await unlock();
    expect(readdirSync(join(native, "app-data", "locks"))).toEqual([]);
  });

  it("refuses as forbidden when a file is in the way of its locks folder", async () => {
    mkdirSync(join(native, "app-data"));
    writeFileSync(join(native, "app-data", "locks"), "");
    await expect(platform.lock(at("game"), "reviews")).rejects.toMatchObject({
      code: "forbidden",
      message: `Arcue cannot lock the reviews of ${at("game")}: ${join(native, "app-data", "locks")} cannot be written.`,
    });
  });

  it("refuses a write on a read-only file system as forbidden", async () => {
    vi.mocked(fs.writeFile).mockImplementationOnce(() =>
      Promise.reject(Object.assign(new Error("EROFS: read-only file system"), { code: "EROFS" })),
    );
    await expect(platform.writeFile(at("a.txt"), "x")).rejects.toMatchObject({ code: "forbidden" });
  });

  it.skipIf(process.platform !== "win32")("locks a folder the same through a junction and a subst drive", async () => {
    mkdirSync(join(native, "game"));
    symlinkSync(join(native, "game"), join(native, "junction"), "junction");
    await excludeEachOther(
      () => platform.lock(at("game"), "reviews"),
      () => platform.lock(at("junction"), "reviews"),
    );
    const letter = [..."ZYXWVUTSRQPONMLKJ"].find(
      (candidate) => spawnSync("subst", [`${candidate}:`, native]).status === 0,
    );
    if (!letter) return;
    try {
      await excludeEachOther(
        () => platform.lock(at("game"), "reviews"),
        () => platform.lock(`${letter}:/game`, "reviews"),
      );
    } finally {
      spawnSync("subst", [`${letter}:`, "/D"]);
    }
  });

  describe("beside another process", () => {
    let fixture: Fixture;

    beforeAll(async () => {
      fixture = await buildFixture();
    }, 60_000);

    afterAll(async () => {
      await fixture.stopAll();
      fixture.remove();
    });

    it("moves a review that another process watches with its model, or leaves it whole where it ends up", async () => {
      const imports = new MemoryPlatform({ importers: [fbxImporter] });
      const reviewing = new NodePlatform({
        appDataDir: join(native, "app-data"),
        startImportWorker: () => imports.startImportWorker(),
      });
      mkdirSync(join(native, "repo", ".git"), { recursive: true });
      copyFileSync(CRATE, join(native, "repo", "Crate.fbx"));
      const errors: unknown[] = [];
      const core = await ArcueCore.start({ platform: reviewing, onError: (error) => errors.push(error) });
      const [coreSide, windowSide] = createMemoryChannel();
      const window = createRemoteClient(createPeer(windowSide, { handleRequest: () => undefined }));
      core.connect(coreSide, { connection: "window-1", caller: "window" });
      try {
        const { assetId } = await window.execute("asset.open", { path: at("repo/Crate.fbx") });
        await core.idle();
        const { version } = await window.query("scene.get", { assetId });
        const { commentId } = await window.execute("comment.create", {
          assetId,
          text: "The lid sits too high.",
          version,
          time: { kind: "none" },
          target: null,
          camera: { position: [0, 1, 3], target: [0, 1, 0], up: [0, 1, 0], fov: 30 },
          context: { vertexCount: 0, bones: [], centroid: null, joints: [], viewLabel: "front" },
          screenshot: Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 1),
        });
        const from = at("repo/.arcue/reviews/Crate.fbx");
        const to = at("repo/.arcue/reviews/Box.fbx");
        const watcher = fixture.start({ mode: "watch", folder: toNativePath(from) }, native);
        await watcher.message((message) => message === "watching");

        await rename(join(native, "repo", "Crate.fbx"), join(native, "repo", "Box.fbx"));
        const failure = await window.execute("asset.relink", { assetId, path: at("repo/Box.fbx") }).then(
          () => null,
          (error: unknown) => error,
        );
        await core.idle();
        watcher.send("release");
        await watcher.exited;

        const folder = (await reviewing.exists(`${to}/review.json`)) ? to : from;
        await expect(reviewing.exists(folder === to ? from : to)).resolves.toBe(false);
        await expect(reviewing.list(folder)).resolves.toEqual([
          { name: "review.json", kind: "file" },
          { name: "screenshots", kind: "directory" },
        ]);
        await expect(reviewing.list(`${folder}/screenshots`)).resolves.toEqual([
          { name: `${commentId}.png`, kind: "file" },
        ]);
        const saved = JSON.parse(await reviewing.readText(`${folder}/review.json`));
        expect(saved).toMatchObject({ comments: [{ id: commentId, text: "The lid sits too high." }] });
        if (failure === null) {
          expect(folder).toBe(to);
          expect(saved).toMatchObject({ asset: { path: "Box.fbx" } });
          await expect(window.query("review.get", { assetId })).resolves.toMatchObject({
            comments: [{ id: commentId }],
          });
        } else if (folder === to) {
          await expect(window.execute("comment.delete", { assetId, commentId })).rejects.toMatchObject({
            message: expect.stringContaining("could not be finished"),
          });
        } else {
          expect(saved).toMatchObject({ asset: { path: "Crate.fbx" } });
        }
        if (process.platform !== "win32") expect(failure).toBeNull();
        expect(errors).toEqual([]);
      } finally {
        core.dispose();
      }
    });
  });
});

describe("Windows paths", () => {
  it("converts drive and network paths both ways", () => {
    expect(toNativePath("C:/work/Hero.fbx", "win32")).toBe("C:\\work\\Hero.fbx");
    expect(toNativePath("c:/", "win32")).toBe("C:\\");
    expect(toNativePath("//server/share/Hero.fbx", "win32")).toBe("\\\\server\\share\\Hero.fbx");
    expect(fromNativePath("c:\\work\\..\\Hero.fbx", "win32")).toBe("C:/Hero.fbx");
    expect(fromNativePath("\\\\server\\share\\Hero.fbx", "win32")).toBe("//server/share/Hero.fbx");
    expect(toNativePath("/work/Hero.fbx", "posix")).toBe("/work/Hero.fbx");
  });

  it("keeps / paths for a platform with Windows paths", () => {
    const windows = new NodePlatform({
      appDataDir: "C:\\Users\\me\\AppData",
      startImportWorker: noWorker,
      pathStyle: "win32",
    });
    expect(windows.appDataDir).toBe("C:/Users/me/AppData");
  });
});
