import { execFile } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { AssetInspection } from "@arcue/protocol";
import { build } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { formatInspection } from "./inspect";
import { run } from "./run";

const appDir = fileURLToPath(new URL("..", import.meta.url));
const samples = resolve(appDir, "../../samples");
const golem = join(samples, "pebble-golem.fbx");
const crate = join(samples, "crate.fbx");
const execFileAsync = promisify(execFile);

let dist: string;
let userData: string;
let previousUserData: string | undefined;

beforeAll(async () => {
  dist = realpathSync(mkdtempSync(join(tmpdir(), "arcue-cli-build-")));
  userData = realpathSync(mkdtempSync(join(tmpdir(), "arcue-cli-data-")));
  previousUserData = process.env.ARCUE_USER_DATA;
  process.env.ARCUE_USER_DATA = userData;
  await build({
    root: appDir,
    configFile: join(appDir, "vite.config.ts"),
    logLevel: "silent",
    build: { outDir: dist, emptyOutDir: true },
  });
}, 60_000);

afterAll(() => {
  if (previousUserData === undefined) delete process.env.ARCUE_USER_DATA;
  else process.env.ARCUE_USER_DATA = previousUserData;
  rmSync(dist, { recursive: true, force: true });
  rmSync(userData, { recursive: true, force: true });
});

function capture() {
  const lines = { out: "", err: "" };
  return {
    lines,
    output: { out: (text: string) => (lines.out += text), err: (text: string) => (lines.err += text) },
  };
}

function inspect(args: string[]) {
  const { lines, output } = capture();
  return run(["inspect", ...args], output, samples, { importWorkerEntry: join(dist, "import-worker.js") }).then(
    (code) => ({ code, ...lines }),
  );
}

async function runBuilt(args: string[]): Promise<{ code: number; out: string; err: string }> {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [join(dist, "arcue.js"), ...args], {
      cwd: samples,
      env: { ...process.env, ARCUE_USER_DATA: userData },
    });
    return { code: 0, out: stdout, err: stderr };
  } catch (error) {
    const failed = error as { code: number; stdout: string; stderr: string };
    return { code: failed.code, out: failed.stdout, err: failed.stderr };
  }
}

describe("arcue inspect", () => {
  it("summarizes the pebble golem in aligned plain lines", async () => {
    const { code, out, err } = await inspect(["pebble-golem.fbx"]);
    expect(err).toBe("");
    expect(code).toBe(0);
    expect(out).toBe(
      [
        `File        ${golem}`,
        "Format      FBX from Blender (stable FBX IO) 5.2.2 LTS",
        "Frame rate  30 fps",
        "Up axis     +Y",
        "Height      1.593 m",
        "Meshes      PebbleGolem  18,000 triangles, skinned",
        "Bones       27",
        "Materials   Stone",
        "            Glow",
        "Clips       Armature|Hit   16 frames",
        "            Armature|Idle  61 frames",
        "            Armature|Walk  31 frames",
        "            Armature|Wave  46 frames",
        "",
      ].join("\n"),
    );
  });

  it("prints the query result as JSON with --json", async () => {
    const { code, out } = await inspect(["--json", "pebble-golem.fbx"]);
    expect(code).toBe(0);
    const inspection = JSON.parse(out) as AssetInspection;
    expect(inspection).toMatchObject({
      file: { path: golem, name: "pebble-golem.fbx" },
      format: "fbx",
      fps: 30,
      upAxis: "+Y",
      meshes: [{ name: "PebbleGolem", triangles: 18_000, skinned: true }],
      materials: [
        { name: "Stone", textures: [] },
        { name: "Glow", textures: [] },
      ],
      warnings: [],
    });
    expect(inspection.bones).toHaveLength(27);
    expect(inspection.bones.slice(0, 2)).toEqual([
      { name: "Hips", path: "Armature/Hips" },
      { name: "Spine", path: "Armature/Hips/Spine" },
    ]);
    expect(inspection.bones).toContainEqual({
      name: "Hand.R",
      path: "Armature/Hips/Spine/Chest/Shoulder.R/UpperArm.R/Forearm.R/Hand.R",
    });
    expect(inspection.clips.map((clip) => [clip.displayName, clip.frames, clip.fps])).toEqual([
      ["Hit", 16, 30],
      ["Idle", 61, 30],
      ["Walk", 31, 30],
      ["Wave", 46, 30],
    ]);
  });

  it("leaves out clips, bones and the frame rate for a static crate", async () => {
    const { code, out } = await inspect([crate]);
    expect(code).toBe(0);
    expect(out).toBe(
      [
        `File       ${crate}`,
        "Format     FBX from Blender (stable FBX IO) 5.2.2 LTS",
        "Up axis    +Y",
        "Height     1.004 m",
        "Meshes     Crate  756 triangles",
        "Materials  Wood",
        "           Metal",
        "",
      ].join("\n"),
    );
  });

  it("exits with 1 for a missing file, a file it cannot parse, and a missing import worker", async () => {
    const missing = await inspect(["missing.fbx"]);
    expect(missing).toMatchObject({ code: 1, out: "" });
    expect(missing.err).toContain("is not a file");

    const unreadable = await inspect(["README.md"]);
    expect(unreadable).toMatchObject({ code: 1, out: "", err: "No importer reads README.md.\n" });

    const { lines, output } = capture();
    const code = await run(["inspect", "crate.fbx"], output, samples, {
      importWorkerEntry: join(userData, "no-worker.js"),
    });
    expect(code).toBe(1);
    expect(lines.err).toContain("no-worker.js");
  });

  it("runs from the built arcue.js, with the import worker and wasm beside it", async () => {
    const built = await runBuilt(["inspect", "--json", "crate.fbx"]);
    expect(built.code).toBe(0);
    expect(JSON.parse(built.out)).toMatchObject({ meshes: [{ name: "Crate", triangles: 756 }], clips: [] });

    const golemOutput = await runBuilt(["inspect", golem]);
    expect(golemOutput.code).toBe(0);
    expect(golemOutput.out).toContain("Bones       27\n");

    const failed = await runBuilt(["inspect", "README.md"]);
    expect(failed.code).toBe(1);
    expect(failed.err).toBe("No importer reads README.md.\n");
  });
});

describe("formatInspection", () => {
  it("shows units, textures, parts, other clip rates, composition files and problems only when the file has them", () => {
    const inspection: AssetInspection = {
      file: { path: "/work/Rock.fbx", name: "Rock.fbx", bytes: 10 },
      format: "fbx",
      exporter: null,
      fps: 24,
      upAxis: "+Z",
      unitMeters: 0.01,
      height: 1.23456,
      meshes: [
        { name: "Rock_LOD0", path: "Rock_LOD0", triangles: 1, vertices: 3, skinned: false },
        { name: "Rock_LOD1", path: "Rock_LOD1", triangles: 1, vertices: 3, skinned: false },
        { name: "UCX_Rock", path: "UCX_Rock", triangles: 1, vertices: 3, skinned: false },
      ],
      parts: [
        {
          id: "Rock_LOD0",
          name: "Rock",
          role: "model",
          shownByDefault: true,
          levels: [
            { level: 0, meshes: ["Rock_LOD0"], triangles: 1 },
            { level: 1, meshes: ["Rock_LOD1"], triangles: 1 },
          ],
        },
        {
          id: "UCX_Rock",
          name: "UCX_Rock",
          role: "collision",
          shownByDefault: false,
          levels: [{ level: 0, meshes: ["UCX_Rock"], triangles: 1 }],
        },
        { id: "SOCKET_Top", name: "SOCKET_Top", role: "socket", shownByDefault: false, levels: [] },
        {
          id: "Moss.fbx//Moss",
          name: "Moss",
          role: "model",
          shownByDefault: false,
          levels: [{ level: 0, meshes: ["Moss.fbx//Moss"], triangles: 1 }],
        },
        {
          id: "Pebble",
          name: "Pebble",
          role: "model",
          shownByDefault: true,
          levels: [{ level: 0, meshes: ["Pebble"], triangles: 1 }],
        },
      ],
      triangles: 3,
      bones: [],
      materials: [
        {
          name: "Stone",
          textures: [
            { slot: "baseColor", texture: "Stone_BaseColor" },
            { slot: "normal", texture: "Stone_Normal" },
          ],
        },
      ],
      textures: [{ name: "Textures/Moss.png", found: false, mimeType: null }],
      clips: [{ name: "Roll", displayName: "Roll", frames: 1, fps: 30, duration: 0 }],
      composition: "/work/.arcue/reviews/Rock.fbx/composition.json",
      members: [
        { file: "Moss.fbx", role: "set", found: true },
        { file: "Rock@Roll.fbx", role: "animation", found: true },
      ],
      warnings: [
        {
          code: "texture-not-found",
          severity: "error",
          subject: { kind: "texture", name: "Moss.png" },
          message: "Texture not found: Moss.png",
        },
        {
          code: "material-not-found",
          severity: "warning",
          subject: { kind: "material", name: "Lichen" },
          message: "Material not used by any mesh: Lichen",
          file: "composition.json",
        },
      ],
    };
    expect(formatInspection(inspection)).toBe(
      [
        "File         /work/Rock.fbx",
        "Format       FBX",
        "Frame rate   24 fps",
        "Up axis      +Z",
        "Unit         0.01 m",
        "Height       1.235 m",
        "Meshes       Rock_LOD0  1 triangle",
        "             Rock_LOD1  1 triangle",
        "             UCX_Rock   1 triangle",
        "Parts        Rock        LOD 0, 1",
        "             UCX_Rock    collision",
        "             SOCKET_Top  socket",
        "             Moss        hidden",
        "Materials    Stone  base color Stone_BaseColor, normal Stone_Normal",
        "Clips        Roll  1 frame at 30 fps",
        "Composition  /work/.arcue/reviews/Rock.fbx/composition.json",
        "Files        Moss.fbx       set",
        "             Rock@Roll.fbx  animation",
        "Errors       Texture not found: Moss.png",
        "Warnings     Material not used by any mesh: Lichen (composition.json)",
        "",
      ].join("\n"),
    );
  });
});
