import { describe, expect, it } from "vitest";
import type { BlockDefinition, FieldValue, FileDefinition } from "../../test/synthetic";
import { writeBlend } from "../../test/synthetic";
import { readBlendFile } from "../blend/file";
import { datablocks } from "../blend/ids";
import { smoothByAngle } from "./smooth-by-angle";

/** An object with a Geometry Nodes modifier and its node group, with only the members the reader takes. */
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
      ["char", "name[66]"],
      ["void", "*lib"],
    ],
  },
  { type: "bNodeSocketValueFloat", fields: [["float", "value"]] },
  { type: "bNodeSocketValueBoolean", fields: [["char", "value"]] },
  {
    type: "bNodeSocket",
    fields: [
      ["bNodeSocket", "*next"],
      ["bNodeSocket", "*prev"],
      ["char", "identifier[64]"],
      ["short", "type"],
      ["int", "flag"],
      ["void", "*default_value"],
    ],
  },
  {
    type: "NodeFunctionCompare",
    fields: [
      ["char", "operation"],
      ["char", "data_type"],
    ],
  },
  {
    type: "bNode",
    fields: [
      ["bNode", "*next"],
      ["bNode", "*prev"],
      ["char", "idname[64]"],
      ["int", "flag"],
      ["short", "custom1"],
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
    type: "bNodeTreeInterfaceSocket",
    fields: [
      ["char", "*socket_type"],
      ["int", "flag"],
      ["char", "*identifier"],
      ["void", "*socket_data"],
    ],
  },
  {
    type: "bNodeTreeInterfacePanel",
    fields: [
      ["void", "**items_array"],
      ["int", "items_num"],
    ],
  },
  { type: "bNodeTreeInterface", fields: [["bNodeTreeInterfacePanel", "root_panel"]] },
  {
    type: "bNodeTree",
    fields: [
      ["ID", "id"],
      ["ListBase", "nodes"],
      ["ListBase", "links"],
      ["bNodeTreeInterface", "tree_interface"],
    ],
  },
  {
    type: "ModifierData",
    fields: [
      ["ModifierData", "*next"],
      ["ModifierData", "*prev"],
      ["int", "type"],
      ["int", "mode"],
    ],
  },
  {
    type: "NodesModifierData",
    fields: [
      ["ModifierData", "modifier"],
      ["bNodeTree", "*node_group"],
    ],
  },
  {
    type: "Object",
    fields: [
      ["ID", "id"],
      ["ListBase", "modifiers"],
    ],
  },
];

const Socket = { float: 0, boolean: 4, geometry: 10 } as const;
const NODES_MODIFIER = 57;
const MODIFIER_ON_IN_VIEWPORT = 1;
const SOCKET_INPUT = 1;
const DOMAIN_EDGE = 1;
const DOMAIN_FACE = 2;
const BOOLEAN_AND = 0;
const COMPARE_LESS_EQUAL = 1;
const GROUP = 0x10000n;

interface SocketSpec {
  name: string;
  type?: number;
  /** A boolean socket's value. */
  on?: boolean;
}

interface NodeSpec {
  idname: string;
  custom1?: number;
  compare?: boolean;
  inputs?: SocketSpec[];
  outputs?: SocketSpec[];
}

/** The nodes of Blender's "Auto Smooth" group, by name. */
const NODES: Record<string, NodeSpec> = {
  input: {
    idname: "NodeGroupInput",
    outputs: [
      { name: "Socket_0", type: Socket.geometry },
      { name: "Socket_2", type: Socket.float },
    ],
  },
  output: { idname: "NodeGroupOutput", inputs: [{ name: "Geometry", type: Socket.geometry }] },
  edges: {
    idname: "GeometryNodeSetShadeSmooth",
    custom1: DOMAIN_EDGE,
    inputs: [{ name: "Geometry" }, { name: "Selection" }, { name: "Shade Smooth" }],
    outputs: [{ name: "Geometry" }],
  },
  faces: {
    idname: "GeometryNodeSetShadeSmooth",
    custom1: DOMAIN_FACE,
    inputs: [
      { name: "Geometry" },
      { name: "Selection", type: Socket.boolean, on: true },
      { name: "Shade Smooth", type: Socket.boolean, on: true },
    ],
    outputs: [{ name: "Geometry" }],
  },
  edgeSmooth: { idname: "GeometryNodeInputEdgeSmooth", outputs: [{ name: "Smooth" }] },
  faceSmooth: { idname: "GeometryNodeInputShadeSmooth", outputs: [{ name: "Smooth" }] },
  both: {
    idname: "FunctionNodeBooleanMath",
    custom1: BOOLEAN_AND,
    inputs: [{ name: "Boolean" }, { name: "Boolean_001" }],
    outputs: [{ name: "Boolean" }],
  },
  within: {
    idname: "FunctionNodeCompare",
    compare: true,
    inputs: [{ name: "A" }, { name: "B" }],
    outputs: [{ name: "Result" }],
  },
  angle: { idname: "GeometryNodeInputMeshEdgeAngle", outputs: [{ name: "Unsigned Angle" }] },
};

/** The links of the "Auto Smooth" group, as [from node, output, to node, input]. */
const LINKS: [string, string, string, string][] = [
  ["input", "Socket_0", "edges", "Geometry"],
  ["edges", "Geometry", "faces", "Geometry"],
  ["faces", "Geometry", "output", "Geometry"],
  ["edgeSmooth", "Smooth", "edges", "Selection"],
  ["both", "Boolean", "edges", "Shade Smooth"],
  ["within", "Result", "both", "Boolean"],
  ["faceSmooth", "Smooth", "both", "Boolean_001"],
  ["angle", "Unsigned Angle", "within", "A"],
  ["input", "Socket_2", "within", "B"],
];

/** Hands out addresses in the node group's range, and the blocks written at them. */
class Blocks {
  readonly blocks: BlockDefinition[] = [];
  #next = GROUP + 0x1000n;

  reserve(): bigint {
    const address = this.#next;
    this.#next += 0x100n;
    return address;
  }

  put(address: bigint, struct: string | null, data: BlockDefinition["data"]): bigint {
    this.blocks.push({ code: "DATA", struct, address, data });
    return address;
  }

  add(struct: string | null, data: BlockDefinition["data"]): bigint {
    return this.put(this.reserve(), struct, data);
  }

  text(value: string): bigint {
    return this.add(null, new TextEncoder().encode(`${value}\0`));
  }

  pointers(addresses: readonly bigint[]): bigint {
    const view = new DataView(new ArrayBuffer(addresses.length * 8));
    addresses.forEach((address, index) => {
      view.setBigUint64(index * 8, address, true);
    });
    return this.add(null, new Uint8Array(view.buffer));
  }
}

/** A ListBase over `items`, each written as one block of `struct` by `record` at an address `Blocks` hands out. */
function listOf<Item>(
  blocks: Blocks,
  struct: string,
  items: readonly Item[],
  record: (item: Item) => Record<string, FieldValue>,
): { list: Record<string, FieldValue>; addresses: bigint[] } {
  const addresses = items.map(() => blocks.reserve());
  items.forEach((item, index) => {
    const links = { next: addresses[index + 1] ?? 0n, prev: addresses[index - 1] ?? 0n };
    blocks.put(addresses[index] ?? 0n, struct, [{ ...links, ...record(item) }]);
  });
  return { list: { first: addresses[0] ?? 0n, last: addresses.at(-1) ?? 0n }, addresses };
}

/**
 * An object whose Geometry Nodes modifier runs the "Auto Smooth" group, with the group's mesh input first in its
 * interface and its angle input, of `angle`, in the innermost of `depth` panels, each in the one before.
 */
function smoothedObject(depth: number, angle: number): Uint8Array {
  const blocks = new Blocks();
  const sockets = new Map<string, bigint>();
  const socketList = (node: string, specs: readonly SocketSpec[], side: string) => {
    const { list, addresses } = listOf(blocks, "bNodeSocket", specs, (spec) => ({
      identifier: spec.name,
      type: spec.type ?? Socket.geometry,
      default_value: spec.on === undefined ? 0n : blocks.add("bNodeSocketValueBoolean", [{ value: spec.on ? 1 : 0 }]),
    }));
    specs.forEach((spec, index) => {
      sockets.set(`${node} ${side} ${spec.name}`, addresses[index] ?? 0n);
    });
    return list;
  };
  const names = Object.keys(NODES);
  const nodeRecords = names.map((name) => {
    const spec = NODES[name] ?? { idname: "" };
    return {
      idname: spec.idname,
      custom1: spec.custom1 ?? 0,
      storage: spec.compare
        ? blocks.add("NodeFunctionCompare", [{ operation: COMPARE_LESS_EQUAL, data_type: Socket.float }])
        : 0n,
      inputs: socketList(name, spec.inputs ?? [], "in"),
      outputs: socketList(name, spec.outputs ?? [], "out"),
    };
  });
  const nodes = listOf(blocks, "bNode", nodeRecords, (record) => record);
  const nodeAt = (name: string) => nodes.addresses[names.indexOf(name)] ?? 0n;
  const links = listOf(blocks, "bNodeLink", LINKS, ([from, output, to, input]) => ({
    fromnode: nodeAt(from),
    tonode: nodeAt(to),
    fromsock: sockets.get(`${from} out ${output}`) ?? 0n,
    tosock: sockets.get(`${to} in ${input}`) ?? 0n,
  }));

  const interfaceSocket = (identifier: string, type: string, data: bigint) =>
    blocks.add("bNodeTreeInterfaceSocket", [
      { socket_type: blocks.text(type), flag: SOCKET_INPUT, identifier: blocks.text(identifier), socket_data: data },
    ]);
  let inner = interfaceSocket("Socket_2", "NodeSocketFloat", blocks.add("bNodeSocketValueFloat", [{ value: angle }]));
  for (let level = 0; level < depth; level++) {
    inner = blocks.add("bNodeTreeInterfacePanel", [{ items_array: blocks.pointers([inner]), items_num: 1 }]);
  }
  const mesh = interfaceSocket("Socket_0", "NodeSocketGeometry", 0n);
  const rootItems = blocks.pointers([mesh, inner]);

  return writeBlend({
    header: "old",
    pointerSize: 8,
    little: true,
    structs: STRUCTS,
    blocks: [
      {
        code: "OB",
        struct: "Object",
        address: 0x100n,
        data: [{ id: { name: "OBSphere" }, modifiers: { first: 0x200n, last: 0x200n } }],
      },
      {
        code: "DATA",
        struct: "NodesModifierData",
        address: 0x200n,
        data: [{ modifier: { type: NODES_MODIFIER, mode: MODIFIER_ON_IN_VIEWPORT }, node_group: GROUP }],
      },
      {
        code: "NT",
        struct: "bNodeTree",
        address: GROUP,
        data: [
          {
            id: { name: "NTAuto Smooth" },
            nodes: nodes.list,
            links: links.list,
            tree_interface: { root_panel: { items_array: rootItems, items_num: 2 } },
          },
        ],
      },
      ...blocks.blocks,
    ],
  });
}

function objectOf(bytes: Uint8Array) {
  const [object] = datablocks(readBlendFile(bytes), "OB");
  if (!object) throw new Error("The synthetic file has no object.");
  return object;
}

describe("smoothByAngle", () => {
  it("reads the angle of an Auto Smooth group from its interface's panels", () => {
    expect(smoothByAngle(objectOf(smoothedObject(2, 0.5)))).toMatchObject({ angle: 0.5, ignoreSharpness: false });
  });

  it("reads an input in panels nested far deeper than the call stack", { timeout: 30_000 }, () => {
    expect(smoothByAngle(objectOf(smoothedObject(20_000, 0.25)))).toMatchObject({ angle: 0.25 });
  });
});
