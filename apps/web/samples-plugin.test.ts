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
      "beetle",
    ]);
    expect(entries[0]?.description).toMatch(/^Static prop/);
    expect(entries[0]?.files).toEqual(["crate.fbx"]);
  });

  it("lists a composition once, with its files, in place of the files it uses", () => {
    const entries = readSampleEntries(fileURLToPath(new URL("../../samples/", import.meta.url)));
    expect(entries.find((entry) => entry.id === "beetle")).toMatchObject({
      file: "beetle.arcue",
      model: "beetle.fbx",
      files: ["beetle.arcue", "beetle.fbx", "beetle-shells.fbx", "beetle-turn.fbx"],
    });
  });
});
