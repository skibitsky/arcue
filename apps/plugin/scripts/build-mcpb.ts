import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import type { McpbTool } from "../src/mcpb.ts";
import { buildMcpb, MCPB_FILE } from "../src/mcpb.ts";

const fromRoot = (path: string) => fileURLToPath(new URL(`../../../${path}`, import.meta.url));
const cliBuild = fromRoot("apps/cli/dist");
const out = fromRoot("apps/plugin/out");

/** The tools the built `arcue mcp` lists to an app that shows no views, as the manifest names them. */
async function listTools(script: string): Promise<McpbTool[]> {
  const userData = await mkdtemp(join(tmpdir(), "arcue-mcpb-tools-"));
  const sessions = ["ARCUE_VIEW", "CLAUDE_CODE_SESSION_ID", "CODEX_SESSION_ID", "CODEX_THREAD_ID"];
  const env = Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => {
      const [name, value] = entry;
      return value !== undefined && !sessions.includes(name);
    }),
  );
  const client = new Client({ name: "arcue-mcpb", version: "1.0.0" });
  try {
    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: [script, "mcp"],
        env: { ...env, ARCUE_USER_DATA: userData },
        stderr: "inherit",
      }),
    );
    const { tools } = await client.listTools();
    return tools.map(({ name, description }) => ({ name, description: description ?? "" }));
  } finally {
    await client.close();
    await rm(userData, { recursive: true, force: true });
  }
}

const { version } = JSON.parse(await readFile(fromRoot("apps/desktop/package.json"), "utf8")) as { version: string };
const bundle = await buildMcpb(
  {
    cliBuild,
    webBuild: fromRoot("apps/web/dist-local"),
    viewPage: fromRoot("apps/web/dist-view/view.html"),
    icon: fromRoot("assets/branding/png/arcue-512.png"),
  },
  version,
  await listTools(join(cliBuild, "arcue.js")),
);
await mkdir(out, { recursive: true });
await writeFile(join(out, MCPB_FILE), bundle);
console.log(`Built ${join(out, MCPB_FILE)}, ${(bundle.length / 1024 / 1024).toFixed(1)} MB.`);
