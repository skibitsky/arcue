import { ArcueError } from "@arcue/protocol";
import type {
  Clip,
  Importer,
  ImportRequest,
  Material,
  Mesh,
  SceneDescription,
  SceneNode,
  TextureRef,
  TextureResolver,
  TextureSampling,
  TextureSlot,
} from "@arcue/scene";
import {
  buildNodePaths,
  clipNames,
  createTextureResolver,
  defaultViewBounds,
  describeParts,
  displayNames,
  frameCountFor,
  isKeyedEveryFrame,
  mergeKeyTimes,
  topologyFingerprint,
  unshownUvSetWarnings,
} from "@arcue/scene";
import type { ParsedClip, ParsedFbx, WireMaterial, WireTextureRef } from "./decode";
import { FbxParseError } from "./decode";
import { parseFbx } from "./parser";
import { parserWarnings, rootTransformWarnings } from "./warnings";

function buildNodes(parsed: ParsedFbx): SceneNode[] {
  const paths = buildNodePaths(parsed.nodes);
  return parsed.nodes.map((node, index) => ({
    name: node.name,
    path: paths[index] ?? node.name,
    parent: node.parent,
    kind: node.kind,
    translation: node.translation,
    rotation: node.rotation,
    scale: node.scale,
    mesh: node.mesh,
  }));
}

function uvSetIndex(meshes: readonly Mesh[], material: number, uvSet: string): number {
  if (uvSet === "") return 0;
  for (const mesh of meshes) {
    if (!mesh.groups.some((group) => group.material === material)) continue;
    const index = mesh.uvs.findIndex((uv) => uv.name === uvSet);
    if (index !== -1) return index;
  }
  return 0;
}

async function buildMaterials(
  materials: readonly WireMaterial[],
  meshes: readonly Mesh[],
  textures: TextureResolver,
): Promise<Material[]> {
  const result: Material[] = [];
  for (const [index, material] of materials.entries()) {
    const missingTextures: Partial<Record<TextureSlot, string>> = {};
    const missingTextureSampling: Partial<Record<TextureSlot, TextureSampling>> = {};
    const ref = async (wire: WireTextureRef | null | undefined, slot?: TextureSlot): Promise<TextureRef | null> => {
      if (!wire) return null;
      const sampling: TextureSampling = {
        uvSet: uvSetIndex(meshes, index, wire.uvSet),
        wrapU: wire.wrapU,
        wrapV: wire.wrapV,
        transform: wire.transform,
      };
      const texture = await textures.resolve(wire.file, material.name, slot);
      if (texture === null) {
        if (slot) {
          missingTextures[slot] = textures.storedPath(wire.file);
          missingTextureSampling[slot] = sampling;
        }
        return null;
      }
      return { texture, ...sampling };
    };
    const built: Material = {
      name: material.name,
      baseColor: material.baseColor,
      baseColorTexture: await ref(material.baseColorTexture, "baseColor"),
      metallic: material.metallic,
      roughness: material.roughness,
      metallicRoughnessTexture: null,
      roughnessTexture: await ref(material.roughnessTexture, "roughness"),
      metalnessTexture: await ref(material.metalnessTexture, "metalness"),
      normalTexture: await ref(material.normalTexture, "normal"),
      normalScale: 1,
      occlusionTexture: await ref(material.occlusionTexture),
      emissive: material.emissive,
      emissiveTexture: await ref(material.emissiveTexture, "emissive"),
      alphaMode: material.alphaMode,
      alphaCutoff: 0.5,
      doubleSided: material.doubleSided,
    };
    if (Object.keys(missingTextures).length > 0) {
      built.missingTextures = missingTextures;
      built.missingTextureSampling = missingTextureSampling;
    }
    result.push(built);
  }
  return result;
}

function buildClips(clips: readonly ParsedClip[], fps: number): Clip[] {
  const names = clipNames(clips.map((clip) => clip.name));
  const display = displayNames(names);
  return clips.map((clip, index) => {
    const frameCount = frameCountFor(clip.duration, fps);
    return {
      name: names[index] ?? clip.name,
      displayName: display[index] ?? clip.name,
      fps,
      duration: clip.duration,
      frameCount,
      tracks: clip.tracks,
      keyTimes: mergeKeyTimes(clip.curveTimes),
      keyedEveryFrame: isKeyedEveryFrame(clip.curveTimes, fps, frameCount),
    };
  });
}

async function buildScene(parsed: ParsedFbx, request: ImportRequest): Promise<SceneDescription> {
  const meshes: Mesh[] = parsed.meshes.map((mesh) => ({ ...mesh, topology: topologyFingerprint(mesh) }));
  const textures = createTextureResolver(parsed.textureFiles, request.findFile, request.locateFile);
  const materials = await buildMaterials(parsed.materials, meshes, textures);
  const nodes = buildNodes(parsed);
  const lodGroups = new Set(parsed.nodes.flatMap((node, index) => (node.lodGroup ? [index] : [])));
  const parts = describeParts(nodes, lodGroups);
  return {
    source: {
      format: "fbx",
      exporter: parsed.exporter,
      fps: parsed.fps,
      originalSpace: parsed.originalSpace,
      conversion: parsed.conversion,
      warnings: [
        ...parserWarnings(parsed.warnings, request.fileName),
        ...rootTransformWarnings(parsed.nodes, parsed.originalSpace),
        ...(await textures.warnings()),
        ...unshownUvSetWarnings(materials),
      ],
    },
    nodes,
    meshes,
    skeletons: parsed.skeletons,
    materials,
    textures: textures.textures,
    clips: buildClips(parsed.clips, parsed.fps),
    parts,
    bounds: defaultViewBounds(meshes, parts),
  };
}

async function importFbx(request: ImportRequest): Promise<SceneDescription> {
  let parsed: ParsedFbx;
  try {
    parsed = await parseFbx(request.bytes);
  } catch (error) {
    if (error instanceof FbxParseError) {
      throw new ArcueError("invalid-input", `${request.fileName} is not a readable FBX file: ${error.message}`, {
        cause: error,
      });
    }
    const reason = error instanceof Error ? error.message : String(error);
    throw new ArcueError("internal", `The FBX parser failed on ${request.fileName}: ${reason}`, { cause: error });
  }
  return buildScene(parsed, request);
}

export const fbxImporter: Importer = {
  format: "fbx",
  extensions: [".fbx"],
  import: importFbx,
};
