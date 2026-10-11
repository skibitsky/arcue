import { ArcueError } from "@arcue/protocol";
import type {
  Clip,
  Importer,
  ImportRequest,
  ImportWarning,
  Material,
  Mesh,
  SceneDescription,
  SceneNode,
  ScenePart,
  TextureFile,
  TextureRef,
  TextureResolver,
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
  importWarning,
  isKeyedEveryFrame,
  mergeKeyTimes,
  topologyFingerprint,
} from "@arcue/scene";
import { readActions } from "./anim/actions";
import type { ParsedClip } from "./anim/clips";
import { buildClips, driverWarnings } from "./anim/clips";
import { decompressBlend } from "./blend/decompress";
import { BlendParseError } from "./blend/errors";
import type { BlendFile, BlendStruct } from "./blend/file";
import { readBlendFile } from "./blend/file";
import { idName } from "./blend/ids";
import { decompose, invert, multiplyAll } from "./math";
import type { BlendWarning, BuiltScene } from "./scene/build";
import { buildScene, uvSetFor } from "./scene/build";
import type { ImageUse } from "./scene/materials";

/** Blender's own rotation for Z-up content in a Y-up scene: −90° about X. */
const MINUS_90_ABOUT_X: [number, number, number, number] = [-Math.SQRT1_2, 0, 0, Math.SQRT1_2];
const IMAGE_SOURCE_FILE = 1;
/** The gray Blender's default material shows, for a base color whose image is missing. */
const UNTEXTURED = 0.8;

function buildNodes(scene: BuiltScene): SceneNode[] {
  const paths = buildNodePaths(scene.nodes);
  const fromScene = invert(scene.conversion);
  return scene.nodes.map((node, index) => {
    const trs = decompose(multiplyAll(scene.conversion, node.rest, fromScene));
    return {
      name: node.name,
      path: paths[index] ?? node.name,
      parent: node.parent,
      kind: node.kind,
      translation: trs.translation,
      rotation: trs.rotation,
      scale: trs.scale,
      mesh: node.mesh,
    };
  });
}

/** The image's stored path with Blender's "//" relative prefix removed, or the image's name when it has no path. */
function imagePaths(image: BlendStruct): { relative: string; absolute: string } {
  const stored = image.string("name") || image.string("filepath");
  if (stored.startsWith("//")) return { relative: stored.slice(2), absolute: "" };
  if (stored === "") return { relative: idName(image), absolute: "" };
  return { relative: stored, absolute: stored };
}

function packedBytes(file: BlendFile, image: BlendStruct): Uint8Array | null {
  const packed = image.deref("packedfile") ?? image.list("packedfiles")[0]?.deref("packedfile") ?? null;
  if (!packed) return null;
  const block = packed.target("data");
  if (!block) return null;
  const size = Math.min(Math.max(packed.number("size"), 0), block.size);
  return file.bytes.slice(block.offset, block.offset + size);
}

class ImageFiles {
  readonly files: TextureFile[] = [];
  readonly #index = new Map<number, number>();
  readonly #file: BlendFile;

  constructor(file: BlendFile) {
    this.#file = file;
  }

  indexOf(image: BlendStruct): number | null {
    const known = this.#index.get(image.offset);
    if (known !== undefined) return known;
    if (image.has("source") && image.number("source") !== IMAGE_SOURCE_FILE && !image.deref("packedfile")) return null;
    const paths = imagePaths(image);
    const index = this.files.length;
    this.files.push({ ...paths, linked: true, content: packedBytes(this.#file, image) });
    this.#index.set(image.offset, index);
    return index;
  }
}

async function buildMaterials(
  scene: BuiltScene,
  images: ImageFiles,
  resolver: () => TextureResolver,
): Promise<Material[]> {
  const result: Material[] = [];
  for (const [index, draft] of scene.materials.entries()) {
    const uvMaps = scene.materialUvs[index];
    const missingTextures: Partial<Record<TextureSlot, string>> = {};
    const ref = async (use: ImageUse | null, slot?: TextureSlot): Promise<TextureRef | null> => {
      if (!use) return null;
      const file = images.indexOf(use.image);
      if (file === null) return null;
      const textures = resolver();
      const texture = await textures.resolve(file, draft.name, slot);
      if (texture === null) {
        if (slot) missingTextures[slot] = textures.storedPath(file);
        return null;
      }
      return {
        texture,
        uvSet: uvSetFor(uvMaps, use.uvMap),
        wrapU: use.wrap,
        wrapV: use.wrap,
        transform: use.transform,
      };
    };
    const baseColorTexture = await ref(draft.baseColorImage, "baseColor");
    const metallicRoughnessTexture = await ref(draft.metallicRoughnessImage);
    const emissiveTexture = await ref(draft.emissiveImage, "emissive");
    const alpha = draft.baseColor[3];
    const strength = draft.emissionStrength;
    const material: Material = {
      name: draft.name,
      baseColor: baseColorTexture
        ? [1, 1, 1, alpha]
        : draft.baseColorImage
          ? [UNTEXTURED, UNTEXTURED, UNTEXTURED, alpha]
          : draft.baseColor,
      baseColorTexture,
      metallic: metallicRoughnessTexture ? 1 : draft.metallic,
      roughness: metallicRoughnessTexture ? 1 : draft.roughness,
      metallicRoughnessTexture,
      roughnessTexture: await ref(draft.roughnessImage, "roughness"),
      metalnessTexture: await ref(draft.metalnessImage, "metalness"),
      normalTexture: await ref(draft.normalImage, "normal"),
      normalScale: draft.normalScale,
      occlusionTexture: null,
      emissive: emissiveTexture ? [strength, strength, strength] : draft.emissiveImage ? [0, 0, 0] : draft.emissive,
      emissiveTexture,
      alphaMode: draft.alphaMode,
      alphaCutoff: draft.alphaCutoff,
      doubleSided: draft.doubleSided,
    };
    if (Object.keys(missingTextures).length > 0) material.missingTextures = missingTextures;
    result.push(material);
  }
  return result;
}

function buildClipList(clips: readonly ParsedClip[], fps: number): Clip[] {
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

function toImportWarning(warning: BlendWarning, fileName: string): ImportWarning {
  const subject =
    warning.subject.kind === "file" && warning.subject.name === ""
      ? { kind: "file" as const, name: fileName }
      : warning.subject;
  const message =
    warning.subject.kind === "file" && warning.subject.name === ""
      ? `${warning.message}: ${fileName}`
      : warning.message;
  return importWarning(
    warning.code,
    subject,
    message,
    undefined,
    warning.detail === undefined ? {} : { detail: warning.detail },
  );
}

function exporterOf(file: BlendFile): SceneDescription["source"]["exporter"] {
  return { name: "Blender", version: `${Math.floor(file.version / 100)}.${file.version % 100}` };
}

async function parse(request: ImportRequest): Promise<BlendFile> {
  try {
    return readBlendFile(await decompressBlend(request.bytes));
  } catch (error) {
    if (error instanceof BlendParseError) {
      throw new ArcueError("invalid-input", `${request.fileName} is not a readable Blender file: ${error.message}`, {
        cause: error,
      });
    }
    throw error;
  }
}

/** Parts whose every mesh Blender's view layer hides with the eye start hidden, so the view matches Blender's. */
function hideEyeHiddenParts(parts: ScenePart[], scene: BuiltScene): ScenePart[] {
  const hidden = new Set(scene.meshRecords.flatMap((record, index) => (record.object.hidden ? [index] : [])));
  return parts.map((part) => {
    const meshes = part.levels.flatMap((level) => level.meshes);
    return meshes.length > 0 && meshes.every((mesh) => hidden.has(mesh)) ? { ...part, hiddenByDefault: true } : part;
  });
}

/** Blender 2.80 brought collections and view layers, which the scene is read from. */
const OLDEST_VERSION = 280;

async function importBlend(request: ImportRequest): Promise<SceneDescription> {
  const file = await parse(request);
  if (file.version < OLDEST_VERSION) {
    const saved = exporterOf(file)?.version ?? "an old version";
    throw new ArcueError(
      "invalid-input",
      `${request.fileName} was saved by Blender ${saved}. Arcue opens files from Blender 2.80 on; save it in a newer Blender.`,
    );
  }
  let scene: BuiltScene;
  let clips: ParsedClip[];
  try {
    scene = buildScene(file);
    clips = buildClips(scene, readActions(file), scene.warnings);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new ArcueError("internal", `Arcue could not read the scene in ${request.fileName}: ${reason}`, {
      cause: error,
    });
  }
  const meshes: Mesh[] = scene.meshes.map((mesh) => ({ ...mesh, topology: topologyFingerprint(mesh) }));
  const images = new ImageFiles(file);
  let resolver: TextureResolver | null = null;
  const textures = () => {
    resolver ??= createTextureResolver(images.files, request.findFile, request.locateFile);
    return resolver;
  };
  const materials = await buildMaterials(scene, images, textures);
  const nodes = buildNodes(scene);
  const parts = hideEyeHiddenParts(describeParts(nodes), scene);
  const warnings = [...scene.warnings, ...driverWarnings(scene)].map((warning) =>
    toImportWarning(warning, request.fileName),
  );
  return {
    source: {
      format: "blend",
      exporter: exporterOf(file),
      fps: scene.fps,
      originalSpace: { axes: { right: "+X", up: "+Z", front: "-Y" }, unitMeters: scene.unitScale },
      conversion: { scale: scene.unitScale, rotation: MINUS_90_ABOUT_X },
      warnings: [...warnings, ...(resolver ? await (resolver as TextureResolver).warnings() : [])],
    },
    nodes,
    meshes,
    skeletons: scene.skeletons,
    materials,
    textures: resolver ? (resolver as TextureResolver).textures : [],
    clips: buildClipList(clips, scene.fps),
    parts,
    bounds: defaultViewBounds(meshes, parts),
  };
}

export const blendImporter: Importer = {
  format: "blend",
  extensions: [".blend"],
  import: importBlend,
};
