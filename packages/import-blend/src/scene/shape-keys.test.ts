import { describe, expect, it } from "vitest";
import { identity } from "../math";
import { buildMesh } from "./mesh-build";
import type { MeshData, ShapeKey } from "./mesh-data";
import { pinnedShape, shapedVertex, shapeTargets, shapeWeights } from "./shape-keys";

const QUAD = [0, 0, 0, 1, 0, 0, 1, 1, 0.3, 0, 1, 0.5];

interface KeyOptions {
  relative?: number;
  value?: number;
  muted?: boolean;
  vertexGroup?: string;
  min?: number;
  max?: number;
}

/** A key that moves each vertex of the quad by `move(vertex)` from the quad's own shape. */
function key(name: string, move: (vertex: number) => number[], options: KeyOptions = {}): ShapeKey {
  return {
    name,
    positions: Float32Array.from(QUAD, (value, index) => value + (move(Math.floor(index / 3))[index % 3] ?? 0)),
    relative: options.relative ?? 0,
    value: options.value ?? 0,
    min: options.min ?? 0,
    max: options.max ?? 1,
    muted: options.muted ?? false,
    vertexGroup: options.vertexGroup ?? "",
  };
}

/** A quad with the shape keys, whose first is the reference key, and vertex group G weighing vertex v by v / 4. */
function quad(keys: ShapeKey[]): MeshData {
  return {
    name: "Quad",
    vertexCount: 4,
    edgeCount: 4,
    faceCount: 1,
    cornerCount: 4,
    positions: Float32Array.from(QUAD),
    edges: Int32Array.of(0, 1, 1, 2, 2, 3, 3, 0),
    faceOffsets: Int32Array.of(0, 4),
    cornerVerts: Int32Array.of(0, 1, 2, 3),
    cornerEdges: Int32Array.of(0, 1, 2, 3),
    materialIndices: null,
    sharpFaces: null,
    sharpEdges: null,
    autoSmoothAngle: null,
    uvMaps: [],
    defaultUv: 0,
    colors: null,
    attributeNames: [],
    customNormals: null,
    deformWeights: {
      offsets: Uint32Array.of(0, 0, 1, 2, 3),
      groups: Int32Array.of(0, 0, 0),
      weights: Float32Array.of(0.25, 0.5, 0.75),
    },
    vertexGroupNames: ["G"],
    shapeKeys: keys,
    referenceKey: 0,
    absoluteKeys: false,
    shapeKeysLeftOut: false,
  };
}

const basis = () => key("Basis", () => [0, 0, 0], { value: 1 });
const dome = (options: KeyOptions = {}) => key("Dome", () => [0, 0, 1], { value: 0.3, ...options });
const tilt = (options: KeyOptions = {}) =>
  key("Tilt", (vertex) => [0, 0, 1 + (vertex % 2) * 0.8], { value: 0.6, relative: 1, ...options });

describe("shapedVertex", () => {
  it("places each vertex where the mesh build's morph targets put it, at any weights", () => {
    const mesh = quad([
      basis(),
      dome({ min: -1, max: 2, value: 1.5 }),
      tilt({ vertexGroup: "G" }),
      key("Muted", () => [5, 0, 0], { muted: true, value: 1 }),
      key("Lost", () => [0, 3, 0], { relative: 9, value: 0.5 }),
      key("Unknown group", () => [0, 0, -2], { vertexGroup: "Missing", value: 0.1 }),
    ]);
    const built = buildMesh(mesh, {
      conversion: identity(),
      slotCount: 1,
      skinBones: null,
      meshNode: 0,
      smoothing: null,
      blenderVersion: 402,
    });
    const targets = shapeTargets(mesh);
    expect(targets.map(({ name, defaultWeight, range }) => [name, defaultWeight, range])).toEqual(
      built.morphTargets.map((target, index) => [target.name, target.defaultWeight, built.morphRanges[index]]),
    );
    const weights = new Map([
      ["Dome", 0.4],
      ["Tilt", -0.7],
      ["Muted", 1],
      ["Lost", 0.9],
      ["Unknown group", 2],
    ]);
    for (let rendered = 0; rendered < built.sourceVertex.length; rendered++) {
      const expected = [0, 1, 2].map(
        (k) =>
          (built.positions[rendered * 3 + k] ?? 0) +
          built.morphTargets.reduce(
            (sum, target) => sum + (weights.get(target.name) ?? 0) * (target.positions[rendered * 3 + k] ?? 0),
            0,
          ),
      );
      const shaped = shapedVertex(mesh, built.sourceVertex[rendered] ?? 0, weights);
      for (const [k, value] of expected.entries()) expect(shaped[k]).toBeCloseTo(value, 5);
    }
  });
});

describe("shapeWeights", () => {
  const targets = shapeTargets(quad([basis(), dome({ min: -1, max: 2 }), tilt()]));

  it("takes each key's value at the opening frame, kept to its range, or else its own value", () => {
    const weights = shapeWeights(targets, new Map([["Dome", 3]]), null);
    expect([...weights]).toEqual([
      ["Dome", 2],
      ["Tilt", 0.6],
    ]);
  });

  it("gives the keys of a pinned shape full weight and the others none, whatever their values", () => {
    const pinned = { name: "Dome", keys: new Set(["Dome"]), rough: null };
    expect([...shapeWeights(targets, new Map([["Tilt", 1]]), pinned)]).toEqual([
      ["Dome", 1],
      ["Tilt", 0],
    ]);
  });
});

describe("pinnedShape", () => {
  const shape = (keys: ShapeKey[], locked: number | null) => {
    const pinned = pinnedShape(quad(keys), locked);
    return pinned && { name: pinned.name, keys: [...pinned.keys], rough: pinned.rough };
  };

  it("is none without the lock", () => {
    expect(shape([basis(), dome()], null)).toBeNull();
    expect(shape([], 0)).toBeNull();
  });

  it("pins a key relative to the basis by itself", () => {
    expect(shape([basis(), dome(), tilt()], 1)).toEqual({ name: "Dome", keys: ["Dome"], rough: null });
    expect(shape([basis(), dome(), tilt({ relative: 0, vertexGroup: "G" })], 2)).toEqual({
      name: "Tilt",
      keys: ["Tilt"],
      rough: null,
    });
  });

  it("pins a key relative to another with every key it builds on, so that their offsets add up to its shape", () => {
    expect(shape([basis(), dome(), tilt()], 2)).toEqual({ name: "Tilt", keys: ["Tilt", "Dome"], rough: null });
  });

  it("shows the basis for a pinned basis or a muted pinned key, and the first key for a missing one", () => {
    const basisShape = { name: null, keys: [], rough: null };
    expect(shape([basis(), dome()], 0)).toEqual(basisShape);
    expect(shape([basis(), dome({ muted: true })], 1)).toEqual(basisShape);
    expect(shape([basis(), dome()], 7)).toEqual(basisShape);
    expect(shape([basis(), dome()], -1)).toEqual(basisShape);
  });

  it("says why the morph targets only approach a pinned key they cannot add up to", () => {
    expect(shape([basis(), dome({ muted: true }), tilt()], 2)?.rough).toBe("a key it builds on is muted");
    expect(shape([basis(), dome({ relative: 2 }), tilt()], 2)?.rough).toBe(
      "the keys it builds on never reach the basis",
    );
    expect(shape([basis(), dome(), tilt({ relative: 2 })], 2)?.rough).toBe(
      "the keys it builds on never reach the basis",
    );
    expect(shape([basis(), dome({ vertexGroup: "G" }), tilt()], 2)?.rough).toBe(
      "vertex groups limit the keys it builds on",
    );
    expect(shape([basis(), dome(), tilt({ vertexGroup: "Missing" })], 2)?.rough).toBeNull();
  });
});
