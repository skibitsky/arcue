import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { chmod, copyFile, mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const source = fileURLToPath(new URL("arcue", import.meta.url));
const SHELLS = ["sh", "dash", "bash"].filter((shell) =>
  ["/bin", "/usr/bin"].some((dir) => existsSync(join(dir, shell))),
);
const ARGS = ["open", "my model.fbx", "--clip", "Armature|Walk", "it's", '"quoted"', "$HOME", "*", "a\\b", ""];

interface Result {
  code: number | null;
  stdout: string;
  stderr: string;
}

interface Seen {
  argv: string[];
  runAsNode: string | null;
  nodeOptions: string | null;
  path: string | null;
}

function run(file: string, args: readonly string[], env: NodeJS.ProcessEnv = {}, cwd?: string): Promise<Result> {
  return new Promise((resolve) => {
    execFile(file, args, { env: { ...process.env, ...env }, cwd, encoding: "utf8" }, (error, stdout, stderr) => {
      const code = error ? (typeof error.code === "number" ? error.code : null) : 0;
      resolve({ code, stdout, stderr });
    });
  });
}

let temp: string;
let macLauncher: string;
let macApp: string;
let linuxLauncher: string;
let linuxApp: string;

/** An executable that stands in for Electron: it reports how it was started and exits with FAKE_EXIT. */
async function fakeElectron(path: string): Promise<void> {
  const report = join(temp, "report.js");
  await writeFile(
    report,
    `process.stdout.write(JSON.stringify({ argv: process.argv.slice(2), runAsNode: process.env.ELECTRON_RUN_AS_NODE ?? null, nodeOptions: process.env.NODE_OPTIONS ?? null, path: process.env.PATH ?? null })); process.exitCode = Number(process.env.FAKE_EXIT ?? 0);\n`,
  );
  await writeFile(path, `#!/bin/sh\nexec '${process.execPath}' '${report}' "$0" "$@"\n`);
  await chmod(path, 0o755);
}

async function install(launcher: string): Promise<void> {
  await mkdir(join(launcher, ".."), { recursive: true });
  await copyFile(source, launcher);
  await chmod(launcher, 0o755);
}

beforeAll(async () => {
  temp = await realpath(await mkdtemp(join(tmpdir(), "arcue launcher ")));
  const contents = join(temp, "My Apps", "Arcue.app", "Contents");
  macApp = join(contents, "MacOS", "Arcue");
  macLauncher = join(contents, "Resources", "bin", "arcue");
  await mkdir(join(contents, "MacOS"), { recursive: true });
  await mkdir(join(contents, "Resources", "cli"), { recursive: true });
  await fakeElectron(macApp);
  await writeFile(join(contents, "Resources", "cli", "arcue.js"), "");
  await install(macLauncher);

  const root = join(temp, "opt", "arcue & co");
  linuxApp = join(root, "Arcue");
  linuxLauncher = join(root, "bin", "arcue");
  await mkdir(join(root, "resources", "cli"), { recursive: true });
  await fakeElectron(linuxApp);
  await writeFile(join(root, "resources", "cli", "arcue.js"), "");
  await install(linuxLauncher);

  await mkdir(join(temp, "usr", "local", "bin"), { recursive: true });
  await symlink(macLauncher, join(temp, "usr", "local", "bin", "arcue"));
  await mkdir(join(temp, "usr", "bin"), { recursive: true });
  const relativeLink = join(temp, "usr", "bin", "arcue-relative");
  await symlink(relative(join(temp, "usr", "bin"), linuxLauncher), relativeLink);
  await symlink(relativeLink, join(temp, "usr", "bin", "arcue"));
});

afterAll(async () => {
  await rm(temp, { recursive: true, force: true });
});

describe.skipIf(process.platform === "win32")("the arcue launcher", () => {
  it.each(SHELLS)("runs the macOS app's command line through a symlink, in %s", async (shell) => {
    const result = await run(shell, [join(temp, "usr", "local", "bin", "arcue"), ...ARGS]);

    expect(result.code, result.stderr).toBe(0);
    const seen = JSON.parse(result.stdout) as Seen;
    expect(seen.argv).toEqual([macApp, join(macApp, "..", "..", "Resources", "cli", "arcue.js"), ...ARGS]);
    expect(seen.runAsNode).toBe("1");
  });

  it.each(SHELLS)("runs the Linux app's command line through a chain of relative symlinks, in %s", async (shell) => {
    const result = await run(shell, [join(temp, "usr", "bin", "arcue"), ...ARGS]);

    expect(result.code, result.stderr).toBe(0);
    const seen = JSON.parse(result.stdout) as Seen;
    expect(seen.argv).toEqual([linuxApp, join(linuxApp, "..", "resources", "cli", "arcue.js"), ...ARGS]);
    expect(seen.runAsNode).toBe("1");
  });

  it("runs as a program, without NODE_OPTIONS and with the caller's PATH", async () => {
    const path = `relative:${process.env.PATH ?? ""}`;
    const result = await run(join(temp, "usr", "local", "bin", "arcue"), ["status"], {
      NODE_OPTIONS: "--require ./elsewhere.js",
      PATH: path,
    });

    expect(result.code, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      argv: [macApp, expect.any(String), "status"],
      nodeOptions: null,
      path,
    });
  });

  it("passes on the command line's exit code", async () => {
    const result = await run(linuxLauncher, ["status"], { FAKE_EXIT: "3" });

    expect(result.code).toBe(3);
  });

  it("runs no tool from a relative PATH entry", async () => {
    const decoys = join(temp, "decoys");
    const marker = join(temp, "decoy-ran");
    await mkdir(decoys, { recursive: true });
    for (const tool of ["dirname", "readlink", "pwd"]) {
      await writeFile(join(decoys, tool), `#!/bin/sh\ntouch '${marker}'\n`);
      await chmod(join(decoys, tool), 0o755);
    }
    const result = await run(
      join(temp, "usr", "bin", "arcue"),
      ["help"],
      { PATH: `decoys:${process.env.PATH ?? ""}` },
      temp,
    );

    expect(result.code, result.stderr).toBe(0);
    expect(existsSync(marker)).toBe(false);
  });

  it("never runs a macOS app planted beside the Linux app", async () => {
    const shared = join(temp, "shared");
    const planted = join(shared, "MacOS", "Arcue");
    await mkdir(join(shared, "MacOS"), { recursive: true });
    await mkdir(join(shared, "Resources", "cli"), { recursive: true });
    await fakeElectron(planted);
    await writeFile(join(shared, "Resources", "cli", "arcue.js"), "");
    const root = join(shared, "Arcue-linux-x64");
    const app = join(root, "Arcue");
    const launcher = join(root, "bin", "arcue");
    await mkdir(join(root, "resources", "cli"), { recursive: true });
    await fakeElectron(app);
    await writeFile(join(root, "resources", "cli", "arcue.js"), "");
    await install(launcher);

    const result = await run(launcher, ["status"]);

    expect(result.code, result.stderr).toBe(0);
    expect((JSON.parse(result.stdout) as Seen).argv).toEqual([
      app,
      join(root, "resources", "cli", "arcue.js"),
      "status",
    ]);

    await rm(app);
    const incomplete = await run(launcher, ["status"]);

    expect(incomplete.code).toBe(1);
    expect(incomplete.stdout).toBe("");
    expect(incomplete.stderr).toBe(`Reinstall Arcue: ${root} is not a complete Arcue app.\n`);
  });

  it("asks for a reinstall when the app beside it is incomplete", async () => {
    const broken = join(temp, "broken", "bin", "arcue");
    await install(broken);
    const result = await run("sh", [broken, "help"]);

    expect(result.code).toBe(1);
    expect(result.stderr).toBe(`Reinstall Arcue: ${join(temp, "broken")} is not a complete Arcue app.\n`);
  });
});
