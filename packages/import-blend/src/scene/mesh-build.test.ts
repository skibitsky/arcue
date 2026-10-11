import type { SceneDescription } from "@arcue/scene";
import { describe, expect, it } from "vitest";
import { importFixture, type Reference, reference, VERSIONS } from "../../test/fixtures";
import { type Matrix, placedSourceVertices, pointsError, worldMatrices } from "../../test/geometry";

interface SkinReference extends Reference {
  /** World matrix of each posed bone, in scene axes. */
  bones: Record<string, number[]>;
  /** The vertices of each mesh as Blender's armature deform places them, in scene space. */
  posed: Record<string, number[]>;
}

function meshIndex(scene: SceneDescription, name: string): number {
  const index = scene.meshes.findIndex((mesh) => mesh.name === name);
  if (index < 0) throw new RangeError(`No mesh ${name}.`);
  return index;
}

/** World matrices of the nodes, with each bone's taken from Blender so that only the skinning is compared. */
function blenderPose(scene: SceneDescription, bones: Record<string, number[]>): Matrix[] {
  return worldMatrices(scene).map((world, index) => {
    const bone = bones[scene.nodes[index]?.name ?? ""];
    return bone ? Float64Array.from(bone) : world;
  });
}

describe.each(VERSIONS)("skin weights in a file from Blender %s", async (version) => {
  const scene = await importFixture("skin", version);
  const expected = reference("skin", version) as SkinReference;
  const worlds = blenderPose(scene, expected.bones);

  it("leaves a vertex in place whose weights add up to almost nothing, as Blender's armature deform does", () => {
    const sheet = meshIndex(scene, "Sheet");
    expect(pointsError(placedSourceVertices(scene, sheet, worlds, []), expected.posed.Sheet ?? [])).toBeLessThan(1e-4);
  });

  it("keeps every bone of a vertex in the source weights and warns that rendering takes the four strongest", () => {
    const tube = meshIndex(scene, "Tube");
    expect(pointsError(placedSourceVertices(scene, tube, worlds, []), expected.posed.Tube ?? [])).toBeLessThan(1e-4);
    expect(
      scene.source.warnings.map((warning) => [warning.code, warning.subject.name, warning.message, warning.detail]),
    ).toEqual([
      [
        "deform-approximated",
        "Tube",
        "Skin weights limited to four bones: Tube",
        "16 vertices keep their four strongest bones and lose up to 8% of their weight",
      ],
      ["unweighted-vertices", "Sheet", "Unweighted vertices: Sheet", "Some vertices have no skin weights"],
      [
        "deform-approximated",
        "Clasp",
        "Skin weights limited to four bones: Clasp",
        "1 vertex keeps its four strongest bones and loses up to 5% of its weight",
      ],
    ]);
  });
});

/**
 * Checks every triangle corner of a strip of quads against Blender's normal for its face corner, in the basis and with
 * each shape key alone at full weight.
 */
function expectKeyedShading(scene: SceneDescription, expected: Reference, name: string): void {
  const mesh = scene.meshes[meshIndex(scene, name)];
  const corners = expected.meshes[name]?.corners ?? [];
  const keyed = expected.shapeKeys?.[name]?.normals ?? {};
  if (!mesh || mesh.morphTargets.length === 0) throw new Error(`no ${name} shape keys`);
  expect(mesh.morphTargets.map((target) => target.name)).toEqual(Object.keys(keyed));
  const quads = Array.from({ length: corners.length / 4 }, (_, face) =>
    corners.slice(face * 4, face * 4 + 4).map(([vertex]) => vertex),
  );
  expect(mesh.indices.length).toBe(quads.length * 6);
  for (const [slot, rendered] of mesh.indices.entries()) {
    const triangle = Array.from(mesh.indices.subarray(slot - (slot % 3), slot - (slot % 3) + 3));
    const face = quads.findIndex((quad) => triangle.every((r) => quad.includes(mesh.sourceVertex[r] ?? -1)));
    const corner = face * 4 + (quads[face]?.indexOf(mesh.sourceVertex[rendered] ?? -1) ?? 0);
    const basis = Array.from(mesh.normals.subarray(rendered * 3, rendered * 3 + 3));
    expect(face, `${name} triangle ${Math.floor(slot / 3)}`).toBeGreaterThanOrEqual(0);
    expect(pointsError(basis, corners[corner]?.slice(1) ?? []), `${name} corner ${corner}`).toBeLessThan(1e-3);
    for (const target of mesh.morphTargets) {
      const turned = basis.map((value, k) => value + (target.normals?.[rendered * 3 + k] ?? Number.NaN));
      const length = Math.hypot(...turned);
      expect(
        pointsError(
          turned.map((value) => value / length),
          keyed[target.name]?.[corner]?.slice(1) ?? [],
        ),
        `${name} corner ${corner} with ${target.name}`,
      ).toBeLessThan(1e-3);
    }
  }
}

describe.each(VERSIONS)("shape keys in a file from Blender %s", async (version) => {
  const features = await importFixture("features", version);
  const shapes = await importFixture("shapes", version);
  const expectedShapes = reference("shapes", version);

  it("shades each triangle corner as Blender shades its face corner, in the basis and with the key at full weight", () => {
    for (const name of ["FoldKey", "CreaseKey"]) expectKeyedShading(features, reference("features", version), name);
  });

  it("keeps each earlier key's shading on the vertices a later key splits", () => {
    expectKeyedShading(shapes, expectedShapes, "TwoFolds");
  });

  it("shows a mesh with absolute shape keys in its reference key's shape, as Blender does at evaluation time 0", () => {
    const mesh = shapes.meshes[meshIndex(shapes, "AbsoluteDrift")];
    const expected = expectedShapes.meshes.AbsoluteDrift;
    if (!mesh || !expected) throw new Error("no AbsoluteDrift");
    expect(mesh.morphTargets).toEqual([]);
    expect(pointsError(mesh.restPositions, expected.restPositions)).toBeLessThan(1e-5);
    for (let r = 0; r < mesh.sourceVertex.length; r++) {
      const normal = Array.from(mesh.normals.subarray(r * 3, r * 3 + 3));
      const known = expected.corners.some(
        ([vertex, ...corner]) => vertex === mesh.sourceVertex[r] && pointsError(corner, normal) < 1e-3,
      );
      expect(known, `AbsoluteDrift vertex ${mesh.sourceVertex[r]}`).toBe(true);
    }
    expect(
      shapes.source.warnings.map((warning) => [warning.code, warning.subject.name, warning.message, warning.detail]),
    ).toEqual([
      [
        "deform-approximated",
        "AbsoluteDrift",
        "Absolute shape keys not shown: AbsoluteDrift",
        "Shown in its basis shape",
      ],
    ]);
  });
});
