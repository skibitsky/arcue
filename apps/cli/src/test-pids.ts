import { execFileSync } from "node:child_process";
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

/** Kills the recorded processes that still run from the run's folder, and only those. */
export function killRegistered(runFolder: string): void {
  let text: string;
  try {
    text = readFileSync(join(runFolder, PIDS_FILE), "utf8");
  } catch {
    return;
  }
  for (const pid of new Set(text.split("\n").filter(Boolean).map(Number))) killStarted(pid, runFolder);
}

/**
 * Kills the process when it still runs and its command line names `marker`, a path only the test's own processes
 * carry, or on Linux its working folder lies in it. A pid the system gave to another process since is left alone.
 */
export function killStarted(pid: number, marker: string): void {
  if (!(pid > 0) || !isRunning(pid) || !startedFrom(pid, marker)) return;
  try {
    process.kill(pid, "SIGKILL");
  } catch {}
}

function startedFrom(pid: number, marker: string): boolean {
  if (process.platform !== "linux") return commandLine(pid)?.includes(marker) ?? false;
  try {
    if (readFileSync(`/proc/${pid}/cmdline`, "utf8").includes(marker)) return true;
    const cwd = readlinkSync(`/proc/${pid}/cwd`);
    return cwd === marker || cwd.startsWith(`${marker}/`);
  } catch {
    return false;
  }
}

/** The process's command line, from `ps` or, on Windows, PowerShell, or null when it cannot be read. */
function commandLine(pid: number): string | null {
  try {
    if (process.platform === "win32") {
      return execFileSync(
        "powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          `(Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}').CommandLine`,
        ],
        { encoding: "utf8", windowsHide: true, timeout: 30_000 },
      );
    }
    return execFileSync("ps", ["-o", "command=", "-p", String(pid)], { encoding: "utf8", timeout: 10_000 });
  } catch {
    return null;
  }
}
