export interface TopologyFingerprint {
  sourceVertexCount: number;
  triangleCount: number;
  /** 64-bit hash, as 16 hex digits, of every triangle's corners in source vertex numbers. */
  hash: string;
}

export interface TopologyInput {
  indices: Uint32Array;
  sourceVertex: Uint32Array;
  sourceVertexCount: number;
}

export function topologyFingerprint({ indices, sourceVertex, sourceVertexCount }: TopologyInput): TopologyFingerprint {
  if (indices.length % 3 !== 0) {
    throw new RangeError(`Triangle indices must come in threes, got ${indices.length}.`);
  }
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (const rendered of indices) {
    const source = sourceVertex[rendered];
    if (source === undefined || source >= sourceVertexCount) {
      throw new RangeError(`Rendered vertex ${rendered} has no source vertex below ${sourceVertexCount}.`);
    }
    h1 = Math.imul(h1 ^ source, 2654435761);
    h2 = Math.imul(h2 ^ source, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return {
    sourceVertexCount,
    triangleCount: indices.length / 3,
    hash: hex32(h2) + hex32(h1),
  };
}

export function sameTopology(a: TopologyFingerprint, b: TopologyFingerprint): boolean {
  return a.sourceVertexCount === b.sourceVertexCount && a.triangleCount === b.triangleCount && a.hash === b.hash;
}

function hex32(value: number): string {
  return (value >>> 0).toString(16).padStart(8, "0");
}
