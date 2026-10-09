import type { Bounds } from "./math";
import { boundsOfPoints } from "./math";
import type { Mesh } from "./mesh";
import type { SceneNode } from "./node";

/** A part's job in the file: a model to review, a collision helper (UCX_, UBX_, USP_, UCP_), or a socket (SOCKET_). */
export type PartRole = "model" | "collision" | "socket";

export interface PartLevel {
  /** The LOD number, 0 for the most detailed level. */
  level: number;
  /** Indices into `SceneDescription.meshes`. */
  meshes: number[];
}

/**
 * A piece of the model that people show, hide or isolate as one: a mesh, a LOD group with its levels, or a socket.
 * Every mesh belongs to exactly one part.
 */
export interface ScenePart {
  /**
   * The stable id that view state and comments use: the node path of the part's mesh, of its LOD group node, or of
   * the lowest level's mesh for a LOD group found by name. A part from another file of a composition carries that
   * file as a prefix, as `memberPath` writes it.
   */
  id: string;
  /** For people: the node's name, without the "_LOD<n>" suffix for a group found by name. */
  name: string;
  role: PartRole;
  /** The node that `id` names. */
  node: number;
  /** Meshes by LOD level, lowest level first. A part without LODs has level 0 only; a socket without a mesh has none. */
  levels: PartLevel[];
  /** A composition hides the part until someone shows it, such as the second of two alternative bodies. */
  hiddenByDefault?: boolean;
}

export type PartNode = Pick<SceneNode, "name" | "path" | "parent" | "mesh">;

const LOD_SUFFIX = /^(.+)_LOD(\d{1,4})$/i;
const COLLISION_PREFIXES = ["UCX_", "UBX_", "USP_", "UCP_"] as const;
const SOCKET_PREFIX = "SOCKET_";

export function partRoleOf(name: string): PartRole {
  if (name.startsWith(SOCKET_PREFIX)) return "socket";
  if (COLLISION_PREFIXES.some((prefix) => name.startsWith(prefix))) return "collision";
  return "model";
}

interface Member {
  level: number;
  mesh: number;
  node: number;
}

interface Draft {
  name: string;
  role: PartRole;
  /** The node the id names, or null for a group found by name, which takes its lowest level's node. */
  node: number | null;
  members: Member[];
}

/**
 * Groups a scene's meshes into parts by the rules game engines use: a "<name>_LOD<n>" suffix, case-insensitive, puts
 * siblings into one LOD group, as do the children of a LOD group node, whose child order gives the level. Name
 * prefixes mark collision helpers and sockets, and win over LOD membership. `lodGroups` holds the indices of the
 * nodes the file marks as LOD groups. Parts come in the order of their first node.
 */
export function describeParts(nodes: readonly PartNode[], lodGroups: ReadonlySet<number> = new Set()): ScenePart[] {
  const childIndex = siblingPositions(nodes);
  const drafts = new Map<string, Draft>();
  const add = (key: string, draft: Omit<Draft, "members">, member: Member | null) => {
    let entry = drafts.get(key);
    if (!entry) {
      entry = { ...draft, members: [] };
      drafts.set(key, entry);
    }
    if (member) entry.members.push(member);
  };

  nodes.forEach((node, index) => {
    const role = partRoleOf(node.name);
    if (role !== "model") {
      const member = node.mesh === null ? null : { level: 0, mesh: node.mesh, node: index };
      if (role === "socket" || member) add(`n${index}`, { name: node.name, role, node: index }, member);
      return;
    }
    if (node.mesh === null) return;
    const group = enclosingLodGroup(nodes, index, lodGroups);
    if (group) {
      const owner = nodes[group.node];
      add(
        `g${group.node}`,
        { name: owner?.name ?? node.name, role, node: group.node },
        { level: childIndex[group.child] ?? 0, mesh: node.mesh, node: index },
      );
      return;
    }
    const suffix = LOD_SUFFIX.exec(node.name);
    if (suffix?.[1] !== undefined && suffix[2] !== undefined) {
      add(
        `s${node.parent}/${suffix[1]}`,
        { name: suffix[1], role, node: null },
        { level: Number(suffix[2]), mesh: node.mesh, node: index },
      );
      return;
    }
    add(`n${index}`, { name: node.name, role, node: index }, { level: 0, mesh: node.mesh, node: index });
  });

  return [...drafts.values()].flatMap((draft) => {
    const members = [...draft.members].sort((a, b) => a.level - b.level || a.node - b.node);
    const node = draft.node ?? members[0]?.node;
    const path = node === undefined ? undefined : nodes[node]?.path;
    if (node === undefined || path === undefined) return [];
    const levels: PartLevel[] = [];
    for (const member of members) {
      const last = levels.at(-1);
      if (last?.level === member.level) last.meshes.push(member.mesh);
      else levels.push({ level: member.level, meshes: [member.mesh] });
    }
    return [{ id: path, name: draft.name, role: draft.role, node, levels }];
  });
}

function siblingPositions(nodes: readonly PartNode[]): number[] {
  const counts = new Map<number, number>();
  return nodes.map((node) => {
    const position = counts.get(node.parent) ?? 0;
    counts.set(node.parent, position + 1);
    return position;
  });
}

/** The nearest LOD group node above a node, and the group's child that leads to it. */
function enclosingLodGroup(
  nodes: readonly PartNode[],
  index: number,
  lodGroups: ReadonlySet<number>,
): { node: number; child: number } | null {
  if (lodGroups.size === 0) return null;
  let child = index;
  let parent = nodes[index]?.parent ?? -1;
  while (parent >= 0) {
    if (lodGroups.has(parent)) return { node: parent, child };
    child = parent;
    parent = nodes[parent]?.parent ?? -1;
  }
  return null;
}

/**
 * Which parts a view shows, as the protocol's view state stores it. `hidden` and `shown` list the parts whose
 * visibility differs from their default, sorted; an isolated part is the only part shown; `lod` picks the level.
 */
export interface PartView {
  hidden: string[];
  shown: string[];
  isolated: string | null;
  lod: number;
}

export function defaultPartView(): PartView {
  return { hidden: [], shown: [], isolated: null, lod: 0 };
}

export function isDefaultPartView(view: PartView): boolean {
  return view.hidden.length === 0 && view.shown.length === 0 && view.isolated === null && view.lod === 0;
}

/** Models show by default unless a composition hides them; collision helpers are hidden, and sockets draw no mesh. */
export function shownByDefault(part: ScenePart): boolean {
  return part.role === "model" && part.hiddenByDefault !== true;
}

/** The level a part shows for a LOD: the highest level not above it, or the part's lowest level. */
export function levelFor(part: ScenePart, lod: number): PartLevel | null {
  let chosen = part.levels[0] ?? null;
  for (const level of part.levels) if (level.level <= lod) chosen = level;
  return chosen;
}

/** Whether a view shows a part. An isolated part that the scene does not have isolates nothing. */
export function partShown(parts: readonly ScenePart[], view: PartView, part: ScenePart): boolean {
  const isolated = view.isolated !== null && parts.some((candidate) => candidate.id === view.isolated);
  if (isolated) return part.id === view.isolated;
  return shownByDefault(part) ? !view.hidden.includes(part.id) : view.shown.includes(part.id);
}

/** The meshes a view draws. Socket meshes are never drawn. */
export function visibleMeshes(parts: readonly ScenePart[], view: PartView = defaultPartView()): Set<number> {
  const meshes = new Set<number>();
  for (const part of parts) {
    if (part.role === "socket" || !partShown(parts, view, part)) continue;
    for (const mesh of levelFor(part, view.lod)?.meshes ?? []) meshes.add(mesh);
  }
  return meshes;
}

/** The view with a part shown or hidden, recording it only when that differs from the part's default. */
export function withPartVisible(view: PartView, part: ScenePart, visible: boolean): PartView {
  const hidden = view.hidden.filter((id) => id !== part.id);
  const shown = view.shown.filter((id) => id !== part.id);
  if (visible !== shownByDefault(part)) (visible ? shown : hidden).push(part.id);
  return { ...view, hidden: hidden.sort(), shown: shown.sort() };
}

/**
 * The view without isolation that draws what the isolated view draws: the isolated part shown and every other part
 * hidden, so showing or hiding one more part keeps the rest of what is on screen.
 */
export function isolationAsVisibility(parts: readonly ScenePart[], view: PartView): PartView {
  if (view.isolated === null) return view;
  if (!parts.some((part) => part.id === view.isolated)) return { ...view, isolated: null };
  let next: PartView = { ...view, hidden: [], shown: [], isolated: null };
  for (const part of parts) next = withPartVisible(next, part, part.id === view.isolated);
  return next;
}

/** Every LOD level some part has, ascending. */
export function lodLevels(parts: readonly ScenePart[]): number[] {
  const levels = new Set<number>();
  for (const part of parts) for (const level of part.levels) levels.add(level.level);
  return [...levels].sort((a, b) => a - b);
}

/**
 * The view with only the parts the scene has: unknown hidden and shown ids dropped, the rest sorted once each, an
 * unknown isolated part cleared, and the LOD no higher than the scene's highest level.
 */
export function knownPartView(parts: readonly ScenePart[], view: PartView): PartView {
  const ids = new Set(parts.map((part) => part.id));
  const known = (list: readonly string[]) => [...new Set(list.filter((id) => ids.has(id)))].sort();
  return {
    hidden: known(view.hidden),
    shown: known(view.shown),
    isolated: view.isolated !== null && ids.has(view.isolated) ? view.isolated : null,
    lod: Math.min(view.lod, lodLevels(parts).at(-1) ?? 0),
  };
}

/** Rest-pose bounds of the meshes a view draws, or null when it draws none. */
export function viewBounds(
  meshes: readonly Pick<Mesh, "restPositions">[],
  parts: readonly ScenePart[],
  view: PartView,
): Bounds | null {
  const visible = visibleMeshes(parts, view);
  const shown = meshes.filter((_, index) => visible.has(index));
  return shown.length > 0 ? boundsOfPoints(shown.map((mesh) => mesh.restPositions)) : null;
}

/** Rest-pose bounds of the meshes a default view draws, or of every mesh when it draws none. */
export function defaultViewBounds(meshes: readonly Pick<Mesh, "restPositions">[], parts: readonly ScenePart[]): Bounds {
  return viewBounds(meshes, parts, defaultPartView()) ?? boundsOfPoints(meshes.map((mesh) => mesh.restPositions));
}
