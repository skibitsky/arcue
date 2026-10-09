export interface ScreenPoint {
  x: number;
  y: number;
}

export interface PointCluster<Point extends ScreenPoint> {
  left: number;
  top: number;
  width: number;
  height: number;
  points: Point[];
}

export interface ClusterOptions {
  minTile: number;
  maxTile: number;
  maxClusters: number;
}

const DEFAULTS: ClusterOptions = { minTile: 128, maxTile: 512, maxClusters: 6 };

/**
 * Groups screen points into a few rectangles to read back in one call each. Points share a square tile, which starts
 * at `minTile` pixels and doubles while more than `maxClusters` tiles hold points, up to `maxTile`. Each cluster is the
 * whole-pixel bounds of its points, so a read never spans more than one tile.
 */
export function clusterPoints<Point extends ScreenPoint>(
  points: readonly Point[],
  options: ClusterOptions = DEFAULTS,
): PointCluster<Point>[] {
  let tile = options.minTile;
  let groups = groupByTile(points, tile);
  while (groups.size > options.maxClusters && tile * 2 <= options.maxTile) {
    tile *= 2;
    groups = groupByTile(points, tile);
  }
  return [...groups.values()].map((group) => {
    const left = Math.floor(Math.min(...group.map((point) => point.x)));
    const top = Math.floor(Math.min(...group.map((point) => point.y)));
    const right = Math.floor(Math.max(...group.map((point) => point.x))) + 1;
    const bottom = Math.floor(Math.max(...group.map((point) => point.y))) + 1;
    return { left, top, width: right - left, height: bottom - top, points: group };
  });
}

function groupByTile<Point extends ScreenPoint>(points: readonly Point[], tile: number): Map<string, Point[]> {
  const groups = new Map<string, Point[]>();
  for (const point of points) {
    const key = `${Math.floor(point.x / tile)},${Math.floor(point.y / tile)}`;
    const group = groups.get(key);
    if (group) group.push(point);
    else groups.set(key, [point]);
  }
  return groups;
}
