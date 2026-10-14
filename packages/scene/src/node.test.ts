import { describe, expect, it } from "vitest";
import { buildNodePaths, MAX_NODE_DEPTH, nestsTooDeep } from "./node";

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

describe("nestsTooDeep", () => {
  const chain = (length: number) => Array.from({ length }, (_, index) => ({ parent: index - 1 }));

  it("allows nodes nested as deep as the viewport walks, beside any number of roots", () => {
    expect(nestsTooDeep(chain(MAX_NODE_DEPTH))).toBe(false);
    expect(nestsTooDeep([...chain(MAX_NODE_DEPTH), ...Array.from({ length: 5000 }, () => ({ parent: -1 }))])).toBe(
      false,
    );
  });

  it("finds a node one level deeper than that, wherever its branch starts", () => {
    expect(nestsTooDeep(chain(MAX_NODE_DEPTH + 1))).toBe(true);
    const branched = [
      { parent: -1 },
      { parent: -1 },
      ...chain(MAX_NODE_DEPTH - 1).map(({ parent }) => ({ parent: parent + 2 })),
    ];
    expect(nestsTooDeep(branched)).toBe(false);
    expect(nestsTooDeep([...branched, { parent: branched.length - 1 }])).toBe(true);
  });
});
