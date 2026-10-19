import { readActions } from "./anim/actions.js";
import type { ParsedClip } from "./anim/clips.js";
import { buildClips, driverWarnings } from "./anim/clips.js";
import { restPositionWarnings } from "./anim/rest-position.js";
import { skinMotionWarnings } from "./anim/skin-motion.js";
import { decompressBlend } from "./blend/decompress.js";
import { BlendLimitError, BlendParseError, BlendReadError } from "./blend/errors.js";
import type { BlendBlock, BlendFile, BlendStruct } from "./blend/file.js";
import { readBlendFile } from "./blend/file.js";
import { idName, idOf } from "./blend/ids.js";
import { GRAY_CHECK_BYTES, GRAY_SAMPLE_BYTES, isGrayImage } from "./gray-images.js";
import { sequencePath, tilePath } from "./image-paths.js";
import { decompose, invert, multiplyAll } from "./math.js";
import type { BuiltScene, GrayCandidate, MaterialColors } from "./scene/build.js";
import { buildScene, grayCandidates, uvSetFor } from "./scene/build.js";
import type { GrayCheck, ImageUse } from "./scene/materials.js";
import {
  IMAGE_SOURCE_FILE,
  IMAGE_SOURCE_SEQUENCE,
  IMAGE_SOURCE_TILED,
  imageSource,
  packedFile,
} from "./scene/materials.js";
import type { SceneContents, SceneObject } from "./scene/objects.js";
import { collectSceneObjects } from "./scene/objects.js";
import type {
  BlendClip,
  BlendImage,
  BlendMaterial,
  BlendNode,
  BlendScene,
  ReadBlendOptions,
  TextureColorSpace,
  TextureRef,
  VertexColorUse,
} from "./types.js";

/** Blender 2.80 brought collections and view layers, which the scene is read from. */
const OLDEST_VERSION = 280;

/** Blender's object display types that draw no surface: Bounds, a box around the object, and Wire, its edges. */
const DISPLAY_BOUNDS = 1;
const DISPLAY_WIRE = 2;

/**
 * Whether Blender hides the object or draws no surface for it: hidden with the eye in the view layer, an instancer that
 * shows only its instances, or an object displayed as bounds or wire, as cages and cutters often are.
 */
function hiddenInBlender(object: SceneObject): boolean {
  const display = object.struct.number("dt");
  return object.hidden || object.instancerHidden || display === DISPLAY_BOUNDS || display === DISPLAY_WIRE;
}

function buildNodes(scene: BuiltScene): BlendNode[] {
  const fromScene = invert(scene.conversion);
  const hidden = new Set<number>();
  for (const record of [...scene.objects, ...scene.meshRecords]) {
    if (hiddenInBlender(record.object)) hidden.add(record.node);
  }
  return scene.nodes.map((node, index) => {
    const trs = decompose(multiplyAll(scene.conversion, node.rest, fromScene));
    return {
      name: node.name,
      parent: node.parent,
      kind: node.kind,
      translation: trs.translation,
      rotation: trs.rotation,
      scale: trs.scale,
      mesh: node.mesh,
      hidden: hidden.has(index),
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
 * Whether the scene shows the file an image stores, rather than its packed bytes or nothing: an image file's, a UDIM
 * image's first tile, or the frame `frame` of a sequence.
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

/**
 * The stored path of the file the scene shows for an image, at `frame` for a sequence, with Blender's "//" relative
 * prefix removed, or the image's name when it has no path.
 */
function imagePath(image: BlendStruct, frame: number | null): Pick<BlendImage, "path" | "relative"> {
  const own = image.string("name") || image.string("filepath");
  const folder = own.startsWith("//") ? `${relativePathFolder(image)}${own.slice(2)}` : own;
  const stored = shownFile(image, folder, frame);
  if (stored.startsWith("//")) return { path: stored.slice(2), relative: true };
  if (stored === "") return { path: idName(image), relative: true };
  return { path: stored, relative: false };
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

type ReadImage = NonNullable<ReadBlendOptions["readImage"]>;

/**
 * An image's bytes: packed in the file, or read by the paths it stores, its first tile's for a UDIM image. Null for an
 * image that is not one file, such as a sequence, whose frame each Image Texture node picks.
 */
async function imageBytes(file: BlendFile, image: BlendStruct, readImage: ReadImage): Promise<Uint8Array | null> {
  if (image.typeName !== "Image") return null;
  const packed = packedData(file, image);
  if (packed) return packed.bytes;
  if (!readsFile(image, null)) return null;
  const { path } = imagePath(image, null);
  return path === "" ? null : readImage(path);
}

/**
 * Whether every pixel of each image is gray, by the image's offset, for the images the check can tell. The images read
 * whole come first, so that samples never take the budget they need.
 */
async function grayImages(
  file: BlendFile,
  candidates: readonly GrayCandidate[],
  readImage: ReadImage,
): Promise<Map<number, boolean>> {
  const gray = new Map<number, boolean>();
  const budget = { bytes: GRAY_CHECK_BYTES };
  const whole = candidates.filter((candidate) => candidate.read === "whole");
  const sampled = candidates.filter((candidate) => candidate.read === "sample");
  for (const { image, read } of [...whole, ...sampled]) {
    const bytes = await imageBytes(file, image, readImage);
    const limit = read === "sample" ? GRAY_SAMPLE_BYTES : undefined;
    const known = bytes ? await isGrayImage(bytes, budget, limit) : null;
    if (known !== null) gray.set(image.offset, known);
  }
  return gray;
}

/**
 * The images the materials sample: one for each block of packed bytes, however many Image datablocks point at it, one
 * for each stored path, and one for each image no file holds. An image linked from another .blend file has no file,
 * since this file holds only its name, unless the image was packed with its library.
 */
class SceneImages {
  readonly images: BlendImage[] = [];
  readonly #index = new Map<string, number>();
  readonly #file: BlendFile;

  constructor(file: BlendFile) {
    this.#file = file;
  }

  indexOf({ image, frame }: ImageUse): number {
    const name = idName(image);
    if (image.typeName !== "Image") return this.#add(`none ${image.offset}`, () => none(name));
    const packed = packedFile(image);
    if (!packed && !readsFile(image, frame)) return this.#add(`none ${image.offset}`, () => none(name));
    const path = imagePath(image, frame);
    if (packed) {
      const data = packedData(this.#file, image);
      const key = data ? `packed block ${data.block.index}` : `packed image ${image.offset}`;
      return this.#add(key, () => ({ name, source: "packed", ...path, packed: data?.bytes.slice() ?? null }));
    }
    return this.#add(JSON.stringify([path.path, path.relative]), () => ({
      name,
      source: "file",
      ...path,
      packed: null,
    }));
  }

  #add(key: string, image: () => BlendImage): number {
    const known = this.#index.get(key);
    if (known !== undefined) return known;
    this.images.push(image());
    this.#index.set(key, this.images.length - 1);
    return this.images.length - 1;
  }
}

function none(name: string): BlendImage {
  return { name, source: "none", path: "", relative: true, packed: null };
}

/** The color space a texture slot decodes its image in when the material does not say. */
function slotColorSpace(slot: "color" | "data"): TextureColorSpace {
  return slot === "color" ? "srgb" : "linear";
}

function vertexColorUse(shown: MaterialColors["baseColor"]): VertexColorUse {
  if (shown === "colors") return "multiply";
  return shown === "black" ? "black" : "none";
}

function buildMaterials(scene: BuiltScene, images: SceneImages): BlendMaterial[] {
  return scene.materials.map((draft, index): BlendMaterial => {
    const uvMaps = scene.materialUvs[index];
    const ref = (use: ImageUse | null, slot: "color" | "data"): TextureRef | null =>
      use
        ? {
            image: images.indexOf(use),
            uvSet: uvSetFor(uvMaps, use.uvMap),
            wrapU: use.wrap,
            wrapV: use.wrap,
            transform: use.transform,
            alpha: use.alpha,
            colorSpace: use.colorSpace ?? slotColorSpace(slot),
          }
        : null;
    const baseColorTexture = ref(draft.baseColorImage, "color");
    const metallicRoughnessTexture = ref(draft.metallicRoughnessImage, "data");
    const emissiveTexture = ref(draft.emissiveImage, "color");
    const colors = scene.materialColors[index];
    const baseColorUse = vertexColorUse(colors?.baseColor ?? null);
    const emissiveUse = vertexColorUse(colors?.emissive ?? null);
    const [red, green, blue, alpha] = draft.baseColor;
    return {
      name: draft.name,
      baseColor: baseColorUse === "black" ? [0, 0, 0, alpha] : [red, green, blue, alpha],
      baseColorTexture,
      metallic: draft.metallic,
      roughness: draft.roughness,
      metallicRoughnessTexture,
      roughnessTexture: ref(draft.roughnessImage, "data"),
      metalnessTexture: ref(draft.metalnessImage, "data"),
      normalTexture: ref(draft.normalImage, "data"),
      normalScale: draft.normalScale,
      emissive: emissiveUse === "black" ? [0, 0, 0] : draft.emissive,
      emissiveTexture,
      alphaMode: draft.alphaMode,
      alphaCutoff: draft.alphaCutoff,
      doubleSided: draft.doubleSided,
      vertexColors: { baseColor: baseColorUse, emissive: emissiveUse },
    };
  });
}

function buildClipList(clips: readonly ParsedClip[]): BlendClip[] {
  return clips.map((clip) => ({
    name: clip.name,
    duration: clip.duration,
    tracks: clip.tracks,
    curveKeyTimes: clip.curveTimes,
    fileFrames: clip.fileFrames,
  }));
}

function versionOf(file: BlendFile): string {
  return `${Math.floor(file.version / 100)}.${file.version % 100}`;
}

function unreadable(error: BlendParseError): BlendReadError {
  return new BlendReadError("unreadable", `Not a readable Blender file: ${error.message}`, error.message, {
    cause: error,
  });
}

async function parse(bytes: Uint8Array): Promise<BlendFile> {
  try {
    return readBlendFile(await decompressBlend(bytes));
  } catch (error) {
    if (error instanceof BlendParseError) throw unreadable(error);
    throw error;
  }
}

/** What `read` gives, with the errors of reading the file's scene as read errors. */
function readingScene<T>(read: () => T): T {
  try {
    return read();
  } catch (error) {
    if (error instanceof BlendParseError) throw unreadable(error);
    if (error instanceof BlendLimitError) {
      throw new BlendReadError("too-deep", `The scene ${error.message}`, error.message, { cause: error });
    }
    const reason = error instanceof Error ? error.message : String(error);
    throw new BlendReadError("failed", `Could not read the scene: ${reason}`, reason, { cause: error });
  }
}

function readScene(
  file: BlendFile,
  contents: SceneContents,
  isGray: GrayCheck,
): { scene: BuiltScene; clips: ParsedClip[] } {
  const actions = readActions(file);
  const scene = buildScene(file, isGray, contents, actions);
  return { scene, clips: buildClips(scene, actions, scene.warnings) };
}

/**
 * Reads the scene of a .blend file: its meshes, armatures, materials and actions, as Blender shows them at the scene's
 * start frame. Throws a `BlendReadError` for a file it cannot read.
 */
export async function readBlend(bytes: Uint8Array, options: ReadBlendOptions = {}): Promise<BlendScene> {
  const file = await parse(bytes);
  const blenderVersion = versionOf(file);
  if (file.version < OLDEST_VERSION) {
    throw new BlendReadError(
      "too-old",
      `Saved by Blender ${blenderVersion}; files from Blender 2.80 on can be read`,
      blenderVersion,
    );
  }
  const readImage: ReadImage = options.readImage ?? (() => Promise.resolve(null));
  const contents = readingScene(() => collectSceneObjects(file));
  const candidates = readingScene(() => grayCandidates(file, contents));
  const gray = await grayImages(file, candidates, readImage);
  const { scene, clips } = readingScene(() => readScene(file, contents, (image) => gray.get(image.offset) ?? null));
  const images = new SceneImages(file);
  const materials = buildMaterials(scene, images);
  return {
    blenderVersion,
    fps: scene.fps,
    unitScale: scene.unitScale,
    nodes: buildNodes(scene),
    meshes: scene.meshes,
    skeletons: scene.skeletons,
    materials,
    images: images.images,
    clips: buildClipList(clips),
    warnings: [
      ...scene.warnings,
      ...skinMotionWarnings(scene, clips),
      ...restPositionWarnings(scene, clips),
      ...driverWarnings(scene),
    ],
  };
}
