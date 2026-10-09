import type { FoundFile, ImportWarning, ImportWarningSubject, Texture } from "@arcue/scene";
import { fileNameOf, imageMimeType, importWarning, parseStoredPath } from "@arcue/scene";
import type { TextureFile } from "./decode";

function textureName(path: string): string {
  const name = fileNameOf(path);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

export interface TextureResolver {
  /** Index into `textures` for the texture file a material uses, or null when its image could not be found. */
  resolve(file: number, material: string): Promise<number | null>;
  readonly textures: Texture[];
  /** The warnings of the textures resolved so far, then one for each texture file that no material links. */
  warnings(): Promise<ImportWarning[]>;
}

interface Problem {
  code: "texture-not-found" | "texture-path-absolute";
  subject: ImportWarningSubject;
  message: string;
  detail: string;
  file: number;
}

function storedPathOf(file: TextureFile): string {
  return parseStoredPath(file.relative).relative ?? file.absolute;
}

function subjectOf(file: TextureFile): ImportWarningSubject {
  return { kind: "texture", name: fileNameOf(storedPathOf(file)) || fileNameOf(file.relative) };
}

/**
 * Turns the file's texture paths into scene textures on first use. Embedded images are used as they are; the core
 * finds the others through `findFile`. A missing image adds "texture-not-found", and a file that stores only an
 * absolute path from the exporting machine adds "texture-path-absolute" even when the image is found by name. A
 * texture file that no material links adds "texture-not-used".
 */
export function createTextureResolver(
  files: readonly TextureFile[],
  findFile: (storedPath: string) => Promise<FoundFile | null>,
): TextureResolver {
  const textures: Texture[] = [];
  const problems: Problem[] = [];
  const users = new Map<number, Set<string>>();
  const resolved = new Map<number, Promise<number | null>>();

  const find = async (file: TextureFile): Promise<FoundFile | null> => {
    for (const candidate of new Set([file.relative, file.absolute])) {
      if (candidate === "") continue;
      const found = await findFile(candidate);
      if (found) return found;
    }
    return null;
  };

  const load = async (file: TextureFile, index: number): Promise<number | null> => {
    const relative = parseStoredPath(file.relative);
    const storedPath = storedPathOf(file);
    const subject = subjectOf(file);
    let bytes = file.content;
    let foundPath: string | null = null;
    if (!bytes) {
      if (relative.relative === null && parseStoredPath(file.absolute).absolute) {
        problems.push({
          code: "texture-path-absolute",
          subject,
          message: `Texture path is absolute: ${file.absolute}`,
          detail: `Stored path: ${file.absolute}`,
          file: index,
        });
      }
      const found = await find(file);
      if (found) {
        bytes = found.bytes;
        foundPath = found.path;
      }
    }
    if (!bytes) {
      problems.push({
        code: "texture-not-found",
        subject,
        message: `Texture not found: ${subject.name}`,
        detail: `Stored path: ${storedPath}`,
        file: index,
      });
      return null;
    }
    textures.push({
      name: textureName(storedPath),
      mimeType: imageMimeType(bytes, foundPath ?? storedPath),
      bytes,
      storedPath,
      foundPath,
    });
    return textures.length - 1;
  };

  const unusedWarning = async (file: TextureFile): Promise<ImportWarning> => {
    const subject = subjectOf(file);
    const found = file.content ? null : await find(file);
    const stored = `Stored path: ${storedPathOf(file)}`;
    return importWarning(
      "texture-not-used",
      subject,
      `Texture not used: ${subject.name}`,
      undefined,
      found ? { detail: `${stored}, found at ${found.path}`, foundPath: found.path } : { detail: stored },
    );
  };

  return {
    textures,
    resolve(index, material) {
      const file = files[index];
      if (!file) return Promise.resolve(null);
      const materials = users.get(index) ?? new Set();
      materials.add(material);
      users.set(index, materials);
      let texture = resolved.get(index);
      if (!texture) {
        texture = load(file, index);
        resolved.set(index, texture);
      }
      return texture;
    },
    async warnings() {
      const warnings = problems.map((problem) =>
        importWarning(problem.code, problem.subject, problem.message, undefined, {
          detail: problem.detail,
          materials: [...(users.get(problem.file) ?? [])],
        }),
      );
      for (const [index, file] of files.entries()) {
        if (!file.linked && !resolved.has(index)) warnings.push(await unusedWarning(file));
      }
      return warnings;
    },
  };
}
