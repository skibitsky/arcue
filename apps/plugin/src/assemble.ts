import { access, chmod, copyFile, cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { NODE_PINS_FILE, parseNodePins } from "./node-pins.ts";

export const PLUGIN = {
  name: "arcue",
  displayName: "Arcue",
  description: "Apply Arcue's 3D model reviews and open models in Arcue at a clip and frame.",
  shortDescription: "Apply Arcue's 3D reviews",
  longDescription:
    "Pin or paint comments on a 3D model or animation in Arcue, and your agent gets the vertices, bones, frame, camera and screenshots behind each one. The plugin teaches Claude Code and Codex to read these reviews, fix the FBX or Blender files, and show models in Arcue: in the app's built-in browser, or in the Arcue desktop app.",
  homepage: "https://github.com/skibitsky/arcue",
  license: "MIT",
  keywords: ["3d", "fbx", "blender", "animation", "review", "feedback"],
  brandColor: "#DD653D",
  category: "Developer Tools",
  defaultPrompts: ["Apply the Arcue review I pasted", "Show me this model in Arcue"],
} as const;

export const PLUGIN_PATH = `plugins/${PLUGIN.name}`;

export const PLUGIN_BRANCH = "plugin";

/** The plugin's icon, relative to its folder. */
export const ICON_PATH = "assets/icon.png";

export interface PluginSources {
  skill: string;
  cliBuild: string;
  /** The page `arcue serve` serves. */
  webBuild: string;
  /** A square PNG. */
  icon: string;
  readme: string;
  license: string;
  /** apps/plugin/launcher: the launchers and the Node pins. */
  launcher: string;
}

/** The files from `launcher` that ship in the skill's `scripts` folder. */
export const LAUNCHER_FILES = [
  { source: "arcue", name: "arcue", eol: "lf", executable: true },
  { source: "arcue-node.cmd", name: "arcue-node.cmd", eol: "crlf", executable: false },
  { source: "arcue-node.cmd", name: "arcue-setup.cmd", eol: "crlf", executable: false },
  { source: NODE_PINS_FILE, name: NODE_PINS_FILE, eol: "lf", executable: false },
] as const;

export function lf(text: string): string {
  return text.replaceAll("\r\n", "\n");
}

export function crlf(text: string): string {
  return lf(text).replaceAll("\n", "\r\n");
}

/**
 * Replaces `out` with a marketplace that lists the plugin, and the plugin itself. Claude Code and Codex both read
 * `.claude-plugin/marketplace.json`, and each reads its own plugin manifest. The command line goes into the skill's
 * `scripts` folder, where the skill looks for it, with its launchers and the page `arcue serve` serves in its `web`
 * folder.
 */
export async function assemblePlugin(sources: PluginSources, out: string): Promise<void> {
  await access(join(sources.cliBuild, "arcue.js")).catch(() => {
    throw new Error(
      `${sources.cliBuild} has no arcue.js. Build the command line first: pnpm --filter @arcue/cli build`,
    );
  });
  await access(join(sources.webBuild, "index.html")).catch(() => {
    throw new Error(
      `${sources.webBuild} has no index.html. Build the page first: pnpm --filter @arcue/web build:local`,
    );
  });
  const launchers = await readLaunchers(sources.launcher);
  parseNodePins(launchers.get(NODE_PINS_FILE) ?? "");
  if (/[^\p{ASCII}]/u.test(launchers.get("arcue-node.cmd") ?? "")) {
    throw new Error("arcue-node.cmd must be ASCII: cmd.exe reads it in the console's code page.");
  }
  const forbidden = new Set<string>([...LAUNCHER_FILES.map((file) => file.name), "node", "node.exe"]);
  for (const name of await readdir(sources.cliBuild)) {
    if (forbidden.has(name)) {
      throw new Error(`${sources.cliBuild} has ${name}, which the plugin's scripts folder must not hold.`);
    }
  }
  await rm(out, { recursive: true, force: true });
  const plugin = join(out, PLUGIN_PATH);
  const skill = join(plugin, "skills", PLUGIN.name);
  await writeJson(join(out, ".claude-plugin", "marketplace.json"), marketplaceManifest());
  await writeJson(join(plugin, ".claude-plugin", "plugin.json"), claudeManifest());
  await writeJson(join(plugin, ".codex-plugin", "plugin.json"), codexManifest());
  await cp(sources.skill, skill, { recursive: true, dereference: true });
  await cp(sources.cliBuild, join(skill, "scripts"), { recursive: true, dereference: true });
  for (const file of LAUNCHER_FILES) {
    const text = launchers.get(file.source) ?? "";
    const path = join(skill, "scripts", file.name);
    await writeFile(path, file.eol === "crlf" ? crlf(text) : lf(text));
    if (file.executable) await chmod(path, 0o755);
  }
  await cp(sources.webBuild, join(skill, "scripts", "web"), { recursive: true, dereference: true });
  await mkdir(join(plugin, dirname(ICON_PATH)), { recursive: true });
  await copyFile(sources.icon, join(plugin, ICON_PATH));
  await copyFile(sources.readme, join(plugin, "README.md"));
  await copyFile(sources.license, join(plugin, "LICENSE"));
  await writeFile(join(plugin, ".gitattributes"), "* -text\n");
  await writeFile(join(out, "README.md"), BRANCH_README);
}

async function readLaunchers(launcher: string): Promise<Map<string, string>> {
  const texts = new Map<string, string>();
  for (const { source } of LAUNCHER_FILES) {
    if (texts.has(source)) continue;
    const text = await readFile(join(launcher, source), "utf8").catch(() => {
      throw new Error(`${launcher} has no ${source}.`);
    });
    texts.set(source, text);
  }
  return texts;
}

export function marketplaceManifest() {
  return {
    name: PLUGIN.name,
    description: PLUGIN.description,
    owner: { name: PLUGIN.displayName },
    plugins: [{ name: PLUGIN.name, source: `./${PLUGIN_PATH}`, description: PLUGIN.description }],
  };
}

/**
 * The marketplace committed at `.claude-plugin/marketplace.json` on `main`, for hosts that read only the default
 * branch, such as the Claude desktop app. It installs the plugin from the plugin branch. Codex has no `github` source
 * and claude.ai refuses `owner/repo` in a `git-subdir` source, so the entry is a `git-subdir` with the full URL.
 */
export function mainMarketplaceManifest() {
  return {
    name: PLUGIN.name,
    description: PLUGIN.description,
    owner: { name: PLUGIN.displayName },
    plugins: [
      {
        name: PLUGIN.name,
        source: { source: "git-subdir", url: `${PLUGIN.homepage}.git`, path: PLUGIN_PATH, ref: PLUGIN_BRANCH },
        description: PLUGIN.description,
      },
    ],
  };
}

/** Without a `version`, Claude Code versions the plugin by its commit, so every published change reaches users. */
export function claudeManifest() {
  return {
    name: PLUGIN.name,
    displayName: PLUGIN.displayName,
    description: PLUGIN.description,
    author: { name: PLUGIN.displayName, url: PLUGIN.homepage },
    homepage: PLUGIN.homepage,
    repository: PLUGIN.homepage,
    license: PLUGIN.license,
    keywords: [...PLUGIN.keywords],
    icon: `./${ICON_PATH}`,
    documentationUrl: `${PLUGIN.homepage}#readme`,
    supportUrl: `${PLUGIN.homepage}/issues`,
  };
}

export function codexManifest() {
  return {
    name: PLUGIN.name,
    description: PLUGIN.description,
    keywords: [...PLUGIN.keywords],
    interface: {
      displayName: PLUGIN.displayName,
      shortDescription: PLUGIN.shortDescription,
      longDescription: PLUGIN.longDescription,
      developerName: PLUGIN.displayName,
      category: PLUGIN.category,
      capabilities: ["Interactive", "Read", "Write"],
      websiteUrl: PLUGIN.homepage,
      defaultPrompt: [...PLUGIN.defaultPrompts],
      brandColor: PLUGIN.brandColor,
      composerIcon: `./${ICON_PATH}`,
      logo: `./${ICON_PATH}`,
    },
  };
}

const BRANCH_README = `# Arcue plugin

The Publish plugin workflow builds this branch from \`main\` with \`apps/plugin\`. Don't edit it here: change
\`skills/arcue\` or \`apps/plugin\` on \`main\`.

- Claude Code: \`claude plugin marketplace add skibitsky/arcue#plugin\`, then \`claude plugin install arcue@arcue\`
- Codex: \`codex plugin marketplace add skibitsky/arcue@plugin\`, then \`codex plugin add arcue@arcue\`
`;

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}
