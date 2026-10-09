import type { CompositionFile, VersionFile } from "@arcue/protocol";
import { ArcueError } from "@arcue/protocol";
import type { CompositionMember, ImportWarning, SceneDescription, Texture, TextureSlot } from "@arcue/scene";
import { composeScene, fileNameOf, imageMimeType, importWarning, splitMemberPath, TEXTURE_SLOTS } from "@arcue/scene";
import { hasExtension, isConventionAnimation, MODEL_EXTENSIONS, readComposition } from "./composition-file";
import { versionIdOf } from "./hash";
import { readReferencedFile } from "./import";
import { insideWithoutLinks } from "./links";
import { basename, dirname, joinPath, pathInside, relativePath, stemOf } from "./paths";
import type { Platform } from "./platform";

/** One file read for a version: its path, its name in prefixes, and its bytes and id when it could be read. */
export interface ReadFile {
  path: string;
  /** Relative to the model's folder, as member prefixes and warnings write it. */
  label: string;
  bytes: Uint8Array | null;
  id: string | null;
  /** Why the file could not be read. */
  problem: string | null;
}

export interface TextureRead extends ReadFile {
  material: string;
  slot: TextureSlot;
  /** As the composition file writes it. */
  written: string;
}

/** Everything a version of an asset is built from, read once, so the version id matches what gets parsed. */
export interface AssetFiles {
  model: ReadFile & { bytes: Uint8Array; id: string; modifiedMs: number };
  /** The composition file, when there is one and it names this model. */
  composition: { file: ReadFile & { id: string }; content: CompositionFile } | null;
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

const encoder = new TextEncoder();

/**
 * Reads the model, its composition file and every file the composition names, plus the "<stem>@<clip>.fbx" files
 * beside the model. Member files must be model files inside `readRoot` reached without symbolic links, and textures
 * pass the same checks as an importer's reads. A missing model or a broken composition file rejects; a missing
 * member or texture is recorded with its problem.
 */
export async function readAssetFiles(
  platform: Platform,
  modelPath: string,
  compositionPath: string,
  readRoot: string,
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

  const found = await readComposition(platform, compositionPath, "invalid-input");
  const content =
    found && joinPath(dirname(compositionPath), found.composition.model) === modelPath ? found.composition : null;
  const composition =
    found && content
      ? {
          file: {
            path: compositionPath,
            label: label(compositionPath),
            bytes: null,
            id: versionIdOf(encoder.encode(found.text)),
            problem: null,
          },
          content,
        }
      : null;

  const fromComposition = (file: string) => joinPath(dirname(compositionPath), file);
  const animations = (content?.animations ?? []).map(fromComposition);
  for (const entry of await platform.list(folder)) {
    const path = joinPath(folder, entry.name);
    if (entry.kind === "file" && isConventionAnimation(modelPath, entry.name) && !animations.includes(path)) {
      animations.push(path);
    }
  }
  const attach = (content?.attach ?? []).map((entry) => ({
    path: fromComposition(entry.file),
    node: entry.node ?? null,
    bone: entry.bone ?? null,
  }));
  const members = new Map<string, ReadFile>();
  for (const path of [...animations, ...attach.map((entry) => entry.path)]) {
    if (path === modelPath || members.has(path)) continue;
    members.set(path, await readMember(platform, path, label(path), readRoot));
  }

  const textures: TextureRead[] = [];
  for (const [material, slots] of Object.entries(content?.materials ?? {})) {
    for (const slot of TEXTURE_SLOTS) {
      const written = slots[slot];
      if (written === undefined) continue;
      const path = fromComposition(written);
      const bytes = await readReferencedFile(platform, compositionPath, written, readRoot);
      textures.push({
        material,
        slot,
        written,
        path,
        label: label(path),
        bytes,
        id: bytes ? versionIdOf(bytes) : null,
        problem: bytes ? null : "was not found",
      });
    }
  }

  const listed = new Map<string, ReadFile>([[model.label, model]]);
  for (const file of [...(composition ? [composition.file] : []), ...members.values(), ...textures]) {
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
  if (pathInside(readRoot, path) === null) return missing("is outside the workspace");
  if (!hasExtension(path, MODEL_EXTENSIONS)) return missing("is not a model file");
  if (!(await insideWithoutLinks(platform, readRoot, path))) return missing("is reached through a symbolic link");
  const stat = await platform.stat(path);
  if (stat?.kind !== "file") return missing("was not found");
  const bytes = await platform.readFile(path);
  return { path, label, bytes, id: versionIdOf(bytes), problem: null };
}

/**
 * The scene of a version: the model's scene alone, or composed with the other files. `importScene` parses one file
 * and may answer from a cache; a member that fails to parse becomes a warning.
 */
export async function buildAssetScene(
  files: AssetFiles,
  importScene: (file: ReadFile & { bytes: Uint8Array; id: string }) => Promise<SceneDescription>,
): Promise<SceneDescription> {
  const model = await importScene(files.model);
  if (files.versionFiles === undefined) return model;
  const warnings: ImportWarning[] = [];
  const scenes = new Map<string, CompositionMember>();
  const parsed = await Promise.all(
    [...files.members.values()].map(async (file) => {
      if (file.bytes === null || file.id === null) return { file, scene: null, error: null };
      try {
        return { file, scene: await importScene({ ...file, bytes: file.bytes, id: file.id }), error: null };
      } catch (error) {
        return { file, scene: null, error: error instanceof Error ? error.message : String(error) };
      }
    }),
  );
  for (const { file, scene, error } of parsed) {
    if (scene) {
      scenes.set(file.path, { file: file.label, scene });
      continue;
    }
    warnings.push(
      error === null
        ? importWarning(
            "file-not-found",
            { kind: "file", name: file.label },
            `${file.label} ${file.problem ?? "was not found"}`,
            file.label,
          )
        : importWarning("invalid-data", { kind: "file", name: file.label }, error, file.label),
    );
  }
  const materials: Record<string, Partial<Record<TextureSlot, Texture | null>>> = {};
  for (const texture of files.textures) {
    const slots = materials[texture.material] ?? {};
    materials[texture.material] = slots;
    if (texture.bytes === null) {
      slots[texture.slot] = null;
      const name = fileNameOf(texture.written);
      warnings.push(
        importWarning(
          "texture-not-found",
          { kind: "texture", name },
          `Texture not found: ${name}`,
          files.composition?.file.label,
        ),
      );
      continue;
    }
    slots[texture.slot] = {
      name: stemOf(texture.path),
      mimeType: imageMimeType(texture.bytes, texture.path),
      bytes: texture.bytes,
      storedPath: texture.written,
      foundPath: texture.label,
    };
  }
  const member = (path: string) => scenes.get(path);
  const unloaded = new Set([...files.members.values()].flatMap((file) => (scenes.has(file.path) ? [] : [file.label])));
  return composeScene(model, {
    animations: files.animations.flatMap((path) => member(path) ?? []),
    attach: files.attach.flatMap(({ path, node, bone }) => {
      const found = member(path);
      return found ? [{ member: found, node, bone }] : [];
    }),
    materials,
    hidden: files.hidden.filter((id) => !unloaded.has(splitMemberPath(id).file ?? "")),
    warnings,
  });
}
