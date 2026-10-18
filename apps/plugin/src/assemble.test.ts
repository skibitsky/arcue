import { lstat, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  assemblePlugin,
  codexManifest,
  ICON_PATH,
  mainMarketplaceManifest,
  PLUGIN,
  PLUGIN_BRANCH,
  PLUGIN_PATH,
} from "./assemble";

const fromRoot = (path: string) => fileURLToPath(new URL(`../../../${path}`, import.meta.url));
const skill = fromRoot("skills/arcue");

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
    expect((await readdir(join(copied, "scripts"))).sort()).toEqual(["arcue.js", "import-worker.js", "web"]);
    expect((await readdir(join(copied, "scripts", "web"), { recursive: true })).sort()).toEqual([
      "assets",
      "assets/index.js",
      "index.html",
    ]);
    expect(await readdir(join(out, PLUGIN_PATH))).toEqual(
      expect.arrayContaining(["LICENSE", "README.md", "assets", "skills", ".claude-plugin", ".codex-plugin"]),
    );
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
