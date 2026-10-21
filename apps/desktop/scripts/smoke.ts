// Checks an installed arcue command against the app it came with: it runs on the app's own Node, reads a model, starts
// the app to open one, and reaches the running app through bridge.json. Pass the command, or "arcue" to find it on
// PATH, and the app's program it should run on, which must then have the fuses packaging/fuses.ts sets and ignore
// NODE_OPTIONS. On Linux without a display, run it under xvfb-run.
import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { unsetFuses } from "../packaging/fuses.ts";

const [command = "arcue", expectedApp] = process.argv.slice(2);
const run = promisify(execFile);
const repo = fileURLToPath(new URL("../../..", import.meta.url));
const CLIP = "StoneResonatorRig|Walk";

interface Result {
  code: number;
  stdout: string;
  stderr: string;
}

function execute(file: string, args: readonly string[], env: NodeJS.ProcessEnv): Promise<Result> {
  return run(file, args, { env, encoding: "utf8", timeout: 120_000 }).then(
    ({ stdout, stderr }) => ({ code: 0, stdout, stderr }),
    (error: { code?: unknown; stdout?: string; stderr?: string }) => ({
      code: typeof error.code === "number" ? error.code : -1,
      stdout: error.stdout ?? "",
      stderr: error.stderr ?? String(error),
    }),
  );
}

function arcue(args: readonly string[], env: NodeJS.ProcessEnv): Promise<Result> {
  return execute(command, args, env);
}

function check(condition: unknown, step: string, result?: Result): asserts condition {
  if (condition) return;
  const detail = result ? `\nexit ${result.code}\nstdout: ${result.stdout}\nstderr: ${result.stderr}` : "";
  throw new Error(`${step} failed.${detail}`);
}

async function parentOf(pid: number): Promise<number> {
  if (process.platform === "linux") {
    const fields = (await readFile(`/proc/${pid}/stat`, "utf8")).split(") ")[1]?.split(" ") ?? [];
    return Number(fields[1]);
  }
  if (process.platform === "win32") {
    const filter = `ProcessId=${pid}`;
    const { stdout } = await run("powershell.exe", [
      "-NoProfile",
      "-Command",
      `(Get-CimInstance Win32_Process -Filter '${filter}').ParentProcessId`,
    ]);
    return Number(stdout.trim());
  }
  return Number((await run("ps", ["-o", "ppid=", "-p", String(pid)])).stdout.trim());
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function stopApp(userData: string): Promise<void> {
  const info = await readFile(join(userData, "bridge.json"), "utf8").then(
    (text) => JSON.parse(text) as { pid: number },
    () => null,
  );
  if (!info) return;
  const main = await parentOf(info.pid).catch(() => 0);
  if (main > 1) {
    if (process.platform === "win32") await run("taskkill", ["/PID", String(main), "/T", "/F"]).catch(() => undefined);
    else process.kill(main, "SIGTERM");
  }
  const deadline = Date.now() + 20_000;
  while (alive(info.pid) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 200));
  if (alive(info.pid)) process.kill(info.pid);
}

/** Whether `arcue status` lists every file as ready. It writes Windows paths with forward slashes. */
function allReady(status: Result, files: readonly string[]): boolean {
  const slashes = (text: string) => text.replaceAll("\\", "/");
  const lines = status.stdout.split("\n").map(slashes);
  return (
    status.code === 0 &&
    files.every((file) => lines.some((line) => line.includes(slashes(file)) && line.includes(" ready ")))
  );
}

async function statusOnceReady(env: NodeJS.ProcessEnv, files: readonly string[]): Promise<Result> {
  const deadline = Date.now() + 60_000;
  for (;;) {
    const status = await arcue(["status"], env);
    if (allReady(status, files) || Date.now() > deadline) return status;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

const SLOW_FIRST_START = ["did not answer", "did not start within"];

async function runningWithin(env: NodeJS.ProcessEnv, ms: number): Promise<void> {
  const deadline = Date.now() + ms;
  while ((await arcue(["status"], env)).code !== 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

/** The end of the app's own logs, which a failed check prints. */
async function appLogs(userData: string): Promise<string> {
  const parts: string[] = [];
  for (const name of ["main.log", "core.log"]) {
    const text = await readFile(join(userData, "logs", name), "utf8").catch(() => "(none)\n");
    parts.push(`--- ${name}\n${text.split("\n").slice(-80).join("\n")}`);
  }
  return parts.join("\n");
}

const work = await realpath(await mkdtemp(join(tmpdir(), "arcue smoke & (x) ")));
const userData = join(work, "user data");
const models = join(work, "My Models");
await mkdir(models);
const striker = join(models, "stone striker & co.fbx");
const golem = join(models, "pebble golem.fbx");
await copyFile(join(repo, "samples", "stone-striker.fbx"), striker);
await copyFile(join(repo, "samples", "pebble-golem.fbx"), golem);
const env = { ...process.env, ARCUE_USER_DATA: userData };

try {
  const help = await arcue(["help"], env);
  check(help.code === 0 && help.stdout.includes("Usage:"), "arcue help", help);

  const setup = await arcue(["setup"], env);
  const runtime = /Arcue runs on Node (\d+)\.\d+\.\d+ at (.+), so there is nothing to set up/.exec(setup.stdout);
  check(runtime && Number(runtime[1]) >= 24, "arcue setup, on Node 24 or later", setup);
  const node = runtime[2] ?? "";
  check(/^arcue(\.exe)?$/i.test(basename(node)), `arcue runs on the app's own program, not on ${node},`, setup);
  if (expectedApp) {
    check((await realpath(node)) === (await realpath(expectedApp)), `arcue runs on ${expectedApp}, not ${node},`);
    const options = await execute(expectedApp, ["-e", "process.exit(0)"], {
      ...env,
      ELECTRON_RUN_AS_NODE: "1",
      NODE_OPTIONS: "--require arcue-smoke-missing-module",
    });
    check(options.code === 0, `${expectedApp} as Node, ignoring NODE_OPTIONS,`, options);
    const unset = await unsetFuses(expectedApp);
    check(unset.length === 0, `Setting the fuses ${unset.join(", ")} of ${expectedApp}`);
  }

  const inspected = await arcue(["inspect", "--json", striker], env);
  check(inspected.code === 0, "arcue inspect", inspected);
  const inspection = JSON.parse(inspected.stdout) as { meshes: unknown[]; clips: { name: string }[] };
  check(inspection.meshes.length > 0, "arcue inspect finds meshes", inspected);
  check(
    inspection.clips.some((clip) => clip.name === CLIP),
    `arcue inspect finds ${CLIP}`,
    inspected,
  );

  const notRunning = await arcue(["status"], env);
  check(notRunning.code === 1 && notRunning.stdout === "Arcue is not running.\n", "arcue status before", notRunning);

  const openStriker = ["open", striker, "--clip", CLIP, "--frame", "12"];
  let started = await arcue(openStriker, env);
  const slowStartDeadline = Date.now() + 180_000;
  while (
    started.code !== 0 &&
    SLOW_FIRST_START.some((text) => started.stderr.includes(text)) &&
    Date.now() < slowStartDeadline
  ) {
    // A first start can outlast what the command line waits for: Rosetta translates the app and its window's helpers
    // on their first start, and without a GPU the window's first render can block it.
    console.warn(`The app was slow to start, so arcue open tries again once the app runs.\n${started.stderr}`);
    await runningWithin(env, Math.max(0, slowStartDeadline - Date.now()));
    await new Promise((resolve) => setTimeout(resolve, 5000));
    started = await arcue(openStriker, env);
  }
  check(
    started.code === 0 && started.stdout.startsWith(`Opened ${striker} in Arcue as `),
    "arcue open, starting the app",
    started,
  );

  const opened = await arcue(["open", golem], env);
  check(
    opened.code === 0 && opened.stdout.startsWith(`Opened ${golem} in Arcue as `),
    "arcue open in the running app",
    opened,
  );

  const status = await statusOnceReady(env, [striker, golem]);
  check(status.code === 0 && status.stdout.startsWith("Arcue is running (process "), "arcue status", status);
  check(allReady(status, [striker, golem]), "arcue status lists both models as ready", status);
  console.log(`${command} runs on ${node}, starts the app and opens models in it.`);
} catch (error) {
  console.error(await appLogs(userData));
  throw error;
} finally {
  await stopApp(userData);
  await rm(work, { recursive: true, force: true }).catch(() => undefined);
}
