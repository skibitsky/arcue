import { describe, expect, it } from "vitest";
import { ArcueError } from "../errors";
import { binaryFrameCodec } from "./binary-codec";
import { MAX_FRAME_BYTES } from "./framed";

const roundTrip = (value: unknown) => binaryFrameCodec.decode(binaryFrameCodec.encode(value));

/** A frame with the given header and data, laid out as the codec writes it. */
function frame(header: string, data: Uint8Array = new Uint8Array()): Uint8Array {
  const text = new TextEncoder().encode(header);
  const dataStart = Math.ceil((4 + text.byteLength) / 8) * 8;
  const bytes = new Uint8Array(dataStart + data.byteLength);
  new DataView(bytes.buffer).setUint32(0, text.byteLength, true);
  bytes.set(text, 4);
  bytes.set(data, dataStart);
  return bytes;
}

function malformed(bytes: Uint8Array): ArcueError {
  try {
    binaryFrameCodec.decode(bytes);
  } catch (error) {
    if (error instanceof ArcueError) return error;
    throw new Error(`Decoding threw ${String(error)} instead of an ArcueError.`);
  }
  throw new Error("Decoding a malformed frame succeeded.");
}

describe("binaryFrameCodec", () => {
  it("keeps every kind of typed array and its values", () => {
    const value = {
      int8: Int8Array.of(-128, 0, 127),
      uint8: Uint8Array.of(0, 137, 255),
      clamped: Uint8ClampedArray.of(0, 128, 255),
      int16: Int16Array.of(-32768, 1, 32767),
      uint16: Uint16Array.of(0, 65535),
      int32: Int32Array.of(-2147483648, 7),
      uint32: Uint32Array.of(0, 4_000_000_000),
      float32: Float32Array.of(1.5, -0.25, Number.POSITIVE_INFINITY),
      float64: Float64Array.of(Math.PI, Number.NaN, -0),
      bigInt64: BigInt64Array.of(-(2n ** 63n), 5n),
      bigUint64: BigUint64Array.of(2n ** 64n - 1n),
    };
    const decoded = roundTrip(value) as typeof value;
    expect(decoded).toEqual(value);
    for (const [key, array] of Object.entries(value)) {
      const read = decoded[key as keyof typeof value];
      expect(read.constructor, key).toBe(array.constructor);
      expect(read.byteOffset % array.BYTES_PER_ELEMENT, key).toBe(0);
    }
  });

  it("writes only the bytes of a view into a larger buffer", () => {
    const backing = new Float32Array([9, 1.5, -2, 3.25, 9]);
    const positions = backing.subarray(1, 4);
    const bytes = Uint8Array.of(1, 2, 3, 4, 5).subarray(3);

    const encoded = binaryFrameCodec.encode({ positions, bytes });
    const decoded = binaryFrameCodec.decode(encoded) as { positions: Float32Array; bytes: Uint8Array };
    expect(decoded.positions).toEqual(Float32Array.of(1.5, -2, 3.25));
    expect(decoded.bytes).toEqual(Uint8Array.of(4, 5));
    expect(encoded).toEqual(binaryFrameCodec.encode({ positions: positions.slice(), bytes: bytes.slice() }));
  });

  it("writes an array that occurs twice once, and keeps distinct views of one buffer apart", () => {
    const shared = new Float64Array(1000).fill(0.5);
    const buffer = new Uint16Array([1, 2, 3, 4]);
    const value = { a: shared, b: shared, low: buffer.subarray(0, 2), high: buffer.subarray(2) };

    const encoded = binaryFrameCodec.encode(value);
    const decoded = binaryFrameCodec.decode(encoded) as typeof value;
    expect(encoded.byteLength).toBeLessThan(shared.byteLength * 2);
    expect(decoded).toEqual(value);
    expect(decoded.low).toEqual(Uint16Array.of(1, 2));
    expect(decoded.high).toEqual(Uint16Array.of(3, 4));
  });

  it("keeps nested arrays, empty arrays and plain JSON, and drops undefined fields", () => {
    const value = {
      type: "response",
      id: 1,
      ok: true,
      output: {
        meshes: [{ name: "Body", indices: Uint32Array.of(0, 1, 2), weights: [{ values: Float64Array.of(0.25) }] }],
        empty: new Float32Array(0),
        none: null,
        text: "Fold the thumb back",
      },
      missing: undefined,
    };
    const { missing: _, ...expected } = value;
    expect(roundTrip(value)).toEqual(expected);
    expect(roundTrip(new Uint8Array(0))).toEqual(new Uint8Array(0));
    expect(roundTrip("text")).toBe("text");
  });

  it("reads a frame that arrives at an unaligned place in its buffer", () => {
    const encoded = binaryFrameCodec.encode({ values: Float64Array.of(1, 2, 3) });
    const shifted = new Uint8Array(encoded.byteLength + 3);
    shifted.set(encoded, 3);

    expect(binaryFrameCodec.decode(shifted.subarray(3))).toEqual({ values: Float64Array.of(1, 2, 3) });
  });

  it("refuses to send a message larger than a frame may be", () => {
    const huge = new Uint8Array(new ArrayBuffer(8), 0, 8);
    Object.defineProperty(huge, "byteLength", { value: MAX_FRAME_BYTES + 1 });
    expect(() => binaryFrameCodec.encode({ huge })).toThrow(ArcueError);
  });

  it("refuses truncated frames", () => {
    const encoded = binaryFrameCodec.encode({ values: Float32Array.of(1, 2, 3, 4) });
    expect(malformed(new Uint8Array(0)).code).toBe("invalid-input");
    expect(malformed(Uint8Array.of(1, 0)).code).toBe("invalid-input");
    expect(malformed(encoded.subarray(0, 10)).message).toContain("header is longer than the frame");
    expect(malformed(encoded.subarray(0, encoded.byteLength - 4)).message).toContain("reaches past the frame");
    expect(malformed(Uint8Array.of(255, 255, 255, 255)).code).toBe("invalid-input");
  });

  it("refuses arrays outside the data, misaligned arrays and unknown types", () => {
    const data = new Uint8Array(16);
    const reference = (fields: string) => frame(`{"a":{"$arcueTypedArray":${fields}}}`, data);
    expect(malformed(reference('"Uint8Array","offset":10,"length":7')).message).toContain("reaches past");
    expect(malformed(reference('"Float32Array","offset":4,"length":4')).message).toContain("reaches past");
    expect(malformed(reference('"Float64Array","offset":4,"length":1')).message).toContain("misaligned");
    expect(malformed(reference('"Uint16Array","offset":1,"length":1')).message).toContain("misaligned");
    expect(malformed(reference('"Function","offset":0,"length":0')).message).toContain("unknown array type");
    expect(malformed(reference('"constructor","offset":0,"length":0')).message).toContain("unknown array type");
    expect(malformed(reference('"DataView","offset":0,"length":0')).message).toContain("unknown array type");
    expect(malformed(reference('5,"offset":0,"length":0')).message).toContain("unknown array type");
    expect(malformed(reference('"Uint8Array","offset":-1,"length":1')).message).toContain("invalid offset");
    expect(malformed(reference('"Uint8Array","offset":0.5,"length":1')).message).toContain("invalid offset");
    expect(malformed(reference('"Uint8Array","offset":0,"length":"2"')).message).toContain("invalid offset");
    expect(malformed(reference('"Uint8Array","offset":0,"length":1e300')).message).toContain("invalid offset");
    expect(malformed(reference('"Uint8Array","offset":0')).message).toContain("invalid offset");
    expect(malformed(reference('"Uint8Array","offset":0,"length":1,"base64":""')).message).toContain("unknown fields");
    expect(binaryFrameCodec.decode(reference('"Float64Array","offset":8,"length":1'))).toEqual({
      a: new Float64Array(1),
    });
  });

  it("refuses headers that are not UTF-8 or not JSON", () => {
    const bytes = frame("{}");
    bytes[4] = 0xff;
    expect(malformed(bytes).message).toContain("not UTF-8");
    expect(malformed(frame('{"a":')).message).toContain("not JSON");
    expect(malformed(frame(`${"[".repeat(100_000)}${"]".repeat(100_000)}`)).code).toBe("invalid-input");
  });
});
