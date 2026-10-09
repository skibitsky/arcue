/** The image types an importer may read beside a model, as the core's referenced-file check allows them. */
const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "tga", "tif", "tiff", "bmp", "dds", "exr", "hdr", "webp"]);

/** Where samples and opened files live in the core's in-memory platform. */
export const SAMPLES_FOLDER = "/samples";
export const FILES_FOLDER = "/files";

export interface SampleInfo {
  id: string;
  file: string;
  description: string;
}

export function samplePath(file: string): string {
  return `${SAMPLES_FOLDER}/${file}`;
}

function safeName(name: string): string {
  return name.replace(/[\\/]/g, "_");
}

/**
 * Each opened model gets its own folder, named after the model without its extension, and the textures picked with
 * it go beside it there, so textures of the same name from different drops do not overwrite each other.
 */
export function openedFilePath(model: string, file: string = model): string {
  return `${openedModelFolder(model)}/${safeName(file)}`;
}

export function openedModelFolder(model: string): string {
  const name = safeName(model);
  const dot = name.lastIndexOf(".");
  return `${FILES_FOLDER}/${dot > 0 ? name.slice(0, dot) : name}`;
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
}

/** Splits picked or dropped files into models to open, textures to place beside them, and files Arcue cannot use. */
export function partitionFiles<Item extends { name: string }>(
  files: readonly Item[],
): { models: Item[]; textures: Item[]; ignored: Item[] } {
  const models: Item[] = [];
  const textures: Item[] = [];
  const ignored: Item[] = [];
  for (const file of files) {
    const extension = extensionOf(file.name);
    if (extension === "fbx") models.push(file);
    else if (IMAGE_EXTENSIONS.has(extension)) textures.push(file);
    else ignored.push(file);
  }
  return { models, textures, ignored };
}
