import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { extractedElectron, flipElectronFuses, unsetFuses } from "./fuses";
import type { Platform } from "./layout";

const SENTINEL = "dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX";
const ELECTRON_44_WIRE = "101100011";

/** A stand-in for an Electron binary: some bytes, then the fuse sentinel and a version 1 wire. */
function fakeElectron(wire: string): Buffer {
  return Buffer.concat([
    Buffer.alloc(1000, 7),
    Buffer.from(SENTINEL),
    Buffer.from([1, wire.length]),
    Buffer.from(wire),
    Buffer.alloc(1000, 7),
  ]);
}

function wireOf(binary: Buffer): string {
  const start = binary.indexOf(SENTINEL) + SENTINEL.length + 2;
  return binary.subarray(start, start + ELECTRON_44_WIRE.length).toString();
}

let folder = "";
beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "arcue-fuses-"));
});
afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

describe("the packaged Electron's fuses", () => {
  it("finds Electron where @electron/packager extracts it", () => {
    expect(extractedElectron("/x", "linux")).toBe(join("/x", "electron"));
    expect(extractedElectron("/x", "win32")).toBe(join("/x", "electron.exe"));
    expect(extractedElectron("/x", "darwin")).toBe(join("/x", "Electron.app"));
  });

  it.each<[Platform, string]>([
    ["linux", "electron"],
    ["win32", "electron.exe"],
    ["darwin", "Electron.app/Contents/Frameworks/Electron Framework.framework/Electron Framework"],
  ])("keeps Node but turns off NODE_OPTIONS and --inspect on %s", async (platform, binary) => {
    const path = join(folder, binary);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, fakeElectron(ELECTRON_44_WIRE));
    const program = platform === "darwin" ? join(folder, "Electron.app", "Contents", "MacOS", "Electron") : path;

    expect(await unsetFuses(program)).toEqual([
      "EnableNodeOptionsEnvironmentVariable",
      "EnableNodeCliInspectArguments",
    ]);
    await flipElectronFuses(folder, platform);

    const flipped = await readFile(path);
    expect(wireOf(flipped)).toBe("100000011");
    expect(flipped.length).toBe(fakeElectron(ELECTRON_44_WIRE).length);
    expect(await unsetFuses(program)).toEqual([]);
  });

  it("names a fuse that turned Node off", async () => {
    await writeFile(join(folder, "electron"), fakeElectron("000000011"));

    expect(await unsetFuses(join(folder, "electron"))).toEqual(["RunAsNode"]);
  });

  it("refuses an Electron without fuses", async () => {
    await writeFile(join(folder, "electron"), Buffer.alloc(1000, 7));

    await expect(flipElectronFuses(folder, "linux")).rejects.toThrow(/sentinel/);
  });
});
