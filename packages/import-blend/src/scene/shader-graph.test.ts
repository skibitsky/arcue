import { describe, expect, it, vi } from "vitest";
import { Nodes, ShaderTree } from "../../test/shader-trees";
import { BlendStruct } from "../blend/file";
import type { ShaderGraph } from "./shader-graph";
import { constantOf, graphOf, inputSocket, upstreamNode } from "./shader-graph";

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
