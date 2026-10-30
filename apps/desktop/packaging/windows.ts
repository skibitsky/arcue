import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { Arch, Version } from "./layout.ts";

const run = promisify(execFile);

/** The source of `bin\arcue.exe`. */
export const COMMAND_SOURCE = fileURLToPath(new URL("arcue.c", import.meta.url));
export const INSTALLER_SCRIPT = fileURLToPath(new URL("arcue.iss", import.meta.url));

/** The compiler's and linker's options: a small console program on the static C runtime, with the usual mitigations. */
export const CL_OPTIONS = ["/nologo", "/std:c17", "/W4", "/O1", "/MT", "/GS", "/guard:cf", "/DUNICODE"] as const;
export const LINK_OPTIONS = ["/SUBSYSTEM:CONSOLE", "/DYNAMICBASE", "/NXCOMPAT", "/guard:cf", "kernel32.lib"] as const;

/** vcvarsall.bat's argument for compiling on a host for a target, such as "amd64_arm64". */
export function vcvarsArgument(host: string, target: Arch): string {
  const name = (arch: string) => (arch === "arm64" ? "arm64" : "amd64");
  return name(host) === name(target) ? name(target) : `${name(host)}_${name(target)}`;
}

/**
 * cmd's arguments for running vcvarsall.bat and printing the environment it leaves. `/u` makes `set` write UTF-16LE,
 * which keeps names outside the console's code page, such as a user's in TMP, intact.
 */
export function vcvarsCommand(vcvarsall: string, host: string, target: Arch): string[] {
  return ["/d", "/u", "/s", "/c", `""${vcvarsall}" ${vcvarsArgument(host, target)} >nul && set"`];
}

/** The variables that `set` prints, one `NAME=value` per line. */
export function parseSet(output: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of output.split(/\r?\n/)) {
    const separator = line.indexOf("=");
    if (separator > 0) env[line.slice(0, separator)] = line.slice(separator + 1);
  }
  return env;
}

function pathOf(env: Record<string, string>): string {
  const name = Object.keys(env).find((key) => key.toUpperCase() === "PATH");
  return name ? (env[name] ?? "") : "";
}

/** The first `name` in the folders of a PATH value. */
export function findOnPath(name: string, path: string, exists: (file: string) => boolean = existsSync): string | null {
  for (const folder of path.split(delimiter)) {
    if (folder && exists(join(folder, name))) return join(folder, name);
  }
  return null;
}

/** The environment of Visual Studio's command prompt for building for `target`. */
async function compilerEnvironment(target: Arch): Promise<Record<string, string>> {
  const programFiles = process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)";
  const vswhere = join(programFiles, "Microsoft Visual Studio", "Installer", "vswhere.exe");
  const tools =
    target === "arm64"
      ? "Microsoft.VisualStudio.Component.VC.Tools.ARM64"
      : "Microsoft.VisualStudio.Component.VC.Tools.x86.x64";
  const found = existsSync(vswhere)
    ? await run(vswhere, ["-latest", "-products", "*", "-requires", tools, "-property", "installationPath", "-utf8"])
    : null;
  const installation = found?.stdout.split(/\r?\n/)[0]?.trim();
  if (!installation) {
    throw new Error(
      `Packaging Arcue for Windows compiles bin\\arcue.exe with Visual Studio's C++ build tools for ${target}, and none are installed. Install Visual Studio or its Build Tools with the "Desktop development with C++" workload.`,
    );
  }
  const vcvarsall = join(installation, "VC", "Auxiliary", "Build", "vcvarsall.bat");
  const { stdout } = await run(process.env.ComSpec ?? "cmd.exe", vcvarsCommand(vcvarsall, process.arch, target), {
    windowsVerbatimArguments: true,
    maxBuffer: 16 * 1024 * 1024,
    encoding: "buffer",
  });
  return parseSet(stdout.toString("utf16le"));
}

/** Compiles `arcue.c` into the Windows `arcue` command at `out`. */
export async function compileCommand(out: string, target: Arch): Promise<void> {
  const env = await compilerEnvironment(target);
  const cl = findOnPath("cl.exe", pathOf(env));
  if (!cl) throw new Error(`Visual Studio's command prompt for ${target} has no cl.exe on its PATH.`);
  const work = await mkdtemp(join(tmpdir(), "arcue-command-"));
  try {
    const built = join(work, "arcue.exe");
    await run(cl, [...CL_OPTIONS, `/Fe${built}`, COMMAND_SOURCE, "/link", ...LINK_OPTIONS], { cwd: work, env });
    await mkdir(dirname(out), { recursive: true });
    await copyFile(built, out);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

export interface InstallerOptions {
  version: Version;
  arch: Arch;
  /** The packaged app's folder. */
  source: string;
  outputDir: string;
  /** The installer's file name, without `.exe`. */
  outputName: string;
  icon: string;
}

/** ISCC's `/D` definitions for `arcue.iss`. */
export function installerDefines(options: InstallerOptions): string[] {
  return [
    `/DAppVersion=${options.version.full}`,
    `/DNumericVersion=${options.version.numeric}`,
    `/DArch=${options.arch}`,
    `/DSourceDir=${options.source}`,
    `/DOutputDir=${options.outputDir}`,
    `/DOutputName=${options.outputName}`,
    `/DIconFile=${options.icon}`,
  ];
}

/** Inno Setup's compiler: `ISCC` when set, then the one on PATH, then where its installer puts it. */
function findIscc(): string {
  const candidates = [
    process.env.ISCC,
    findOnPath("ISCC.exe", process.env.PATH ?? ""),
    join(process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)", "Inno Setup 6", "ISCC.exe"),
    join(process.env.LOCALAPPDATA ?? "", "Programs", "Inno Setup 6", "ISCC.exe"),
  ];
  const found = candidates.find((candidate) => candidate && existsSync(candidate));
  if (!found)
    throw new Error("Making the Windows installer needs Inno Setup 6.3 or later: https://jrsoftware.org/isdl.php");
  return found;
}

/** Builds the installer from the packaged app. */
export async function makeInstaller(options: InstallerOptions): Promise<void> {
  await mkdir(options.outputDir, { recursive: true });
  await run(findIscc(), ["/Q", ...installerDefines(options), INSTALLER_SCRIPT], { maxBuffer: 16 * 1024 * 1024 });
}
