import type { Clip, Track } from "./clip";
import type { Material, Texture, TextureRef, TextureSlot } from "./material";
import { TEXTURE_SLOTS } from "./material";
import type { Mesh } from "./mesh";
import type { SceneNode } from "./node";
import type { ScenePart } from "./parts";
import { defaultViewBounds } from "./parts";
import type { SceneDescription } from "./scene";
import type { Skeleton } from "./skeleton";
import type { ImportWarning } from "./source";
import { importWarning } from "./source";
import type { Matrix4 } from "./transform";
import { decomposeMatrix, invertAffine, multiplyMatrices, restWorldMatrices } from "./transform";

/**
 * Separates a composition's file from a node path in that file, as in "BoulderBugShells.fbx//Shells/Boulder1".
 * It never occurs in a node path: every segment has a name ("(unnamed)" when the file has none) and "/" inside a name
 * is escaped as "\/", so two unescaped slashes in a row cannot appear. Normalized relative file paths have no "//"
 * either, so the first unescaped "//" always ends the file.
 */
export const MEMBER_SEPARATOR = "//";

/** The node path or part id of something from another file of a composition. */
export function memberPath(file: string, path: string): string {
  return `${file}${MEMBER_SEPARATOR}${path}`;
}

/** The file a node path or part id comes from, null for the model's own, and the path inside that file. */
export function splitMemberPath(path: string): { file: string | null; path: string } {
  for (let index = 0; index < path.length; index++) {
    const char = path[index];
    if (char === "\\") index++;
    else if (char === "/" && path[index + 1] === "/")
      return { file: path.slice(0, index), path: path.slice(index + 2) };
  }
  return { file: null, path };
}

/** Another file of a composition, imported on its own. */
export interface CompositionMember {
  /** The file's path relative to the model's folder, with "/" separators. It prefixes the file's node paths. */
  file: string;
  scene: SceneDescription;
}

export interface CompositionAttachment {
  member: CompositionMember;
  /** A node's path or name in the member file, which brings its children along; null takes every root node. */
  node: string | null;
  /** A node's name or path in the model, usually a bone, that the nodes follow; null leaves them in place. */
  bone: string | null;
}

/** A composition's texture for a material slot: the path it writes, and the image, or null when none was found. */
export interface CompositionTexture {
  path: string;
  texture: Texture | null;
}

/** What to load into one view with a model, after the files were read. */
export interface Composition {
  /** Files whose clips bind to the model's nodes by name. */
  animations: readonly CompositionMember[];
  attach: readonly CompositionAttachment[];
  /** Textures that replace the files' own, by material name and slot. */
  materials: Readonly<Record<string, Partial<Record<TextureSlot, CompositionTexture>>>>;
  /** Part ids hidden until someone shows them. */
  hidden: readonly string[];
  /** Problems found while reading the files, such as a missing member, added to the scene's warnings. */
  warnings?: readonly ImportWarning[];
}

const LISTED_NAMES = 5;

/**
 * One scene from a model and the other files of its composition. The model's nodes, meshes and clips keep their
 * indices and paths. Clips from animation files bind to the model's nodes by name, preferring bones, and bones a
 * clip lacks keep the rest pose. Attached nodes keep their rest placement in scene space, as both files were exported
 * in the same rest frame: under a bone they follow it, otherwise they stay in place. A bone in an attached file that
 * matches a model bone by name is that model bone, so skinned meshes and children of those bones follow the model's
 * skeleton, as Unreal's leader pose does. Nodes and clips from other files take the file as a prefix on their paths
 * and names. The inputs are not changed; typed arrays are shared with them.
 */
export function composeScene(model: SceneDescription, composition: Composition): SceneDescription {
  const builder = new SceneBuilder(model, composition.warnings ?? []);
  for (const attachment of attachOrder(composition.attach)) builder.attach(attachment);
  builder.addMemberMeshes();
  builder.addMemberParts();
  builder.addClips(composition.animations);
  builder.hide(composition.hidden);
  builder.overrideTextures(composition.materials);
  return builder.build();
}

interface NodeLookup {
  /** A node by its path, or else by its name, preferring bones or other nodes as asked. */
  find(nameOrPath: string, preferBone: boolean): number | null;
  byName(name: string, preferBone: boolean): number | null;
  bone(name: string): number | null;
}

function nodeLookup(nodes: readonly SceneNode[]): NodeLookup {
  const byPath = new Map<string, number>();
  const bones = new Map<string, number>();
  const others = new Map<string, number>();
  nodes.forEach((node, index) => {
    byPath.set(node.path, index);
    const named = node.kind === "bone" ? bones : others;
    if (!named.has(node.name)) named.set(node.name, index);
  });
  const byName = (name: string, preferBone: boolean) =>
    (preferBone ? (bones.get(name) ?? others.get(name)) : (others.get(name) ?? bones.get(name))) ?? null;
  return {
    find: (nameOrPath, preferBone) => byPath.get(nameOrPath) ?? byName(nameOrPath, preferBone),
    byName,
    bone: (name) => bones.get(name) ?? null,
  };
}

/**
 * A node's index by its path, or else by its name, preferring a bone or another node as asked, as a composition
 * names nodes and bones. Null when nothing matches.
 */
export function findNode(nodes: readonly SceneNode[], nameOrPath: string, preferBone: boolean): number | null {
  return nodeLookup(nodes).find(nameOrPath, preferBone);
}

/** What one member file contributed so far. */
interface MemberState {
  member: CompositionMember;
  worlds: Matrix4[];
  /** Member node index to its node in the composed scene: a new node, or the model bone it merged into. */
  nodes: Map<number, number>;
  merged: Set<number>;
  /** Member mesh index to composed mesh index. */
  meshes: Map<number, number>;
  skeletons: Map<number, number>;
  materialOffset: number | null;
}

class SceneBuilder {
  readonly #model: SceneDescription;
  readonly #lookup: NodeLookup;
  readonly #nodes: SceneNode[];
  readonly #meshes: Mesh[];
  readonly #skeletons: Skeleton[];
  readonly #materials: Material[];
  readonly #textures: Texture[];
  readonly #parts: ScenePart[];
  readonly #clips: Clip[];
  readonly #warnings: ImportWarning[];
  readonly #members = new Map<string, MemberState>();
  #modelWorlds: Matrix4[] | null = null;

  constructor(model: SceneDescription, warnings: readonly ImportWarning[]) {
    this.#model = model;
    this.#lookup = nodeLookup(model.nodes);
    this.#nodes = [...model.nodes];
    this.#meshes = [...model.meshes];
    this.#skeletons = [...model.skeletons];
    this.#materials = [...model.materials];
    this.#textures = [...model.textures];
    this.#parts = [...model.parts];
    this.#clips = [...model.clips];
    this.#warnings = [...model.source.warnings, ...warnings];
  }

  #modelWorld(node: number): Matrix4 | undefined {
    this.#modelWorlds ??= restWorldMatrices(this.#model.nodes);
    return this.#modelWorlds[node];
  }

  #state(member: CompositionMember): MemberState {
    let state = this.#members.get(member.file);
    if (!state) {
      state = {
        member,
        worlds: restWorldMatrices(member.scene.nodes),
        nodes: new Map(),
        merged: new Set(),
        meshes: new Map(),
        skeletons: new Map(),
        materialOffset: null,
      };
      this.#members.set(member.file, state);
    }
    return state;
  }

  #warn(warning: ImportWarning): void {
    this.#warnings.push(warning);
  }

  attach({ member, node, bone }: CompositionAttachment): void {
    const state = this.#state(member);
    const source = member.scene.nodes;
    let roots: number[];
    if (node === null) {
      roots = source.flatMap((entry, index) => (entry.parent === -1 ? [index] : []));
    } else {
      const found = nodeLookup(source).find(node, false);
      if (found === null) {
        this.#warn(
          importWarning("node-not-found", { kind: "node", name: node }, `Node not found: ${node}`, member.file),
        );
        return;
      }
      roots = [found];
    }
    let parent = -1;
    if (bone !== null) {
      const found = this.#lookup.find(bone, true);
      if (found === null) {
        this.#warn(
          importWarning("node-not-found", { kind: "node", name: bone }, `Model bone not found: ${bone}`, member.file),
        );
      } else {
        parent = found;
      }
    }
    const included = subtree(source, roots);
    source.forEach((entry, index) => {
      if (!included[index] || state.nodes.has(index)) return;
      if (entry.kind === "bone") {
        const match = this.#lookup.bone(entry.name);
        if (match !== null) {
          state.nodes.set(index, match);
          state.merged.add(index);
          return;
        }
      }
      const memberParent = state.nodes.get(entry.parent);
      const placed =
        entry.parent >= 0 && included[entry.parent] && memberParent !== undefined
          ? { parent: memberParent, transform: entry }
          : { parent, transform: this.#placeUnder(parent, state.worlds[index]) };
      state.nodes.set(index, this.#addNode(member.file, entry, placed.parent, placed.transform));
    });
  }

  addMemberMeshes(): void {
    for (const state of this.#members.values()) {
      for (const [index, composed] of [...state.nodes]) {
        const mesh = state.member.scene.nodes[index]?.mesh ?? null;
        if (mesh === null || state.merged.has(index)) continue;
        const meshIndex = this.#addMesh(state, mesh);
        const target = this.#nodes[composed];
        if (meshIndex !== null && target) this.#nodes[composed] = { ...target, mesh: meshIndex };
      }
    }
  }

  /** A transform that keeps a node at its rest placement in scene space once it hangs under `parent`. */
  #placeUnder(parent: number, world: Matrix4 | undefined): Pick<SceneNode, "translation" | "rotation" | "scale"> {
    if (!world) return { translation: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] };
    const parentWorld = parent >= 0 ? this.#modelWorld(parent) : undefined;
    return decomposeMatrix(parentWorld ? multiplyMatrices(invertAffine(parentWorld), world) : world);
  }

  #addNode(
    file: string,
    node: SceneNode,
    parent: number,
    transform: Pick<SceneNode, "translation" | "rotation" | "scale">,
  ): number {
    this.#nodes.push({
      ...node,
      path: memberPath(file, node.path),
      parent,
      translation: transform.translation,
      rotation: transform.rotation,
      scale: transform.scale,
      mesh: null,
    });
    return this.#nodes.length - 1;
  }

  #addMesh(state: MemberState, index: number): number | null {
    const mesh = state.member.scene.meshes[index];
    if (!mesh) return null;
    const existing = state.meshes.get(index);
    if (existing !== undefined) return existing;
    const materialOffset = this.#addMaterials(state);
    this.#meshes.push({
      ...mesh,
      skeleton: mesh.skeleton === null ? null : this.#addSkeleton(state, mesh.skeleton),
      groups: mesh.groups.map((group) => ({ ...group, material: group.material + materialOffset })),
    });
    state.meshes.set(index, this.#meshes.length - 1);
    return this.#meshes.length - 1;
  }

  #addMaterials(state: MemberState): number {
    if (state.materialOffset !== null) return state.materialOffset;
    const { materials, textures } = state.member.scene;
    const textureOffset = this.#textures.length;
    this.#textures.push(...textures);
    const moved = (ref: TextureRef | null) => (ref ? { ...ref, texture: ref.texture + textureOffset } : null);
    state.materialOffset = this.#materials.length;
    for (const material of materials) {
      this.#materials.push({
        ...material,
        baseColorTexture: moved(material.baseColorTexture),
        metallicRoughnessTexture: moved(material.metallicRoughnessTexture),
        roughnessTexture: moved(material.roughnessTexture),
        metalnessTexture: moved(material.metalnessTexture),
        normalTexture: moved(material.normalTexture),
        occlusionTexture: moved(material.occlusionTexture),
        emissiveTexture: moved(material.emissiveTexture),
      });
    }
    return state.materialOffset;
  }

  /**
   * The member's skeleton on composed nodes. A joint is the node it became, the model bone of the same name, or else a
   * new node held at the joint's rest placement.
   */
  #addSkeleton(state: MemberState, index: number): number | null {
    const skeleton = state.member.scene.skeletons[index];
    if (!skeleton) return null;
    const existing = state.skeletons.get(index);
    if (existing !== undefined) return existing;
    const joints = skeleton.joints.map((joint) => {
      const known = state.nodes.get(joint);
      if (known !== undefined) return known;
      const node = state.member.scene.nodes[joint];
      if (!node) return 0;
      const match = this.#lookup.bone(node.name);
      const composed = match ?? this.#addNode(state.member.file, node, -1, this.#placeUnder(-1, state.worlds[joint]));
      state.nodes.set(joint, composed);
      if (match !== null) state.merged.add(joint);
      return composed;
    });
    this.#skeletons.push({ joints, inverseBindMatrices: skeleton.inverseBindMatrices });
    state.skeletons.set(index, this.#skeletons.length - 1);
    return this.#skeletons.length - 1;
  }

  /** Each attached file's parts, for the meshes that came along, with the file as a prefix on their ids. */
  addMemberParts(): void {
    for (const state of this.#members.values()) {
      const meshNode = new Map<number, number>();
      for (const [memberNode, composed] of state.nodes) {
        const mesh = state.member.scene.nodes[memberNode]?.mesh;
        if (mesh !== null && mesh !== undefined && !state.merged.has(memberNode)) meshNode.set(mesh, composed);
      }
      for (const part of state.member.scene.parts) {
        const levels = part.levels
          .map(({ level, meshes }) => ({ level, meshes: meshes.flatMap((mesh) => state.meshes.get(mesh) ?? []) }))
          .filter((level) => level.meshes.length > 0);
        const own = state.merged.has(part.node) ? undefined : state.nodes.get(part.node);
        const firstMesh = part.levels.flatMap((level) => level.meshes).find((mesh) => meshNode.has(mesh));
        const node = own ?? (firstMesh === undefined ? undefined : meshNode.get(firstMesh));
        if (node === undefined || (levels.length === 0 && part.role !== "socket")) continue;
        this.#parts.push({ ...part, id: memberPath(state.member.file, part.id), node, levels });
      }
    }
  }

  /**
   * Binds each animation file's clips to the model. A clip's name is its name in its file with the file as a prefix,
   * so adding or removing other files never renames it. Its display name stays its own unless another clip shows
   * the same, which adds " (2)", " (3)" and so on.
   */
  addClips(animations: readonly CompositionMember[]): void {
    const shown = new Set(this.#clips.map((clip) => clip.displayName));
    for (const member of animations) {
      for (const clip of member.scene.clips) {
        const missing = new Set<string>();
        const unmatchedMorphs = new Set<string>();
        const tracks: Track[] = [];
        for (const track of clip.tracks) {
          const node = member.scene.nodes[track.node];
          if (!node) continue;
          const target = this.#lookup.byName(node.name, node.kind === "bone");
          if (target !== null) {
            tracks.push(
              track.property === "weights"
                ? this.#morphTrack(member.scene, track, target, unmatchedMorphs)
                : { ...track, node: target },
            );
          } else if (node.kind === "bone") missing.add(node.name);
        }
        let displayName = clip.displayName;
        for (let suffix = 2; shown.has(displayName); suffix++) displayName = `${clip.displayName} (${suffix})`;
        shown.add(displayName);
        this.#clips.push({ ...clip, name: memberPath(member.file, clip.name), displayName, tracks, file: member.file });
        if (missing.size > 0) this.#warnMissingBones(member.file, clip.name, displayName, [...missing]);
        if (unmatchedMorphs.size > 0) {
          this.#warn(
            importWarning(
              "invalid-data",
              { kind: "clip", name: clip.name },
              `Morph targets not matched: ${displayName}`,
              member.file,
              {
                detail: `Missing or ambiguous morph targets: ${[...unmatchedMorphs].join(", ")}`,
              },
            ),
          );
        }
      }
    }
  }

  #morphTrack(source: SceneDescription, track: Track, node: number, unmatched: Set<string>): Track {
    const sourceMesh = source.meshes[source.nodes[track.node]?.mesh ?? -1];
    const targetMesh = this.#model.meshes[this.#model.nodes[node]?.mesh ?? -1];
    const sourceTargets = sourceMesh?.morphTargets ?? [];
    const targetTargets = targetMesh?.morphTargets ?? [];
    const sourceNames = uniqueNames(sourceTargets);
    const targetNames = uniqueNames(targetTargets);
    for (const target of sourceTargets) {
      if ((sourceNames.get(target.name) ?? -1) < 0 || (targetNames.get(target.name) ?? -1) < 0) {
        unmatched.add(`${source.nodes[track.node]?.name ?? "(unnamed)"}/${target.name || "(unnamed)"}`);
      }
    }
    const indices = targetTargets.map((target) =>
      (targetNames.get(target.name) ?? -1) < 0 ? -1 : (sourceNames.get(target.name) ?? -1),
    );
    const values = new Float32Array(track.times.length * targetTargets.length);
    for (let key = 0; key < track.times.length; key++) {
      targetTargets.forEach((target, index) => {
        const sourceIndex = indices[index] ?? -1;
        values[key * targetTargets.length + index] =
          sourceIndex < 0
            ? target.defaultWeight
            : (track.values[key * sourceTargets.length + sourceIndex] ?? target.defaultWeight);
      });
    }
    return { ...track, node, values };
  }

  #warnMissingBones(file: string, clip: string, displayName: string, bones: readonly string[]): void {
    const listed = bones.slice(0, LISTED_NAMES).join(", ");
    const more = bones.length > LISTED_NAMES ? ` and ${bones.length - LISTED_NAMES} more` : "";
    this.#warn(
      importWarning("animation-bones-missing", { kind: "clip", name: clip }, `Missing bones: ${displayName}`, file, {
        detail: `Bones the model lacks: ${listed}${more}`,
      }),
    );
  }

  hide(ids: readonly string[]): void {
    for (const id of ids) {
      const index = this.#parts.findIndex((part) => part.id === id);
      const part = this.#parts[index];
      if (part) {
        this.#parts[index] = { ...part, hiddenByDefault: true };
        continue;
      }
      const { file } = splitMemberPath(id);
      this.#warn(
        importWarning("node-not-found", { kind: "node", name: id }, `Part not found: ${id}`, file ?? undefined),
      );
    }
  }

  /** Puts each slot's texture on the materials of its name. A texture several slots share is added once. */
  overrideTextures(materials: Composition["materials"]): void {
    const added = new Map<Texture, number>();
    const indexOf = (texture: Texture): number => {
      let index = added.get(texture);
      if (index === undefined) {
        index = this.#textures.push(texture) - 1;
        added.set(texture, index);
      }
      return index;
    };
    for (const [name, slots] of Object.entries(materials)) {
      const targets = this.#materials.flatMap((material, index) => (material.name === name ? [index] : []));
      if (targets.length === 0) {
        this.#warn(
          importWarning("material-not-found", { kind: "material", name }, `Material not used by any mesh: ${name}`),
        );
        continue;
      }
      for (const slot of TEXTURE_SLOTS) {
        const entry = slots[slot];
        if (!entry) continue;
        const ref: TextureRef | null = entry.texture
          ? { texture: indexOf(entry.texture), uvSet: 0, wrapU: "repeat", wrapV: "repeat", transform: null }
          : null;
        for (const target of targets) {
          const material = this.#materials[target];
          if (!material) continue;
          const overrides = { ...material.textureOverrides, [slot]: { path: entry.path, found: ref !== null } };
          this.#materials[target] = {
            ...(ref ? withTexture(material, slot, ref) : material),
            textureOverrides: overrides,
          };
        }
      }
    }
  }

  build(): SceneDescription {
    return {
      ...this.#model,
      source: { ...this.#model.source, warnings: this.#warnings },
      nodes: this.#nodes,
      meshes: this.#meshes,
      skeletons: this.#skeletons,
      materials: this.#materials,
      textures: this.#textures,
      clips: this.#clips,
      parts: this.#parts,
      bounds: defaultViewBounds(this.#meshes, this.#parts),
    };
  }
}

function uniqueNames(items: readonly { name: string }[]): Map<string, number> {
  const names = new Map<string, number>();
  items.forEach(({ name }, index) => {
    names.set(name, name === "" || names.has(name) ? -1 : index);
  });
  return names;
}

/**
 * The attachments with each file's node entries before its whole-file entries, files in the order they first appear.
 * A whole-file entry takes every node its file has not placed yet, so an entry for one of its nodes must come first.
 */
function attachOrder(attach: readonly CompositionAttachment[]): CompositionAttachment[] {
  const byFile = new Map<string, CompositionAttachment[]>();
  for (const attachment of attach) {
    const entries = byFile.get(attachment.member.file) ?? [];
    entries.push(attachment);
    byFile.set(attachment.member.file, entries);
  }
  return [...byFile.values()].flatMap((entries) => [
    ...entries.filter((entry) => entry.node !== null),
    ...entries.filter((entry) => entry.node === null),
  ]);
}

/** Marks the roots and everything below them. Parents come before their children. */
function subtree(nodes: readonly SceneNode[], roots: readonly number[]): boolean[] {
  const included = nodes.map(() => false);
  for (const root of roots) included[root] = true;
  nodes.forEach((node, index) => {
    if (node.parent >= 0 && included[node.parent]) included[index] = true;
  });
  return included;
}

/** The material with a texture in a slot. Its color factor turns white, so the texture shows as it is. */
function withTexture(material: Material, slot: TextureSlot, ref: TextureRef): Material {
  switch (slot) {
    case "baseColor":
      return { ...material, baseColorTexture: ref, baseColor: [1, 1, 1, material.baseColor[3]] };
    case "normal":
      return { ...material, normalTexture: ref };
    case "roughness":
      return { ...material, roughnessTexture: ref };
    case "metalness":
      return { ...material, metalnessTexture: ref };
    case "emissive":
      return {
        ...material,
        emissiveTexture: ref,
        emissive: material.emissive.every((value) => value === 0) ? [1, 1, 1] : material.emissive,
      };
  }
}
