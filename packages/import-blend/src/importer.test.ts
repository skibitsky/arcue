import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { parsePosePath, readActions } from "@arcue/blend/internal/anim/actions";
import { evaluateFCurve } from "@arcue/blend/internal/anim/fcurve";
import { decompressBlend } from "@arcue/blend/internal/blend/decompress";
import { readBlendFile } from "@arcue/blend/internal/blend/file";
import { datablocks, idName } from "@arcue/blend/internal/blend/ids";
import { toSceneAxes } from "@arcue/blend/internal/math";
import { poseMatrices } from "@arcue/blend/internal/scene/armature";
import { buildScene } from "@arcue/blend/internal/scene/build";
import { cloneValues, setTransformProperty } from "@arcue/blend/internal/scene/transforms";
import { fbxImporter } from "@arcue/import-fbx";
import type { Clip, Mesh, SceneDescription } from "@arcue/scene";
import { describe, expect, it } from "vitest";
import {
  findInFixtures,
  fixtureFaces,
  fixturesDir,
  importBytes,
  importFixture,
  type MeshReference,
  type Reference,
  readFixture,
  reference,
  repositoryDir,
  VERSIONS,
} from "../test/fixtures";
import {
  cornerMismatches,
  invertAffine,
  matrixError,
  morphWeights,
  multiply,
  placedSourceVertices,
  pointsError,
  shear,
  strongestInfluences,
  worldMatrices,
} from "../test/geometry";
import { blendImporter } from "./importer";

const TOLERANCE = 1e-4;
/**
 * Meshes of the features fixture whose Geometry Nodes use the nodes of Smooth by Angle to do something else, which its
 * reference leaves out.
 */
const UNAPPLIED_SMOOTHING = [
  "LookalikeSmooth",
  "InvertedAutoSmooth",
  "InactiveOutputSmooth",
  "FloatOutputSmooth",
  "SignedAngleSmooth",
  "IntegerAngleSmooth",
  "ConstantAngleSmooth",
  "EdgesOnFacesSmooth",
  "FacesOnEdgesSmooth",
  "FlatFacesSmooth",
  "SubdividedSmooth",
  "AngleFirstSmooth",
  "HalfIgnoreSmooth",
  "AlwaysIgnoreSmooth",
];

/** The render color attribute's value at each loop, four values a loop, or undefined for a mesh without one. */
function loopColors(mesh: MeshReference): number[] | undefined {
  const colors = mesh.colors;
  if (!colors) return undefined;
  return mesh.corners.flatMap(([vertex], loop) => {
    const element = colors.domain === "POINT" ? vertex : loop;
    return colors.values.slice(element * 4, element * 4 + 4);
  });
}

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

    it("applies Smooth by Angle, and warns only about groups made of its nodes that do something else", () => {
      expect(scene.source.warnings.map((entry) => [entry.code, entry.message])).toEqual(
        UNAPPLIED_SMOOTHING.map((name) => ["modifier-not-applied", `Modifiers not applied: ${name}`]),
      );
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

    it("draws Blender's loop triangles, each corner with the normal, UVs and color of Blender's face corner", async () => {
      expect(Object.keys(expected.meshes.Polygons?.uvs ?? {})).toEqual(["UVMap", "Detail"]);
      const faces = await fixtureFaces("features", version);
      for (const [name, mesh] of Object.entries(expected.meshes)) {
        const built = scene.meshes[meshIndex(scene, name)];
        const meshFaces = faces.get(name);
        if (!built || !meshFaces) throw new Error(name);
        const loopVertices = mesh.corners.map(([vertex]) => vertex);
        expect(Array.from(meshFaces.cornerVerts), name).toEqual(loopVertices);
        const drawn = {
          loopTriangles: mesh.triangleLoops,
          loopVertices,
          normals: mesh.corners.map((corner) => corner.slice(1)),
          uvs: mesh.uvs,
          colors: loopColors(mesh),
        };
        expect(cornerMismatches(built, drawn), name).toEqual([]);
        expect(new Set(drawn.loopTriangles.flat()).size, name).toBe(loopVertices.length);
      }
    });

    it("reads UV maps, the render color attribute and material slots linked to the mesh or the object", () => {
      const polygons = scene.meshes[meshIndex(scene, "Polygons")];
      const expectedPolygons = expected.meshes.Polygons;
      if (!polygons || !expectedPolygons?.colors) throw new Error("no Polygons");
      expect(polygons.uvs.map((uv) => uv.name)).toEqual(expectedPolygons.uvMaps);
      expect(polygons.groups.map((group) => scene.materials[group.material]?.name)).toEqual([
        "Red",
        "Default",
        "Blue",
        "Red",
        "Default",
        "Blue",
      ]);
      expect(polygons.colors).not.toBeNull();
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

  describe.each(["rig", "rig-unit-scale"])("%s", async (fixture) => {
    const scene = await importFixture(fixture, version);
    const expected = reference(fixture, version);
    const body = meshIndex(scene, "Body");

    it("reads the scene's unit scale", () => {
      expect(scene.source.originalSpace.unitMeters).toBe(expected.unitScale);
    });

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

    it("makes a clip of every action, assigned or not, over its frame range, and one of the scene's", () => {
      expect(scene.clips.map((entry) => [entry.name, entry.frameCount, entry.fps])).toEqual([
        ["Ease", 61, 30],
        ["Partial", 9, 30],
        ["Pulse", 7, 30],
        ["Spin", 10, 30],
        ["Stretch", 9, 30],
        ["Swell", 8, 30],
        ["Wave", 20, 30],
        ["Scene", 250, 30],
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
      const file = readBlendFile(await decompressBlend(readFixture(fixture, version)));
      const built = buildScene(file);
      const armature = built.objects.find((record) => record.object.name === "Rig")?.armature;
      if (!armature) throw new Error("no Rig");
      for (const action of readActions(file)) {
        const curves = action.slots.flatMap((slot) => slot.curves);
        if (!curves.some((curve) => parsePosePath(curve.path))) continue;
        for (const sample of expected.clips?.[action.name] ?? []) {
          const channels = armature.pose.map((saved) => cloneValues(saved));
          for (const curve of curves) {
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
            const pose = toSceneAxes(poses[index] ?? new Float64Array(16), expected.unitScale);
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

    it.runIf(expected.curves !== undefined)(
      "follows Blender's F-Curve evaluation: Bezier, linear, constant, easing, extrapolation and cycles",
      async () => {
        const actions = readActions(readBlendFile(await decompressBlend(readFixture(fixture, version))));
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
      },
    );

    it("leaves out the modifiers of a curve that turns them off", async () => {
      const file = readBlendFile(await decompressBlend(readFixture(fixture, version)));
      const modified = (actions: ReturnType<typeof readActions>) =>
        actions.flatMap((action) => action.slots.flatMap((slot) => slot.curves)).filter((c) => c.modifiers.length > 0);
      expect(modified(readActions(file)).map((curve) => curve.path)).toEqual(
        Array(3).fill('pose.bones["Spine"].rotation_euler'),
      );
      for (const block of file.blocksWithCode("DATA").filter((candidate) => candidate.struct?.type === "FCurve")) {
        for (const curve of file.elements(block)) {
          const flag = curve.field("flag");
          if (flag) file.view.setInt16(curve.offset + flag.offset, curve.number("flag") | (1 << 6), file.little);
        }
      }
      expect(modified(readActions(file))).toEqual([]);
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
      expect(material("Glass")).toMatchObject({ alphaMode: "hash", doubleSided: false });
      expect(material("Glass").baseColor[3]).toBeCloseTo(0.4);
      expect(material("Glass").metallic).toBeCloseTo(0.25);
      expect(material("Diffuse")).toMatchObject({ roughness: 1, metallic: 0, doubleSided: true });
      expect(material("Glow").baseColor).toEqual([0, 0, 0, 1]);
      expect(material("Empty")).toMatchObject({ baseColor: [0, 0, 0, 1], metallic: 0, roughness: 1 });
      expect(material("Glow").emissive.map((value) => Math.round(value * 100) / 100)).toEqual([4, 0.8, 0.8]);
      expect(material("Mixed").alphaMode).toBe("hash");
      expect(material("Mixed").baseColor[3]).toBeCloseTo(0.5);
    });

    it.runIf(version === "4.2")("shows a material whose Use Nodes is off by its own color, as Blender 4.2 does", () => {
      const expected = reference("materials", version) as Reference & { nodeless?: unknown };
      expect(expected.nodeless).toEqual({ diffuse: [0, 1, 0, 1], useNodes: false });
      expect(material("Nodeless").baseColor).toEqual([0, 1, 0, 1]);
      expect(scene.source.warnings.filter((warning) => warning.subject.name === "Nodeless")).toEqual([]);
    });

    it("clips at an Alpha Clip threshold of 0 as Blender does, dropping only texels with no alpha", async () => {
      const bytes = await decompressBlend(readFixture("materials", version));
      const file = readBlendFile(bytes);
      const glass = datablocks(file, "MA").find((candidate) => idName(candidate) === "Glass");
      const method = glass?.field("blend_method");
      const threshold = glass?.field("alpha_threshold");
      if (!glass || !method || !threshold) throw new Error("No Glass blend method");
      file.view.setInt8(glass.offset + method.offset, 3);
      file.view.setFloat32(glass.offset + threshold.offset, 0, file.little);
      const clipped = await importBytes("clipped.blend", bytes, findInFixtures);
      const cutout = clipped.materials.find((candidate) => candidate.name === "Glass");
      expect(cutout?.alphaMode).toBe("mask");
      expect(cutout?.alphaCutoff).toBeGreaterThan(0);
      expect(cutout?.alphaCutoff).toBeLessThan(1 / 255);
    });

    it("reports images it cannot find and keeps their slots neutral", () => {
      const absent = material("Absent");
      expect(absent.baseColor).toEqual([0.8, 0.8, 0.8, 1]);
      expect(absent.emissive).toEqual([0, 0, 0]);
      expect(absent.missingTextures).toEqual({
        baseColor: "textures/missing.png",
        emissive: "/nonexistent/arcue/absolute.png",
      });
      const sampling = { uvSet: 0, wrapU: "repeat", wrapV: "repeat", transform: null, alpha: "premultiply" };
      expect(absent.missingTextureSampling).toEqual({ baseColor: sampling, emissive: sampling });
      expect(scene.source.warnings.map((warning) => [warning.code, warning.subject.name]).sort()).toEqual([
        ["material-approximated", "AlphaTint"],
        ["material-approximated", "Blended"],
        ["material-approximated", "Boxed"],
        ["material-approximated", "Clear"],
        ["material-approximated", "Cutout"],
        ["material-approximated", "Decal"],
        ["material-approximated", "Dialed"],
        ["material-approximated", "Displaced"],
        ["material-approximated", "Frosted"],
        ["material-approximated", "Generated"],
        ["material-approximated", "Glassy"],
        ["material-approximated", "Masked"],
        ["material-approximated", "ObjectNormal"],
        ["material-approximated", "Pixelated"],
        ["material-approximated", "Procedural"],
        ["material-approximated", "Projected"],
        ["material-approximated", "RedRough"],
        ["material-approximated", "Smart"],
        ["material-approximated", "Smoke"],
        ["material-approximated", "TangentDetail"],
        ["material-approximated", "Textured"],
        ["material-approximated", "Tinted"],
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
        ["Pixelated", "checker.png uses Closest interpolation, shown Linear"],
        ["AlphaTint", "Base color comes from the alpha of checker.png, which the preview leaves out"],
        ["Displaced", "Displacement comes from Displacement, which the preview leaves out"],
        ["Smoke", "Its volume comes from Principled Volume, which the preview leaves out"],
        ["Smart", "checker.png uses Smart interpolation, shown Linear"],
        ["Clear", "Transmission is 1, which the preview leaves out"],
        ["Frosted", "Transmission comes from Noise Texture, which the preview leaves out"],
        ["Dialed", "Transmission is 0.25, which the preview leaves out"],
        ["Masked", "Transmission comes from checker.png, which the preview leaves out"],
        ["TangentDetail", "Its normal map takes tangents from UV map Detail, shown with those of UVMap"],
      ]);
      expect(approximated.every((warning) => warning.subject.kind === "material")).toBe(true);
      expect(material("Muted").baseColorTexture).not.toBeNull();
      expect(material("AlphaTint").baseColorTexture).toBeNull();
      expect(material("Vectored").baseColorTexture?.transform).toBeNull();
      const tilted = material("Tilted").baseColorTexture?.transform;
      expect(tilted?.scale[0]).toBeCloseTo(1);
      expect(tilted?.scale[1]).toBeCloseTo(Math.cos(0.3));
      expect(material("Pulsing").emissive).toEqual([2, 1, 0]);
      expect(material("Smoke")).toMatchObject({ baseColor: [0, 0, 0, 0], alphaMode: "hash" });
      expect(material("SrgbRough").roughnessTexture?.colorSpace).toBe("srgb");
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
      ["object-not-shown", "KitInstance", "Instances of Kit are not expanded"],
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
      ["constraint-not-evaluated", "Follower", undefined],
    ]);
    expect(scene.meshes[meshIndex(scene, "Morph")]?.morphTargets).toEqual([]);
    const masked = scene.source.warnings.find(
      (warning) => warning.code === "deform-approximated" && warning.subject.name === "Masked",
    );
    expect(masked?.message).toBe("Preserve volume shown as linear skinning: Masked; Armature mask not applied: Masked");
    expect(scene.materials[scene.meshes[meshIndex(scene, "Painted")]?.groups[0]?.material ?? -1]?.name).toBe("Default");
  });
});

interface HelpersReference {
  helpers: Record<
    string,
    { displayType: string; hideRender: boolean; drawsSurface: boolean; modifiers: [string, string][] }
  >;
}

describe.each(VERSIONS)("the helpers fixture from Blender %s", async (version) => {
  const scene = await importFixture("helpers", version);
  const expected: HelpersReference = JSON.parse(readFileSync(`${fixturesDir}helpers-${version}.json`, "utf8"));

  it("starts hidden the parts of meshes Blender draws as wire or bounds, and shows those drawn solid or textured", () => {
    const hidden = Object.fromEntries(scene.parts.map((part) => [part.name, part.hiddenByDefault === true]));
    expect(hidden).toEqual({
      Body: false,
      Cage: true,
      Base: false,
      Cutter: true,
      Proxy: true,
      RenderOff: false,
      Textured: false,
    });
    for (const [name, helper] of Object.entries(expected.helpers)) {
      expect(hidden[name], `${name} drawn ${helper.displayType}`).toBe(!helper.drawsSurface);
    }
    expect(expected.helpers.RenderOff).toMatchObject({ displayType: "SOLID", hideRender: true });
  });

  it("keeps every helper as a node and warns only about the modifiers that use them", () => {
    expect(scene.nodes.map((node) => node.name).sort()).toEqual(Object.keys(expected.helpers).sort());
    expect(scene.source.warnings.map((warning) => [warning.code, warning.subject.name, warning.detail])).toEqual([
      ["modifier-not-applied", "Body", "Shown without MeshDeform"],
      ["modifier-not-applied", "Base", "Shown without Boolean"],
    ]);
    expect([expected.helpers.Body?.modifiers, expected.helpers.Base?.modifiers]).toEqual([
      [["MeshDeform", "MESH_DEFORM"]],
      [["Boolean", "BOOLEAN"]],
    ]);
  });
});

interface LibrariesReference {
  libraries: { name: string; filepath: string; packed: boolean }[];
}

describe.each(VERSIONS)("the libraries fixture from Blender %s", async (version) => {
  const scene = await importFixture("libraries", version);
  const expected: LibrariesReference = JSON.parse(readFileSync(`${fixturesDir}libraries-${version}.json`, "utf8"));

  it("names data from another file apart from data of a file Pack Linked Libraries packed into this one", () => {
    expect(expected.libraries).toEqual([
      { name: "charlib.blend", filepath: "//charlib.blend", packed: true },
      { name: "kitlib.blend", filepath: "//kitlib.blend", packed: false },
    ]);
    const linked = scene.source.warnings.filter((warning) => warning.code === "library-not-loaded");
    expect(linked.map((warning) => [warning.message, warning.detail])).toEqual([
      [
        `Linked data not shown: libraries-${version}.blend`,
        "From other .blend files: collections Kit. From .blend files packed in this one, which are not read: collections Char",
      ],
    ]);
  });
});

interface PackedReference {
  objects: Record<string, { type: string; world: number[] }>;
  meshes: Record<string, MeshReference>;
  materials: Record<string, number[]>;
  clips: Record<string, { frame: number; objects: Record<string, { type: string; world: number[] }> }[]>;
}

describe("the packed fixture from Blender 5.2", async () => {
  const scene = await importFixture("packed", "5.2");
  const expected: PackedReference = JSON.parse(readFileSync(`${fixturesDir}packed-5.2.json`, "utf8"));

  it("shows data packed with its library where Blender shows it, without a linked-data warning", () => {
    expect(scene.nodes.map((node) => node.name)).toEqual(expect.arrayContaining(["Body", "CharPart", "LocalBox"]));
    const worlds = worldMatrices(scene);
    for (const [name, object] of Object.entries(expected.objects)) {
      expect(matrixError(worlds[nodeIndex(scene, name)] ?? [], object.world), name).toBeLessThan(TOLERANCE);
    }
    for (const [name, mesh] of Object.entries(expected.meshes)) {
      const built = scene.meshes[meshIndex(scene, name)];
      expect(pointsError(built?.restPositions ?? [], mesh.restPositions), name).toBeLessThan(TOLERANCE);
    }
    expect(scene.source.warnings.filter((warning) => warning.code === "library-not-loaded")).toEqual([]);
  });

  it("uses the packed material on the packed object and on a local one", () => {
    for (const name of ["Body", "LocalBox"]) {
      const shown = scene.meshes[meshIndex(scene, name)]?.groups.map((group) => scene.materials[group.material]);
      expect(
        shown?.map((entry) => entry?.name),
        name,
      ).toEqual(["Skin"]);
      const color = shown?.[0]?.baseColor.map((channel) => Math.round(channel * 1e6) / 1e6);
      expect(color, name).toEqual(expected.materials.Skin);
    }
  });

  it("plays the packed actions as Blender does", () => {
    for (const [name, object] of [
      ["BodyMove", "Body"],
      ["Wave", "CharPart"],
    ] as const) {
      const sampled = clip(scene, name);
      const samples = expected.clips[name] ?? [];
      expect(samples.length, name).toBeGreaterThan(0);
      const start = samples[0]?.frame ?? 1;
      for (const sample of samples) {
        const worlds = worldMatrices(scene, sampled, (sample.frame - start) / sampled.fps);
        expect(
          matrixError(worlds[nodeIndex(scene, object)] ?? [], sample.objects[object]?.world ?? []),
          `${object} at ${sample.frame}`,
        ).toBeLessThan(TOLERANCE);
      }
    }
  });
});

interface ParentsReference extends Reference {
  /** Each mesh's vertices as Blender evaluates them with its shape keys, in scene space. */
  shaped: Record<string, number[]>;
}

describe.each(VERSIONS)("the parents fixture from Blender %s", async (version) => {
  const scene = await importFixture("parents", version);
  const expected: ParentsReference = JSON.parse(readFileSync(`${fixturesDir}parents-${version}.json`, "utf8"));
  const worlds = worldMatrices(scene);
  const parentName = (name: string) => scene.nodes[scene.nodes[nodeIndex(scene, name)]?.parent ?? -1]?.name ?? null;

  it("places objects parented to vertices where Blender does, under the parent or at the root to avoid a shear", () => {
    for (const name of ["Pin", "ChildTri", "WidePin", "WideTri", "LiftPin"]) {
      expect(matrixError(worlds[nodeIndex(scene, name)] ?? [], expected.objects[name]?.world ?? []), name).toBeLessThan(
        TOLERANCE,
      );
    }
    for (const name of ["ChildTri", "WideTri"]) {
      const placed = placedSourceVertices(scene, meshIndex(scene, name), worlds, []);
      expect(pointsError(placed, expected.meshes[name]?.restPositions ?? []), name).toBeLessThan(TOLERANCE);
    }
    const lifted = meshIndex(scene, "LiftPlate");
    const quad = [0, 1, 2, 3];
    expect([...new Set(scene.meshes[lifted]?.sourceVertex)].sort()).toEqual(quad);
    const shaped = placedSourceVertices(scene, lifted, worlds, morphWeights(scene, lifted, null, 0));
    const expectedShape = expected.shaped.LiftPlate ?? [];
    expect(pointsError(shaped.subarray(0, quad.length * 3), expectedShape.slice(0, quad.length * 3))).toBeLessThan(
      TOLERANCE,
    );
    expect(["Pin", "ChildTri", "WidePin", "WideTri", "LiftPin"].map(parentName)).toEqual([
      "Plate",
      "Plate",
      null,
      null,
      "LiftPlate",
    ]);
  });

  it("says where each vertex-parented object hangs, and reports no damaged data or shear", () => {
    const warnings = scene.source.warnings;
    const vertexParents = warnings.filter((warning) => warning.message.startsWith("Vertex parent not followed"));
    expect(vertexParents.map((warning) => [warning.code, warning.subject.name, warning.detail])).toEqual([
      ["deform-approximated", "Pin", "It keeps its rest offset from Plate instead of following its vertices"],
      ["deform-approximated", "ChildTri", "It keeps its rest offset from Plate instead of following its vertices"],
      ["deform-approximated", "WidePin", "It stays where it is at rest instead of following the vertices of WidePlate"],
      ["deform-approximated", "WideTri", "It stays where it is at rest instead of following the vertices of WidePlate"],
      ["deform-approximated", "LiftPin", "It keeps its rest offset from LiftPlate instead of following its vertices"],
    ]);
    expect(warnings.filter((warning) => warning.code === "invalid-data")).toEqual([]);
    expect(warnings.filter((warning) => warning.message.startsWith("Shear not shown"))).toEqual([]);
  });

  it("builds a mesh that objects share once, and places each object's copy where it is", () => {
    const [plate, copy] = ["Plate", "PlateCopy"].map((name) => scene.meshes[meshIndex(scene, name)]);
    expect(copy?.positions).toBe(plate?.positions);
    expect(copy?.indices).toBe(plate?.indices);
    for (const [name, mesh] of [
      ["Plate", plate],
      ["PlateCopy", copy],
    ] as const) {
      expect(pointsError(mesh?.restPositions ?? [], expected.meshes[name]?.restPositions ?? []), name).toBeLessThan(
        TOLERANCE,
      );
    }
  });

  it("shows the objects of the scene's background set", () => {
    const world = worlds[nodeIndex(scene, "BackgroundCube")] ?? [];
    expect(matrixError(world, expected.objects.BackgroundCube?.world ?? [])).toBeLessThan(TOLERANCE);
    const cube = scene.meshes[meshIndex(scene, "BackgroundCube")];
    expect(pointsError(cube?.restPositions ?? [], expected.meshes.BackgroundCube?.restPositions ?? [])).toBeLessThan(
      TOLERANCE,
    );
  });

  it("shows a key that Shape Key Lock pins in its own shape, relative to another key, whatever its value", () => {
    const sheet = meshIndex(scene, "Sheet");
    expect(scene.meshes[sheet]?.morphTargets.map((target) => [target.name, target.defaultWeight])).toEqual([
      ["Dome", 1],
      ["Tilt", 1],
    ]);
    const placed = placedSourceVertices(scene, sheet, worlds, morphWeights(scene, sheet, null, 0));
    expect(pointsError(placed, expected.shaped.Sheet ?? [])).toBeLessThan(TOLERANCE);
    const node = nodeIndex(scene, "Sheet");
    const weights = scene.clips.flatMap((entry) =>
      entry.tracks.filter((track) => track.node === node && track.property === "weights"),
    );
    expect(weights).toEqual([]);
    expect(scene.source.warnings).toContainEqual(
      expect.objectContaining({
        code: "deform-approximated",
        message: "Shape key pinned: Sheet",
        detail: "Shows Tilt alone, as Blender does, so key values and their animation change nothing",
      }),
    );
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

  it("skins each rendered vertex with the four strongest bones of its source vertex, scaled to sum to 1", () => {
    for (const mesh of scene.meshes) {
      const expected = strongestInfluences(mesh, scene.skeletons[mesh.skeleton ?? -1]?.joints.length ?? 0);
      expect(Array.from(mesh.joints ?? []), mesh.name).toEqual(Array.from(expected.joints));
      const worst = Math.max(
        ...Array.from(expected.weights, (weight, k) => Math.abs(weight - (mesh.weights?.[k] ?? 0))),
      );
      expect(worst, mesh.name).toBeLessThan(1e-6);
    }
  });
});

/** Each source vertex's UVs in the mesh's first UV map, one entry for each rendered vertex. */
function uvsByVertex(mesh: Mesh): string[][] {
  const result = Array.from({ length: mesh.sourceVertexCount }, (): string[] => []);
  const values = mesh.uvs[0]?.values ?? new Float32Array(0);
  mesh.sourceVertex.forEach((vertex, rendered) => {
    result[vertex]?.push(`${values[rendered * 2]} ${values[rendered * 2 + 1]}`);
  });
  return result.map((uvs) => uvs.sort());
}

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

  it("gives each vertex the UVs the FBX gives it", () => {
    for (const mesh of blend.meshes) {
      const exported = fbx.meshes.find((candidate) => candidate.name === mesh.name);
      if (!exported) throw new Error(`The FBX has no ${mesh.name}.`);
      expect(mesh.uvs.map((uv) => uv.name)).toEqual(["UVMap"]);
      expect(uvsByVertex(mesh), mesh.name).toEqual(uvsByVertex(exported));
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
        detail: "Mesh PropMesh counts 1073741824 vertices but holds 8",
      }),
    );
  });

  it("refuses a compressed file that expands past the limit", async () => {
    const zstd = readFixture("features", VERSIONS[1]);
    const gzip = gzipSync(await decompressed(VERSIONS[1]));
    for (const bytes of [zstd, gzip]) {
      await expect(decompressBlend(bytes, 1000)).rejects.toThrow("it expands to more than 1000 bytes");
    }
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
