import type { Clip, SceneDescription } from "@arcue/scene";
import { describe, expect, it } from "vitest";
import type { Reference } from "../../test/fixtures";
import { fixtureFaces, importFixture, readFixture, reference, VERSIONS } from "../../test/fixtures";
import { cornerMismatches, placedSourceVertices, pointsError, worldMatrices } from "../../test/geometry";
import { decompressBlend } from "../blend/decompress";
import { readBlendFile } from "../blend/file";
import { datablocks, idName } from "../blend/ids";
import { modifierType } from "./modifiers";

interface StacksReference extends Reference {
  /** Each object's modifier types in stack order. */
  stacks: Record<string, string[]>;
  /** Blender's evaluated position of each source vertex at a frame of the Bend action, in scene space. */
  posed: { frame: number; meshes: Record<string, number[]> };
}

/** Blender's `eModifierType` values of the modifiers the fixture stacks. */
const MODIFIER_TYPES: Readonly<Record<number, string>> = { 1: "SUBSURF", 5: "MIRROR", 8: "ARMATURE", 57: "NODES" };
const TOLERANCE = 1e-4;

function meshIndex(scene: SceneDescription, name: string): number {
  const index = scene.meshes.findIndex((mesh) => mesh.name === name);
  if (index < 0) throw new RangeError(`No mesh ${name}.`);
  return index;
}

function clip(scene: SceneDescription, name: string): Clip {
  const found = scene.clips.find((candidate) => candidate.name === name);
  if (!found) throw new RangeError(`No clip ${name}.`);
  return found;
}

describe.each(VERSIONS)("modifier stacks from Blender %s", async (version) => {
  const scene = await importFixture("stacks", version);
  const expected = reference("stacks", version) as StacksReference;

  it("reads every modifier of an object, past the first", async () => {
    const file = readBlendFile(await decompressBlend(readFixture("stacks", version)));
    const stacks = Object.fromEntries(
      datablocks(file, "OB")
        .filter((object) => idName(object) in expected.stacks)
        .map((object) => [
          idName(object),
          object.list("modifiers").map((modifier) => MODIFIER_TYPES[modifierType(modifier)]),
        ]),
    );
    expect(stacks).toEqual(expected.stacks);
  });

  it("skins a mesh whose Armature modifier follows a Mirror or a disabled one, as Blender deforms it", () => {
    const bend = clip(scene, "Bend");
    const worlds = worldMatrices(scene, bend, (expected.posed.frame - 1) / bend.fps);
    const posed = Object.entries(expected.posed.meshes);
    expect(posed.map(([name]) => name)).toEqual(["MirrorFirst", "SmoothAfter", "SecondEnabled", "TwoSkins"]);
    for (const [name, positions] of posed) {
      const index = meshIndex(scene, name);
      expect(scene.meshes[index]?.skeleton, name).not.toBeNull();
      expect(pointsError(placedSourceVertices(scene, index, worlds, []), positions), name).toBeLessThan(TOLERANCE);
    }
  });

  it("draws Blender's loop triangles, each corner shaded as Blender shades its face corner, with Smooth by Angle after an Armature modifier", async () => {
    const faces = await fixtureFaces("stacks", version);
    for (const [name, mesh] of Object.entries(expected.meshes)) {
      const built = scene.meshes[meshIndex(scene, name)];
      const meshFaces = faces.get(name);
      if (!built || !meshFaces) throw new Error(name);
      const loopVertices = mesh.corners.map(([vertex]) => vertex);
      expect(Array.from(meshFaces.cornerVerts), name).toEqual(loopVertices);
      const drawn = {
        loopTriangles: mesh.triangleLoops,
        loopVertices,
        normals: mesh.corners.map((corner) => corner.slice(1)),
        uvs: mesh.uvs,
      };
      expect(cornerMismatches(built, drawn), name).toEqual([]);
      expect(new Set(drawn.loopTriangles.flat()).size, name).toBe(loopVertices.length);
    }
  });

  it("warns about modifiers after the first that it leaves out, a second skin and a mask behind a Mirror", () => {
    expect(scene.source.warnings.map((warning) => [warning.code, warning.subject.name, warning.detail])).toEqual([
      ["modifier-not-applied", "MirrorFirst", "Shown without Mirror"],
      ["modifier-not-applied", "SubdivisionAfter", "Shown without Subdivision"],
      ["extra-skins", "TwoSkins", "Only the first Armature modifier deforms it"],
      ["modifier-not-applied", "MaskedAfterMirror", "Shown without Mirror"],
      [
        "deform-approximated",
        "MaskedAfterMirror",
        "Vertex group Lower limits the Armature modifier; the preview deforms vertices fully",
      ],
    ]);
  });
});
