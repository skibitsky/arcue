import { topologyFingerprint } from "@arcue/scene";
import { describe, expect, it } from "vitest";
import { fanFingerprint } from "./topology";

/** A row of two quads, faces 0 1 4 3 and 1 2 5 4, each split into two triangles. */
const faces = { offsets: Uint32Array.of(0, 4, 8), vertices: Uint32Array.of(0, 1, 4, 3, 1, 2, 5, 4) };

describe("fanFingerprint", () => {
  it("hashes each face fanned from its first corner, triangle by triangle", () => {
    const mesh = { faces, triangleFaces: Uint32Array.of(0, 0, 1, 1), sourceVertexCount: 6 };
    const fans = [0, 1, 4, 0, 4, 3, 1, 2, 5, 1, 5, 4];
    expect(fanFingerprint(mesh)).toEqual(
      topologyFingerprint({
        indices: Uint32Array.from(fans),
        sourceVertex: Uint32Array.from({ length: 6 }, (_, vertex) => vertex),
        sourceVertexCount: 6,
      }),
    );
  });

  it("follows the order the mesh draws its faces in", () => {
    const drawn = fanFingerprint({ faces, triangleFaces: Uint32Array.of(1, 1, 0, 0), sourceVertexCount: 6 });
    expect(drawn).not.toEqual(
      fanFingerprint({ faces, triangleFaces: Uint32Array.of(0, 0, 1, 1), sourceVertexCount: 6 }),
    );
    expect(drawn.triangleCount).toBe(4);
  });
});
