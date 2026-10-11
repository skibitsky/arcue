import { describe, expect, it } from "vitest";
import type { Envelope } from "./envelopes";
import { envelopeFactor } from "./envelopes";

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
