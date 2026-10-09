import { describe, expect, it } from "vitest";
import type { FolderListener, WatchFolder } from "./folder-watchers";
import { FolderWatchers } from "./folder-watchers";

function fakeSystem() {
  const opened: { folder: string; change: (name: string | null) => void; error: () => void; closed: boolean }[] = [];
  const watchFolder: WatchFolder = (folder, change, error) => {
    const entry = { folder, change, error, closed: false };
    opened.push(entry);
    return {
      close: () => {
        entry.closed = true;
      },
    };
  };
  const checks: string[] = [];
  const present = new Set(["/work"]);
  const folderExists = async (path: string) => {
    checks.push(path);
    return present.has(path);
  };
  return { opened, checks, present, watchers: new FolderWatchers(watchFolder, folderExists) };
}

function listener(name: string | null) {
  const heard = { changed: 0, ended: 0 };
  const entry: FolderListener = {
    name,
    changed: () => heard.changed++,
    ended: () => heard.ended++,
  };
  return { entry, heard };
}

describe("FolderWatchers", () => {
  it("opens one watch for every file in a folder and tells only the file's own listeners, with one folder check", async () => {
    const { opened, checks, watchers } = fakeSystem();
    const files = Array.from({ length: 50 }, (_, index) => listener(`File${index}.fbx`));
    const everything = listener(null);
    for (const file of files) watchers.listen("/work", file.entry);
    watchers.listen("/work", everything.entry);
    expect(opened).toHaveLength(1);

    opened[0]?.change("File7.fbx");
    await Promise.resolve();
    expect(files.map((file) => file.heard.changed)).toEqual(files.map((_, index) => (index === 7 ? 1 : 0)));
    expect(everything.heard.changed).toBe(1);
    expect(checks).toEqual(["/work"]);
  });

  it("ends every listener's watch when the folder is gone, and closes the watch when the last listener leaves", async () => {
    const { opened, present, watchers } = fakeSystem();
    const hero = listener("Hero.fbx");
    const sword = listener("Sword.fbx");
    const stopHero = watchers.listen("/work", hero.entry);
    watchers.listen("/work", sword.entry);
    present.delete("/work");
    opened[0]?.change("Sword.fbx");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect([hero.heard.ended, sword.heard.ended]).toEqual([1, 1]);
    expect(opened[0]?.closed).toBe(true);

    present.add("/work");
    const stopAgain = watchers.listen("/work", hero.entry);
    expect(opened).toHaveLength(2);
    stopHero();
    stopAgain();
    expect(opened[1]?.closed).toBe(true);
  });
});
