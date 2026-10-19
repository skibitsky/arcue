import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { lf } from "../src/assemble";

let raw: string;
let text: string;
let code: string;

beforeAll(async () => {
  raw = await readFile(fileURLToPath(new URL("arcue-node.cmd", import.meta.url)), "utf8");
  text = lf(raw);
  code = text
    .split("\n")
    .filter((line) => !/^\s*rem\b/i.test(line) && !/^\s*set "msg=/.test(line))
    .join("\n");
});

describe("arcue-node.cmd", () => {
  it("never reads its arguments", () => {
    expect(text).not.toMatch(/%[1-9*]/);
    expect(text).not.toMatch(/%~[a-z$:]*[1-9]/i);
    expect(code).not.toMatch(/\bshift\b/i);
    for (const call of code.matchAll(/\bcall\b(.*)$/gim)) {
      expect(call[1] ?? "", call[0]).toMatch(/^ :[a-z_]+(\s*(&&|\|\|).*)?$/i);
    }
  });

  it("expands no value with % after capturing it", () => {
    const expansions = new Set([...text.replaceAll("%%", "").matchAll(/%[^%\s]+%|%~[a-z]+0/gi)].map((m) => m[0]));

    expect([...expansions].sort()).toEqual(["%node%", "%~dp0", "%~n0"]);
  });

  it("looks node.exe up on PATH from its own folder", () => {
    expect(text).toContain('\npushd "%~dp0" && (\n  for %%I in (node.exe) do set "pathnode=%%~$PATH:I"\n  popd\n)\n');
    expect(text.split("%~$PATH").length).toBe(2);
  });

  it("calls System32 tools by absolute path", () => {
    const calls = [...code.matchAll(/\b(curl|tar|certutil|forfiles|ping)\.exe\b/gi)];

    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(code.slice(0, call.index), call[0]).toMatch(/(!sys!|%%sys%%)\\$/);
    }
  });

  it("is ASCII without trailing whitespace", () => {
    expect(/[^\p{ASCII}]/u.test(raw)).toBe(false);
    expect(/[ \t]$/m.test(text)).toBe(false);
  });
});
