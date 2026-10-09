import { describe, expect, it } from "vitest";
import { countInRanges, decodeRanges, encodeRanges, rangesContain, rangesWithin } from "./ranges";

describe("encodeRanges", () => {
  it("sorts, removes duplicates and joins consecutive indices", () => {
    expect(encodeRanges([5, 3, 4, 10, 11, 13, 4])).toEqual([
      [3, 5],
      [10, 11],
      [13, 13],
    ]);
  });

  it("returns no ranges for no indices", () => {
    expect(encodeRanges([])).toEqual([]);
  });

  it("rejects negative and fractional indices", () => {
    expect(() => encodeRanges([-1])).toThrow(RangeError);
    expect(() => encodeRanges([1.5])).toThrow(RangeError);
  });
});

describe("decodeRanges", () => {
  it("expands inclusive ranges", () => {
    expect([
      ...decodeRanges([
        [2, 4],
        [7, 7],
      ]),
    ]).toEqual([2, 3, 4, 7]);
  });

  it("round-trips with encodeRanges", () => {
    const indices = [0, 1, 2, 9, 40, 41, 42, 43, 100];
    expect([...decodeRanges(encodeRanges(indices))]).toEqual(indices);
  });

  it("rejects reversed, unsorted, overlapping and touching ranges", () => {
    expect(() => decodeRanges([[5, 4]])).toThrow(RangeError);
    expect(() =>
      decodeRanges([
        [10, 12],
        [1, 2],
      ]),
    ).toThrow(RangeError);
    expect(() =>
      decodeRanges([
        [1, 5],
        [5, 8],
      ]),
    ).toThrow(RangeError);
    expect(() =>
      decodeRanges([
        [1, 5],
        [6, 8],
      ]),
    ).toThrow(RangeError);
  });
});

describe("countInRanges", () => {
  it("counts the vertices of the spec's thumb region", () => {
    expect(
      countInRanges([
        [2210, 2239],
        [2251, 2266],
      ]),
    ).toBe(46);
  });
});

describe("rangesWithin", () => {
  it("checks the last index against a count", () => {
    const ranges = encodeRanges([0, 1, 7]);
    expect(rangesWithin(ranges, 8)).toBe(true);
    expect(rangesWithin(ranges, 7)).toBe(false);
    expect(rangesWithin([], 0)).toBe(true);
  });
});

describe("rangesContain", () => {
  const ranges = encodeRanges([1, 2, 3, 10, 20, 21]);

  it("finds indices inside any range", () => {
    for (const index of [1, 2, 3, 10, 20, 21]) expect(rangesContain(ranges, index)).toBe(true);
  });

  it("rejects indices between and outside ranges", () => {
    for (const index of [0, 4, 9, 11, 19, 22]) expect(rangesContain(ranges, index)).toBe(false);
  });

  it("handles no ranges", () => {
    expect(rangesContain([], 0)).toBe(false);
  });
});
