import type { NearestVertex } from "./geometry";
import type { Vec3 } from "./math";

interface VertexNode {
  min: Vec3;
  max: Vec3;
  first: number;
  start: number;
  end: number;
  left: VertexNode | null;
  right: VertexNode | null;
}

const LEAF_SIZE = 16;

/** Exact nearest vertices of fixed positions, preserving source indices and choosing the lowest index on ties. */
export class VertexIndex {
  readonly #positions: Float32Array;
  readonly #vertices: Uint32Array;
  readonly #root: VertexNode | null;

  constructor(positions: Float32Array) {
    this.#positions = positions;
    const vertices: number[] = [];
    for (let vertex = 0; vertex * 3 + 2 < positions.length; vertex++) {
      if ([0, 1, 2].every((axis) => Number.isFinite(positions[vertex * 3 + axis]))) vertices.push(vertex);
    }
    this.#vertices = Uint32Array.from(vertices);
    this.#root = vertices.length > 0 ? this.#build(0, vertices.length) : null;
  }

  nearest(point: Vec3): NearestVertex | null {
    if (!this.#root || !point.every(Number.isFinite)) return null;
    let bestVertex = -1;
    let bestSquared = Infinity;
    const accept = (vertex: number, squared: number) => {
      if (squared < bestSquared || (squared === bestSquared && vertex < bestVertex)) {
        bestVertex = vertex;
        bestSquared = squared;
      }
    };
    const visit = (node: VertexNode, distance: number): void => {
      if (distance > bestSquared || (distance === bestSquared && node.first >= bestVertex)) return;
      if (node.min.every((value, axis) => value === node.max[axis])) {
        accept(node.first, distance);
        return;
      }
      if (!node.left || !node.right) {
        for (let index = node.start; index < node.end; index++) {
          const vertex = this.#vertices[index] ?? 0;
          const dx = (this.#positions[vertex * 3] ?? 0) - point[0];
          const dy = (this.#positions[vertex * 3 + 1] ?? 0) - point[1];
          const dz = (this.#positions[vertex * 3 + 2] ?? 0) - point[2];
          accept(vertex, dx * dx + dy * dy + dz * dz);
        }
        return;
      }
      const leftDistance = boxDistance(node.left, point);
      const rightDistance = boxDistance(node.right, point);
      if (leftDistance <= rightDistance) {
        visit(node.left, leftDistance);
        visit(node.right, rightDistance);
      } else {
        visit(node.right, rightDistance);
        visit(node.left, leftDistance);
      }
    };
    visit(this.#root, boxDistance(this.#root, point));
    return bestVertex < 0 ? null : { vertex: bestVertex, distance: Math.sqrt(bestSquared) };
  }

  #build(start: number, end: number): VertexNode {
    const min: Vec3 = [Infinity, Infinity, Infinity];
    const max: Vec3 = [-Infinity, -Infinity, -Infinity];
    let first = Infinity;
    for (let index = start; index < end; index++) {
      const vertex = this.#vertices[index] ?? 0;
      first = Math.min(first, vertex);
      for (let axis = 0; axis < 3; axis++) {
        const value = this.#positions[vertex * 3 + axis] ?? 0;
        min[axis] = Math.min(min[axis] ?? Infinity, value);
        max[axis] = Math.max(max[axis] ?? -Infinity, value);
      }
    }
    const node: VertexNode = { min, max, first, start, end, left: null, right: null };
    if (end - start <= LEAF_SIZE) return node;
    let axis = 0;
    for (let candidate = 1; candidate < 3; candidate++) {
      if ((max[candidate] ?? 0) - (min[candidate] ?? 0) > (max[axis] ?? 0) - (min[axis] ?? 0)) axis = candidate;
    }
    if (max[axis] === min[axis]) return node;
    this.#vertices
      .subarray(start, end)
      .sort((a, b) => (this.#positions[a * 3 + axis] ?? 0) - (this.#positions[b * 3 + axis] ?? 0) || a - b);
    const middle = (start + end) >>> 1;
    node.left = this.#build(start, middle);
    node.right = this.#build(middle, end);
    return node;
  }
}

function boxDistance(node: VertexNode, point: Vec3): number {
  let squared = 0;
  for (let axis = 0; axis < 3; axis++) {
    const value = point[axis] ?? 0;
    const delta = Math.max((node.min[axis] ?? 0) - value, 0, value - (node.max[axis] ?? 0));
    squared += delta * delta;
  }
  return squared;
}
