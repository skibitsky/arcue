import type { CompositionAttach, CompositionFile, ErrorCode, MaterialTextures, TextureSlotName } from "@arcue/protocol";
import {
  ArcueError,
  COMPOSITION_VERSION,
  compositionFileSchema,
  joinsByName,
  MODEL_FILE_EXTENSIONS,
} from "@arcue/protocol";
import { TEXTURE_SLOTS } from "@arcue/scene";
import { basename } from "./paths";
import type { Platform } from "./platform";

/** Extensions of the model files a composition may load. */
export const MODEL_EXTENSIONS: readonly string[] = [...MODEL_FILE_EXTENSIONS, ".glb", ".gltf"];

export function hasExtension(path: string, extensions: readonly string[]): boolean {
  const lower = path.toLowerCase();
  return extensions.some((extension) => lower.endsWith(extension));
}

/** Files named "<model stem>@<anything>.fbx" join the model as animation files, as in Unity. */
export function isConventionAnimation(modelPath: string, name: string): boolean {
  return joinsByName(basename(modelPath), name);
}

/** Parses a composition file. Broken JSON, a newer version and content that breaks the schema reject with `code`. */
export function parseComposition(text: string, path: string, code: ErrorCode): CompositionFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    throw new ArcueError(code, `${path} is not valid JSON.`, { cause: error });
  }
  const version = typeof raw === "object" && raw !== null && "version" in raw ? raw.version : undefined;
  if (typeof version === "number" && version > COMPOSITION_VERSION) {
    throw new ArcueError(code, `${path} has version ${version}, made by a newer Arcue.`);
  }
  const parsed = compositionFileSchema.safeParse(raw);
  if (!parsed.success) {
    const summary = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "file"}: ${issue.message}`)
      .join("; ");
    throw new ArcueError(code, `${path} is not a valid composition. ${summary}`);
  }
  return parsed.data;
}

/** The file's text, without empty lists, after checking it against the schema. */
export function serializeComposition(composition: CompositionFile): string {
  const tidy: CompositionFile = { version: composition.version };
  if (composition.animations?.length) tidy.animations = composition.animations;
  if (composition.attach?.length) tidy.attach = composition.attach;
  if (composition.materials && Object.keys(composition.materials).length > 0) tidy.materials = composition.materials;
  if (composition.hidden?.length) tidy.hidden = composition.hidden;
  const checked = compositionFileSchema.safeParse(tidy);
  if (!checked.success) {
    const summary = checked.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    throw new ArcueError("internal", `The change would break the composition file. ${summary}`);
  }
  return `${JSON.stringify(tidy, null, 2)}\n`;
}

/**
 * The composition file's text and content, or null when there is none. A link or a folder at the path, and a file
 * that cannot be parsed, reject with `code` and a message that names the file by its path.
 */
export async function readComposition(
  platform: Platform,
  path: string,
  code: ErrorCode,
): Promise<{ text: string; composition: CompositionFile } | null> {
  const stat = await platform.stat(path);
  if (stat === null) return null;
  if (stat.kind !== "file") throw new ArcueError(code, `${path} is not a plain file.`);
  const text = await platform.readText(path);
  return { text, composition: parseComposition(text, path, code) };
}

export type MemberRole = "animation" | "attach" | "set";

export interface MemberEntry {
  /** Relative to the model's folder. */
  file: string;
  role: MemberRole;
  node?: string | undefined;
  bone?: string | undefined;
}

/** Tells whether a path as the composition file writes it names the file in question, however it is spelled. */
export type SameFile = (written: string) => boolean;

/** The composition with a file added, or its entry with the same file and node replaced. */
export function withMember(composition: CompositionFile, entry: MemberEntry, same: SameFile): CompositionFile {
  if (entry.role === "animation") {
    const animations = composition.animations ?? [];
    return animations.some(same) ? composition : { ...composition, animations: [...animations, entry.file] };
  }
  const attach: CompositionAttach = { file: entry.file };
  if (entry.node !== undefined) attach.node = entry.node;
  if (entry.role === "attach" && entry.bone !== undefined) attach.bone = entry.bone;
  const list = composition.attach ?? [];
  const at = list.findIndex((existing) => same(existing.file) && existing.node === entry.node);
  const next = at === -1 ? [...list, attach] : list.map((existing, index) => (index === at ? attach : existing));
  return { ...composition, attach: next };
}

/**
 * The composition with the bone of a file's attached entries changed, or removed for undefined, which leaves them in
 * place as set pieces. `node` picks the entries by their node; null when no entry of the file matches.
 */
export function withAttachBone(
  composition: CompositionFile,
  same: SameFile,
  node: (written: string | undefined) => boolean,
  bone: string | undefined,
): CompositionFile | null {
  let matched = false;
  const attach = (composition.attach ?? []).map((entry) => {
    if (!same(entry.file) || !node(entry.node)) return entry;
    matched = true;
    const moved: CompositionAttach = { file: entry.file };
    if (entry.node !== undefined) moved.node = entry.node;
    if (bone !== undefined) moved.bone = bone;
    return moved;
  });
  return matched ? { ...composition, attach } : null;
}

/** The composition without a file, and without the hidden parts that came from it. */
export function withoutMember(
  composition: CompositionFile,
  same: SameFile,
  hiddenFromFile: (id: string) => boolean,
): CompositionFile {
  return {
    ...composition,
    animations: (composition.animations ?? []).filter((entry) => !same(entry)),
    attach: (composition.attach ?? []).filter((entry) => !same(entry.file)),
    hidden: (composition.hidden ?? []).filter((id) => !hiddenFromFile(id)),
  };
}

export function listsMember(composition: CompositionFile, same: SameFile): boolean {
  return (composition.animations ?? []).some(same) || (composition.attach ?? []).some((entry) => same(entry.file));
}

/** The composition with a material slot's texture set, or removed for null. */
export function withTexture(
  composition: CompositionFile,
  material: string,
  slot: TextureSlotName,
  file: string | null,
): CompositionFile {
  const materials = new Map(Object.entries(composition.materials ?? {}));
  const slots = { ...materials.get(material) };
  if (file === null) delete slots[slot];
  else slots[slot] = file;
  if (Object.keys(slots).length > 0) materials.set(material, slots);
  else materials.delete(material);
  return { ...composition, materials: Object.fromEntries(materials) };
}

/** Every file path a composition writes: animation files, attached files and textures, as written. */
export function writtenPaths(composition: CompositionFile): string[] {
  const textures = Object.values(composition.materials ?? {}).flatMap((slots) =>
    TEXTURE_SLOTS.flatMap((slot) => slots[slot] ?? []),
  );
  return [...(composition.animations ?? []), ...(composition.attach ?? []).map((entry) => entry.file), ...textures];
}

/** The composition with each written file path replaced by `rewrite(path)`, and each hidden part id by `relabel(id)`. */
export function withRewrittenPaths(
  composition: CompositionFile,
  rewrite: (written: string) => string,
  relabel: (id: string) => string,
): CompositionFile {
  const next: CompositionFile = { ...composition };
  if (composition.animations) next.animations = composition.animations.map(rewrite);
  if (composition.attach) next.attach = composition.attach.map((entry) => ({ ...entry, file: rewrite(entry.file) }));
  if (composition.materials) {
    const materials: Record<string, MaterialTextures> = {};
    for (const [material, slots] of Object.entries(composition.materials)) {
      const rewritten: MaterialTextures = {};
      for (const slot of TEXTURE_SLOTS) {
        const written = slots[slot];
        if (written !== undefined) rewritten[slot] = rewrite(written);
      }
      materials[material] = rewritten;
    }
    next.materials = materials;
  }
  if (composition.hidden) next.hidden = composition.hidden.map(relabel);
  return next;
}
