import { readFileSync } from "node:fs";
import type { SceneDescription } from "@arcue/scene";
import { describe, expect, it } from "vitest";
import { fixturesDir, importFixture, VERSIONS } from "../test/fixtures";
import { placedSourceVertices, pointsError, worldMatrices } from "../test/geometry";

/** What `generate.py` records for the relations fixture. */
interface RelationsReference {
  /** Scene-space positions of each skinned mesh's vertices at rest. */
  rest: Record<string, number[]>;
  /** How many copies of its children Blender draws for each instancer. */
  instances: Record<string, number>;
  /** The objects that Blender draws instances other than their children for. */
  otherInstances: string[];
  /** The instancers that Blender draws themselves. */
  instancersDrawn: string[];
  /** Objects from other files that Blender shows. */
  linkedShown: string[];
  /** The objects named as LOD levels that Blender shows. */
  levelsShown: string[];
  /** Instancers with Blender's Smooth by Angle modifier. */
  smoothedByAngle: string[];
  /** The particle emitters Blender draws as well as their particles. */
  emittersDrawn: string[];
  clips: Record<string, { frame: number; positions: Record<string, number[]> }[]>;
}

const TOLERANCE = 1e-4;

/** The tolerance for positions, which grows with their distance from the origin as float32 rounding does. */
function positionTolerance(positions: readonly number[]): number {
  return TOLERANCE + 4 * 2 ** -23 * positions.reduce((largest, value) => Math.max(largest, Math.abs(value)), 0);
}

const INSTANCERS = [
  "Scatter",
  "Tiler",
  "Bare",
  "HiddenScatter",
  "EmptyScatter",
  "SelfHiddenScatter",
  "NodeScatter",
  "SelfHiddenBare",
  "Emitter",
  "SmoothScatter",
  "PlainNodeScatter",
];

function meshIndex(scene: SceneDescription, name: string): number {
  const index = scene.meshes.findIndex((mesh) => mesh.name === name);
  if (index < 0) throw new RangeError(`No mesh ${name}.`);
  return index;
}

describe.each(VERSIONS)("the relations fixture from Blender %s", async (version) => {
  const scene = await importFixture("relations", version);
  const expected: RelationsReference = JSON.parse(readFileSync(`${fixturesDir}relations-${version}.json`, "utf8"));
  const warning = (code: string, subject: string) =>
    scene.source.warnings.find((entry) => entry.code === code && entry.subject.name === subject);

  it("places every skinned mesh where Blender does at rest", () => {
    for (const [name, positions] of Object.entries(expected.rest)) {
      const placed = placedSourceVertices(scene, meshIndex(scene, name), worldMatrices(scene), []);
      expect(pointsError(placed, positions), name).toBeLessThan(positionTolerance(positions));
    }
  });

  it("warns about each skinned mesh that a clip shows other than Blender does, and only about those", () => {
    const differing: [string, string][] = [];
    for (const [name, samples] of Object.entries(expected.clips)) {
      const clip = scene.clips.find((candidate) => candidate.name === name);
      if (!clip) throw new RangeError(`No clip ${name}.`);
      for (const mesh of Object.keys(expected.rest)) {
        const off = samples.some((sample) => {
          const worlds = worldMatrices(scene, clip, (sample.frame - 1) / clip.fps);
          const placed = placedSourceVertices(scene, meshIndex(scene, mesh), worlds, []);
          const positions = sample.positions[mesh] ?? [];
          return pointsError(placed, positions) > positionTolerance(positions);
        });
        if (off) differing.push([name, mesh]);
      }
    }
    expect(differing).toEqual([
      ["RigTravels", "Beside"],
      ["CarrierSlides", "Carried"],
      ["EnvelopeBend", "Stub"],
      ["MultiplyBend", "Multiplied"],
      ["RestBend", "Resting"],
    ]);
    expect(warning("deform-approximated", "Beside")?.detail).toBe(
      "The preview keeps its rest offset from MotionRig in RigTravels, Scene",
    );
    expect(warning("deform-approximated", "Carried")?.detail).toBe(
      "The preview keeps its rest offset from StillRig in CarrierSlides, Scene",
    );
    expect(warning("deform-approximated", "Stub")?.message).toBe("Envelopes not used: Stub");
    expect(warning("deform-approximated", "Multiplied")?.detail).toBe(
      "Bones that multiply vertex group weights by their envelopes: Upper",
    );
    expect(warning("deform-approximated", "RestRig")?.detail).toBe(
      "Blender shows this armature in its rest position; the preview poses it in RestBend, Scene",
    );
    expect(warning("unweighted-vertices", "OutsideEnvelopes")).toBeDefined();
    const quiet = ["Riding", "CarriedAlong", "Column", "Resting", "Quiet", "QuietRig", "MultipliedInside"];
    for (const name of [...quiet, "OutsideEnvelopes", "TogetherBody", "FarBody"]) {
      expect(warning("deform-approximated", name), name).toBeUndefined();
    }
    for (const name of ["MaskedEnvelope", "InvertedMaskEnvelope"]) {
      expect(warning("deform-approximated", name)?.message, name).toBe(`Armature mask not applied: ${name}`);
    }
  });

  it("warns about instancers that Blender draws copies of their children for, and only about those", () => {
    expect(expected.instances).toEqual({
      Scatter: 4,
      Tiler: 2,
      SelfHiddenScatter: 4,
      SmoothScatter: 4,
      CappedScatter: 4,
      PlainNodeScatter: 4,
      PipeScatter: 6,
      SimulatedScatter: 4,
      LooseScatter: 4,
      MutedScatter: 4,
      RealizedScatter: 32,
      ObjectOffsetScatter: 4,
      MutedLinkScatter: 4,
      RealizedNestedScatter: 32,
      ...(version === "4.2" ? {} : { ImportRealizedScatter: 7 }),
    });
    const others = [
      "HiddenEmitter",
      "LinkedNodeScatter",
      "NestedScatter",
      "NodeScatter",
      "PartlyRealizedScatter",
      "ShallowRealizedScatter",
    ];
    const newerOthers = ["BakedScatter", "BundledScatter", "ClosureScatter", "ImportScatter", "PencilScatter"];
    expect(expected.otherInstances).toEqual(version === "4.2" ? others : [...others, ...newerOthers].sort());
    expect(expected.smoothedByAngle).toEqual(["SmoothScatter"]);
    const instancers = scene.source.warnings.filter((entry) => entry.message.includes(" instances not shown: "));
    expect(instancers.map((entry) => [entry.code, entry.subject.name, entry.message])).toEqual([
      ["object-not-shown", "Scatter", "Vertex instances not shown: Scatter"],
      ["object-not-shown", "Tiler", "Face instances not shown: Tiler"],
      ["object-not-shown", "SelfHiddenScatter", "Vertex instances not shown: SelfHiddenScatter"],
      ["object-not-shown", "SmoothScatter", "Vertex instances not shown: SmoothScatter"],
      ["object-not-shown", "CappedScatter", "Vertex instances not shown: CappedScatter"],
      ["object-not-shown", "PlainNodeScatter", "Vertex instances not shown: PlainNodeScatter"],
      ["object-not-shown", "PipeScatter", "Vertex instances not shown: PipeScatter"],
      ["object-not-shown", "SimulatedScatter", "Vertex instances not shown: SimulatedScatter"],
      ["object-not-shown", "LooseScatter", "Vertex instances not shown: LooseScatter"],
      ["object-not-shown", "MutedScatter", "Vertex instances not shown: MutedScatter"],
      ["object-not-shown", "RealizedScatter", "Vertex instances not shown: RealizedScatter"],
      ["object-not-shown", "ObjectOffsetScatter", "Vertex instances not shown: ObjectOffsetScatter"],
      ["object-not-shown", "MutedLinkScatter", "Vertex instances not shown: MutedLinkScatter"],
      ["object-not-shown", "RealizedNestedScatter", "Vertex instances not shown: RealizedNestedScatter"],
      ...(version === "4.2"
        ? []
        : [["object-not-shown", "ImportRealizedScatter", "Vertex instances not shown: ImportRealizedScatter"]]),
    ]);
  });

  it("hides the instancers that Blender hides to draw only their instances or particles", () => {
    expect(expected.instancersDrawn).toEqual([
      "Bare",
      "CappedScatter",
      "EmptyScatter",
      "FacelessTiler",
      "NodeScatter",
      "PlainNodeScatter",
      "Scatter",
      "SmoothScatter",
      "Tiler",
      "ZeroModInstancer",
    ]);
    const parts = scene.parts.filter((part) => INSTANCERS.includes(part.name));
    expect(parts.map((part) => part.name).sort()).toEqual([...INSTANCERS].sort());
    const shown = parts.filter((part) => !part.hiddenByDefault).map((part) => part.name);
    expect(shown.sort()).toEqual(expected.instancersDrawn.filter((name) => INSTANCERS.includes(name)));
  });

  it("reports particle systems, and hides an emitter Blender draws only the particles of", () => {
    expect(expected.emittersDrawn).toEqual(["Hairy"]);
    for (const name of ["Hairy", "HiddenEmitter"]) {
      expect(warning("modifier-not-applied", name)?.detail, name).toBe("Shown without Particles");
      const part = scene.parts.find((candidate) => candidate.name === name);
      expect(part, name).toBeDefined();
      expect(part?.hiddenByDefault ?? false, name).toBe(!expected.emittersDrawn.includes(name));
    }
  });

  it("keeps every LOD level of a part, whichever level Blender shows", () => {
    expect(expected.levelsShown).toEqual(["Pebble_LOD0", "Rock_LOD1", "Stone_LOD2"]);
    const levels = (name: string) => scene.parts.find((part) => part.name === name)?.levels.map((level) => level.level);
    expect(levels("Rock")).toEqual([0, 1]);
    expect(levels("Stone")).toEqual([0, 1, 2]);
    expect(scene.parts.find((part) => part.name === "Stone")?.hiddenByDefault).toBeUndefined();
    expect(scene.source.warnings.filter((entry) => entry.subject.name.includes("_LOD"))).toEqual([]);
  });

  it("names linked data that local collections hold, and not a linked collection the view layer excludes", () => {
    expect(expected.linkedShown).toEqual(["LibraryCrate", "ShelfPart"]);
    expect(warning("library-not-loaded", `relations-${version}.blend`)?.detail).toBe(
      "From other .blend files: collections LibraryShelf; objects LibraryCrate",
    );
  });
});
