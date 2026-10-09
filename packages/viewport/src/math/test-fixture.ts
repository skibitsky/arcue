import type { SceneDescription } from "@arcue/scene";
import { SCENE_SPACE, topologyFingerprint } from "@arcue/scene";

const HALF_TURN_Z = Math.SQRT1_2;

/**
 * A vertical strip two bones tall, for tests. The mesh node sits at y = 0.5 with a 0.01 scale, so its local positions
 * are centimeters and its bind matrix is not the identity. Rows of source vertices sit at y = 0, 1 and 2 in scene space,
 * x = ±0.1. Row 0 follows Root, row 1 is split evenly, row 2 follows Tip. Rendered vertex 6 duplicates source vertex 2,
 * as a UV seam would. "Armature|Bend" turns Tip a quarter turn around +Z over one second, and "Bulge" pushes row 2
 * out by 0.1 m along +X.
 */
export function stripScene(): SceneDescription {
  const sourceLocal = [
    [-10, -50, 0],
    [10, -50, 0],
    [-10, 50, 0],
    [10, 50, 0],
    [-10, 150, 0],
    [10, 150, 0],
  ];
  const sourceVertex = Uint32Array.of(0, 1, 2, 3, 4, 5, 2);
  const positions = Float32Array.from([...sourceVertex].flatMap((source) => sourceLocal[source] ?? [0, 0, 0]));
  const rowJoints = [
    [0, 0, 0, 0],
    [0, 1, 0, 0],
    [1, 0, 0, 0],
  ];
  const rowWeights = [
    [1, 0, 0, 0],
    [0.5, 0.5, 0, 0],
    [1, 0, 0, 0],
  ];
  const row = (source: number) => Math.floor(source / 2);
  const indices = Uint32Array.of(0, 1, 3, 0, 3, 2, 2, 3, 5, 6, 5, 4);
  const bulge = new Float32Array(positions.length);
  sourceVertex.forEach((source, rendered) => {
    if (row(source) === 2) bulge[rendered * 3] = 10;
  });
  return {
    source: {
      format: "fbx",
      exporter: null,
      fps: 30,
      originalSpace: SCENE_SPACE,
      conversion: { scale: 1, rotation: [0, 0, 0, 1] },
      warnings: [],
    },
    nodes: [
      node("Armature", "Armature", -1, "empty", [0, 0, 0], null),
      node("Root", "Armature/Root", 0, "bone", [0, 0, 0], null),
      node("Tip", "Armature/Root/Tip", 1, "bone", [0, 1, 0], null),
      node("TipEnd", "Armature/Root/Tip/TipEnd", 2, "bone", [0, 1, 0], null),
      { ...node("Strip", "Strip", -1, "mesh", [0, 0.5, 0], 0), scale: [0.01, 0.01, 0.01] },
    ],
    meshes: [
      {
        name: "Strip",
        geometryName: "StripMesh",
        positions,
        normals: Float32Array.from([...sourceVertex].flatMap(() => [0, 0, 1])),
        uvs: [],
        colors: null,
        skeleton: 0,
        bindMatrix: Float32Array.of(0.01, 0, 0, 0, 0, 0.01, 0, 0, 0, 0, 0.01, 0, 0, 0.5, 0, 1),
        joints: Uint16Array.from([...sourceVertex].flatMap((source) => rowJoints[row(source)] ?? [0, 0, 0, 0])),
        weights: Float32Array.from([...sourceVertex].flatMap((source) => rowWeights[row(source)] ?? [1, 0, 0, 0])),
        indices,
        groups: [{ start: 0, triangleCount: 4, material: 0 }],
        morphTargets: [{ name: "Bulge", defaultWeight: 0, positions: bulge, normals: null }],
        sourceVertex,
        sourceVertexCount: 6,
        restPositions: Float32Array.from(sourceLocal.flatMap(([x = 0, y = 0, z = 0]) => [x * 0.01, y * 0.01 + 0.5, z])),
        skinWeights: {
          offsets: Uint32Array.of(0, 1, 2, 4, 6, 7, 8),
          joints: Uint16Array.of(0, 0, 0, 1, 0, 1, 1, 1),
          weights: Float32Array.of(1, 1, 0.5, 0.5, 0.5, 0.5, 1, 1),
        },
        topology: topologyFingerprint({ indices, sourceVertex, sourceVertexCount: 6 }),
      },
    ],
    skeletons: [
      {
        joints: [1, 2],
        inverseBindMatrices: Float32Array.of(
          1,
          0,
          0,
          0,
          0,
          1,
          0,
          0,
          0,
          0,
          1,
          0,
          0,
          0,
          0,
          1,
          1,
          0,
          0,
          0,
          0,
          1,
          0,
          0,
          0,
          0,
          1,
          0,
          0,
          -1,
          0,
          1,
        ),
      },
    ],
    materials: [],
    textures: [],
    clips: [
      {
        name: "Armature|Bend",
        displayName: "Bend",
        fps: 30,
        duration: 1,
        frameCount: 31,
        tracks: [
          {
            node: 2,
            property: "rotation",
            interpolation: "linear",
            times: Float32Array.of(0, 1),
            values: Float32Array.of(0, 0, 0, 1, 0, 0, HALF_TURN_Z, HALF_TURN_Z),
          },
          {
            node: 4,
            property: "weights",
            interpolation: "linear",
            times: Float32Array.of(0, 1),
            values: Float32Array.of(0, 1),
          },
        ],
        keyTimes: Float32Array.of(0, 1),
        keyedEveryFrame: false,
      },
    ],
    parts: [{ id: "Strip", name: "Strip", role: "model", node: 4, levels: [{ level: 0, meshes: [0] }] }],
    bounds: { min: [-0.1, 0, 0], max: [0.1, 2, 0] },
  };
}

function node(
  name: string,
  path: string,
  parent: number,
  kind: "bone" | "empty" | "mesh",
  translation: [number, number, number],
  mesh: number | null,
): SceneDescription["nodes"][number] {
  return { name, path, parent, kind, translation, rotation: [0, 0, 0, 1], scale: [1, 1, 1], mesh };
}
