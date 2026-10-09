import type { Quat, Vec3 } from "./math";

export type NodeKind = "mesh" | "bone" | "empty";

export interface SceneNode {
  name: string;
  /** Stable path built by `buildNodePaths`; anchors name meshes by this path. */
  path: string;
  /** Index of the parent node, or -1 for a root. A parent always comes before its children. */
  parent: number;
  kind: NodeKind;
  /** The rest transform relative to the parent. It is the bind pose, which the "Rest pose" view shows. */
  translation: Vec3;
  rotation: Quat;
  scale: Vec3;
  /** Index into `SceneDescription.meshes` for mesh nodes, otherwise null. */
  mesh: number | null;
}

export interface NamedNode {
  name: string;
  parent: number;
}

const ESCAPED = /[\\/#]/g;

/** The name a node without one gets in its path. */
export const UNNAMED_NODE = "(unnamed)";

function escapeSegment(name: string): string {
  return (name === "" ? UNNAMED_NODE : name).replace(ESCAPED, (char) => `\\${char}`);
}

/**
 * Builds a path for each node from the root names down, joined by "/".
 * A node without a name is called "(unnamed)". "\", "/" and "#" in names are escaped with "\".
 * When siblings share a name, the second and later ones get "#2", "#3" and so on, in file order.
 */
export function buildNodePaths(nodes: readonly NamedNode[]): string[] {
  const paths: string[] = [];
  const seen = new Map<string, number>();
  nodes.forEach((node, index) => {
    if (node.parent >= index || node.parent < -1) {
      throw new RangeError(`Node ${index} ("${node.name}") must come after its parent ${node.parent}.`);
    }
    const parentPath = node.parent === -1 ? null : paths[node.parent];
    const segment = escapeSegment(node.name);
    const key = `${node.parent}/${segment}`;
    const occurrence = (seen.get(key) ?? 0) + 1;
    seen.set(key, occurrence);
    const unique = occurrence === 1 ? segment : `${segment}#${occurrence}`;
    paths.push(parentPath === null ? unique : `${parentPath}/${unique}`);
  });
  return paths;
}
