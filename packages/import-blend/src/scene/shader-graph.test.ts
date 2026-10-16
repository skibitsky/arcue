import { describe, expect, it, vi } from "vitest";
import type { NodeSpec } from "../../test/shader-trees";
import { Nodes, ShaderTree, Socket } from "../../test/shader-trees";
import { BlendStruct } from "../blend/file";
import type { ShaderGraph } from "./shader-graph";
import { constantOf, graphOf, inputSocket, linkedOutput, upstreamNode } from "./shader-graph";

function graphOfTree(material: BlendStruct): ShaderGraph {
  const tree = material.deref("nodetree");
  if (!tree) throw new Error("No node tree was written.");
  return graphOf(tree);
}

function input(graph: ShaderGraph, node: string, socket: string): BlendStruct {
  const found = graph.nodes.find((candidate) => candidate.string("name") === node);
  const result = found ? inputSocket(found, socket) : null;
  if (!result) throw new RangeError(`No input ${socket} of ${node}.`);
  return result;
}

/** An Emission shader whose color comes from a Shader to RGB node through `length` Math nodes in a row. */
function toonChain(length: number): ShaderTree {
  const tree = new ShaderTree();
  const output = tree.add(Nodes.output());
  const emission = tree.add(Nodes.emission());
  tree.link(emission, "Emission", output, "Surface");
  let previous = tree.add(Nodes.shaderToRgb());
  let previousOutput = "Color";
  for (let index = 0; index < length; index++) {
    const math = tree.add(Nodes.math(`Math ${index}`));
    tree.link(previous, previousOutput, math, "Value");
    previous = math;
    previousOutput = "Value";
  }
  tree.link(previous, previousOutput, emission, "Color");
  return tree;
}

describe("upstreamNode", () => {
  it("finds a node far more nodes upstream than the call stack is deep", { timeout: 30_000 }, () => {
    const graph = graphOfTree(toonChain(20_000).material());
    const found = upstreamNode(graph, input(graph, "Emission", "Color"), "ShaderNodeShaderToRGB");
    expect(found?.string("name")).toBe("Shader to RGB");
  });

  it("searches each node of a graph once, however many searches reach it", () => {
    const tree = new ShaderTree();
    const output = tree.add(Nodes.output());
    let previous = tree.add(Nodes.math("Math 0"));
    for (let index = 1; index < 1000; index++) {
      const math = tree.add(Nodes.math(`Math ${index}`));
      tree.link(previous, "Value", math, "Value");
      previous = math;
    }
    const emissions = Array.from({ length: 100 }, (_, index) => {
      const emission = tree.add({ ...Nodes.emission(), name: `Emission ${index}` });
      tree.link(previous, "Value", emission, "Color");
      return emission;
    });
    tree.link(emissions[0] ?? 0, "Emission", output, "Surface");
    const graph = graphOfTree(tree.material());
    const list = vi.spyOn(BlendStruct.prototype, "list");
    for (let index = 0; index < emissions.length; index++) {
      const color = input(graph, `Emission ${index}`, "Color");
      expect(upstreamNode(graph, color, "ShaderNodeShaderToRGB")).toBeNull();
    }
    expect(list.mock.calls.length).toBeLessThan(2_000);
    list.mockRestore();
  });

  it("finds the node the first input reaches first, as a depth-first search does", () => {
    const tree = new ShaderTree();
    const output = tree.add(Nodes.output());
    const emission = tree.add(Nodes.emission());
    tree.link(emission, "Emission", output, "Surface");
    const join = tree.add(Nodes.math("Join"));
    const shared = tree.add(Nodes.math("Shared"));
    const deep = tree.add({ ...Nodes.shaderToRgb(), name: "Deep" });
    const near = tree.add({ ...Nodes.shaderToRgb(), name: "Near" });
    tree.link(deep, "Color", shared, "Value");
    tree.link(shared, "Value", join, "Value");
    tree.link(near, "Color", join, "Value_001");
    tree.link(join, "Value", emission, "Color");
    const graph = graphOfTree(tree.material());
    const found = upstreamNode(graph, input(graph, "Emission", "Color"), "ShaderNodeShaderToRGB");
    expect(found?.string("name")).toBe("Deep");
  });
});

describe("constantOf", () => {
  it("reads an Image Texture node without an image as EEVEE does: black, and an alpha of 1 from Blender 5.2 on", () => {
    const tree = new ShaderTree();
    const output = tree.add(Nodes.output());
    const principled = tree.add(Nodes.principled());
    const empty = tree.add(Nodes.image());
    tree.link(principled, "BSDF", output, "Surface");
    tree.link(empty, "Color", principled, "Base Color");
    tree.link(empty, "Color", principled, "Roughness");
    tree.link(empty, "Alpha", principled, "Alpha");
    for (const [version, alpha] of [
      ["402", 0],
      ["0501", 0],
      ["0502", 1],
    ] as const) {
      const graph = graphOfTree(tree.material({}, version));
      expect(constantOf(graph, input(graph, "Principled BSDF", "Base Color")), version).toEqual([0, 0, 0, 0]);
      expect(constantOf(graph, input(graph, "Principled BSDF", "Roughness")), version).toEqual([0]);
      expect(constantOf(graph, input(graph, "Principled BSDF", "Alpha")), version).toEqual([alpha]);
    }
  });
});

function reroute(name: string): NodeSpec {
  return {
    idname: "NodeReroute",
    name,
    inputs: [{ name: "Input", type: Socket.color }],
    outputs: [{ name: "Output", type: Socket.color }],
  };
}

/** Reroutes `length` in a row, each reading the one before, and the index of the first and of the last. */
function rerouteChain(tree: ShaderTree, length: number): { first: number; last: number } {
  const first = tree.add(reroute("Reroute 0"));
  let last = first;
  for (let index = 1; index < length; index++) {
    const next = tree.add(reroute(`Reroute ${index}`));
    tree.link(last, "Output", next, "Input");
    last = next;
  }
  return { first, last };
}

describe("linkedOutput", () => {
  it("reads through far more reroutes than the call stack is deep", { timeout: 30_000 }, () => {
    const tree = new ShaderTree();
    const output = tree.add(Nodes.output());
    const principled = tree.add(Nodes.principled());
    tree.link(principled, "BSDF", output, "Surface");
    const image = tree.add(Nodes.image({ name: "tex.png" }));
    const { first, last } = rerouteChain(tree, 20_000);
    tree.link(image, "Color", first, "Input");
    tree.link(last, "Output", principled, "Base Color");
    const graph = graphOfTree(tree.material());
    const source = linkedOutput(graph, input(graph, "Principled BSDF", "Base Color"));
    expect([source?.node.string("name"), source?.name]).toEqual(["Image Texture", "Color"]);
  });

  it("reads the reroutes that many inputs share once, however many inputs read through them", () => {
    const tree = new ShaderTree();
    const output = tree.add(Nodes.output());
    const value = tree.add({ ...Nodes.math("Source"), inputs: [] });
    const { first, last } = rerouteChain(tree, 1000);
    tree.link(value, "Value", first, "Input");
    const emissions = Array.from({ length: 1000 }, (_, index) => {
      const emission = tree.add({ ...Nodes.emission(), name: `Emission ${index}` });
      tree.link(last, "Output", emission, "Color");
      return emission;
    });
    tree.link(emissions[0] ?? 0, "Emission", output, "Surface");
    const graph = graphOfTree(tree.material());
    const list = vi.spyOn(BlendStruct.prototype, "list");
    for (let index = 0; index < emissions.length; index++) {
      const source = linkedOutput(graph, input(graph, `Emission ${index}`, "Color"));
      expect(source?.node.string("name")).toBe("Source");
    }
    expect(list.mock.calls.length).toBeLessThan(5_000);
    list.mockRestore();
  });

  it("reads an input that a loop of reroutes feeds as unlinked, as Blender leaves out a loop's links", () => {
    const tree = new ShaderTree();
    const output = tree.add(Nodes.output());
    const emission = tree.add(Nodes.emission());
    tree.link(emission, "Emission", output, "Surface");
    const { first, last } = rerouteChain(tree, 40);
    tree.link(last, "Output", first, "Input");
    tree.link(last, "Output", emission, "Color");
    const graph = graphOfTree(tree.material());
    expect(linkedOutput(graph, input(graph, "Emission", "Color"))).toBeNull();
  });
});
