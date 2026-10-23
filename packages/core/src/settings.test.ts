import type { Settings } from "@arcue/protocol";
import { ArcueError } from "@arcue/protocol";
import { describe, expect, it } from "vitest";
import { ManualClock } from "./manual-clock";
import { SettingsStore } from "./settings";
import { flush, RecordingPlatform, unlockedWrites } from "./test-support";

const SETTINGS = "/app-data/settings.json";
const BROKEN = "/app-data/settings.broken.json";

function store(files: Record<string, string> = {}) {
  const platform = new RecordingPlatform({ files, clock: new ManualClock() });
  const changes: Settings[] = [];
  const settings = new SettingsStore(platform.forCore("core-1"), (next) => changes.push(next));
  return { platform, settings, changes };
}

const onDisk = async (platform: RecordingPlatform) => JSON.parse(await platform.readText(SETTINGS)) as unknown;

describe("SettingsStore", () => {
  it("gives the defaults without a file and keeps the settings in effect while the file is broken", async () => {
    const { platform, settings, changes } = store();
    await expect(settings.load()).resolves.toEqual({ coordinates: "y-up" });
    expect(changes).toEqual([]);
    await platform.writeFile(SETTINGS, JSON.stringify({ coordinates: "z-up-blender" }));
    await expect(settings.reload()).resolves.toEqual({ coordinates: "z-up-blender" });
    await platform.writeFile(SETTINGS, "{ half written");
    await expect(settings.reload()).resolves.toEqual({ coordinates: "z-up-blender" });
    await platform.remove(SETTINGS);
    await expect(settings.reload()).resolves.toEqual({ coordinates: "y-up" });
    expect(changes).toEqual([{ coordinates: "z-up-blender" }, { coordinates: "y-up" }]);
  });

  it("writes the change onto the file as it is on disk, under the settings lock", async () => {
    const { platform, settings } = store({ [SETTINGS]: JSON.stringify({ coordinates: "y-up" }) });
    await settings.load();
    await platform.writeFile(SETTINGS, JSON.stringify({ coordinates: "y-up", authorName: "Ana" }));
    await expect(settings.update({ coordinates: "z-up-blender" })).resolves.toEqual({
      coordinates: "z-up-blender",
      authorName: "Ana",
    });
    await expect(onDisk(platform)).resolves.toEqual({ coordinates: "z-up-blender", authorName: "Ana" });
    expect(platform.log.filter((entry) => entry.actor === "core-1").map((entry) => entry.op)).toEqual([
      "lock",
      "writeAtomic",
      "unlock",
    ]);
    expect(unlockedWrites(platform)).toEqual([]);
    expect(platform.heldLocks()).toEqual([]);
  });

  it.each([
    ["broken JSON", "{ half written"],
    ["an array", "[1, 2]"],
  ])("moves a file of %s aside and writes fresh settings with the change", async (_label, text) => {
    const { platform, settings } = store({ [SETTINGS]: text, [BROKEN]: "an older broken file" });
    await settings.load();
    await expect(settings.update({ authorName: "Ana" })).resolves.toEqual({ coordinates: "y-up", authorName: "Ana" });
    await expect(platform.readText(BROKEN)).resolves.toBe(text);
    await expect(onDisk(platform)).resolves.toEqual({ coordinates: "y-up", authorName: "Ana" });
    expect(unlockedWrites(platform)).toEqual([]);
  });

  it("reports settings another program wrote once, and nothing once disposed", async () => {
    const { platform, settings, changes } = store();
    await settings.load();
    settings.watch((error) => {
      throw error;
    });
    await platform.writeFile(SETTINGS, JSON.stringify({ coordinates: "z-up-blender" }));
    await flush();
    expect(changes).toEqual([{ coordinates: "z-up-blender" }]);
    expect(settings.current).toEqual({ coordinates: "z-up-blender" });
    await platform.writeFile(SETTINGS, JSON.stringify({ coordinates: "z-up-blender" }, null, 2));
    await flush();
    expect(changes).toHaveLength(1);

    settings.dispose();
    await platform.writeFile(SETTINGS, JSON.stringify({ coordinates: "y-up" }));
    await flush();
    expect(changes).toHaveLength(1);
  });

  it("keeps the keys it does not know", async () => {
    const { platform, settings } = store({ [SETTINGS]: JSON.stringify({ future: 1, coordinates: "y-up" }) });
    await settings.load();
    await settings.update({ coordinates: "z-up-blender" });
    await expect(onDisk(platform)).resolves.toEqual({ future: 1, coordinates: "z-up-blender" });
  });

  it("reports its own change once, though the watcher sees the write too", async () => {
    const { settings, changes } = store();
    await settings.load();
    settings.watch((error) => {
      throw error;
    });
    await settings.update({ authorName: "Ana" });
    await flush();
    expect(changes).toEqual([{ coordinates: "y-up", authorName: "Ana" }]);
  });

  it("writes known keys back as the values in effect", async () => {
    const { platform, settings } = store({
      [SETTINGS]: JSON.stringify({ coordinates: "x-up", authorName: " ", future: true }),
    });
    await expect(settings.load()).resolves.toEqual({ coordinates: "y-up" });
    await settings.update({ coordinates: "z-up-blender" });
    await expect(onDisk(platform)).resolves.toEqual({ coordinates: "z-up-blender", future: true });
    await platform.writeFile(SETTINGS, JSON.stringify({ coordinates: "x-up" }));
    await settings.update({ authorName: "Ana" });
    await expect(onDisk(platform)).resolves.toEqual({ coordinates: "y-up", authorName: "Ana" });
  });

  it("writes nothing when the file cannot be read", async () => {
    const text = JSON.stringify({ coordinates: "z-up-blender" });
    const { platform, settings } = store({ [SETTINGS]: text });
    await settings.load();
    platform.beforeRead = (path) => {
      if (path === SETTINGS) throw new ArcueError("forbidden", "The disk refused to read settings.json.");
    };
    await expect(settings.update({ authorName: "Ana" })).rejects.toMatchObject({ code: "forbidden" });
    platform.beforeRead = null;
    await expect(platform.readText(SETTINGS)).resolves.toBe(text);
    expect(settings.current).toEqual({ coordinates: "z-up-blender" });
    expect(platform.heldLocks()).toEqual([]);
  });

  it("lands two updates made at once, in the order they were asked for", async () => {
    const { platform, settings, changes } = store();
    await settings.load();
    await Promise.all([settings.update({ authorName: "Ana" }), settings.update({ coordinates: "z-up-blender" })]);
    await expect(onDisk(platform)).resolves.toEqual({ authorName: "Ana", coordinates: "z-up-blender" });
    expect(changes).toEqual([
      { coordinates: "y-up", authorName: "Ana" },
      { coordinates: "z-up-blender", authorName: "Ana" },
    ]);
  });
});
