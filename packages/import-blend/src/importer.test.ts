import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { fbxImporter } from "@arcue/import-fbx";
import type { Clip, SceneDescription } from "@arcue/scene";
import { describe, expect, it } from "vitest";
import {
  findInFixtures,
  importBytes,
  importFixture,
  readFixture,
  reference,
  repositoryDir,
  VERSIONS,
} from "../test/fixtures";
import {
  invertAffine,
  matrixError,
  morphWeights,
  multiply,
  placedSourceVertices,
  pointsError,
  shear,
  worldMatrices,
} from "../test/geometry";
import { parsePosePath, readActions } from "./anim/actions";
import { evaluateFCurve } from "./anim/fcurve";
import { decompressBlend } from "./blend/decompress";
import { readBlendFile } from "./blend/file";
import { datablocks, idName } from "./blend/ids";
import { blendImporter } from "./importer";
import { toSceneAxes } from "./math";
import { poseMatrices } from "./scene/armature";
import { buildScene } from "./scene/build";
import { cloneValues, setTransformProperty } from "./scene/transforms";

const TOLERANCE = 1e-4;

function nodeIndex(scene: SceneDescription, name: string): number {
  const index = scene.nodes.findIndex((node) => node.name === name);
  if (index < 0) throw new RangeError(`No node ${name}.`);
  return index;
}

function meshIndex(scene: SceneDescription, name: string): number {
  const index = scene.meshes.findIndex((mesh) => mesh.name === name);
  if (index < 0) throw new RangeError(`No mesh ${name}.`);
  return index;
}

function clip(scene: SceneDescription, name: string): Clip {
  const found = scene.clips.find((candidate) => candidate.name === name);
  if (!found) throw new RangeError(`No clip ${name}.`);
  return found;
}

describe.each(VERSIONS)("a file from Blender %s", (version) => {
  describe("features", async () => {
    const scene = await importFixture("features", version);
    const expected = reference("features", version);

    it("reads the scene's frame rate, units and axes", () => {
      expect(scene.source.format).toBe("blend");
      expect(scene.source.exporter).toEqual({ name: "Blender", version });
      expect(scene.source.fps).toBe(expected.fps);
      expect(scene.source.originalSpace).toEqual({ axes: { right: "+X", up: "+Z", front: "-Y" }, unitMeters: 1 });
    });

    it("applies Smooth by Angle and warns about nothing it leaves out", () => {
      expect(scene.source.warnings).toEqual([]);
    });

    it("leaves out objects the view layer excludes or viewports disable", () => {
      const names = scene.nodes.map((node) => node.name);
      expect(names).not.toContain("InExcluded");
      expect(names).not.toContain("InDisabled");
      expect(names).not.toContain("HiddenObject");
      expect(names).toEqual(expect.arrayContaining(["RotXYZ", "RotQuaternion", "Deltas", "Child", "Prop", "Hand"]));
    });

    it("places every object where Blender does, with rotation modes, deltas, parent inverses and bone parents", () => {
      const worlds = worldMatrices(scene);
      const checked = Object.entries(expected.objects).filter(([name]) =>
        scene.nodes.some((node) => node.name === name),
      );
      expect(checked.length).toBeGreaterThan(15);
      for (const [name, object] of checked) {
        expect(matrixError(worlds[nodeIndex(scene, name)] ?? [], object.world), name).toBeLessThan(TOLERANCE);
      }
    });

    it("keeps Blender's vertex numbers and rest positions", () => {
      for (const [name, mesh] of Object.entries(expected.meshes)) {
        const built = scene.meshes[meshIndex(scene, name)];
        expect(built?.sourceVertexCount, name).toBe(mesh.vertexCount);
        expect(pointsError(built?.restPositions ?? [], mesh.restPositions), name).toBeLessThan(TOLERANCE);
        expect((built?.indices.length ?? 0) / 3, name).toBe(mesh.triangles);
      }
    });

    it("shades every face corner with Blender's normal: flat, smooth, sharp edges and custom normals", () => {
      for (const [name, mesh] of Object.entries(expected.meshes)) {
        const built = scene.meshes[meshIndex(scene, name)];
        if (!built) throw new Error(name);
        const byVertex = new Map<number, number[][]>();
        for (let r = 0; r < built.sourceVertex.length; r++) {
          const list = byVertex.get(built.sourceVertex[r] ?? -1) ?? [];
          list.push(Array.from(built.normals.subarray(r * 3, r * 3 + 3)));
          byVertex.set(built.sourceVertex[r] ?? -1, list);
        }
        for (const [vertex, ...normal] of mesh.corners) {
          const found = (byVertex.get(vertex) ?? []).some((candidate) => pointsError(candidate, normal) < 1e-3);
          expect(found, `${name} vertex ${vertex}`).toBe(true);
        }
        for (const [vertex, normals] of byVertex) {
          for (const normal of normals) {
            const known = mesh.corners.some(
              (corner) => corner[0] === vertex && pointsError(corner.slice(1), normal) < 1e-3,
            );
            expect(known, `${name} vertex ${vertex}`).toBe(true);
          }
        }
      }
    });

    it("reads UV maps, the render color attribute and material slots linked to the mesh or the object", () => {
      const polygons = scene.meshes[meshIndex(scene, "Polygons")];
      const expectedPolygons = expected.meshes.Polygons;
      if (!polygons || !expectedPolygons?.colors) throw new Error("no Polygons");
      expect(polygons.uvs.map((uv) => uv.name)).toEqual(expectedPolygons.uvMaps);
      expect(polygons.groups.map((group) => scene.materials[group.material]?.name)).toEqual(["Red", "Default", "Blue"]);
      const { domain, values } = expectedPolygons.colors;
      const cornerColors = new Map<number, number[][]>();
      expectedPolygons.corners.forEach(([vertex], corner) => {
        const list = cornerColors.get(vertex) ?? [];
        list.push(
          domain === "POINT" ? values.slice(vertex * 4, vertex * 4 + 4) : values.slice(corner * 4, corner * 4 + 4),
        );
        cornerColors.set(vertex, list);
      });
      for (let r = 0; r < polygons.sourceVertex.length; r++) {
        const color = Array.from(polygons.colors?.subarray(r * 4, r * 4 + 4) ?? []);
        const candidates = cornerColors.get(polygons.sourceVertex[r] ?? -1) ?? [];
        expect(
          candidates.some((candidate) => candidate.every((value, k) => Math.abs(value - (color[k] ?? 0)) < 2e-3)),
        ).toBe(true);
      }
    });

    it("turns shape keys into morph targets, relative to their own reference keys and limited to their vertex groups", () => {
      const index = meshIndex(scene, "Blob");
      const blob = scene.meshes[index];
      expect(blob?.morphTargets.map((target) => [target.name, target.defaultWeight])).toEqual([
        ["Up", 0.25],
        ["Side", 0.5],
        ["Stacked", 0],
      ]);
      const shaped = expected.shapeKeys?.Blob;
      if (!shaped) throw new Error("no shape key reference");
      const weights = blob?.morphTargets.map((target) => shaped.weights[target.name] ?? 0) ?? [];
      const placed = placedSourceVertices(scene, index, worldMatrices(scene), weights);
      expect(pointsError(placed, shaped.positions)).toBeLessThan(TOLERANCE);
    });

    it("turns each rendered normal as Blender shades the shape key at full weight", () => {
      const blob = scene.meshes[meshIndex(scene, "Blob")];
      const normals = expected.shapeKeys?.Blob?.normals;
      if (!blob || !normals) throw new Error("no Blob shape key normals");
      for (const target of blob.morphTargets) {
        const corners = normals[target.name] ?? [];
        expect(corners.length, target.name).toBeGreaterThan(0);
        for (let r = 0; r < blob.sourceVertex.length; r++) {
          const turned = [0, 1, 2].map((k) => (blob.normals[r * 3 + k] ?? 0) + (target.normals?.[r * 3 + k] ?? 0));
          const length = Math.hypot(...turned);
          const normal = turned.map((value) => value / length);
          const vertex = blob.sourceVertex[r];
          const found = corners.some((corner) => corner[0] === vertex && pointsError(corner.slice(1), normal) < 1e-3);
          expect(found, `${target.name} vertex ${vertex}`).toBe(true);
        }
      }
    });
  });

  describe("rig", async () => {
    const scene = await importFixture("rig", version);
    const expected = reference("rig", version);
    const body = meshIndex(scene, "Body");

    it("binds the mesh to the deform bones its vertex groups name, at rest", () => {
      const mesh = scene.meshes[body];
      const skeleton = scene.skeletons[mesh?.skeleton ?? -1];
      const joints = skeleton?.joints.map((joint) => scene.nodes[joint]?.name);
      expect(joints).not.toContain("Helper");
      expect(joints?.at(-1)).toBe("Body");
      expect(pointsError(mesh?.restPositions ?? [], expected.meshes.Body?.restPositions ?? [])).toBeLessThan(TOLERANCE);
      const rest = placedSourceVertices(scene, body, worldMatrices(scene), [0]);
      expect(pointsError(rest, expected.meshes.Body?.restPositions ?? [])).toBeLessThan(TOLERANCE);
      expect(scene.source.warnings.map((warning) => [warning.code, warning.subject.name])).toEqual([
        ["unweighted-vertices", "Body"],
        ["deform-approximated", "Ease"],
        ["deform-approximated", "Stretch"],
      ]);
    });

    it("makes a clip of every action, assigned or not, over its frame range", () => {
      expect(scene.clips.map((entry) => [entry.name, entry.frameCount, entry.fps])).toEqual([
        ["Ease", 61, 30],
        ["Pulse", 7, 30],
        ["Spin", 10, 30],
        ["Stretch", 9, 30],
        ["Swell", 8, 30],
        ["Wave", 20, 30],
      ]);
      expect(Array.from(clip(scene, "Wave").keyTimes)).toEqual([0, 5 / 30, 11 / 30].map(Math.fround));
    });

    it("steps shape key weights that only constant keys move", () => {
      const weights = (name: string) =>
        clip(scene, name).tracks.map((track) => [scene.nodes[track.node]?.name, track.property, track.interpolation]);
      expect(weights("Pulse")).toEqual([["Body", "weights", "step"]]);
      expect(weights("Swell")).toEqual([["Body", "weights", "linear"]]);
    });

    it("evaluates every bone's pose in armature space as Blender does, inheritance modes included", async () => {
      const file = readBlendFile(await decompressBlend(readFixture("rig", version)));
      const built = buildScene(file);
      const armature = built.objects.find((record) => record.object.name === "Rig")?.armature;
      if (!armature) throw new Error("no Rig");
      for (const action of readActions(file)) {
        for (const sample of expected.clips?.[action.name] ?? []) {
          const channels = armature.rest.map((rest) => cloneValues(rest));
          for (const curve of action.slots.flatMap((slot) => slot.curves)) {
            const pose = parsePosePath(curve.path);
            const channel = channels[armature.bones.findIndex((bone) => bone.name === pose?.bone)];
            if (pose && channel)
              setTransformProperty(channel, pose.property, curve.index, evaluateFCurve(curve, sample.frame));
          }
          const poses = poseMatrices(armature.bones, channels);
          const rig = sample.objects.Rig?.world ?? [];
          armature.bones.forEach((bone, index) => {
            const world = sample.bones[bone.name] ?? [];
            const expectedPose = multiply(invertAffine(rig), world);
            const pose = toSceneAxes(poses[index] ?? new Float64Array(16), 1);
            expect(matrixError(pose, expectedPose), `${action.name} ${bone.name} at ${sample.frame}`).toBeLessThan(
              TOLERANCE,
            );
          });
        }
      }
    });

    for (const [name, samples] of Object.entries(expected.clips ?? {})) {
      it(`poses nodes and the skinned mesh as Blender does in ${name}, as far as nodes without shear can`, () => {
        const sampled = clip(scene, name);
        const start = samples[0]?.frame ?? 1;
        for (const sample of samples) {
          const time = (sample.frame - start) / sampled.fps;
          const worlds = worldMatrices(scene, sampled, time);
          const weights = morphWeights(scene, body, sampled, time);
          const unrepresentable = new Set<number>();
          scene.nodes.forEach((node, index) => {
            const world = sample.bones[node.name];
            if (!world) return;
            const parent = scene.nodes[node.parent];
            const parentWorld = parent ? (sample.bones[parent.name] ?? sample.objects[parent.name]?.world) : undefined;
            if (unrepresentable.has(node.parent) || (parentWorld && shear(parentWorld) > 1e-5)) {
              unrepresentable.add(index);
              return;
            }
            expect(matrixError(worlds[index] ?? [], world), `${node.name} at ${sample.frame}`).toBeLessThan(TOLERANCE);
          });
          const sheared = unrepresentable.size > 0;
          for (const [object, { world }] of Object.entries(sample.objects)) {
            if (!scene.nodes.some((node) => node.name === object)) continue;
            const node = nodeIndex(scene, object);
            if (unrepresentable.has(scene.nodes[node]?.parent ?? -1)) continue;
            expect(matrixError(worlds[node] ?? [], world), `${object} at ${sample.frame}`).toBeLessThan(TOLERANCE);
          }
          const blenderBones = worlds.map((world, index) => {
            const own = sample.bones[scene.nodes[index]?.name ?? ""];
            return own ? Float64Array.from(own) : world;
          });
          expect(pointsError(placedSourceVertices(scene, body, blenderBones, weights), sample.body)).toBeLessThan(
            TOLERANCE,
          );
          if (!sheared) {
            expect(
              pointsError(placedSourceVertices(scene, body, worlds, weights), sample.body),
              `Body at ${sample.frame}`,
            ).toBeLessThan(TOLERANCE);
          }
        }
      });
    }

    it("follows Blender's F-Curve evaluation: Bezier, linear, constant, easing, extrapolation and cycles", async () => {
      const actions = readActions(readBlendFile(await decompressBlend(readFixture("rig", version))));
      for (const [name, curves] of Object.entries(expected.curves ?? {})) {
        const action = actions.find((candidate) => candidate.name === name);
        const all = action?.slots.flatMap((slot) => slot.curves) ?? [];
        expect(all).toHaveLength(curves.length);
        for (const expectedCurve of curves) {
          const curve = all.find(
            (candidate) => candidate.path === expectedCurve.path && candidate.index === expectedCurve.index,
          );
          if (!curve) throw new Error(`${name} has no ${expectedCurve.path}[${expectedCurve.index}]`);
          for (const [frame, value] of expectedCurve.samples) {
            expect(
              Math.abs(evaluateFCurve(curve, frame) - value),
              `${name} ${curve.path}[${curve.index}] at ${frame}`,
            ).toBeLessThan(2e-5);
          }
        }
      }
    });
  });

  describe("materials", async () => {
    const scene = await importFixture("materials", version, findInFixtures);
    const material = (name: string) => {
      const found = scene.materials.find((candidate) => candidate.name === name);
      if (!found) throw new RangeError(`No material ${name}.`);
      return found;
    };

    it("reads a Principled BSDF's textures, UV map, mapping, normal map and packed channels", () => {
      const textured = material("Textured");
      expect(textured.baseColor).toEqual([1, 1, 1, 1]);
      expect(textured.baseColorTexture).toMatchObject({ uvSet: 1, wrapU: "clamp", wrapV: "clamp" });
      const transform = textured.baseColorTexture?.transform;
      expect(transform?.offset[0]).toBeCloseTo(0.25);
      expect(transform?.offset[1]).toBeCloseTo(0.5);
      expect(transform?.scale).toEqual([2, 3]);
      expect(transform?.rotation).toBeCloseTo(0.3);
      expect(scene.textures[textured.baseColorTexture?.texture ?? -1]).toMatchObject({
        name: "checker",
        mimeType: "image/png",
        storedPath: "textures/checker.png",
        foundPath: "textures/checker.png",
      });
      expect(textured.normalScale).toBeCloseTo(0.5);
      const normal = scene.textures[textured.normalTexture?.texture ?? -1];
      expect(normal?.foundPath).toBeNull();
      expect(Array.from(normal?.bytes.subarray(0, 4) ?? [])).toEqual([0x89, 0x50, 0x4e, 0x47]);
      expect(scene.textures[textured.metallicRoughnessTexture?.texture ?? -1]?.name).toBe("orm");
      expect([textured.metallic, textured.roughness]).toEqual([1, 1]);
      expect(textured.emissive).toEqual([2, 1, 0]);
    });

    it("copies a material for a mesh whose UV maps put its textures on other UV sets", () => {
      const planes = ["TexturedPlane", "SwappedPlane"].map((name) => scene.meshes[meshIndex(scene, name)]);
      expect(planes.map((plane) => plane?.uvs.map((uv) => uv.name))).toEqual([
        ["UVMap", "Detail"],
        ["Detail", "UVMap"],
      ]);
      const used = planes.map((plane) => scene.materials[plane?.groups[0]?.material ?? -1]);
      expect(used.map((entry) => [entry?.name, entry?.baseColorTexture?.uvSet, entry?.normalTexture?.uvSet])).toEqual([
        ["Textured", 1, 0],
        ["Textured", 0, 1],
      ]);
    });

    it("reads alpha, backface culling and simple shaders", () => {
      expect(material("Glass")).toMatchObject({ alphaMode: "blend", doubleSided: false });
      expect(material("Glass").baseColor[3]).toBeCloseTo(0.4);
      expect(material("Glass").metallic).toBeCloseTo(0.25);
      expect(material("Diffuse")).toMatchObject({ roughness: 1, metallic: 0, doubleSided: true });
      expect(material("Glow").baseColor).toEqual([0, 0, 0, 1]);
      expect(material("Empty")).toMatchObject({ baseColor: [0, 0, 0, 1], metallic: 0, roughness: 1 });
      expect(material("Glow").emissive.map((value) => Math.round(value * 100) / 100)).toEqual([4, 0.8, 0.8]);
      expect(material("Mixed").alphaMode).toBe("blend");
      expect(material("Mixed").baseColor[3]).toBeCloseTo(0.5);
    });

    it("reports images it cannot find and keeps their slots neutral", () => {
      const absent = material("Absent");
      expect(absent.baseColor).toEqual([0.8, 0.8, 0.8, 1]);
      expect(absent.emissive).toEqual([0, 0, 0]);
      expect(absent.missingTextures).toEqual({
        baseColor: "textures/missing.png",
        emissive: "/nonexistent/arcue/absolute.png",
      });
      expect(scene.source.warnings.map((warning) => [warning.code, warning.subject.name]).sort()).toEqual([
        ["material-approximated", "AlphaTint"],
        ["material-approximated", "Blended"],
        ["material-approximated", "Boxed"],
        ["material-approximated", "Cutout"],
        ["material-approximated", "Decal"],
        ["material-approximated", "Displaced"],
        ["material-approximated", "Generated"],
        ["material-approximated", "Glassy"],
        ["material-approximated", "ObjectNormal"],
        ["material-approximated", "Pixelated"],
        ["material-approximated", "Procedural"],
        ["material-approximated", "Projected"],
        ["material-approximated", "RedRough"],
        ["material-approximated", "Smoke"],
        ["material-approximated", "SrgbRough"],
        ["material-approximated", "Textured"],
        ["material-approximated", "Tinted"],
        ["material-approximated", "Vectored"],
        ["texture-not-found", "absolute.png"],
        ["texture-not-found", "missing.png"],
        ["texture-path-absolute", "absolute.png"],
      ]);
    });

    it("warns about textures it cannot map or read as Blender does", () => {
      const approximated = scene.source.warnings.filter((warning) => warning.code === "material-approximated");
      expect(approximated.map((warning) => [warning.subject.name, warning.detail])).toEqual([
        ["Textured", "NoDetailPlane has no UV map Detail, shown with its first"],
        ["Projected", "checker.png uses Generated coordinates, shown with the UV map"],
        ["RedRough", "Roughness comes from the Red channel of orm.png, which the preview leaves out"],
        ["Tinted", "Base color passes checker.png through Hue/Saturation/Value, which the preview leaves out"],
        ["Cutout", "Alpha comes from orm.png, which the preview leaves out"],
        ["Blended", "Mix Shader mixes by nodes, shown half and half; 2 shaders mix, shown as Principled BSDF"],
        ["ObjectNormal", "Its normal map is in object space, which the preview leaves out"],
        ["Generated", "UVGrid is a generated image, which the preview leaves out"],
        ["Glassy", "Its surface is Glass BSDF, shown as a plain shader of its color"],
        ["Decal", "checker.png is clipped at its edges, shown extended"],
        [
          "Procedural",
          "Base color comes from Noise Texture, shown at the value set on the input; Normal comes from Bump, which the preview leaves out",
        ],
        ["Boxed", "checker.png uses Box projection, shown flat"],
        ["SrgbRough", "checker.png is sRGB but holds data, read as Non-Color"],
        ["Vectored", "checker.png uses a Vector Mapping, shown as Point"],
        ["Pixelated", "checker.png uses Closest interpolation, shown Linear"],
        ["AlphaTint", "Base color comes from the alpha of checker.png, which the preview leaves out"],
        ["Displaced", "Displacement comes from Displacement, which the preview leaves out"],
        ["Smoke", "Only its volume renders, which the preview leaves out"],
      ]);
      expect(approximated.every((warning) => warning.subject.kind === "material")).toBe(true);
      expect(material("Muted").baseColorTexture).not.toBeNull();
      expect(material("AlphaTint").baseColorTexture).toBeNull();
      expect(material("RedRough").roughnessTexture).toBeNull();
      expect(material("ObjectNormal").normalTexture).toBeNull();
    });
  });
});

describe.each(VERSIONS)("the scenes fixture from Blender %s", async (version) => {
  const scene = await importFixture("scenes", version);
  const expected = reference("scenes", version);

  it("keeps a child of a bone with relative parenting where Blender shows it at rest", () => {
    const world = worldMatrices(scene)[nodeIndex(scene, "RelChild")] ?? [];
    expect(matrixError(world, expected.objects.RelChild?.world ?? [])).toBeLessThan(TOLERANCE);
  });

  it("leaves out curves in a muted group", async () => {
    const actions = readActions(readBlendFile(await decompressBlend(readFixture("scenes", version))));
    const curves = actions.find((action) => action.name.startsWith("Grouped"))?.slots.flatMap((slot) => slot.curves);
    expect(curves?.map((curve) => [curve.path, curve.muted])).toEqual([["location", true]]);
  });

  it("keeps objects hidden with the eye and starts their parts hidden, unless a level of the part shows", () => {
    expect(scene.parts.map((part) => [part.name, part.hiddenByDefault === true])).toEqual([
      ["Painted", false],
      ["Rigged", false],
      ["Masked", false],
      ["Visible", false],
      ["EyeHidden", true],
      ["Rock", false],
      ["Morph", false],
      ["Follower", false],
      ["Skewed", false],
      ["TuckedAway", true],
      ["SharedPiece", false],
    ]);
  });

  it("shows a collection's objects where the view layer keeps one of the places the collection is in", () => {
    expect(scene.nodes.map((node) => node.name)).toContain("SharedPiece");
  });

  it("warns about what the preview leaves out, down to data linked from other files that shown objects need", () => {
    expect(scene.source.warnings.map((warning) => [warning.code, warning.subject.name, warning.detail])).toEqual([
      ["object-not-shown", "KitInstance", "Arcue does not expand instances of Kit"],
      ["constraint-not-evaluated", "Follower", undefined],
      ["deform-approximated", "RelChild", "It stays with RelRig at rest instead of following bone Holder"],
      ["deform-approximated", "Skewed", "Its parent's scale shears it, which the preview drops"],
      [
        "deform-approximated",
        "Masked",
        "Vertex group Blend limits the Armature modifier; the preview deforms vertices fully",
      ],
      ["unweighted-vertices", "Masked", "Some vertices have no skin weights"],
      ["deform-approximated", "Morph", "Shown in its basis shape"],
      ["modifier-not-applied", "Generated", "Shown without MakeCube"],
      ["object-not-shown", "Wire", "Its mesh has no faces"],
      [
        "library-not-loaded",
        `scenes-${version}.blend`,
        "From other .blend files: collections LibraryKit; objects Borrowed, LibraryRock, LibraryRig; materials LibraryPaint; actions LibraryWave",
      ],
      [
        "deform-approximated",
        "SpinnerAction",
        "Keys on rotation mode are left out; each object and bone keeps the mode it was saved with",
      ],
    ]);
    expect(scene.meshes[meshIndex(scene, "Morph")]?.morphTargets).toEqual([]);
    const masked = scene.source.warnings.find(
      (warning) => warning.code === "deform-approximated" && warning.subject.name === "Masked",
    );
    expect(masked?.message).toBe("Preserve volume shown as linear skinning: Masked; Armature mask not applied: Masked");
    expect(scene.materials[scene.meshes[meshIndex(scene, "Painted")]?.groups[0]?.material ?? -1]?.name).toBe("Default");
  });
});

describe("the Stone Striker's source file", async () => {
  const bytes = new Uint8Array(readFileSync(`${repositoryDir}tools/samples/sources/stone-striker.blend`));
  const scene = await importBytes("stone-striker.blend", bytes);

  it("holds the rig, the three LODs and every action", () => {
    expect(scene.meshes.map((mesh) => [mesh.name, mesh.sourceVertexCount])).toEqual([
      ["Body_LOD0", 5374],
      ["Body_LOD1", 2691],
      ["Body_LOD2", 1349],
    ]);
    expect(scene.parts.map((part) => [part.id, part.levels.length])).toEqual([["StoneResonatorRig/Body_LOD0", 3]]);
    expect(scene.clips).toHaveLength(13);
    expect(clip(scene, "Walk")).toMatchObject({ fps: 60, frameCount: 61, keyedEveryFrame: true });
    expect(scene.textures.map((texture) => [texture.name, texture.mimeType])).toEqual([
      ["StoneStriker-BaseColor", "image/jpeg"],
    ]);
    expect(scene.source.warnings).toEqual([]);
  });
});

describe("the Stone Striker against the FBX Blender exported from it", async () => {
  const blend = await importBytes(
    "stone-striker.blend",
    new Uint8Array(readFileSync(`${repositoryDir}tools/samples/sources/stone-striker.blend`)),
  );
  const fbx = await fbxImporter.import({
    fileName: "stone-striker.fbx",
    bytes: new Uint8Array(readFileSync(`${repositoryDir}samples/stone-striker.fbx`)),
    readFile: () => Promise.resolve(null),
    findFile: () => Promise.resolve(null),
    locateFile: () => Promise.resolve(null),
  });

  it("keeps the same vertices, triangles and rendered vertices", () => {
    for (const mesh of blend.meshes) {
      const exported = fbx.meshes.find((candidate) => candidate.name === mesh.name);
      expect(exported?.sourceVertexCount).toBe(mesh.sourceVertexCount);
      expect(exported?.indices.length).toBe(mesh.indices.length);
      expect(exported?.sourceVertex.length).toBe(mesh.sourceVertex.length);
      expect(pointsError(mesh.restPositions, exported?.restPositions ?? [])).toBeLessThan(1e-6);
    }
  });

  it("walks as the exported take does", () => {
    const walk = clip(blend, "Walk");
    const take = clip(fbx, "StoneResonatorRig|Walk");
    expect(walk.frameCount).toBe(take.frameCount);
    const lod = meshIndex(blend, "Body_LOD0");
    const exported = meshIndex(fbx, "Body_LOD0");
    for (const frame of [0, 13, 30, 47, 60]) {
      const time = frame / walk.fps;
      const ours = placedSourceVertices(blend, lod, worldMatrices(blend, walk, time), []);
      const theirs = placedSourceVertices(fbx, exported, worldMatrices(fbx, take, time), []);
      expect(pointsError(ours, theirs), `frame ${frame}`).toBeLessThan(1e-5);
    }
  });
});

describe("reading", () => {
  it("reads a file compressed with gzip, as Blender 2.x saved them", async () => {
    const [version] = VERSIONS;
    const plain = await importBytes("features.blend", readFixture("features", version));
    const zipped = await importBytes("features.blend", gzipSync(await decompressed(version)));
    expect(zipped.meshes.map((mesh) => mesh.sourceVertexCount)).toEqual(
      plain.meshes.map((mesh) => mesh.sourceVertexCount),
    );
  });

  it("refuses bytes that are not a Blender file", async () => {
    const request = {
      fileName: "notes.blend",
      bytes: new TextEncoder().encode("not a blend file"),
      readFile: () => Promise.resolve(null),
      findFile: () => Promise.resolve(null),
      locateFile: () => Promise.resolve(null),
    };
    await expect(blendImporter.import(request)).rejects.toMatchObject({ code: "invalid-input" });
  });

  it("refuses a file from before Blender 2.80, which has no collections to read", async () => {
    const bytes = await decompressed("4.2");
    bytes.set(new TextEncoder().encode("279"), 9);
    await expect(importBytes("old.blend", bytes)).rejects.toMatchObject({
      code: "invalid-input",
      message:
        "old.blend was saved by Blender 2.79. Arcue opens files from Blender 2.80 on; save it in a newer Blender.",
    });
  });

  it("leaves out a mesh that counts more vertices than the file holds, with a warning", async () => {
    const bytes = await decompressed(VERSIONS[1]);
    const file = readBlendFile(bytes);
    const mesh = datablocks(file, "ME").find((candidate) => idName(candidate) === "PropMesh") ?? null;
    const field = mesh?.field("totvert");
    if (!mesh || !field) throw new Error("The features fixture has no PropMesh");
    file.view.setInt32(mesh.offset + field.offset, 2 ** 30, file.little);
    const scene = await importBytes("huge.blend", bytes);
    expect(scene.source.warnings).toContainEqual(
      expect.objectContaining({
        code: "invalid-data",
        detail: "Mesh PropMesh counts more elements than the file holds",
      }),
    );
  });

  it("refuses a file that is cut short", async () => {
    const whole = await decompressed(VERSIONS[1]);
    await expect(importBytes("cut.blend", whole.subarray(0, whole.length / 2))).rejects.toMatchObject({
      code: "invalid-input",
    });
  });
});

function decompressed(version: (typeof VERSIONS)[number]): Promise<Uint8Array> {
  return decompressBlend(readFixture("features", version));
}
