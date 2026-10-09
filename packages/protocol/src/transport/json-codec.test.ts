import { describe, expect, it } from "vitest";
import { jsonFrameCodec } from "./json-codec";

const roundTrip = (value: unknown) => jsonFrameCodec.decode(jsonFrameCodec.encode(value));

describe("jsonFrameCodec", () => {
  it("keeps typed arrays and their element types, including views into larger buffers", () => {
    const backing = new Float32Array([9, 1.5, -2, 3.25, 9]);
    const value = {
      png: Uint8Array.of(137, 80, 78, 71, 0, 255),
      positions: backing.subarray(1, 4),
      indices: Uint32Array.of(0, 1, 4_000_000_000),
      empty: new Uint16Array(0),
      nested: [{ weights: Float64Array.of(0.25, 0.75) }],
    };
    const decoded = roundTrip(value) as typeof value;
    expect(decoded).toEqual(value);
    expect(decoded.positions).toBeInstanceOf(Float32Array);
    expect(decoded.positions.byteOffset).toBe(0);
    expect(decoded.indices).toBeInstanceOf(Uint32Array);
  });

  it("encodes every byte length correctly", () => {
    for (let length = 0; length < 8; length++) {
      const bytes = Uint8Array.from({ length }, (_, index) => (index * 97 + 13) % 256);
      expect(roundTrip(bytes)).toEqual(bytes);
    }
  });

  it("passes plain JSON through and drops undefined fields, as a void result does", () => {
    expect(roundTrip({ type: "response", id: 1, ok: true, output: undefined })).toEqual({
      type: "response",
      id: 1,
      ok: true,
    });
    expect(roundTrip({ text: "Fold the thumb back", count: 3, tags: ["a"], none: null })).toEqual({
      text: "Fold the thumb back",
      count: 3,
      tags: ["a"],
      none: null,
    });
  });

  it("refuses malformed tagged values", () => {
    const encode = (text: string) => new TextEncoder().encode(text);
    expect(() => jsonFrameCodec.decode(encode('{"$arcueTypedArray":"Function","base64":""}'))).toThrow();
    expect(() => jsonFrameCodec.decode(encode('{"$arcueTypedArray":"Uint8Array","base64":"@@@@"}'))).toThrow();
    expect(() => jsonFrameCodec.decode(encode('{"$arcueTypedArray":"Uint32Array","base64":"AAA="}'))).toThrow();
  });
});
