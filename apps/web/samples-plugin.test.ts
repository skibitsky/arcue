import { fileURLToPath } from "node:url";
import { compositionFileSchema } from "@arcue/protocol";
import { describe, expect, it } from "vitest";
import { readSampleEntries } from "./samples-plugin.ts";

const folder = fileURLToPath(new URL("../../samples/", import.meta.url));

describe("readSampleEntries", () => {
  it("lists the repository's samples by id, with their manifest descriptions", () => {
    const entries = readSampleEntries(folder);
    expect(entries.map((entry) => entry.id)).toEqual([
      "crate",
      "pebble-golem",
      "pebble-golem-sparse",
      "blob",
      "textured-rock",
      "beetle",
      "beetle-shells",
      "beetle-turn",
      "rock-lods",
      "zup-centimeters",
    ]);
    expect(entries[0]?.description).toMatch(/^Static prop/);
    expect(entries[0]?.files).toEqual(["crate.fbx"]);
    expect(entries[0]?.composition).toBeUndefined();
  });

  it("gives a model its composition from the manifest, with every file the composition names", () => {
    const beetle = readSampleEntries(folder).find((entry) => entry.id === "beetle");
    expect(beetle).toMatchObject({
      file: "beetle.fbx",
      description: expect.stringMatching(/^Modular beetle/),
      files: ["beetle.fbx", "beetle-turn.fbx", "beetle-shells.fbx"],
    });
    expect(compositionFileSchema.parse(beetle?.composition)).toEqual(beetle?.composition);
  });
});
