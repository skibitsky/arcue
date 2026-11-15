import { randomBytes } from "node:crypto";
import { chmod, readdir, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, posix, win32 } from "node:path";
import { commandInApp } from "./command-line";

/** The file where the Claude desktop app reads the MCP servers it starts, in its folder. */
export const CLAUDE_CONFIG_FILE = "claude_desktop_config.json";

/** The name of Arcue's server in Claude's config. */
export const CLAUDE_SERVER_NAME = "arcue";

export interface ClaudeServer {
  command: string;
  args: string[];
}

/** The server entry that runs the app's own `arcue mcp`. */
export function arcueServer(command: string): ClaudeServer {
  return { command, args: ["mcp"] };
}

/** The app's arcue command, beside its program on Windows and Linux and in its resources on macOS. */
export function appCommand(execPath: string, platform: NodeJS.Platform): string {
  if (platform === "win32") return win32.join(win32.dirname(execPath), "bin", "arcue.exe");
  if (platform === "darwin") return commandInApp(execPath);
  return posix.join(posix.dirname(execPath), "bin", "arcue");
}

export interface ConfigPlace {
  platform: NodeJS.Platform;
  home: string;
  env: NodeJS.ProcessEnv;
}

/**
 * The folders whose config Arcue writes: each of Claude's folders that holds one, or else every folder Claude made. On
 * Windows, Claude from the Microsoft Store or another MSIX package keeps new files in its own copy of the roaming app
 * data folder but edits a config the roaming folder already holds, so a copy without one must stay without one.
 */
export async function claudeConfigFolders({ platform, home, env }: ConfigPlace): Promise<string[]> {
  if (platform === "darwin") return withConfigFirst([join(home, "Library", "Application Support", "Claude")]);
  if (platform === "win32") {
    const folders: string[] = [];
    if (env.LOCALAPPDATA) {
      const packages = join(env.LOCALAPPDATA, "Packages");
      const names = await readdir(packages).catch(() => []);
      for (const name of names.filter((entry) => /^Claude_[a-z0-9]+$/i.test(entry)).sort()) {
        folders.push(join(packages, name, "LocalCache", "Roaming", "Claude"));
      }
    }
    folders.push(join(env.APPDATA || join(home, "AppData", "Roaming"), "Claude"));
    return withConfigFirst(folders);
  }
  const config = env.XDG_CONFIG_HOME?.startsWith("/") ? env.XDG_CONFIG_HOME : join(home, ".config");
  return withConfigFirst([join(config, "Claude")]);
}

async function withConfigFirst(folders: string[]): Promise<string[]> {
  const found: string[] = [];
  const configured: string[] = [];
  for (const folder of folders) {
    if (!(await stat(folder).catch(() => null))?.isDirectory()) continue;
    found.push(folder);
    if (await stat(join(folder, CLAUDE_CONFIG_FILE)).catch(() => null)) configured.push(folder);
  }
  return configured.length > 0 ? configured : found;
}

export class ClaudeConfigError extends Error {}

/**
 * The text of Claude's config with `server` as Arcue's, keeping every other setting and server and any other field of
 * Arcue's entry, or null when it already runs that command. An empty or missing file holds no settings yet. Refuses a
 * file that is not a JSON object, rather than replace the user's settings.
 */
export function withArcue(text: string | null, server: ClaudeServer): string | null {
  let config: unknown = {};
  const json = text?.replace(/^\uFEFF/, "") ?? "";
  if (json.trim() !== "") {
    try {
      config = JSON.parse(json);
    } catch {
      throw new ClaudeConfigError("is not valid JSON");
    }
  }
  if (!isObject(config)) throw new ClaudeConfigError("does not hold a JSON object");
  const servers = config.mcpServers ?? {};
  if (!isObject(servers)) throw new ClaudeConfigError("has an mcpServers that is not a JSON object");
  const old = servers[CLAUDE_SERVER_NAME];
  const kept = isObject(old) ? old : {};
  if (kept.command === server.command && JSON.stringify(kept.args) === JSON.stringify(server.args)) return null;
  const entry = { ...kept, ...server };
  return `${JSON.stringify({ ...config, mcpServers: { ...servers, [CLAUDE_SERVER_NAME]: entry } }, null, 2)}\n`;
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export type AddOutcome = "added" | "unchanged";

/**
 * Writes Arcue's server into the config in `folder`, replacing the file in one step so Claude never reads half of it.
 * A config that links elsewhere is written where it links.
 */
export async function addToConfig(folder: string, server: ClaudeServer): Promise<AddOutcome> {
  const linked = join(folder, CLAUDE_CONFIG_FILE);
  const path = await realpath(linked).catch((error: unknown) => {
    if (isMissing(error)) return linked;
    throw error;
  });
  const text = await readFile(path, "utf8").catch((error: unknown) => {
    if (isMissing(error)) return null;
    throw error;
  });
  const mode = text === null ? 0o600 : (await stat(path)).mode & 0o777;
  let next: string | null;
  try {
    next = withArcue(text, server);
  } catch (error) {
    if (error instanceof ClaudeConfigError) throw new ClaudeConfigError(`${linked} ${error.message}.`);
    throw error;
  }
  if (next === null) return "unchanged";
  const temporary = join(dirname(path), `.${CLAUDE_CONFIG_FILE}.arcue-${randomBytes(6).toString("hex")}`);
  try {
    await writeFile(temporary, next, { mode });
    await chmod(temporary, mode);
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
  return "added";
}
