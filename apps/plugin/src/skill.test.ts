import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const folder = fileURLToPath(new URL("../../../skills/arcue/", import.meta.url));

/** The frontmatter fields of the Agent Skills specification. claude.ai refuses a skill with any other. */
const STANDARD_FIELDS = ["name", "description", "license", "compatibility", "metadata", "allowed-tools"];

async function skillFile(): Promise<{ fields: Map<string, string>; body: string }> {
  const text = await readFile(join(folder, "SKILL.md"), "utf8");
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
  if (!match) throw new Error("SKILL.md has no frontmatter.");
  const fields = new Map<string, string>();
  for (const line of (match[1] ?? "").split("\n")) {
    const field = /^([\w-]+):\s*(.*)$/.exec(line);
    if (field) fields.set(field[1] ?? "", field[2] ?? "");
  }
  return { fields, body: match[2] ?? "" };
}

describe("the arcue skill", () => {
  it("uses only the specification's frontmatter fields", async () => {
    const { fields } = await skillFile();

    expect([...fields.keys()].filter((field) => !STANDARD_FIELDS.includes(field))).toEqual([]);
  });

  it("is named after its folder", async () => {
    const { fields } = await skillFile();

    expect(fields.get("name")).toBe(basename(folder));
    expect(fields.get("name")).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("has a description within the specification's 1024 characters", async () => {
    const { fields } = await skillFile();

    expect(fields.get("description")?.length ?? 0).toBeGreaterThan(0);
    expect(fields.get("description")?.length ?? 0).toBeLessThanOrEqual(1024);
  });

  it("keeps SKILL.md under the specification's 500 lines", async () => {
    const { body } = await skillFile();

    expect(body.split("\n").length).toBeLessThan(500);
  });

  it("links every reference, and every link finds its file", async () => {
    const { body } = await skillFile();
    const linked = new Set([...body.matchAll(/\]\(([^)#]+)\)/g)].map((link) => link[1] ?? ""));
    const references = (await readdir(join(folder, "references"))).map((file) => `references/${file}`);

    expect([...linked].sort()).toEqual(references.sort());
  });

  it("names itself in its Codex default prompt", async () => {
    const metadata = await readFile(join(folder, "agents/openai.yaml"), "utf8");

    expect(metadata).toMatch(/default_prompt: ".*\$arcue\b.*"/);
  });
});
