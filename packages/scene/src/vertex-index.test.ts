import { describe, expect, it } from "vitest";
import { nearestVertex } from "./geometry";
import type { Vec3 } from "./math";
import { VertexIndex } from "./vertex-index";

describe("VertexIndex", () => {
  it("finds exact nearest source vertices and keeps the lowest source index for ties", () => {
    const positions = Float32Array.from(
      Array.from({ length: 97 }, (_, vertex) => {
        const value = vertex - 48;
        return [value, value % 7, value % 3];
      }).flat(),
    );
    positions.set([0, 0, 0], 90 * 3);
    positions.set([0, 0, 0], 3 * 3);
    const original = positions.slice();
    const index = new VertexIndex(positions);
    const queries: Vec3[] = [
      [0, 0, 0],
      [0.5, 0.5, 0.5],
      [-100, 100, -100],
      [42, 0, 0],
    ];
    for (const query of queries) expect(index.nearest(query)).toEqual(nearestVertex(positions, query));
    expect(index.nearest([0, 0, 0])?.vertex).toBe(3);
    expect(positions).toEqual(original);
  });

  it("agrees with the full scan across split planes, duplicate points and extreme coordinates", () => {
    let seed = 7;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 0x100000000;
    };
    const clouds = [
      Float32Array.from(
        Array.from({ length: 500 }, () => [random() * 2 - 1, random() * 2 - 1, random() * 2 - 1]).flat(),
      ),
      Float32Array.from(Array.from({ length: 100 }, (_, vertex) => [vertex % 10, Math.floor(vertex / 10), 0]).flat()),
      Float32Array.from(Array.from({ length: 100 }, (_, vertex) => [vertex % 5, 0, 0]).flat()),
      new Float32Array(300),
      Float32Array.of(-1e30, 0, 0, 1e30, 0, 0, 1e-30, 0, 0, -1e-30, 0, 0, Number.NaN, 0, 0, Infinity, 0, 0),
      new Float32Array(),
    ];
    const queries: Vec3[] = [
      [0, 0, 0],
      [0.5, 0.5, 0],
      [1e30, 1e30, 1e30],
      [1e-31, 0, 0],
      [Infinity, 0, 0],
      [NaN, 0, 0],
    ];
    for (let query = 0; query < 250; query++)
      queries.push([random() * 20 - 10, random() * 20 - 10, random() * 20 - 10]);
    for (const positions of clouds) {
      const index = new VertexIndex(positions);
      for (const query of queries) expect(index.nearest(query)).toEqual(nearestVertex(positions, query));
    }
  });

  it("prunes distant vertices for a region of repeated nearest-neighbor queries", () => {
    const positions = Float32Array.from(
      Array.from({ length: 4096 }, (_, vertex) => [
        vertex % 16,
        Math.floor(vertex / 16) % 16,
        Math.floor(vertex / 256),
      ]).flat(),
    );
    let coordinateReads = 0;
    const observed = new Proxy(positions, {
      get(target, key) {
        if (typeof key === "string" && /^\d+$/.test(key)) coordinateReads++;
        return Reflect.get(target, key, target);
      },
    });
    const index = new VertexIndex(observed);
    coordinateReads = 0;
    const queries = 128;
    for (let query = 0; query < queries; query++) {
      const point: Vec3 = [((query * 7) % 16) + 0.1, ((query * 11) % 16) + 0.2, (query % 16) + 0.3];
      expect(index.nearest(point)).toEqual(nearestVertex(positions, point));
    }
    expect(coordinateReads).toBeLessThan((positions.length * queries) / 20);
  });
});
