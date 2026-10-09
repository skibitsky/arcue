import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Session } from "./session";
import { fitBounds, loadSession, saveSession } from "./session";

let folder: string;

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), "arcue-session-"));
});

afterEach(() => {
  rmSync(folder, { recursive: true, force: true });
});

const session: Session = {
  version: 1,
  windows: [
    {
      bounds: { x: 40, y: 60, width: 1200, height: 800 },
      maximized: false,
      tabs: {
        tabs: [
          {
            path: "/work/Hero.fbx",
            view: {
              camera: { position: [0, 1, 4], target: [0, 1, 0], up: [0, 1, 0], fov: 30 },
              clip: "Armature|Walk",
              frame: 12,
              range: null,
              display: { mode: "lit", skeleton: false },
            },
          },
          { path: "/work/Crate.fbx", view: null },
        ],
        active: 1,
      },
    },
  ],
};

describe("the session file", () => {
  it("saves and loads windows with their tabs, clips, frames and cameras", async () => {
    const path = join(folder, "session.json");
    await saveSession(path, session);
    await expect(loadSession(path)).resolves.toEqual(session);
  });

  it("starts empty when the file is missing or invalid", async () => {
    await expect(loadSession(join(folder, "missing.json"))).resolves.toEqual({ version: 1, windows: [] });
    writeFileSync(join(folder, "bad.json"), '{"version":1,"windows":[{"bounds":"no"}]}');
    await expect(loadSession(join(folder, "bad.json"))).resolves.toEqual({ version: 1, windows: [] });
  });
});

describe("fitBounds", () => {
  const screen = { x: 0, y: 0, width: 1920, height: 1080 };

  it("keeps bounds whose title bar is on a display", () => {
    expect(fitBounds({ x: 100, y: 100, width: 800, height: 600 }, [screen])).toEqual({
      x: 100,
      y: 100,
      width: 800,
      height: 600,
    });
  });

  it("drops the position of a window on a display that is gone, and fits its size", () => {
    expect(fitBounds({ x: 3000, y: 100, width: 2400, height: 600 }, [screen])).toEqual({ width: 1920, height: 600 });
  });
});
