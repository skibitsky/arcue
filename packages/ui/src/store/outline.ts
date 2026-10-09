import type { PartView, SceneDescription, ScenePart } from "@arcue/scene";
import {
  isDefaultPartView,
  knownPartView,
  lodLevels,
  partShown,
  shownByDefault,
  splitMemberPath,
  visibleMeshes,
} from "@arcue/scene";
import { formatCount } from "../format";

/**
 * Whether the model gets an outline: two or more parts draw by default, or the view adds a file with meshes. A LOD
 * group is one part, and collision helpers never count.
 */
export function hasOutline(scene: SceneDescription): boolean {
  let shown = 0;
  for (const part of scene.parts) {
    if (part.role === "socket" || part.levels.length === 0) continue;
    if (splitMemberPath(part.id).file !== null) return true;
    if (shownByDefault(part)) shown++;
  }
  return shown >= 2;
}

/** A part view hides, shows or isolates a part other than by default. The LOD has its own switch. */
export function visibilityChanged(view: PartView): boolean {
  return view.hidden.length > 0 || view.shown.length > 0 || view.isolated !== null;
}

export type OutlineItem =
  | { kind: "model"; key: string; name: string }
  | {
      kind: "file";
      key: string;
      name: string;
      /** The file relative to the model's folder, as composition commands take it. */
      file: string;
      /** The model node the file hangs on, or null for a set piece. */
      bone: number | null;
      /**
       * The file's nodes in this place, by their path in the file, when the file sits in more than one place.
       * Null when this is the whole file.
       */
      nodes: readonly string[] | null;
    }
  | { kind: "bone"; key: string; name: string; node: number; path: string }
  | { kind: "part"; key: string; name: string; part: ScenePart };

export interface OutlineNode {
  item: OutlineItem;
  children: OutlineNode[];
}

interface Group {
  file: string;
  anchor: number;
  roots: number[];
  parts: ScenePart[];
}

/** Collision helpers sit last in their file's list. */
function helpersLast(parts: readonly ScenePart[]): ScenePart[] {
  return [...parts.filter((part) => part.role !== "collision"), ...parts.filter((part) => part.role === "collision")];
}

function partNode(part: ScenePart): OutlineNode {
  return { item: { kind: "part", key: `p:${part.id}`, name: part.name, part }, children: [] };
}

/**
 * The outline of a scene: the model file with its parts and bones, each added file under the bone it hangs on with
 * its parts, then the added files that stay in place. `bones` "all" lists the whole bone tree; "attached" lists only
 * the bones files hang on. Sockets and files without meshes are left out.
 */
export function outlineTree(scene: SceneDescription, modelName: string, bones: "all" | "attached"): OutlineNode[] {
  const fileOf = scene.nodes.map((node) => splitMemberPath(node.path).file);
  const parentOf = (index: number) => scene.nodes[index]?.parent ?? -1;
  const modelParts: ScenePart[] = [];
  const groups = new Map<string, Group>();
  for (const part of scene.parts) {
    if (part.role === "socket" || part.levels.length === 0) continue;
    const file = splitMemberPath(part.id).file;
    if (file === null) {
      modelParts.push(part);
      continue;
    }
    let root = part.node;
    while (parentOf(root) >= 0 && fileOf[parentOf(root)] === file) root = parentOf(root);
    const parent = parentOf(root);
    const anchor = parent >= 0 && fileOf[parent] === null ? parent : -1;
    const key = `${file}\n${anchor}`;
    let group = groups.get(key);
    if (!group) {
      group = { file, anchor, roots: [], parts: [] };
      groups.set(key, group);
    }
    if (!group.roots.includes(root)) group.roots.push(root);
    group.parts.push(part);
  }

  const places = new Map<string, number>();
  for (const group of groups.values()) places.set(group.file, (places.get(group.file) ?? 0) + 1);
  const groupNode = (group: Group): OutlineNode => ({
    item: {
      kind: "file",
      key: `f:${group.file}:${group.anchor}`,
      name: group.file,
      file: group.file,
      bone: group.anchor >= 0 ? group.anchor : null,
      nodes:
        (places.get(group.file) ?? 0) > 1
          ? group.roots.map((root) => splitMemberPath(scene.nodes[root]?.path ?? "").path)
          : null,
    },
    children: helpersLast(group.parts).map(partNode),
  });

  const anchors = new Set([...groups.values()].flatMap((group) => (group.anchor >= 0 ? [group.anchor] : [])));
  const listed = new Set(anchors);
  if (bones === "all") {
    scene.nodes.forEach((node, index) => {
      if (node.kind === "bone" && fileOf[index] === null) listed.add(index);
    });
  }
  const model: OutlineNode = {
    item: { kind: "model", key: "model", name: modelName },
    children: helpersLast(modelParts).map(partNode),
  };
  const boneNodes = new Map<number, OutlineNode>();
  for (const index of [...listed].sort((a, b) => a - b)) {
    const node = scene.nodes[index];
    if (!node) continue;
    boneNodes.set(index, {
      item: { kind: "bone", key: `b:${index}`, name: node.name, node: index, path: node.path },
      children: [],
    });
  }
  const sets: OutlineNode[] = [];
  for (const group of groups.values()) {
    const host = boneNodes.get(group.anchor);
    if (host) host.children.push(groupNode(group));
    else sets.push(groupNode(group));
  }
  for (const [index, bone] of boneNodes) {
    let parent = parentOf(index);
    while (parent >= 0 && !boneNodes.has(parent)) parent = parentOf(parent);
    (boneNodes.get(parent) ?? model).children.push(bone);
  }
  return [model, ...sets];
}

export interface OutlineRow {
  item: OutlineItem;
  depth: number;
  /** The key of the row it sits under, or null at the top. */
  parent: string | null;
  expandable: boolean;
  expanded: boolean;
}

/** Keeps the nodes whose name holds the query and the nodes above them. A matching file keeps all its parts. */
function filterTree(nodes: readonly OutlineNode[], query: string): OutlineNode[] {
  return nodes.flatMap((node) => {
    const matches = node.item.name.toLowerCase().includes(query);
    if (matches && node.item.kind === "file") return [node];
    const children = filterTree(node.children, query);
    return matches || children.length > 0 ? [{ item: node.item, children }] : [];
  });
}

/** The rows on screen: collapsed rows hide their children, and a filter shows what matches with everything above. */
export function outlineRows(
  tree: readonly OutlineNode[],
  options: { filter?: string; collapsed?: ReadonlySet<string> } = {},
): OutlineRow[] {
  const query = options.filter?.trim().toLowerCase() ?? "";
  const collapsed = query === "" ? (options.collapsed ?? new Set<string>()) : new Set<string>();
  const nodes = query === "" ? tree : filterTree(tree, query);
  const rows: OutlineRow[] = [];
  const walk = (list: readonly OutlineNode[], depth: number, parent: string | null) => {
    for (const node of list) {
      const expandable = node.children.length > 0;
      const expanded = expandable && !collapsed.has(node.item.key);
      rows.push({ item: node.item, depth, parent, expandable, expanded });
      if (expanded) walk(node.children, depth + 1, node.item.key);
    }
  };
  walk(nodes, 0, null);
  return rows;
}

/** How many rows the whole tree has, with every bone, for deciding whether a filter is worth showing. */
export function outlineSize(tree: readonly OutlineNode[]): number {
  return tree.reduce((sum, node) => sum + 1 + outlineSize(node.children), 0);
}

export type OutlineFile = Extract<OutlineItem, { kind: "file" }>;

/**
 * What dropping a dragged file on a row does: a node index attaches it to that bone, null detaches it, and undefined
 * changes nothing. A row stands for the bone or model it sits under; a top-level file or no row at all is the model.
 */
export function dropTarget(
  rows: readonly OutlineRow[],
  dragged: OutlineFile,
  over: string | null,
): number | null | undefined {
  const byKey = new Map(rows.map((row) => [row.item.key, row]));
  let row = over === null ? undefined : byKey.get(over);
  while (row && row.item.kind !== "bone" && row.item.kind !== "model") {
    row = row.parent === null ? undefined : byKey.get(row.parent);
  }
  if (row?.item.kind === "bone") return row.item.node === dragged.bone ? undefined : row.item.node;
  return dragged.bone === null ? undefined : null;
}

/** The row a drop lands on, to mark it: the bone, or the model row for a drop that detaches. */
export function dropRowKey(rows: readonly OutlineRow[], target: number | null): string | null {
  if (target === null) return rows.find((row) => row.item.kind === "model")?.item.key ?? null;
  return rows.find((row) => row.item.kind === "bone" && row.item.node === target)?.item.key ?? null;
}

export type TreeKey = "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight" | "Home" | "End";

export function isTreeKey(key: string): key is TreeKey {
  return ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"].includes(key);
}

/**
 * What a key does on the focused row, as tree views do: up and down move, right opens a closed row or moves into it,
 * left closes an open row or moves to the row above it in the tree.
 */
export function treeKey(
  rows: readonly OutlineRow[],
  focused: string | null,
  key: TreeKey,
): { focus: string } | { toggle: string } | null {
  if (rows.length === 0) return null;
  const at = rows.findIndex((row) => row.item.key === focused);
  const row = rows[at];
  const focus = (index: number) => {
    const target = rows[Math.max(0, Math.min(rows.length - 1, index))];
    return target ? { focus: target.item.key } : null;
  };
  if (!row) return focus(key === "End" ? rows.length - 1 : 0);
  switch (key) {
    case "ArrowDown":
      return focus(at + 1);
    case "ArrowUp":
      return focus(at - 1);
    case "Home":
      return focus(0);
    case "End":
      return focus(rows.length - 1);
    case "ArrowRight":
      if (row.expandable && !row.expanded) return { toggle: row.item.key };
      return row.expanded ? focus(at + 1) : null;
    case "ArrowLeft":
      if (row.expanded) return { toggle: row.item.key };
      return row.parent === null ? null : { focus: row.parent };
  }
}

/** Triangles a view draws. */
export function trianglesOf(scene: SceneDescription, view: PartView): number {
  const visible = visibleMeshes(scene.parts, view);
  return scene.meshes.reduce((sum, mesh, index) => (visible.has(index) ? sum + mesh.indices.length / 3 : sum), 0);
}

export interface LodOption {
  level: number;
  /** Triangles on screen at this level, with the view's other choices. */
  triangles: number;
}

/** The LOD switch's levels, LOD0 first, or none for a model without LODs. */
export function lodOptions(scene: SceneDescription, view: PartView): LodOption[] {
  const levels = lodLevels(scene.parts);
  if (levels.length < 2) return [];
  return levels.map((level) => ({ level, triangles: trianglesOf(scene, { ...view, lod: level }) }));
}

/** The level a LOD switch marks for a view: the highest level not above the view's LOD. */
export function lodShown(options: readonly LodOption[], lod: number): number | null {
  let shown: number | null = options[0]?.level ?? null;
  for (const option of options) if (option.level <= lod) shown = option.level;
  return shown;
}

const LISTED_NAMES = 6;

function names(parts: readonly ScenePart[]): string {
  const listed = parts.slice(0, LISTED_NAMES).map((part) => part.name);
  const more = parts.length - listed.length;
  return more > 0 ? `${listed.join(", ")} and ${more} more` : listed.join(", ");
}

export interface ViewChip {
  label: string;
  tip: string;
}

/**
 * The chip for a comment's parts view, or null for the default view. It names the visible parts when there are two
 * or fewer, otherwise "3 of 5 parts", and its tip lists what was hidden. Collision helpers count only when shown.
 */
export function viewChip(scene: SceneDescription | null, stored: PartView | null | undefined): ViewChip | null {
  if (!scene || !stored) return null;
  const view = knownPartView(scene.parts, stored);
  if (isDefaultPartView(view)) return null;
  const drawable = scene.parts.filter((part) => part.role !== "socket" && part.levels.length > 0);
  const visible = drawable.filter((part) => partShown(scene.parts, view, part));
  const counted = drawable.filter((part) => part.role === "model" || visible.includes(part));
  const label: string[] = [];
  const tip: string[] = [];
  if (view.lod > 0) {
    label.push(`LOD${view.lod}`);
    tip.push(`LOD${view.lod} · ${formatCount(trianglesOf(scene, view))} tris`);
  }
  if (visibilityChanged(view)) {
    if (visible.length === counted.length) label.push("All parts");
    else if (visible.length === 0) label.push("No parts");
    else if (visible.length <= 2) label.push(visible.map((part) => part.name).join(", "));
    else label.push(`${visible.length} of ${counted.length} parts`);
    const hidden = counted.filter((part) => !visible.includes(part));
    const extra = visible.filter((part) => !shownByDefault(part));
    if (hidden.length > 0) tip.push(`Hidden: ${names(hidden)}`);
    if (extra.length > 0) tip.push(`Shown: ${names(extra)}`);
  }
  if (label.length === 0) return null;
  return { label: label.join(" · "), tip: tip.join(" · ") };
}
