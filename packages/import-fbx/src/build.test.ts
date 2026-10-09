import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

interface BuildRecord {
  ufbx: { tag: string };
  inputs: Record<string, string>;
  outputs: Record<string, string>;
}

function sha256(relativePath: string): string {
  return createHash("sha256")
    .update(readFileSync(new URL(`../${relativePath}`, import.meta.url)))
    .digest("hex");
}

function readJson<Value>(relativePath: string): Value {
  return JSON.parse(readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8"));
}

describe("committed build inputs and outputs", () => {
  it("vendors ufbx exactly as recorded", () => {
    const source = readJson<{ tag: string; sha256: Record<string, string> }>("vendor/ufbx/source.json");
    expect(source.tag).toBe("v0.23.1");
    for (const [file, hash] of Object.entries(source.sha256)) expect(sha256(`vendor/ufbx/${file}`)).toBe(hash);
  });

  it("ships the WebAssembly module built from the current inputs", () => {
    const build = readJson<BuildRecord>("wasm/build.json");
    expect(build.ufbx.tag).toBe("v0.23.1");
    expect(Object.keys(build.inputs).sort()).toEqual([
      "native/arcue_ufbx.c",
      "scripts/build-wasm.mjs",
      "vendor/ufbx/ufbx.c",
      "vendor/ufbx/ufbx.h",
    ]);
    for (const [input, hash] of Object.entries(build.inputs)) {
      expect(sha256(input), `${input} changed since the last build: run pnpm build:wasm`).toBe(hash);
    }
    for (const [output, hash] of Object.entries(build.outputs)) expect(sha256(output)).toBe(hash);
  });
});
