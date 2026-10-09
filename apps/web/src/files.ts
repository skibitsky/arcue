import type { CompositionFile } from "@arcue/protocol";

/** The image types an importer may read beside a model, as the core's referenced-file check allows them. */
const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "tga", "tif", "tiff", "bmp", "dds", "exr", "hdr", "webp"]);

/** Where samples and opened files live in the core's in-memory platform. */
export const SAMPLES_FOLDER = "/samples";
export const FILES_FOLDER = "/files";

export interface SampleInfo {
  id: string;
  /** The file to open: a model, or a composition file that opens its model. */
  file: string;
  description: string;
  /** Every file to fetch, `file` first. */
  files: readonly string[];
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

function fileNameOf(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/** Splits picked or dropped files into models, composition files, textures, and files Arcue cannot use. */
export function partitionFiles<Item extends { name: string }>(
  files: readonly Item[],
): { models: Item[]; compositions: Item[]; textures: Item[]; ignored: Item[] } {
  const models: Item[] = [];
  const compositions: Item[] = [];
  const textures: Item[] = [];
  const ignored: Item[] = [];
  for (const file of files) {
    const extension = extensionOf(file.name);
    if (extension === "fbx") models.push(file);
    else if (extension === "arcue") compositions.push(file);
    else if (IMAGE_EXTENSIONS.has(extension)) textures.push(file);
    else ignored.push(file);
  }
  return { models, compositions, textures, ignored };
}

/** One tab to open: the file to open, and the files to place in its folder first, itself included. */
export interface OpenPlan<Item> {
  open: Item;
  files: Item[];
}

/**
 * What to open from files picked or dropped together. Dropped files arrive without their folders, so each
 * composition file goes in a folder with every model and texture of the drop. A model opens on its own unless a
 * composition names it or it is an animation file "<model>@<clip>.fbx" of another model in the drop, which it joins.
 * `contents` holds each composition file's content, or null when it could not be read.
 */
export function planOpen<Item extends { name: string }>(
  files: readonly Item[],
  contents: ReadonlyMap<Item, CompositionFile | null>,
): OpenPlan<Item>[] {
  const { models, compositions, textures } = partitionFiles(files);
  const named = new Set<string>();
  for (const composition of compositions) {
    const content = contents.get(composition);
    if (!content) continue;
    const listed = [content.model, ...(content.animations ?? []), ...(content.attach ?? []).map((entry) => entry.file)];
    for (const path of listed) named.add(fileNameOf(path));
  }
  const names = new Set(models.map((model) => model.name));
  const animationOf = (file: Item): string | null => {
    const at = file.name.indexOf("@");
    const model = at > 0 ? `${file.name.slice(0, at)}.fbx` : null;
    return model !== null && names.has(model) ? model : null;
  };
  const plans: OpenPlan<Item>[] = compositions.map((composition) => ({
    open: composition,
    files: [composition, ...models, ...textures],
  }));
  for (const model of models) {
    if (named.has(model.name) || animationOf(model) !== null) continue;
    const animations = models.filter((other) => animationOf(other) === model.name);
    plans.push({ open: model, files: [model, ...animations, ...textures] });
  }
  return plans;
}
