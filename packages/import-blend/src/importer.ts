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
  TextureColorSpace,
  TextureFile,
  TextureRef,
  TextureRefKey,
  TextureResolver,
  TextureSampling,
  TextureSlot,
  TopologyFingerprint,
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
  topologyFingerprint,
  unshownUvSetWarnings,
} from "@arcue/scene";
import { BlendReadError } from "./blend/errors";
import { readBlend } from "./read-blend";
import { joinWarningsById, normalizedPath, shareFoundTextures } from "./texture-files";
import type {
  BlendClip,
  BlendImage,
  BlendMaterial,
  BlendMesh,
  BlendScene,
  TextureRef as BlendTextureRef,
} from "./types";

/** Blender's own rotation for Z-up content in a Y-up scene: −90° about X. */
const MINUS_90_ABOUT_X: [number, number, number, number] = [-Math.SQRT1_2, 0, 0, Math.SQRT1_2];
/** The gray Blender's default material shows, for a base color whose image is missing. */
const UNTEXTURED = 0.8;
/** The roughness Blender's default material shows, for a packed metallic-roughness image that is missing. */
const UNTEXTURED_ROUGHNESS = 0.5;

function buildNodes(scene: BlendScene): SceneNode[] {
  const paths = buildNodePaths(scene.nodes);
  return scene.nodes.map((node, index) => ({
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

/**
 * The fingerprint of a mesh's faces: each face fanned from its first corner, in the triangles' order, so that it does
 * not change with the positions that pick Blender's split, and triangle n stays in the face it is in.
 */
function fanFingerprint(mesh: BlendMesh): TopologyFingerprint {
  const { offsets, vertices } = mesh.faces;
  const indices = new Uint32Array(mesh.triangleFaces.length * 3);
  let fan = 0;
  for (let position = 0; position < mesh.triangleFaces.length; position++) {
    const face = mesh.triangleFaces[position] ?? 0;
    fan = position > 0 && mesh.triangleFaces[position - 1] === face ? fan + 1 : 0;
    const start = offsets[face] ?? 0;
    indices[position * 3] = vertices[start] ?? 0;
    indices[position * 3 + 1] = vertices[start + fan + 1] ?? 0;
    indices[position * 3 + 2] = vertices[start + fan + 2] ?? 0;
  }
  return topologyFingerprint({
    indices,
    sourceVertex: Uint32Array.from({ length: mesh.sourceVertexCount }, (_, vertex) => vertex),
    sourceVertexCount: mesh.sourceVertexCount,
  });
}

function buildMesh(mesh: BlendMesh): Mesh {
  return {
    name: mesh.name,
    geometryName: mesh.dataName,
    positions: mesh.positions,
    normals: mesh.normals,
    uvs: mesh.uvs,
    colors: mesh.colors,
    skeleton: mesh.skin?.skeleton ?? null,
    bindMatrix: mesh.skin?.bindMatrix ?? null,
    joints: mesh.skin?.joints ?? null,
    weights: mesh.skin?.weights ?? null,
    indices: mesh.indices,
    groups: mesh.groups,
    morphTargets: mesh.morphTargets.map(({ name, defaultWeight, positions, normals }) => ({
      name,
      defaultWeight,
      positions,
      normals,
    })),
    sourceVertex: mesh.sourceVertex,
    sourceVertexCount: mesh.sourceVertexCount,
    topology: fanFingerprint(mesh),
    restPositions: mesh.restPositions,
    skinWeights: mesh.skin?.sourceWeights ?? null,
  };
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

/** The paths an image stores for one file, as a texture file holds them. */
type StoredPaths = Pick<TextureFile, "relative" | "absolute">;

function storedPaths(image: BlendImage): StoredPaths {
  return { relative: image.path, absolute: image.relative ? "" : image.path };
}

/**
 * The texture files the materials use: one for each image file found through a relative path, however many images
 * store a path to it and however they spell it, one for each other stored path, however it is spelled, and one for each
 * image of packed bytes. Absolute paths keep their own texture files, so the textures note each of them.
 */
class ImageFiles {
  readonly files: TextureFile[] = [];
  readonly #index = new Map<string, number>();
  readonly #images: readonly BlendImage[];
  readonly #locateFile: LocateFile;

  constructor(images: readonly BlendImage[], locateFile: LocateFile) {
    this.#images = images;
    this.#locateFile = locateFile;
  }

  async indexOf(index: number): Promise<number | null> {
    const image = this.#images[index];
    if (!image || image.source === "none") return null;
    const paths = storedPaths(image);
    if (image.source === "packed") return this.#add(`packed image ${index}`, paths, image.packed);
    const spelled = `path ${normalizedPath(paths.relative)}`;
    const known = this.#index.get(spelled);
    if (known !== undefined) return known;
    const located = parseStoredPath(paths.relative).relative === null ? null : await this.#locateFile(paths.relative);
    const file = this.#add(located === null ? spelled : `found ${located}`, paths, null);
    this.#index.set(spelled, file);
    return file;
  }

  #add(key: string, paths: StoredPaths, content: Uint8Array | null): number {
    const known = this.#index.get(key);
    if (known !== undefined) return known;
    this.files.push({ ...paths, linked: true, content });
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
function samplingOf(ref: BlendTextureRef, key: TextureRefKey): TextureSampling {
  const sampling: TextureSampling = { uvSet: ref.uvSet, wrapU: ref.wrapU, wrapV: ref.wrapV, transform: ref.transform };
  const unset = unsetSampling(key);
  if (ref.alpha !== unset.alpha) sampling.alpha = ref.alpha;
  if (ref.colorSpace !== unset.colorSpace) sampling.colorSpace = ref.colorSpace;
  return sampling;
}

async function buildMaterials(
  materials: readonly BlendMaterial[],
  images: ImageFiles,
  textures: TextureResolver,
): Promise<Material[]> {
  const result: Material[] = [];
  for (const source of materials) {
    const missingTextures: Partial<Record<TextureSlot, string>> = {};
    const missingTextureSampling: Partial<Record<TextureSlot, TextureSampling>> = {};
    const ref = async (blendRef: BlendTextureRef | null, key: TextureRefKey): Promise<TextureRef | null> => {
      if (!blendRef) return null;
      const file = await images.indexOf(blendRef.image);
      if (file === null) return null;
      const slot = TEXTURE_SLOTS.find((candidate) => TEXTURE_SLOT_KEYS[candidate] === key);
      const sampling = samplingOf(blendRef, key);
      const texture = await textures.resolve(file, source.name, slot);
      if (texture !== null) return { texture, ...sampling };
      if (slot) {
        missingTextures[slot] = textures.storedPath(file);
        missingTextureSampling[slot] = sampling;
      }
      return null;
    };
    const baseColorTexture = await ref(source.baseColorTexture, "baseColorTexture");
    const metallicRoughnessTexture = await ref(source.metallicRoughnessTexture, "metallicRoughnessTexture");
    const emissiveTexture = await ref(source.emissiveTexture, "emissiveTexture");
    const missingPacked = source.metallicRoughnessTexture !== null && !metallicRoughnessTexture;
    const { baseColor: baseColorUse, emissive: emissiveUse } = source.vertexColors;
    const [red, green, blue, alpha] = source.baseColor;
    const material: Material = {
      name: source.name,
      baseColor:
        baseColorUse === "black" || baseColorTexture || !source.baseColorTexture
          ? [red, green, blue, alpha]
          : [UNTEXTURED, UNTEXTURED, UNTEXTURED, alpha],
      baseColorTexture,
      metallic: missingPacked ? 0 : source.metallic,
      roughness: missingPacked ? UNTEXTURED_ROUGHNESS : source.roughness,
      metallicRoughnessTexture,
      roughnessTexture: await ref(source.roughnessTexture, "roughnessTexture"),
      metalnessTexture: await ref(source.metalnessTexture, "metalnessTexture"),
      normalTexture: await ref(source.normalTexture, "normalTexture"),
      normalScale: source.normalScale,
      occlusionTexture: null,
      emissive: !emissiveTexture && source.emissiveTexture ? [0, 0, 0] : source.emissive,
      emissiveTexture,
      alphaMode: source.alphaMode,
      alphaCutoff: source.alphaCutoff,
      doubleSided: source.doubleSided,
    };
    if (baseColorUse === "multiply" || emissiveUse === "multiply") {
      material.vertexColors = { baseColor: baseColorUse === "multiply", emissive: emissiveUse === "multiply" };
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
function buildClipList(clips: readonly BlendClip[], fps: number): Clip[] {
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
      keyTimes: mergeKeyTimes(clip.curveKeyTimes),
      keyedEveryFrame: isKeyedEveryFrame(clip.curveKeyTimes, fps, frameCount),
      ...(step === 1 ? { sourceStartFrame: start } : {}),
    };
  });
}

type DraftWarning = Pick<ImportWarning, "code" | "subject" | "message" | "detail">;

function unique(texts: readonly string[]): string[] {
  return [...new Set(texts)];
}

/**
 * One warning for each code and subject, since a review keeps one warning per id: several, such as two ways a mesh
 * deforms differently, join their distinct messages and details.
 */
function mergeWarnings(warnings: readonly DraftWarning[]): DraftWarning[] {
  const groups = new Map<string, DraftWarning[]>();
  for (const warning of warnings) {
    const key = JSON.stringify([warning.code, warning.subject.kind, warning.subject.name]);
    groups.set(key, [...(groups.get(key) ?? []), warning]);
  }
  return [...groups.values()].flatMap((group) => {
    const [first, ...rest] = group;
    if (!first) return [];
    if (rest.length === 0) return [first];
    const details = group.flatMap((warning) => (warning.detail === undefined ? [] : [warning.detail]));
    const merged: DraftWarning = { ...first, message: unique(group.map((warning) => warning.message)).join("; ") };
    if (details.length > 0) merged.detail = unique(details).join("; ");
    return [merged];
  });
}

function toImportWarning(warning: DraftWarning, fileName: string): ImportWarning {
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

/** Arcue's error for a file the reader refuses. */
function arcueError(request: ImportRequest, error: BlendReadError): ArcueError {
  const { fileName } = request;
  const cause = error.cause ?? error;
  switch (error.reason) {
    case "unreadable":
      return new ArcueError("invalid-input", `${fileName} is not a readable Blender file: ${error.detail}`, { cause });
    case "too-old":
      return new ArcueError(
        "invalid-input",
        `${fileName} was saved by Blender ${error.detail}. Arcue opens files from Blender 2.80 on; save it in a newer Blender.`,
      );
    case "too-deep":
      return new ArcueError("invalid-input", `${fileName} ${error.detail}, more than Arcue can show.`, { cause });
    case "failed":
      return new ArcueError("internal", `Arcue could not read the scene in ${fileName}: ${error.detail}`, { cause });
  }
}

async function readScene(request: ImportRequest, findFile: FindFile): Promise<BlendScene> {
  try {
    return await readBlend(request.bytes, { readImage: async (path) => (await findFile(path))?.bytes ?? null });
  } catch (error) {
    if (error instanceof BlendReadError) throw arcueError(request, error);
    throw error;
  }
}

/** Parts whose every mesh Blender hides start hidden, so the view matches Blender's. */
function hideBlenderHiddenParts(parts: ScenePart[], scene: BlendScene): ScenePart[] {
  const hiddenMeshes = new Set(scene.nodes.flatMap((node) => (node.hidden && node.mesh !== null ? [node.mesh] : [])));
  return parts.map((part) => {
    const meshes = part.levels.flatMap((level) => level.meshes);
    const hidden = meshes.length > 0 && meshes.every((mesh) => hiddenMeshes.has(mesh));
    return hidden ? { ...part, hiddenByDefault: true } : part;
  });
}

async function importBlend(request: ImportRequest): Promise<SceneDescription> {
  const { findFile, locateFile } = searchingOnce(request);
  const scene = await readScene(request, findFile);
  const images = new ImageFiles(scene.images, locateFile);
  const textures = createTextureResolver(images.files, findFile, locateFile);
  const materials = await buildMaterials(scene.materials, images, textures);
  const nodes = buildNodes(scene);
  const meshes = scene.meshes.map(buildMesh);
  const parts = hideBlenderHiddenParts(describeParts(nodes), scene);
  const warnings = mergeWarnings([...scene.warnings, ...unshownUvSetWarnings(materials)]).map((warning) =>
    toImportWarning(warning, request.fileName),
  );
  const shared = shareFoundTextures(textures.textures, materials);
  return {
    source: {
      format: "blend",
      exporter: { name: "Blender", version: scene.blenderVersion },
      fps: scene.fps,
      originalSpace: { axes: { right: "+X", up: "+Z", front: "-Y" }, unitMeters: scene.unitScale },
      conversion: { scale: scene.unitScale, rotation: MINUS_90_ABOUT_X },
      warnings: [...warnings, ...joinWarningsById(await textures.warnings())],
    },
    nodes,
    meshes,
    skeletons: scene.skeletons,
    materials: shared.materials,
    textures: shared.textures,
    clips: buildClipList(scene.clips, scene.fps),
    parts,
    bounds: defaultViewBounds(meshes, parts),
  };
}

export const blendImporter: Importer = {
  format: "blend",
  extensions: [".blend"],
  import: importBlend,
};
