import { type SceneDescription, topologyFingerprint } from "@arcue/scene";
import { describe, expect, it } from "vitest";
import { importFixture, type Reference, reference, VERSIONS } from "../../test/fixtures";
import {
  type Matrix,
  placedRenderedVertices,
  placedSourceVertices,
  pointsError,
  strongestInfluences,
  worldMatrices,
} from "../../test/geometry";
import { identity } from "../math";
import { buildMesh } from "./mesh-build";
import type { MeshData } from "./mesh-data";

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

/** Checks the joints and weights each skinned mesh renders with against the four strongest of its full weights. */
function expectStrongestInfluences(scene: SceneDescription): number {
  let checked = 0;
  for (const mesh of scene.meshes) {
    if (!mesh.skinWeights) continue;
    const skeleton = scene.skeletons[mesh.skeleton ?? -1];
    const expected = strongestInfluences(mesh, skeleton?.joints.length ?? 0);
    expect(Array.from(mesh.joints ?? []), mesh.name).toEqual(Array.from(expected.joints));
    const weights = Array.from(mesh.weights ?? []);
    expect(weights).toHaveLength(expected.weights.length);
    expected.weights.forEach((weight, k) => {
      expect(Math.abs((weights[k] ?? Number.NaN) - weight), `${mesh.name} weight ${k}`).toBeLessThan(1e-6);
    });
    checked++;
  }
  return checked;
}

describe.each(VERSIONS)("rendered skinning in files from Blender %s", (version) => {
  it.each(["skin", "rig", "relations", "scenes", "stacks"])(
    "takes the four strongest bones of each source vertex in the %s fixture",
    async (name) => {
      expect(expectStrongestInfluences(await importFixture(name, version))).toBeGreaterThan(0);
    },
  );
});

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
    const mesh = scene.meshes[tube];
    const rendered = placedRenderedVertices(scene, tube, worlds);
    const posed = expected.posed.Tube ?? [];
    let fourOrFewer = 0;
    for (let r = 0; r < (mesh?.sourceVertex.length ?? 0); r++) {
      const source = mesh?.sourceVertex[r] ?? 0;
      const offsets = mesh?.skinWeights?.offsets;
      if ((offsets?.[source + 1] ?? 0) - (offsets?.[source] ?? 0) > 4) continue;
      fourOrFewer++;
      const placed = Array.from(rendered.subarray(r * 3, r * 3 + 3));
      expect(pointsError(placed, posed.slice(source * 3, source * 3 + 3)), `Tube vertex ${source}`).toBeLessThan(1e-4);
    }
    expect(fourOrFewer).toBeGreaterThan(0);
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

/** Four quads in a grid around vertex 4 at `center`, in material slots 1, 0, 1 and 0. */
function grid(center: [number, number]): MeshData {
  const faces = [
    [0, 1, 4, 3],
    [1, 2, 5, 4],
    [3, 4, 7, 6],
    [4, 5, 8, 7],
  ];
  const positions = Array.from({ length: 9 }, (_, vertex) =>
    vertex === 4 ? [...center, 0] : [(vertex % 3) - 1, Math.floor(vertex / 3) - 1, 0],
  );
  const edges = [...new Set(faces.flatMap((face) => face.map((v, k) => [v, face[(k + 1) % 4] ?? 0].sort().join(" "))))];
  const edgeOf = (a: number, b: number) => edges.indexOf([a, b].sort().join(" "));
  return {
    name: "Grid",
    vertexCount: 9,
    edgeCount: edges.length,
    faceCount: faces.length,
    cornerCount: 16,
    positions: Float32Array.from(positions.flat()),
    edges: Int32Array.from(edges.flatMap((edge) => edge.split(" ").map(Number))),
    faceOffsets: Int32Array.of(0, 4, 8, 12, 16),
    cornerVerts: Int32Array.from(faces.flat()),
    cornerEdges: Int32Array.from(faces.flatMap((face) => face.map((v, k) => edgeOf(v, face[(k + 1) % 4] ?? 0)))),
    materialIndices: Int32Array.of(1, 0, 1, 0),
    sharpFaces: null,
    sharpEdges: null,
    autoSmoothAngle: null,
    uvMaps: [],
    defaultUv: 0,
    colors: null,
    attributeNames: [],
    customNormals: null,
    deformWeights: null,
    vertexGroupNames: [],
    shapeKeys: [],
    referenceKey: -1,
    absoluteKeys: false,
    materials: [null, null],
  };
}

describe("the topology fingerprint", () => {
  const options = {
    conversion: identity(),
    slotCount: 2,
    skinBones: null,
    meshNode: 0,
    smoothing: null,
    blenderVersion: 402,
  };
  const triangles = (mesh: ReturnType<typeof buildMesh>) =>
    Array.from({ length: mesh.indices.length / 3 }, (_, triangle) =>
      [0, 1, 2].map((k) => mesh.sourceVertex[mesh.indices[triangle * 3 + k] ?? 0] ?? -1),
    );

  it("stays when a moved vertex makes Blender split a quad along its other diagonal", () => {
    const flat = buildMesh(grid([0, 0]), options);
    const concave = buildMesh(grid([0.8, -0.8]), options);
    expect(triangles(concave)).not.toEqual(triangles(flat));
    expect(concave.topology).toEqual(flat.topology);
  });

  it("fans each face from its first corner in the order the mesh draws its triangles, by slot", () => {
    const mesh = buildMesh(grid([0.8, -0.8]), options);
    const fans = [
      [1, 2, 5, 1, 5, 4],
      [4, 5, 8, 4, 8, 7],
      [0, 1, 4, 0, 4, 3],
      [3, 4, 7, 3, 7, 6],
    ];
    const expected = topologyFingerprint({
      indices: Uint32Array.from(fans.flat()),
      sourceVertex: Uint32Array.from({ length: 9 }, (_, vertex) => vertex),
      sourceVertexCount: 9,
    });
    expect(mesh.topology).toEqual(expected);
    triangles(mesh).forEach((corners, triangle) => {
      const face = fans[Math.floor(triangle / 2)] ?? [];
      expect(
        corners.every((vertex) => face.includes(vertex)),
        `triangle ${triangle}`,
      ).toBe(true);
    });
  });
});

/** `count` flat triangles around vertex 0, each with its own corners, and NaN UVs where `unreadable` is set. */
function fan(count: number, unreadable: boolean): MeshData {
  const rim = Array.from({ length: count }, (_, k) => [
    Math.cos((2 * Math.PI * k) / count),
    Math.sin((2 * Math.PI * k) / count),
    k % 2,
  ]);
  const cornerVerts = Int32Array.from({ length: count * 3 }, (_, corner) => {
    const [triangle, k] = [Math.floor(corner / 3), corner % 3];
    return k === 0 ? 0 : 1 + ((triangle + k - 1) % count);
  });
  return {
    ...grid([0, 0]),
    name: "Fan",
    vertexCount: count + 1,
    edgeCount: 0,
    faceCount: count,
    cornerCount: count * 3,
    positions: Float32Array.from([0, 0, 0, ...rim.flat()]),
    edges: new Int32Array(0),
    faceOffsets: Int32Array.from({ length: count + 1 }, (_, face) => face * 3),
    cornerVerts,
    cornerEdges: new Int32Array(count * 3).fill(-1),
    materialIndices: null,
    sharpFaces: new Uint8Array(count).fill(1),
    uvMaps: [{ name: "UVMap", values: new Float32Array(count * 6).fill(unreadable ? Number.NaN : 0) }],
  };
}

describe("rendered vertices", () => {
  it("are found in time that grows with the corners, also around a vertex of many flat faces or NaN UVs", () => {
    const count = 200_000;
    for (const unreadable of [false, true]) {
      const data = fan(count, unreadable);
      const start = performance.now();
      const mesh = buildMesh(data, {
        conversion: identity(),
        slotCount: 1,
        skinBones: null,
        meshNode: 0,
        smoothing: null,
        blenderVersion: 402,
      });
      expect(performance.now() - start).toBeLessThan(3000);
      expect(mesh.sourceVertex.filter((vertex) => vertex === 0).length).toBeGreaterThan(count / 2);
    }
  });
});
