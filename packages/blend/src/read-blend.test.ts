import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fixturesDir, readFixture, readFixtureScene, reference, VERSIONS } from "../test/fixtures.js";
import { matrixError, pointsError, transformPoint, worldMatrices } from "../test/poses.js";
import { decompressBlend } from "./blend/decompress.js";
import { BlendReadError } from "./blend/errors.js";
import { readBlend } from "./read-blend.js";
import type { BlendClip, BlendMesh, BlendScene } from "./types.js";

const TOLERANCE = 1e-4;

function meshNamed(scene: BlendScene, name: string): BlendMesh {
  const found = scene.meshes.find((mesh) => mesh.name === name);
  if (!found) throw new RangeError(`No mesh ${name}.`);
  return found;
}

function clipNamed(scene: BlendScene, name: string): BlendClip {
  const found = scene.clips.find((clip) => clip.name === name);
  if (!found) throw new RangeError(`No clip ${name}.`);
  return found;
}

async function refusal(bytes: Uint8Array): Promise<unknown> {
  return readBlend(bytes).then(
    () => null,
    (error: unknown) => error,
  );
}

describe.each(VERSIONS)("readBlend on a file from Blender %s", (version) => {
  describe("the features fixture", async () => {
    const scene = await readFixtureScene("features", version);
    const expected = reference("features", version);

    it("reads the version, frame rate and unit scale", () => {
      expect(expected.blender.startsWith(scene.blenderVersion)).toBe(true);
      expect(scene.fps).toBe(expected.fps);
      expect(scene.unitScale).toBe(expected.unitScale);
    });

    it("places every object where Blender does, in meters with +Y up", () => {
      const worlds = worldMatrices(scene);
      const checked = Object.entries(expected.objects).flatMap(([name, object]) => {
        const node = scene.nodes.findIndex((candidate) => candidate.name === name && candidate.kind !== "bone");
        return node < 0 ? [] : [{ name, node, world: object.world }];
      });
      expect(checked.length).toBeGreaterThan(15);
      for (const { name, node, world } of checked) {
        expect(matrixError(worlds[node] ?? [], world), name).toBeLessThan(TOLERANCE);
      }
    });

    it("keeps each mesh's vertex numbers, faces, triangles and rest positions", () => {
      for (const [name, mesh] of Object.entries(expected.meshes)) {
        const read = meshNamed(scene, name);
        expect(read.sourceVertexCount, name).toBe(mesh.vertexCount);
        expect(Array.from(read.faces.vertices), name).toEqual(mesh.corners.map(([vertex]) => vertex));
        expect(read.indices.length / 3, name).toBe(mesh.triangles);
        expect(read.triangleFaces.length, name).toBe(mesh.triangles);
        expect(pointsError(read.restPositions, mesh.restPositions), name).toBeLessThan(TOLERANCE);
        expect(
          read.uvs.map((uv) => uv.name),
          name,
        ).toEqual(mesh.uvMaps);
      }
    });

    it("draws each triangle from the vertices of the face it comes from", () => {
      for (const read of scene.meshes) {
        const { offsets, vertices } = read.faces;
        for (let triangle = 0; triangle < read.triangleFaces.length; triangle++) {
          const face = read.triangleFaces[triangle] ?? 0;
          const corners = vertices.subarray(offsets[face] ?? 0, offsets[face + 1] ?? 0);
          const drawn = [0, 1, 2].map((k) => read.sourceVertex[read.indices[triangle * 3 + k] ?? 0] ?? -1);
          expect(
            drawn.every((vertex) => corners.includes(vertex)),
            `${read.name} triangle ${triangle}`,
          ).toBe(true);
        }
      }
    });

    it("moves each vertex by the shape keys as Blender does at the weights it was evaluated with", () => {
      const worlds = worldMatrices(scene);
      for (const [name, shaped] of Object.entries(expected.shapeKeys ?? {})) {
        const index = scene.meshes.findIndex((mesh) => mesh.name === name);
        const mesh = meshNamed(scene, name);
        const world = worlds[scene.nodes.findIndex((node) => node.mesh === index)] ?? [];
        const weights = mesh.morphTargets.map((target) => shaped.weights[target.name] ?? 0);
        const placed = new Float64Array(mesh.sourceVertexCount * 3);
        for (let rendered = 0; rendered < mesh.sourceVertex.length; rendered++) {
          const at = (k: number) =>
            mesh.morphTargets.reduce(
              (sum, target, t) => sum + (weights[t] ?? 0) * (target.positions[rendered * 3 + k] ?? 0),
              mesh.positions[rendered * 3 + k] ?? 0,
            );
          placed.set(transformPoint(world, at(0), at(1), at(2)), (mesh.sourceVertex[rendered] ?? 0) * 3);
        }
        expect(pointsError(placed, shaped.positions), name).toBeLessThan(TOLERANCE);
        for (const target of mesh.morphTargets) expect(target.range[0], target.name).toBeLessThan(target.range[1]);
      }
    });
  });

  describe("the rig fixture", async () => {
    const scene = await readFixtureScene("rig", version);
    const expected = reference("rig", version);

    it("skins the body to the deform bones its vertex groups name", () => {
      const skin = meshNamed(scene, "Body").skin;
      const joints = scene.skeletons[skin?.skeleton ?? -1]?.joints.map((joint) => scene.nodes[joint]?.name) ?? [];
      expect(joints).toEqual(expect.arrayContaining(["Root", "Spine", "Head"]));
      expect(joints).not.toContain("Helper");
      const { offsets } = skin?.sourceWeights ?? { offsets: new Uint32Array(0) };
      expect(offsets.length).toBe(meshNamed(scene, "Body").sourceVertexCount + 1);
    });

    it("samples each action into a clip that poses the bones as Blender does", () => {
      const samples = expected.clips?.Wave ?? [];
      const wave = clipNamed(scene, "Wave");
      const start = samples[0]?.frame ?? 1;
      expect(wave.fileFrames.start).toBe(start);
      expect(samples.length).toBeGreaterThan(0);
      for (const sample of samples) {
        const worlds = worldMatrices(scene, wave, (sample.frame - start) / scene.fps);
        for (const [bone, world] of Object.entries(sample.bones)) {
          const node = scene.nodes.findIndex((candidate) => candidate.name === bone && candidate.kind === "bone");
          expect(matrixError(worlds[node] ?? [], world), `${bone} at ${sample.frame}`).toBeLessThan(TOLERANCE);
        }
      }
    });
  });
});

describe.each(VERSIONS)("readBlend on the helpers and images of a file from Blender %s", (version) => {
  it("marks the objects Blender draws as wire or bounds as hidden", async () => {
    const scene = await readFixtureScene("helpers", version);
    const helpers: Record<string, { drawsSurface: boolean }> = JSON.parse(
      readFileSync(`${fixturesDir}helpers-${version}.json`, "utf8"),
    ).helpers;
    for (const [name, helper] of Object.entries(helpers)) {
      const node = scene.nodes.find((candidate) => candidate.name === name && candidate.kind === "mesh");
      expect(node?.hidden, name).toBe(!helper.drawsSurface);
    }
  });

  it("gives each image its packed bytes or the path the file stores, and none to an image linked from elsewhere", async () => {
    const scene = await readFixtureScene("images", version);
    const images: Record<string, { file: string | null; linked: boolean; packedSize: number }> = JSON.parse(
      readFileSync(`${fixturesDir}images-${version}.json`, "utf8"),
    ).images;
    const imageOf = (material: string) => {
      const ref = scene.materials.find((candidate) => candidate.name === material)?.baseColorTexture;
      return ref ? scene.images[ref.image] : undefined;
    };
    for (const [material, expected] of Object.entries(images)) {
      if (expected.linked) continue;
      const image = imageOf(material);
      if (expected.packedSize > 0) {
        expect(image?.source, material).toBe("packed");
        expect(image?.packed?.length, material).toBeGreaterThan(0);
      } else {
        expect(image, material).toMatchObject({ source: "file", path: expected.file, relative: true, packed: null });
      }
    }
    expect(imageOf("CheckerB")).toBe(imageOf("CheckerA"));
    expect(imageOf("Borrowed")?.source).toBe("none");
  });
});

describe("readBlend on a file it cannot read", () => {
  it("refuses bytes that are not a .blend file as unreadable", async () => {
    const error = await refusal(new TextEncoder().encode("not a blend file"));
    expect(error).toBeInstanceOf(BlendReadError);
    expect(error).toMatchObject({ reason: "unreadable", detail: "it does not start with a Blender file header" });
  });

  it("refuses a file from before Blender 2.80, naming the version that saved it", async () => {
    const bytes = await decompressBlend(readFixture("rig", "4.2"));
    bytes.set(new TextEncoder().encode("279"), 9);
    expect(await refusal(bytes)).toMatchObject({ reason: "too-old", detail: "2.79" });
  });
});
