import { appendFileSync, readFileSync, readlinkSync } from "node:fs";
import { join } from "node:path";
import { isRunning } from "@arcue/platform-node";

const PIDS_FILE = "pids";

/**
 * Records a process that a test started, itself or through an `arcue` it ran, in the run's folder, so the run's
 * teardown can stop it when the test did not.
 */
export function registerPid(runFolder: string, pid: number): void {
  appendFileSync(join(runFolder, PIDS_FILE), `${pid}\n`);
}

/**
 * Kills the recorded processes that still run, and only those. On Linux it also checks that the process's command
 * line or working folder lies in the run's folder, so a pid the system gave to another process since is left alone.
 */
export function killRegistered(runFolder: string): void {
  let text: string;
  try {
    text = readFileSync(join(runFolder, PIDS_FILE), "utf8");
  } catch {
    return;
  }
  for (const pid of new Set(text.split("\n").filter(Boolean).map(Number))) {
    if (!(pid > 0) || !isRunning(pid) || !inRun(pid, runFolder)) continue;
    try {
      process.kill(pid, "SIGKILL");
    } catch {}
  }
}

function inRun(pid: number, runFolder: string): boolean {
  if (process.platform !== "linux") return true;
  try {
    return (
      readFileSync(`/proc/${pid}/cmdline`, "utf8").includes(runFolder) ||
      readlinkSync(`/proc/${pid}/cwd`).startsWith(runFolder)
    );
  } catch {
    return false;
  }
}
