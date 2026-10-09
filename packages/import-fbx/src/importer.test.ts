import { readFileSync } from "node:fs";
import type { FoundFile, ImportRequest, SceneDescription } from "@arcue/scene";
import { cleanClipName, collectTransferables, lastFrame, parseStoredPath } from "@arcue/scene";
import { beforeAll, describe, expect, it } from "vitest";
import {
  ABSOLUTE_TEXTURE_FBX,
  ARMATURE_SCALE_FBX,
  animatedFbx,
  CENTIMETER_ROOT_SCALE_FBX,
  EXTERNAL_TEXTURE_FBX,
  IN_BETWEEN_FBX,
  LEFT_HANDED_FBX,
  METAL_ROUGH_FBX,
  PARTLY_WEIGHTED_FBX,
  PHONG_SHININESS_FBX,
  PNG_SIGNATURE,
  ROOT_ROTATION_FBX,
  ROOT_SCALE_FBX,
  SHARED_GEOMETRY_FBX,
  Y_UP_ROOT_ROTATION_FBX,
} from "../test/ascii-fbx";
import { posedWorldMatrices, restPoseError, skinnedSourceVertex } from "../test/geometry";
import { importSample, manifest, readSample } from "../test/samples";
import { fbxImporter } from "./importer";

const BOUNDS_TOLERANCE = 1e-3;

const noFiles: Pick<ImportRequest, "readFile" | "findFile"> = {
  readFile: () => Promise.resolve(null),
  findFile: () => Promise.resolve(null),
};

function importText(
  fileName: string,
  text: string,
  findFile: (storedPath: string) => Promise<FoundFile | null> = noFiles.findFile,
): Promise<SceneDescription> {
  const bytes = new TextEncoder().encode(text);
  return fbxImporter.import({ ...noFiles, fileName, bytes, findFile });
}

function textureName(scene: SceneDescription, ref: { texture: number } | null | undefined): string | null {
  return ref ? (scene.textures[ref.texture]?.name ?? null) : null;
}

const findAnyPng = (storedPath: string) =>
  Promise.resolve({ path: parseStoredPath(storedPath).name, bytes: PNG_SIGNATURE });

function frames(times: Float32Array | undefined, fps: number): number[] {
  return Array.from(times ?? [], (time) => Math.round(time * fps * 1000) / 1000);
}

describe.each(manifest.files)("$file", (expected) => {
  let scene: SceneDescription;

  beforeAll(async () => {
    scene = await importSample(expected.file);
  });

  it("gives each mesh one node of its own and names it after that object", () => {
    expect(scene.meshes.map((mesh) => mesh.name)).toEqual(expected.meshes.map((mesh) => mesh.name));
    for (const [index, mesh] of scene.meshes.entries()) {
      const owners = scene.nodes.filter((node) => node.mesh === index);
      expect(owners).toHaveLength(1);
      expect(owners[0]?.kind).toBe("mesh");
      expect(owners[0]?.name).toBe(mesh.name);
      expect(mesh.geometryName).toBe(mesh.name);
    }
  });

  it("keeps the file's control points as source vertices and triangulates every face", () => {
    for (const [index, mesh] of scene.meshes.entries()) {
      const facts = expected.meshes[index];
      expect(mesh.sourceVertexCount).toBe(facts?.control_points);
      expect(mesh.indices.length / 3).toBe(facts?.triangles);
      expect(mesh.topology).toMatchObject({
        sourceVertexCount: facts?.control_points,
        triangleCount: facts?.triangles,
      });
      expect(mesh.restPositions).toHaveLength(mesh.sourceVertexCount * 3);
      const rendered = mesh.positions.length / 3;
      expect(mesh.sourceVertex).toHaveLength(rendered);
      expect(Math.max(...mesh.sourceVertex)).toBeLessThan(mesh.sourceVertexCount);
      expect(new Set(mesh.sourceVertex).size).toBe(mesh.sourceVertexCount);
      expect(Math.max(...mesh.indices)).toBeLessThan(rendered);
    }
  });

  it("splits the triangles into material groups", () => {
    for (const [index, mesh] of scene.meshes.entries()) {
      const names = mesh.groups.map((group) => scene.materials[group.material]?.name);
      expect(names).toEqual(expected.meshes[index]?.materials);
      let next = 0;
      for (const group of mesh.groups) {
        expect(group.start).toBe(next);
        next += group.triangleCount;
      }
      expect(next).toBe(mesh.indices.length / 3);
    }
  });

  it("carries UV sets, unit normals and shape keys", () => {
    for (const [index, mesh] of scene.meshes.entries()) {
      const facts = expected.meshes[index];
      expect(mesh.uvs.length > 0).toBe(facts?.has_uvs);
      expect(mesh.uvs.map((uv) => uv.name)).toEqual(facts?.uv_sets);
      for (const uv of mesh.uvs) expect(uv.values).toHaveLength((mesh.positions.length / 3) * 2);
      for (let i = 0; i < mesh.normals.length; i += 3) {
        const length = Math.hypot(mesh.normals[i] ?? 0, mesh.normals[i + 1] ?? 0, mesh.normals[i + 2] ?? 0);
        expect(length).toBeCloseTo(1, 4);
      }
      expect(mesh.morphTargets.map((target) => target.name)).toEqual(facts?.shape_keys);
      for (const target of mesh.morphTargets) {
        expect(target.positions).toHaveLength(mesh.positions.length);
        expect(target.defaultWeight).toBe(0);
      }
    }
  });

  it("skins the meshes the file skins", () => {
    for (const [index, mesh] of scene.meshes.entries()) {
      const skinned = expected.meshes[index]?.skinned ?? false;
      expect(mesh.skeleton !== null).toBe(skinned);
      expect(mesh.bindMatrix !== null).toBe(skinned);
      expect(mesh.skinWeights !== null).toBe(skinned);
      if (!mesh.skinWeights || !mesh.weights || !mesh.joints) continue;
      const { offsets, joints, weights } = mesh.skinWeights;
      expect(offsets).toHaveLength(mesh.sourceVertexCount + 1);
      expect(offsets[offsets.length - 1]).toBe(weights.length);
      expect(joints).toHaveLength(weights.length);
      for (let vertex = 0; vertex < mesh.sourceVertexCount; vertex++) {
        expect(offsets[vertex + 1] ?? 0).toBeGreaterThan(offsets[vertex] ?? 0);
      }
      for (let vertex = 0; vertex < mesh.weights.length; vertex += 4) {
        const sum = mesh.weights.subarray(vertex, vertex + 4).reduce((total, weight) => total + weight, 0);
        expect(sum).toBeCloseTo(1, 5);
      }
    }
  });

  it("lists the armature's bones as one skeleton with its root first in the hierarchy", () => {
    const armature = expected.armature;
    if (!armature) {
      expect(scene.skeletons).toHaveLength(0);
      expect(scene.nodes.filter((node) => node.kind === "bone")).toHaveLength(0);
      return;
    }
    expect(scene.skeletons).toHaveLength(1);
    const skeleton = scene.skeletons[0];
    const jointNames = skeleton?.joints.map((joint) => scene.nodes[joint]?.name) ?? [];
    expect(jointNames).toHaveLength(armature.bone_count);
    expect([...jointNames].sort()).toEqual([...armature.bone_names].sort());
    expect(skeleton?.inverseBindMatrices).toHaveLength(armature.bone_count * 16);
    const jointSet = new Set(skeleton?.joints);
    const roots = skeleton?.joints.filter((joint) => !jointSet.has(scene.nodes[joint]?.parent ?? -1)) ?? [];
    expect(roots.map((joint) => scene.nodes[joint]?.name)).toEqual([armature.root_bone]);
    const root = scene.nodes[roots[0] ?? -1];
    expect(scene.nodes[root?.parent ?? -1]?.name).toBe(armature.name);
    expect(scene.nodes.filter((node) => node.kind === "bone")).toHaveLength(armature.bone_count);
    for (const node of scene.nodes) expect(node.parent).toBeLessThan(scene.nodes.indexOf(node));
    expect(scene.nodes.find((node) => node.name === "Hand.R")?.path).toBe(
      "Armature/Hips/Spine/Chest/Shoulder.R/UpperArm.R/Forearm.R/Hand.R",
    );
  });

  it("makes one clip per take with the file's names, frame range and key density", () => {
    const takes = [...expected.clips].sort((a, b) => a.take_name.localeCompare(b.take_name));
    const clips = [...scene.clips].sort((a, b) => a.name.localeCompare(b.name));
    expect(clips.map((clip) => clip.name)).toEqual(takes.map((take) => take.take_name));
    for (const [index, clip] of clips.entries()) {
      const take = takes[index];
      if (!take) throw new Error("Missing take.");
      expect(clip.displayName).toBe(cleanClipName(take.take_name));
      expect(clip.fps).toBe(expected.fps);
      expect(lastFrame(clip)).toBe(take.frame_end - take.frame_start);
      expect(clip.duration).toBeCloseTo(take.duration_seconds, 6);
      expect(clip.keyedEveryFrame).toBe(take.keys_on_every_frame);
      expect(clip.keyTimes).toHaveLength(take.keyed_frames_union);
      for (const time of clip.keyTimes) expect(time * clip.fps).toBeCloseTo(Math.round(time * clip.fps), 4);
      expect(clip.keyTimes[0]).toBe(0);
      expect(clip.tracks.length).toBeGreaterThan(0);
      for (const track of clip.tracks) {
        expect(track.times.length).toBeGreaterThan(0);
        const width = track.property === "rotation" ? 4 : track.property === "weights" ? -1 : 3;
        if (width > 0) expect(track.values).toHaveLength(track.times.length * width);
        for (let i = 1; i < track.times.length; i++) {
          expect(track.times[i] ?? 0).toBeGreaterThan(track.times[i - 1] ?? 0);
        }
        expect(track.times[track.times.length - 1] ?? 0).toBeLessThanOrEqual(clip.duration + 1e-6);
      }
    }
  });

  it("places the rest pose in meters with Y up", () => {
    const { min, max } = expected.rest_bounds_m;
    for (const [axis, value] of scene.bounds.min.entries()) {
      expect(Math.abs(value - (min[axis] ?? 0))).toBeLessThan(BOUNDS_TOLERANCE);
    }
    for (const [axis, value] of scene.bounds.max.entries()) {
      expect(Math.abs(value - (max[axis] ?? 0))).toBeLessThan(BOUNDS_TOLERANCE);
    }
    expect(scene.source.fps).toBe(expected.fps);
    expect(scene.source.originalSpace.unitMeters).toBeCloseTo(expected.units.meters_per_file_unit, 9);
  });

  it("agrees with its rest positions when the rest pose is skinned or placed", () => {
    for (let mesh = 0; mesh < scene.meshes.length; mesh++) expect(restPoseError(scene, mesh)).toBeLessThan(1e-5);
  });

  it("owns every typed array instead of viewing parser memory", () => {
    const transferables = collectTransferables(scene);
    const viewed = transferables.reduce((total, buffer) => total + buffer.byteLength, 0);
    const views: ArrayBufferView[] = [];
    for (const mesh of scene.meshes) {
      views.push(mesh.positions, mesh.normals, mesh.indices, mesh.sourceVertex, mesh.restPositions);
      for (const uv of mesh.uvs) views.push(uv.values);
      for (const target of mesh.morphTargets) views.push(target.positions);
    }
    for (const view of views) expect(view.buffer.byteLength).toBe(view.byteLength);
    expect(viewed).toBeLessThan(64 * 1024 * 1024);
    expect(scene.source.warnings).toEqual([]);
  });
});

describe("axis and unit conversion", () => {
  it("turns a Z-up centimeter file into Y-up meters", async () => {
    const scene = await importSample("zup-centimeters.fbx");
    expect(scene.source.originalSpace).toEqual({ axes: { right: "+X", up: "+Z", front: "-Y" }, unitMeters: 0.01 });
    expect(scene.source.conversion.scale).toBeCloseTo(0.01, 12);
    const [x, y, z, w] = scene.source.conversion.rotation;
    expect(x).toBeCloseTo(-Math.SQRT1_2, 6);
    expect(y).toBeCloseTo(0, 6);
    expect(z).toBeCloseTo(0, 6);
    expect(w).toBeCloseTo(Math.SQRT1_2, 6);
    const height = scene.bounds.max[1] - scene.bounds.min[1];
    expect(height).toBeGreaterThan(0.14);
    expect(height).toBeLessThan(0.15);
    expect(scene.bounds.min[1]).toBeCloseTo(0, 6);
  });

  it("leaves a Y-up meter file in place", async () => {
    const scene = await importSample("crate.fbx");
    expect(scene.source.originalSpace).toEqual({ axes: { right: "+X", up: "+Y", front: "+Z" }, unitMeters: 1 });
    expect(scene.source.conversion).toEqual({ scale: 1, rotation: [0, 0, 0, 1] });
    expect(scene.source.exporter).toEqual({ name: "Blender (stable FBX IO)", version: "5.2.2 LTS" });
  });
});

describe("handedness", () => {
  it("mirrors a left-handed file and says so", async () => {
    const scene = await importText("left.fbx", LEFT_HANDED_FBX);
    expect(scene.source.originalSpace.axes).toEqual({ right: "-X", up: "+Y", front: "+Z" });
    expect(scene.source.warnings).toEqual([
      {
        code: "left-handed-axes",
        severity: "warning",
        subject: { kind: "file", name: "left.fbx" },
        message: "Left-handed axes, mirrored along X",
      },
    ]);
    expect(restPoseError(scene, 0)).toBeLessThan(1e-6);
  });
});

describe("shared geometry", () => {
  it("gives every node that uses the geometry its own mesh, with its geometric transform applied", async () => {
    const bytes = new TextEncoder().encode(SHARED_GEOMETRY_FBX);
    const scene = await fbxImporter.import({ ...noFiles, fileName: "shared.fbx", bytes });
    expect(scene.nodes.map((node) => [node.name, node.mesh])).toEqual([
      ["Left", 0],
      ["Right", 1],
    ]);
    expect(scene.meshes.map((mesh) => [mesh.name, mesh.geometryName])).toEqual([
      ["Left", "Tri"],
      ["Right", "Tri"],
    ]);
    const rest = scene.meshes.map((mesh) => Array.from(mesh.restPositions, (value) => Number(value.toFixed(6))));
    expect(rest).toEqual([
      [-2, 0, 0, -1, 0, 0, -2, 1, 0],
      [2, 1, 0, 3, 1, 0, 2, 2, 0],
    ]);
    expect(scene.meshes[1]?.positions.subarray(0, 3)).toEqual(Float32Array.of(0, 1, 0));
    for (const mesh of scene.meshes.keys()) expect(restPoseError(scene, mesh)).toBeLessThan(1e-6);
  });
});

describe("textures", () => {
  it("embeds the rock's base color image", async () => {
    const scene = await importSample("textured-rock.fbx");
    const facts = manifest.files.find((file) => file.file === "textured-rock.fbx")?.textures[0];
    expect(scene.textures).toHaveLength(1);
    const texture = scene.textures[0];
    expect(texture?.name).toBe(facts?.name);
    expect(texture?.mimeType).toBe("image/png");
    expect(texture?.bytes.byteLength).toBe(facts?.embedded_bytes);
    const header = new DataView(texture?.bytes.buffer ?? new ArrayBuffer(0), texture?.bytes.byteOffset);
    expect(header.getUint32(0)).toBe(0x89504e47);
    expect([header.getUint32(16), header.getUint32(20)]).toEqual(facts?.blender_image.size);
    const embedded = readSample("textured-rock.fbx");
    const signature = embedded.findIndex(
      (byte, index) => byte === 0x89 && embedded[index + 1] === 0x50 && embedded[index + 2] === 0x4e,
    );
    expect(embedded.subarray(signature, signature + (texture?.bytes.length ?? 0))).toEqual(texture?.bytes);
    expect(scene.materials[0]?.baseColorTexture).toEqual({
      texture: 0,
      uvSet: 0,
      wrapU: "repeat",
      wrapV: "repeat",
      transform: null,
    });
  });

  it("fills the roughness and metalness slots of a PBR material", async () => {
    const scene = await importText("metal.fbx", METAL_ROUGH_FBX, findAnyPng);
    const material = scene.materials[0];
    expect(textureName(scene, material?.roughnessTexture)).toBe("rough");
    expect(textureName(scene, material?.metalnessTexture)).toBe("metal");
    expect(material?.roughness).toBeCloseTo(0.4, 6);
    expect(material?.metallic).toBe(1);
  });

  it("leaves the roughness slot empty when a Phong material's shininess has a texture", async () => {
    const scene = await importText("shiny.fbx", PHONG_SHININESS_FBX, findAnyPng);
    const material = scene.materials[0];
    expect(material?.roughnessTexture).toBeNull();
    expect(material?.metalnessTexture).toBeNull();
    expect(scene.textures).toEqual([]);
  });
});

describe("animation", () => {
  it("poses the skin as ufbx does, on a frame and between frames", async () => {
    const scene = await importSample("pebble-golem-sparse.fbx");
    const reference: { clip: string; frames: { frame: number; positions: [number, number, number, number][] }[] } =
      JSON.parse(readFileSync(new URL("../test/fixtures/golem-sparse-walk.json", import.meta.url), "utf8"));
    const clip = scene.clips.find((candidate) => candidate.name === reference.clip);
    if (!clip) throw new Error(`No clip ${reference.clip}.`);
    for (const { frame, positions } of reference.frames) {
      const worlds = posedWorldMatrices(scene, clip, frame / clip.fps);
      for (const [source, ...expected] of positions) {
        const actual = skinnedSourceVertex(scene, 0, worlds, source);
        expect(Math.hypot(...actual.map((value, axis) => value - (expected[axis] ?? 0)))).toBeLessThan(1e-5);
      }
    }
  });

  it("offsets the blob's normals with its shape keys", async () => {
    const scene = await importSample("blob.fbx");
    const mesh = scene.meshes[0];
    for (const target of mesh?.morphTargets ?? []) {
      expect(target.normals).toHaveLength(mesh?.positions.length ?? 0);
      const moved = target.positions.some((value) => value !== 0);
      const turned = target.normals?.some((value) => value !== 0);
      expect([moved, turned]).toEqual([true, true]);
    }
  });

  it("uses the final shape of an in-between shape key, keeps its default weight and warns", async () => {
    const scene = await importText("bulge.fbx", IN_BETWEEN_FBX);
    const mesh = scene.meshes[0];
    const target = mesh?.morphTargets[0];
    expect(target?.name).toBe("Bulge");
    expect(target?.defaultWeight).toBeCloseTo(0.25, 6);
    const first = mesh?.sourceVertex.indexOf(0) ?? -1;
    expect(Array.from(target?.positions.subarray(first * 3, first * 3 + 3) ?? [])).toEqual([0, 0, 1]);
    expect(Array.from(target?.normals?.subarray(first * 3, first * 3 + 3) ?? [])).toEqual([0, 1, 0]);
    const other = mesh?.sourceVertex.indexOf(1) ?? -1;
    expect(Array.from(target?.positions.subarray(other * 3, other * 3 + 3) ?? [])).toEqual([0, 0, 0]);
    expect(scene.source.warnings).toEqual([
      {
        code: "inbetween-shapes",
        severity: "warning",
        subject: { kind: "node", name: "Tri" },
        message: "In-between shape keys of Tri use their final shape",
      },
    ]);
  });

  it("animates the blob's shape keys with weights from 0 to 1", async () => {
    const scene = await importSample("blob.fbx");
    const clip = scene.clips[0];
    const weights = clip?.tracks.find((track) => track.property === "weights");
    expect(weights?.node).toBe(scene.nodes.findIndex((node) => node.name === "Blob"));
    const values = weights?.values ?? new Float32Array();
    expect(values.length).toBe((weights?.times.length ?? 0) * 2);
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...values)).toBeCloseTo(1, 6);
  });

  it("keeps constant-interpolation keys as a step track", async () => {
    const text = animatedFbx({ range: [0, 30], keyFrames: [0, 10, 30], values: [0, 1, 2], interpolation: "constant" });
    const clip = (await importText("hop.fbx", text)).clips[0];
    expect(clip).toMatchObject({ name: "Hop", displayName: "Hop", fps: 30, frameCount: 31, keyedEveryFrame: false });
    expect(frames(clip?.keyTimes, 30)).toEqual([0, 10, 30]);
    const translation = clip?.tracks.find((track) => track.property === "translation");
    expect(translation?.interpolation).toBe("step");
    expect(frames(translation?.times, 30)).toEqual([0, 10, 30]);
    expect(Array.from(translation?.values ?? []).filter((_, index) => index % 3 === 0)).toEqual([0, 1, 2]);
  });

  it.each([
    { label: "a take that starts at frame -10", range: [-10, 20] as [number, number], keyFrames: [-10, 0, 20] },
    { label: "a take without a range, keyed at frames 10, 20 and 40", range: null, keyFrames: [10, 20, 40] },
  ])("counts key times and track times from the same first frame in $label", async ({ range, keyFrames }) => {
    const text = animatedFbx({ range, keyFrames, values: [0, 1, 2], interpolation: "linear" });
    const clip = (await importText("hop.fbx", text)).clips[0];
    expect(clip?.frameCount).toBe(31);
    expect(frames(clip?.keyTimes, 30)).toEqual([0, 10, 30]);
    const translation = clip?.tracks.find((track) => track.property === "translation");
    expect(translation?.interpolation).toBe("linear");
    expect(frames(translation?.times, 30)).toEqual([0, 10, 30]);
    expect(Array.from(translation?.values ?? []).filter((_, index) => index % 3 === 0)).toEqual([0, 1, 2]);
    expect(clip?.tracks.length).toBeGreaterThan(1);
    expect(clip?.tracks.map((track) => track.times[0])).toEqual(clip?.tracks.map(() => 0));
  });

  it("samples sparse curves at the file's frame rate but keeps only their own keys as key times", async () => {
    const scene = await importSample("pebble-golem-sparse.fbx");
    const hit = scene.clips.find((clip) => clip.name === "Armature|Hit");
    expect(hit?.keyedEveryFrame).toBe(false);
    expect(hit?.keyTimes).toHaveLength(14);
    const rotations = hit?.tracks.filter((track) => track.property === "rotation") ?? [];
    const longest = Math.max(...rotations.map((track) => track.times.length));
    expect(longest).toBe(16);
  });
});

describe("skinning", () => {
  it("binds vertices without skin weights to the mesh node and warns", async () => {
    const scene = await importText("partly.fbx", PARTLY_WEIGHTED_FBX);
    const mesh = scene.meshes[0];
    const skeleton = scene.skeletons[mesh?.skeleton ?? -1];
    expect(skeleton?.joints.map((joint) => scene.nodes[joint]?.name)).toEqual(["Root", "Tri"]);
    expect(Array.from(mesh?.skinWeights?.offsets ?? [])).toEqual([0, 1, 2, 2]);
    const loose = mesh?.sourceVertex.indexOf(2) ?? -1;
    expect(Array.from(mesh?.joints?.subarray(loose * 4, loose * 4 + 4) ?? [])).toEqual([1, 0, 0, 0]);
    expect(Array.from(mesh?.weights?.subarray(loose * 4, loose * 4 + 4) ?? [])).toEqual([1, 0, 0, 0]);
    expect(scene.source.warnings).toEqual([
      {
        code: "unweighted-vertices",
        severity: "warning",
        subject: { kind: "node", name: "Tri" },
        message: "Some vertices of Tri have no skin weights",
      },
    ]);
    expect(restPoseError(scene, 0)).toBeLessThan(1e-6);
  });
});

describe("export checks", () => {
  it("warns about a root scaled by 100 in a meter file", async () => {
    const scene = await importText("big.fbx", ROOT_SCALE_FBX);
    expect(scene.source.warnings).toEqual([
      {
        code: "root-scale",
        severity: "warning",
        subject: { kind: "node", name: "Tri" },
        message: "Root scale of 100 on Tri",
      },
    ]);
  });

  it("warns about an armature scaled by 0.01 below a root, but not about its bones", async () => {
    const scene = await importText("rig.fbx", ARMATURE_SCALE_FBX);
    expect(scene.nodes.find((node) => node.name === "Hips")?.kind).toBe("bone");
    expect(scene.source.warnings).toEqual([
      {
        code: "root-scale",
        severity: "warning",
        subject: { kind: "node", name: "Armature" },
        message: "Root scale of 0.01 on Armature",
      },
    ]);
  });

  it("warns about a -90° rotation about X on a root in a Z-up file", async () => {
    const scene = await importText("lying.fbx", ROOT_ROTATION_FBX);
    expect(scene.source.originalSpace.axes.up).toBe("+Z");
    expect(scene.source.warnings).toEqual([
      {
        code: "root-rotation",
        severity: "warning",
        subject: { kind: "node", name: "Tri" },
        message: "Root rotation of -90° about X on Tri",
      },
    ]);
  });

  it("accepts root transforms that only undo the file's units or axes", async () => {
    expect((await importText("cm.fbx", CENTIMETER_ROOT_SCALE_FBX)).source.warnings).toEqual([]);
    expect((await importText("blender.fbx", Y_UP_ROOT_ROTATION_FBX)).source.warnings).toEqual([]);
  });

  it("warns about a texture stored only with an absolute path, even when it is found by name", async () => {
    const found: string[] = [];
    const scene = await importText("striker.fbx", ABSOLUTE_TEXTURE_FBX, (storedPath) => {
      found.push(storedPath);
      return Promise.resolve({ path: "../Textures/StoneStriker-BaseColor.png", bytes: PNG_SIGNATURE });
    });
    expect(found).toEqual(["/private/tmp/striker-staging/StoneStriker-BaseColor.png"]);
    expect(scene.textures).toEqual([
      {
        name: "StoneStriker-BaseColor",
        mimeType: "image/png",
        bytes: PNG_SIGNATURE,
        storedPath: "/private/tmp/striker-staging/StoneStriker-BaseColor.png",
        foundPath: "../Textures/StoneStriker-BaseColor.png",
      },
    ]);
    expect(scene.source.warnings).toEqual([
      {
        code: "texture-path-absolute",
        severity: "warning",
        subject: { kind: "texture", name: "StoneStriker-BaseColor.png" },
        message: "Texture path is absolute: /private/tmp/striker-staging/StoneStriker-BaseColor.png",
      },
    ]);
  });

  it("reports a texture that is not found as an error", async () => {
    const scene = await importText("striker.fbx", ABSOLUTE_TEXTURE_FBX);
    expect(scene.materials[0]?.baseColorTexture).toBeNull();
    expect(scene.source.warnings.map((warning) => [warning.code, warning.severity, warning.message])).toEqual([
      [
        "texture-path-absolute",
        "warning",
        "Texture path is absolute: /private/tmp/striker-staging/StoneStriker-BaseColor.png",
      ],
      ["texture-not-found", "error", "Texture not found: StoneStriker-BaseColor.png"],
    ]);
  });

  it("does not warn about the absolute path beside a relative one, and tries the relative one first", async () => {
    const found: string[] = [];
    const scene = await importText("tri.fbx", EXTERNAL_TEXTURE_FBX, (storedPath) => {
      found.push(storedPath);
      return Promise.resolve(null);
    });
    expect(found).toEqual(["textures/painted.png", "C:/Users/artist/textures/painted.png"]);
    expect(scene.source.warnings.map((warning) => warning.code)).toEqual(["texture-not-found"]);
  });
});

describe("errors", () => {
  it("rejects bytes that are not FBX as invalid input", async () => {
    const bytes = new TextEncoder().encode("this is not an fbx file");
    await expect(fbxImporter.import({ ...noFiles, fileName: "broken.fbx", bytes })).rejects.toMatchObject({
      name: "ArcueError",
      code: "invalid-input",
    });
  });

  it("keeps working after a rejected file", async () => {
    await expect(
      fbxImporter.import({ ...noFiles, fileName: "empty.fbx", bytes: new Uint8Array() }),
    ).rejects.toMatchObject({ code: "invalid-input" });
    const scene = await importSample("crate.fbx");
    expect(scene.meshes).toHaveLength(1);
  });
});
