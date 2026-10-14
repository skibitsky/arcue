import { ArcueError } from "@arcue/protocol";
import type {
  Clip,
  FoundFile,
  Importer,
  ImportRequest,
  ImportWarning,
  Material,
  SceneDescription,
  SceneNode,
  ScenePart,
  TextureAlpha,
  TextureColorSpace,
  TextureFile,
  TextureRef,
  TextureRefKey,
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
  importWarning,
  isKeyedEveryFrame,
  mergeKeyTimes,
  parseStoredPath,
  TEXTURE_SLOT_KEYS,
  TEXTURE_SLOTS,
  unshownUvSetWarnings,
} from "@arcue/scene";
import { animatedPaths, readActions } from "./anim/actions";
import type { ParsedClip } from "./anim/clips";
import { buildClips, driverWarnings } from "./anim/clips";
import { restPositionWarnings } from "./anim/rest-position";
import { skinMotionWarnings } from "./anim/skin-motion";
import { decompressBlend } from "./blend/decompress";
import { BlendLimitError, BlendParseError } from "./blend/errors";
import type { BlendBlock, BlendFile, BlendStruct } from "./blend/file";
import { readBlendFile } from "./blend/file";
import { idName, idOf } from "./blend/ids";
import { GRAY_CHECK_BYTES, GRAY_SAMPLE_BYTES, isGrayImage } from "./gray-images";
import { sequencePath, tilePath } from "./image-paths";
import { decompose, invert, multiplyAll } from "./math";
import type { BlendWarning, BuiltScene, GrayCandidate, MaterialUvMaps } from "./scene/build";
import { buildScene, grayCandidates, uvSetFor } from "./scene/build";
import type { GrayCheck, ImageUse } from "./scene/materials";
import {
  IMAGE_SOURCE_FILE,
  IMAGE_SOURCE_SEQUENCE,
  IMAGE_SOURCE_TILED,
  imageSource,
  packedFile,
} from "./scene/materials";
import type { SceneContents } from "./scene/objects";
import { collectSceneObjects } from "./scene/objects";
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

/**
 * Whether the preview reads the file an image stores, rather than its packed bytes or nothing: an image file's, a
 * UDIM image's first tile, or the frame `frame` of a sequence.
 */
function readsFile(image: BlendStruct, frame: number | null): boolean {
  const source = imageSource(image);
  return (
    source === IMAGE_SOURCE_FILE ||
    source === IMAGE_SOURCE_TILED ||
    (source === IMAGE_SOURCE_SEQUENCE && frame !== null)
  );
}

/** The file Blender reads for an image at `path`: a UDIM image's first tile, or the frame `frame` of a sequence. */
function shownFile(image: BlendStruct, path: string, frame: number | null): string {
  if (packedFile(image)) return path;
  const source = imageSource(image);
  if (source === IMAGE_SOURCE_TILED) return tilePath(path, image.list("tiles")[0]?.number("tile_number") ?? 1001);
  if (source === IMAGE_SOURCE_SEQUENCE && frame !== null) return sequencePath(path, frame);
  return path;
}

/** The paths an image stores for one file, as a texture file holds them. */
type StoredPaths = Pick<TextureFile, "relative" | "absolute">;

/**
 * The stored path of the file the preview reads for an image, at `frame` for a sequence, with Blender's "//" relative
 * prefix removed, or the image's name when it has no path.
 */
function imagePaths(image: BlendStruct, frame: number | null): StoredPaths {
  const own = image.string("name") || image.string("filepath");
  const folder = own.startsWith("//") ? `${relativePathFolder(image)}${own.slice(2)}` : own;
  const stored = shownFile(image, folder, frame);
  if (stored.startsWith("//")) return { relative: stored.slice(2), absolute: "" };
  if (stored === "") return { relative: idName(image), absolute: "" };
  return { relative: stored, absolute: stored };
}

/** The bytes of the file packed into an image, as a view of the file's bytes, and the block that holds them. */
function packedData(file: BlendFile, image: BlendStruct): { block: BlendBlock; bytes: Uint8Array } | null {
  const packed = packedFile(image);
  if (!packed) return null;
  const block = packed.target("data");
  if (!block) return null;
  const size = Math.min(Math.max(packed.number("size"), 0), block.size);
  return { block, bytes: file.bytes.subarray(block.offset, block.offset + size) };
}

type FindFile = ImportRequest["findFile"];
type LocateFile = ImportRequest["locateFile"];

function cached<T>(cache: Map<string, Promise<T>>, key: string, load: () => Promise<T>): Promise<T> {
  let value = cache.get(key);
  if (!value) {
    value = load();
    cache.set(key, value);
  }
  return value;
}

/**
 * `findFile` and `locateFile` that look each stored path up once and read each file found once, however many stored
 * paths lead to it: the gray check and the textures both read some images, and Image datablocks may store many paths
 * to one file.
 */
function searchingOnce(request: ImportRequest): { findFile: FindFile; locateFile: LocateFile } {
  const located = new Map<string, Promise<string | null>>();
  const read = new Map<string, Promise<FoundFile | null>>();
  const locateFile: LocateFile = (storedPath) => cached(located, storedPath, () => request.locateFile(storedPath));
  const findFile: FindFile = async (storedPath) => {
    const path = await locateFile(storedPath);
    return path === null ? null : cached(read, path, () => request.findFile(storedPath));
  };
  return { findFile, locateFile };
}

/**
 * An image's bytes: packed in the file, or found by the paths it stores, its first tile's for a UDIM image. Null for an
 * image that is not one file, such as a sequence, whose frame each Image Texture node picks.
 */
async function imageBytes(file: BlendFile, image: BlendStruct, findFile: FindFile): Promise<Uint8Array | null> {
  if (image.typeName !== "Image") return null;
  const packed = packedData(file, image);
  if (packed) return packed.bytes;
  if (!readsFile(image, null)) return null;
  const { relative, absolute } = imagePaths(image, null);
  for (const path of new Set([relative, absolute])) {
    const found = path === "" ? null : await findFile(path);
    if (found) return found.bytes;
  }
  return null;
}

/**
 * Whether every pixel of each image is gray, by the image's offset, for the images the check can tell. The images read
 * whole come first, so that samples never take the budget they need.
 */
async function grayImages(
  file: BlendFile,
  candidates: readonly GrayCandidate[],
  findFile: FindFile,
): Promise<Map<number, boolean>> {
  const gray = new Map<number, boolean>();
  const budget = { bytes: GRAY_CHECK_BYTES };
  const whole = candidates.filter((candidate) => candidate.read === "whole");
  const sampled = candidates.filter((candidate) => candidate.read === "sample");
  for (const { image, read } of [...whole, ...sampled]) {
    const bytes = await imageBytes(file, image, findFile);
    const limit = read === "sample" ? GRAY_SAMPLE_BYTES : undefined;
    const known = bytes ? await isGrayImage(bytes, budget, limit) : null;
    if (known !== null) gray.set(image.offset, known);
  }
  return gray;
}

/**
 * The texture files the materials use: one for each image file found through a relative path, however many Image
 * datablocks store a path to it and however they spell it, one for each other stored path, however it is spelled, and
 * one for each block of packed bytes, however many Image datablocks point at it. Absolute paths keep their own texture
 * files, so the textures note each of them. An image linked from another .blend file has none, since this file holds
 * only its name, unless the image was packed with its library.
 */
class ImageFiles {
  readonly files: TextureFile[] = [];
  readonly #index = new Map<string, number>();
  readonly #file: BlendFile;
  readonly #locateFile: LocateFile;

  constructor(file: BlendFile, locateFile: LocateFile) {
    this.#file = file;
    this.#locateFile = locateFile;
  }

  async indexOf({ image, frame }: ImageUse): Promise<number | null> {
    if (image.typeName !== "Image") return null;
    const packed = packedFile(image);
    if (!packed && !readsFile(image, frame)) return null;
    const paths = imagePaths(image, frame);
    if (packed) {
      const data = packedData(this.#file, image);
      const key = data ? `packed block ${data.block.index}` : `packed image ${image.offset}`;
      return this.#add(key, paths, () => data?.bytes.slice() ?? null);
    }
    const spelled = `path ${normalizedPath(paths.relative)}`;
    const known = this.#index.get(spelled);
    if (known !== undefined) return known;
    const located = parseStoredPath(paths.relative).relative === null ? null : await this.#locateFile(paths.relative);
    const index = this.#add(located === null ? spelled : `found ${located}`, paths, () => null);
    this.#index.set(spelled, index);
    return index;
  }

  #add(key: string, paths: StoredPaths, content: () => Uint8Array | null): number {
    const known = this.#index.get(key);
    if (known !== undefined) return known;
    this.files.push({ ...paths, linked: true, content: content() });
    this.#index.set(key, this.files.length - 1);
    return this.files.length - 1;
  }
}

/** What a texture reference of a key means when it leaves out its alpha or its color space. */
function unsetSampling(key: TextureRefKey): { alpha: TextureAlpha; colorSpace: TextureColorSpace } {
  const color = key === "baseColorTexture" || key === "emissiveTexture";
  return { alpha: key === "baseColorTexture" ? "opacity" : "none", colorSpace: color ? "srgb" : "linear" };
}

/** How a material samples an image for a key: its UV set and wrap, with its alpha and color space where not the key's. */
function samplingOf(use: ImageUse, key: TextureRefKey, uvMaps: MaterialUvMaps | undefined): TextureSampling {
  const sampling: TextureSampling = {
    uvSet: uvSetFor(uvMaps, use.uvMap),
    wrapU: use.wrap,
    wrapV: use.wrap,
    transform: use.transform,
  };
  const unset = unsetSampling(key);
  if (use.alpha !== unset.alpha) sampling.alpha = use.alpha;
  if (use.colorSpace !== null && use.colorSpace !== unset.colorSpace) sampling.colorSpace = use.colorSpace;
  return sampling;
}

async function buildMaterials(scene: BuiltScene, images: ImageFiles, textures: TextureResolver): Promise<Material[]> {
  const result: Material[] = [];
  for (const [index, draft] of scene.materials.entries()) {
    const uvMaps = scene.materialUvs[index];
    const missingTextures: Partial<Record<TextureSlot, string>> = {};
    const missingTextureSampling: Partial<Record<TextureSlot, TextureSampling>> = {};
    const ref = async (use: ImageUse | null, key: TextureRefKey): Promise<TextureRef | null> => {
      if (!use) return null;
      const file = await images.indexOf(use);
      if (file === null) return null;
      const slot = TEXTURE_SLOTS.find((candidate) => TEXTURE_SLOT_KEYS[candidate] === key);
      const sampling = samplingOf(use, key, uvMaps);
      const texture = await textures.resolve(file, draft.name, slot);
      if (texture !== null) return { texture, ...sampling };
      if (slot) {
        missingTextures[slot] = textures.storedPath(file);
        missingTextureSampling[slot] = sampling;
      }
      return null;
    };
    const baseColorTexture = await ref(draft.baseColorImage, "baseColorTexture");
    const metallicRoughnessTexture = await ref(draft.metallicRoughnessImage, "metallicRoughnessTexture");
    const emissiveTexture = await ref(draft.emissiveImage, "emissiveTexture");
    const missingPacked = draft.metallicRoughnessImage !== null && !metallicRoughnessTexture;
    const colors = scene.materialColors[index];
    const [red, green, blue, alpha] = draft.baseColor;
    const material: Material = {
      name: draft.name,
      baseColor:
        colors?.baseColor === "black"
          ? [0, 0, 0, alpha]
          : baseColorTexture
            ? [red, green, blue, alpha]
            : draft.baseColorImage
              ? [UNTEXTURED, UNTEXTURED, UNTEXTURED, alpha]
              : draft.baseColor,
      baseColorTexture,
      metallic: missingPacked ? 0 : draft.metallic,
      roughness: missingPacked ? UNTEXTURED_ROUGHNESS : draft.roughness,
      metallicRoughnessTexture,
      roughnessTexture: await ref(draft.roughnessImage, "roughnessTexture"),
      metalnessTexture: await ref(draft.metalnessImage, "metalnessTexture"),
      normalTexture: await ref(draft.normalImage, "normalTexture"),
      normalScale: draft.normalScale,
      occlusionTexture: null,
      emissive: (!emissiveTexture && draft.emissiveImage) || colors?.emissive === "black" ? [0, 0, 0] : draft.emissive,
      emissiveTexture,
      alphaMode: draft.alphaMode,
      alphaCutoff: draft.alphaCutoff,
      doubleSided: draft.doubleSided,
    };
    if (colors?.baseColor === "colors" || colors?.emissive === "colors") {
      material.vertexColors = { baseColor: colors.baseColor === "colors", emissive: colors.emissive === "colors" };
    }
    if (Object.keys(missingTextures).length > 0) {
      material.missingTextures = missingTextures;
      material.missingTextureSampling = missingTextureSampling;
    }
    result.push(material);
  }
  return result;
}

/** The scene's clips, each with the file's frame at its frame 0 where the file's frames step one to a clip frame. */
function buildClipList(clips: readonly ParsedClip[], fps: number): Clip[] {
  const names = clipNames(clips.map((clip) => clip.name));
  const display = displayNames(names);
  return clips.map((clip, index) => {
    const frameCount = frameCountFor(clip.duration, fps);
    const { start, step } = clip.fileFrames;
    return {
      name: names[index] ?? clip.name,
      displayName: display[index] ?? clip.name,
      fps,
      duration: clip.duration,
      frameCount,
      tracks: clip.tracks,
      keyTimes: mergeKeyTimes(clip.curveTimes),
      keyedEveryFrame: isKeyedEveryFrame(clip.curveTimes, fps, frameCount),
      ...(step === 1 ? { sourceStartFrame: start } : {}),
    };
  });
}

function unique(texts: readonly string[]): string[] {
  return [...new Set(texts)];
}

/**
 * One warning for each code and subject, since a review keeps one warning per id: several, such as two ways a mesh
 * deforms differently, join their distinct messages and details.
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
    const merged: BlendWarning = { ...first, message: unique(group.map((warning) => warning.message)).join("; ") };
    if (details.length > 0) merged.detail = unique(details).join("; ");
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

/** Blender's object display types that draw no surface: Bounds, a box around the object, and Wire, its edges. */
const DISPLAY_BOUNDS = 1;
const DISPLAY_WIRE = 2;

/**
 * Whether Blender hides the mesh or draws no surface for it: hidden with the eye in the view layer, an instancer that
 * shows only its instances, or an object displayed as bounds or wire, as cages and cutters often are.
 */
function hiddenInBlender(scene: BuiltScene, mesh: number): boolean {
  const object = scene.meshRecords[mesh]?.object;
  if (object === undefined) return false;
  const display = object.struct.number("dt");
  return object.hidden || object.instancerHidden || display === DISPLAY_BOUNDS || display === DISPLAY_WIRE;
}

/** Parts whose every mesh Blender hides start hidden, so the view matches Blender's. */
function hideBlenderHiddenParts(parts: ScenePart[], scene: BuiltScene): ScenePart[] {
  return parts.map((part) => {
    const meshes = part.levels.flatMap((level) => level.meshes);
    const hidden = meshes.length > 0 && meshes.every((mesh) => hiddenInBlender(scene, mesh));
    return hidden ? { ...part, hiddenByDefault: true } : part;
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
    if (error instanceof BlendLimitError) {
      throw new ArcueError("invalid-input", `${request.fileName} ${error.message}.`, { cause: error });
    }
    const reason = error instanceof Error ? error.message : String(error);
    throw new ArcueError("internal", `Arcue could not read the scene in ${request.fileName}: ${reason}`, {
      cause: error,
    });
  }
}

function readScene(
  file: BlendFile,
  contents: SceneContents,
  isGray: GrayCheck,
): { scene: BuiltScene; clips: ParsedClip[] } {
  const actions = readActions(file);
  const scene = buildScene(file, animatedPaths(file, actions), isGray, contents, actions);
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
  const { findFile, locateFile } = searchingOnce(request);
  const contents = readingScene(request, () => collectSceneObjects(file));
  const candidates = readingScene(request, () => grayCandidates(file, contents));
  const gray = await grayImages(file, candidates, findFile);
  const { scene, clips } = readingScene(request, () =>
    readScene(file, contents, (image) => gray.get(image.offset) ?? null),
  );
  const images = new ImageFiles(file, locateFile);
  const textures = createTextureResolver(images.files, findFile, locateFile);
  const materials = await buildMaterials(scene, images, textures);
  const nodes = buildNodes(scene);
  const parts = hideBlenderHiddenParts(describeParts(nodes), scene);
  const warnings = mergeWarnings([
    ...scene.warnings,
    ...skinMotionWarnings(scene, clips),
    ...restPositionWarnings(scene, clips),
    ...driverWarnings(scene),
    ...unshownUvSetWarnings(materials),
  ]).map((warning) => toImportWarning(warning, request.fileName));
  const shared = shareFoundTextures(textures.textures, materials);
  return {
    source: {
      format: "blend",
      exporter: exporterOf(file),
      fps: scene.fps,
      originalSpace: { axes: { right: "+X", up: "+Z", front: "-Y" }, unitMeters: scene.unitScale },
      conversion: { scale: scene.unitScale, rotation: MINUS_90_ABOUT_X },
      warnings: [...warnings, ...joinWarningsById(await textures.warnings())],
    },
    nodes,
    meshes: scene.meshes,
    skeletons: scene.skeletons,
    materials: shared.materials,
    textures: shared.textures,
    clips: buildClipList(clips, scene.fps),
    parts,
    bounds: defaultViewBounds(scene.meshes, parts),
  };
}

export const blendImporter: Importer = {
  format: "blend",
  extensions: [".blend"],
  import: importBlend,
};
