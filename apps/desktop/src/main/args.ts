import { isAbsolute, resolve } from "node:path";
import { z } from "zod";

/** Models, and composition files, which open their model. */
export const ASSET_EXTENSIONS = [".fbx", ".arcue"];

/** What a second launch hands the running instance through the single-instance lock. */
export const launchDataSchema = z.object({ paths: z.array(z.string().min(1).max(4096)).max(100) });

export function isAssetPath(path: string): boolean {
  const lower = path.toLowerCase();
  return ASSET_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

/**
 * The asset files named on a command line, as absolute paths. The first argument is the executable, and when Electron
 * runs an unpackaged app (`defaultApp`) the second is the app's folder. Switches are skipped.
 */
export function assetPathsFromArgv(argv: readonly string[], workingDirectory: string, defaultApp: boolean): string[] {
  const rest = argv.slice(defaultApp ? 2 : 1);
  return rest
    .filter((arg) => !arg.startsWith("-") && isAssetPath(arg))
    .map((arg) => (isAbsolute(arg) ? arg : resolve(workingDirectory, arg)));
}
