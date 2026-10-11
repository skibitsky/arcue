import type { AlphaMode, UvTransform, Vec3, Vec4, WrapMode } from "@arcue/scene";
import type { BlendStruct } from "../blend/file";
import { idName } from "../blend/ids";

export const IMAGE_SOURCE_FILE = 1;
const IMAGE_SOURCES: Readonly<Record<number, string>> = {
  2: "image sequence",
  3: "movie",
  4: "generated",
  5: "viewer",
  6: "UDIM tiled",
};
const TANGENT_SPACE = 0;
const NORMAL_SPACES: Readonly<Record<number, string>> = { 1: "object", 2: "world", 3: "object", 4: "world" };

/** The image's packed file, from the list newer files keep or the single pointer older ones do. */
export function packedFile(image: BlendStruct): BlendStruct | null {
  return image.deref("packedfile") ?? image.list("packedfiles")[0]?.deref("packedfile") ?? null;
}

/** An Image Texture node a material samples. */
export interface ImageUse {
  image: BlendStruct;
  /** The UV map a UV Map node names, or null for the mesh's default UV map. */
  uvMap: string | null;
  wrap: WrapMode;
  transform: UvTransform | null;
  /** The coordinates the image samples when they are not a UV map, such as "Generated", which the preview cannot. */
  coordinates: string | null;
  /** Whether the image is transparent outside its edges, Blender's Clip extension, which the preview shows as Extend. */
  clipped: boolean;
}

export interface MaterialDraft {
  name: string;
  baseColor: Vec4;
  baseColorImage: ImageUse | null;
  metallic: number;
  roughness: number;
  /** One image holding roughness in green and metalness in blue, as glTF packs them. */
  metallicRoughnessImage: ImageUse | null;
  roughnessImage: ImageUse | null;
  metalnessImage: ImageUse | null;
  normalImage: ImageUse | null;
  normalScale: number;
  /** The emission color times its strength, for a material without an emission image. */
  emissive: Vec3;
  emissiveImage: ImageUse | null;
  /** Multiplies an emission image. */
  emissionStrength: number;
  alphaMode: AlphaMode;
  alphaCutoff: number;
  doubleSided: boolean;
  /** What the preview shows differently from Blender, for people. */
  approximations: string[];
}

const NODE_DO_OUTPUT = 1 << 6;
const NODE_MUTED = 1 << 9;
const BACKFACE_CULLING = 1 << 2;
const BLEND_METHOD_CLIP = 3;

const WRAPS: readonly WrapMode[] = ["repeat", "clamp", "clamp", "mirror"];
const EXTENSION_CLIP = 2;
const SIMPLE_SHADERS = new Set([
  "ShaderNodeEmission",
  "ShaderNodeBsdfDiffuse",
  "ShaderNodeBsdfGlossy",
  "ShaderNodeBsdfAnisotropic",
]);

interface Graph {
  nodes: BlendStruct[];
  links: BlendStruct[];
}

/** The material Blender shows for an empty slot. */
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

export function defaultMaterial(name = "Default"): MaterialDraft {
  return {
    name,
    baseColor: [0.8, 0.8, 0.8, 1],
    baseColorImage: null,
    metallic: 0,
    roughness: 0.5,
    metallicRoughnessImage: null,
    roughnessImage: null,
    metalnessImage: null,
    normalImage: null,
    normalScale: 1,
    emissive: [0, 0, 0],
    emissiveImage: null,
    emissionStrength: 1,
    alphaMode: "opaque",
    alphaCutoff: 0.5,
    doubleSided: true,
    approximations: [],
  };
}

function nodeType(node: BlendStruct): string {
  return node.string("idname");
}

function socketName(socket: BlendStruct): string {
  return socket.string("identifier") || socket.string("name");
}

function inputSocket(node: BlendStruct, ...names: string[]): BlendStruct | null {
  const inputs = node.list("inputs");
  for (const name of names) {
    const found = inputs.find((socket) => socketName(socket) === name || socket.string("name") === name);
    if (found) return found;
  }
  return null;
}

function linkInto(graph: Graph, socket: BlendStruct): { node: BlendStruct; socket: string } | null {
  for (const link of graph.links) {
    if (link.pointer("tosock") === 0n) continue;
    const target = link.deref("tosock");
    if (target?.offset !== socket.offset) continue;
    const from = link.deref("fromnode");
    const fromSocket = link.deref("fromsock");
    if (!from) return null;
    if ((from.number("flag") & NODE_MUTED) !== 0) return null;
    return { node: from, socket: fromSocket ? socketName(fromSocket) : "" };
  }
  return null;
}

function defaultFloat(socket: BlendStruct | null, fallback: number): number {
  const value = socket?.deref("default_value");
  return value?.has("value") ? value.number("value") : fallback;
}

function defaultVector(socket: BlendStruct | null, fallback: readonly number[]): number[] {
  const value = socket?.deref("default_value");
  const values = value?.numbers("value") ?? [];
  return values.length >= fallback.length ? values.slice(0, fallback.length) : [...fallback];
}

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
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
  "NodeReroute",
]);

/** Pass-through nodes that only pick or convert channels, which leave an image's values as the preview reads them. */
const KEEPS_VALUES = new Set([
  "ShaderNodeSeparateColor",
  "ShaderNodeSeparateRGB",
  "ShaderNodeSeparateXYZ",
  "ShaderNodeRGBToBW",
  "NodeReroute",
]);

/** An Image Texture node that feeds an input, the output it feeds from and the nodes between. */
interface FedImage {
  node: BlendStruct;
  /** The image node's output, such as "Color" or "Alpha". */
  output: string;
  /** Each node between, as its type and the output it feeds from, such as "ShaderNodeSeparateColor:Green". */
  via: string[];
  /** Names of the nodes between that change the image's values, such as "Hue/Saturation/Value". */
  changes: string[];
}

/** Follows a socket upstream through color adjustments to the Image Texture node that feeds it. */
function imageFeeding(graph: Graph, socket: BlendStruct | null, depth = 0): FedImage | null {
  if (!socket || depth > 16) return null;
  const link = linkInto(graph, socket);
  if (!link) return null;
  const type = nodeType(link.node);
  if (type === "ShaderNodeTexImage") {
    return link.node.pointer("id") !== 0n ? { node: link.node, output: link.socket, via: [], changes: [] } : null;
  }
  if (!PASS_THROUGH.has(type)) return null;
  for (const input of link.node.list("inputs")) {
    const found = imageFeeding(graph, input, depth + 1);
    if (!found) continue;
    const change = KEEPS_VALUES.has(type) ? [] : [link.node.string("name") || type];
    return { ...found, via: [`${type}:${link.socket}`, ...found.via], changes: [...change, ...found.changes] };
  }
  return null;
}

/** The image an input samples, noting on the draft any nodes between that change its values. */
function imageInput(graph: Graph, draft: MaterialDraft, input: string, found: FedImage | null): ImageUse | null {
  if (!found) return null;
  if (found.changes.length > 0) {
    const image = found.node.deref("id");
    const nodes = [...new Set(found.changes)].join(", ");
    draft.approximations.push(
      `${input} passes ${image ? idName(image) : "an image"} through ${nodes}, which the preview leaves out`,
    );
  }
  return imageUse(graph, found.node);
}

function uvTransformOf(mapping: BlendStruct): UvTransform | null {
  const location = defaultVector(inputSocket(mapping, "Location"), [0, 0, 0]);
  const rotation = defaultVector(inputSocket(mapping, "Rotation"), [0, 0, 0]);
  const scale = defaultVector(inputSocket(mapping, "Scale"), [1, 1, 1]);
  const transform: UvTransform = {
    offset: [location[0] ?? 0, location[1] ?? 0],
    scale: [scale[0] ?? 1, scale[1] ?? 1],
    rotation: rotation[2] ?? 0,
  };
  const identity =
    transform.offset[0] === 0 &&
    transform.offset[1] === 0 &&
    transform.scale[0] === 1 &&
    transform.scale[1] === 1 &&
    transform.rotation === 0;
  return identity ? null : transform;
}

function imageUse(graph: Graph, node: BlendStruct): ImageUse | null {
  const image = node.deref("id");
  if (!image) return null;
  const storage = node.deref("storage");
  const extension = storage?.number("extension") ?? 0;
  const wrap = WRAPS[extension] ?? "repeat";
  let uvMap: string | null = null;
  let transform: UvTransform | null = null;
  let coordinates: string | null = null;
  let vector = linkInto(graph, inputSocket(node, "Vector") ?? node);
  for (let depth = 0; vector && depth < 8; depth++) {
    const type = nodeType(vector.node);
    if (type === "ShaderNodeUVMap") {
      uvMap = vector.node.deref("storage")?.string("uv_map") || null;
      break;
    }
    if (type === "ShaderNodeMapping") {
      transform ??= uvTransformOf(vector.node);
      vector = linkInto(graph, inputSocket(vector.node, "Vector") ?? vector.node);
      continue;
    }
    if (type === "NodeReroute") {
      vector = linkInto(graph, vector.node.list("inputs")[0] ?? vector.node);
      continue;
    }
    if (type !== "ShaderNodeTexCoord") coordinates = vector.node.string("name") || type;
    else if (vector.socket !== "UV") coordinates = vector.socket;
    break;
  }
  return { image, uvMap, wrap, transform, coordinates, clipped: extension === EXTENSION_CLIP };
}

function graphOf(tree: BlendStruct): Graph {
  return { nodes: tree.list("nodes"), links: tree.list("links") };
}

function outputNode(graph: Graph): BlendStruct | null {
  const outputs = graph.nodes.filter((node) => nodeType(node) === "ShaderNodeOutputMaterial");
  return outputs.find((node) => (node.number("flag") & NODE_DO_OUTPUT) !== 0) ?? outputs[0] ?? null;
}

interface SurfaceShader {
  node: BlendStruct | null;
  /** How much of the surface is not a Transparent BSDF, from the mix and add shaders that lead to it. */
  alpha: number;
  /** What the preview shows differently from Blender's shader mix. */
  notes: string[];
}

/**
 * The shader the output's surface shows most of, looking through mix and add shaders, which weigh their inputs. A
 * Transparent BSDF in the mix makes the surface see-through rather than becoming the shader.
 */
function surfaceShader(graph: Graph, output: BlendStruct): SurfaceShader {
  const leaves: { node: BlendStruct; weight: number }[] = [];
  const notes: string[] = [];
  let transparent = 0;
  const visit = (node: BlendStruct | null, weight: number, depth: number) => {
    if (!node || weight <= 0 || depth > 16) return;
    const type = nodeType(node);
    const inputs = node.list("inputs");
    if (type === "ShaderNodeMixShader") {
      const fac = inputs[0] ?? null;
      const linked = fac !== null && linkInto(graph, fac) !== null;
      if (linked) notes.push(`${node.string("name") || "A Mix Shader"} mixes by nodes, shown half and half`);
      const factor = fac && !linked ? clamp01(defaultFloat(fac, 0.5)) : 0.5;
      visit(linkInto(graph, inputs[1] ?? node)?.node ?? null, weight * (1 - factor), depth + 1);
      visit(linkInto(graph, inputs[2] ?? node)?.node ?? null, weight * factor, depth + 1);
    } else if (type === "ShaderNodeAddShader") {
      for (const input of inputs) visit(linkInto(graph, input)?.node ?? null, weight, depth + 1);
    } else if (type === "ShaderNodeBsdfTransparent") {
      transparent += weight;
    } else {
      leaves.push({ node, weight });
    }
  };
  visit(linkInto(graph, inputSocket(output, "Surface") ?? output)?.node ?? null, 1, 0);
  const strongest = leaves.reduce<{ node: BlendStruct; weight: number } | null>(
    (best, leaf) => (best === null || leaf.weight > best.weight ? leaf : best),
    null,
  );
  if (leaves.length > 1 && strongest) {
    notes.push(`${leaves.length} shaders mix, shown as ${strongest.node.string("name") || "the strongest"}`);
  }
  return { node: strongest?.node ?? null, alpha: clamp01(1 - transparent), notes };
}

function readPrincipled(graph: Graph, node: BlendStruct, draft: MaterialDraft): void {
  const baseSocket = inputSocket(node, "Base Color");
  const color = defaultVector(baseSocket, [0.8, 0.8, 0.8, 1]);
  draft.baseColor = [color[0] ?? 0.8, color[1] ?? 0.8, color[2] ?? 0.8, 1];
  const baseImage = imageFeeding(graph, baseSocket);
  draft.baseColorImage = imageInput(graph, draft, "Base color", baseImage);

  const metallicSocket = inputSocket(node, "Metallic");
  const roughnessSocket = inputSocket(node, "Roughness");
  draft.metallic = clamp01(defaultFloat(metallicSocket, 0));
  draft.roughness = clamp01(defaultFloat(roughnessSocket, 0.5));
  const metallicImage = imageFeeding(graph, metallicSocket);
  const roughnessImage = imageFeeding(graph, roughnessSocket);
  const separated = (found: typeof metallicImage, channel: string) =>
    found?.via[0]?.startsWith("ShaderNodeSeparate") === true && found.via[0].endsWith(`:${channel}`);
  if (
    metallicImage &&
    roughnessImage &&
    metallicImage.node.offset === roughnessImage.node.offset &&
    (separated(metallicImage, "Blue") || separated(metallicImage, "B")) &&
    (separated(roughnessImage, "Green") || separated(roughnessImage, "G"))
  ) {
    draft.metallicRoughnessImage = imageInput(graph, draft, "Metallic and roughness", metallicImage);
  } else {
    draft.roughnessImage = channelImage(graph, draft, "Roughness", roughnessImage, ["Green", "G"]);
    draft.metalnessImage = channelImage(graph, draft, "Metallic", metallicImage, ["Blue", "B"]);
  }

  const normalLink = linkInto(graph, inputSocket(node, "Normal") ?? node);
  const normalSpace = normalLink?.node.deref("storage")?.number("space") ?? TANGENT_SPACE;
  if (normalLink && nodeType(normalLink.node) === "ShaderNodeNormalMap" && normalSpace !== TANGENT_SPACE) {
    const space = NORMAL_SPACES[normalSpace] ?? "non-tangent";
    draft.approximations.push(`Its normal map is in ${space} space, which the preview leaves out`);
  } else if (normalLink && nodeType(normalLink.node) === "ShaderNodeNormalMap") {
    const strength = inputSocket(normalLink.node, "Strength");
    const image = imageFeeding(graph, inputSocket(normalLink.node, "Color"));
    if (image) {
      draft.normalImage = imageInput(graph, draft, "Normal", image);
      draft.normalScale = defaultFloat(strength, 1);
    }
  }

  const emissionSocket = inputSocket(node, "Emission Color", "Emission");
  const emission = defaultVector(emissionSocket, [0, 0, 0, 1]);
  const strengthSocket = inputSocket(node, "Emission Strength");
  const strength = strengthSocket ? defaultFloat(strengthSocket, 1) : 1;
  const emissionImage = imageFeeding(graph, emissionSocket);
  draft.emissive = [(emission[0] ?? 0) * strength, (emission[1] ?? 0) * strength, (emission[2] ?? 0) * strength];
  draft.emissionStrength = strength;
  if (emissionImage && strength > 0) draft.emissiveImage = imageInput(graph, draft, "Emission", emissionImage);

  const alphaSocket = inputSocket(node, "Alpha");
  const alpha = clamp01(defaultFloat(alphaSocket, 1));
  draft.baseColor[3] = alpha;
  const alphaLinked = linkInto(graph, alphaSocket ?? node) !== null;
  if (alpha < 1 || alphaLinked) draft.alphaMode = "blend";
  const alphaImage = imageFeeding(graph, alphaSocket);
  const fromBaseImage =
    alphaImage !== null &&
    alphaImage.node.offset === baseImage?.node.offset &&
    alphaImage.output === "Alpha" &&
    alphaImage.via.length === 0;
  if (alphaLinked && !fromBaseImage) {
    const image = alphaImage?.node.deref("id");
    const source = image ? idName(image) : "nodes";
    draft.approximations.push(`Alpha comes from ${source}, which the preview leaves out`);
  }
}

/**
 * The image a scalar input samples, unless it picks a channel other than the one the preview reads, green for
 * roughness and blue for metallic, which it notes on the draft instead.
 */
function channelImage(
  graph: Graph,
  draft: MaterialDraft,
  input: string,
  found: FedImage | null,
  readable: readonly string[],
): ImageUse | null {
  if (!found) return null;
  const [separate] = found.via;
  const channel = separate?.startsWith("ShaderNodeSeparate") ? separate.slice(separate.indexOf(":") + 1) : null;
  if (channel === null || readable.includes(channel)) return imageInput(graph, draft, input, found);
  const image = found.node.deref("id");
  const name = image ? idName(image) : "an image";
  draft.approximations.push(`${input} comes from the ${channel} channel of ${name}, which the preview leaves out`);
  return null;
}

function readSimpleShader(graph: Graph, node: BlendStruct, draft: MaterialDraft): void {
  const type = nodeType(node);
  const colorSocket = inputSocket(node, "Color");
  const color = defaultVector(colorSocket, [0.8, 0.8, 0.8, 1]);
  const image = imageFeeding(graph, colorSocket);
  if (type === "ShaderNodeEmission") {
    const strength = defaultFloat(inputSocket(node, "Strength"), 1);
    draft.baseColor = [0, 0, 0, 1];
    draft.emissiveImage = imageInput(graph, draft, "Emission", image);
    draft.emissionStrength = strength;
    draft.emissive = [(color[0] ?? 0) * strength, (color[1] ?? 0) * strength, (color[2] ?? 0) * strength];
    return;
  }
  draft.baseColor = [color[0] ?? 0.8, color[1] ?? 0.8, color[2] ?? 0.8, 1];
  draft.baseColorImage = imageInput(graph, draft, "Base color", image);
  const roughness = inputSocket(node, "Roughness");
  if (type === "ShaderNodeBsdfDiffuse") draft.roughness = 1;
  else if (roughness) draft.roughness = clamp01(defaultFloat(roughness, 0.5));
  draft.metallic = type === "ShaderNodeBsdfGlossy" || type === "ShaderNodeBsdfAnisotropic" ? 1 : 0;
}

/**
 * A metallic-roughness approximation of a Blender material from its node tree. A material without nodes takes its
 * color, metallic and roughness, opaque, as EEVEE renders it.
 */
export function readMaterial(material: BlendStruct, version: number): MaterialDraft {
  const draft = defaultMaterial(idName(material));
  draft.baseColor = [material.number("r"), material.number("g"), material.number("b"), 1];
  draft.metallic = clamp01(material.number("metallic"));
  draft.roughness = clamp01(material.number("roughness"));
  draft.doubleSided = (material.number("blend_flag") & BACKFACE_CULLING) === 0;

  const tree = material.deref("nodetree");
  const usesNodes = version >= 500 || !material.has("use_nodes") || material.number("use_nodes") !== 0;
  const graph = tree && usesNodes ? graphOf(tree) : null;
  const output = graph ? outputNode(graph) : null;
  if (graph && output) {
    const surface = surfaceShader(graph, output);
    if (surface.node && nodeType(surface.node) === "ShaderNodeBsdfPrincipled")
      readPrincipled(graph, surface.node, draft);
    else if (surface.node) {
      readSimpleShader(graph, surface.node, draft);
      if (!SIMPLE_SHADERS.has(nodeType(surface.node))) {
        const label = surface.node.string("name") || nodeType(surface.node);
        draft.approximations.push(`Its surface is ${label}, shown as a plain shader of its color`);
      }
    }
    draft.approximations.push(...surface.notes);
    if (surface.alpha < 1) {
      draft.baseColor[3] *= surface.alpha;
      draft.alphaMode = "blend";
    }
  }

  for (const use of imageUses(draft)) {
    const name = idName(use.image);
    const source = use.image.has("source") ? use.image.number("source") : IMAGE_SOURCE_FILE;
    if (source !== IMAGE_SOURCE_FILE && !packedFile(use.image)) {
      const kind = IMAGE_SOURCES[source] ?? "non-file";
      draft.approximations.push(`${name} is a ${kind} image, which the preview leaves out`);
    }
    if (use.coordinates) {
      draft.approximations.push(`${name} uses ${use.coordinates} coordinates, shown with the UV map`);
    }
    if (use.clipped) draft.approximations.push(`${name} is clipped at its edges, shown extended`);
  }
  if (material.number("blend_method") === BLEND_METHOD_CLIP && draft.alphaMode === "blend") {
    draft.alphaMode = "mask";
    draft.alphaCutoff = material.number("alpha_threshold") || 0.5;
  }
  return draft;
}
