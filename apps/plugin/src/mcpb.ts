import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import type { CommandLineSources } from "./assemble.ts";
import { checkBuilds, copyCommandLine, PLUGIN } from "./assemble.ts";
import type { ZipEntry } from "./zip.ts";
import { zip } from "./zip.ts";

/** The extension for the Claude desktop app that each release ships. */
export const MCPB_FILE = "Arcue.mcpb";

/** The folder of the bundle that holds the command line. */
const SERVER = "server";

/** Arcue's command line needs Node 24, which the Claude desktop app's own Node for extensions has. */
const NODE_RANGE = ">=24.0.0";

export interface McpbTool {
  name: string;
  description: string;
}

export interface McpbSources extends CommandLineSources {
  /** A square PNG. */
  icon: string;
}

/** The manifest of the bundle: `arcue mcp` on the Node the app gives it. */
export function mcpbManifest(version: string, tools: readonly McpbTool[]) {
  return {
    manifest_version: "0.3",
    name: PLUGIN.name,
    display_name: PLUGIN.displayName,
    version,
    description: "Read and send the comments on your 3D models in Arcue, and see the models in the conversation.",
    long_description:
      "Pin or paint comments on a 3D model or animation in Arcue, and Claude gets the vertices, bones, frame, camera and screenshots behind each one. Claude lists your open models, reads their comments, resolves them once fixed, and shows a model in the conversation, where you can comment on it and send the comments to the chat.",
    author: { name: PLUGIN.displayName, url: PLUGIN.homepage },
    homepage: PLUGIN.homepage,
    documentation: `${PLUGIN.homepage}/blob/main/INSTALL.md#mcp-server`,
    support: `${PLUGIN.homepage}/issues`,
    repository: { type: "git", url: `${PLUGIN.homepage}.git` },
    license: PLUGIN.license,
    keywords: [...PLUGIN.keywords],
    icon: "icon.png",
    server: {
      type: "node",
      entry_point: `${SERVER}/arcue.js`,
      mcp_config: { command: "node", args: [`\${__dirname}/${SERVER}/arcue.js`, "mcp"] },
    },
    tools: tools.map(({ name, description }) => ({ name, description: firstSentence(description) })),
    compatibility: { platforms: ["darwin", "win32", "linux"], runtimes: { node: NODE_RANGE } },
  };
}

function firstSentence(text: string): string {
  const end = text.search(/\.(\s|$)/);
  return end === -1 ? text : text.slice(0, end + 1);
}

/** The bundle: its manifest and icon, and the command line in `server` with its pages, as the plugin's scripts hold it. */
export async function buildMcpb(sources: McpbSources, version: string, tools: readonly McpbTool[]): Promise<Buffer> {
  await checkBuilds(sources);
  const staging = await mkdtemp(join(tmpdir(), "arcue-mcpb-"));
  try {
    await copyCommandLine(sources, staging);
    const files = (await readdir(staging, { recursive: true, withFileTypes: true }))
      .filter((entry) => entry.isFile())
      .map((entry) => join(entry.parentPath, entry.name))
      .sort();
    const entries: ZipEntry[] = [
      { name: "manifest.json", bytes: Buffer.from(`${JSON.stringify(mcpbManifest(version, tools), null, 2)}\n`) },
      { name: "icon.png", bytes: await readFile(sources.icon) },
    ];
    for (const file of files) {
      entries.push({ name: `${SERVER}/${relative(staging, file).split(sep).join("/")}`, bytes: await readFile(file) });
    }
    return zip(entries);
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}
