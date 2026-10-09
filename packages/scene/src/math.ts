export type Vec3 = [x: number, y: number, z: number];

export type Vec4 = [x: number, y: number, z: number, w: number];

export type Quat = [x: number, y: number, z: number, w: number];

export interface Bounds {
  min: Vec3;
  max: Vec3;
}

/** Bounds of xyz triples; a zero box at the origin when there are no points. */
export function boundsOfPoints(arrays: readonly Float32Array[]): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const array of arrays) {
    for (let i = 0; i + 2 < array.length; i += 3) {
      const x = array[i] ?? 0;
      const y = array[i + 1] ?? 0;
      const z = array[i + 2] ?? 0;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      minZ = Math.min(minZ, z);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      maxZ = Math.max(maxZ, z);
    }
  }
  if (minX > maxX) return { min: [0, 0, 0], max: [0, 0, 0] };
  return { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] };
}
