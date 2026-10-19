import type { BlendStruct } from "../blend/file.js";
import { idName } from "../blend/ids.js";
import type { AlphaMode, TextureAlpha, TextureColorSpace, UvTransform, Vec3, Vec4, WrapMode } from "../types.js";
import type { Affine } from "./mapping.js";
import { composeAffine, IDENTITY, mappingAffine, uvTransformOf } from "./mapping.js";
import type { ShaderGraph } from "./shader-graph.js";
import {
  constantOf,
  graphOf,
  inputSocket,
  isEmptyImageNode,
  linkedOutput,
  NODE_DO_OUTPUT,
  nodeLabel,
  nodeType,
  outputSocket,
  readOutputs,
  SocketType,
  socketType,
  socketValue,
  upstreamNode,
} from "./shader-graph.js";

export const IMAGE_SOURCE_FILE = 1;
export const IMAGE_SOURCE_SEQUENCE = 2;
export const IMAGE_SOURCE_TILED = 6;
const IMAGE_SOURCES: Readonly<Record<number, string>> = {
  3: "a movie",
  4: "a generated image",
  5: "a viewer image",
};
const TANGENT_SPACE = 0;
const NORMAL_SPACES: Readonly<Record<number, string>> = { 1: "object", 2: "world", 3: "object", 4: "world" };

/** The image's packed file, from the list newer files keep or the single pointer older ones do. */
export function packedFile(image: BlendStruct): BlendStruct | null {
  return image.deref("packedfile") ?? image.list("packedfiles")[0]?.deref("packedfile") ?? null;
}

/** An Image Texture node a material samples. */
export interface ImageUse {
  node: BlendStruct;
  image: BlendStruct;
  /** The UV map a UV Map node names, or null for the mesh's default UV map. */
  uvMap: string | null;
  wrap: WrapMode;
  transform: UvTransform | null;
  /** The coordinates the image samples when they are not a UV map, such as "Generated", which the preview cannot. */
  coordinates: string | null;
  /** Whether the image is transparent outside its edges, Blender's Clip extension, which the preview shows as Extend. */
  clipped: boolean;
  /** Box, Sphere or Tube projection, which the preview shows as flat, or null for flat. */
  projection: string | null;
  /** Closest, Cubic or Smart sampling, which the preview samples as Linear, or null for Linear. */
  interpolation: string | null;
  /** What the material does with the image's alpha. */
  alpha: TextureAlpha;
  /** How the preview decodes the image to show it as Blender does, or null for the slot's own way. */
  colorSpace: TextureColorSpace | null;
  /** For an image sequence, the frame Blender reads at the scene's start frame; null for other images. */
  frame: number | null;
}

export interface MaterialDraft {
  name: string;
  baseColor: Vec4;
  baseColorImage: ImageUse | null;
  /** The color attribute that multiplies the base color, as a Color Attribute node names it: "" for the default. */
  baseColorAttribute: string | null;
  metallic: number;
  roughness: number;
  /** One image holding roughness in green and metalness in blue, as glTF packs them. */
  metallicRoughnessImage: ImageUse | null;
  roughnessImage: ImageUse | null;
  metalnessImage: ImageUse | null;
  normalImage: ImageUse | null;
  normalScale: number;
  /** The UV map the Normal Map node takes its tangents from, or null for the mesh's default. */
  normalTangentUv: string | null;
  /** The emission color times its strength, which multiplies an emission image. */
  emissive: Vec3;
  emissiveImage: ImageUse | null;
  /** The color attribute that multiplies the emission, as a Color Attribute node names it: "" for the default. */
  emissiveAttribute: string | null;
  alphaMode: AlphaMode;
  alphaCutoff: number;
  doubleSided: boolean;
  /** What the preview shows differently from Blender, for people. */
  approximations: string[];
}

const OUTPUT_FOR_ALL = 0;
const OUTPUT_FOR_EEVEE = 1;
const OUTPUT_FOR_CYCLES = 2;
const BACKFACE_CULLING = 1 << 2;
const BLEND_METHOD_CLIP = 3;
const BLEND_METHOD_HASHED = 4;
const RENDER_METHOD_DITHERED = 0;
/** The first version whose EEVEE draws transparency by the material's render method rather than its blend mode. */
const RENDER_METHOD_VERSION = 402;
const MIX_MULTIPLY = 2;
const MATH_SUBTRACT = 1;
const MATH_MULTIPLY = 2;
const MATH_ROUND = 14;
const MATH_LESS_THAN = 15;
const MATH_GREATER_THAN = 16;
/** What a strict comparison adds to its cutoff, as the preview keeps alpha that equals the cutoff. */
const STRICT = 1e-6;
/** The Metallic BSDF's Fresnel type that takes its color from IOR and Extinction instead of Base Color. */
const PHYSICAL_CONDUCTOR = 0;
const SEPARATE_RGB = 0;
const SEPARATED_CHANNELS: Readonly<Record<number, readonly string[]>> = {
  1: ["Hue", "Saturation", "Value"],
  2: ["Hue", "Saturation", "Lightness"],
};
/** The color channel each output of a Separate node reads, from a color or from the vector a color converts to. */
const CHANNEL_INDEX: ReadonlyMap<string, number> = new Map([
  ["Red", 0],
  ["R", 0],
  ["X", 0],
  ["Green", 1],
  ["G", 1],
  ["Y", 1],
  ["Blue", 2],
  ["B", 2],
  ["Z", 2],
]);
const CHANNEL_NAMES = ["red", "green", "blue"] as const;
/** The channels of a Separate node in HSV or HSL mode that equal a gray color. */
const GRAY_CHANNELS = new Set(["Value", "Lightness"]);
const GREEN = 1;
const BLUE = 2;
const ALPHA_STRAIGHT = 0;
const ALPHA_PREMULTIPLIED = 1;
const ALPHA_IGNORE = 3;
/** The color spaces Blender reads as data, which it never multiplies by their alpha. */
const DATA_SPACES = new Set(["Non-Color", "Raw", "Generic Data"]);
/** The color spaces the preview decodes exactly, as sRGB or as the values they store. */
const EXACT_DECODINGS: ReadonlyMap<string, TextureColorSpace> = new Map([
  ["sRGB", "srgb"],
  ["Non-Color", "linear"],
  ["Raw", "linear"],
  ["Generic Data", "linear"],
  ["Linear", "linear"],
  ["Linear Rec.709", "linear"],
  ["scene_linear", "linear"],
]);
/** Color spaces with sRGB's curve but other primaries, which the preview decodes as sRGB. */
const SRGB_CURVES = new Set(["Display P3", "sRGB Encoded AP1", "sRGB Encoded P3-D65"]);
/** Linear color spaces whose names do not start with "Linear", which the preview decodes as Linear Rec.709. */
const LINEAR_SPACES = new Set(["ACEScg", "ACES2065-1", "XYZ"]);

const WRAPS: readonly WrapMode[] = ["repeat", "clamp", "clamp", "mirror"];
const EXTENSION_CLIP = 2;
const PROJECTIONS: Readonly<Record<number, string>> = { 1: "Box", 2: "Sphere", 3: "Tube" };
/** The most nodes the preview follows up an image's vector input. */
const MAX_VECTOR_NODES = 16;
/** The most nodes the preview looks through from an input to the image that feeds it. */
const MAX_FEEDING_NODES = 16;
/** The most mix, add and Shader to RGB nodes the preview looks through from the surface to a shader. */
const MAX_SURFACE_DEPTH = 16;
const INTERPOLATIONS: Readonly<Record<number, string>> = { 1: "Closest", 2: "Cubic", 3: "Smart" };
const SIMPLE_SHADERS = new Set([
  "ShaderNodeEmission",
  "ShaderNodeBsdfDiffuse",
  "ShaderNodeBsdfGlossy",
  "ShaderNodeBsdfAnisotropic",
]);
const METAL_SHADERS = new Set(["ShaderNodeBsdfGlossy", "ShaderNodeBsdfAnisotropic", "ShaderNodeBsdfMetallic"]);
/**
 * How much of an image a gray check reads: "whole" to tell whether every pixel is gray, or "sample" to tell only whether
 * one is not, which it looks for among the image's first pixels.
 */
export type GrayRead = "whole" | "sample";
/**
 * Whether every pixel of an image is gray: true, false where a pixel is known not to be, or null where the check cannot
 * tell. It decides whether the preview can show one value of the image as its color, or notes where it shows one value
 * of a colored image whose brightness Blender reads.
 */
export type GrayCheck = (image: BlendStruct, read: GrayRead) => boolean | null;

/** The images a material samples. */
export function imageUses(draft: MaterialDraft): ImageUse[] {
  return [
    draft.baseColorImage,
    draft.metallicRoughnessImage,
    draft.roughnessImage,
    draft.metalnessImage,
    draft.normalImage,
    draft.emissiveImage,
  ].filter((use): use is ImageUse => use !== null);
}

/** The material Blender shows for an empty slot. */
export function defaultMaterial(name = "Default"): MaterialDraft {
  return {
    name,
    baseColor: [0.8, 0.8, 0.8, 1],
    baseColorImage: null,
    baseColorAttribute: null,
    metallic: 0,
    roughness: 0.5,
    metallicRoughnessImage: null,
    roughnessImage: null,
    metalnessImage: null,
    normalImage: null,
    normalScale: 1,
    normalTangentUv: null,
    emissive: [0, 0, 0],
    emissiveImage: null,
    emissiveAttribute: null,
    alphaMode: "opaque",
    alphaCutoff: 0.5,
    doubleSided: true,
    approximations: [],
  };
}

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

/** The input's value where it is constant, else the value set on it, which Blender ignores while nodes drive it. */
function inputValue(graph: ShaderGraph, socket: BlendStruct | null, fallback: readonly number[]): number[] {
  const values = socket ? (constantOf(graph, socket) ?? socketValue(socket)) : [];
  return fallback.map((value, index) => values[index] ?? value);
}

function scalarOf(graph: ShaderGraph, socket: BlendStruct | null, fallback: number): number {
  return inputValue(graph, socket, [fallback])[0] ?? fallback;
}

const PASS_THROUGH = new Set([
  "ShaderNodeMix",
  "ShaderNodeMixRGB",
  "ShaderNodeHueSaturation",
  "ShaderNodeBrightContrast",
  "ShaderNodeGamma",
  "ShaderNodeInvert",
  "ShaderNodeRGBCurve",
  "ShaderNodeSeparateColor",
  "ShaderNodeSeparateRGB",
  "ShaderNodeSeparateXYZ",
  "ShaderNodeMath",
  "ShaderNodeMapRange",
  "ShaderNodeValToRGB",
  "ShaderNodeRGBToBW",
]);

/** Pass-through nodes that only pick or convert channels, which leave an image's values as the preview reads them. */
const KEEPS_VALUES = new Set([
  "ShaderNodeSeparateColor",
  "ShaderNodeSeparateRGB",
  "ShaderNodeSeparateXYZ",
  "ShaderNodeRGBToBW",
]);
const SEPARATES = new Set(["ShaderNodeSeparateColor", "ShaderNodeSeparateRGB", "ShaderNodeSeparateXYZ"]);

/** A node between an image and the input it feeds, and the output it feeds from. */
interface Step {
  node: BlendStruct;
  output: string;
}

/** An Image Texture node that feeds an input, the output it feeds from and the nodes between. */
interface FedImage {
  node: BlendStruct;
  /** The image node's output, such as "Color" or "Alpha". */
  output: string;
  /** Each node between, nearest the input first. */
  via: Step[];
  /** Names of the nodes between that change the image's values, such as "Hue/Saturation/Value". */
  changes: string[];
  /** Whether every link on the way carries a color, not one value such as a channel, the alpha or the brightness. */
  color: boolean;
}

const SCALAR_SOCKETS: ReadonlySet<number> = new Set([SocketType.float, SocketType.int, SocketType.boolean]);

/** What a search upstream from an input finds: the image that feeds it, or none and whether it stopped at the limit. */
interface Feeding {
  found: FedImage | null;
  /** Whether the search stopped at `MAX_FEEDING_NODES` before it ended. */
  cut: boolean;
}

const NOT_FED: Feeding = { found: null, cut: false };
const CUT: Feeding = { found: null, cut: true };
/** For each graph, the searches from each input, by the input's offset, whether they keep to color and their depth. */
const feedings = new WeakMap<ShaderGraph, Map<string, Feeding>>();

function feedingMemo(graph: ShaderGraph): Map<string, Feeding> {
  let memo = feedings.get(graph);
  if (!memo) {
    memo = new Map();
    feedings.set(graph, memo);
  }
  return memo;
}

/**
 * Follows a socket upstream through color adjustments to the Image Texture node that feeds it, with `colorOnly` only
 * along links that carry a color. Each input of a graph is searched once at each depth, however many inputs and
 * searches share it.
 */
function feeding(graph: ShaderGraph, socket: BlendStruct | null, colorOnly: boolean, depth = 0): Feeding {
  const source = linkedOutput(graph, socket);
  if (!socket || !source) return NOT_FED;
  const color = !SCALAR_SOCKETS.has(socketType(socket)) && !SCALAR_SOCKETS.has(socketType(source.socket));
  if (colorOnly && !color) return NOT_FED;
  const type = nodeType(source.node);
  if (type !== "ShaderNodeTexImage" && !PASS_THROUGH.has(type)) return NOT_FED;
  if (depth > MAX_FEEDING_NODES) return CUT;
  if (type === "ShaderNodeTexImage") {
    if (isEmptyImageNode(source.node)) return NOT_FED;
    return { found: { node: source.node, output: source.name, via: [], changes: [], color }, cut: false };
  }
  const memo = feedingMemo(graph);
  const key = `${socket.offset} ${colorOnly} ${depth}`;
  const known = memo.get(key);
  if (known) return known;
  let result: Feeding = NOT_FED;
  for (const input of source.node.list("inputs")) {
    const fed = feeding(graph, input, colorOnly, depth + 1);
    if (!fed.found) {
      if (fed.cut) result = CUT;
      continue;
    }
    const change = KEEPS_VALUES.has(type) ? [] : [nodeLabel(source.node)];
    const found: FedImage = {
      ...fed.found,
      via: [{ node: source.node, output: source.name }, ...fed.found.via],
      changes: [...change, ...fed.found.changes],
      color: color && fed.found.color,
    };
    result = { found, cut: false };
    break;
  }
  memo.set(key, result);
  return result;
}

function imageFeeding(graph: ShaderGraph, socket: BlendStruct | null): FedImage | null {
  return feeding(graph, socket, false).found;
}

/** Whether the search from an input up to the image that feeds it stops at `MAX_FEEDING_NODES` before it ends. */
function passesFeedingLimit(graph: ShaderGraph, socket: BlendStruct): boolean {
  return feeding(graph, socket, false).cut;
}

/**
 * The Image Texture node a color input reads: by a way whose links all carry its color where there is one, else by a
 * way that carries one value of it.
 */
function colorFeeding(graph: ShaderGraph, socket: BlendStruct | null): FedImage | null {
  return feeding(graph, socket, true).found ?? imageFeeding(graph, socket);
}

function imageName(found: FedImage): string {
  const image = found.node.deref("id");
  return image ? idName(image) : "an image";
}

/** Notes an input that nodes other than an image or a constant drive, which the preview shows at its own value. */
function noteNodeInput(
  graph: ShaderGraph,
  draft: MaterialDraft,
  input: string,
  socket: BlendStruct | null,
  found: FedImage | null,
): void {
  if (found || !socket || constantOf(graph, socket)) return;
  const source = linkedOutput(graph, socket);
  if (!source) return;
  const through = passesFeedingLimit(graph, socket) ? ` through more than ${MAX_FEEDING_NODES} nodes` : "";
  draft.approximations.push(
    `${input} comes from ${nodeLabel(source.node)}${through}, shown at the value set on the input`,
  );
}

/** The image an input samples, noting on the draft any nodes between that change its values. */
function imageInput(graph: ShaderGraph, draft: MaterialDraft, input: string, found: FedImage | null): ImageUse | null {
  if (!found) return null;
  noteChanges(draft, input, found);
  return imageUse(graph, draft, found.node);
}

/** One Mapping node's map, or null with a note on the draft when the preview cannot follow it. */
function mappingStep(graph: ShaderGraph, draft: MaterialDraft, image: string, mapping: BlendStruct): Affine | null {
  const values = { location: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] };
  const sockets = { location: "Location", rotation: "Rotation", scale: "Scale" } as const;
  for (const key of ["location", "rotation", "scale"] as const) {
    const socket = inputSocket(mapping, sockets[key]);
    if (!socket) continue;
    const constant = constantOf(graph, socket);
    if (!constant) {
      const from = nodeLabel(linkedOutput(graph, socket)?.node ?? mapping);
      draft.approximations.push(`${image}'s Mapping takes its ${key} from ${from}, shown without the Mapping`);
      return null;
    }
    values[key] = values[key].map((value, index) => constant[index] ?? value);
  }
  const [x = 0, y = 0, z = 0] = values.location;
  const [turnX = 0, turnY = 0, turnZ = 0] = values.rotation;
  const [scaleX = 1, scaleY = 1, scaleZ = 1] = values.scale;
  const type = mapping.number("custom1");
  const affine = mappingAffine(type, [x, y, z], [turnX, turnY, turnZ], [scaleX, scaleY, scaleZ]);
  if (!affine) draft.approximations.push(`${image}'s Mapping is of the Normal type, shown without the Mapping`);
  return affine;
}

function imageUse(graph: ShaderGraph, draft: MaterialDraft, node: BlendStruct): ImageUse | null {
  const image = node.deref("id");
  if (!image) return null;
  const name = idName(image);
  const storage = node.deref("storage");
  const extension = storage?.number("extension") ?? 0;
  const wrap = WRAPS[extension] ?? "repeat";
  let uvMap: string | null = null;
  let coordinates: string | null = null;
  let affine: Affine = IDENTITY;
  let mappings = 0;
  let followed = true;
  let source = linkedOutput(graph, inputSocket(node, "Vector"));
  let depth = 0;
  for (; source && depth < MAX_VECTOR_NODES; depth++) {
    const type = nodeType(source.node);
    if (type === "ShaderNodeUVMap") {
      uvMap = source.node.deref("storage")?.string("uv_map") || null;
      break;
    }
    if (type === "ShaderNodeMapping") {
      const step = mappingStep(graph, draft, name, source.node);
      mappings++;
      if (step) affine = composeAffine(affine, step);
      else followed = false;
      source = linkedOutput(graph, inputSocket(source.node, "Vector"));
      if (!source) {
        draft.approximations.push(`${name}'s Mapping has no vector input, shown with the UV map`);
        followed = false;
      }
      continue;
    }
    if (type !== "ShaderNodeTexCoord") coordinates = nodeLabel(source.node);
    else if (source.name !== "UV") coordinates = source.name;
    break;
  }
  if (source && depth === MAX_VECTOR_NODES) {
    draft.approximations.push(
      `${name}'s vector passes ${MAX_VECTOR_NODES} Mapping nodes or more, shown with the UV map`,
    );
    followed = false;
  }
  let transform: UvTransform | null = null;
  if (mappings > 0 && followed) {
    const mapped = uvTransformOf(affine);
    transform = mapped.transform;
    if (mapped.skewed) draft.approximations.push(`${name}'s Mapping shears it, which the preview leaves out`);
  }
  const projection = PROJECTIONS[storage?.number("projection") ?? 0] ?? null;
  const interpolation = INTERPOLATIONS[storage?.number("interpolation") ?? 0] ?? null;
  const clipped = extension === EXTENSION_CLIP;
  return {
    node,
    image,
    uvMap,
    wrap,
    transform,
    coordinates,
    clipped,
    projection,
    interpolation,
    alpha: "none",
    colorSpace: decodingOf(colorSpaceName(image))?.colorSpace ?? null,
    frame: null,
  };
}

function colorSpaceName(image: BlendStruct): string {
  return image.struct("colorspace_settings")?.string("name") ?? "";
}

/**
 * How the preview decodes an image of a Blender color space, and whether that shows its colors as Blender does rather
 * than only its curve; null for a space it cannot decode, and exact for no space, which leaves the slot's own way.
 */
function decodingOf(space: string): { colorSpace: TextureColorSpace | null; exact: boolean } | null {
  if (space === "") return { colorSpace: null, exact: true };
  const exact = EXACT_DECODINGS.get(space);
  if (exact) return { colorSpace: exact, exact: true };
  if (SRGB_CURVES.has(space)) return { colorSpace: "srgb", exact: false };
  if (LINEAR_SPACES.has(space) || space.startsWith("Linear ")) return { colorSpace: "linear", exact: false };
  return null;
}

function isOutput(node: BlendStruct): boolean {
  return nodeType(node) === "ShaderNodeOutputMaterial";
}

/** Blender's `ntreeShaderOutputNode` for EEVEE: an output for EEVEE over one for all engines, the active one first. */
function outputNode(graph: ShaderGraph): BlendStruct | null {
  let chosen: BlendStruct | null = null;
  const active = (node: BlendStruct) => (node.number("flag") & NODE_DO_OUTPUT) !== 0;
  for (const node of graph.nodes) {
    if (!isOutput(node)) continue;
    const target = node.number("custom1");
    if (target !== OUTPUT_FOR_ALL && target !== OUTPUT_FOR_EEVEE) continue;
    const replaces =
      chosen === null ||
      (target === OUTPUT_FOR_EEVEE && chosen.number("custom1") === OUTPUT_FOR_ALL) ||
      (target === chosen.number("custom1") && active(node) && !active(chosen));
    if (replaces) chosen = node;
  }
  return chosen;
}

/** A shader the surface reaches through mix and add shaders, with its share of the surface. */
interface Leaf {
  node: BlendStruct;
  weight: number;
  /** The shader input that reads a color or a value, which Blender shows as light, or null where a shader feeds it. */
  emitted: BlendStruct | null;
}

/** Whether a shader only gives light: an Emission shader, or a color or value where a shader is expected. */
function onlyLight(leaf: Leaf): boolean {
  return leaf.emitted !== null || nodeType(leaf.node) === "ShaderNodeEmission";
}

function strongest(leaves: readonly Leaf[]): Leaf | null {
  return leaves.reduce<Leaf | null>((best, leaf) => (best === null || leaf.weight > best.weight ? leaf : best), null);
}

interface SurfaceShader {
  /** The shader the preview shows: the strongest that is not only light, else the strongest light. */
  shown: Leaf | null;
  /** The other shaders, whose light the preview adds to the shown one's. */
  others: Leaf[];
  /** How much of the surface is not a Transparent BSDF, from the mix and add shaders that lead to it. */
  alpha: number;
  /** Image alphas that mix the surface with a Transparent BSDF. */
  alphaImages: ImageAlpha[];
  /** What the preview shows differently from Blender's shader mix. */
  notes: string[];
}

function isTransparent(graph: ShaderGraph, socket: BlendStruct | null): boolean {
  const source = linkedOutput(graph, socket);
  return source !== null && nodeType(source.node) === "ShaderNodeBsdfTransparent";
}

type LinkedOutput = NonNullable<ReturnType<typeof linkedOutput>>;

/**
 * What the surface makes of a node's share: a shader's, a see-through part, a share it passes on, with the image
 * alpha that mixes in a Transparent BSDF, or nothing past `MAX_SURFACE_DEPTH`.
 */
type SurfaceRole =
  | { kind: "shader"; emitted: BlendStruct | null }
  | { kind: "clear" }
  | { kind: "passes"; alpha: ImageAlpha | null }
  | { kind: "deep" };

/** A node the surface reaches, read once however many ways lead to it. */
interface SurfaceNode {
  source: LinkedOutput;
  /** The fewest mix, add and Shader to RGB nodes between it and the surface. */
  depth: number;
  role: SurfaceRole;
  notes: string[];
  /** The inputs it passes its share to, with the part of the share each gets. */
  inputs: [socket: BlendStruct | null, part: number][];
  /** The nodes those inputs read, by key. */
  reads: SurfaceRead[];
}

interface SurfaceRead {
  key: number;
  part: number;
}

/** How the surface reads the node whose output `socket` reads, with the inputs it passes its share to. */
function surfaceStep(
  graph: ShaderGraph,
  socket: BlendStruct,
  source: LinkedOutput,
): Pick<SurfaceNode, "role" | "notes" | "inputs"> {
  const node = source.node;
  const type = nodeType(node);
  const [first = null, second = null, third = null] = node.list("inputs");
  const emitted = socketType(source.socket) !== SocketType.shader;
  if (emitted || type === "ShaderNodeEmission") {
    const toon = toonSource(graph, emitted ? socket : inputSocket(node, "Color"));
    if (!toon) return { role: { kind: "shader", emitted: emitted ? socket : null }, notes: [], inputs: [] };
    const shader = emitted ? "Its surface" : nodeLabel(node);
    const note = `${shader} takes its color from ${nodeLabel(toon)}, shown as the shader it reads`;
    return { role: { kind: "passes", alpha: null }, notes: [note], inputs: [[inputSocket(toon, "Shader"), 1]] };
  }
  if (type === "ShaderNodeMixShader") {
    const mix: AlphaSource = first ? alphaSource(graph, first) : { kind: "constant", value: 0.5 };
    if (mix.kind === "image" && isTransparent(graph, second)) {
      return { role: { kind: "passes", alpha: mix }, notes: [], inputs: [[third, 1]] };
    }
    const notes = mix.kind === "constant" ? [] : [`${nodeLabel(node)} mixes by nodes, shown half and half`];
    const factor = mix.kind === "constant" ? mix.value : 0.5;
    const inputs: SurfaceNode["inputs"] = [
      [second, 1 - factor],
      [third, factor],
    ];
    return { role: { kind: "passes", alpha: null }, notes, inputs };
  }
  if (type === "ShaderNodeAddShader") {
    const shaders = [first, second];
    const clear = shaders.filter((shader) => isTransparent(graph, shader));
    const lit = shaders.filter((shader) => linkedOutput(graph, shader) && !isTransparent(graph, shader));
    const notes =
      clear.length > 0 && lit.length > 0
        ? [`${nodeLabel(node)} adds a Transparent BSDF, which the preview leaves out`]
        : [];
    const inputs = (lit.length > 0 ? lit : shaders).map((shader): [BlendStruct | null, number] => [shader, 1]);
    return { role: { kind: "passes", alpha: null }, notes, inputs };
  }
  if (type === "ShaderNodeBsdfTransparent") return { role: { kind: "clear" }, notes: [], inputs: [] };
  if (type === "ShaderNodeHoldout") {
    const note = `${nodeLabel(node)} hides what is behind it too, shown see-through`;
    return { role: { kind: "clear" }, notes: [note], inputs: [] };
  }
  return { role: { kind: "shader", emitted: null }, notes: [], inputs: [] };
}

/**
 * The nodes the surface reaches through mix and add shaders, by the offset of the output each is read from, and the
 * key of the surface's own. Each node is read once, at the depth of the shortest way to it, and only along ways that
 * give it a share.
 */
function surfaceNodes(
  graph: ShaderGraph,
  surface: BlendStruct | null,
): { nodes: Map<number, SurfaceNode>; root: number | null } {
  const nodes = new Map<number, SurfaceNode>();
  const queue: SurfaceNode[] = [];
  const reach = (socket: BlendStruct, depth: number): number | null => {
    const source = linkedOutput(graph, socket);
    if (!source) return null;
    const key = source.socket.offset;
    if (nodes.has(key)) return key;
    const step =
      depth > MAX_SURFACE_DEPTH
        ? { role: { kind: "deep" } as const, notes: [], inputs: [] }
        : surfaceStep(graph, socket, source);
    const node: SurfaceNode = { source, depth, ...step, reads: [] };
    nodes.set(key, node);
    queue.push(node);
    return key;
  };
  const root = surface ? reach(surface, 0) : null;
  for (let index = 0; index < queue.length; index++) {
    const node = queue[index];
    if (!node) break;
    for (const [input, part] of node.inputs) {
      const key = input && part > 0 ? reach(input, node.depth + 1) : null;
      if (key !== null) node.reads.push({ key, part });
    }
  }
  return { nodes, root };
}

/**
 * Each node's share of the surface, passed from the surface down through the nodes in an order where each comes before
 * those it reads, and the nodes in the order a depth-first walk first reaches them. A read back into a way the walk is
 * on, which only a damaged file has, passes nothing.
 */
function surfaceShares(
  nodes: ReadonlyMap<number, SurfaceNode>,
  root: number | null,
): { shares: Map<number, number>; reached: number[] } {
  if (root === null) return { shares: new Map(), reached: [] };
  const reached: number[] = [];
  const finished: number[] = [];
  const visited = new Set<number>();
  const open = new Set<number>();
  const back = new Set<SurfaceRead>();
  const stack: { key: number; next: number }[] = [];
  const enter = (key: number) => {
    visited.add(key);
    open.add(key);
    reached.push(key);
    stack.push({ key, next: 0 });
  };
  enter(root);
  for (let top = stack.at(-1); top; top = stack.at(-1)) {
    const read = nodes.get(top.key)?.reads[top.next++];
    if (!read) {
      open.delete(top.key);
      finished.push(top.key);
      stack.pop();
    } else if (open.has(read.key)) back.add(read);
    else if (!visited.has(read.key)) enter(read.key);
  }
  const shares = new Map<number, number>([[root, 1]]);
  for (const key of finished.reverse()) {
    const share = shares.get(key) ?? 0;
    for (const read of nodes.get(key)?.reads ?? []) {
      if (!back.has(read)) shares.set(read.key, (shares.get(read.key) ?? 0) + share * read.part);
    }
  }
  return { shares, reached };
}

/**
 * The shader the output's surface shows most of, looking through mix and add shaders, which weigh their inputs, and
 * the others, which add their light. A Transparent BSDF in the mix makes the surface see-through rather than becoming
 * the shader. A node that several ways reach is read once, with the shares of all of them.
 */
function surfaceShader(graph: ShaderGraph, output: BlendStruct): SurfaceShader {
  const leaves: Leaf[] = [];
  const notes: string[] = [];
  const alphaImages: ImageAlpha[] = [];
  let transparent = 0;
  let deep = false;
  const { nodes, root } = surfaceNodes(graph, inputSocket(output, "Surface"));
  const { shares, reached } = surfaceShares(nodes, root);
  for (const key of reached) {
    const node = nodes.get(key);
    const weight = shares.get(key) ?? 0;
    if (!node || weight <= 0) continue;
    notes.push(...node.notes);
    const role = node.role;
    if (role.kind === "shader") leaves.push({ node: node.source.node, weight, emitted: role.emitted });
    else if (role.kind === "clear") transparent += weight;
    else if (role.kind === "passes" && role.alpha) alphaImages.push(role.alpha);
    else if (role.kind === "deep") deep = true;
  }
  if (deep) notes.push(`Its surface nests shaders more than ${MAX_SURFACE_DEPTH} deep, which the preview leaves out`);
  const alpha = clamp01(1 - transparent);
  const shaders = leaves.filter((leaf) => !onlyLight(leaf));
  const shown = strongest(shaders) ?? strongest(leaves);
  if (shaders.length > 1 && shown) {
    notes.push(`${leaves.length} shaders mix, shown as ${shown.node.string("name") || "the strongest"}`);
  }
  return { shown, others: leaves.filter((leaf) => leaf !== shown), alpha, alphaImages, notes };
}

/**
 * The light a shader adds to the surface: an Emission shader's, a color's or value's where a shader is expected, or a
 * Principled BSDF's emission. Other shaders give none.
 */
function lightOf(graph: ShaderGraph, leaf: Leaf, isGray: GrayCheck): MaterialDraft {
  const light = defaultMaterial(nodeLabel(leaf.node));
  const type = nodeType(leaf.node);
  if (leaf.emitted) readEmitted(graph, leaf.emitted, leaf.node, light, isGray);
  else if (type === "ShaderNodeEmission") readSimpleShader(graph, leaf.node, light, isGray);
  else if (type === "ShaderNodeBsdfPrincipled") readPrincipledEmission(graph, leaf.node, light, isGray);
  return light;
}

function emits(draft: MaterialDraft): boolean {
  return draft.emissive.some((channel) => channel !== 0);
}

/**
 * Adds a shader's light, at `scale` of its strength, to the material's: to its constant light, or in place of none,
 * as an image or a color attribute. Light the material cannot add to its own it notes.
 */
function addLight(draft: MaterialDraft, light: MaterialDraft, scale: number): void {
  draft.approximations.push(...light.approximations);
  if (!emits(light)) return;
  const scaled = light.emissive.map((channel) => channel * scale) as Vec3;
  const plain = (material: MaterialDraft) => material.emissiveImage === null && material.emissiveAttribute === null;
  if (plain(draft) && plain(light)) {
    draft.emissive = draft.emissive.map((channel, index) => channel + (scaled[index] ?? 0)) as Vec3;
  } else if (!emits(draft)) {
    draft.emissive = scaled;
    draft.emissiveImage = light.emissiveImage;
    draft.emissiveAttribute = light.emissiveAttribute;
  } else {
    draft.approximations.push(`${light.name} adds light the preview leaves out`);
  }
}

/**
 * Gives the material the light of the surface's shaders by their share of its opaque part: the shown shader's own, and
 * the others' added to it.
 */
function applySurfaceLight(graph: ShaderGraph, draft: MaterialDraft, surface: SurfaceShader, isGray: GrayCheck): void {
  const opaque = surface.alpha > 0 ? surface.alpha : 1;
  const share = (surface.shown?.weight ?? opaque) / opaque;
  draft.emissive = draft.emissive.map((channel) => channel * share) as Vec3;
  if (surface.others.every(onlyLight)) {
    const [r, g, b, a] = draft.baseColor;
    draft.baseColor = [r * share, g * share, b * share, a];
  }
  for (const leaf of surface.others) addLight(draft, lightOf(graph, leaf, isGray), leaf.weight / opaque);
}

/** The Shader to RGB node a color comes from without an image, as toon shading does. */
function toonSource(graph: ShaderGraph, color: BlendStruct | null): BlendStruct | null {
  if (!color || imageFeeding(graph, color)) return null;
  return upstreamNode(graph, color, "ShaderNodeShaderToRGB");
}

/** A Math node that clips alpha: the input it compares, and the cutoff it keeps the input above or, unless strict, at. */
interface AlphaClip {
  input: BlendStruct;
  cutoff: number;
  strict: boolean;
}

function alphaClip(graph: ShaderGraph, socket: BlendStruct): AlphaClip | null {
  const source = linkedOutput(graph, socket);
  if (!source || nodeType(source.node) !== "ShaderNodeMath") return null;
  const operation = source.node.number("custom1");
  const [a, b] = source.node.list("inputs");
  if (!a || !b) return null;
  const constantA = constantOf(graph, a)?.[0];
  const constantB = constantOf(graph, b)?.[0];
  if (operation === MATH_GREATER_THAN && constantA === undefined && constantB !== undefined) {
    return { input: a, cutoff: constantB, strict: true };
  }
  if (operation === MATH_LESS_THAN && constantA !== undefined && constantB === undefined) {
    return { input: b, cutoff: constantA, strict: true };
  }
  if (operation === MATH_ROUND && constantA === undefined) return { input: a, cutoff: 0.5, strict: false };
  if (operation !== MATH_SUBTRACT || constantA !== 1 || constantB !== undefined) return null;
  const inner = linkedOutput(graph, b);
  if (!inner || nodeType(inner.node) !== "ShaderNodeMath") return null;
  const [x, y] = inner.node.list("inputs");
  if (!x || !y) return null;
  const constantX = constantOf(graph, x)?.[0];
  const constantY = constantOf(graph, y)?.[0];
  const innerOperation = inner.node.number("custom1");
  if (innerOperation === MATH_LESS_THAN && constantX === undefined && constantY !== undefined) {
    return { input: x, cutoff: constantY, strict: false };
  }
  if (innerOperation === MATH_GREATER_THAN && constantX !== undefined && constantY === undefined) {
    return { input: y, cutoff: constantX, strict: false };
  }
  return null;
}

/** A Math node that multiplies an input by a constant, as glTF's alpha factor does. */
function scaledBy(graph: ShaderGraph, socket: BlendStruct): { input: BlendStruct; factor: number } | null {
  const source = linkedOutput(graph, socket);
  if (!source || nodeType(source.node) !== "ShaderNodeMath" || source.node.number("custom1") !== MATH_MULTIPLY) {
    return null;
  }
  const [a, b] = source.node.list("inputs");
  if (!a || !b) return null;
  const constantA = constantOf(graph, a)?.[0];
  const constantB = constantOf(graph, b)?.[0];
  if (constantA !== undefined && constantB === undefined) return { input: b, factor: constantA };
  if (constantB !== undefined && constantA === undefined) return { input: a, factor: constantB };
  return null;
}

/** A Math node that multiplies an input by a constant from 0 to 1, as glTF's importer builds its factors. */
function unitScaledBy(graph: ShaderGraph, socket: BlendStruct): { input: BlendStruct; factor: number } | null {
  const scaled = scaledBy(graph, socket);
  return scaled && scaled.factor >= 0 && scaled.factor <= 1 ? scaled : null;
}

/** A Mix node that multiplies a color by a constant color at full factor, as glTF's importer builds a color factor. */
function colorScaledBy(graph: ShaderGraph, socket: BlendStruct): { input: BlendStruct; factor: number[] } | null {
  const source = linkedOutput(graph, socket);
  if (!source) return null;
  const node = source.node;
  const type = nodeType(node);
  const mix = type === "ShaderNodeMix" ? node.deref("storage") : null;
  if (mix && mix.number("data_type") !== SocketType.color) return null;
  const sockets =
    type === "ShaderNodeMix"
      ? [inputSocket(node, "Factor_Float"), inputSocket(node, "A_Color"), inputSocket(node, "B_Color")]
      : type === "ShaderNodeMixRGB"
        ? [inputSocket(node, "Fac"), inputSocket(node, "Color1"), inputSocket(node, "Color2")]
        : [];
  const [factor = null, a = null, b = null] = sockets;
  const blend = mix ? mix.number("blend_type") : node.number("custom1");
  if (!a || !b || blend !== MIX_MULTIPLY || constantOf(graph, factor)?.[0] !== 1) return null;
  const constantA = constantOf(graph, a);
  const constantB = constantOf(graph, b);
  if (constantA && !constantB) return { input: b, factor: constantA };
  if (constantB && !constantA) return { input: a, factor: constantB };
  return null;
}

function sameImageNode(a: FedImage | null, b: FedImage | null): boolean {
  return a !== null && b !== null && a.node.offset === b.node.offset;
}

/** An image's alpha that drives a material's alpha, times a factor and, for a cutout, compared with a cutoff. */
interface ImageAlpha {
  found: FedImage;
  factor: number;
  cutoff: number | null;
}

/** Where an alpha comes from: a constant, an image's alpha, or other nodes, named for a note. */
type AlphaSource =
  | { kind: "constant"; value: number }
  | ({ kind: "image" } & ImageAlpha)
  | { kind: "nodes"; from: string };

/**
 * Where an alpha input or a Mix Shader's factor comes from: a constant, or an image's alpha, scaled by a constant and
 * clipped at a cutoff as glTF's importer builds them, or else other nodes. A clip of the alpha times a factor keeps the
 * texels whose alpha reaches the cutoff divided by the factor, and a clip that keeps every texel is a constant, as is
 * the alpha of an image Blender loads opaque.
 */
function alphaSource(graph: ShaderGraph, socket: BlendStruct): AlphaSource {
  const constant = constantOf(graph, socket);
  if (constant) return { kind: "constant", value: clamp01(constant[0] ?? 1) };
  const clip = alphaClip(graph, socket);
  const compared = clip?.input ?? socket;
  const scaled = clip ? scaledBy(graph, compared) : unitScaledBy(graph, compared);
  const factor = scaled && (!clip || scaled.factor > 0) ? scaled : null;
  const found = imageFeeding(graph, factor?.input ?? compared);
  const source = linkedOutput(graph, socket);
  const other: AlphaSource = {
    kind: "nodes",
    from: found ? imageName(found) : source ? nodeLabel(source.node) : "nodes",
  };
  if (found?.output !== "Alpha") return other;
  const scale = factor?.factor ?? 1;
  const image = found.node.deref("id");
  const opaque = image !== null && loadsOpaque(image);
  if (opaque && found.changes.length > 0) return other;
  if (!clip && opaque) return { kind: "constant", value: clamp01(scale) };
  if (!clip) return { kind: "image", found, factor: scale, cutoff: null };
  if (found.changes.length > 0) return other;
  const cutoff = clip.cutoff / scale + (clip.strict ? STRICT : 0);
  if (cutoff <= 0) return { kind: "constant", value: 1 };
  if (opaque) return { kind: "constant", value: cutoff <= 1 ? 1 : 0 };
  return { kind: "image", found, factor: 1, cutoff };
}

/** Whether Blender loads an image with an alpha of 1: its Alpha Mode is None and it does not hold data. */
function loadsOpaque(image: BlendStruct): boolean {
  return alphaMode(image) === ALPHA_IGNORE && !DATA_SPACES.has(colorSpaceName(image));
}

function samplingOf(use: ImageUse): string {
  return JSON.stringify([
    use.uvMap,
    use.wrap,
    use.transform,
    use.coordinates,
    use.clipped,
    use.projection,
    use.interpolation,
  ]);
}

/** Whether an Image Texture node samples the base color's image where the base color does, as the preview's alpha. */
function samplesBase(graph: ShaderGraph, draft: MaterialDraft, found: FedImage): boolean {
  const base = draft.baseColorImage;
  const use = base ? imageUse(graph, defaultMaterial(), found.node) : null;
  return (
    base !== null && use !== null && use.image.offset === base.image.offset && samplingOf(use) === samplingOf(base)
  );
}

/**
 * Takes the material's alpha from its base color image's alpha, scaled or clipped as `alpha` says. A cutout shows the
 * texels it keeps opaque.
 */
function useImageAlpha(draft: MaterialDraft, alpha: ImageAlpha): void {
  if (alpha.found.changes.length > 0) {
    const nodes = [...new Set(alpha.found.changes)].join(", ");
    const image = imageName(alpha.found);
    draft.approximations.push(`Alpha passes ${image}'s alpha through ${nodes}, which the preview leaves out`);
  }
  if (draft.baseColorImage) draft.baseColorImage.alpha = "opacity";
  if (alpha.cutoff === null) {
    draft.baseColor[3] *= alpha.factor;
    draft.alphaMode = "blend";
    return;
  }
  const kept = draft.baseColor[3];
  if (kept < 1) draft.approximations.push(`Alpha is ${Math.round(kept * 100) / 100} inside the cutout, shown opaque`);
  draft.baseColor[3] = 1;
  draft.alphaMode = "mask";
  draft.alphaCutoff = alpha.cutoff;
}

/** The Principled BSDF's alpha, or a note where the preview cannot show it. */
function readAlpha(graph: ShaderGraph, draft: MaterialDraft, socket: BlendStruct | null): void {
  const source: AlphaSource = socket ? alphaSource(graph, socket) : { kind: "constant", value: 1 };
  if (source.kind === "constant") {
    draft.baseColor[3] = source.value;
    if (source.value < 1) draft.alphaMode = "blend";
  } else if (source.kind === "image" && samplesBase(graph, draft, source.found)) {
    useImageAlpha(draft, source);
  } else {
    const from = source.kind === "image" ? imageName(source.found) : source.from;
    draft.approximations.push(`Alpha comes from ${from}, which the preview leaves out`);
  }
}

/** An image the input reads times a constant color, as glTF's importer builds a base color or emissive factor. */
function factoredImage(graph: ShaderGraph, socket: BlendStruct | null): { found: FedImage; factor: number[] } | null {
  const scaled = socket ? colorScaledBy(graph, socket) : null;
  const found = colorFeeding(graph, scaled?.input ?? socket);
  return found ? { found, factor: scaled?.factor ?? [1, 1, 1] } : null;
}

/**
 * The color attribute an input reads from a Color Attribute node, as the node names it with "" for the mesh's default,
 * times a constant color as glTF's importer builds a factor.
 */
function factoredAttribute(
  graph: ShaderGraph,
  socket: BlendStruct | null,
): { attribute: string; factor: number[] } | null {
  const scaled = socket ? colorScaledBy(graph, socket) : null;
  const source = linkedOutput(graph, scaled?.input ?? socket);
  if (!source || nodeType(source.node) !== "ShaderNodeVertexColor" || source.name !== "Color") return null;
  const attribute = source.node.deref("storage")?.string("layer_name") ?? "";
  return { attribute, factor: scaled?.factor ?? [1, 1, 1] };
}

/**
 * The image a color input samples, unless every way from it to the input carries one value, such as one channel, the
 * brightness or the alpha, which it notes on the draft instead. One value that equals the color of a gray image, as
 * its red channel or its brightness do, shows the image where `isGray` says it is gray.
 */
function colorImage(
  graph: ShaderGraph,
  draft: MaterialDraft,
  input: string,
  found: FedImage | null,
  isGray: GrayCheck,
): ImageUse | null {
  if (!found) return null;
  const image = found.node.deref("id");
  if (found.color || (image && valueOfGray(found) && isGray(image, "whole") === true)) {
    return imageInput(graph, draft, input, found);
  }
  const channel = channelOf(found);
  const what = channel ? channelName(channel) : "the brightness";
  const through = found.changes.length > 0 ? ` through ${[...new Set(found.changes)].join(", ")}` : "";
  draft.approximations.push(
    `${input} comes from ${what} of ${imageName(found)}${through}, which the preview leaves out`,
  );
  return null;
}

function noteChanges(draft: MaterialDraft, input: string, found: FedImage): void {
  if (found.changes.length === 0) return;
  const nodes = [...new Set(found.changes)].join(", ");
  draft.approximations.push(`${input} passes ${imageName(found)} through ${nodes}, which the preview leaves out`);
}

/**
 * Roughness in green and metalness in blue of one image, each times a constant as glTF's importer builds its factors,
 * which the preview reads as a packed image.
 */
function readPacked(
  graph: ShaderGraph,
  draft: MaterialDraft,
  metallicSocket: BlendStruct | null,
  roughnessSocket: BlendStruct | null,
): boolean {
  const metallicScaled = metallicSocket ? unitScaledBy(graph, metallicSocket) : null;
  const roughnessScaled = roughnessSocket ? unitScaledBy(graph, roughnessSocket) : null;
  const metallic = imageFeeding(graph, metallicScaled?.input ?? metallicSocket);
  const roughness = imageFeeding(graph, roughnessScaled?.input ?? roughnessSocket);
  const packed =
    metallic !== null &&
    roughness !== null &&
    sameImageNode(metallic, roughness) &&
    channelOf(metallic)?.index === BLUE &&
    channelOf(roughness)?.index === GREEN;
  if (!packed) return false;
  noteChanges(draft, "Roughness", roughness);
  noteChanges(draft, "Metallic", metallic);
  draft.metallicRoughnessImage = imageUse(graph, draft, metallic.node);
  draft.metallic = metallicScaled?.factor ?? 1;
  draft.roughness = roughnessScaled?.factor ?? 1;
  return true;
}

function readPrincipled(graph: ShaderGraph, node: BlendStruct, draft: MaterialDraft, isGray: GrayCheck): void {
  const baseSocket = inputSocket(node, "Base Color");
  const attribute = factoredAttribute(graph, baseSocket);
  const base = factoredImage(graph, baseSocket);
  draft.baseColorImage = colorImage(graph, draft, "Base color", base?.found ?? null, isGray);
  draft.baseColorAttribute = attribute?.attribute ?? null;
  const color =
    attribute?.factor ??
    (draft.baseColorImage ? (base?.factor ?? [1, 1, 1]) : inputValue(graph, baseSocket, [0.8, 0.8, 0.8, 1]));
  draft.baseColor = [color[0] ?? 0.8, color[1] ?? 0.8, color[2] ?? 0.8, 1];
  if (!attribute) noteNodeInput(graph, draft, "Base color", baseSocket, base?.found ?? null);

  const metallicSocket = inputSocket(node, "Metallic");
  const roughnessSocket = inputSocket(node, "Roughness");
  draft.metallic = clamp01(scalarOf(graph, metallicSocket, 0));
  draft.roughness = clamp01(scalarOf(graph, roughnessSocket, 0.5));
  const metallicImage = imageFeeding(graph, metallicSocket);
  const roughnessImage = imageFeeding(graph, roughnessSocket);
  if (!readPacked(graph, draft, metallicSocket, roughnessSocket)) {
    draft.roughnessImage = channelImage(graph, draft, "Roughness", roughnessImage, GREEN, isGray);
    draft.metalnessImage = channelImage(graph, draft, "Metallic", metallicImage, BLUE, isGray);
    noteNodeInput(graph, draft, "Roughness", roughnessSocket, roughnessImage);
    noteNodeInput(graph, draft, "Metallic", metallicSocket, metallicImage);
  }
  noteTransmission(graph, draft, inputSocket(node, "Transmission Weight", "Transmission"), metallicSocket);

  const normal = linkedOutput(graph, inputSocket(node, "Normal"));
  const normalSpace = normal?.node.deref("storage")?.number("space") ?? TANGENT_SPACE;
  if (normal && nodeType(normal.node) === "ShaderNodeNormalMap" && normalSpace !== TANGENT_SPACE) {
    const space = NORMAL_SPACES[normalSpace] ?? "non-tangent";
    draft.approximations.push(`Its normal map is in ${space} space, which the preview leaves out`);
  } else if (normal && nodeType(normal.node) === "ShaderNodeNormalMap") {
    const colorSocket = inputSocket(normal.node, "Color");
    const image = colorFeeding(graph, colorSocket);
    draft.normalImage = colorImage(graph, draft, "Normal", image, isGray);
    const strength = inputSocket(normal.node, "Strength");
    if (draft.normalImage) {
      draft.normalScale = scalarOf(graph, strength, 1);
      draft.normalTangentUv = normal.node.deref("storage")?.string("uv_map") || null;
      noteNodeInput(graph, draft, "Normal map strength", strength, null);
    }
    noteNodeInput(graph, draft, "Normal map color", colorSocket, image);
  } else if (normal) {
    draft.approximations.push(`Normal comes from ${nodeLabel(normal.node)}, which the preview leaves out`);
  }

  readPrincipledEmission(graph, node, draft, isGray);
  readAlpha(graph, draft, inputSocket(node, "Alpha"));
}

/** The light of a Principled BSDF: its emission color times its strength. */
function readPrincipledEmission(graph: ShaderGraph, node: BlendStruct, draft: MaterialDraft, isGray: GrayCheck): void {
  const emissionSocket = inputSocket(node, "Emission Color", "Emission");
  const strengthSocket = inputSocket(node, "Emission Strength");
  const strength = strengthSocket ? scalarOf(graph, strengthSocket, 1) : 1;
  const attribute = strength !== 0 ? factoredAttribute(graph, emissionSocket) : null;
  const emission = factoredImage(graph, emissionSocket);
  draft.emissiveImage = strength > 0 ? colorImage(graph, draft, "Emission", emission?.found ?? null, isGray) : null;
  draft.emissiveAttribute = attribute?.attribute ?? null;
  const emissionColor =
    attribute?.factor ??
    (draft.emissiveImage
      ? (emission?.factor ?? [1, 1, 1])
      : emission
        ? [0, 0, 0]
        : inputValue(graph, emissionSocket, [0, 0, 0, 1]));
  draft.emissive = [0, 1, 2].map((index) => (emissionColor[index] ?? 0) * strength) as Vec3;
  if (strength !== 0 && !attribute) noteNodeInput(graph, draft, "Emission", emissionSocket, emission?.found ?? null);
  noteNodeInput(graph, draft, "Emission strength", strengthSocket, null);
}

/** Notes the transmission of a Principled BSDF, which shows only where it is not metallic. */
function noteTransmission(
  graph: ShaderGraph,
  draft: MaterialDraft,
  socket: BlendStruct | null,
  metallic: BlendStruct | null,
): void {
  const dielectric = 1 - clamp01(constantOf(graph, metallic)?.[0] ?? 0);
  if (dielectric <= 0) return;
  const source = constantOf(graph, socket) ? null : linkedOutput(graph, socket);
  if (source) {
    const found = imageFeeding(graph, socket);
    const from = found ? imageName(found) : nodeLabel(source.node);
    draft.approximations.push(`Transmission comes from ${from}, which the preview leaves out`);
    return;
  }
  const shown = Math.round(clamp01(scalarOf(graph, socket, 0)) * dielectric * 100) / 100;
  if (shown > 0) draft.approximations.push(`Transmission is ${shown}, which the preview leaves out`);
}

/** The channel a Separate node's output picks, with the index of the color channel it is; no index for HSV or HSL. */
function separatedChannel(separate: Step): { name: string; index: number | null } {
  const mode =
    nodeType(separate.node) === "ShaderNodeSeparateColor"
      ? separate.node.deref("storage")?.number("mode")
      : SEPARATE_RGB;
  const named = SEPARATED_CHANNELS[mode ?? SEPARATE_RGB];
  const index = CHANNEL_INDEX.get(separate.output) ?? null;
  if (named) return { name: named[index ?? -1] ?? separate.output, index: null };
  return { name: separate.output, index };
}

/**
 * The channel of an image a scalar input reads: a Separate node's output, with the index of the color channel it is,
 * or the image's alpha, with no index; null for its color.
 */
function channelOf(found: FedImage | null): { name: string; index: number | null } | null {
  if (!found) return null;
  const separate = found.via.find((step) => SEPARATES.has(nodeType(step.node)));
  if (separate) return separatedChannel(separate);
  return found.output === "Alpha" ? { name: "Alpha", index: null } : null;
}

/** Whether the value an image gives an input is its color where the image is gray: not its alpha, hue or saturation. */
function valueOfGray(found: FedImage): boolean {
  if (found.output === "Alpha") return false;
  return found.via.every((step) => {
    if (!SEPARATES.has(nodeType(step.node))) return true;
    const channel = separatedChannel(step);
    return channel.index !== null || GRAY_CHANNELS.has(channel.name);
  });
}

/**
 * The image a scalar input samples, unless it picks a channel other than the one the preview reads, green for
 * roughness and blue for metallic, which it notes on the draft instead. Where the input takes the image's color, which
 * Blender turns into its brightness, it notes an image that a sample `isGray` reads shows is not gray.
 */
function channelImage(
  graph: ShaderGraph,
  draft: MaterialDraft,
  input: string,
  found: FedImage | null,
  readable: typeof GREEN | typeof BLUE,
  isGray: GrayCheck,
): ImageUse | null {
  if (!found) return null;
  const channel = channelOf(found);
  if (channel !== null && channel.index !== readable) {
    const what = channelName(channel);
    draft.approximations.push(`${input} comes from ${what} of ${imageName(found)}, which the preview leaves out`);
    return null;
  }
  const image = found.node.deref("id");
  if (channel === null && image && isGray(image, "sample") === false) {
    draft.approximations.push(
      `${input} comes from the brightness of ${imageName(found)}, shown as its ${CHANNEL_NAMES[readable]} channel`,
    );
  }
  return imageInput(graph, draft, input, found);
}

function channelName(channel: { name: string }): string {
  return channel.name === "Alpha" ? "the alpha" : `the ${channel.name} channel`;
}

/** The color of a metal from its complex index of refraction: its reflectance seen head-on. */
function conductorColor(graph: ShaderGraph, node: BlendStruct, draft: MaterialDraft): number[] {
  const iorSocket = inputSocket(node, "IOR");
  const extinctionSocket = inputSocket(node, "Extinction");
  noteNodeInput(graph, draft, "IOR", iorSocket, null);
  noteNodeInput(graph, draft, "Extinction", extinctionSocket, null);
  const ior = inputValue(graph, iorSocket, [1, 1, 1]);
  const extinction = inputValue(graph, extinctionSocket, [0, 0, 0]);
  return [0, 1, 2].map((index) => {
    const n = ior[index] ?? 1;
    const k = extinction[index] ?? 0;
    return ((n - 1) ** 2 + k ** 2) / ((n + 1) ** 2 + k ** 2);
  });
}

/** A shader other than the Principled BSDF, by its color, which the Specular and Metallic BSDFs call Base Color. */
function readSimpleShader(graph: ShaderGraph, node: BlendStruct, draft: MaterialDraft, isGray: GrayCheck): void {
  const type = nodeType(node);
  const glows = type === "ShaderNodeEmission";
  const conductor = type === "ShaderNodeBsdfMetallic" && node.number("custom2") === PHYSICAL_CONDUCTOR;
  const colorSocket = conductor ? null : inputSocket(node, "Color", "Base Color");
  const attribute = factoredAttribute(graph, colorSocket);
  const fed = factoredImage(graph, colorSocket);
  const image = colorImage(graph, draft, glows ? "Emission" : "Base color", fed?.found ?? null, isGray);
  const color =
    attribute?.factor ??
    (image
      ? (fed?.factor ?? [1, 1, 1])
      : fed && glows
        ? [0, 0, 0]
        : conductor
          ? conductorColor(graph, node, draft)
          : inputValue(graph, colorSocket, [0.8, 0.8, 0.8, 1]));
  if (!attribute) noteNodeInput(graph, draft, "Color", colorSocket, fed?.found ?? null);
  if (glows) {
    const strengthSocket = inputSocket(node, "Strength");
    const strength = scalarOf(graph, strengthSocket, 1);
    noteNodeInput(graph, draft, "Strength", strengthSocket, null);
    draft.baseColor = [0, 0, 0, 1];
    draft.emissiveImage = image;
    draft.emissiveAttribute = attribute?.attribute ?? null;
    draft.emissive = [0, 1, 2].map((index) => (color[index] ?? 0) * strength) as Vec3;
    return;
  }
  draft.baseColor = [color[0] ?? 0.8, color[1] ?? 0.8, color[2] ?? 0.8, 1];
  draft.baseColorImage = image;
  draft.baseColorAttribute = attribute?.attribute ?? null;
  const roughness = inputSocket(node, "Roughness");
  if (type === "ShaderNodeBsdfDiffuse") draft.roughness = 1;
  else if (roughness) {
    draft.roughness = clamp01(scalarOf(graph, roughness, 0.5));
    noteNodeInput(graph, draft, "Roughness", roughness, null);
  }
  draft.metallic = METAL_SHADERS.has(type) ? 1 : 0;
}

/**
 * A color or a value that `node` puts where a shader is expected, which Blender shows as the light of an Emission
 * shader of strength 1. Other nodes that drive it leave the material's own color, with a note on the draft. An image
 * the preview leaves out leaves the surface black, since Blender shows only the light there.
 */
function readEmitted(
  graph: ShaderGraph,
  socket: BlendStruct,
  node: BlendStruct,
  draft: MaterialDraft,
  isGray: GrayCheck,
): void {
  const attribute = factoredAttribute(graph, socket);
  const found = colorFeeding(graph, socket);
  const image = colorImage(graph, draft, "Emission", found, isGray);
  const constant = constantOf(graph, socket, SocketType.color);
  if (attribute || found || constant) {
    draft.baseColor = [0, 0, 0, 1];
    draft.metallic = 0;
    draft.emissiveImage = image;
    draft.emissiveAttribute = attribute?.attribute ?? null;
    const color = attribute?.factor ?? (image ? [1, 1, 1] : (constant ?? []));
    draft.emissive = [color[0] ?? 0, color[1] ?? 0, color[2] ?? 0];
  } else {
    draft.approximations.push(`Its surface emits the output of ${nodeLabel(node)}, which the preview leaves out`);
  }
}

/** What EEVEE shows of a material whose output has no surface: black, or nothing where a volume fills it. */
function readNoSurface(draft: MaterialDraft, volume: boolean): void {
  draft.baseColor = [0, 0, 0, volume ? 0 : 1];
  draft.metallic = 0;
  draft.roughness = 1;
  if (volume) draft.alphaMode = "blend";
}

export function imageSource(image: BlendStruct): number {
  return image.has("source") ? image.number("source") : IMAGE_SOURCE_FILE;
}

/**
 * Blender's `BKE_image_user_frame_get`: the frame of an image sequence that an Image Texture node shows at a scene
 * frame, from the node's start frame, frame count, offset and whether it cycles.
 */
export function sequenceFrame(node: BlendStruct, sceneFrame: number): number {
  const user = node.deref("storage")?.struct("iuser");
  const length = user?.number("frames") ?? 0;
  if (!user || length <= 0) return 0;
  let frame = sceneFrame - user.number("sfra") + 1;
  if (user.number("cycl") !== 0) {
    frame %= length;
    if (frame <= 0) frame += length;
  }
  return Math.min(Math.max(frame, 0), length) + user.number("offset");
}

/** Notes what the preview shows differently of the images, the sequences' at `sceneFrame`. */
function noteImages(draft: MaterialDraft, sceneFrame: number): void {
  const colorImages = new Set([draft.baseColorImage, draft.emissiveImage]);
  for (const use of imageUses(draft)) {
    const name = idName(use.image);
    const source = imageSource(use.image);
    const packed = packedFile(use.image) !== null;
    if (source === IMAGE_SOURCE_TILED) {
      const tiles = packed ? use.image.list("packedfiles") : use.image.list("tiles");
      if (tiles.length > 1) draft.approximations.push(`${name} is a UDIM tiled image, shown with its first tile`);
    } else if (source === IMAGE_SOURCE_SEQUENCE && !packed) {
      draft.approximations.push(`${name} is an image sequence, shown as it is at frame ${sceneFrame}`);
    } else if (source !== IMAGE_SOURCE_FILE && !packed) {
      const kind = IMAGE_SOURCES[source] ?? "not an image file";
      draft.approximations.push(`${name} is ${kind}, which the preview leaves out`);
    }
    if (use.coordinates) {
      draft.approximations.push(`${name} uses ${use.coordinates} coordinates, shown with the UV map`);
    }
    if (use.clipped) draft.approximations.push(`${name} is clipped at its edges, shown extended`);
    if (use.projection) draft.approximations.push(`${name} uses ${use.projection} projection, shown flat`);
    if (use.interpolation) draft.approximations.push(`${name} uses ${use.interpolation} interpolation, shown Linear`);
    const space = colorSpaceName(use.image);
    const decoding = decodingOf(space);
    const color = colorImages.has(use);
    if (!decoding) {
      draft.approximations.push(`${name} is ${space}, shown as ${color ? "sRGB" : "Non-Color"}`);
    } else if (!decoding.exact && color) {
      const shown = decoding.colorSpace === "srgb" ? "sRGB" : "Linear Rec.709";
      draft.approximations.push(`${name} is ${space}, shown as ${shown}`);
    }
  }
}

/**
 * A metallic-roughness approximation of a Blender material from its node tree, with its image sequences as they are at
 * `sceneFrame`. A material without nodes takes its color, metallic and roughness, opaque, as EEVEE renders it.
 * `isGray` reads the whole of images that reach a color input as one value, and a sample of those whose color reaches
 * roughness or metallic.
 */
export function readMaterial(
  material: BlendStruct,
  version: number,
  isGray: GrayCheck,
  sceneFrame: number,
): MaterialDraft {
  const draft = defaultMaterial(idName(material));
  draft.baseColor = [material.number("r"), material.number("g"), material.number("b"), 1];
  draft.metallic = clamp01(material.number("metallic"));
  draft.roughness = clamp01(material.number("roughness"));
  draft.doubleSided = (material.number("blend_flag") & BACKFACE_CULLING) === 0;

  const tree = material.deref("nodetree");
  const usesNodes = version >= 500 || !material.has("use_nodes") || material.number("use_nodes") !== 0;
  const graph = tree && usesNodes ? graphOf(tree) : null;
  if (graph) {
    const output = outputNode(graph);
    if (!output && graph.nodes.some((node) => node.number("custom1") === OUTPUT_FOR_CYCLES && isOutput(node))) {
      draft.approximations.push("Its output is for Cycles only, shown black as EEVEE renders it");
    }
    const surface = output ? surfaceShader(graph, output) : null;
    const shown = surface?.shown ?? null;
    const volume = output ? linkedOutput(graph, inputSocket(output, "Volume")) : null;
    if (!shown) readNoSurface(draft, volume !== null);
    else if (shown.emitted) readEmitted(graph, shown.emitted, shown.node, draft, isGray);
    else if (nodeType(shown.node) === "ShaderNodeBsdfPrincipled") readPrincipled(graph, shown.node, draft, isGray);
    else {
      readSimpleShader(graph, shown.node, draft, isGray);
      if (!SIMPLE_SHADERS.has(nodeType(shown.node))) {
        draft.approximations.push(`Its surface is ${nodeLabel(shown.node)}, shown as a plain shader of its color`);
      }
    }
    if (surface) applySurfaceLight(graph, draft, surface, isGray);
    if (volume) {
      draft.approximations.push(`Its volume comes from ${nodeLabel(volume.node)}, which the preview leaves out`);
    }
    const displacement = output ? linkedOutput(graph, inputSocket(output, "Displacement")) : null;
    if (displacement) {
      draft.approximations.push(
        `Displacement comes from ${nodeLabel(displacement.node)}, which the preview leaves out`,
      );
    }
    if (surface) applySurfaceAlpha(graph, draft, surface);
    const read = output ? readOutputs(graph, output) : new Set<number>();
    for (const use of [draft.baseColorImage, draft.emissiveImage]) {
      if (!use) continue;
      if (use.alpha !== "opacity") use.alpha = colorAlpha(use, read);
      notePremultiplied(draft, use, read);
    }
  }
  for (const use of imageUses(draft)) {
    if (imageSource(use.image) === IMAGE_SOURCE_SEQUENCE) use.frame = sequenceFrame(use.node, sceneFrame);
  }
  noteImages(draft, sceneFrame);
  if (material.number("blend_method") === BLEND_METHOD_CLIP && draft.alphaMode === "blend") {
    draft.alphaMode = "mask";
    draft.alphaCutoff = (material.has("alpha_threshold") ? material.number("alpha_threshold") : 0.5) + STRICT;
  } else if (draft.alphaMode === "blend" && dithers(material, version)) {
    draft.alphaMode = "hash";
  }
  draft.approximations = [...new Set(draft.approximations)];
  return draft;
}

/**
 * Whether Blender draws the material's transparency dithered, as its Dithered render method or older Hashed blend mode
 * does, rather than blended in sorted order.
 */
function dithers(material: BlendStruct, version: number): boolean {
  if (version >= RENDER_METHOD_VERSION && material.has("surface_render_method")) {
    return material.number("surface_render_method") === RENDER_METHOD_DITHERED;
  }
  return material.number("blend_method") === BLEND_METHOD_HASHED;
}

/**
 * What a material does with the alpha of an image whose color it shows, where the alpha is not the material's: Blender
 * multiplies the color by it where no node reads it, unless the image already stores its color that way, its alpha is
 * packed data or ignored, or it holds data.
 */
function colorAlpha(use: ImageUse, read: ReadonlySet<number>): TextureAlpha {
  const space = colorSpaceName(use.image);
  const alpha = outputSocket(use.node, "Alpha");
  const straight = alphaMode(use.image) === ALPHA_STRAIGHT && !DATA_SPACES.has(space);
  return straight && !(alpha && read.has(alpha.offset)) ? "premultiply" : "none";
}

function alphaMode(image: BlendStruct): number {
  return image.has("alpha_mode") ? image.number("alpha_mode") : ALPHA_STRAIGHT;
}

/**
 * Notes a premultiplied image whose color the material shows while a node reads its alpha: Blender then divides the
 * color by the alpha, which the preview leaves out.
 */
function notePremultiplied(draft: MaterialDraft, use: ImageUse, read: ReadonlySet<number>): void {
  const space = colorSpaceName(use.image);
  const alpha = outputSocket(use.node, "Alpha");
  if (alphaMode(use.image) !== ALPHA_PREMULTIPLIED || DATA_SPACES.has(space) || !(alpha && read.has(alpha.offset))) {
    return;
  }
  draft.approximations.push(`${idName(use.image)} has premultiplied alpha, shown as straight`);
}

/** Applies the transparency the surface's shader mix adds, from mix factors and the images whose alpha mixes it. */
function applySurfaceAlpha(graph: ShaderGraph, draft: MaterialDraft, surface: SurfaceShader): void {
  for (const note of surface.notes) draft.approximations.push(note);
  for (const alpha of surface.alphaImages) {
    if (samplesBase(graph, draft, alpha.found)) useImageAlpha(draft, alpha);
    else draft.approximations.push(`Alpha comes from ${imageName(alpha.found)}, which the preview leaves out`);
  }
  if (surface.alpha >= 1) return;
  if (draft.alphaMode === "mask") {
    const kept = Math.round(surface.alpha * 100) / 100;
    draft.approximations.push(`Alpha is ${kept} inside the cutout, shown opaque`);
    return;
  }
  draft.baseColor[3] *= surface.alpha;
  draft.alphaMode = "blend";
}
