import { describe, expect, it } from "vitest";
import { clusterPoints } from "./clusters";

describe("clusterPoints", () => {
  it("reads nearby pins in one rectangle around them", () => {
    const clusters = clusterPoints([
      { x: 10.4, y: 20.6 },
      { x: 60.2, y: 90.9 },
    ]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]).toMatchObject({ left: 10, top: 20, width: 51, height: 71 });
  });

  it("keeps the number of reads small for pins spread over the screen, with no cap on pins", () => {
    const points = Array.from({ length: 400 }, (_, index) => ({ x: (index * 397) % 1920, y: (index * 211) % 1080 }));
    const clusters = clusterPoints(points);
    expect(clusters.length).toBeLessThanOrEqual(Math.ceil(1920 / 512) * Math.ceil(1080 / 512));
    expect(clusters.flatMap((cluster) => cluster.points)).toHaveLength(points.length);
    for (const cluster of clusters) {
      expect(Math.max(cluster.width, cluster.height)).toBeLessThanOrEqual(512);
      for (const point of cluster.points) {
        expect(point.x).toBeGreaterThanOrEqual(cluster.left);
        expect(point.x).toBeLessThan(cluster.left + cluster.width);
        expect(point.y).toBeGreaterThanOrEqual(cluster.top);
        expect(point.y).toBeLessThan(cluster.top + cluster.height);
      }
    }
  });

  it("keeps small tiles while few of them hold pins", () => {
    const clusters = clusterPoints([
      { x: 5, y: 5 },
      { x: 1900, y: 5 },
      { x: 5, y: 1070 },
    ]);
    expect(clusters.map((cluster) => cluster.width * cluster.height)).toEqual([1, 1, 1]);
  });
});
