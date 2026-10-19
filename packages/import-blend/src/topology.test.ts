import { topologyFingerprint } from "@arcue/scene";
import { describe, expect, it } from "vitest";
import { importFixture, VERSIONS } from "../test/fixtures";
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

describe("the fingerprints of the rig fixture", () => {
  it.each(VERSIONS)("stay what saved reviews of its file from Blender %s know", async (version) => {
    const scene = await importFixture("rig", version);
    expect(scene.meshes.map((mesh) => [mesh.name, mesh.topology])).toEqual([
      ["Body", { sourceVertexCount: 96, triangleCount: 168, hash: "210c730ab3c7eedf" }],
      ["Prop", { sourceVertexCount: 8, triangleCount: 12, hash: "098afaa399151c6c" }],
    ]);
  });
});
