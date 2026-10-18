import { access, copyFile, cp, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

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
}

/**
 * Replaces `out` with a marketplace that lists the plugin, and the plugin itself. Claude Code and Codex both read
 * `.claude-plugin/marketplace.json`, and each reads its own plugin manifest. The command line goes into the skill's
 * `scripts` folder, where the skill looks for it, with the page `arcue serve` serves in its `web` folder.
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
  await rm(out, { recursive: true, force: true });
  const plugin = join(out, PLUGIN_PATH);
  const skill = join(plugin, "skills", PLUGIN.name);
  await writeJson(join(out, ".claude-plugin", "marketplace.json"), marketplaceManifest());
  await writeJson(join(plugin, ".claude-plugin", "plugin.json"), claudeManifest());
  await writeJson(join(plugin, ".codex-plugin", "plugin.json"), codexManifest());
  await cp(sources.skill, skill, { recursive: true, dereference: true });
  await cp(sources.cliBuild, join(skill, "scripts"), { recursive: true, dereference: true });
  await cp(sources.webBuild, join(skill, "scripts", "web"), { recursive: true, dereference: true });
  await mkdir(join(plugin, dirname(ICON_PATH)), { recursive: true });
  await copyFile(sources.icon, join(plugin, ICON_PATH));
  await copyFile(sources.readme, join(plugin, "README.md"));
  await copyFile(sources.license, join(plugin, "LICENSE"));
  await writeFile(join(out, "README.md"), BRANCH_README);
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
