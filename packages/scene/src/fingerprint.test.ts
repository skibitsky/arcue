import { describe, expect, it } from "vitest";
import { sameTopology, topologyFingerprint } from "./fingerprint";

const quad = {
  indices: Uint32Array.of(0, 1, 2, 0, 2, 3),
  sourceVertex: Uint32Array.of(0, 1, 2, 3),
  sourceVertexCount: 4,
};

const quadSplitAtSeam = {
  indices: Uint32Array.of(0, 1, 2, 4, 5, 3),
  sourceVertex: Uint32Array.of(0, 1, 2, 3, 0, 2),
  sourceVertexCount: 4,
};

describe("topologyFingerprint", () => {
  it("counts source vertices and triangles", () => {
    const fingerprint = topologyFingerprint(quad);
    expect(fingerprint.sourceVertexCount).toBe(4);
    expect(fingerprint.triangleCount).toBe(2);
    expect(fingerprint.hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it("ignores how rendered vertices are split", () => {
    expect(topologyFingerprint(quadSplitAtSeam)).toEqual(topologyFingerprint(quad));
  });

  it("changes when triangles change", () => {
    const flipped = { ...quad, indices: Uint32Array.of(0, 2, 1, 0, 3, 2) };
    expect(topologyFingerprint(flipped).hash).not.toBe(topologyFingerprint(quad).hash);
  });

  it("rejects indices that do not form triangles", () => {
    expect(() => topologyFingerprint({ ...quad, indices: Uint32Array.of(0, 1) })).toThrow(RangeError);
  });

  it("rejects rendered vertices without a valid source vertex", () => {
    expect(() => topologyFingerprint({ ...quad, indices: Uint32Array.of(0, 1, 9) })).toThrow(RangeError);
    expect(() => topologyFingerprint({ ...quad, sourceVertexCount: 3 })).toThrow(RangeError);
  });
});

describe("sameTopology", () => {
  it("compares counts and hash", () => {
    const a = topologyFingerprint(quad);
    expect(sameTopology(a, topologyFingerprint(quadSplitAtSeam))).toBe(true);
    expect(sameTopology(a, { ...a, sourceVertexCount: 5 })).toBe(false);
    expect(sameTopology(a, { ...a, hash: "0000000000000000" })).toBe(false);
  });
});
