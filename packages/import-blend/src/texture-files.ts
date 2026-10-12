import { warningId } from "@arcue/protocol";
import type { ImportWarning, Material, Texture, TextureRef } from "@arcue/scene";
import { TEXTURE_REF_KEYS } from "@arcue/scene";

/** A stored path with "/" separators and its "." and ".." segments resolved, so that spellings of one path match. */
export function normalizedPath(path: string): string {
  const segments: string[] = [];
  for (const segment of path.replaceAll("\\", "/").split("/")) {
    if (segment === "." || (segment === "" && segments.length > 0)) continue;
    const last = segments.at(-1);
    if (segment === ".." && last !== undefined && last !== "" && last !== "..") segments.pop();
    else segments.push(segment);
  }
  return segments.join("/");
}

/**
 * Keeps one texture for each image file found, however many stored paths lead to it, as a relative and an absolute
 * path to one file do, and points the materials at the textures kept.
 */
export function shareFoundTextures(
  textures: readonly Texture[],
  materials: readonly Material[],
): { textures: Texture[]; materials: Material[] } {
  const kept: Texture[] = [];
  const byFoundPath = new Map<string, number>();
  const moved = textures.map((texture) => {
    const known = texture.foundPath === null ? undefined : byFoundPath.get(texture.foundPath);
    if (known !== undefined) return known;
    kept.push(texture);
    if (texture.foundPath !== null) byFoundPath.set(texture.foundPath, kept.length - 1);
    return kept.length - 1;
  });
  if (kept.length === textures.length) return { textures: kept, materials: [...materials] };
  const remap = (ref: TextureRef | null): TextureRef | null =>
    ref && { ...ref, texture: moved[ref.texture] ?? ref.texture };
  return {
    textures: kept,
    materials: materials.map((material) => {
      const shared = { ...material };
      for (const key of TEXTURE_REF_KEYS) shared[key] = remap(material[key]);
      return shared;
    }),
  };
}

function joinWarning(first: ImportWarning, next: ImportWarning): ImportWarning {
  const joined = { ...first };
  const details = [...new Set([first.detail, next.detail].flatMap((detail) => (detail === undefined ? [] : [detail])))];
  if (details.length > 0) joined.detail = details.join("; ");
  const materials = [...new Set([...(first.materials ?? []), ...(next.materials ?? [])])];
  if (materials.length > 0) joined.materials = materials;
  const uses = [...(first.uses ?? [])];
  for (const use of next.uses ?? []) {
    if (!uses.some((known) => known.material === use.material && known.slot === use.slot)) uses.push(use);
  }
  if (uses.length > 0) joined.uses = uses;
  return joined;
}

/**
 * One warning for each id, since a review keeps only the first warning with an id: the texture warnings for files of
 * one name in different folders, which share an id, join their details, materials and uses.
 */
export function joinWarningsById(warnings: readonly ImportWarning[]): ImportWarning[] {
  const joined = new Map<string, ImportWarning>();
  for (const warning of warnings) {
    const id = warningId(warning);
    const first = joined.get(id);
    joined.set(id, first ? joinWarning(first, warning) : warning);
  }
  return [...joined.values()];
}
