/**
 * Writes a material and its shader nodes into a small .blend file, for tests of graphs that Blender's UI makes hard to
 * build: thousands of nodes, shaders that many mix shaders share, images in any alpha mode or color space.
 */

import type { BlendStruct } from "../src/blend/file";
import { readBlendFile } from "../src/blend/file";
import type { BlockDefinition, FieldValue, FileDefinition } from "./synthetic";
import { writeBlend } from "./synthetic";

const STRUCTS: FileDefinition["structs"] = [
  {
    type: "ListBase",
    fields: [
      ["void", "*first"],
      ["void", "*last"],
    ],
  },
  {
    type: "ID",
    fields: [
      ["void", "*next"],
      ["void", "*prev"],
      ["char", "name[66]"],
      ["void", "*lib"],
    ],
  },
  { type: "ColorManagedColorspaceSettings", fields: [["char", "name[64]"]] },
  {
    type: "Image",
    fields: [
      ["ID", "id"],
      ["char", "name[1024]"],
      ["short", "source"],
      ["char", "alpha_mode"],
      ["ColorManagedColorspaceSettings", "colorspace_settings"],
    ],
  },
  { type: "bNodeSocketValueFloat", fields: [["float", "value"]] },
  { type: "bNodeSocketValueVector", fields: [["float", "value[3]"]] },
  { type: "bNodeSocketValueRGBA", fields: [["float", "value[4]"]] },
  {
    type: "bNodeSocket",
    fields: [
      ["bNodeSocket", "*next"],
      ["bNodeSocket", "*prev"],
      ["char", "identifier[64]"],
      ["char", "name[64]"],
      ["short", "type"],
      ["int", "flag"],
      ["void", "*default_value"],
    ],
  },
  {
    type: "bNode",
    fields: [
      ["bNode", "*next"],
      ["bNode", "*prev"],
      ["char", "idname[64]"],
      ["char", "name[64]"],
      ["int", "flag"],
      ["short", "custom1"],
      ["short", "custom2"],
      ["ID", "*id"],
      ["void", "*storage"],
      ["ListBase", "inputs"],
      ["ListBase", "outputs"],
    ],
  },
  {
    type: "bNodeLink",
    fields: [
      ["bNodeLink", "*next"],
      ["bNodeLink", "*prev"],
      ["bNode", "*fromnode"],
      ["bNode", "*tonode"],
      ["bNodeSocket", "*fromsock"],
      ["bNodeSocket", "*tosock"],
      ["int", "flag"],
    ],
  },
  {
    type: "bNodeTree",
    fields: [
      ["ListBase", "nodes"],
      ["ListBase", "links"],
    ],
  },
  {
    type: "Material",
    fields: [
      ["ID", "id"],
      ["float", "r"],
      ["float", "g"],
      ["float", "b"],
      ["float", "metallic"],
      ["float", "roughness"],
      ["char", "blend_method"],
      ["char", "blend_flag"],
      ["char", "surface_render_method"],
      ["float", "alpha_threshold"],
      ["short", "use_nodes"],
      ["bNodeTree", "*nodetree"],
    ],
  },
];

/** Blender's socket types, `eNodeSocketDatatype`. */
export const Socket = { float: 0, vector: 1, color: 2, shader: 3 } as const;

export interface SocketSpec {
  name: string;
  type: number;
  value?: number | readonly number[];
}

export interface ImageSpec {
  name: string;
  /** Blender's `alpha_mode`: 0 straight, 1 premultiplied, 2 channel packed, 3 none. */
  alphaMode?: number;
  colorSpace?: string;
}

export interface NodeSpec {
  idname: string;
  name?: string;
  flag?: number;
  custom1?: number;
  custom2?: number;
  image?: ImageSpec;
  inputs?: readonly SocketSpec[];
  outputs?: readonly SocketSpec[];
}

export interface MaterialSpec {
  name?: string;
  color?: readonly [number, number, number];
  useNodes?: boolean;
  /** Blender's `blend_method`: 0 opaque, 3 clip, 4 hashed, 5 blend. */
  blendMethod?: number;
  /** Blender's `surface_render_method`: 0 dithered, 1 blended. */
  renderMethod?: number;
}

const float = (name: string, value = 0): SocketSpec => ({ name, type: Socket.float, value });
const color = (name: string, value: readonly number[] = [0.8, 0.8, 0.8, 1]): SocketSpec => ({
  name,
  type: Socket.color,
  value,
});
const shader = (name: string): SocketSpec => ({ name, type: Socket.shader });

/** The nodes the tests build, with the sockets Blender gives them. */
export const Nodes = {
  output: (): NodeSpec => ({
    idname: "ShaderNodeOutputMaterial",
    name: "Material Output",
    inputs: [shader("Surface"), shader("Volume"), { name: "Displacement", type: Socket.vector, value: [0, 0, 0] }],
  }),
  principled: (base: readonly number[] = [0.8, 0.8, 0.8, 1], alpha = 1): NodeSpec => ({
    idname: "ShaderNodeBsdfPrincipled",
    name: "Principled BSDF",
    inputs: [color("Base Color", base), float("Metallic"), float("Roughness", 0.5), float("Alpha", alpha)],
    outputs: [shader("BSDF")],
  }),
  emission: (value: readonly number[] = [1, 1, 1, 1]): NodeSpec => ({
    idname: "ShaderNodeEmission",
    name: "Emission",
    inputs: [color("Color", value), float("Strength", 1)],
    outputs: [shader("Emission")],
  }),
  transparent: (): NodeSpec => ({
    idname: "ShaderNodeBsdfTransparent",
    name: "Transparent BSDF",
    inputs: [color("Color", [1, 1, 1, 1])],
    outputs: [shader("BSDF")],
  }),
  mix: (factor = 0.5, name = "Mix Shader"): NodeSpec => ({
    idname: "ShaderNodeMixShader",
    name,
    inputs: [float("Fac", factor), shader("Shader"), shader("Shader_001")],
    outputs: [shader("Shader")],
  }),
  add: (name = "Add Shader"): NodeSpec => ({
    idname: "ShaderNodeAddShader",
    name,
    inputs: [shader("Shader"), shader("Shader_001")],
    outputs: [shader("Shader")],
  }),
  math: (name = "Math"): NodeSpec => ({
    idname: "ShaderNodeMath",
    name,
    inputs: [float("Value", 0.5), float("Value_001", 0.5)],
    outputs: [float("Value")],
  }),
  shaderToRgb: (): NodeSpec => ({
    idname: "ShaderNodeShaderToRGB",
    name: "Shader to RGB",
    inputs: [shader("Shader")],
    outputs: [color("Color"), float("Alpha")],
  }),
  image: (image?: ImageSpec): NodeSpec => ({
    idname: "ShaderNodeTexImage",
    name: "Image Texture",
    ...(image ? { image } : {}),
    inputs: [{ name: "Vector", type: Socket.vector, value: [0, 0, 0] }],
    outputs: [color("Color"), float("Alpha")],
  }),
} as const;

const IMAGE_SOURCE_FILE = 1;

/** A shader node tree under construction; `material` writes it and reads the material back. */
export class ShaderTree {
  readonly #nodes: NodeSpec[] = [];
  readonly #links: [from: number, output: string, to: number, input: string][] = [];

  /** Adds a node and returns its index. */
  add(node: NodeSpec): number {
    this.#nodes.push(node);
    return this.#nodes.length - 1;
  }

  link(from: number, output: string, to: number, input: string): void {
    this.#links.push([from, output, to, input]);
  }

  /** The material of this tree, read from a .blend file of `version`, such as "402" or "0502". */
  material(spec: MaterialSpec = {}, version = "402"): BlendStruct {
    let next = 0x10000n;
    const address = () => {
      next += 0x10000n;
      return next;
    };
    const blocks: BlockDefinition[] = [];
    const images = new Map<string, bigint>();
    const imageBlocks: BlockDefinition[] = [];
    const imageAddress = (image: ImageSpec): bigint => {
      const known = images.get(image.name);
      if (known !== undefined) return known;
      const at = address();
      images.set(image.name, at);
      imageBlocks.push({
        code: "IM",
        struct: "Image",
        address: at,
        data: [
          {
            id: { name: `IM${image.name}` },
            name: `//${image.name}`,
            source: IMAGE_SOURCE_FILE,
            alpha_mode: image.alphaMode ?? 0,
            colorspace_settings: { name: image.colorSpace ?? "sRGB" },
          },
        ],
      });
      return at;
    };
    const valueBlock = (socket: SocketSpec): bigint => {
      if (socket.type === Socket.shader) return 0n;
      const values = typeof socket.value === "number" ? [socket.value] : [...(socket.value ?? [0])];
      const struct =
        socket.type === Socket.color
          ? "bNodeSocketValueRGBA"
          : socket.type === Socket.vector
            ? "bNodeSocketValueVector"
            : "bNodeSocketValueFloat";
      const at = address();
      const value: FieldValue = struct === "bNodeSocketValueFloat" ? (values[0] ?? 0) : values;
      blocks.push({ code: "DATA", struct, address: at, data: [{ value }] });
      return at;
    };
    const socketList = (sockets: readonly SocketSpec[]) => {
      const addresses = sockets.map(() => address());
      sockets.forEach((socket, index) => {
        blocks.push({
          code: "DATA",
          struct: "bNodeSocket",
          address: addresses[index] ?? 0n,
          data: [
            {
              next: addresses[index + 1] ?? 0n,
              prev: addresses[index - 1] ?? 0n,
              identifier: socket.name,
              name: socket.name.replace(/_\d+$/, ""),
              type: socket.type,
              flag: 0,
              default_value: valueBlock(socket),
            },
          ],
        });
      });
      const byName = new Map(sockets.map((socket, index) => [socket.name, addresses[index] ?? 0n]));
      return { list: { first: addresses[0] ?? 0n, last: addresses.at(-1) ?? 0n }, byName };
    };
    const nodeAddresses = this.#nodes.map(() => address());
    const sockets = this.#nodes.map((node, index) => {
      const inputs = socketList(node.inputs ?? []);
      const outputs = socketList(node.outputs ?? []);
      blocks.push({
        code: "DATA",
        struct: "bNode",
        address: nodeAddresses[index] ?? 0n,
        data: [
          {
            next: nodeAddresses[index + 1] ?? 0n,
            prev: nodeAddresses[index - 1] ?? 0n,
            idname: node.idname,
            name: node.name ?? node.idname,
            flag: node.flag ?? 0,
            custom1: node.custom1 ?? 0,
            custom2: node.custom2 ?? 0,
            id: node.image ? imageAddress(node.image) : 0n,
            storage: 0n,
            inputs: inputs.list,
            outputs: outputs.list,
          },
        ],
      });
      return { inputs: inputs.byName, outputs: outputs.byName };
    });
    const linkAddresses = this.#links.map(() => address());
    this.#links.forEach(([from, output, to, input], index) => {
      const fromSocket = sockets[from]?.outputs.get(output);
      const toSocket = sockets[to]?.inputs.get(input);
      if (fromSocket === undefined || toSocket === undefined) {
        throw new RangeError(`No socket ${output} of node ${from} or ${input} of node ${to}.`);
      }
      blocks.push({
        code: "DATA",
        struct: "bNodeLink",
        address: linkAddresses[index] ?? 0n,
        data: [
          {
            next: linkAddresses[index + 1] ?? 0n,
            prev: linkAddresses[index - 1] ?? 0n,
            fromnode: nodeAddresses[from] ?? 0n,
            tonode: nodeAddresses[to] ?? 0n,
            fromsock: fromSocket,
            tosock: toSocket,
            flag: 0,
          },
        ],
      });
    });
    const tree = address();
    const [r, g, b] = spec.color ?? [0.8, 0.8, 0.8];
    const material: BlockDefinition = {
      code: "MA",
      struct: "Material",
      address: address(),
      data: [
        {
          id: { name: `MA${spec.name ?? "Material"}` },
          r,
          g,
          b,
          metallic: 0,
          roughness: 0.5,
          blend_method: spec.blendMethod ?? 4,
          blend_flag: 0,
          surface_render_method: spec.renderMethod ?? 0,
          alpha_threshold: 0.5,
          use_nodes: spec.useNodes === false ? 0 : 1,
          nodetree: tree,
        },
      ],
    };
    const treeBlock: BlockDefinition = {
      code: "DATA",
      struct: "bNodeTree",
      address: tree,
      data: [
        {
          nodes: { first: nodeAddresses[0] ?? 0n, last: nodeAddresses.at(-1) ?? 0n },
          links: { first: linkAddresses[0] ?? 0n, last: linkAddresses.at(-1) ?? 0n },
        },
      ],
    };
    const file = readBlendFile(
      writeBlend({
        header: version.length > 3 ? "new" : "old",
        pointerSize: 8,
        little: true,
        version,
        structs: STRUCTS,
        blocks: [material, treeBlock, ...blocks, ...imageBlocks],
      }),
    );
    const [block] = file.blocksWithCode("MA");
    const read = block ? file.first(block) : null;
    if (!read) throw new Error("No material was written.");
    return read;
  }
}
