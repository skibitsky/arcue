import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  addToConfig,
  appCommand,
  arcueServer,
  CLAUDE_CONFIG_FILE,
  ClaudeConfigError,
  claudeConfigFolders,
  withArcue,
} from "./claude-config";

let temp: string;

beforeEach(async () => {
  temp = await realpath(await mkdtemp(join(tmpdir(), "arcue claude ")));
});

afterEach(async () => {
  await rm(temp, { recursive: true, force: true });
});

const server = arcueServer("/Applications/Arcue.app/Contents/Resources/bin/arcue");

describe("Arcue's server for Claude", () => {
  it("runs the app's own arcue mcp", () => {
    expect(appCommand("/Applications/Arcue.app/Contents/MacOS/Arcue", "darwin")).toBe(
      "/Applications/Arcue.app/Contents/Resources/bin/arcue",
    );
    expect(appCommand("C:\\Users\\Ada\\AppData\\Local\\Programs\\Arcue\\Arcue.exe", "win32")).toBe(
      "C:\\Users\\Ada\\AppData\\Local\\Programs\\Arcue\\bin\\arcue.exe",
    );
    expect(appCommand("/usr/lib/arcue/Arcue", "linux")).toBe("/usr/lib/arcue/bin/arcue");
    expect(server).toEqual({ command: "/Applications/Arcue.app/Contents/Resources/bin/arcue", args: ["mcp"] });
  });
});

describe("Claude's config", () => {
  it("gains Arcue's server and keeps every other setting and server", () => {
    const text = JSON.stringify({
      globalShortcut: "Ctrl+Space",
      mcpServers: { files: { command: "files-mcp", args: ["/work"], env: { TOKEN: "x" } } },
      preferences: { menuBarEnabled: true },
    });

    expect(JSON.parse(withArcue(text, server) ?? "")).toEqual({
      globalShortcut: "Ctrl+Space",
      mcpServers: { files: { command: "files-mcp", args: ["/work"], env: { TOKEN: "x" } }, arcue: server },
      preferences: { menuBarEnabled: true },
    });
  });

  it("starts from no settings when the file is missing or empty", () => {
    expect(withArcue(null, server)).toBe(`${JSON.stringify({ mcpServers: { arcue: server } }, null, 2)}\n`);
    expect(withArcue(" \n", server)).toBe(withArcue(null, server));
  });

  it("replaces an older entry of Arcue's, and leaves the file alone when it has this one", () => {
    const older = JSON.stringify({ mcpServers: { arcue: { command: "arcue", args: ["mcp"] } } });

    expect(JSON.parse(withArcue(older, server) ?? "")).toEqual({ mcpServers: { arcue: server } });
    expect(withArcue(JSON.stringify({ mcpServers: { arcue: server } }), server)).toBeNull();
    expect(
      withArcue(JSON.stringify({ mcpServers: { arcue: { args: ["mcp"], command: server.command } } }), server),
    ).toBeNull();
  });

  it("keeps what the user added to Arcue's entry, and reads a file that starts with a byte order mark", () => {
    const env = { ARCUE_USER_DATA: "/work/arcue" };
    const older = `\uFEFF${JSON.stringify({ mcpServers: { arcue: { command: "arcue", args: ["mcp"], env } } })}`;

    expect(JSON.parse(withArcue(older, server) ?? "")).toEqual({ mcpServers: { arcue: { ...server, env } } });
    expect(withArcue("\uFEFF", server)).toBe(withArcue(null, server));
  });

  it("refuses a file it cannot read as settings, rather than replace them", () => {
    expect(() => withArcue("{ mcpServers: {} ", server)).toThrow(ClaudeConfigError);
    expect(() => withArcue("[]", server)).toThrow("does not hold a JSON object");
    expect(() => withArcue('{"mcpServers": []}', server)).toThrow("has an mcpServers that is not a JSON object");
  });

  it("is written in one step, with the file's permissions, and names the file it refuses", async () => {
    const config = join(temp, CLAUDE_CONFIG_FILE);
    await writeFile(config, '{"mcpServers": {}}');
    await chmod(config, 0o666);

    expect(await addToConfig(temp, server)).toBe("added");
    expect(await addToConfig(temp, server)).toBe("unchanged");
    expect(JSON.parse(await readFile(config, "utf8"))).toEqual({ mcpServers: { arcue: server } });
    if (process.platform !== "win32") expect((await stat(config)).mode & 0o777).toBe(0o666);
    expect(await readdir(temp)).toEqual([CLAUDE_CONFIG_FILE]);

    await writeFile(config, "{");
    await expect(addToConfig(temp, server)).rejects.toThrow(`${config} is not valid JSON.`);
    expect(await readFile(config, "utf8")).toBe("{");
  });

  it.skipIf(process.platform === "win32")("is written where a linked config links", async () => {
    const dotfiles = join(temp, "dotfiles");
    const claude = join(temp, "Claude");
    await mkdir(dotfiles);
    await mkdir(claude);
    await writeFile(join(dotfiles, CLAUDE_CONFIG_FILE), "{}");
    await symlink(join(dotfiles, CLAUDE_CONFIG_FILE), join(claude, CLAUDE_CONFIG_FILE));

    expect(await addToConfig(claude, server)).toBe("added");
    expect((await lstat(join(claude, CLAUDE_CONFIG_FILE))).isSymbolicLink()).toBe(true);
    expect(JSON.parse(await readFile(join(dotfiles, CLAUDE_CONFIG_FILE), "utf8"))).toEqual({
      mcpServers: { arcue: server },
    });
    expect(await readdir(dotfiles)).toEqual([CLAUDE_CONFIG_FILE]);
  });

  it("is created when Claude has its folder but no config yet", async () => {
    expect(await addToConfig(temp, server)).toBe("added");
    expect(JSON.parse(await readFile(join(temp, CLAUDE_CONFIG_FILE), "utf8"))).toEqual({
      mcpServers: { arcue: server },
    });
  });
});

describe("where Claude keeps its config", () => {
  it("is in Application Support on macOS, once Claude made its folder", async () => {
    const place = { platform: "darwin" as const, home: temp, env: {} };
    expect(await claudeConfigFolders(place)).toEqual([]);

    const folder = join(temp, "Library", "Application Support", "Claude");
    await mkdir(folder, { recursive: true });
    expect(await claudeConfigFolders(place)).toEqual([folder]);
  });

  it("is in the roaming app data on Windows and in each Claude package's copy, where a config already is", async () => {
    const local = join(temp, "Local");
    const roaming = join(temp, "Roaming");
    const packaged = join(local, "Packages", "Claude_pzs8sxrjxfjjc", "LocalCache", "Roaming", "Claude");
    await mkdir(packaged, { recursive: true });
    await mkdir(join(local, "Packages", "ClaudeHelper_x1", "LocalCache", "Roaming", "Claude"), { recursive: true });
    const place = { platform: "win32" as const, home: temp, env: { LOCALAPPDATA: local, APPDATA: roaming } };
    expect(await claudeConfigFolders(place)).toEqual([packaged]);

    await mkdir(join(roaming, "Claude"), { recursive: true });
    expect(await claudeConfigFolders(place)).toEqual([packaged, join(roaming, "Claude")]);

    await writeFile(join(roaming, "Claude", CLAUDE_CONFIG_FILE), "{}");
    expect(await claudeConfigFolders(place)).toEqual([join(roaming, "Claude")]);

    await writeFile(join(packaged, CLAUDE_CONFIG_FILE), "{}");
    expect(await claudeConfigFolders(place)).toEqual([packaged, join(roaming, "Claude")]);
  });

  it("is in the XDG config folder on Linux", async () => {
    const config = join(temp, "config");
    await mkdir(join(config, "Claude"), { recursive: true });
    await mkdir(join(temp, ".config", "Claude"), { recursive: true });

    expect(await claudeConfigFolders({ platform: "linux", home: temp, env: { XDG_CONFIG_HOME: config } })).toEqual([
      join(config, "Claude"),
    ]);
    expect(await claudeConfigFolders({ platform: "linux", home: temp, env: { XDG_CONFIG_HOME: "config" } })).toEqual([
      join(temp, ".config", "Claude"),
    ]);
  });
});
