import type { MeshData } from "./mesh-data.js";

type Vec = [number, number, number];
type Point = [number, number];

const CONCAVE = -1;
const TANGENTIAL = 0;
const CONVEX = 1;
const FLT_EPSILON = 1.1920928955078125e-7;
const UNSET = -1;
const f = Math.fround;

function point(positions: Float32Array, vertex: number): Vec {
  return [positions[vertex * 3] ?? 0, positions[vertex * 3 + 1] ?? 0, positions[vertex * 3 + 2] ?? 0];
}

function sub(a: Vec, b: Vec): Vec {
  return [f(a[0] - b[0]), f(a[1] - b[1]), f(a[2] - b[2])];
}

function cross(a: Vec, b: Vec): Vec {
  return [f(f(a[1] * b[2]) - f(a[2] * b[1])), f(f(a[2] * b[0]) - f(a[0] * b[2])), f(f(a[0] * b[1]) - f(a[1] * b[0]))];
}

function dot(a: Vec, b: Vec): number {
  return f(f(f(a[0] * b[0]) + f(a[1] * b[1])) + f(a[2] * b[2]));
}

/** Blender's `is_quad_flip_v3_first_third_fast`: whether splitting along 0–2 would fold the quad. */
function quadFlips(a: Vec, b: Vec, c: Vec, d: Vec): boolean {
  const ac = sub(c, a);
  return dot(cross(sub(b, a), ac), cross(sub(d, a), ac)) > 0;
}

/** The face normal Blender's tessellation projects a polygon along: Newell's method, `(0, 0, 1)` when it has no area. */
function newellNormal(points: readonly Vec[]): Vec {
  let [x, y, z] = [0, 0, 0];
  let previous = points[points.length - 1] ?? [0, 0, 0];
  for (const current of points) {
    x = f(x + f(f(previous[1] - current[1]) * f(previous[2] + current[2])));
    y = f(y + f(f(previous[2] - current[2]) * f(previous[0] + current[0])));
    z = f(z + f(f(previous[0] - current[0]) * f(previous[1] + current[1])));
    previous = current;
  }
  const lengthSquared = dot([x, y, z], [x, y, z]);
  if (!(lengthSquared > f(1e-35))) return [0, 0, 1];
  const scale = f(1 / f(Math.sqrt(lengthSquared)));
  return [f(x * scale), f(y * scale), f(z * scale)];
}

/**
 * Corner positions in the plane of the face normal, through Blender's `axis_dominant_v3_to_m3_negate`, which turns a
 * polygon that winds counterclockwise around its normal clockwise in 2D, the order polyfill expects.
 */
function project(points: readonly Vec[]): Point[] {
  const normal = newellNormal(points);
  const [x, y, z] = [-normal[0], -normal[1], -normal[2]];
  const lengthSquared = f(f(x * x) + f(y * y));
  let u: Vec;
  let v: Vec;
  if (lengthSquared > FLT_EPSILON) {
    const d = f(1 / f(Math.sqrt(lengthSquared)));
    u = [f(y * d), f(-x * d), 0];
    v = [f(-z * u[1]), f(z * u[0]), f(f(x * u[1]) - f(y * u[0]))];
  } else {
    u = [z < 0 ? -1 : 1, 0, 0];
    v = [0, 1, 0];
  }
  return points.map((p) => [dot(u, p), dot(v, p)]);
}

/** Blender's `span_tri_v2_sign`: 1 where a, b, c turn clockwise, -1 counterclockwise, 0 when they are in line. */
function spanSign(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  const area = f(f(f(bx - cx) * f(ay - cy)) - f(f(ax - cx) * f(by - cy)));
  return area > 0 ? CONVEX : area === 0 ? TANGENTIAL : CONCAVE;
}

/** The first Blender version whose polyfill tests corners against an ear by its edges alone, without bounds. */
const EDGE_TEST_VERSION = 501;

const ACCEPTED_TIPS = [CONVEX, TANGENTIAL] as const;
const THIRD = f(1 / 3);

/**
 * Blender's polyfill k-d tree over the corners that are not convex: split at medians on alternating axes, with a
 * removed corner flagged and bypassed where it has one branch. `aim` sets the ear that `blocks` and `search` test.
 *
 * A corner blocks an ear when it lies inside it or on its border. Before Blender 5.1 that means inside the ear's bounds
 * with no edge turning away from it. Since 5.1 each edge's line function is evaluated from precomputed terms with no
 * bounds, so a corner on the line of a flat ear blocks it even beyond its ends, when the search reaches it.
 */
function cornerTree(xs: Float64Array, ys: Float64Array, corners: readonly number[], byEdges: boolean) {
  const count = corners.length;
  const cornerOf = Int32Array.from(corners);
  const nodeX = Float64Array.from(corners, (corner) => xs[corner] ?? 0);
  const nodeY = Float64Array.from(corners, (corner) => ys[corner] ?? 0);
  const negative = new Int32Array(count).fill(UNSET);
  const positive = new Int32Array(count).fill(UNSET);
  const parent = new Int32Array(count).fill(UNSET);
  const vertical = new Uint8Array(count);
  const removed = new Uint8Array(count);
  const nodeOf = new Int32Array(xs.length).fill(UNSET);
  const swap = (a: number, b: number) => {
    for (const values of [cornerOf, nodeX, nodeY]) {
      const value = values[a] ?? 0;
      values[a] = values[b] ?? 0;
      values[b] = value;
    }
  };

  const balance = (offset: number, size: number, along: number): number => {
    if (size <= 0) return UNSET;
    if (size === 1) return offset;
    const values = along ? nodeY : nodeX;
    const median = size >> 1;
    let low = 0;
    let high = size - 1;
    while (high > low) {
      const pivot = values[offset + high] ?? 0;
      let i = low - 1;
      let j = high;
      for (;;) {
        do i++;
        while ((values[offset + i] ?? 0) < pivot);
        do j--;
        while ((values[offset + j] ?? 0) > pivot && j > low);
        if (i >= j) break;
        swap(offset + i, offset + j);
      }
      swap(offset + i, offset + high);
      if (i >= median) high = i - 1;
      if (i <= median) low = i + 1;
    }
    const node = offset + median;
    vertical[node] = along;
    negative[node] = balance(offset, median, 1 - along);
    positive[node] = balance(node + 1, size - median - 1, 1 - along);
    return node;
  };
  const root = balance(0, count, 0);
  for (let node = 0; node < count; node++) {
    const below = negative[node] ?? UNSET;
    const above = positive[node] ?? UNSET;
    if (below !== UNSET) parent[below] = node;
    if (above !== UNSET) parent[above] = node;
    nodeOf[cornerOf[node] ?? 0] = node;
  }

  const remove = (corner: number): void => {
    let node = nodeOf[corner] ?? UNSET;
    if (node === UNSET) return;
    nodeOf[corner] = UNSET;
    removed[node] = 1;
    for (let above = parent[node] ?? UNSET; above !== UNSET; above = parent[node] ?? UNSET) {
      const below = negative[node] ?? UNSET;
      const beyond = positive[node] ?? UNSET;
      if (below !== UNSET && beyond !== UNSET) break;
      const only = below === UNSET ? beyond : below;
      if (negative[above] === node) negative[above] = only;
      else positive[above] = only;
      if (only !== UNSET) parent[only] = above;
      if (!removed[above]) break;
      node = above;
    }
  };

  let [tip, after, before] = [0, 0, 0];
  let [ax, ay, bx, by, cx, cy] = [0, 0, 0, 0, 0, 0];
  let [minX, minY, maxX, maxY, centerX, centerY] = [0, 0, 0, 0, 0, 0];
  let [abX, abY, abC, bcX, bcY, bcC, caX, caY, caC] = [0, 0, 0, 0, 0, 0, 0, 0, 0];

  const aim = (ear: number, next: number, previous: number): void => {
    tip = ear;
    after = next;
    before = previous;
    [ax, ay, bx, by, cx, cy] = [
      xs[tip] ?? 0,
      ys[tip] ?? 0,
      xs[after] ?? 0,
      ys[after] ?? 0,
      xs[before] ?? 0,
      ys[before] ?? 0,
    ];
    minX = Math.min(ax, bx, cx);
    maxX = Math.max(ax, bx, cx);
    minY = Math.min(ay, by, cy);
    maxY = Math.max(ay, by, cy);
    centerX = f(f(f(ax + bx) + cx) * THIRD);
    centerY = f(f(f(ay + by) + cy) * THIRD);
    [abX, abY, bcX, bcY, caX, caY] = [f(bx - ax), f(by - ay), f(cx - bx), f(cy - by), f(ax - cx), f(ay - cy)];
    abC = f(f(abX * ay) - f(ax * abY));
    bcC = f(f(bcX * by) - f(bx * bcY));
    caC = f(f(caX * cy) - f(cx * caY));
  };

  const contains = (x: number, y: number): boolean => {
    if (byEdges) {
      return (
        f(f(f(bcY * x) - f(bcX * y)) + bcC) >= 0 &&
        f(f(f(caY * x) - f(caX * y)) + caC) >= 0 &&
        f(f(f(abY * x) - f(abX * y)) + abC) >= 0
      );
    }
    return (
      x >= minX &&
      x <= maxX &&
      y >= minY &&
      y <= maxY &&
      spanSign(ax, ay, bx, by, x, y) !== CONCAVE &&
      spanSign(bx, by, cx, cy, x, y) !== CONCAVE &&
      spanSign(cx, cy, ax, ay, x, y) !== CONCAVE
    );
  };
  const blocks = (corner: number): boolean =>
    corner !== tip && corner !== after && corner !== before && contains(xs[corner] ?? 0, ys[corner] ?? 0);

  const pending = new Int32Array(count + 1);
  const search = (): number => {
    if (root === UNSET) return UNSET;
    let top = 0;
    pending[top++] = root;
    while (top > 0) {
      const node = pending[--top] ?? 0;
      const x = nodeX[node] ?? 0;
      const y = nodeY[node] ?? 0;
      if (!removed[node] && contains(x, y)) {
        const corner = cornerOf[node] ?? 0;
        if (corner !== tip && corner !== after && corner !== before) return corner;
      }
      const across = vertical[node] === 1;
      const value = across ? y : x;
      const below = negative[node] ?? UNSET;
      const above = positive[node] ?? UNSET;
      const intoBelow = below !== UNSET && value >= (across ? minY : minX);
      const intoAbove = above !== UNSET && value <= (across ? maxY : maxX);
      if ((across ? centerY : centerX) > value) {
        if (intoBelow) pending[top++] = below;
        if (intoAbove) pending[top++] = above;
      } else {
        if (intoAbove) pending[top++] = above;
        if (intoBelow) pending[top++] = below;
      }
    }
    return UNSET;
  };

  return {
    remove,
    aim,
    blocks,
    holds: (corner: number) => nodeOf[corner] !== UNSET,
    search,
  };
}

/**
 * Blender's `BLI_polyfill_calc` for a clockwise polygon: ear clipping that sweeps around the polygon clipping every
 * other corner. It looks for a convex ear first and accepts a corner in line with its neighbors only when there is
 * none, searches the corners that are not convex for one that blocks an ear, first trying the corner that last blocked
 * it, and when no ear is left clips a corner that is not concave. Returns `count - 2` triangles as indices into
 * `coords`, three each. `byEdges` picks the ear test of Blender 5.1 and later.
 */
export function polyfill(coords: readonly Point[], byEdges: boolean): number[] {
  const count = coords.length;
  const triangles: number[] = [];
  if (count < 3) return triangles;
  const xs = Float64Array.from(coords, (p) => p[0]);
  const ys = Float64Array.from(coords, (p) => p[1]);
  const next = Int32Array.from({ length: count }, (_, index) => (index + 1) % count);
  const previous = Int32Array.from({ length: count }, (_, index) => (index + count - 1) % count);
  const signOf = (index: number) => {
    const [b, a] = [previous[index] ?? 0, next[index] ?? 0];
    return spanSign(xs[b] ?? 0, ys[b] ?? 0, xs[index] ?? 0, ys[index] ?? 0, xs[a] ?? 0, ys[a] ?? 0);
  };
  const sign = Int8Array.from({ length: count }, (_, index) => signOf(index));
  const notConvex = Array.from(sign.keys()).filter((index) => sign[index] !== CONVEX);
  let concave = notConvex.length;
  const tree = concave > 0 ? cornerTree(xs, ys, notConvex, byEdges) : null;
  const lastHit = new Int32Array(count).fill(UNSET);
  const changed = new Uint8Array(count);

  const isEar = (tip: number, accept: number): boolean => {
    if (concave === 0 || !tree) return true;
    if (sign[tip] !== accept) return false;
    const cached = lastHit[tip] ?? UNSET;
    const known = cached !== UNSET && tree.holds(cached);
    if (known && !changed[tip]) return false;
    tree.aim(tip, next[tip] ?? 0, previous[tip] ?? 0);
    if (known && tree.blocks(cached)) {
      changed[tip] = 0;
      return false;
    }
    const hit = tree.search();
    if (hit === UNSET) return true;
    lastHit[tip] = hit;
    changed[tip] = 0;
    return false;
  };

  const findEar = (start: number, reverse: boolean, remaining: number): number => {
    for (const accept of ACCEPTED_TIPS) {
      let ear = start;
      for (let i = 0; i < remaining; i++) {
        if (isEar(ear, accept)) return ear;
        ear = (reverse ? previous[ear] : next[ear]) ?? 0;
      }
    }
    let ear = start;
    for (let i = 0; i < remaining; i++) {
      if (sign[ear] !== CONCAVE) return ear;
      ear = next[ear] ?? 0;
    }
    return ear;
  };

  let head = 0;
  let start = 0;
  let reverse = false;
  for (let remaining = count; remaining > 3; remaining--) {
    const ear = findEar(start, reverse, remaining);
    const before = previous[ear] ?? 0;
    const after = next[ear] ?? 0;
    if (sign[ear] !== CONVEX) concave--;
    triangles.push(before, ear, after);
    tree?.remove(ear);
    next[before] = after;
    previous[after] = before;
    if (head === ear) head = after;
    for (const neighbor of [before, after]) {
      changed[neighbor] = 1;
      if (sign[neighbor] === CONVEX) continue;
      sign[neighbor] = signOf(neighbor);
      if (sign[neighbor] === CONVEX) {
        concave--;
        tree?.remove(neighbor);
      }
    }
    start = (reverse ? previous[before] : next[after]) ?? 0;
    if (sign[start] !== CONVEX) {
      start = (reverse ? previous[start] : next[start]) ?? 0;
      reverse = !reverse;
    }
  }
  const second = next[head] ?? 0;
  triangles.push(head, second, next[second] ?? 0);
  return triangles;
}

/**
 * Triangles of each face as corner indices, three per triangle, in face order, as Blender's mesh tessellation makes
 * them in 32-bit floats: quads split along the 0–2 diagonal unless that folds them, larger polygons by polyfill in the
 * plane of their normal, the way the given Blender version does. `faceTriangles[f]` is the first triangle of face f.
 */
export function triangulate(
  mesh: Pick<MeshData, "positions" | "faceOffsets" | "cornerVerts" | "faceCount">,
  blenderVersion: number,
): { corners: Uint32Array; faceTriangles: Uint32Array } {
  const { positions, faceOffsets, cornerVerts } = mesh;
  let total = 0;
  for (let face = 0; face < mesh.faceCount; face++)
    total += Math.max((faceOffsets[face + 1] ?? 0) - (faceOffsets[face] ?? 0) - 2, 0);
  const corners = new Uint32Array(total * 3);
  const faceTriangles = new Uint32Array(mesh.faceCount + 1);
  let written = 0;
  for (let face = 0; face < mesh.faceCount; face++) {
    faceTriangles[face] = written / 3;
    const start = faceOffsets[face] ?? 0;
    const size = (faceOffsets[face + 1] ?? 0) - start;
    if (size < 3) continue;
    const at = (k: number) => point(positions, cornerVerts[start + k] ?? 0);
    if (size === 3) {
      corners.set([start, start + 1, start + 2], written);
    } else if (size === 4) {
      if (quadFlips(at(0), at(1), at(2), at(3)))
        corners.set([start, start + 1, start + 3, start + 1, start + 2, start + 3], written);
      else corners.set([start, start + 1, start + 2, start, start + 2, start + 3], written);
    } else {
      const local = polyfill(
        project(Array.from({ length: size }, (_, k) => at(k))),
        blenderVersion >= EDGE_TEST_VERSION,
      );
      corners.set(
        local.map((k) => start + k),
        written,
      );
    }
    written += (size - 2) * 3;
  }
  faceTriangles[mesh.faceCount] = written / 3;
  return { corners, faceTriangles };
}
