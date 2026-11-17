import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildMcpb, MCPB_FILE, mcpbManifest } from "./mcpb";
import { unzip } from "./test-unzip";

const fromRoot = (path: string) => fileURLToPath(new URL(`../../../${path}`, import.meta.url));

describe("the extension for Claude", () => {
  let temp: string;
  let sources: { cliBuild: string; webBuild: string; viewPage: string; icon: string };

  beforeEach(async () => {
    temp = await mkdtemp(join(tmpdir(), "arcue-mcpb-test-"));
    const cli = join(temp, "cli");
    const web = join(temp, "web");
    await mkdir(join(web, "assets"), { recursive: true });
    await mkdir(cli);
    await writeFile(join(cli, "arcue.js"), "#!/usr/bin/env node\n");
    await writeFile(join(cli, "card.html"), "<!doctype html>");
    await writeFile(join(web, "index.html"), "<!doctype html>");
    await writeFile(join(web, "assets", "index.js"), "");
    await writeFile(join(temp, "view.html"), "<!doctype html><title>Arcue</title>");
    sources = {
      cliBuild: cli,
      webBuild: web,
      viewPage: join(temp, "view.html"),
      icon: fromRoot("assets/branding/png/arcue-512.png"),
    };
  });

  afterEach(async () => {
    await rm(temp, { recursive: true, force: true });
  });

  it("runs arcue mcp on the Node the app gives it, which must be Node 24 or later", () => {
    const manifest = mcpbManifest("1.2.0", []);

    expect(manifest).toMatchObject({ manifest_version: "0.3", name: "arcue", display_name: "Arcue", version: "1.2.0" });
    expect(manifest.server).toEqual({
      type: "node",
      entry_point: "server/arcue.js",
      mcp_config: { command: "node", args: [`\${__dirname}/server/arcue.js`, "mcp"] },
    });
    expect(manifest.compatibility.runtimes).toEqual({ node: ">=24.0.0" });
  });

  it("lists the server's tools by the first sentence of each description", () => {
    const tools = [
      { name: "list_models", description: "List the models open in Arcue. One per line." },
      { name: "open_model", description: "Show a model in Arcue, at clip 1.5 of v2.0" },
    ];

    expect(mcpbManifest("1.2.0", tools).tools).toEqual([
      { name: "list_models", description: "List the models open in Arcue." },
      { name: "open_model", description: "Show a model in Arcue, at clip 1.5 of v2.0" },
    ]);
  });

  it("holds its manifest and icon, and the command line with its pages as the plugin's scripts do", async () => {
    const files = unzip(await buildMcpb(sources, "1.2.0", [{ name: "list_models", description: "List." }]));

    expect([...files.keys()]).toEqual([
      "manifest.json",
      "icon.png",
      "server/arcue.js",
      "server/card.html",
      "server/package.json",
      "server/view.html",
      "server/web/assets/index.js",
      "server/web/index.html",
    ]);
    expect(JSON.parse(files.get("manifest.json")?.toString("utf8") ?? "")).toEqual(
      mcpbManifest("1.2.0", [{ name: "list_models", description: "List." }]),
    );
    expect(JSON.parse(files.get("server/package.json")?.toString("utf8") ?? "")).toEqual({ type: "module" });
  });

  it("is the file the Release workflow publishes and the release notes link", async () => {
    const notes = await readFile(fromRoot("apps/desktop/packaging/release-notes.ts"), "utf8");
    const workflow = await readFile(fromRoot(".github/workflows/release.yml"), "utf8");

    expect(/^export const CLAUDE_EXTENSION = "(.+)";$/m.exec(notes)?.[1]).toBe(MCPB_FILE);
    expect(workflow).toContain(`path: apps/plugin/out/${MCPB_FILE}\n`);
  });

  it("says what to build first when the command line or its pages are missing", async () => {
    await rm(join(sources.webBuild, "index.html"));

    await expect(buildMcpb(sources, "1.2.0", [])).rejects.toThrow("pnpm --filter @arcue/web build:local");
  });
});
