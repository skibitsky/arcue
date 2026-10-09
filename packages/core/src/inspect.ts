import type { AssetInspection, InspectedMaterial, InspectedMember, InspectedTexture } from "@arcue/protocol";
import type { Material, SceneDescription, TextureRef } from "@arcue/scene";
import type { AssetFiles } from "./composition-load";
import { round5 } from "./coordinates";
import { basename } from "./paths";
import { meshesOf, partsOf } from "./scene-lookup";

type TextureSlot = { [Key in keyof Material]-?: Material[Key] extends TextureRef | null ? Key : never }[keyof Material];

const TEXTURE_SLOTS: Record<TextureSlot, string> = {
  baseColorTexture: "baseColor",
  metallicRoughnessTexture: "metallicRoughness",
  roughnessTexture: "roughness",
  metalnessTexture: "metalness",
  normalTexture: "normal",
  occlusionTexture: "occlusion",
  emissiveTexture: "emissive",
};

export function exporterName(scene: SceneDescription): string | null {
  const exporter = scene.source.exporter;
  if (!exporter) return null;
  return [exporter.name, exporter.version].filter((part) => part !== null && part !== "").join(" ");
}

export interface InspectedFiles {
  path: string;
  bytes: number;
  /** The composition file applied to the model, or null. */
  composition: string | null;
  members: InspectedMember[];
}

/** A plain JSON summary of an imported file, for `asset.inspect`. */
export function inspectScene(scene: SceneDescription, file: InspectedFiles): AssetInspection {
  const { source } = scene;
  const meshes = meshesOf(scene).map(({ name, path, mesh }) => ({
    name,
    path,
    triangles: mesh.indices.length / 3,
    vertices: mesh.sourceVertexCount,
    skinned: mesh.skeleton !== null,
  }));
  return {
    file: { path: file.path, name: basename(file.path), bytes: file.bytes },
    format: source.format,
    exporter: exporterName(scene),
    fps: source.fps,
    upAxis: source.originalSpace.axes.up,
    unitMeters: source.originalSpace.unitMeters,
    height: round5(scene.bounds.max[1] - scene.bounds.min[1]),
    meshes,
    parts: partsOf(scene),
    triangles: meshes.reduce((sum, mesh) => sum + mesh.triangles, 0),
    bones: scene.nodes.filter((node) => node.kind === "bone").length,
    materials: scene.materials.map((material) => inspectMaterial(scene, material)),
    textures: inspectTextures(scene),
    clips: scene.clips.map((clip) => ({
      name: clip.name,
      displayName: clip.displayName,
      frames: clip.frameCount,
      fps: clip.fps,
      duration: round5(clip.duration),
    })),
    composition: file.composition,
    members: file.members,
    warnings: source.warnings,
  };
}

function inspectMaterial(scene: SceneDescription, material: Material): InspectedMaterial {
  const textures: InspectedMaterial["textures"] = [];
  for (const [key, slot] of Object.entries(TEXTURE_SLOTS) as [TextureSlot, string][]) {
    const ref = material[key];
    const texture = ref ? scene.textures[ref.texture] : undefined;
    if (texture) textures.push({ slot, texture: texture.name });
  }
  return { name: material.name, textures };
}

/** The textures the importer found, then the ones its "texture-not-found" warnings name. */
function inspectTextures(scene: SceneDescription): InspectedTexture[] {
  const found = scene.textures.map((texture) => ({ name: texture.name, found: true, mimeType: texture.mimeType }));
  const missing = new Set<string>();
  for (const warning of scene.source.warnings) {
    if (warning.code === "texture-not-found") missing.add(warning.subject.name);
  }
  return [...found, ...[...missing].map((name) => ({ name, found: false, mimeType: null }))];
}

/** The files besides the model that a version was read from, once per file and role. */
export function inspectMembers(files: AssetFiles): InspectedMember[] {
  const members = new Map<string, InspectedMember>();
  const add = (label: string, role: InspectedMember["role"], found: boolean) => {
    const key = `${role}\n${label}`;
    if (!members.has(key)) members.set(key, { file: label, role, found });
  };
  const member = (path: string) => files.members.get(path);
  for (const path of files.animations) {
    const read = member(path);
    if (read) add(read.label, "animation", read.bytes !== null);
  }
  for (const { path, bone } of files.attach) {
    const read = member(path);
    if (read) add(read.label, bone === null ? "set" : "attach", read.bytes !== null);
  }
  for (const texture of files.textures) add(texture.label, "texture", texture.bytes !== null);
  return [...members.values()];
}
