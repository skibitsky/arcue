import type { BlendMesh } from "../src/types.js";

/** What Blender draws at each loop of a mesh: its loop triangles and the values of each loop. */
export interface LoopReference {
  /** Each loop triangle as its three loops, in Blender's order. */
  loopTriangles: readonly (readonly number[])[];
  /** The vertex of each loop. */
  loopVertices: readonly number[];
  /** The normal of each loop, in scene axes. */
  normals?: readonly (readonly number[])[];
  /** Two values per loop for each UV map, by name. */
  uvs?: Readonly<Record<string, readonly number[]>>;
  /** Four values per loop of the color attribute the mesh draws. */
  colors?: readonly number[];
}

type DrawnMesh = Pick<BlendMesh, "indices" | "sourceVertex" | "normals" | "uvs" | "colors">;

const CORNER_TOLERANCE = { normal: 1e-3, uv: 1e-5, color: 2e-3 };

/** How the rendered vertex `rendered` differs from the loop `loop`, or null when it draws what Blender draws there. */
function cornerDifference(mesh: DrawnMesh, reference: LoopReference, rendered: number, loop: number): string | null {
  const differs = (got: ArrayLike<number>, expected: readonly number[] | undefined, tolerance: number) =>
    expected === undefined ||
    got.length !== expected.length ||
    Array.from(got).some((value, k) => !(Math.abs(value - (expected[k] ?? Number.NaN)) <= tolerance));
  const normal = reference.normals?.[loop];
  if (normal && differs(mesh.normals.subarray(rendered * 3, rendered * 3 + 3), normal, CORNER_TOLERANCE.normal)) {
    return `normal ${Array.from(mesh.normals.subarray(rendered * 3, rendered * 3 + 3))}, Blender ${normal}`;
  }
  for (const [name, values] of Object.entries(reference.uvs ?? {})) {
    const uv = mesh.uvs.find((set) => set.name === name)?.values.subarray(rendered * 2, rendered * 2 + 2) ?? [];
    if (differs(uv, values.slice(loop * 2, loop * 2 + 2), CORNER_TOLERANCE.uv)) {
      return `UV map ${name} ${Array.from(uv)}, Blender ${values.slice(loop * 2, loop * 2 + 2)}`;
    }
  }
  if (reference.colors) {
    const color = mesh.colors?.subarray(rendered * 4, rendered * 4 + 4) ?? [];
    const expected = reference.colors.slice(loop * 4, loop * 4 + 4);
    if (differs(color, expected, CORNER_TOLERANCE.color)) return `color ${Array.from(color)}, Blender ${expected}`;
  }
  return null;
}

/**
 * Compares what each triangle corner draws with the loop Blender draws there. Each triangle is matched with Blender's
 * loop triangles of the same source vertices in the same order, and its rendered vertices' normals, UVs and colors
 * with those of the matching loops. Returns a description of each triangle that no loop triangle matches.
 */
export function cornerMismatches(mesh: DrawnMesh, reference: LoopReference): string[] {
  const byVertices = new Map<string, (readonly number[])[]>();
  for (const loops of reference.loopTriangles) {
    const key = loops.map((loop) => reference.loopVertices[loop] ?? -1).join(" ");
    byVertices.set(key, [...(byVertices.get(key) ?? []), loops]);
  }
  const mismatches: string[] = [];
  const triangleCount = mesh.indices.length / 3;
  if (triangleCount !== reference.loopTriangles.length) {
    mismatches.push(`${triangleCount} triangles, Blender ${reference.loopTriangles.length}`);
  }
  for (let triangle = 0; triangle < triangleCount; triangle++) {
    const rendered = Array.from(mesh.indices.subarray(triangle * 3, triangle * 3 + 3));
    const key = rendered.map((index) => mesh.sourceVertex[index] ?? -1).join(" ");
    const candidates = byVertices.get(key) ?? [];
    const differences = candidates.map((loops) =>
      rendered.flatMap((index, k) => cornerDifference(mesh, reference, index, loops[k] ?? -1) ?? []),
    );
    if (differences.some((found) => found.length === 0)) continue;
    const reason = differences[0]?.join("; ") ?? "Blender has no triangle of these vertices";
    mismatches.push(`triangle ${triangle} of vertices ${key}: ${reason}`);
  }
  return mismatches;
}

/** A mesh's faces as Blender stores them: the loops of face f run from `faceOffsets[f]` up to `faceOffsets[f + 1]`. */
export interface Faces {
  faceOffsets: ArrayLike<number>;
  /** The vertex of each loop. */
  cornerVerts: ArrayLike<number>;
}
