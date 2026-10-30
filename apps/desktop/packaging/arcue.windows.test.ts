import { type ChildProcess, execFile, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { compileCommand } from "./windows";

const SHELL_ARGS = ["Armature|Walk", "my model.fbx", "100%PATH%", "a&b", "^c", "(d)", "!e", "<f>"];
const ARGS = [...SHELL_ARGS, 'say "hi"', "trailing\\", "", "été"];

interface Result {
  code: number | null;
  stdout: string;
  stderr: string;
}

interface Seen {
  argv: string[];
  runAsNode: string | null;
  nodeOptions: string | null;
}

function run(file: string, args: readonly string[], env: NodeJS.ProcessEnv = {}): Promise<Result> {
  return new Promise((resolve) => {
    execFile(file, args, { env: { ...process.env, ...env }, encoding: "utf8" }, (error, stdout, stderr) => {
      const code = error ? (typeof error.code === "number" ? error.code : null) : 0;
      resolve({ code, stdout, stderr });
    });
  });
}

const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;

let temp: string;
let app: string;
let command: string;

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

beforeAll(async () => {
  if (process.platform !== "win32") return;
  temp = await realpath(await mkdtemp(join(tmpdir(), "arcue command & (x) ")));
  app = join(temp, "Arcue.exe");
  command = join(temp, "bin", "arcue.exe");
  await copyFile(process.execPath, app);
  await mkdir(join(temp, "resources", "cli"), { recursive: true });
  await writeFile(
    join(temp, "resources", "cli", "arcue.js"),
    `const { writeFileSync } = require("node:fs");
const { spawn } = require("node:child_process");
const [mode, file] = process.argv.slice(2);
if (mode === "wait") {
  const grandchild = spawn(process.execPath, ["-e", "setTimeout(() => {}, 60000)"], { detached: true, stdio: "ignore" });
  grandchild.unref();
  writeFileSync(file, JSON.stringify({ child: process.pid, grandchild: grandchild.pid }));
  setTimeout(() => {}, 60000);
} else {
  process.stdout.write(JSON.stringify({ argv: process.argv.slice(2), runAsNode: process.env.ELECTRON_RUN_AS_NODE ?? null, nodeOptions: process.env.NODE_OPTIONS ?? null }));
  process.exitCode = Number(process.env.FAKE_EXIT ?? 0);
}
`,
  );
  await compileCommand(command, process.arch === "arm64" ? "arm64" : "x64");
}, 120_000);

afterAll(async () => {
  if (temp) await rm(temp, { recursive: true, force: true });
});

describe.skipIf(process.platform !== "win32")("bin\\arcue.exe", () => {
  it("runs the app's command line as Node with the arguments exactly as given", async () => {
    const result = await run(command, ARGS, { NODE_OPTIONS: "--require ./elsewhere.js" });

    expect(result.code, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ argv: ARGS, runAsNode: "1", nodeOptions: null } satisfies Seen);
  });

  it.each(["powershell.exe", "pwsh.exe"])("passes what %s gives it, and no shell reads it", async (shell) => {
    const script = `& ${quote(command)} ${SHELL_ARGS.map(quote).join(" ")}; exit $LASTEXITCODE`;
    const result = await run(shell, ["-NoProfile", "-NonInteractive", "-Command", script]);

    expect(result.code, result.stderr).toBe(0);
    expect((JSON.parse(result.stdout) as Seen).argv).toEqual(SHELL_ARGS);
  });

  it("passes on the command line's exit code", async () => {
    const result = await run(command, ["status"], { FAKE_EXIT: "3" });

    expect(result.code).toBe(3);
  });

  it("ends the command line with itself, but not what the command line started", async () => {
    const file = join(temp, "pids.json");
    const shim: ChildProcess = spawn(command, ["wait", file], { stdio: "ignore" });
    await vi.waitFor(() => expect(existsSync(file)).toBe(true), { timeout: 10_000 });
    const { child, grandchild } = JSON.parse(readFileSync(file, "utf8")) as { child: number; grandchild: number };
    shim.kill();

    await vi.waitFor(() => expect(alive(child)).toBe(false), { timeout: 10_000 });
    expect(alive(grandchild)).toBe(true);
    process.kill(grandchild);
  });

  it("asks for a reinstall when the app beside it is incomplete", async () => {
    const broken = join(temp, "broken", "bin", "arcue.exe");
    await mkdir(join(temp, "broken", "bin"), { recursive: true });
    await copyFile(command, broken);
    const result = await run(broken, ["help"]);

    expect(result.code).toBe(1);
    expect(result.stderr).toBe(`Reinstall Arcue: ${join(temp, "broken")} is not a complete Arcue app.\r\n`);
  });
});
