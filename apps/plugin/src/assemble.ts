import { access, copyFile, cp, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/** What Arcue's plugin and marketplace say about it. Every manifest is generated from this. */
export const PLUGIN = {
  name: "arcue",
  displayName: "Arcue",
  description: "Review 3D models and animations in Arcue, and turn its anchored comments into exact fixes.",
  shortDescription: "Review 3D models in Arcue and apply the feedback",
  homepage: "https://github.com/skibitsky/arcue",
  license: "MIT",
  keywords: ["3d", "fbx", "animation", "review", "feedback"],
  brandColor: "#DD653D",
  defaultPrompts: ["Apply the Arcue review I pasted", "Show me this model in Arcue"],
} as const;

/** Where the plugin sits inside the marketplace. */
export const PLUGIN_PATH = `plugins/${PLUGIN.name}`;

export interface PluginSources {
  /** The skill folder, `skills/arcue`. */
  skill: string;
  /** The built command line, `apps/cli/dist`. */
  cli: string;
  readme: string;
  license: string;
}

/**
 * Replaces `out` with a marketplace that lists the plugin, and the plugin itself. Claude Code and Codex both read
 * `.claude-plugin/marketplace.json`, and each reads its own plugin manifest. The command line goes into the skill's
 * `scripts` folder, where the skill looks for it.
 */
export async function assemblePlugin(sources: PluginSources, out: string): Promise<void> {
  await access(join(sources.cli, "arcue.js")).catch(() => {
    throw new Error(`${sources.cli} has no arcue.js. Build the command line first: pnpm --filter @arcue/cli build`);
  });
  await rm(out, { recursive: true, force: true });
  const plugin = join(out, PLUGIN_PATH);
  const skill = join(plugin, "skills", PLUGIN.name);
  await writeJson(join(out, ".claude-plugin", "marketplace.json"), marketplaceManifest());
  await writeJson(join(plugin, ".claude-plugin", "plugin.json"), claudeManifest());
  await writeJson(join(plugin, ".codex-plugin", "plugin.json"), codexManifest());
  await cp(sources.skill, skill, { recursive: true, dereference: true });
  await cp(sources.cli, join(skill, "scripts"), { recursive: true, dereference: true });
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
      developerName: PLUGIN.displayName,
      websiteUrl: PLUGIN.homepage,
      defaultPrompt: [...PLUGIN.defaultPrompts],
      brandColor: PLUGIN.brandColor,
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
