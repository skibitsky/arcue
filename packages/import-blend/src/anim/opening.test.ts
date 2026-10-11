import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fixturesDir, importFixture, VERSIONS } from "../../test/fixtures";
import { matrixError, worldMatrices } from "../../test/geometry";

interface OpeningReference {
  objects: Record<string, { world: number[] }>;
  weights: Record<string, Record<string, number>>;
}

describe.each(VERSIONS)("the opening fixture from Blender %s", async (version) => {
  const scene = await importFixture("opening", version);
  const expected: OpeningReference = JSON.parse(readFileSync(`${fixturesDir}opening-${version}.json`, "utf8"));
  const worlds = worldMatrices(scene);

  for (const [name, { world }] of Object.entries(expected.objects)) {
    it(`places ${name} where Blender shows it when it opens the file`, () => {
      const index = scene.nodes.findIndex((node) => node.name === name);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(matrixError(worlds[index] ?? [], world)).toBeLessThan(1e-5);
    });
  }

  it("gives shape keys the weights Blender shows when it opens the file, and starts clips from them", () => {
    const face = scene.meshes.findIndex((mesh) => mesh.name === "Face");
    const weights = expected.weights.Face ?? {};
    const targets = scene.meshes[face]?.morphTargets ?? [];
    expect(targets.map((target) => target.name)).toEqual(["Blink", "Smile"]);
    for (const target of targets) expect(target.defaultWeight).toBeCloseTo(weights[target.name] ?? Number.NaN, 6);
    const node = scene.nodes.findIndex((candidate) => candidate.mesh === face);
    const smile = scene.clips
      .find((clip) => clip.name === "SmileAct")
      ?.tracks.find((track) => track.node === node && track.property === "weights");
    const blinks = Array.from(smile?.values ?? []).filter((_, index) => index % 2 === 0);
    expect(blinks.length).toBeGreaterThan(1);
    for (const blink of blinks) expect(blink).toBeCloseTo(weights.Blink ?? Number.NaN, 6);
  });
});
