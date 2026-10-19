import type { BlendStruct } from "../blend/file.js";

/** Blender's `eNodeSocketDatatype`. */
export const SocketType = {
  float: 0,
  vector: 1,
  color: 2,
  shader: 3,
  boolean: 4,
  int: 6,
  geometry: 10,
  bundle: 17,
  closure: 18,
} as const;

export const NODE_DO_OUTPUT = 1 << 6;
const NODE_MUTED = 1 << 9;
const SOCK_UNAVAILABLE = 1 << 3;
const SOCK_NO_INTERNAL_LINK = 1 << 9;
const LINK_MUTED = 1 << 4;
/** Rec. 709 luminance, which Blender's default color management uses to turn a color into a value. */
const LUMINANCE = [0.2126, 0.7152, 0.0722] as const;

export interface ShaderGraph {
  nodes: BlendStruct[];
  /** The links into each input socket, by the socket's offset in the file: one, or many into a multi-input socket. */
  linksTo: Map<number, BlendStruct[]>;
}

/** A node's output socket, with the name a link from it goes by. */
interface NodeOutput {
  node: BlendStruct;
  socket: BlendStruct;
  name: string;
}

/** Where an input's value comes from: a node's output, or the value set on a socket. */
type Source = ({ kind: "output" } & NodeOutput) | { kind: "value"; socket: BlendStruct };

export function graphOf(tree: BlendStruct): ShaderGraph {
  const linksTo = new Map<number, BlendStruct[]>();
  for (const link of tree.list("links")) {
    if (link.pointer("tosock") === 0n) continue;
    const target = link.deref("tosock");
    if (!target) continue;
    const links = linksTo.get(target.offset);
    if (links) links.push(link);
    else linksTo.set(target.offset, [link]);
  }
  return { nodes: tree.list("nodes"), linksTo };
}

export function nodeType(node: BlendStruct): string {
  return node.string("idname");
}

/** The Group Output node that gives a node group its outputs: the active one, or the first. */
export function groupOutput(nodes: readonly BlendStruct[]): BlendStruct | null {
  const outputs = nodes.filter((node) => nodeType(node) === "NodeGroupOutput");
  return outputs.find((node) => (node.number("flag") & NODE_DO_OUTPUT) !== 0) ?? outputs[0] ?? null;
}

export function nodeLabel(node: BlendStruct): string {
  return node.string("name") || nodeType(node);
}

function socketName(socket: BlendStruct): string {
  return socket.string("identifier") || socket.string("name");
}

export function socketType(socket: BlendStruct): number {
  return socket.number("type");
}

function available(socket: BlendStruct): boolean {
  return (socket.number("flag") & SOCK_UNAVAILABLE) === 0;
}

export function isMuted(node: BlendStruct): boolean {
  return (node.number("flag") & NODE_MUTED) !== 0;
}

function socketIn(sockets: BlendStruct[], names: readonly string[]): BlendStruct | null {
  for (const name of names) {
    const found = sockets.find((socket) => socketName(socket) === name || socket.string("name") === name);
    if (found) return found;
  }
  return null;
}

export function inputSocket(node: BlendStruct, ...names: string[]): BlendStruct | null {
  return socketIn(node.list("inputs"), names);
}

export function outputSocket(node: BlendStruct, ...names: string[]): BlendStruct | null {
  return socketIn(node.list("outputs"), names);
}

/** For each output type, the input types a muted node passes to it, the best match last. */
const PASS_RANKS: Partial<Record<number, readonly number[]>> = {
  [SocketType.color]: [SocketType.boolean, SocketType.int, SocketType.float, SocketType.color],
  [SocketType.vector]: [SocketType.boolean, SocketType.int, SocketType.float, SocketType.vector],
  [SocketType.float]: [SocketType.vector, SocketType.color, SocketType.boolean, SocketType.int, SocketType.float],
};

/** Blender's `get_internal_link_type_priority`: how well an input of one type passes through to an output. */
function passPriority(from: number, to: number): number {
  const rank = PASS_RANKS[to];
  if (!rank) return from === to ? 1 : -1;
  const index = rank.indexOf(from);
  return index < 0 ? -1 : index + 1;
}

/**
 * The input a muted node passes to `output`, as Blender picks it: the best matching type, and a linked input over an
 * unlinked one.
 */
function passedInput(graph: ShaderGraph, node: BlendStruct, output: BlendStruct): BlendStruct | null {
  if ((output.number("flag") & SOCK_NO_INTERNAL_LINK) !== 0) return null;
  let selected: BlendStruct | null = null;
  let selectedPriority = -1;
  let selectedLinked = false;
  for (const input of node.list("inputs")) {
    if (!available(input) || (input.number("flag") & SOCK_NO_INTERNAL_LINK) !== 0) continue;
    const priority = passPriority(socketType(input), socketType(output));
    if (priority < 0) continue;
    const linked = graph.linksTo.has(input.offset);
    if (priority <= selectedPriority && !(linked && !selectedLinked)) continue;
    selected = input;
    selectedPriority = priority;
    selectedLinked = linked;
  }
  return selected;
}

/** For each graph, the node output each input socket reads through reroutes and muted nodes, or null, by its offset. */
const passedOutputs = new WeakMap<ShaderGraph, Map<number, NodeOutput | null>>();

/**
 * One step upstream from an input: the node output it reads, or the input that the reroute or muted node it reads
 * passes on, or null for neither. A muted link, or a reroute or muted node that passes on no link, leaves neither.
 */
function readFrom(graph: ShaderGraph, input: BlendStruct): NodeOutput | { passedOn: BlendStruct | null } {
  const link = graph.linksTo.get(input.offset)?.[0];
  if (!link || !available(input) || (link.number("flag") & LINK_MUTED) !== 0) return { passedOn: null };
  const node = link.deref("fromnode");
  const output = link.deref("fromsock");
  if (!node || !output || !available(output)) return { passedOn: null };
  if (nodeType(node) !== "NodeReroute" && !isMuted(node)) return { node, socket: output, name: socketName(output) };
  const passedOn = nodeType(node) === "NodeReroute" ? node.list("inputs")[0] : passedInput(graph, node, output);
  return { passedOn: passedOn ?? null };
}

/**
 * The node output an input reads, looking through reroutes and muted nodes as Blender does, however many there are, or
 * null where they lead to none or loop, as Blender leaves out a loop's links. Every input on the way reads the same
 * output, so each is looked through once for a graph.
 */
function passedOutput(graph: ShaderGraph, socket: BlendStruct): NodeOutput | null {
  let known = passedOutputs.get(graph);
  if (!known) {
    known = new Map();
    passedOutputs.set(graph, known);
  }
  const passed = new Set<number>();
  let found: NodeOutput | null = null;
  for (let input: BlendStruct | null = socket; input !== null && !passed.has(input.offset); ) {
    const answer = known.get(input.offset);
    if (answer !== undefined) {
      found = answer;
      break;
    }
    passed.add(input.offset);
    const step = readFrom(graph, input);
    if ("node" in step) {
      found = step;
      break;
    }
    input = step.passedOn;
  }
  for (const offset of passed) known.set(offset, found);
  return found;
}

/** Where an input's value comes from: the node output it reads, or else its own value. */
function sourceOf(graph: ShaderGraph, socket: BlendStruct): Source {
  const output = passedOutput(graph, socket);
  return output ? { kind: "output", ...output } : { kind: "value", socket };
}

/**
 * The node outputs that a node's inputs read through every link Blender evaluates, without looking through reroutes
 * or muted nodes.
 */
export function feedingOutputs(graph: ShaderGraph, node: BlendStruct): { node: BlendStruct; socket: BlendStruct }[] {
  return node.list("inputs").flatMap((input) =>
    (available(input) ? (graph.linksTo.get(input.offset) ?? []) : []).flatMap((link) => {
      const from = link.deref("fromnode");
      const socket = link.deref("fromsock");
      const evaluated = from && socket && available(socket) && (link.number("flag") & LINK_MUTED) === 0;
      return evaluated ? [{ node: from, socket }] : [];
    }),
  );
}

/** The node output an input reads, or null when the input keeps a value. */
export function linkedOutput(graph: ShaderGraph, socket: BlendStruct | null): NodeOutput | null {
  return socket ? passedOutput(graph, socket) : null;
}

/** The value set on a socket, as Blender stores it for the socket's type. */
export function socketValue(socket: BlendStruct): number[] {
  const value = socket.deref("default_value");
  if (!value?.has("value")) return [];
  const type = socketType(socket);
  if (type === SocketType.vector || type === SocketType.color) return value.numbers("value");
  return [value.number("value")];
}

/** Blender's implicit conversion between socket types. */
function convertValue(values: readonly number[], from: number, to: number): number[] {
  const scalar = (): number => {
    if (from === SocketType.color)
      return LUMINANCE.reduce((sum, weight, index) => sum + weight * (values[index] ?? 0), 0);
    if (from === SocketType.vector) return ((values[0] ?? 0) + (values[1] ?? 0) + (values[2] ?? 0)) / 3;
    return values[0] ?? 0;
  };
  const triple = (): number[] => {
    if (from === SocketType.color || from === SocketType.vector)
      return [values[0] ?? 0, values[1] ?? 0, values[2] ?? 0];
    const value = values[0] ?? 0;
    return [value, value, value];
  };
  if (to === SocketType.color) return [...triple(), from === SocketType.color ? (values[3] ?? 1) : 1];
  if (to === SocketType.vector) return triple();
  return [scalar()];
}

const CONSTANT_NODES = new Set(["ShaderNodeRGB", "ShaderNodeValue"]);
/** The first version whose EEVEE gives an Image Texture node without an image an alpha of 1, as Cycles does, not 0. */
const OPAQUE_EMPTY_IMAGES = 502;

/** Whether a node is an Image Texture node without an image, which EEVEE shows as black. */
export function isEmptyImageNode(node: BlendStruct): boolean {
  return nodeType(node) === "ShaderNodeTexImage" && node.deref("id") === null;
}

/** What an output of an Image Texture node without an image gives, as EEVEE renders it. */
function emptyImageOutput(node: BlendStruct, output: string): number[] {
  if (output !== "Alpha") return [0, 0, 0, 0];
  return [node.file.version >= OPAQUE_EMPTY_IMAGES ? 1 : 0];
}

/**
 * The value an input takes when it is constant: its own value, an RGB or Value node's, or what an Image Texture node
 * without an image gives, converted to the input's type or to `type`. Null when other nodes drive it.
 */
export function constantOf(
  graph: ShaderGraph,
  socket: BlendStruct | null,
  type = socket ? socketType(socket) : SocketType.float,
): number[] | null {
  if (!socket) return null;
  const source = sourceOf(graph, socket);
  if (source.kind === "output" && isEmptyImageNode(source.node)) {
    return convertValue(emptyImageOutput(source.node, source.name), socketType(source.socket), type);
  }
  if (source.kind === "output" && !CONSTANT_NODES.has(nodeType(source.node))) return null;
  const values = socketValue(source.socket);
  if (values.length === 0) return null;
  return convertValue(values, socketType(source.socket), type);
}

/**
 * The node outputs Blender evaluates for an output node, by the socket's offset: those its inputs read, directly or
 * through the nodes that feed them.
 */
export function readOutputs(graph: ShaderGraph, output: BlendStruct): Set<number> {
  const read = new Set<number>();
  const reached = new Set<number>([output.offset]);
  const pending = [output];
  for (let node = pending.pop(); node; node = pending.pop()) {
    for (const input of node.list("inputs")) {
      const source = linkedOutput(graph, input);
      if (!source) continue;
      read.add(source.socket.offset);
      if (reached.has(source.node.offset)) continue;
      reached.add(source.node.offset);
      pending.push(source.node);
    }
  }
  return read;
}

/** For each graph and node type, the first node of the type that drives each node searched, by the node's offset. */
const upstreamFound = new WeakMap<ShaderGraph, Map<string, Map<number, BlendStruct | null>>>();

function upstreamMemo(graph: ShaderGraph, type: string): Map<number, BlendStruct | null> {
  let byType = upstreamFound.get(graph);
  if (!byType) {
    byType = new Map();
    upstreamFound.set(graph, byType);
  }
  let found = byType.get(type);
  if (!found) {
    found = new Map();
    byType.set(type, found);
  }
  return found;
}

/**
 * The first node of `type` that drives the input, searching upstream through every input in order, depth first. Each
 * node of a graph is searched once, however many inputs and searches share it.
 */
export function upstreamNode(graph: ShaderGraph, socket: BlendStruct, type: string): BlendStruct | null {
  const start = linkedOutput(graph, socket)?.node;
  if (!start) return null;
  const found = upstreamMemo(graph, type);
  const open = new Set<number>();
  const stack: { node: BlendStruct; inputs: BlendStruct[]; next: number }[] = [];
  const enter = (node: BlendStruct) => {
    if (nodeType(node) === type) {
      found.set(node.offset, node);
      return;
    }
    open.add(node.offset);
    stack.push({ node, inputs: node.list("inputs"), next: 0 });
  };
  const finish = (node: BlendStruct, result: BlendStruct | null) => {
    found.set(node.offset, result);
    open.delete(node.offset);
    stack.pop();
  };
  if (!found.has(start.offset)) enter(start);
  for (let top = stack.at(-1); top; top = stack.at(-1)) {
    const input = top.inputs[top.next];
    if (!input) {
      finish(top.node, null);
      continue;
    }
    const source = linkedOutput(graph, input)?.node;
    if (source && !open.has(source.offset) && !found.has(source.offset)) {
      enter(source);
      continue;
    }
    const result = source ? (found.get(source.offset) ?? null) : null;
    if (result) finish(top.node, result);
    else top.next++;
  }
  return found.get(start.offset) ?? null;
}
