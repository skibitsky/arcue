import type { AlphaMode, UvTransform, Vec3, Vec4, WrapMode } from "@arcue/scene";
import type { BlendStruct } from "../blend/file";
import { idName } from "../blend/ids";

/** An Image Texture node a material samples. */
export interface ImageUse {
  image: BlendStruct;
  /** The UV map a UV Map node names, or null for the mesh's default UV map. */
  uvMap: string | null;
  wrap: WrapMode;
  transform: UvTransform | null;
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
}

const NODE_DO_OUTPUT = 1 << 6;
const NODE_MUTED = 1 << 9;
const BACKFACE_CULLING = 1 << 2;
const BLEND_METHOD_CLIP = 3;

const WRAPS: readonly WrapMode[] = ["repeat", "clamp", "clamp", "mirror"];

interface Graph {
  nodes: BlendStruct[];
  links: BlendStruct[];
}

/** The material Blender shows for an empty slot. */
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

/** Follows a socket upstream through color adjustments to the Image Texture node that feeds it. */
function imageFeeding(
  graph: Graph,
  socket: BlendStruct | null,
  depth = 0,
): { node: BlendStruct; via: string[] } | null {
  if (!socket || depth > 16) return null;
  const link = linkInto(graph, socket);
  if (!link) return null;
  const type = nodeType(link.node);
  if (type === "ShaderNodeTexImage") return link.node.pointer("id") !== 0n ? { node: link.node, via: [] } : null;
  if (!PASS_THROUGH.has(type)) return null;
  for (const input of link.node.list("inputs")) {
    const found = imageFeeding(graph, input, depth + 1);
    if (found) return { node: found.node, via: [`${type}:${link.socket}`, ...found.via] };
  }
  return null;
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
  const wrap = WRAPS[storage?.number("extension") ?? 0] ?? "repeat";
  let uvMap: string | null = null;
  let transform: UvTransform | null = null;
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
    if (type === "ShaderNodeTexCoord" || type === "NodeReroute") {
      if (type === "NodeReroute") {
        vector = linkInto(graph, vector.node.list("inputs")[0] ?? vector.node);
        continue;
      }
      break;
    }
    break;
  }
  return { image, uvMap, wrap, transform };
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
}

/**
 * The shader the output's surface shows most of, looking through mix and add shaders, which weigh their inputs. A
 * Transparent BSDF in the mix makes the surface see-through rather than becoming the shader.
 */
function surfaceShader(graph: Graph, output: BlendStruct): SurfaceShader {
  const leaves: { node: BlendStruct; weight: number }[] = [];
  let transparent = 0;
  const visit = (node: BlendStruct | null, weight: number, depth: number) => {
    if (!node || weight <= 0 || depth > 16) return;
    const type = nodeType(node);
    const inputs = node.list("inputs");
    if (type === "ShaderNodeMixShader") {
      const fac = inputs[0] ?? null;
      const factor = fac && linkInto(graph, fac) === null ? clamp01(defaultFloat(fac, 0.5)) : 0.5;
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
  return { node: strongest?.node ?? null, alpha: clamp01(1 - transparent) };
}

function readPrincipled(graph: Graph, node: BlendStruct, draft: MaterialDraft): void {
  const baseSocket = inputSocket(node, "Base Color");
  const color = defaultVector(baseSocket, [0.8, 0.8, 0.8, 1]);
  draft.baseColor = [color[0] ?? 0.8, color[1] ?? 0.8, color[2] ?? 0.8, 1];
  const baseImage = imageFeeding(graph, baseSocket);
  draft.baseColorImage = baseImage ? imageUse(graph, baseImage.node) : null;

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
    draft.metallicRoughnessImage = imageUse(graph, metallicImage.node);
  } else {
    if (roughnessImage) draft.roughnessImage = imageUse(graph, roughnessImage.node);
    if (metallicImage) draft.metalnessImage = imageUse(graph, metallicImage.node);
  }

  const normalLink = linkInto(graph, inputSocket(node, "Normal") ?? node);
  if (normalLink && nodeType(normalLink.node) === "ShaderNodeNormalMap") {
    const strength = inputSocket(normalLink.node, "Strength");
    const image = imageFeeding(graph, inputSocket(normalLink.node, "Color"));
    if (image) {
      draft.normalImage = imageUse(graph, image.node);
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
  if (emissionImage && strength > 0) draft.emissiveImage = imageUse(graph, emissionImage.node);

  const alphaSocket = inputSocket(node, "Alpha");
  const alpha = clamp01(defaultFloat(alphaSocket, 1));
  draft.baseColor[3] = alpha;
  const alphaLinked = linkInto(graph, alphaSocket ?? node) !== null;
  if (alpha < 1 || alphaLinked) draft.alphaMode = "blend";
}

function readSimpleShader(graph: Graph, node: BlendStruct, draft: MaterialDraft): void {
  const type = nodeType(node);
  const colorSocket = inputSocket(node, "Color");
  const color = defaultVector(colorSocket, [0.8, 0.8, 0.8, 1]);
  const image = imageFeeding(graph, colorSocket);
  if (type === "ShaderNodeEmission") {
    const strength = defaultFloat(inputSocket(node, "Strength"), 1);
    draft.baseColor = [0, 0, 0, 1];
    draft.emissiveImage = image ? imageUse(graph, image.node) : null;
    draft.emissionStrength = strength;
    draft.emissive = [(color[0] ?? 0) * strength, (color[1] ?? 0) * strength, (color[2] ?? 0) * strength];
    return;
  }
  draft.baseColor = [color[0] ?? 0.8, color[1] ?? 0.8, color[2] ?? 0.8, 1];
  draft.baseColorImage = image ? imageUse(graph, image.node) : null;
  const roughness = inputSocket(node, "Roughness");
  if (type === "ShaderNodeBsdfDiffuse") draft.roughness = 1;
  else if (roughness) draft.roughness = clamp01(defaultFloat(roughness, 0.5));
  draft.metallic = type === "ShaderNodeBsdfGlossy" || type === "ShaderNodeBsdfAnisotropic" ? 1 : 0;
}

/** A metallic-roughness approximation of a Blender material from its node tree, or its viewport display values. */
export function readMaterial(material: BlendStruct, version: number): MaterialDraft {
  const draft = defaultMaterial(idName(material));
  draft.baseColor = [material.number("r"), material.number("g"), material.number("b"), material.number("a") || 1];
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
    else if (surface.node) readSimpleShader(graph, surface.node, draft);
    if (surface.alpha < 1) {
      draft.baseColor[3] *= surface.alpha;
      draft.alphaMode = "blend";
    }
  }

  if (material.number("blend_method") === BLEND_METHOD_CLIP && draft.alphaMode === "blend") {
    draft.alphaMode = "mask";
    draft.alphaCutoff = material.number("alpha_threshold") || 0.5;
  }
  return draft;
}
