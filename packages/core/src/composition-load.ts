import type { CompositionFile, VersionFile } from "@arcue/protocol";
import { ArcueError, COMPOSITION_FILE_NAME } from "@arcue/protocol";
import type {
  CompositionMember,
  CompositionTexture,
  ImportWarning,
  ImportWarningCode,
  SceneDescription,
  Texture,
  TextureSlot,
} from "@arcue/scene";
import {
  composeScene,
  describeTextureUses,
  fileNameOf,
  imageMimeType,
  importWarning,
  splitMemberPath,
  TEXTURE_SLOTS,
} from "@arcue/scene";
import { hasExtension, isConventionAnimation, MODEL_EXTENSIONS, readComposition } from "./composition-file";
import { createFileSearch } from "./file-search";
import { versionIdOf } from "./hash";
import { insideWithoutLinks } from "./links";
import { basename, dirname, joinPath, pathInside, relativePath, stemOf } from "./paths";
import type { Platform } from "./platform";
import { Limit } from "./serial";

/** One file read for a version: its path, its name in prefixes, and its bytes and id when it could be read. */
export interface ReadFile {
  path: string;
  /** Relative to the model's folder, as member prefixes and warnings write it; "composition.json" for the composition. */
  label: string;
  bytes: Uint8Array | null;
  id: string | null;
  /** Why the file could not be read, as a warning names the problem, such as "File not found". */
  problem: string | null;
}

export interface TextureRead extends ReadFile {
  material: string;
  slot: TextureSlot;
  /** As the composition file writes it, relative to the model's folder. */
  written: string;
}

/** Everything a version of an asset is built from, read once, so the version id matches what gets parsed. */
export interface AssetFiles {
  model: ReadFile & { bytes: Uint8Array; id: string; modifiedMs: number };
  /** The model's composition file, when there is one. */
  composition: { file: ReadFile & { id: string }; content: CompositionFile } | null;
  /** A composition file that could not be read, which the model loads without, and why. */
  unreadComposition: { label: string; reason: string } | null;
  /** Member files by path, in the order they first appear. */
  members: Map<string, ReadFile>;
  animations: string[];
  attach: { path: string; node: string | null; bone: string | null }[];
  textures: TextureRead[];
  hidden: string[];
  /** The model's id for a plain model, otherwise a hash of every file's id. */
  versionId: string;
  /** Each file with its id, for a composition. */
  versionFiles: VersionFile[] | undefined;
  /** The composition's files to watch, besides the model. */
  watch: string[];
}

export interface ReadAssetOptions {
  /**
   * What a composition file that cannot be read does: "reject" fails the load, so the version on screen stays, and
   * "warn" loads the model without it and says why in a warning.
   */
  brokenComposition: "reject" | "warn";
}

const encoder = new TextEncoder();

/**
 * Reads the model, its composition file and every file the composition names, plus the "<stem>@<clip>.fbx" files
 * beside the model. The composition's paths are relative to the model's folder. Member files must be model files
 * inside `readRoot` reached without symbolic links. Textures are searched for like an importer's stale paths, starting
 * from the path the composition writes, and each image is read once however many slots use it. A missing model
 * rejects; a missing member or texture is recorded with its problem.
 */
export async function readAssetFiles(
  platform: Platform,
  modelPath: string,
  compositionPath: string,
  readRoot: string,
  options: ReadAssetOptions,
): Promise<AssetFiles> {
  const stat = await platform.stat(modelPath);
  if (stat?.kind !== "file") throw new ArcueError("not-found", `${modelPath} does not exist.`);
  const modelBytes = await platform.readFile(modelPath);
  const folder = dirname(modelPath);
  const label = (path: string) => relativePath(folder, path) ?? path;
  const model = {
    path: modelPath,
    label: basename(modelPath),
    bytes: modelBytes,
    id: versionIdOf(modelBytes),
    modifiedMs: stat.modifiedMs,
    problem: null,
  };

  let found: { text: string; composition: CompositionFile } | null = null;
  let unreadComposition: AssetFiles["unreadComposition"] = null;
  try {
    found = await readComposition(platform, compositionPath, "invalid-input");
  } catch (error) {
    const broken = error instanceof ArcueError && error.code === "invalid-input";
    if (!broken || options.brokenComposition === "reject") throw error;
    unreadComposition = { label: COMPOSITION_FILE_NAME, reason: error.message };
  }
  const content = found?.composition ?? null;
  const composition = found
    ? {
        file: {
          path: compositionPath,
          label: COMPOSITION_FILE_NAME,
          bytes: null,
          id: versionIdOf(encoder.encode(found.text)),
          problem: null,
        },
        content: found.composition,
      }
    : null;

  const fromModel = (file: string) => joinPath(folder, file);
  const animations = (content?.animations ?? []).map(fromModel);
  for (const entry of await platform.list(folder)) {
    const path = joinPath(folder, entry.name);
    if (entry.kind === "file" && isConventionAnimation(modelPath, entry.name) && !animations.includes(path)) {
      animations.push(path);
    }
  }
  const attach = (content?.attach ?? []).map((entry) => ({
    path: fromModel(entry.file),
    node: entry.node ?? null,
    bone: entry.bone ?? null,
  }));
  const members = new Map<string, ReadFile>();
  for (const path of [...animations, ...attach.map((entry) => entry.path)]) {
    if (path === modelPath || members.has(path)) continue;
    members.set(path, await readMember(platform, path, label(path), readRoot));
  }

  const textures: TextureRead[] = [];
  const search = createFileSearch(platform, modelPath, readRoot);
  const images = new Map<string, Promise<{ bytes: Uint8Array; id: string } | null>>();
  const readImage = (path: string) => {
    let image = images.get(path);
    if (!image) {
      image = platform.readFile(path).then(
        (bytes) => ({ bytes, id: versionIdOf(bytes) }),
        () => null,
      );
      images.set(path, image);
    }
    return image;
  };
  for (const [material, slots] of Object.entries(content?.materials ?? {})) {
    for (const slot of TEXTURE_SLOTS) {
      const written = slots[slot];
      if (written === undefined) continue;
      const located = await search.locate(written);
      const path = fromModel(located ?? written);
      const image = located === null ? null : await readImage(path);
      textures.push({
        material,
        slot,
        written,
        path,
        label: label(path),
        bytes: image?.bytes ?? null,
        id: image?.id ?? null,
        problem: image ? null : "Texture not found",
      });
    }
  }

  const unread: ReadFile[] = unreadComposition
    ? [
        {
          path: compositionPath,
          label: unreadComposition.label,
          bytes: null,
          id: versionIdOf(encoder.encode(unreadComposition.reason)),
          problem: "Could not load",
        },
      ]
    : [];
  const listed = new Map<string, ReadFile>([[model.label, model]]);
  for (const file of [...(composition ? [composition.file] : []), ...unread, ...members.values(), ...textures]) {
    if (!listed.has(file.label)) listed.set(file.label, file);
  }
  const composed = listed.size > 1;
  const versionFiles = composed
    ? [...listed.values()].flatMap((file) => (file.id === null ? [] : [{ file: file.label, id: file.id }]))
    : undefined;
  const versionId = composed
    ? versionIdOf(encoder.encode([...listed.values()].map((file) => `${file.label}\n${file.id ?? "-"}`).join("\n")))
    : model.id;
  return {
    model,
    composition,
    unreadComposition,
    members,
    animations: animations.filter((path) => path !== modelPath),
    attach: attach.filter((entry) => entry.path !== modelPath),
    textures,
    hidden: content?.hidden ?? [],
    versionId,
    versionFiles,
    watch: [compositionPath, ...members.keys(), ...textures.map((texture) => texture.path)],
  };
}

async function readMember(platform: Platform, path: string, label: string, readRoot: string): Promise<ReadFile> {
  const missing = (problem: string): ReadFile => ({ path, label, bytes: null, id: null, problem });
  if (pathInside(readRoot, path) === null) return missing("File outside the workspace");
  if (!hasExtension(path, MODEL_EXTENSIONS)) return missing("Not a model file");
  if (!(await insideWithoutLinks(platform, readRoot, path))) return missing("File reached through a link");
  const stat = await platform.stat(path);
  if (stat?.kind !== "file") return missing("File not found");
  const bytes = await platform.readFile(path);
  return { path, label, bytes, id: versionIdOf(bytes), problem: null };
}

/** How many member files parse at once, each in its own import worker. */
export const MEMBER_IMPORTS_AT_ONCE = 4;

/** The warnings of an animation file's own parser that matter for its clips; the rest are about meshes and rest poses. */
const CLIP_WARNINGS: ReadonlySet<ImportWarningCode> = new Set(["clip-not-sampled", "invalid-data", "left-handed-axes"]);

export interface BuildSceneOptions {
  /** A scene parsed from the same bytes before, which a member takes without waiting for a free import. */
  parsed?: (file: ReadFile & { id: string }) => SceneDescription | null;
}

/**
 * The scene of a version: the model's scene alone, or composed with the other files. `importScene` parses one file,
 * at most `MEMBER_IMPORTS_AT_ONCE` at a time; a member that fails to parse becomes a warning, and a member's own
 * warnings join the scene's with the member's file. An animation file keeps only the warnings about its clips.
 */
export async function buildAssetScene(
  files: AssetFiles,
  importScene: (file: ReadFile & { bytes: Uint8Array; id: string }) => Promise<SceneDescription>,
  options: BuildSceneOptions = {},
): Promise<SceneDescription> {
  const model = await importScene(files.model);
  if (files.versionFiles === undefined) return model;
  const warnings: ImportWarning[] = [];
  if (files.unreadComposition) {
    const { label, reason } = files.unreadComposition;
    warnings.push(
      importWarning("composition-not-loaded", { kind: "file", name: label }, `Could not load: ${label}`, label, {
        detail: reason,
      }),
    );
  }
  const imports = new Limit(MEMBER_IMPORTS_AT_ONCE);
  const parsed = await Promise.all(
    [...files.members.values()].map(async (file) => {
      if (file.bytes === null || file.id === null) return { file, scene: null, error: null };
      const loadable = { ...file, bytes: file.bytes, id: file.id };
      const known = options.parsed?.(loadable) ?? null;
      if (known) return { file, scene: known, error: null };
      try {
        return { file, scene: await imports.run(() => importScene(loadable)), error: null };
      } catch (error) {
        return { file, scene: null, error: error instanceof Error ? error.message : String(error) };
      }
    }),
  );

  const attached = new Set(files.attach.map((entry) => entry.path));
  const scenes = new Map<string, CompositionMember>();
  for (const { file, scene, error } of parsed) {
    if (scene) {
      scenes.set(file.path, { file: file.label, scene });
      const animationOnly = !attached.has(file.path);
      for (const warning of scene.source.warnings) {
        if (!animationOnly || CLIP_WARNINGS.has(warning.code)) warnings.push({ ...warning, file: file.label });
      }
      continue;
    }
    const subject = { kind: "file", name: file.label } as const;
    warnings.push(
      error === null
        ? importWarning("file-not-found", subject, `${file.problem ?? "File not found"}: ${file.label}`, file.label)
        : importWarning("invalid-data", subject, `File could not be parsed: ${file.label}`, file.label, {
            detail: error,
          }),
    );
  }
  const materials = new Map<string, Partial<Record<TextureSlot, CompositionTexture>>>();
  const images = new Map<string, Texture>();
  for (const texture of files.textures) {
    const slots = materials.get(texture.material) ?? {};
    materials.set(texture.material, slots);
    if (texture.bytes === null) {
      slots[texture.slot] = { path: texture.written, texture: null };
      const use = { material: texture.material, slot: texture.slot };
      const name = fileNameOf(texture.written);
      warnings.push(
        importWarning(
          "texture-not-found",
          { kind: "texture", name },
          `Texture not found: ${name}`,
          files.composition?.file.label,
          {
            detail: `Stored path: ${texture.written}, used as ${describeTextureUses([use])}`,
            materials: [texture.material],
            uses: [use],
          },
        ),
      );
      continue;
    }
    let image = images.get(texture.path);
    if (!image) {
      image = {
        name: stemOf(texture.path),
        mimeType: imageMimeType(texture.bytes, texture.path),
        bytes: texture.bytes,
        storedPath: texture.written,
        foundPath: texture.label,
      };
      images.set(texture.path, image);
    }
    slots[texture.slot] = { path: texture.written, texture: image };
  }
  const member = (path: string) => scenes.get(path);
  const unloaded = new Set([...files.members.values()].flatMap((file) => (scenes.has(file.path) ? [] : [file.label])));
  const scene = composeScene(model, {
    animations: files.animations.flatMap((path) => member(path) ?? []),
    attach: files.attach.flatMap(({ path, node, bone }) => {
      const found = member(path);
      return found ? [{ member: found, node, bone }] : [];
    }),
    materials: Object.fromEntries(materials),
    hidden: files.hidden.filter((id) => !unloaded.has(splitMemberPath(id).file ?? "")),
    warnings,
  });
  return withoutOverriddenTextures(scene, files.textures);
}

/**
 * Drops the texture warnings that the composition already fixes: the model's "texture-not-used" for a texture whose
 * image it puts into a material slot, and any file's "texture-not-found" or "texture-path-absolute" for a texture
 * whose every slot it fills with an image that was found.
 */
function withoutOverriddenTextures(scene: SceneDescription, textures: readonly TextureRead[]): SceneDescription {
  const found = textures.filter((texture) => texture.bytes !== null);
  const shown = new Set(found.map((texture) => texture.label));
  const filled = new Set(found.map((texture) => `${texture.material}\n${texture.slot}`));
  const fixed = (warning: ImportWarning): boolean => {
    if (warning.code === "texture-not-used") {
      return warning.file === undefined && warning.foundPath !== undefined && shown.has(warning.foundPath);
    }
    if (warning.code !== "texture-not-found" && warning.code !== "texture-path-absolute") return false;
    const uses = warning.uses ?? [];
    return uses.length > 0 && uses.every((use) => filled.has(`${use.material}\n${use.slot}`));
  };
  const kept = scene.source.warnings.filter((warning) => !fixed(warning));
  if (kept.length === scene.source.warnings.length) return scene;
  return { ...scene, source: { ...scene.source, warnings: kept } };
}
