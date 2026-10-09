import type { PartView, SceneDescription } from "@arcue/scene";
import { defaultPartView } from "@arcue/scene";
import { describe, expect, it } from "vitest";
import { fakeScene, STONE_RESONATOR } from "../../dev/sample-data";
import { composedStone, lodStone, stoneBone } from "../test-helpers";
import type { OutlineFile, OutlineNode, OutlineRow } from "./outline";
import {
  dropRowKey,
  dropTarget,
  hasOutline,
  lodOptions,
  lodShown,
  outlineRows,
  outlineSize,
  outlineTree,
  treeKey,
  viewChip,
  visibilityChanged,
} from "./outline";

const stone = fakeScene(STONE_RESONATOR);

function view(fields: Partial<PartView>): PartView {
  return { ...defaultPartView(), ...fields };
}

/** Each row as its indented name, which reads like the drawer. */
function lines(rows: readonly OutlineRow[]): string[] {
  return rows.map((row) => `${"  ".repeat(row.depth)}${row.item.name}`);
}

function names(nodes: readonly OutlineNode[]): string[] {
  return lines(outlineRows(nodes));
}

function fileRow(rows: readonly OutlineRow[], name: string): OutlineFile {
  const item = rows.find((row) => row.item.kind === "file" && row.item.name === name)?.item;
  if (item?.kind !== "file") throw new Error(`No file row ${name}.`);
  return item;
}

function keyOf(rows: readonly OutlineRow[], name: string): string {
  const row = rows.find((candidate) => candidate.item.name === name);
  if (!row) throw new Error(`No row ${name}.`);
  return row.item.key;
}

describe("hasOutline", () => {
  it("shows for two parts or an added file with meshes, never for one part with LODs and a collision helper", () => {
    expect(hasOutline(stone)).toBe(false);
    expect(hasOutline(composedStone()(stone))).toBe(true);
    expect(hasOutline(lodStone(stone))).toBe(true);
    const lodsOnly = lodStone(stone);
    const single = { ...lodsOnly, parts: lodsOnly.parts.filter((part) => part.name !== "Pebble") };
    expect(hasOutline(single)).toBe(false);
    const composed = composedStone()(stone);
    const withHelper = { ...composed, parts: composed.parts.filter((part) => !part.id.includes("//")) };
    expect(hasOutline(withHelper)).toBe(false);
  });

  it("counts a hidden or isolated view as changed, and a LOD alone as not", () => {
    expect(visibilityChanged(view({ lod: 2 }))).toBe(false);
    expect(visibilityChanged(view({ hidden: ["A"] }))).toBe(true);
    expect(visibilityChanged(view({ isolated: "A" }))).toBe(true);
  });
});

describe("outlineTree", () => {
  it("lists the model's parts with helpers last, then each added file under its bone with its parts", () => {
    const scene = composedStone()(stone);
    expect(names(outlineTree(scene, "StoneResonator.fbx", "attached"))).toEqual([
      "StoneResonator.fbx",
      "  StoneResonator",
      "  UCX_Stone",
      "  Bone_1",
      "    beetle-shells.fbx",
      "      ShellRound",
      "      ShellSpiked",
    ]);
    const rows = outlineRows(outlineTree(scene, "StoneResonator.fbx", "attached"));
    expect(fileRow(rows, "beetle-shells.fbx")).toMatchObject({
      file: "beetle-shells.fbx",
      bone: stoneBone(scene, "Bone_1"),
      nodes: null,
    });
  });

  it("nests the whole bone tree with the skeleton on, files before child bones", () => {
    const tree = outlineTree(composedStone()(stone), "StoneResonator.fbx", "all");
    const shown = names(tree);
    expect(shown.slice(0, 8)).toEqual([
      "StoneResonator.fbx",
      "  StoneResonator",
      "  UCX_Stone",
      "  Bone_1",
      "    beetle-shells.fbx",
      "      ShellRound",
      "      ShellSpiked",
      "    Bone_2",
    ]);
    expect(shown).toHaveLength(7 + 61);
    expect(outlineSize(tree)).toBe(shown.length);
  });

  it("puts set pieces at the top level and names the nodes of a file that sits in several places", () => {
    const scene = composedStone({ split: true, set: true })(stone);
    const rows = outlineRows(outlineTree(scene, "StoneResonator.fbx", "attached"));
    expect(lines(rows)).toEqual([
      "StoneResonator.fbx",
      "  StoneResonator",
      "  UCX_Stone",
      "  Bone_1",
      "    beetle-shells.fbx",
      "      ShellRound",
      "    Bone_2",
      "      beetle-shells.fbx",
      "        ShellSpiked",
      "props.fbx",
      "  Crate",
    ]);
    const files = rows.flatMap((row) => (row.item.kind === "file" ? [row.item] : []));
    expect(files.map((file) => [file.bone, file.nodes])).toEqual([
      [stoneBone(scene, "Bone_1"), ["ShellRound"]],
      [stoneBone(scene, "Bone_2"), ["ShellSpiked"]],
      [null, null],
    ]);
  });
});

describe("outlineRows", () => {
  const tree = outlineTree(composedStone()(stone), "StoneResonator.fbx", "all");

  it("hides the rows under a collapsed row", () => {
    const rows = outlineRows(tree);
    const collapsed = new Set([keyOf(rows, "Bone_1")]);
    expect(lines(outlineRows(tree, { collapsed }))).toEqual([
      "StoneResonator.fbx",
      "  StoneResonator",
      "  UCX_Stone",
      "  Bone_1",
    ]);
    expect(outlineRows(tree, { collapsed }).find((row) => row.item.name === "Bone_1")).toMatchObject({
      expandable: true,
      expanded: false,
    });
  });

  it("filters bones and parts by name with the rows above them, and keeps a matching file's parts", () => {
    const rows = outlineRows(tree);
    const collapsed = new Set([keyOf(rows, "StoneResonator.fbx")]);
    expect(lines(outlineRows(tree, { filter: "bone_6", collapsed }))).toEqual([
      "StoneResonator.fbx",
      "  Bone_1",
      "    Bone_6",
      "    Bone_60",
      "    Bone_61",
      "    Bone_62",
    ]);
    expect(lines(outlineRows(tree, { filter: " SHELLS " }))).toEqual([
      "StoneResonator.fbx",
      "  Bone_1",
      "    beetle-shells.fbx",
      "      ShellRound",
      "      ShellSpiked",
    ]);
    expect(outlineRows(tree, { filter: "wing" })).toEqual([]);
  });
});

describe("dropping a file", () => {
  const scene = composedStone({ set: true })(stone);
  const rows = outlineRows(outlineTree(scene, "StoneResonator.fbx", "all"));
  const shells = fileRow(rows, "beetle-shells.fbx");
  const props = fileRow(rows, "props.fbx");

  it("attaches to the bone a row stands for, and detaches on the model or outside any row", () => {
    expect(dropTarget(rows, shells, keyOf(rows, "Bone_7"))).toBe(stoneBone(scene, "Bone_7"));
    expect(dropTarget(rows, shells, keyOf(rows, "StoneResonator.fbx"))).toBeNull();
    expect(dropTarget(rows, shells, keyOf(rows, "UCX_Stone"))).toBeNull();
    expect(dropTarget(rows, shells, null)).toBeNull();
    expect(dropTarget(rows, props, keyOf(rows, "ShellRound"))).toBe(stoneBone(scene, "Bone_1"));
  });

  it("changes nothing where the file already is", () => {
    expect(dropTarget(rows, shells, keyOf(rows, "Bone_1"))).toBeUndefined();
    expect(dropTarget(rows, shells, keyOf(rows, "ShellSpiked"))).toBeUndefined();
    expect(dropTarget(rows, props, null)).toBeUndefined();
    expect(dropTarget(rows, props, keyOf(rows, "Crate"))).toBeUndefined();
  });

  it("marks the bone, or the model row for a drop that detaches", () => {
    expect(dropRowKey(rows, stoneBone(scene, "Bone_7"))).toBe(keyOf(rows, "Bone_7"));
    expect(dropRowKey(rows, null)).toBe("model");
  });
});

describe("treeKey", () => {
  const tree = outlineTree(composedStone()(stone), "StoneResonator.fbx", "attached");
  const rows = outlineRows(tree);
  const collapsedBone = outlineRows(tree, { collapsed: new Set([keyOf(rows, "Bone_1")]) });

  it("moves up and down, to the ends, and starts at the top without a focused row", () => {
    expect(treeKey(rows, keyOf(rows, "StoneResonator"), "ArrowDown")).toEqual({ focus: keyOf(rows, "UCX_Stone") });
    expect(treeKey(rows, keyOf(rows, "StoneResonator"), "ArrowUp")).toEqual({ focus: "model" });
    expect(treeKey(rows, "model", "ArrowUp")).toEqual({ focus: "model" });
    expect(treeKey(rows, "model", "End")).toEqual({ focus: keyOf(rows, "ShellSpiked") });
    expect(treeKey(rows, keyOf(rows, "ShellSpiked"), "Home")).toEqual({ focus: "model" });
    expect(treeKey(rows, null, "ArrowDown")).toEqual({ focus: "model" });
  });

  it("opens and enters with right, closes and leaves with left", () => {
    const bone = keyOf(rows, "Bone_1");
    expect(treeKey(collapsedBone, bone, "ArrowRight")).toEqual({ toggle: bone });
    expect(treeKey(rows, bone, "ArrowRight")).toEqual({ focus: keyOf(rows, "beetle-shells.fbx") });
    expect(treeKey(rows, bone, "ArrowLeft")).toEqual({ toggle: bone });
    expect(treeKey(collapsedBone, bone, "ArrowLeft")).toEqual({ focus: "model" });
    expect(treeKey(rows, keyOf(rows, "ShellRound"), "ArrowRight")).toBeNull();
    expect(treeKey(rows, "model", "ArrowLeft")).toEqual({ toggle: "model" });
  });
});

describe("the LOD switch", () => {
  it("lists every level LOD0 first with the triangles on screen at it, and nothing without LODs", () => {
    const scene = lodStone(stone);
    expect(lodOptions(scene, defaultPartView())).toEqual([
      { level: 0, triangles: 10_920 },
      { level: 1, triangles: 5_560 },
      { level: 2, triangles: 2_880 },
    ]);
    expect(lodOptions(scene, view({ hidden: ["StoneResonator/Pebble"] }))[1]).toEqual({ level: 1, triangles: 5_360 });
    expect(lodOptions(stone, defaultPartView())).toEqual([]);
  });

  it("marks the highest level not above the view's LOD", () => {
    const options = [
      { level: 0, triangles: 3 },
      { level: 2, triangles: 1 },
    ];
    expect(lodShown(options, 1)).toBe(0);
    expect(lodShown(options, 2)).toBe(2);
    expect(lodShown(options, 9)).toBe(2);
  });
});

describe("viewChip", () => {
  const scene: SceneDescription = composedStone()(stone);

  it("shows nothing for the default view", () => {
    expect(viewChip(scene, undefined)).toBeNull();
    expect(viewChip(scene, defaultPartView())).toBeNull();
  });

  it("names two or fewer visible parts and lists what was hidden", () => {
    expect(viewChip(scene, view({ hidden: ["beetle-shells.fbx//ShellRound"] }))).toEqual({
      label: "StoneResonator",
      tip: "Hidden: ShellRound, ShellSpiked",
    });
    expect(viewChip(scene, view({ isolated: "StoneResonator/UCX_Stone" }))).toEqual({
      label: "UCX_Stone",
      tip: "Hidden: StoneResonator, ShellRound, ShellSpiked · Shown: UCX_Stone",
    });
  });

  it("counts more parts, collision helpers only when shown", () => {
    const scene4 = composedStone({ set: true })(stone);
    expect(viewChip(scene4, view({ hidden: ["props.fbx//Crate"], shown: ["beetle-shells.fbx//ShellSpiked"] }))).toEqual(
      { label: "3 of 4 parts", tip: "Hidden: Crate · Shown: ShellSpiked" },
    );
    expect(viewChip(scene, view({ shown: ["beetle-shells.fbx//ShellSpiked"] }))).toEqual({
      label: "All parts",
      tip: "Shown: ShellSpiked",
    });
  });

  it("names the LOD with its triangles", () => {
    expect(viewChip(lodStone(stone), view({ lod: 1 }))).toEqual({ label: "LOD1", tip: "LOD1 · 5,560 tris" });
    expect(viewChip(lodStone(stone), view({ lod: 2, hidden: ["StoneResonator/Pebble"] }))).toEqual({
      label: "LOD2 · StoneResonator",
      tip: "LOD2 · 2,680 tris · Hidden: Pebble",
    });
  });
});
