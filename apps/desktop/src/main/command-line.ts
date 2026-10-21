import { lstat, mkdir, readlink, rm, symlink } from "node:fs/promises";
import { dirname, resolve } from "node:path";

/** Where the macOS app links the arcue command: a folder on the PATH of every macOS shell. */
export const COMMAND_LINK = "/usr/local/bin/arcue";

/** The Arcue.app folder of the app whose program, Contents/MacOS/Arcue, is `execPath`. */
export function appBundle(execPath: string): string {
  return resolve(dirname(execPath), "..", "..");
}

/** The arcue command inside the app. */
export function commandInApp(execPath: string): string {
  return resolve(appBundle(execPath), "Contents", "Resources", "bin", "arcue");
}

/**
 * Why the command must not link into the app where it runs, if it must not: a link into the app's disk image, or into
 * the temporary copy macOS runs a downloaded app from, breaks once the app moves.
 */
export function moveFirst(bundle: string, readOnly: boolean): string | null {
  if (bundle.includes("/AppTranslocation/")) {
    return "macOS runs Arcue from a temporary copy until it is in the Applications folder. Move it there, open it again, and install the command.";
  }
  if (readOnly && bundle.startsWith("/Volumes/")) {
    return "Arcue runs from its disk image. Drag it to the Applications folder, open it from there, and install the command.";
  }
  return null;
}

export type LinkState = "ours" | "missing" | "other";

/** Whether `link` is a symlink to `command`, nothing, or something else. */
export async function linkState(link: string, command: string): Promise<LinkState> {
  const stats = await lstat(link).catch(() => null);
  if (!stats) return "missing";
  if (!stats.isSymbolicLink()) return "other";
  return resolve(dirname(link), await readlink(link)) === command ? "ours" : "other";
}

/** Links `link` to `command` in place of what is there. Rejects with EACCES or EPERM when that needs an administrator. */
export async function linkCommand(link: string, command: string): Promise<void> {
  await mkdir(dirname(link), { recursive: true });
  await rm(link, { force: true });
  await symlink(command, link);
}

const shellQuote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;

/** The AppleScript that links the command as an administrator, after macOS asks for a password. */
export function administratorScript(link: string, command: string): string {
  const shell = `/bin/mkdir -p ${shellQuote(dirname(link))} && /bin/ln -sfn ${shellQuote(command)} ${shellQuote(link)}`;
  return `do shell script "${shell.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}" with administrator privileges`;
}
