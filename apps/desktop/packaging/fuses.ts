import { join } from "node:path";
import type { FuseV1Config } from "@electron/fuses";
import { FuseState, FuseV1Options, FuseVersion, flipFuses, getCurrentFuseWire } from "@electron/fuses";
import type { Platform } from "./layout.ts";

/**
 * How the packaged Electron's fuses are set; the others keep Electron's defaults. The arcue command runs the command
 * line on it as Node, so it stays able to. NODE_OPTIONS cannot change what the app or that Node runs, and --inspect and
 * the like cannot open the app to a debugger, though Electron still honors them when it runs as Node.
 */
export const FUSES: ReadonlyMap<FuseV1Options, boolean> = new Map([
  [FuseV1Options.RunAsNode, true],
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable, false],
  [FuseV1Options.EnableNodeCliInspectArguments, false],
]);

/**
 * Electron in the folder @electron/packager extracts it to, before it renames it. On macOS that is the app, and
 * @electron/fuses finds the fuses in its framework.
 */
export function extractedElectron(folder: string, platform: Platform): string {
  if (platform === "darwin") return join(folder, "Electron.app");
  return join(folder, platform === "win32" ? "electron.exe" : "electron");
}

/** Sets the fuses of the Electron that @electron/packager extracted to `folder`, which it signs only later. */
export async function flipElectronFuses(folder: string, platform: Platform): Promise<void> {
  const config: FuseV1Config = { version: FuseVersion.V1 };
  for (const [fuse, on] of FUSES) config[fuse] = on;
  await flipFuses(extractedElectron(folder, platform), config);
}

/** The names of the fuses in FUSES that the Electron program or macOS app at `path` has set otherwise. */
export async function unsetFuses(path: string): Promise<string[]> {
  const wire = await getCurrentFuseWire(path);
  return [...FUSES]
    .filter(([fuse, on]) => wire[fuse] !== (on ? FuseState.ENABLE : FuseState.DISABLE))
    .map(([fuse]) => FuseV1Options[fuse]);
}
