import { describe, expect, it } from "vitest";
import { run } from "./run";

function capture() {
  const lines = { out: "", err: "" };
  return {
    lines,
    output: { out: (text: string) => (lines.out += text), err: (text: string) => (lines.err += text) },
  };
}

describe("arcue setup", () => {
  it("says there is nothing to set up when arcue runs on Node 24 or later", async () => {
    const { lines, output } = capture();

    const code = await run(["setup"], output, process.cwd(), {
      node: { version: "24.9.0", execPath: "/usr/local/bin/node" },
    });

    expect(code).toBe(0);
    expect(lines.out).toBe("Arcue runs on Node 24.9.0 at /usr/local/bin/node, so there is nothing to set up.\n");
  });

  it("exits with 3 from setup on an older Node", async () => {
    const { lines, output } = capture();

    const code = await run(["setup"], output, process.cwd(), {
      node: { version: "22.12.0", execPath: "/usr/bin/node" },
    });

    expect(code).toBe(3);
    expect(lines.err.startsWith("Arcue needs Node 24 or later, and runs on Node 22.12.0 at /usr/bin/node.")).toBe(true);
  });
});
