import { describe, expect, it } from "vitest";
import { identity } from "../math";
import type { Envelope } from "./envelopes";
import { envelopeFactor, envelopeUse } from "./envelopes";

const BONE: Envelope = { head: [0, 0, 0], tail: [0, 2, 0], headRadius: 0.5, tailRadius: 0.25, falloff: 0.5, weight: 1 };

describe("envelopeFactor", () => {
  it("keeps a bone's whole weight inside its envelope, whose radius runs from the head's to the tail's", () => {
    expect(envelopeFactor([0.45, 0, 0], BONE)).toBe(1);
    expect(envelopeFactor([0.35, 1, 0], BONE)).toBe(1);
    expect(envelopeFactor([0, 2.2, 0], BONE)).toBe(1);
  });

  it("fades the weight over the falloff beyond the envelope, around the bone and past its ends", () => {
    expect(envelopeFactor([0.625, 1, 0], BONE)).toBeCloseTo(0.75, 12);
    expect(envelopeFactor([0, -0.75, 0], BONE)).toBeCloseTo(0.75, 12);
    expect(envelopeFactor([0, 2.5, 0], BONE)).toBeCloseTo(0.75, 12);
  });

  it("drops the weight beyond the falloff, and right outside the envelope when there is no falloff", () => {
    expect(envelopeFactor([0, 3, 0], BONE)).toBe(0);
    expect(envelopeFactor([1.1, 0, 0], BONE)).toBe(0);
    expect(envelopeFactor([0.51, 0, 0], { ...BONE, falloff: 0 })).toBe(0);
  });
});

describe("envelopeUse", () => {
  const groupsAndEnvelopes = { flags: (1 << 0) | (1 << 1), maskGroup: "" };
  const bones = [
    { name: "A", flag: 1 << 11, deform: true },
    { name: "B", flag: 0, deform: true },
  ];
  const envelopes = new Map([
    ["A", BONE],
    ["B", { ...BONE, head: [5, 0, 0], tail: [5, 2, 0] }],
  ]);
  /** A mesh whose vertex `v` lies at `points[v]` with the bone weights `groups[v]`, by vertex group index. */
  const mesh = (points: number[][], groups: [group: number, weight: number][][]) => {
    const offsets = new Uint32Array(points.length + 1);
    groups.forEach((entries, v) => {
      offsets[v + 1] = (offsets[v] ?? 0) + entries.length;
    });
    return {
      vertexCount: points.length,
      positions: Float32Array.from(points.flat()),
      deformWeights: {
        offsets,
        groups: Int32Array.from(groups.flat().map(([group]) => group)),
        weights: Float32Array.from(groups.flat().map(([, weight]) => weight)),
      },
      vertexGroupNames: ["A", "B"],
    };
  };

  it("finds envelopes that reach an ungrouped vertex and bones that multiply, wherever their vertices come", () => {
    const data = mesh(
      [
        [0.2, 1, 0],
        [3, 1, 0],
        [3, 1, 0],
      ],
      [
        [],
        [
          [0, 0.5],
          [1, 0.5],
        ],
        [[1, 1]],
      ],
    );
    expect(envelopeUse(data, groupsAndEnvelopes, bones, envelopes, identity())).toEqual({
      enveloped: true,
      multiplying: ["A"],
    });
    expect(envelopeUse(data, { ...groupsAndEnvelopes, flags: 1 << 0 }, bones, envelopes, identity())).toEqual({
      enveloped: false,
      multiplying: ["A"],
    });
  });

  it("reaches an ungrouped vertex through an envelope's falloff alone", () => {
    const beyondRadius = mesh([[0.625, 1, 0]], [[]]);
    expect(envelopeUse(beyondRadius, groupsAndEnvelopes, bones, envelopes, identity()).enveloped).toBe(true);
    const beyondFalloff = mesh([[0.9, 1, 0]], [[]]);
    expect(envelopeUse(beyondFalloff, groupsAndEnvelopes, bones, envelopes, identity()).enveloped).toBe(false);
  });
});
