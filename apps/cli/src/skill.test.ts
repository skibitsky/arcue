import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseArgs, USAGE } from "./args";

const skill = fileURLToPath(new URL("../../../skills/arcue/", import.meta.url));

/** Every `arcue …` command the skill shows, in inline code or in code blocks. */
async function commandsInSkill(): Promise<string[]> {
  const entries = await readdir(skill, { recursive: true, withFileTypes: true });
  const commands: string[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    let inBlock = false;
    for (const line of (await readFile(join(entry.parentPath, entry.name), "utf8")).split("\n")) {
      if (line.trimStart().startsWith("```")) inBlock = !inBlock;
      else if (inBlock) commands.push(line.trim());
      else commands.push(...[...line.matchAll(/`([^`]+)`/g)].map((code) => code[1] ?? ""));
    }
  }
  return commands.filter((code) => code.startsWith("arcue "));
}

/**
 * The command's arguments with every optional `[part]` given, and each `<placeholder>` replaced by a value of the kind
 * it stands for.
 */
function argumentsOf(command: string): string[] {
  const words = [...command.replaceAll(/[[\]]/g, "").matchAll(/"([^"]*)"|(\S+)/g)].map(
    (word) => word[1] ?? word[2] ?? "",
  );
  return words
    .slice(1)
    .map((word, index, all) => (/^<.+>$/.test(word) ? (all[index - 1] === "--frame" ? "12" : "Hero.fbx") : word));
}

describe("the arcue skill", () => {
  it("shows only commands the command line accepts", async () => {
    const commands = await commandsInSkill();

    expect(commands.length).toBeGreaterThanOrEqual(4);
    for (const command of commands) {
      const args = argumentsOf(command);
      if (args.length === 1)
        expect(USAGE, `${command} names no command`).toMatch(new RegExp(`^  arcue ${args[0]}\\b`, "m"));
      else expect(() => parseArgs(args), command).not.toThrow();
    }
  });
});
