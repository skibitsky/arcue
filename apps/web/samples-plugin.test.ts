import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { readSampleEntries } from "./samples-plugin.ts";

describe("readSampleEntries", () => {
  it("lists the repository's samples by id, with their manifest descriptions", () => {
    const entries = readSampleEntries(fileURLToPath(new URL("../../samples/", import.meta.url)));
    expect(entries.map((entry) => entry.id)).toEqual([
      "crate",
      "pebble-golem",
      "pebble-golem-sparse",
      "blob",
      "textured-rock",
      "zup-centimeters",
    ]);
    expect(entries[0]?.description).toMatch(/^Static prop/);
  });
});
