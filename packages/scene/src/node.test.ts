import { describe, expect, it } from "vitest";
import { buildNodePaths } from "./node";

describe("buildNodePaths", () => {
  it("joins names from the root down", () => {
    const paths = buildNodePaths([
      { name: "Armature", parent: -1 },
      { name: "Hips", parent: 0 },
      { name: "Spine", parent: 1 },
      { name: "Body", parent: -1 },
    ]);
    expect(paths).toEqual(["Armature", "Armature/Hips", "Armature/Hips/Spine", "Body"]);
  });

  it("numbers siblings that share a name, in file order", () => {
    const paths = buildNodePaths([
      { name: "Root", parent: -1 },
      { name: "Spike", parent: 0 },
      { name: "Spike", parent: 0 },
      { name: "Spike", parent: -1 },
    ]);
    expect(paths).toEqual(["Root", "Root/Spike", "Root/Spike#2", "Spike"]);
  });

  it("escapes separators in names", () => {
    const paths = buildNodePaths([
      { name: "A/B", parent: -1 },
      { name: "C#2", parent: 0 },
      { name: "D\\E", parent: 1 },
    ]);
    expect(paths).toEqual(["A\\/B", "A\\/B/C\\#2", "A\\/B/C\\#2/D\\\\E"]);
  });

  it("names nodes without a name, numbering them like any other name", () => {
    const paths = buildNodePaths([
      { name: "Root", parent: -1 },
      { name: "", parent: 0 },
      { name: "", parent: 0 },
      { name: "(unnamed)", parent: 0 },
    ]);
    expect(paths).toEqual(["Root", "Root/(unnamed)", "Root/(unnamed)#2", "Root/(unnamed)#3"]);
  });

  it("requires parents to come before children", () => {
    expect(() =>
      buildNodePaths([
        { name: "Child", parent: 1 },
        { name: "Parent", parent: -1 },
      ]),
    ).toThrow(RangeError);
  });
});
