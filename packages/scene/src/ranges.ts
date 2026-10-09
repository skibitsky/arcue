import type { IndexRange } from "./anchor";

/** Sorts, removes duplicates and joins consecutive indices into inclusive ranges. */
export function encodeRanges(indices: Iterable<number>): IndexRange[] {
  const sorted = Array.from(indices, checkIndex).sort((a, b) => a - b);
  const ranges: IndexRange[] = [];
  let current: IndexRange | null = null;
  for (const index of sorted) {
    if (current && index <= current[1] + 1) {
      current[1] = Math.max(current[1], index);
    } else {
      current = [index, index];
      ranges.push(current);
    }
  }
  return ranges;
}

/**
 * Expands ranges into indices. The ranges must be sorted and must not overlap or touch. Ranges from a file or another
 * process can name any index, so check them with `rangesWithin` against the mesh's counts before decoding.
 */
export function decodeRanges(ranges: readonly IndexRange[]): Uint32Array {
  const out = new Uint32Array(countInRanges(ranges));
  let n = 0;
  for (const [start, end] of ranges) {
    for (let index = start; index <= end; index++) out[n++] = index;
  }
  return out;
}

export function countInRanges(ranges: readonly IndexRange[]): number {
  let count = 0;
  let previousEnd = -2;
  for (const [start, end] of ranges) {
    checkIndex(start);
    checkIndex(end);
    if (end < start) throw new RangeError(`Range [${start}, ${end}] ends before it starts.`);
    if (start <= previousEnd + 1) {
      throw new RangeError(`Range [${start}, ${end}] overlaps or touches the range before it.`);
    }
    count += end - start + 1;
    previousEnd = end;
  }
  return count;
}

/** True when every index in the ranges is below `count`. */
export function rangesWithin(ranges: readonly IndexRange[], count: number): boolean {
  const last = ranges[ranges.length - 1];
  return last === undefined || last[1] < count;
}

export function rangesContain(ranges: readonly IndexRange[], index: number): boolean {
  let low = 0;
  let high = ranges.length - 1;
  while (low <= high) {
    const middle = (low + high) >>> 1;
    const range = ranges[middle];
    if (!range) return false;
    if (index < range[0]) high = middle - 1;
    else if (index > range[1]) low = middle + 1;
    else return true;
  }
  return false;
}

function checkIndex(index: number): number {
  if (!Number.isInteger(index) || index < 0 || index > 0xffffffff) {
    throw new RangeError(`${index} is not a valid index.`);
  }
  return index;
}
