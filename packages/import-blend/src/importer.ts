import { ArcueError } from "@arcue/protocol";
import type {
  Clip,
  FoundFile,
  Importer,
  ImportRequest,
  ImportWarning,
  Material,
  Mesh,
  SceneDescription,
  SceneNode,
  ScenePart,
  TextureAlpha,
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
  parseStoredPath,
  topologyFingerprint,
} from "@arcue/scene";
import { animatedPaths, readActions } from "./anim/actions";
import type { ParsedClip } from "./anim/clips";
import { buildClips, driverWarnings } from "./anim/clips";
import { restPositionWarnings } from "./anim/rest-position";
import { skinMotionWarnings } from "./anim/skin-motion";
import { decompressBlend } from "./blend/decompress";
import { BlendParseError } from "./blend/errors";
import type { BlendFile, BlendStruct } from "./blend/file";
import { readBlendFile } from "./blend/file";
import { idName, idOf } from "./blend/ids";
import { isGrayImage } from "./gray-images";
import { decompose, invert, multiplyAll } from "./math";
import type { BlendWarning, BuiltScene } from "./scene/build";
import { buildScene, grayCandidates, uvSetFor } from "./scene/build";
import type { GrayCheck, ImageUse } from "./scene/materials";
import { IMAGE_SOURCE_FILE, packedFile } from "./scene/materials";
import { joinWarningsById, normalizedPath, shareFoundTextures } from "./texture-files";

/** Blender's own rotation for Z-up content in a Y-up scene: −90° about X. */
const MINUS_90_ABOUT_X: [number, number, number, number] = [-Math.SQRT1_2, 0, 0, Math.SQRT1_2];
/** The gray Blender's default material shows, for a base color whose image is missing. */
const UNTEXTURED = 0.8;
/** The roughness Blender's default material shows, for a packed metallic-roughness image that is missing. */
const UNTEXTURED_ROUGHNESS = 0.5;

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

/** The folder a "//" path of the datablock starts at: this file's, or for data packed from a library, the library's. */
function relativePathFolder(datablock: BlendStruct): string {
  const library = idOf(datablock)?.deref("lib");
  const path = library ? library.string("name") || library.string("filepath") : "";
  return path.slice(0, path.replaceAll("\\", "/").lastIndexOf("/") + 1) || "//";
}

/** The image's stored path with Blender's "//" relative prefix removed, or the image's name when it has no path. */
function imagePaths(image: BlendStruct): { relative: string; absolute: string } {
  const own = image.string("name") || image.string("filepath");
  const stored = own.startsWith("//") ? `${relativePathFolder(image)}${own.slice(2)}` : own;
  if (stored.startsWith("//")) return { relative: stored.slice(2), absolute: "" };
  if (stored === "") return { relative: idName(image), absolute: "" };
  return { relative: stored, absolute: stored };
}

/** The path the texture resolver names for an image: its relative path when it has one. */
function storedPathOf(image: BlendStruct): string {
  const paths = imagePaths(image);
  return parseStoredPath(paths.relative).relative ?? paths.absolute;
}

function packedBytes(file: BlendFile, image: BlendStruct): Uint8Array | null {
  const packed = packedFile(image);
  if (!packed) return null;
  const block = packed.target("data");
  if (!block) return null;
  const size = Math.min(Math.max(packed.number("size"), 0), block.size);
  return file.bytes.slice(block.offset, block.offset + size);
}

type FindFile = ImportRequest["findFile"];

/** `findFile` that looks each stored path up once, as the gray check and the textures both read some images. */
function findingOnce(findFile: FindFile): FindFile {
  const found = new Map<string, Promise<FoundFile | null>>();
  return (storedPath) => {
    let file = found.get(storedPath);
    if (!file) {
      file = findFile(storedPath);
      found.set(storedPath, file);
    }
    return file;
  };
}

/** An image's bytes: packed in the file, or found by the paths it stores. Null for an image that is not one file. */
async function imageBytes(file: BlendFile, image: BlendStruct, findFile: FindFile): Promise<Uint8Array | null> {
  if (image.typeName !== "Image") return null;
  const packed = packedBytes(file, image);
  if (packed) return packed;
  if (image.has("source") && image.number("source") !== IMAGE_SOURCE_FILE) return null;
  const { relative, absolute } = imagePaths(image);
  for (const path of new Set([relative, absolute])) {
    const found = path === "" ? null : await findFile(path);
    if (found) return found.bytes;
  }
  return null;
}

/** The offsets of the images whose every pixel is gray. */
async function grayImages(file: BlendFile, images: Iterable<BlendStruct>, findFile: FindFile): Promise<Set<number>> {
  const gray = new Set<number>();
  for (const image of images) {
    const bytes = await imageBytes(file, image, findFile);
    if (bytes && (await isGrayImage(bytes))) gray.add(image.offset);
  }
  return gray;
}

/**
 * The texture files the materials use: one for each stored path, however many Image datablocks store it and however
 * it is spelled, and one for each packed image. An image linked from another .blend file has none, since this file
 * holds only its name, unless the image was packed with its library.
 */
class ImageFiles {
  readonly files: TextureFile[] = [];
  readonly #index = new Map<string, number>();
  readonly #file: BlendFile;

  constructor(file: BlendFile) {
    this.#file = file;
  }

  indexOf(image: BlendStruct): number | null {
    if (image.typeName !== "Image") return null;
    const packed = packedFile(image);
    if (image.has("source") && image.number("source") !== IMAGE_SOURCE_FILE && !packed) return null;
    const paths = imagePaths(image);
    const key = packed ? `packed ${image.offset}` : `path ${normalizedPath(paths.relative)}`;
    const known = this.#index.get(key);
    if (known !== undefined) return known;
    const index = this.files.length;
    this.files.push({ ...paths, linked: true, content: packedBytes(this.#file, image) });
    this.#index.set(key, index);
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
        if (slot) missingTextures[slot] = storedPathOf(use.image);
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
    const baseColorTexture = withAlpha(await ref(draft.baseColorImage, "baseColor"), draft.baseColorImage, "opacity");
    const metallicRoughnessTexture = await ref(draft.metallicRoughnessImage);
    const emissiveTexture = withAlpha(await ref(draft.emissiveImage, "emissive"), draft.emissiveImage, "none");
    const missingPacked = draft.metallicRoughnessImage !== null && !metallicRoughnessTexture;
    const [red, green, blue, alpha] = draft.baseColor;
    const material: Material = {
      name: draft.name,
      baseColor: baseColorTexture
        ? [red, green, blue, alpha]
        : draft.baseColorImage
          ? [UNTEXTURED, UNTEXTURED, UNTEXTURED, alpha]
          : draft.baseColor,
      baseColorTexture,
      metallic: missingPacked ? 0 : draft.metallic,
      roughness: missingPacked ? UNTEXTURED_ROUGHNESS : draft.roughness,
      metallicRoughnessTexture,
      roughnessTexture: await ref(draft.roughnessImage, "roughness"),
      metalnessTexture: await ref(draft.metalnessImage, "metalness"),
      normalTexture: await ref(draft.normalImage, "normal"),
      normalScale: draft.normalScale,
      occlusionTexture: null,
      emissive: !emissiveTexture && draft.emissiveImage ? [0, 0, 0] : draft.emissive,
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

/** The texture with the alpha its image's use gives it, where that is not the slot's own. */
function withAlpha(ref: TextureRef | null, use: ImageUse | null, unset: TextureAlpha): TextureRef | null {
  return ref && use && use.alpha !== unset ? { ...ref, alpha: use.alpha } : ref;
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

/**
 * One warning for each code and subject, since a review keeps one warning per id: several, such as two ways a mesh
 * deforms differently, join their messages and details.
 */
function mergeWarnings(warnings: readonly BlendWarning[]): BlendWarning[] {
  const groups = new Map<string, BlendWarning[]>();
  for (const warning of warnings) {
    const key = JSON.stringify([warning.code, warning.subject.kind, warning.subject.name]);
    groups.set(key, [...(groups.get(key) ?? []), warning]);
  }
  return [...groups.values()].flatMap((group) => {
    const [first, ...rest] = group;
    if (!first) return [];
    if (rest.length === 0) return [first];
    const details = group.flatMap((warning) => (warning.detail === undefined ? [] : [warning.detail]));
    const merged: BlendWarning = { ...first, message: group.map((warning) => warning.message).join("; ") };
    if (details.length > 0) merged.detail = details.join("; ");
    return [merged];
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

function unreadable(request: ImportRequest, error: BlendParseError): ArcueError {
  return new ArcueError("invalid-input", `${request.fileName} is not a readable Blender file: ${error.message}`, {
    cause: error,
  });
}

async function parse(request: ImportRequest): Promise<BlendFile> {
  try {
    return readBlendFile(await decompressBlend(request.bytes));
  } catch (error) {
    if (error instanceof BlendParseError) throw unreadable(request, error);
    throw error;
  }
}

/** Whether Blender hides the mesh: with the eye in the view layer, or as an instancer that shows only its instances. */
function hiddenInBlender(scene: BuiltScene, mesh: number): boolean {
  const object = scene.meshRecords[mesh]?.object;
  return object !== undefined && (object.hidden || object.instancerHidden);
}

/** Parts whose every mesh Blender hides start hidden, so the view matches Blender's. */
function hideBlenderHiddenParts(parts: ScenePart[], scene: BuiltScene): ScenePart[] {
  return parts.map((part) => {
    const meshes = part.levels.flatMap((level) => level.meshes);
    const hidden = meshes.length > 0 && meshes.every((mesh) => hiddenInBlender(scene, mesh));
    return hidden ? { ...part, hiddenByDefault: true } : part;
  });
}

/**
 * Warnings for parts whose most detailed level Blender hides while it shows another level. The view starts at the most
 * detailed level, so it shows the hidden one.
 */
function hiddenLevelWarnings(parts: readonly ScenePart[], scene: BuiltScene): BlendWarning[] {
  const hidden = (mesh: number) => hiddenInBlender(scene, mesh);
  const name = (mesh: number) => scene.meshRecords[mesh]?.object.name ?? "";
  return parts.flatMap(({ levels }): BlendWarning[] => {
    const shownLevel = levels.findIndex((level) => level.meshes.some((mesh) => !hidden(mesh)));
    const shown = levels[shownLevel]?.meshes.find((mesh) => !hidden(mesh));
    const hiddenMeshes = levels.slice(0, Math.max(shownLevel, 0)).flatMap((level) => level.meshes);
    if (shown === undefined || hiddenMeshes.length === 0) return [];
    return [
      {
        code: "object-not-shown",
        subject: { kind: "node", name: name(shown) },
        message: `Level not shown by default: ${name(shown)}`,
        detail: `Blender hides ${hiddenMeshes.map(name).join(", ")} and shows this level instead`,
      },
    ];
  });
}

/** Blender 2.80 brought collections and view layers, which the scene is read from. */
const OLDEST_VERSION = 280;

/** What `read` gives, with the errors of reading the file's scene as Arcue's errors. */
function readingScene<T>(request: ImportRequest, read: () => T): T {
  try {
    return read();
  } catch (error) {
    if (error instanceof BlendParseError) throw unreadable(request, error);
    const reason = error instanceof Error ? error.message : String(error);
    throw new ArcueError("internal", `Arcue could not read the scene in ${request.fileName}: ${reason}`, {
      cause: error,
    });
  }
}

function readScene(file: BlendFile, isGray: GrayCheck): { scene: BuiltScene; clips: ParsedClip[] } {
  const actions = readActions(file);
  const scene = buildScene(file, animatedPaths(file, actions), isGray);
  return { scene, clips: buildClips(scene, actions, scene.warnings) };
}

async function importBlend(request: ImportRequest): Promise<SceneDescription> {
  const file = await parse(request);
  if (file.version < OLDEST_VERSION) {
    const saved = exporterOf(file)?.version ?? "an old version";
    throw new ArcueError(
      "invalid-input",
      `${request.fileName} was saved by Blender ${saved}. Arcue opens files from Blender 2.80 on; save it in a newer Blender.`,
    );
  }
  const findFile = findingOnce(request.findFile);
  const candidates = readingScene(request, () => grayCandidates(file));
  const gray = await grayImages(file, candidates, findFile);
  const { scene, clips } = readingScene(request, () => readScene(file, (image) => gray.has(image.offset)));
  const meshes: Mesh[] = scene.meshes.map((mesh) => ({ ...mesh, topology: topologyFingerprint(mesh) }));
  const images = new ImageFiles(file);
  let resolver: TextureResolver | null = null;
  const textures = () => {
    resolver ??= createTextureResolver(images.files, findFile, request.locateFile);
    return resolver;
  };
  const materials = await buildMaterials(scene, images, textures);
  const nodes = buildNodes(scene);
  const parts = hideBlenderHiddenParts(describeParts(nodes), scene);
  scene.warnings.push(
    ...skinMotionWarnings(scene, clips),
    ...restPositionWarnings(scene, clips),
    ...hiddenLevelWarnings(parts, scene),
  );
  const warnings = mergeWarnings([...scene.warnings, ...driverWarnings(scene)]).map((warning) =>
    toImportWarning(warning, request.fileName),
  );
  const shared = shareFoundTextures(resolver ? (resolver as TextureResolver).textures : [], materials);
  return {
    source: {
      format: "blend",
      exporter: exporterOf(file),
      fps: scene.fps,
      originalSpace: { axes: { right: "+X", up: "+Z", front: "-Y" }, unitMeters: scene.unitScale },
      conversion: { scale: scene.unitScale, rotation: MINUS_90_ABOUT_X },
      warnings: [...warnings, ...(resolver ? joinWarningsById(await (resolver as TextureResolver).warnings()) : [])],
    },
    nodes,
    meshes,
    skeletons: scene.skeletons,
    materials: shared.materials,
    textures: shared.textures,
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
