import { cp, lstat, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  assemblePlugin,
  codexManifest,
  ICON_PATH,
  lf,
  mainMarketplaceManifest,
  PLUGIN,
  PLUGIN_BRANCH,
  PLUGIN_PATH,
} from "./assemble";

const fromRoot = (path: string) => fileURLToPath(new URL(`../../../${path}`, import.meta.url));
const skill = fromRoot("skills/arcue");
const launcher = fromRoot("apps/plugin/launcher");

let temp: string;
let cli: string;
let web: string;
let out: string;

beforeEach(async () => {
  temp = await mkdtemp(join(tmpdir(), "arcue-plugin-"));
  cli = join(temp, "cli");
  out = join(temp, "out");
  await mkdir(cli);
  await writeFile(join(cli, "arcue.js"), "#!/usr/bin/env node\n");
  await writeFile(join(cli, "import-worker.js"), "");
  web = join(temp, "web");
  await mkdir(join(web, "assets"), { recursive: true });
  await writeFile(join(web, "index.html"), "<!doctype html>");
  await writeFile(join(web, "assets", "index.js"), "");
});

afterEach(async () => {
  await rm(temp, { recursive: true, force: true });
});

const sources = () => ({
  skill,
  cliBuild: cli,
  webBuild: web,
  icon: fromRoot("assets/branding/png/arcue-256.png"),
  readme: fromRoot("apps/plugin/README.md"),
  license: fromRoot("LICENSE"),
  launcher,
});

async function readJson(path: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
}

async function filesUnder(folder: string): Promise<string[]> {
  const entries = await readdir(folder, { recursive: true, withFileTypes: true });
  return entries.filter((entry) => !entry.isDirectory()).map((entry) => join(entry.parentPath, entry.name));
}

describe("assemblePlugin", () => {
  it("writes a marketplace whose entry points at the plugin's own manifests", async () => {
    await assemblePlugin(sources(), out);

    const marketplace = await readJson(join(out, ".claude-plugin/marketplace.json"));
    expect(marketplace.plugins).toEqual([
      { name: PLUGIN.name, source: `./${PLUGIN_PATH}`, description: PLUGIN.description },
    ]);
    const claude = await readJson(join(out, PLUGIN_PATH, ".claude-plugin/plugin.json"));
    const codex = await readJson(join(out, PLUGIN_PATH, ".codex-plugin/plugin.json"));
    expect([claude.name, codex.name]).toEqual([PLUGIN.name, PLUGIN.name]);
    expect([claude.description, codex.description]).toEqual([PLUGIN.description, PLUGIN.description]);
    expect(claude).not.toHaveProperty("version");
  });

  it("ships its icon where both manifests point", async () => {
    await assemblePlugin(sources(), out);

    const claude = await readJson(join(out, PLUGIN_PATH, ".claude-plugin/plugin.json"));
    const codex = await readJson(join(out, PLUGIN_PATH, ".codex-plugin/plugin.json"));
    const codexInterface = codex.interface as Record<string, unknown>;
    expect([claude.icon, codexInterface.composerIcon, codexInterface.logo]).toEqual([
      `./${ICON_PATH}`,
      `./${ICON_PATH}`,
      `./${ICON_PATH}`,
    ]);
    expect((await lstat(join(out, PLUGIN_PATH, ICON_PATH))).isFile()).toBe(true);
  });

  it("keeps Codex's listing within the limits of OpenAI's plugin directory", () => {
    const { interface: listing } = codexManifest();

    expect(listing.displayName.length).toBeLessThanOrEqual(30);
    expect(listing.shortDescription.length).toBeLessThanOrEqual(30);
    expect(listing.longDescription.length).toBeLessThanOrEqual(4000);
    expect(listing.defaultPrompt.length).toBeLessThanOrEqual(3);
    for (const prompt of listing.defaultPrompt) expect(prompt.length).toBeLessThanOrEqual(128);
  });

  it("copies the skill unchanged and puts the command line in its scripts folder, with its web page", async () => {
    await assemblePlugin(sources(), out);

    const copied = join(out, PLUGIN_PATH, "skills", PLUGIN.name);
    for (const file of await filesUnder(skill)) {
      const relative = file.slice(skill.length);
      expect(await readFile(join(copied, relative), "utf8"), relative).toBe(await readFile(file, "utf8"));
    }
    expect((await readdir(join(copied, "scripts"))).sort()).toEqual([
      "arcue",
      "arcue-node.cmd",
      "arcue-setup.cmd",
      "arcue.js",
      "import-worker.js",
      "node-sha256sums.txt",
      "web",
    ]);
    expect((await readdir(join(copied, "scripts", "web"), { recursive: true })).sort()).toEqual([
      "assets",
      "assets/index.js",
      "index.html",
    ]);
    expect(await readdir(join(out, PLUGIN_PATH))).toEqual(
      expect.arrayContaining([
        "LICENSE",
        "README.md",
        "assets",
        "skills",
        ".claude-plugin",
        ".codex-plugin",
        ".gitattributes",
      ]),
    );
  });

  it("ships the shell launcher executable with LF endings and the Windows launchers with CRLF", async () => {
    await assemblePlugin(sources(), out);

    const scripts = join(out, PLUGIN_PATH, "skills", PLUGIN.name, "scripts");
    expect((await stat(join(scripts, "arcue"))).mode & 0o111).not.toBe(0);
    const shell = await readFile(join(scripts, "arcue"), "utf8");
    expect(shell).not.toContain("\r");
    expect(shell).toBe(lf(await readFile(join(launcher, "arcue"), "utf8")));
    expect(await readFile(join(scripts, "node-sha256sums.txt"), "utf8")).not.toContain("\r");
    const node = await readFile(join(scripts, "arcue-node.cmd"));
    const setup = await readFile(join(scripts, "arcue-setup.cmd"));
    expect(node.toString("latin1")).not.toMatch(/[^\r]\n|^\n/);
    expect(node.includes("\r\n")).toBe(true);
    expect(setup.equals(node)).toBe(true);
  });

  it("keeps the plugin's bytes when hosts check the branch out", async () => {
    await assemblePlugin(sources(), out);

    expect(await readFile(join(out, PLUGIN_PATH, ".gitattributes"), "utf8")).toBe("* -text\n");
  });

  it("writes only regular files, as Anthropic's plugin directory requires", async () => {
    await assemblePlugin(sources(), out);

    for (const file of await filesUnder(out)) expect((await lstat(file)).isFile(), file).toBe(true);
  });

  it("replaces what an earlier build left", async () => {
    await mkdir(out, { recursive: true });
    await writeFile(join(out, "stale.txt"), "");

    await assemblePlugin(sources(), out);

    expect(await readdir(out)).not.toContain("stale.txt");
  });

  it("asks for the command line to be built when it is missing", async () => {
    await rm(join(cli, "arcue.js"));

    await expect(assemblePlugin(sources(), out)).rejects.toThrow("pnpm --filter @arcue/cli build");
  });

  it("asks for the web page to be built when it is missing", async () => {
    await rm(join(web, "index.html"));

    await expect(assemblePlugin(sources(), out)).rejects.toThrow("pnpm --filter @arcue/web build:local");
  });

  it("asks for the launcher when it is missing", async () => {
    const copy = join(temp, "launcher");
    await cp(launcher, copy, { recursive: true });
    await rm(join(copy, "arcue"));

    await expect(assemblePlugin({ ...sources(), launcher: copy }, out)).rejects.toThrow(`${copy} has no arcue.`);
  });

  it("refuses Node pins that do not parse", async () => {
    const copy = join(temp, "launcher");
    await cp(launcher, copy, { recursive: true });
    const pins = join(copy, "node-sha256sums.txt");
    await writeFile(pins, (await readFile(pins, "utf8")).slice(1));

    await expect(assemblePlugin({ ...sources(), launcher: copy }, out)).rejects.toThrow("pin-node");
  });

  it("refuses an arcue-node.cmd that is not ASCII", async () => {
    const copy = join(temp, "launcher");
    await cp(launcher, copy, { recursive: true });
    const cmd = join(copy, "arcue-node.cmd");
    await writeFile(cmd, `${await readFile(cmd, "utf8")}rem caf\u00e9\r\n`);

    await expect(assemblePlugin({ ...sources(), launcher: copy }, out)).rejects.toThrow("arcue-node.cmd must be ASCII");
  });

  it("refuses a command line build that holds a file named like a launcher or node", async () => {
    for (const name of ["arcue", "node", "node.exe"]) {
      await writeFile(join(cli, name), "");

      await expect(assemblePlugin(sources(), out), name).rejects.toThrow(
        `${cli} has ${name}, which the plugin's scripts folder must not hold.`,
      );
      await rm(join(cli, name));
    }
  });
});

describe("the marketplace on main", () => {
  it("matches mainMarketplaceManifest", async () => {
    expect(await readJson(fromRoot(".claude-plugin/marketplace.json"))).toEqual(mainMarketplaceManifest());
  });

  it("installs the plugin from where the plugin branch keeps it", () => {
    expect(mainMarketplaceManifest().plugins).toEqual([
      expect.objectContaining({
        name: PLUGIN.name,
        source: {
          source: "git-subdir",
          url: "https://github.com/skibitsky/arcue.git",
          path: PLUGIN_PATH,
          ref: PLUGIN_BRANCH,
        },
      }),
    ]);
  });
});
